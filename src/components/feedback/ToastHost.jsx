const TOAST_ICONS = {
  success: "✓",
  info: "ℹ",
  warn: "⚠",
  error: "✕",
};

export default function ToastHost({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fb-toast-stack" role="region" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`fb-toast fb-toast-${t.type || "info"}`}
          role="status"
        >
          <span className="fb-toast-icon" aria-hidden="true">
            {TOAST_ICONS[t.type] || TOAST_ICONS.info}
          </span>
          <span className="fb-toast-text">{t.message}</span>
          <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}