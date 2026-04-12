import { useState, useRef, useEffect, useCallback } from 'react';
import ConversationHistory from './components/ConversationHistory';
import MicButton from './components/MicButton';
import './App.css';

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: '¡Hola! Soy Sofía, tu compañera de conversación en español. 😊 ¿Cómo estás hoy? ¿De qué te gustaría hablar?',
};

const TOPIC_CHIPS = [
  '¿Cómo fue tu día?',
  'La familia',
  'La fe',
  'El trabajo',
  'La comida',
  'Los planes',
];

export default function App() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [hasSpeechSupport, setHasSpeechSupport] = useState(true);

  const recognitionRef = useRef(null);
  const voiceRef = useRef(null);
  const pendingTranscriptRef = useRef('');

  // Load Spanish voice, retry until voices are available
  useEffect(() => {
    const loadVoice = () => {
      const voices = window.speechSynthesis?.getVoices() ?? [];
      const spanish =
        voices.find((v) => v.lang === 'es-MX') ||
        voices.find((v) => v.lang === 'es-US') ||
        voices.find((v) => v.lang.startsWith('es')) ||
        null;
      voiceRef.current = spanish;
    };

    loadVoice();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoice);

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) setHasSpeechSupport(false);

    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoice);
    };
  }, []);

  // Speak the greeting after a short delay
  useEffect(() => {
    const timer = setTimeout(() => speakText(INITIAL_MESSAGE.content), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          body: JSON.stringify({ messages: updatedMessages }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const assistantMsg = { role: 'assistant', content: data.message };

        setMessages((prev) => [...prev, assistantMsg]);
        speakText(data.message);
      } catch (err) {
        console.error('Chat error:', err);
        const errMsg = {
          role: 'assistant',
          content: 'Lo siento, hubo un problema de conexión. Por favor, intenta de nuevo. 🙏',
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, speakText]
  );

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Stop any ongoing speech
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    let finalSent = false;
    pendingTranscriptRef.current = '';

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
      // Fallback: some browsers end without firing isFinal — send whatever we captured
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-title">
          <h1>🇪🇸 Sofía</h1>
          <p>Tu compañera de español</p>
        </div>
        {isSpeaking && (
          <div className="speaking-indicator">
            <span>Sofía habla</span>
            <div className="wave-bars">
              <div className="bar" />
              <div className="bar" />
              <div className="bar" />
            </div>
          </div>
        )}
      </header>

      <ConversationHistory
        messages={messages}
        isLoading={isLoading}
        onReplay={speakText}
      />

      {messages.length <= 2 && !isLoading && (
        <div className="topic-chips">
          {TOPIC_CHIPS.map((chip) => (
            <button key={chip} className="chip" onClick={() => sendMessage(chip)}>
              {chip}
            </button>
          ))}
        </div>
      )}

      {transcript && (
        <div className="transcript-preview">{transcript}</div>
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
          >
            ↑
          </button>
        </div>

        {hasSpeechSupport ? (
          <MicButton
            isListening={isListening}
            isLoading={isLoading}
            onStart={startListening}
            onStop={stopListening}
          />
        ) : (
          <p className="no-speech-notice">
            Speech not supported in this browser. Use Chrome for mic input.
          </p>
        )}
      </div>
    </div>
  );
}
