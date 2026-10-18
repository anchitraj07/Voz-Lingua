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

  const apply = useCallback((d) => { setCsrf(d?.csrf ?? null); setUser(d?.user ?? null); }, []);
  useEffect(() => { api('/auth/me').then(apply).catch(() => apply(null)).finally(() => setLoading(false)); }, [apply]);

  const login = async (email, password) => { apply(await api('/auth/login', { method: 'POST', body: { email, password } })); };
  const signup = async (form) => { apply(await api('/auth/signup', { method: 'POST', body: form })); };
  const logout = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch { /* already logged out */ } apply(null); };
  const forgetSession = () => apply(null);

  return <Ctx.Provider value={{ user, loading, login, signup, logout, setUser, forgetSession }}>{children}</Ctx.Provider>;
}
