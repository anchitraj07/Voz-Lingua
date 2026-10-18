import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const Ctx = createContext(null);
const norm = (p) => p.replace(/\/+$/, '') || '/';

export function RouterProvider({ children }) {
  const [path, setPath] = useState(norm(window.location.pathname));
  useEffect(() => {
    const on = () => setPath(norm(window.location.pathname));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
    setPath(norm(window.location.pathname));
    window.scrollTo(0, 0);
  }, []);
  return <Ctx.Provider value={{ path, navigate }}>{children}</Ctx.Provider>;
}
export const useRouter = () => useContext(Ctx);

export function Link({ to, children, onClick, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a href={to} {...rest} onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault(); navigate(to);
    }}>{children}</a>
  );
}

export function Redirect({ to }) {
  const { navigate } = useRouter();
  useEffect(() => { navigate(to, { replace: true }); }, [to, navigate]);
  return null;
}
