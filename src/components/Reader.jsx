import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

const CHUNK_SIZE = 1600;

const SPEEDS = [
  { label: '1×',    rate: 1 },
  { label: '1.25×', rate: 1.25 },
  { label: '1.5×',  rate: 1.5 },
  { label: '2×',    rate: 2 },
];

// Splits long text into paragraph-sized pieces so each TTS request stays fast
// and playback can be paused/skipped mid-article, the way Speechify does.
function splitIntoChunks(text, maxLen = CHUNK_SIZE) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const para of paragraphs) {
    if (para.length > maxLen) {
      const sentences = para.match(/[^.!?]+[.!?]+(\s|$)/g) || [para];
      for (const sentence of sentences) {
        if ((current + sentence).length > maxLen) flush();
        current += sentence;
      }
    } else if ((current + '\n\n' + para).length > maxLen) {
      flush();
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  flush();
  return chunks;
}

export default function Reader() {
  const [mode, setMode] = useState('paste'); // 'paste' | 'url' | 'file'
  const [urlInput, setUrlInput] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState(null);

  const [chunkIdx, setChunkIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);

  const audioRef = useRef(null);
  const audioCacheRef = useRef(new Map()); // chunk index -> blob URL
  const stopRef = useRef(false);
  const speedRef = useRef(SPEEDS[0].rate);
  const currentSpeed = SPEEDS[speedIdx];

  const chunks = useMemo(() => (text.trim() ? splitIntoChunks(text) : []), [text]);

  const clearAudioCache = () => {
    audioCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
  };

  const refreshUsage = useCallback(() => {
    fetch('/api/usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && !data.error) setUsage(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUsage();
    return () => {
      stopRef.current = true;
      audioRef.current?.pause();
      clearAudioCache();
    };
  }, [refreshUsage]);

  const stopReading = useCallback(() => {
    stopRef.current = true;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsPlaying(false);
    setIsPaused(false);
    setIsBuffering(false);
  }, []);

  const resetPlayback = useCallback(() => {
    stopReading();
    clearAudioCache();
    setChunkIdx(0);
  }, [stopReading]);

  const fetchChunkAudio = useCallback(async (idx, chunkList) => {
    if (audioCacheRef.current.has(idx)) return audioCacheRef.current.get(idx);
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunkList[idx] }),
    });
    if (!res.ok) throw new Error('Speech generation failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    audioCacheRef.current.set(idx, url);
    return url;
  }, []);

  const playChunk = useCallback(async (idx, chunkList) => {
    if (idx >= chunkList.length) {
      stopReading();
      refreshUsage();
      return;
    }
    setChunkIdx(idx);
    setIsBuffering(true);
    try {
      const url = await fetchChunkAudio(idx, chunkList);
      if (stopRef.current) return;
      setIsBuffering(false);

      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = speedRef.current;
      audio.onplay = () => { setIsPlaying(true); setIsPaused(false); };
      audio.onpause = () => { if (!audio.ended) setIsPaused(true); };
      audio.onended = () => { setIsPaused(false); playChunk(idx + 1, chunkList); };
      audio.onerror = () => setError('Playback error — try again.');
      await audio.play();

      if (idx + 1 < chunkList.length) fetchChunkAudio(idx + 1, chunkList).catch(() => {});
    } catch (err) {
      setIsBuffering(false);
      setIsPlaying(false);
      setError(err.message || 'Speech generation failed');
    }
  }, [fetchChunkAudio, stopReading, refreshUsage]);

  const startReading = () => {
    if (!chunks.length) return;
    stopRef.current = false;
    setError('');
    playChunk(0, chunks);
  };

  const togglePause = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play();
    else audioRef.current.pause();
  };

  const skip = (delta) => {
    const next = Math.min(Math.max(chunkIdx + delta, 0), chunks.length - 1);
    stopRef.current = false;
    playChunk(next, chunks);
  };

  const cycleSpeed = () => {
    const nextIdx = (speedIdx + 1) % SPEEDS.length;
    speedRef.current = SPEEDS[nextIdx].rate;
    setSpeedIdx(nextIdx);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[nextIdx].rate;
  };

  const switchMode = (m) => {
    setMode(m);
    setError('');
  };

  const loadText = (newText, newTitle) => {
    setText(newText);
    setTitle(newTitle || '');
    resetPlayback();
  };

  const fetchFromUrl = async () => {
    const url = urlInput.trim();
    if (!url || isExtracting) return;
    setIsExtracting(true);
    setError('');
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch that page');
      loadText(data.text, data.title);
    } catch (err) {
      setError(err.message || 'Failed to fetch that page');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result || ''), file.name);
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
    e.target.value = '';
  };

  const isActive = isPlaying || isBuffering;

  return (
    <div className="reader">
      <div className="reader-mode-tabs">
        <button className={`reader-mode-btn ${mode === 'paste' ? 'active' : ''}`} onClick={() => switchMode('paste')}>📝 Paste</button>
        <button className={`reader-mode-btn ${mode === 'url' ? 'active' : ''}`} onClick={() => switchMode('url')}>🔗 URL</button>
        <button className={`reader-mode-btn ${mode === 'file' ? 'active' : ''}`} onClick={() => switchMode('file')}>📄 File</button>
      </div>

      {mode === 'paste' && (
        <div className="reader-input-wrap">
          <textarea
            className="reader-textarea"
            placeholder="Paste any text here — an article, a chapter, notes…"
            value={text}
            onChange={(e) => loadText(e.target.value)}
            rows={6}
          />
        </div>
      )}

      {mode === 'url' && (
        <div className="reader-input-wrap">
          <div className="reader-url-row">
            <input
              type="url"
              className="reader-url-input"
              placeholder="https://example.com/article"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchFromUrl()}
              aria-label="Article URL"
            />
            <button className="reader-fetch-btn" onClick={fetchFromUrl} disabled={isExtracting || !urlInput.trim()}>
              {isExtracting ? '…' : 'Fetch →'}
            </button>
          </div>
        </div>
      )}

      {mode === 'file' && (
        <div className="reader-input-wrap">
          <label className="reader-file-label">
            📄 Choose a .txt or .md file
            <input type="file" accept=".txt,.md,text/plain" onChange={handleFileChange} hidden />
          </label>
        </div>
      )}

      {error && <p className="reader-error">{error}</p>}

      {text && (
        <div className="reader-preview">
          {title && <p className="reader-preview-title">{title}</p>}
          <p className="reader-preview-text">{text}</p>
          <p className="reader-preview-meta">
            {text.length.toLocaleString()} characters · {chunks.length} chunk{chunks.length === 1 ? '' : 's'} to read
          </p>
        </div>
      )}

      {text && (
        <div className="reader-controls">
          {!isActive ? (
            <button className="reader-play-btn" onClick={startReading}>▶ Start Reading</button>
          ) : (
            <>
              <button className="reader-icon-btn" onClick={() => skip(-1)} disabled={chunkIdx === 0} aria-label="Previous chunk">⏮</button>
              <button className="reader-icon-btn reader-play-toggle" onClick={togglePause} aria-label={isPaused ? 'Resume' : 'Pause'}>
                {isBuffering ? '…' : isPaused ? '▶' : '⏸'}
              </button>
              <button className="reader-icon-btn" onClick={() => skip(1)} disabled={chunkIdx >= chunks.length - 1} aria-label="Next chunk">⏭</button>
              <button className="reader-icon-btn" onClick={stopReading} aria-label="Stop">⏹</button>
              <button className="reader-speed-btn" onClick={cycleSpeed}>{currentSpeed.label}</button>
            </>
          )}
        </div>
      )}

      {chunks.length > 0 && isActive && (
        <p className="reader-progress">Reading chunk {chunkIdx + 1} of {chunks.length}</p>
      )}

      {usage && usage.characterLimit && (
        <p className="reader-usage">
          🎙️ {usage.characterCount.toLocaleString()} / {usage.characterLimit.toLocaleString()} ElevenLabs characters used this month
        </p>
      )}
    </div>
  );
}
