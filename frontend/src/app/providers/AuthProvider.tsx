import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from 'react';
import { getCurrentUser } from '../../services/authService';
import type { AuthUser } from '../../types/domain';

export interface AuthContextValue {
  user: AuthUser | null;
  setUser: Dispatch<SetStateAction<AuthUser | null>>;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
  loading: true,
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // The access token lives in an httpOnly cookie, so a hard refresh loses this
  // in-memory `user` unless we rehydrate it from the still-valid session cookie.
  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((res) => {
        if (!cancelled) setUser(res.data?.data?.user ?? null);
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

  const value = useMemo<AuthContextValue>(() => ({ user, setUser, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
