import { useEffect, useMemo, useRef, useState } from "react";

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function SessionTimeoutDialog({
  warningMs,
  onStay,
  onLogout,
}) {
  // Countdown is derived from an absolute deadline, never from a tick counter:
  // background tabs throttle setInterval to ~1/min, which would otherwise burn
  // the entire warning window while the tab sits in the background.
  const deadlineRef = useRef(Date.now() + warningMs);
  const [remainingMs, setRemainingMs] = useState(warningMs);
  const stayButtonRef = useRef(null);

  useEffect(() => {
    deadlineRef.current = Date.now() + warningMs;
    setRemainingMs(warningMs);
    stayButtonRef.current?.focus();
  }, [warningMs]);

  useEffect(() => {
    const tick = () => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        onLogout();
        return;
      }
      setRemainingMs(left);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [onLogout]);

  // Escape is intentionally a no-op: an accidental keypress should not be able
  // to dismiss a security warning.
  const blockInteraction = (e) => {
    e.stopPropagation();
  };

  const totalSeconds = remainingMs / 1000;
  const urgent = totalSeconds <= 10;
  const dashOffset = useMemo(
    () => RING_CIRCUMFERENCE * (1 - Math.min(remainingMs / warningMs, 1)),
    [remainingMs, warningMs],
  );

  return (
    <div
      className="fb-dialog-overlay"
      onClick={blockInteraction}
      style={{ zIndex: 11002 }}
    >
      <div
        className="fb-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sd-title"
        aria-describedby="sd-description"
      >
        <div className="fb-dialog-header">
          <h2 id="sd-title">Session Expiring</h2>
        </div>

        <div className="fb-dialog-body">
          <p className="fb-dialog-message" id="sd-description">
            You have been inactive. For the security of resident records, your
            session will close automatically.
          </p>

          <div className="sd-ring-wrap">
            <svg
              className="sd-ring"
              width={120}
              height={120}
              viewBox="0 0 120 120"
              aria-hidden="true"
            >
              <circle
                className="sd-ring-track"
                cx={60}
                cy={60}
                r={RING_RADIUS}
                fill="none"
                strokeWidth={8}
              />
              <circle
                className={`sd-ring-fill${urgent ? " sd-urgent" : ""}`}
                cx={60}
                cy={60}
                r={RING_RADIUS}
                fill="none"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
            </svg>

            <div className="sd-ring-inner" aria-live="assertive">
              <span className={`sd-ring-time${urgent ? " sd-urgent" : ""}`}>
                {formatClock(totalSeconds)}
              </span>
              <span className="sd-ring-label">Remaining</span>
            </div>
          </div>

          <div className="sd-hint">
            Select <strong>Stay Signed In</strong> to continue working. Any
            unsaved changes on this page will be lost if you log out.
          </div>

          <div className="fb-dialog-footer">
            <button
              type="button"
              className="fb-btn fb-btn-ghost"
              onClick={onLogout}
            >
              Log Out Now
            </button>
            <button
              ref={stayButtonRef}
              type="button"
              className="fb-btn fb-btn-primary"
              onClick={onStay}
            >
              Stay Signed In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}