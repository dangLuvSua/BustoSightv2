import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ToastHost from "../components/feedback/ToastHost";
import ConfirmDialog from "../components/feedback/ConfirmDialog";
import PasswordDialog from "../components/feedback/PasswordDialog";
import "../css/feedback.css";

const FeedbackContext = createContext(null);

const TOAST_DURATION = 3500;

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [passwordState, setPasswordState] = useState(null);
  const toastIdRef = useRef(0);
  const timersRef = useRef(new Map());
  const confirmResolverRef = useRef(null);
  const passwordResolverRef = useRef(null);

  // ---- Toasts -------------------------------------------------------------

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message, type = "info") => {
      if (!message) return;
      const id = ++toastIdRef.current;
      setToasts((prev) => [...prev, { id, message: String(message), type }]);
      const timer = setTimeout(() => dismissToast(id), TOAST_DURATION);
      timersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // ---- Confirm dialog -----------------------------------------------------

  const claimResolver = (ref, resolve) => {
  // A dialog can only be open once; resolve any orphaned previous request as
  // cancelled so its awaiting caller is never left hanging forever.
  if (ref.current) ref.current(false);
  ref.current = resolve;
};

// ---- Confirm dialog -----------------------------------------------------

const confirm = useCallback(
  (options = {}) =>
    new Promise((resolve) => {
      const config =
        typeof options === "string" ? { message: options } : options;
      claimResolver(confirmResolverRef, resolve);
      setConfirmState({
        title: "Please Confirm",
        message: "",
        confirmLabel: "Confirm",
        cancelLabel: "Cancel",
        danger: false,
        warning: "",
        ...config,
      });
    }),
  [],
);

const resolveConfirm = useCallback((result) => {
  const resolve = confirmResolverRef.current;
  confirmResolverRef.current = null;
  setConfirmState(null);
  if (resolve) resolve(result);
}, []);

// ---- Password dialog ----------------------------------------------------

const promptPassword = useCallback(
  (options = {}) =>
    new Promise((resolve) => {
      const config =
        typeof options === "string" ? { message: options } : options;
      claimResolver(passwordResolverRef, resolve);
      setPasswordState({
        title: "Security Check",
        message: "",
        label: "Password",
        placeholder: "Enter your password",
        confirmLabel: "Verify",
        danger: false,
        required: true,
        onVerify: null,
        ...config,
      });
    }),
  [],
);

  const resolvePassword = useCallback((result) => {
    const resolve = passwordResolverRef.current;
    passwordResolverRef.current = null;
    setPasswordState(null);
    if (resolve) resolve(result);
  }, []);

  const value = useMemo(
    () => ({
      toast,
      success: (message) => toast(message, "success"),
      error: (message) => toast(message, "error"),
      warn: (message) => toast(message, "warn"),
      info: (message) => toast(message, "info"),
      dismissToast,
      confirm,
      promptPassword,
    }),
    [toast, dismissToast, confirm, promptPassword],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
      {confirmState && (
        <ConfirmDialog {...confirmState} onResolve={resolveConfirm} />
      )}
      {passwordState && (
        <PasswordDialog {...passwordState} onResolve={resolvePassword} />
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error("useFeedback must be used within a FeedbackProvider");
  }
  return ctx;
}

export const useToast = () => useFeedback();
export const useConfirm = () => useFeedback().confirm;
export const usePasswordPrompt = () => useFeedback().promptPassword;