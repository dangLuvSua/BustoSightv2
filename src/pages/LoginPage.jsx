import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/FeedbackContext';
import PasswordInput from '../components/PasswordInput';
import '../css/LoginPage.css';

const MAX_ATTEMPTS = 3;
const ATTEMPTS_KEY = 'bustos_login_attempts';

function getStoredAttempts() {
  try { return JSON.parse(localStorage.getItem(ATTEMPTS_KEY)) || {}; }
  catch { return {}; }
}

function setStoredAttempts(obj) {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(obj));
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const location = useLocation();
  const toast = useToast();

  useEffect(() => {
    if (location.state?.message) {
      toast.error(location.state.message);

      // Clear state so it doesn't reappear on refresh
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate, toast]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    const usernameKey = username.trim().toLowerCase();
    const allAttempts = getStoredAttempts();
    const isLocallyLocked = (allAttempts[usernameKey] || 0) >= MAX_ATTEMPTS;

    try {
      let loginEmail = username.trim();
      let targetProfile = null;

      // Always query profile by username OR email to check lock and deactivation status
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, email, username, is_locked, must_change_password, status, archived')
        .or(`username.ilike.${loginEmail},email.ilike.${loginEmail}`)
        .maybeSingle();

      targetProfile = profileData;

      // 1. If already marked locked in DB, immediately block
      if (targetProfile?.is_locked) {
        setIsAccountLocked(true);
        allAttempts[usernameKey] = MAX_ATTEMPTS;
        setStoredAttempts(allAttempts);
        return;
      }

      // 2. If locally locked (3 failed attempts), check if an admin reset it
      if (isLocallyLocked) {
        if (targetProfile && targetProfile.must_change_password && !targetProfile.is_locked) {
          // Admin has reset this account! Unlock so the user can log in with temporary password
          delete allAttempts[usernameKey];
          setStoredAttempts(allAttempts);
          setIsAccountLocked(false);
        } else {
          // Still locked! Block login attempt immediately
          setIsAccountLocked(true);
          return;
        }
      }

      // Check account status
      if (targetProfile) {
        if (targetProfile.archived || targetProfile.status !== 'Active') {
          setErrorMsg('Your account is deactivated. Contact the admin to activate it.');
          return;
        }
        loginEmail = targetProfile.email || (loginEmail.includes('@') ? loginEmail : `${loginEmail}@bustos.gov.ph`);
      } else if (!loginEmail.includes('@')) {
        loginEmail = `${loginEmail}@bustos.gov.ph`;
      }

      // 3. Perform Supabase authentication
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      if (authError || !authData.user) {
        // Increment the failed attempt counter
        const currentAttempts = (allAttempts[usernameKey] || 0) + 1;
        const remaining = MAX_ATTEMPTS - currentAttempts;

        if (currentAttempts >= MAX_ATTEMPTS) {
          // Max attempts reached — lock account
          allAttempts[usernameKey] = currentAttempts;
          setStoredAttempts(allAttempts);

          // Invoke secure database function to lock the account (bypasses RLS)
          try {
            await supabase.rpc('lock_account', { account_identifier: username.trim() });
          } catch (rpcErr) {
            console.warn('RPC lock_account call failed:', rpcErr);
          }

          // Fallback direct update attempt
          try {
            await supabase
              .from('profiles')
              .update({ is_locked: true, updated_at: new Date().toISOString() })
              .or(`username.ilike.${username.trim()},email.ilike.${username.trim()}`);
          } catch (dbErr) {
            console.warn('Direct lock update failed:', dbErr);
          }

          setIsAccountLocked(true);
        } else {
          allAttempts[usernameKey] = currentAttempts;
          setStoredAttempts(allAttempts);
          if (remaining === 1) {
            setErrorMsg(`Incorrect username or password. This is your last attempt. Your account will be locked on the next failed login.`);
          } else {
            setErrorMsg(`Incorrect username or password. You have ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
          }
        }
        return;
      }

      // 4. Successful auth — fetch profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setErrorMsg('Could not load your profile. Contact the admin.');
        return;
      }

      // 5. Verify account is not locked
      if (profile.is_locked) {
        await supabase.auth.signOut();
        allAttempts[usernameKey] = MAX_ATTEMPTS;
        setStoredAttempts(allAttempts);
        setIsAccountLocked(true);
        return;
      }

      // If user had reached max attempts locally and didn't have must_change_password
      if (isLocallyLocked && !profile.must_change_password) {
        await supabase.auth.signOut();
        setIsAccountLocked(true);
        return;
      }

      if (profile.archived || profile.status !== 'Active') {
        await supabase.auth.signOut();
        setErrorMsg('Your account is deactivated. Contact the admin to activate it.');
        return;
      }

      // Successful login — clear attempt counter for this user
      delete allAttempts[usernameKey];
      setStoredAttempts(allAttempts);

      localStorage.setItem('popdev_user', JSON.stringify({ ...profile }));
      navigate('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg('An error occurred during login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Shared background layers */}
      <div className="bg-image" />
      <div className="overlay" />

      {/* Back button */}
      <Link to="/" className="back-btn">← Back to Home</Link>

      <div className="login-container">
        {/* Logos */}
        <header className="login-logos">
          <img src="/bustos-logo.png" alt="Bustos Logo" className="login-logo" />
          <img src="/bp-logo.png" alt="Bagong Pilipinas" className="login-logo" />
          <img src="/popdev-logo.png" alt="Commission on Population" className="login-logo" />
        </header>

        {/* Login Card */}
        <div className="login-card">
          {/* Left (blue) panel */}
          <div className="card-left">
            <h1>Authorized Access</h1>
            <p>
              Please sign in using your authorized account to access the
              Bustos Population Development System.
            </p>
          </div>

          {/* Right (form) panel */}
          <div className="card-right">
            <h2>Login</h2>
            <p className="login-instruction">Please log in with your official credentials.</p>

            {isAccountLocked && (
              <div className="login-locked-msg">
                <div className="login-locked-icon">🔒</div>
                <div className="login-locked-text">
                  <strong>Account Temporarily Locked</strong>
                  <p>
                    This account has been locked due to too many failed login attempts.
                    Please contact the administrator to reset your account and password.
                    Once the admin provides you a new password, log in with it to set your own.
                  </p>
                </div>
              </div>
            )}
            {!isAccountLocked && errorMsg && (
              <div className="login-error-msg">{errorMsg}</div>
            )}

            <form id="loginForm" onSubmit={handleLogin}>
              <div className="login-input-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUsername(val);
                    setErrorMsg('');
                    const attempts = getStoredAttempts()[val.trim().toLowerCase()] || 0;
                    if (attempts >= MAX_ATTEMPTS) {
                      setIsAccountLocked(true);
                    } else if (isAccountLocked) {
                      setIsAccountLocked(false);
                    }
                  }}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="login-input-group">
                <label htmlFor="password">Password</label>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className={`btn-login-submit ${isLoading ? 'loading' : ''}`} id="loginSubmitBtn" disabled={isLoading}>
                {isLoading ? 'Authenticating...' : 'Login'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <footer className="login-footer">
          <p>© 2026 Bustos Population Development System</p>
          <p>Developed by BS Information Technology Students – Bulacan State University</p>
        </footer>
      </div>
    </div>
  );
}
