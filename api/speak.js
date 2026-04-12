// Proxies TTS requests to ElevenLabs so the API key stays server-side.
// Falls back gracefully if ELEVENLABS_API_KEY is not set.
//
// ElevenLabs free tier: 10,000 characters/month
// Voice used: "Valentina" — natural Latin American Spanish female voice
// Voice ID: pFZP5JQG7iQjIQuC4Bku  (ElevenLabs built-in "Valentina")

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pFZP5JQG7iQjIQuC4Bku';
const API_KEY  = process.env.ELEVENLABS_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!API_KEY) {
    return res.status(503).json({ error: 'ElevenLabs not configured' });
  }

  const { text, speed = 1.0 } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });
  // ElevenLabs speed: 0.7 (slow) – 1.2 (fast). Map our 0.5–1.0 range accordingly.
  const elSpeed = Math.max(0.7, Math.min(1.2, speed));

  try {
    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
            style: 0.3,
            use_speaker_boost: true,
            speed: elSpeed,
          },
        }),
      }
    );

    if (!elRes.ok) {
      const err = await elRes.text();
      console.error('ElevenLabs error:', err);
      return res.status(502).json({ error: 'ElevenLabs request failed' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');

    // Stream the audio directly to the client
    const reader = elRes.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      await pump();
    };
    await pump();
  } catch (error) {
    console.error('Speak API error:', error);
    res.status(500).json({ error: 'TTS failed' });
  }
}
