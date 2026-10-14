import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useSession } from "../context/SessionContext";

export default function ProtectedRoute({ children, allowedRoles }) {
  const { session, loading: sessionLoading, redirecting } = useSession();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkProfile(currentSession) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('must_change_password, role')
        .eq('id', currentSession.user.id)
        .single();

      if (!active) return;

      if (profile?.must_change_password) {
        setMustChangePassword(true);
      }

      if (allowedRoles) {
        const storedUser = localStorage.getItem('popdev_user');
        if (profile && !allowedRoles.includes(profile.role)) {
          setHasAccess(false);
        } else if (storedUser) {
          try {
            const userProfile = JSON.parse(storedUser);
            if (!allowedRoles.includes(userProfile.role)) {
              setHasAccess(false);
            }
          } catch (e) {
            setHasAccess(false);
          }
        } else {
          setHasAccess(false);
        }
      }

      setLoading(false);
    }

    if (session) {
      checkProfile(session);
    } else if (!sessionLoading) {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [session, sessionLoading, allowedRoles]);

  // The session provider owns the redirect for any provider-initiated logout
  // (idle timeout or manual). Rendering nothing here stops this route from
  // racing it with a generic "please log in first" message.
  if (redirecting) return null;

  if (loading || sessionLoading) return <h2>Loading...</h2>;

  if (!session) {
    return <Navigate to="/login" state={{ message: 'Please log in first to access this page.' }} replace />;
  }

  if (mustChangePassword) {
    return <Navigate to="/force-password-change" replace />;
  }

  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}