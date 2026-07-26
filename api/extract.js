// Fetches a web page server-side and extracts the readable article text,
// so the browser never has to deal with CORS and the ElevenLabs key stays server-side.

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const MAX_CHARS = 20000;
const FETCH_TIMEOUT_MS = 15000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url is required' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'That doesn’t look like a valid URL' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https links are supported' });
  }

  try {
    const pageRes = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpanishPracticeReader/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!pageRes.ok) {
      return res.status(502).json({ error: `Failed to fetch that page (HTTP ${pageRes.status})` });
    }

    const contentType = pageRes.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return res.status(415).json({ error: 'That link isn’t a readable web page' });
    }

    const html = await pageRes.text();
    const dom = new JSDOM(html, { url: parsed.toString() });
    const article = new Readability(dom.window.document).parse();

    if (!article?.textContent?.trim()) {
      return res.status(422).json({ error: 'Couldn’t find readable article text on that page' });
    }

    const text = article.textContent.trim().replace(/\n{3,}/g, '\n\n').slice(0, MAX_CHARS);
    res.status(200).json({ title: article.title || parsed.hostname, text });
  } catch (error) {
    console.error('Extract API error:', error);
    if (error.name === 'TimeoutError') {
      return res.status(504).json({ error: 'That page took too long to load' });
    }
    res.status(500).json({ error: 'Failed to extract article text' });
  }
}
