import { useState } from 'react';

// Finds parenthetical tips: (Tip: ...) or (Pronunciation tip: ...)
// and renders them in red, separate from the main Spanish dialogue.
function parseContent(content) {
  const parts = [];
  const regex = /\(((?:Tip|Pronunciation)[^)]*)\)/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index).trim() });
    }
    parts.push({ type: 'tip', value: match[0] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) parts.push({ type: 'text', value: remaining });
  }

  return parts;
}

export default function MessageBubble({ message, onReplay, onUnlockAudio }) {
  const isUser = message.role === 'user';
  const [translation, setTranslation] = useState(null);
  const [loadingTranslation, setLoadingTranslation] = useState(false);

  const parts = isUser ? null : parseContent(message.content);

  const handleTranslate = async () => {
    if (translation) { setTranslation(null); return; }
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
      <div className="avatar">{isUser ? '👤' : '🇲🇽'}</div>
      <div className="bubble-col">
        <div className="bubble">
          {isUser ? (
            message.content
          ) : (
            parts.map((part, i) =>
              part.type === 'tip' ? (
                <span key={i} className="tip-text">{part.value}</span>
              ) : (
                <span key={i}>{part.value}</span>
              )
            )
          )}
        </div>

        {!isUser && (
          <div className="bubble-actions">
            <button className="action-btn" onClick={() => { onUnlockAudio?.(); onReplay(message.content); }} title="Listen again">
              🔊 <span>escuchar</span>
            </button>
            <button
              className={`action-btn ${translation ? 'active' : ''}`}
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
