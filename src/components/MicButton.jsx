export default function MicButton({ isListening, isLoading, onStart, onStop }) {
  const handleClick = () => {
    if (isListening) {
      onStop();
    } else {
      onStart();
    }
  };

  return (
    <>
      <button
        className={`mic-btn ${isListening ? 'listening' : ''}`}
        onClick={handleClick}
        disabled={isLoading}
        aria-label={isListening ? 'Stop listening' : 'Speak in Spanish'}
      >
        {isListening ? (
          // Stop icon
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          // Mic icon
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-1 14.93V20H9v2h6v-2h-2v-2.07A7 7 0 0 0 19 11h-2a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93z" />
          </svg>
        )}
      </button>
      <span className="mic-label">
        {isListening ? 'Toca para enviar ✓' : 'Toca para hablar'}
      </span>
    </>
  );
}
