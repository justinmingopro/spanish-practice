// Reports current ElevenLabs character usage, so the Reader can show how much
// of the (often free-tier) monthly quota has been used.

const API_KEY = process.env.ELEVENLABS_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!API_KEY) {
    return res.status(503).json({ error: 'ElevenLabs not configured' });
  }

  try {
    const elRes = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': API_KEY },
    });
    if (!elRes.ok) return res.status(502).json({ error: 'Failed to fetch usage' });

    const data = await elRes.json();
    res.status(200).json({
      characterCount: data.character_count,
      characterLimit: data.character_limit,
      resetsAt: data.next_character_count_reset_unix ? data.next_character_count_reset_unix * 1000 : null,
      tier: data.tier,
    });
  } catch (error) {
    console.error('Usage API error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
}
