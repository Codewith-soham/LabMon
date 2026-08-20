import { createContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../../services/authService';

export const AuthContext = createContext({
  user: null,
  setUser: () => {},
  loading: true,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // The access token lives in an httpOnly cookie, so a hard refresh loses this
  // in-memory `user` unless we rehydrate it from the still-valid session cookie.
  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((res) => {
        if (!cancelled) setUser(res.data?.data?.user || null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ user, setUser, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
