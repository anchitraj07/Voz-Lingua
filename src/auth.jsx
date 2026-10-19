/**
 * AUTH ADAPTER — the only frontend file that knows how users sign in.
 * To use your own sign-in/sign-up, keep this context's shape and change what
 * login/signup/logout/me do:  { user: {id,name,email,role:'student'|'admin',level,timezone,phone}, loading, login, signup, logout, setUser, forgetSession }
 * Pages (Dashboard, Admin, route guards in main.jsx) only read `useAuth()`.
 * Backend counterpart: loadSession() in server/http.js (see README → "Bring your own auth").
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setCsrf } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [keycloak, setKeycloak] = useState(null); // null = still checking, true/false once known

  const apply = useCallback((d) => { setCsrf(d?.csrf ?? null); setUser(d?.user ?? null); }, []);
  useEffect(() => {
    api('/auth/keycloak/status').then((d) => setKeycloak(Boolean(d.enabled))).catch(() => setKeycloak(false));
    api('/auth/me').then(apply).catch(() => apply(null)).finally(() => setLoading(false));
  }, [apply]);

  // Keycloak mode: redirect to the hosted login. Local mode: email + password straight to the API.
  const login = async ({ email, password } = {}) => {
    if (keycloak) { window.location.assign('/api/auth/keycloak/start?mode=login'); return; }
    apply(await api('/auth/login', { method: 'POST', body: { email, password } }));
  };
  const signup = async ({ acceptTerms, name, email, phone, level, password } = {}) => {
    if (!acceptTerms) throw new Error('Please accept the Terms of Service and Privacy Policy before signing up.');
    if (keycloak) { window.location.assign('/api/auth/keycloak/start?mode=signup&terms=1'); return; }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    apply(await api('/auth/signup', { method: 'POST', body: { name, email, phone, level, password, acceptTerms: true, timezone } }));
  };
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* the local session may already be expired */ }
    apply(null);
    if (keycloak) window.location.assign('/api/auth/keycloak/logout');
  };
  const forgetSession = () => apply(null);

  return <Ctx.Provider value={{ user, loading, keycloak, login, signup, logout, setUser, forgetSession }}>{children}</Ctx.Provider>;
}
