export default function MessageBubble({ message, onReplay }) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-row ${message.role}`}>
      <div className="avatar">
        {isUser ? '👤' : '🇪🇸'}
      </div>
      <div>
        <div className="bubble">{message.content}</div>
        {!isUser && (
          <button className="replay-btn" onClick={() => onReplay(message.content)} title="Listen again">
            🔊 <span>escuchar</span>
          </button>
        )}
      </div>
    </div>
  );
}
