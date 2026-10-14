import { useEffect } from "react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  warning = "",
  onResolve,
}) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onResolve(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onResolve]);

  return (
    <div
      className="fb-dialog-overlay"
      onClick={(e) => e.target === e.currentTarget && onResolve(false)}
    >
      <div
        className="fb-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fb-confirm-title"
      >
        <div className="fb-dialog-header">
          <h2 id="fb-confirm-title">{title}</h2>
          <button
            type="button"
            className="fb-dialog-close"
            onClick={() => onResolve(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="fb-dialog-body">
          {message && <p className="fb-dialog-message">{message}</p>}

          {warning && <div className="fb-dialog-warning">{warning}</div>}

          <div className="fb-dialog-footer">
            <button
              type="button"
              className="fb-btn fb-btn-ghost"
              onClick={() => onResolve(false)}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`fb-btn ${danger ? "fb-btn-danger" : "fb-btn-primary"}`}
              onClick={() => onResolve(true)}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}