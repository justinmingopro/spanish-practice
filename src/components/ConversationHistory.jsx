import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';

export default function ConversationHistory({ messages, isLoading, onReplay }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="conversation">
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} onReplay={onReplay} />
      ))}
      {isLoading && (
        <div className="typing-indicator">
          <div className="avatar">🇪🇸</div>
          <div className="dots">
            <span /><span /><span />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
