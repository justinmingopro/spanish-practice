import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DIALECT_LABELS = {
  mexican:            'Mexican Spanish (México)',
  'puerto-rican':     'Puerto Rican Spanish',
  dominican:          'Dominican Spanish',
  colombian:          'Colombian Spanish',
  cuban:              'Cuban Spanish',
  'central-american': 'Central American Spanish',
  general:            'General Latin American Spanish',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    text,
    direction  = 'en-es',   // 'en-es' | 'es-en'
    dialect    = 'mexican',
    gender     = 'neutral',  // 'neutral' | 'male' | 'female'
    formality  = 'informal', // 'informal' | 'formal'
    number     = 'singular', // 'singular' | 'plural'
  } = req.body;

  if (!text) return res.status(400).json({ error: 'text is required' });

  const dialectLabel = DIALECT_LABELS[dialect] || DIALECT_LABELS.mexican;

  let systemPrompt;
  let userPrompt;

  if (direction === 'en-es') {
    const genderNote =
      gender === 'neutral'
        ? 'The gender of the recipient is not specified — use neutral phrasing where possible.'
        : `The recipient is ${gender} — apply appropriate gendered adjectives and endings.`;

    const formalityNote =
      formality === 'formal'
        ? 'Use formal "usted" forms throughout. This is a respectful or professional context.'
        : 'Use informal "tú" forms throughout. This is a casual or friendly context.';

    const numberNote =
      number === 'plural'
        ? 'This is addressed to or refers to a GROUP of people — use plural forms (ustedes, les, etc.).'
        : 'This is addressed to or refers to ONE person — use singular forms.';

    systemPrompt = `You are an expert translator specializing in ${dialectLabel}. You deeply understand regional vocabulary, idioms, nuance, and grammar. You always apply correct gender, formality, and number based on context.

Your response MUST be valid JSON only — no markdown, no code fences, no extra text before or after. Return exactly this shape:
{
  "translation": "the primary translation",
  "alternatives": ["alternative phrasing 1", "alternative phrasing 2"],
  "note": "brief explanation of key choices made (1-2 sentences max)"
}

Rules:
- "alternatives" should contain 0–2 genuinely different ways to say the same thing. Empty array if no useful alternatives exist.
- "note" should only explain non-obvious choices: gendered endings, regional vocabulary, formality decisions, cultural nuance. Omit if the translation is straightforward.
- Always use ${dialectLabel} vocabulary and expressions — not Spain Spanish. Never use "vosotros".`;

    userPrompt = `Translate the following English text to ${dialectLabel}.

Context to apply:
- ${genderNote}
- ${formalityNote}
- ${numberNote}

Text to translate:
"${text}"`;

  } else {
    // Spanish → English
    systemPrompt = `You are an expert translator. Translate Spanish to natural, fluent, idiomatic English.

Your response MUST be valid JSON only — no markdown, no code fences, no extra text. Return exactly:
{
  "translation": "the primary English translation",
  "alternatives": ["alternative phrasing if useful"],
  "note": "brief note about idioms, regional expressions, or nuances in the original (1 sentence, omit if straightforward)"
}`;

    userPrompt = `Translate this Spanish text to English:
"${text}"`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0].text.trim();
    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    res.status(200).json(parsed);
  } catch (error) {
    console.error('Translate error:', error);
    res.status(500).json({ error: 'Translation failed' });
  }
}
