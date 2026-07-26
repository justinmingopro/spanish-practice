import { useState, useRef, useEffect, useCallback } from 'react';
import ConversationHistory from './components/ConversationHistory';
import MicButton from './components/MicButton';
import Translator from './components/Translator';
import Reader from './components/Reader';
import './App.css';

const SCENARIOS = [
  { id: 'free',       emoji: '💬', label: 'Conversación libre',   opening: '¡Hola! Soy Sofía. 😊 ¿Cómo estás hoy?' },
  { id: 'restaurant', emoji: '🍽️', label: 'En el restaurante',    opening: '¡Buenas tardes! Bienvenido a La Mesa Bonita. ¿Qué le puedo traer?' },
  { id: 'market',     emoji: '🛒', label: 'En el mercado',         opening: '¡Buenos días! ¿Qué le puedo ofrecer hoy?' },
  { id: 'family',     emoji: '👨‍👩‍👧', label: 'La familia',           opening: '¡Hola, vecino! ¿Cómo está tu familia?' },
  { id: 'faith',      emoji: '🙏', label: 'La fe',                 opening: '¡Hola! ¿Cómo va tu vida espiritual últimamente?' },
  { id: 'work',       emoji: '💼', label: 'El trabajo',            opening: '¡Qué semana! ¿Cómo te va en el trabajo?' },
  { id: 'travel',     emoji: '🗺️', label: 'De viaje',              opening: '¡Hola! ¿Necesita ayuda? ¿Qué busca?' },
  { id: 'doctor',     emoji: '🏥', label: 'En la clínica',         opening: '¡Buenos días! ¿Cuál es el motivo de su visita?' },
];

const STORAGE_KEY = 'sofia-conversation';

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(scenarioId, messages) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenarioId, messages }));
  } catch { /* storage full or unavailable — fail silently */ }
}

export default function App() {
  const saved = loadSaved();
  const savedScenario = SCENARIOS.find((s) => s.id === saved?.scenarioId) ?? SCENARIOS[0];
  const savedMessages = saved?.messages?.length ? saved.messages : [{ role: 'assistant', content: savedScenario.opening }];

  const [activeTab,        setActiveTab]        = useState('sofia'); // 'sofia' | 'translator' | 'reader'
  const [scenario,         setScenario]         = useState(savedScenario);
  const [showScenarios,    setShowScenarios]    = useState(false);
  const [messages,         setMessages]         = useState(savedMessages);
  const [isListening,      setIsListening]      = useState(false);
  const [isSpeaking,       setIsSpeaking]       = useState(false);
  const [isPaused,         setIsPaused]         = useState(false);
  const [isLoading,        setIsLoading]        = useState(false);
  const [inputText,        setInputText]        = useState('');
  const [transcript,       setTranscript]       = useState('');
  const [hasSpeechSupport, setHasSpeechSupport] = useState(true);
  const [showNewConfirm,   setShowNewConfirm]   = useState(false);
  const [showDrillPanel,   setShowDrillPanel]   = useState(false);
  const [drillType,        setDrillType]        = useState(null);
  const [drillTopic,       setDrillTopic]       = useState(null);
  const [pendingEdit,      setPendingEdit]      = useState(null);

  // Grammar panel
  const [showGrammarPanel, setShowGrammarPanel] = useState(false);
  const [grammarMessages,  setGrammarMessages]  = useState([]);
  const [grammarInput,     setGrammarInput]     = useState('');
  const [grammarLoading,   setGrammarLoading]   = useState(false);
  const grammarBottomRef = useRef(null);

  const SPEEDS = [
    { label: '1×',  rate: 1.0 },
    { label: '¾×',  rate: 0.75 },
    { label: '½×',  rate: 0.5 },
  ];
  const [speedIdx, setSpeedIdx] = useState(0);
  const currentSpeed = SPEEDS[speedIdx];

  const recognitionRef     = useRef(null);
  const voiceRef           = useRef(null);
  const pendingTranscriptRef = useRef('');
  const sentByStopRef      = useRef(false);
  const audioRef           = useRef(null);
  const audioBlobUrlRef    = useRef(null);
  const audioUnlockedRef   = useRef(false);
  const speedRef           = useRef(SPEEDS[0].rate);

  const cycleSpeed = () => {
    const nextIdx  = (speedIdx + 1) % SPEEDS.length;
    const nextRate = SPEEDS[nextIdx].rate;
    speedRef.current = nextRate;
    setSpeedIdx(nextIdx);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  };

  useEffect(() => {
    saveState(scenario.id, messages);
  }, [scenario.id, messages]);

  useEffect(() => {
    grammarBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [grammarMessages, grammarLoading]);

  useEffect(() => {
    const loadVoice = () => {
      const voices = window.speechSynthesis?.getVoices() ?? [];
      voiceRef.current =
        voices.find((v) => v.lang === 'es-MX') ||
        voices.find((v) => v.lang === 'es-US') ||
        voices.find((v) => v.lang.startsWith('es')) ||
        null;
    };
    loadVoice();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoice);
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) setHasSpeechSupport(false);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoice);
  }, []);

  // Tell iOS/CarPlay this is a media-playback app so it routes audio to the active output
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Sofía — Spanish Practice',
      artist: 'AI Language Tutor',
    });
    navigator.mediaSession.setActionHandler('play',  () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play',  null);
        navigator.mediaSession.setActionHandler('pause', null);
      } catch {}
    };
  }, []);

  const speakWebSpeech = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang  = 'es-MX';
    utterance.rate  = 0.88 * speedRef.current;
    utterance.pitch = 1.05;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    const silence = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
    silence.play().catch(() => {});
  }, []);

  const speakText = useCallback(async (text) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    window.speechSynthesis?.cancel();
    setIsPaused(false);

    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('ElevenLabs unavailable');

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      audioBlobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = speedRef.current;
      audio.onplay   = () => { setIsSpeaking(true);  setIsPaused(false); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; };
      audio.onpause  = () => { setIsPaused(true);                        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';  };
      audio.onended  = () => { setIsSpeaking(false); setIsPaused(false); URL.revokeObjectURL(url); audioBlobUrlRef.current = null; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'; };
      audio.onerror  = () => { setIsSpeaking(false); setIsPaused(false); URL.revokeObjectURL(url); audioBlobUrlRef.current = null; };
      await audio.play();
    } catch {
      speakWebSpeech(text);
    }
  }, [speakWebSpeech]);

  const togglePause = useCallback(() => {
    if (audioRef.current) {
      if (audioRef.current.paused) { audioRef.current.play(); }
      else { audioRef.current.pause(); }
    } else if (window.speechSynthesis) {
      if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); setIsPaused(false); }
      else { window.speechSynthesis.pause(); setIsPaused(true); }
    }
  }, []);

  const openGrammarPanel = useCallback((context) => {
    setShowGrammarPanel(true);
    if (context) {
      const cleaned  = context.replace(/\(((?:Tip|Pronunciation)[^)]*)\)/gi, '').trim();
      const question = `Please explain this phrase Sofía said: "${cleaned}"`;
      setGrammarInput('');
      setTimeout(async () => {
        const userMsg = { role: 'user', content: question };
        setGrammarMessages((prev) => {
          const updated = [...prev, userMsg];
          sendGrammarRequest(updated);
          return updated;
        });
      }, 100);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendGrammarRequest = async (history) => {
    setGrammarLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12), mode: 'grammar' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGrammarMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setGrammarMessages((prev) => [...prev, { role: 'assistant', content: "Sorry, couldn't get an explanation. Please try again." }]);
    } finally {
      setGrammarLoading(false);
    }
  };

  const sendGrammarMessage = () => {
    const text = grammarInput.trim();
    if (!text || grammarLoading) return;
    const userMsg = { role: 'user', content: text };
    setGrammarInput('');
    setGrammarMessages((prev) => {
      const updated = [...prev, userMsg];
      sendGrammarRequest(updated);
      return updated;
    });
  };

  const sendMessage = useCallback(
    async (content) => {
      const text = content.trim();
      if (!text || isLoading) return;

      const userMsg         = { role: 'user', content: text };
      const updatedMessages = [...messages, userMsg];

      setMessages(updatedMessages);
      setInputText('');
      setTranscript('');
      setIsLoading(true);

      const trimmedForApi = updatedMessages.slice(-16);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: trimmedForApi,
            scenario: scenario.id,
            ...(drillType && drillTopic ? { drillType, drillTopic } : {}),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const assistantMsg = { role: 'assistant', content: data.message };
        setMessages((prev) => [...prev, assistantMsg]);
        speakText(data.message);
      } catch (err) {
        console.error('Chat error:', err);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Lo siento, hubo un problema de conexión. Por favor, intenta de nuevo. 🙏' },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, scenario, drillType, drillTopic, speakText]
  );

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    unlockAudio();
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);

    const recognition = new SpeechRecognition();
    recognition.lang            = 'es-MX';
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;

    let accumulatedFinal = '';
    pendingTranscriptRef.current = '';
    sentByStopRef.current = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) { accumulatedFinal += r[0].transcript + ' '; }
        else            { interim += r[0].transcript; }
      }
      const display = (accumulatedFinal + interim).trim();
      pendingTranscriptRef.current = display;
      setTranscript(display);
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return;
      console.error('Speech recognition error:', e.error);
      setIsListening(false);
      setTranscript('');
      pendingTranscriptRef.current = '';
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!sentByStopRef.current) {
        const pending = pendingTranscriptRef.current.trim();
        if (pending) {
          setPendingEdit(pending);
          setTranscript('');
          pendingTranscriptRef.current = '';
        }
      }
      sentByStopRef.current = false;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [sendMessage, unlockAudio]);

  const stopListening = useCallback(() => {
    const pending = pendingTranscriptRef.current.trim();
    sentByStopRef.current = true;
    pendingTranscriptRef.current = '';
    setTranscript('');
    if (pending) setPendingEdit(pending);
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const switchScenario = (s) => {
    window.speechSynthesis?.cancel();
    setShowScenarios(false);
    setScenario(s);
    setMessages([{ role: 'assistant', content: s.opening }]);
    setTranscript('');
    setInputText('');
    setPendingEdit(null);
  };

  const DRILL_TOPICS = [
    '👋 Saludos',
    '👨‍👩‍👧 La familia',
    '🍽️ La comida',
    '🙏 La fe y la oración',
    '💼 El trabajo',
    '🗺️ Viajes y direcciones',
    '🏥 La salud',
    '🛒 Las compras',
    '🕐 El tiempo y los números',
    '🌦️ El clima',
    '😊 Emociones y sentimientos',
    '🏠 El hogar',
  ];

  const DRILL_TYPES = [
    { id: 'shadowing',  emoji: '🔁', label: 'Shadowing',            desc: 'Sofía says a phrase — you repeat it. Builds pronunciation.' },
    { id: 'vocabulary', emoji: '📚', label: 'Vocabulary in context', desc: 'Learn words through real sentences, then use them yourself.' },
    { id: 'dialogue',   emoji: '🎭', label: 'Scripted dialogue',     desc: 'Play a role in a mini-conversation. Sofía guides you through.' },
  ];

  const startDrill = (type, topic) => {
    window.speechSynthesis?.cancel();
    setDrillType(type);
    setDrillTopic(topic);
    setShowDrillPanel(false);
    const opening = { role: 'assistant', content: `¡Vamos a practicar! 🎯 Iniciando un drill de **${type}** sobre el tema: **${topic}**. ¡Prepárate!` };
    setMessages([opening]);
    setTranscript('');
    setInputText('');
    setTimeout(() => sendMessage('¡Listo! Empecemos.'), 300);
  };

  const exitDrill = () => {
    setDrillType(null);
    setDrillTopic(null);
    setMessages([{ role: 'assistant', content: scenario.opening }]);
    setTranscript('');
    setInputText('');
    setPendingEdit(null);
  };

  const startNewConversation = () => {
    window.speechSynthesis?.cancel();
    setShowNewConfirm(false);
    setMessages([{ role: 'assistant', content: scenario.opening }]);
    setTranscript('');
    setInputText('');
    setPendingEdit(null);
    speakText(scenario.opening);
  };

  return (
    <div className="app" onPointerDown={unlockAudio}>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-title">
          <h1>{activeTab === 'translator' ? '🔄 Translator' : activeTab === 'reader' ? '📖 Reader' : '🇪🇸 Sofía'}</h1>
          <p className="scenario-label">
            {activeTab === 'translator'
              ? 'English ↔ Spanish'
              : activeTab === 'reader'
              ? 'Read any text aloud'
              : `${scenario.emoji} ${scenario.label}`}
          </p>
        </div>
        <div className="header-right">
          {activeTab === 'sofia' && (
            <>
              {(isSpeaking || isPaused) && (
                <div className="speaking-indicator">
                  <button className="pause-btn" onClick={togglePause} aria-label={isPaused ? 'Resume' : 'Pause'}>
                    {isPaused ? '▶' : '⏸'}
                  </button>
                  {isPaused ? (
                    <span>En pausa</span>
                  ) : (
                    <>
                      <span>Sofía habla</span>
                      <div className="wave-bars">
                        <div className="bar" /><div className="bar" /><div className="bar" />
                      </div>
                    </>
                  )}
                </div>
              )}
              <button className="scenario-btn" onClick={() => setShowNewConfirm((v) => !v)} aria-label="New conversation" title="New conversation">🔄</button>
              <button className={`scenario-btn ${showDrillPanel ? 'active' : ''} ${drillType ? 'drill-active' : ''}`} onClick={() => setShowDrillPanel((v) => !v)} aria-label="Drill mode" title="Drill mode">🎯</button>
              <button className={`scenario-btn ${showGrammarPanel ? 'active' : ''}`} onClick={() => setShowGrammarPanel((v) => !v)} aria-label="Grammar questions" title="Ask a grammar question">❓</button>
              <button className="scenario-btn" onClick={() => setShowScenarios((v) => !v)} aria-label="Change scenario" title="Change scenario">🎭</button>
            </>
          )}
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'sofia' ? 'active' : ''}`}
          onClick={() => setActiveTab('sofia')}
        >
          💬 Sofía
        </button>
        <button
          className={`tab-btn ${activeTab === 'translator' ? 'active' : ''}`}
          onClick={() => setActiveTab('translator')}
        >
          🔄 Translate
        </button>
        <button
          className={`tab-btn ${activeTab === 'reader' ? 'active' : ''}`}
          onClick={() => setActiveTab('reader')}
        >
          📖 Reader
        </button>
      </div>

      {/* ── Sofía tab ── */}
      {activeTab === 'sofia' && (
        <>
          {showNewConfirm && (
            <div className="confirm-bar">
              <span>¿Empezar una conversación nueva?</span>
              <button className="confirm-yes" onClick={startNewConversation}>Sí, empezar</button>
              <button className="confirm-no" onClick={() => setShowNewConfirm(false)}>Cancelar</button>
            </div>
          )}

          {drillType && (
            <div className="drill-banner">
              <span>{DRILL_TYPES.find(d => d.id === drillType)?.emoji} <strong>{DRILL_TYPES.find(d => d.id === drillType)?.label}</strong> — {drillTopic}</span>
              <button className="drill-exit-btn" onClick={exitDrill}>✕ Salir del drill</button>
            </div>
          )}

          {showDrillPanel && (
            <div className="drill-panel">
              <p className="drill-panel-title">🎯 Modo Drill — Elige un tipo y un tema</p>
              <div className="drill-type-row">
                {DRILL_TYPES.map((dt) => (
                  <button
                    key={dt.id}
                    className={`drill-type-card ${drillType === dt.id ? 'active' : ''}`}
                    onClick={() => setDrillType(dt.id)}
                  >
                    <span className="drill-type-emoji">{dt.emoji}</span>
                    <span className="drill-type-label">{dt.label}</span>
                    <span className="drill-type-desc">{dt.desc}</span>
                  </button>
                ))}
              </div>
              <p className="drill-section-label">Elige un tema:</p>
              <div className="drill-topic-grid">
                {DRILL_TOPICS.map((t) => (
                  <button
                    key={t}
                    className={`drill-topic-chip ${drillTopic === t ? 'active' : ''}`}
                    onClick={() => setDrillTopic(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <button
                className="drill-start-btn"
                disabled={!drillType || !drillTopic}
                onClick={() => startDrill(drillType, drillTopic)}
              >
                ¡Empezar el drill! →
              </button>
            </div>
          )}

          {showScenarios && (
            <div className="scenario-panel">
              <p className="scenario-panel-title">Elige una situación</p>
              <div className="scenario-grid">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    className={`scenario-card ${scenario.id === s.id ? 'active' : ''}`}
                    onClick={() => switchScenario(s)}
                  >
                    <span className="scenario-card-emoji">{s.emoji}</span>
                    <span className="scenario-card-label">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showGrammarPanel && (
            <div className="grammar-panel">
              <div className="grammar-panel-header">
                <span>❓ Preguntas de gramática</span>
                <button className="grammar-close-btn" onClick={() => setShowGrammarPanel(false)}>✕</button>
              </div>
              <div className="grammar-messages">
                {grammarMessages.length === 0 && (
                  <p className="grammar-empty">Ask me anything about Spanish grammar, vocabulary, or expressions! You can also tap the ❓ button on any of Sofía's messages.</p>
                )}
                {grammarMessages.map((msg, i) => (
                  <div key={i} className={`grammar-msg-wrap ${msg.role}`}>
                    <div className={`grammar-bubble ${msg.role}`}>
                      {msg.role === 'assistant' ? '📚 ' : '👤 '}{msg.content}
                    </div>
                    {msg.role === 'assistant' && (
                      <button
                        className="grammar-listen-btn"
                        onClick={() => { unlockAudio(); speakText(msg.content); }}
                        title="Listen to this explanation"
                      >
                        🔊 <span>escuchar</span>
                      </button>
                    )}
                  </div>
                ))}
                {grammarLoading && (
                  <div className="grammar-bubble assistant grammar-loading">
                    <span className="dots"><span /><span /><span /></span>
                  </div>
                )}
                <div ref={grammarBottomRef} />
              </div>
              <div className="grammar-input-row">
                <input
                  type="text"
                  value={grammarInput}
                  onChange={(e) => setGrammarInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendGrammarMessage()}
                  placeholder="e.g. What's the difference between por and para?"
                  disabled={grammarLoading}
                />
                <button
                  className="send-btn"
                  onClick={sendGrammarMessage}
                  disabled={grammarLoading || !grammarInput.trim()}
                >↑</button>
              </div>
            </div>
          )}

          <ConversationHistory messages={messages} isLoading={isLoading} onReplay={speakText} onUnlockAudio={unlockAudio} onAskGrammar={openGrammarPanel} />

          {transcript && <div className="transcript-preview">{transcript}</div>}

          {pendingEdit !== null && (
            <div className="pending-edit-row">
              <span className="pending-edit-label">🎤</span>
              <input
                type="text"
                className="pending-edit-input"
                value={pendingEdit}
                onChange={(e) => setPendingEdit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pendingEdit.trim()) { sendMessage(pendingEdit); setPendingEdit(null); }
                  if (e.key === 'Escape') setPendingEdit(null);
                }}
                autoFocus
                aria-label="Edit transcription before sending"
              />
              <button
                className="send-btn"
                onClick={() => { sendMessage(pendingEdit); setPendingEdit(null); }}
                disabled={isLoading || !pendingEdit.trim()}
                aria-label="Send"
              >↑</button>
              <button
                className="cancel-edit-btn"
                onClick={() => setPendingEdit(null)}
                aria-label="Discard"
              >✕</button>
            </div>
          )}

          <div className="input-area">
            <div className="text-input-row">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputText)}
                placeholder="O escribe aquí..."
                disabled={isLoading || isListening}
                aria-label="Type in Spanish"
              />
              <button
                className="send-btn"
                onClick={() => sendMessage(inputText)}
                disabled={isLoading || isListening || !inputText.trim()}
                aria-label="Send"
              >↑</button>
            </div>
            <div className="mic-row">
              {hasSpeechSupport ? (
                <MicButton isListening={isListening} isLoading={isLoading} onStart={startListening} onStop={stopListening} />
              ) : (
                <p className="no-speech-notice">Speech not supported. Use Chrome for mic input.</p>
              )}
              <button
                className={`speed-btn ${speedIdx > 0 ? 'slowed' : ''}`}
                onClick={cycleSpeed}
                title="Change playback speed"
                aria-label="Change speech speed"
              >
                🐢 {currentSpeed.label}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Translator tab ── */}
      {activeTab === 'translator' && <Translator />}

      {/* ── Reader tab ── */}
      {activeTab === 'reader' && <Reader />}

    </div>
  );
}
