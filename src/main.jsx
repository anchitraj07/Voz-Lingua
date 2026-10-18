import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './app.css';
import { RouterProvider, useRouter, Redirect, Link } from './router.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import Landing from './pages/Landing.jsx';
import AuthPage from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Admin from './pages/Admin.jsx';
import Legal from './pages/Legal.jsx';

function Splash() { return <div className="splash" aria-busy="true">VOZ LINGUA</div>; }

function Root() {
  const { path } = useRouter();
  const { user, loading } = useAuth();

  if (path === '/') return <Landing />;
  if (path === '/terms' || path === '/privacy') return <Legal kind={path.slice(1)} />;
  if (loading) return <Splash />;

  if (path === '/login' || path === '/signup') {
    return user ? <Redirect to={user.role === 'admin' ? '/admin' : '/app'} /> : <AuthPage mode={path === '/signup' ? 'signup' : 'login'} />;
  }
  if (path === '/app' || path.startsWith('/app/')) {
    if (!user) return <Redirect to="/login" />;
    return user.role === 'admin' ? <Redirect to="/admin" /> : <Dashboard />;
  }
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!user) return <Redirect to="/login" />;
    return user.role === 'admin' ? <Admin /> : <Redirect to="/app" />;
  }
  return (
    <div className="splash notfound"><h1>Page not found</h1><Link to="/" className="primary">Back to home</Link></div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider><AuthProvider><Root /></AuthProvider></RouterProvider>
  </React.StrictMode>
);
