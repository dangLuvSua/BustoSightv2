import { useEffect, useRef, useState } from "react";
import PasswordInput from "../PasswordInput";

export default function PasswordDialog({
  title,
  message,
  label = "Password",
  placeholder = "Enter your password",
  confirmLabel = "Verify",
  cancelLabel = "Cancel",
  danger = false,
  required = true,
  onVerify = null,
  onResolve,
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !isVerifying) onResolve(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onResolve, isVerifying]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isVerifying) return;

    const value = password.trim();
    if (required && !value) {
      setError("Password is required.");
      inputRef.current?.focus();
      return;
    }

    if (!onVerify) {
      onResolve(value);
      return;
    }

    setError("");
    setIsVerifying(true);
    try {
      const result = await onVerify(value);
      if (result && result.ok) {
        onResolve(value);
        return;
      }
      setError((result && result.error) || "Verification failed. Please try again.");
      setPassword("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err?.message || "Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="fb-dialog-overlay"
      onClick={(e) =>
        e.target === e.currentTarget && !isVerifying && onResolve(null)
      }
    >
      <div
        className="fb-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fb-password-title"
      >
        <div className="fb-dialog-header">
          <h2 id="fb-password-title">{title}</h2>
          <button
            type="button"
            className="fb-dialog-close"
            onClick={() => onResolve(null)}
            disabled={isVerifying}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="fb-dialog-body" onSubmit={handleSubmit}>
          {message && <p className="fb-dialog-message">{message}</p>}

          {error && (
            <div className="fb-dialog-error" role="alert">
              {error}
            </div>
          )}

          <div className="fb-field-group">
            <label htmlFor="fb-password-input">{label}</label>
            <PasswordInput
              id="fb-password-input"
              ref={inputRef}
              value={password}
              placeholder={placeholder}
              autoComplete="off"
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              disabled={isVerifying}
            />
          </div>

          <div className="fb-dialog-footer">
            <button
              type="button"
              className="fb-btn fb-btn-ghost"
              onClick={() => onResolve(null)}
              disabled={isVerifying}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className={`fb-btn ${danger ? "fb-btn-danger" : "fb-btn-primary"}`}
              disabled={isVerifying}
            >
              {isVerifying ? "Verifying..." : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}