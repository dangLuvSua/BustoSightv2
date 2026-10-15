import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SessionTimeoutDialog from "../components/SessionTimeoutDialog";
import "../css/session.css";

const SessionContext = createContext(null);

const IDLE_LIMIT_MS = 10 * 60 * 1000;
const WARNING_MS = 60 * 1000;
const ACTIVITY_DEBOUNCE_MS = 1000;
const HEARTBEAT_MS = 1000;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
];

// Auth-scoped localStorage keys. Resident data caches (tanawanData,
// archivedResidents) are deliberately NOT cleared: Reports and AddResident read
// them as an offline fallback.
const AUTH_STORAGE_KEYS = ["popdev_user"];

function clearAuthStorage() {
  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function SessionProvider({ children }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [warningDeadline, setWarningDeadline] = useState(null);

  const lastActivityRef = useRef(Date.now());
  const lastRecordRef = useRef(0);
  const warnedRef = useRef(false);
  const loggingOutRef = useRef(false);

  const markActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastRecordRef.current < ACTIVITY_DEBOUNCE_MS) return;
    lastRecordRef.current = now;
    lastActivityRef.current = now;
  }, []);

  // ---- Global auth listener ------------------------------------------------
  // This deliberately replaces the one that used to live inside ProtectedRoute,
  // which was torn down on /login, / and /force-password-change.

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession ?? null);

      if (event === "SIGNED_OUT") {
        warnedRef.current = false;
        setWarningDeadline(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // ---- Logout --------------------------------------------------------------

  const performLogout = useCallback(
    async ({ message } = {}) => {
      // The idle heartbeat and the warning dialog can both reach zero around the
      // same moment; only the first one through may actually tear down.
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;

      warnedRef.current = false;
      setWarningDeadline(null);

      // Signals ProtectedRoute to stand down so it cannot race this redirect
      // with its generic "please log in first" message.
      setRedirecting(true);

      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("Sign-out failed, clearing local state anyway:", err);
      }
      clearAuthStorage();
      setSession(null);
      navigate("/login", {
        replace: true,
        state: message ? { message } : undefined,
      });
    },
    [navigate],
  );

  const expireSession = useCallback(() => {
    performLogout({
      message:
        "Your session timed out due to inactivity. Please sign in again.",
    });
  }, [performLogout]);

  // ---- Idle warning --------------------------------------------------------

  const handleLogoutNow = useCallback(() => {
    performLogout();
  }, [performLogout]);

  const staySignedIn = useCallback(() => {
    warnedRef.current = false;
    loggingOutRef.current = false;
    lastActivityRef.current = Date.now();
    lastRecordRef.current = Date.now();
    setWarningDeadline(null);
  }, []);

  // Activity listeners are suspended while the warning is open so incidental
  // mouse movement cannot dismiss it.
  const isWarningOpen = warningDeadline !== null;

  useEffect(() => {
    if (!session || isWarningOpen) return;

    const onActivity = () => markActivity();
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onActivity, { passive: true }),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, onActivity),
      );
    };
  }, [session, isWarningOpen, markActivity]);

  useEffect(() => {
    if (!session) return;

    // A fresh session (e.g. after signing back in) re-arms the idle guard and
    // clears the redirect flag, so ProtectedRoute resumes rendering.
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
    loggingOutRef.current = false;
    setRedirecting(false);

    const tick = () => {
      const idleFor = Date.now() - lastActivityRef.current;
      const remaining = IDLE_LIMIT_MS - idleFor;

      // While the warning is open the dialog owns the countdown; this stays a
      // silent backstop for the case where its own timer is throttled.
      if (warnedRef.current) {
        if (remaining <= 0) expireSession();
        return;
      }

      if (remaining <= 0) {
        expireSession();
        return;
      }

      if (remaining <= WARNING_MS) {
        warnedRef.current = true;
        setWarningDeadline(Date.now() + remaining);
      }
    };

    const interval = setInterval(tick, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [session, expireSession]);

  const value = useMemo(
    () => ({
      session,
      loading,
      redirecting,
      performLogout,
      staySignedIn,
      idleLimitMs: IDLE_LIMIT_MS,
      warningMs: WARNING_MS,
    }),
    [session, loading, redirecting, performLogout, staySignedIn],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
      {isWarningOpen && (
        <SessionTimeoutDialog
          warningMs={WARNING_MS}
          onStay={staySignedIn}
          onLogout={handleLogoutNow}
        />
      )}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
