import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Translate the following Spanish text to natural English. Return only the translation — no explanations, no notes, no quotation marks.\n\n${text}`,
        },
      ],
    });

    res.status(200).json({ translation: response.content[0].text.trim() });
  } catch (error) {
    console.error('Translate error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
}
