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

export default function App() {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [showScenarios, setShowScenarios] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', content: SCENARIOS[0].opening }]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [hasSpeechSupport, setHasSpeechSupport] = useState(true);

  const recognitionRef = useRef(null);
  const voiceRef = useRef(null);
  const pendingTranscriptRef = useRef('');

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

  const speakText = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.88;
    utterance.pitch = 1.05;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  // Speak opening when scenario changes
  useEffect(() => {
    const timer = setTimeout(() => speakText(scenario.opening), 500);
    return () => clearTimeout(timer);
  }, [scenario, speakText]);

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
    [messages, isLoading, scenario, speakText]
  );

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalSent = false;
    pendingTranscriptRef.current = '';

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      pendingTranscriptRef.current = text;
      setTranscript(text);
      if (result.isFinal) {
        finalSent = true;
        setIsListening(false);
        sendMessage(text);
      }
    };

    recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error);
      setIsListening(false);
      setTranscript('');
      pendingTranscriptRef.current = '';
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!finalSent && pendingTranscriptRef.current.trim()) {
        sendMessage(pendingTranscriptRef.current);
        pendingTranscriptRef.current = '';
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [sendMessage]);

  const stopListening = useCallback(() => {
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
          <button className="scenario-btn" onClick={() => setShowScenarios((v) => !v)} aria-label="Change scenario">
            🎭
          </button>
        </div>
      </header>

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

        {hasSpeechSupport ? (
          <MicButton isListening={isListening} isLoading={isLoading} onStart={startListening} onStop={stopListening} />
        ) : (
          <p className="no-speech-notice">Speech not supported. Use Chrome for mic input.</p>
        )}
      </div>
    </div>
  );
}
