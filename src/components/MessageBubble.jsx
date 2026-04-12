import { useState } from 'react';

export default function MessageBubble({ message, onReplay }) {
  const isUser = message.role === 'user';
  const [translation, setTranslation] = useState(null);
  const [loadingTranslation, setLoadingTranslation] = useState(false);

  const handleTranslate = async () => {
    if (translation) {
      setTranslation(null); // toggle off
      return;
    }
    setLoadingTranslation(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content }),
      });
      const data = await res.json();
      setTranslation(data.translation);
    } catch {
      setTranslation('Could not load translation.');
    } finally {
      setLoadingTranslation(false);
    }
  };

  return (
    <div className={`message-row ${message.role}`}>
      <div className="avatar">
        {isUser ? '👤' : '🇲🇽'}
      </div>
      <div className="bubble-col">
        <div className="bubble">{message.content}</div>
        {!isUser && (
          <div className="bubble-actions">
            <button className="action-btn" onClick={() => onReplay(message.content)} title="Listen again">
              🔊 <span>escuchar</span>
            </button>
            <button
              className={`action-btn translate-btn ${translation ? 'active' : ''}`}
              onClick={handleTranslate}
              disabled={loadingTranslation}
              title="Show English translation"
            >
              {loadingTranslation ? '⏳' : '🇺🇸'} <span>{translation ? 'hide' : 'translate'}</span>
            </button>
          </div>
        )}
        {translation && (
          <div className="translation-bubble">{translation}</div>
        )}
      </div>
    </div>
  );
}
