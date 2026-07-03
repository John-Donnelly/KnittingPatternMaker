import { useEffect, useState } from 'react';

export interface AuthUser {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

export interface AuthStatus {
  /** SSO is configured on the server (show sign-in affordances at all). */
  authEnabled: boolean;
  /** Pattern generation requires a signed-in session. */
  authRequired: boolean;
  authenticated: boolean;
  user?: AuthUser;
}

const AUTH_DISABLED: AuthStatus = {
  authEnabled: false,
  authRequired: false,
  authenticated: false,
};

/** Loads the session/auth state once on mount; null while loading. Errors (e.g. an older
 * backend without auth routes) degrade to "auth disabled" so the app keeps working. */
export function useAuth(): { auth: AuthStatus | null; signOut: () => void } {
  const [auth, setAuth] = useState<AuthStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then((res) => (res.ok ? (res.json() as Promise<AuthStatus>) : AUTH_DISABLED))
      .then((status) => {
        if (!cancelled) setAuth(status);
      })
      .catch(() => {
        if (!cancelled) setAuth(AUTH_DISABLED);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = () => {
    void fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      window.location.assign('/');
    });
  };

  return { auth, signOut };
}
