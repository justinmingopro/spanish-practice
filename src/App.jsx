import { useState, useRef, useEffect, useCallback } from 'react';
import ConversationHistory from './components/ConversationHistory';
import MicButton from './components/MicButton';
import './App.css';

const SCENARIOS = [
  { id: 'free',       emoji: '💬', label: 'Conversación libre',   opening: '¡Hola! Soy Sofía, tu compañera de conversación. 😊 ¿Cómo estás hoy? ¿De qué te gustaría hablar?' },
  { id: 'restaurant', emoji: '🍽️', label: 'En el restaurante',    opening: '¡Buenas tardes! Bienvenido a La Mesa Bonita. ¿Tiene reservación, o prefiere sentarse en la terraza? Aquí tiene el menú. 😊' },
  { id: 'market',     emoji: '🛒', label: 'En el mercado',         opening: '¡Buenos días! Pase, pase. Tenemos frutas frescas, especias, y artesanías. ¿Qué le puedo ofrecer hoy?' },
  { id: 'family',     emoji: '👨‍👩‍👧', label: 'La familia',           opening: '¡Hola, vecino! Estaba pensando en hacer tamales este domingo con mi familia. ¿Cómo está su familia? ¿Tienen tradiciones especiales?' },
  { id: 'faith',      emoji: '🙏', label: 'La fe',                 opening: '¡Hola! Estaba leyendo un pasaje de los Salmos esta mañana — tan hermoso. ¿Cómo va tu vida espiritual últimamente? ¿Estás en una iglesia?' },
  { id: 'work',       emoji: '💼', label: 'El trabajo',            opening: '¡Uf, qué semana tan larga! Oye, ¿ya terminaste el informe para el jefe? Yo todavía tengo mucho que hacer antes del viernes.' },
  { id: 'travel',     emoji: '🗺️', label: 'De viaje',              opening: '¡Hola! ¿Necesita ayuda? Soy de aquí — conozco bien la ciudad. ¿Busca algo en particular? ¿Un restaurante, un museo, quizás el mercado central?' },
  { id: 'doctor',     emoji: '🏥', label: 'En la clínica',         opening: '¡Buenos días! Soy Sofía, la enfermera. ¿Cómo se llama usted? ¿Y cuál es el motivo de su visita hoy?' },
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

  const [scenario, setScenario] = useState(savedScenario);
  const [showScenarios, setShowScenarios] = useState(false);
  const [messages, setMessages] = useState(savedMessages);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [hasSpeechSupport, setHasSpeechSupport] = useState(true);
  const [showNewConfirm, setShowNewConfirm] = useState(false);

  const SPEEDS = [
    { label: '1×',  rate: 1.0 },
    { label: '¾×',  rate: 0.75 },
    { label: '½×',  rate: 0.5 },
  ];
  const [speedIdx, setSpeedIdx] = useState(0);
  const cycleSpeed = () => setSpeedIdx((i) => (i + 1) % SPEEDS.length);
  const currentSpeed = SPEEDS[speedIdx];

  const recognitionRef = useRef(null);
  const voiceRef = useRef(null);
  const pendingTranscriptRef = useRef('');

  // Persist conversation whenever messages or scenario change
  useEffect(() => {
    saveState(scenario.id, messages);
  }, [scenario.id, messages]);

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

  const audioRef = useRef(null);

  const speakWebSpeech = useCallback((text, rate = 1.0) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-MX';
    utterance.rate = 0.88 * rate;   // 0.88 is our natural baseline
    utterance.pitch = 1.05;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const speakText = useCallback(async (text, rate = 1.0) => {
    // Stop anything currently playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speed: rate }),
      });
      if (!res.ok) throw new Error('ElevenLabs unavailable');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      await audio.play();
    } catch {
      speakWebSpeech(text, rate);
    }
  }, [speakWebSpeech]);

  const sendMessage = useCallback(
    async (content) => {
      const text = content.trim();
      if (!text || isLoading) return;

      const userMsg = { role: 'user', content: text };
      const updatedMessages = [...messages, userMsg];

      setMessages(updatedMessages);
      setInputText('');
      setTranscript('');
      setIsLoading(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages, scenario: scenario.id }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const assistantMsg = { role: 'assistant', content: data.message };
        setMessages((prev) => [...prev, assistantMsg]);
        speakText(data.message, currentSpeed.rate);
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
    [messages, isLoading, scenario, speakText]
  );

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-MX';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let accumulatedFinal = '';
    pendingTranscriptRef.current = '';

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          accumulatedFinal += r[0].transcript + ' ';
        } else {
          interim += r[0].transcript;
        }
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
      const pending = pendingTranscriptRef.current.trim();
      if (pending) {
        sendMessage(pending);
        pendingTranscriptRef.current = '';
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [sendMessage]);

  const stopListening = useCallback(() => {
    const pending = pendingTranscriptRef.current.trim();
    recognitionRef.current?.stop();
    setIsListening(false);
    if (pending) {
      sendMessage(pending);
      pendingTranscriptRef.current = '';
    }
  }, [sendMessage]);

  const switchScenario = (s) => {
    window.speechSynthesis?.cancel();
    setShowScenarios(false);
    setScenario(s);
    setMessages([{ role: 'assistant', content: s.opening }]);
    setTranscript('');
    setInputText('');
  };

  const startNewConversation = () => {
    window.speechSynthesis?.cancel();
    setShowNewConfirm(false);
    setMessages([{ role: 'assistant', content: scenario.opening }]);
    setTranscript('');
    setInputText('');
    speakText(scenario.opening, currentSpeed.rate);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <h1>🇪🇸 Sofía</h1>
          <p className="scenario-label">{scenario.emoji} {scenario.label}</p>
        </div>
        <div className="header-right">
          {isSpeaking && (
            <div className="speaking-indicator">
              <span>Sofía habla</span>
              <div className="wave-bars">
                <div className="bar" /><div className="bar" /><div className="bar" />
              </div>
            </div>
          )}
          <button className="scenario-btn" onClick={() => setShowNewConfirm((v) => !v)} aria-label="New conversation" title="New conversation">
            🔄
          </button>
          <button className="scenario-btn" onClick={() => setShowScenarios((v) => !v)} aria-label="Change scenario" title="Change scenario">
            🎭
          </button>
        </div>
      </header>

      {showNewConfirm && (
        <div className="confirm-bar">
          <span>¿Empezar una conversación nueva?</span>
          <button className="confirm-yes" onClick={startNewConversation}>Sí, empezar</button>
          <button className="confirm-no" onClick={() => setShowNewConfirm(false)}>Cancelar</button>
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

      <ConversationHistory messages={messages} isLoading={isLoading} onReplay={speakText} />

      {transcript && <div className="transcript-preview">{transcript}</div>}

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
          >
            ↑
          </button>
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
    </div>
  );
}
