import { useState, useRef, useCallback } from 'react';

const DIALECTS = [
  { id: 'mexican',            label: '🇲🇽 Mexican' },
  { id: 'puerto-rican',       label: '🇵🇷 Puerto Rican' },
  { id: 'dominican',          label: '🇩🇴 Dominican' },
  { id: 'colombian',          label: '🇨🇴 Colombian' },
  { id: 'cuban',              label: '🇨🇺 Cuban' },
  { id: 'central-american',   label: '🌎 Central American' },
  { id: 'general',            label: '🌍 General Latin American' },
];

export default function Translator() {
  const [direction, setDirection] = useState('en-es'); // 'en-es' | 'es-en'
  const [dialect,   setDialect]   = useState('mexican');
  const [gender,    setGender]    = useState('neutral');   // 'neutral' | 'male' | 'female'
  const [formality, setFormality] = useState('informal');  // 'informal' | 'formal'
  const [number,    setNumber]    = useState('singular');  // 'singular' | 'plural'
  const [inputText, setInputText] = useState('');
  const [result,    setResult]    = useState(null);        // { translation, alternatives, note }
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState('');
  const [copied,    setCopied]    = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const isEnToEs = direction === 'en-es';

  const translate = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, direction, dialect, gender, formality, number }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError('Translation failed. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!result?.translation) return;
    try {
      await navigator.clipboard.writeText(result.translation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — select the text
    }
  };

  const playTranslation = useCallback(async () => {
    if (!result?.translation) return;

    // Toggle off if already playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.translation }),
      });
      if (!res.ok) throw new Error('TTS unavailable');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay  = () => setIsPlaying(true);
      audio.onended = () => { setIsPlaying(false); audioRef.current = null; URL.revokeObjectURL(url); };
      audio.onerror = () => { setIsPlaying(false); audioRef.current = null; };
      await audio.play();
    } catch {
      // Fallback to Web Speech API
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(result.translation);
        utterance.lang  = 'es-MX';
        utterance.rate  = 0.88;
        utterance.onstart = () => setIsPlaying(true);
        utterance.onend   = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [result]);

  const swapDirection = () => {
    // Put the current translation result back into the input field
    const nextInput = result?.translation || '';
    setDirection(d => d === 'en-es' ? 'es-en' : 'en-es');
    setInputText(nextInput);
    setResult(null);
    setError('');
  };

  const clearAll = () => {
    setInputText('');
    setResult(null);
    setError('');
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false);
  };

  return (
    <div className="translator">

      {/* ── Direction bar ── */}
      <div className="translator-direction-bar">
        <span className={`tdir-label ${isEnToEs ? 'active' : ''}`}>English</span>
        <button className="tdir-swap" onClick={swapDirection} title="Swap direction" aria-label="Swap language direction">
          ⇄
        </button>
        <span className={`tdir-label ${!isEnToEs ? 'active' : ''}`}>Spanish</span>
      </div>

      {/* ── Context options (EN→ES only) ── */}
      {isEnToEs && (
        <div className="translator-context">

          <div className="ctx-row">
            <span className="ctx-label">Dialect</span>
            <select
              className="ctx-select"
              value={dialect}
              onChange={e => setDialect(e.target.value)}
            >
              {DIALECTS.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="ctx-row">
            <span className="ctx-label">Speaking to</span>
            <div className="ctx-pills">
              {[
                { id: 'singular', label: '1 Person' },
                { id: 'plural',   label: 'Group' },
              ].map(opt => (
                <button
                  key={opt.id}
                  className={`ctx-pill ${number === opt.id ? 'active' : ''}`}
                  onClick={() => setNumber(opt.id)}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          <div className="ctx-row">
            <span className="ctx-label">Recipient</span>
            <div className="ctx-pills">
              {[
                { id: 'neutral', label: 'Neutral' },
                { id: 'male',    label: 'Male'    },
                { id: 'female',  label: 'Female'  },
              ].map(opt => (
                <button
                  key={opt.id}
                  className={`ctx-pill ${gender === opt.id ? 'active' : ''}`}
                  onClick={() => setGender(opt.id)}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          <div className="ctx-row">
            <span className="ctx-label">Tone</span>
            <div className="ctx-pills">
              {[
                { id: 'informal', label: 'Informal (tú)'   },
                { id: 'formal',   label: 'Formal (usted)'  },
              ].map(opt => (
                <button
                  key={opt.id}
                  className={`ctx-pill ${formality === opt.id ? 'active' : ''}`}
                  onClick={() => setFormality(opt.id)}
                >{opt.label}</button>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ── Input ── */}
      <div className="translator-input-wrap">
        <textarea
          className="translator-textarea"
          placeholder={isEnToEs ? 'Type in English…' : 'Type in Spanish…'}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); translate(); } }}
          rows={3}
          disabled={isLoading}
          aria-label="Text to translate"
        />
        <div className="translator-btn-row">
          {inputText && (
            <button className="t-clear-btn" onClick={clearAll} aria-label="Clear">✕ Clear</button>
          )}
          <button
            className="t-translate-btn"
            onClick={translate}
            disabled={isLoading || !inputText.trim()}
          >
            {isLoading ? (
              <span className="t-loading-dots"><span /><span /><span /></span>
            ) : (
              'Translate →'
            )}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <p className="translator-error">{error}</p>}

      {/* ── Result card ── */}
      {result && (
        <div className="translator-result">
          <div className="result-header">
            <span className="result-lang-tag">{isEnToEs ? '🇲🇽 Spanish' : '🇺🇸 English'}</span>
            <div className="result-actions">
              <button
                className={`result-icon-btn ${isPlaying ? 'active' : ''}`}
                onClick={playTranslation}
                title={isPlaying ? 'Stop' : 'Listen'}
                aria-label={isPlaying ? 'Stop audio' : 'Play translation'}
              >
                {isPlaying ? '⏹' : '🔊'}
              </button>
              <button
                className={`result-icon-btn ${copied ? 'copied' : ''}`}
                onClick={copyToClipboard}
                title="Copy to clipboard"
                aria-label="Copy translation"
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>

          <p className="result-text">{result.translation}</p>

          {result.alternatives?.length > 0 && (
            <div className="result-section">
              <span className="result-section-label">Also say:</span>
              <ul className="result-alternatives">
                {result.alternatives.map((alt, i) => (
                  <li key={i}>{alt}</li>
                ))}
              </ul>
            </div>
          )}

          {result.note && (
            <div className="result-section result-note">
              <span className="result-section-label">Note:</span> {result.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
