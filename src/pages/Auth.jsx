import { useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link } from '../router.jsx';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field } from '../components/ui.jsx';

const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1'];

export default function AuthPage({ mode }) {
  const signup = mode === 'signup';
  const { login, signup: doSignup, keycloak } = useAuth();
  const [f, setF] = useState({ name: '', email: '', phone: '', level: 'A0', password: '' });
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [err, setErr] = useState(new URLSearchParams(window.location.search).get('auth') === 'failed'
    ? 'Sign-in or signup could not be completed. Please try again.'
    : '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (signup) await doSignup({ acceptTerms, ...f });
      else await login({ email: f.email, password: f.password });
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  const terms = (
    <label className="check"><input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} required /> <span>I agree to the <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link></span></label>
  );

  return (
    <div className="auth-page">
      <aside className="auth-side">
        <Link to="/" className="brand light"><img src="/logo.svg" alt="" className="brand-logo" /><span>VOZ <em>LINGUA</em></span></Link>
        <h1>{signup ? 'Begin your French journey.' : 'Bon retour !'}</h1>
        <p>{signup
          ? 'Create your account securely with VOZ LINGUA to choose a plan, book classes and track your progress.'
          : 'Sign in securely to see your upcoming classes, book new slots and track your progress.'}</p>
        <ul>
          <li><ShieldCheck size={16} /> {keycloak ? 'Keycloak manages your password; VOZ LINGUA never receives or stores it' : 'Your password is stored only as a salted hash'}</li>
        </ul>
      </aside>

      <main className="auth-main">
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to website</Link>
        <form className="auth-card" onSubmit={submit} noValidate={false}>
          <h2>{signup ? 'Create your account' : 'Log in'}</h2>
          <ErrorBox msg={err} />
          {keycloak ? (
            <>
              <p>{signup
                ? 'You’ll continue to Keycloak. Choose Register there to create your account securely.'
                : 'You’ll continue to Keycloak to sign in.'}</p>
              {signup && terms}
              <button className="primary full" disabled={busy || (signup && !acceptTerms)}>{busy ? 'Please wait…' : signup ? 'Continue to secure signup' : 'Continue to secure login'}</button>
            </>
          ) : (
            <>
              {signup && <Field label="Full name"><input value={f.name} onChange={set('name')} autoComplete="name" required minLength={2} maxLength={80} /></Field>}
              <Field label="Email"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
              {signup && <Field label="Phone (optional)"><input type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>}
              {signup && <Field label="Your French level"><select value={f.level} onChange={set('level')}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>}
              <Field label="Password" hint={signup ? 'At least 10 characters, with letters and numbers.' : undefined}>
                <input type="password" value={f.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 10 : 1} />
              </Field>
              {signup && terms}
              <button className="primary full" disabled={busy || (signup && !acceptTerms)}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}</button>
            </>
          )}
          <p className="switch">{signup ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New to VOZ LINGUA? <Link to="/signup">Create an account</Link></>}</p>
        </form>
      </main>
    </div>
  );
}
