import { useState } from 'react';
import { Eye, EyeOff, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link, useRouter } from '../router.jsx';
import { useAuth } from '../auth.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';
import { LEVELS, browserTz } from '../lib/time.js';

const rules = (pw) => [
  ['10+ characters', pw.length >= 10],
  ['A letter', /[A-Za-z]/.test(pw)],
  ['A number', /[0-9]/.test(pw)],
];

export default function AuthPage({ mode }) {
  const signup = mode === 'signup';
  const { login, signup: doSignup } = useAuth();
  const { navigate } = useRouter();
  const [f, setF] = useState({ name: '', email: '', phone: '', level: 'A0', password: '', acceptTerms: false });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (signup) await doSignup({ ...f, timezone: browserTz() });
      else await login(f.email, f.password);
      navigate('/app', { replace: true }); // admins are redirected onward by the router
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <div className="auth-page">
      <aside className="auth-side">
        <Link to="/" className="brand light"><img src="/logo.svg" alt="" className="brand-logo" /><span>VOZ <em>LINGUA</em></span></Link>
        <h1>{signup ? 'Begin your French journey.' : 'Bon retour !'}</h1>
        <p>{signup
          ? 'Create your free student account to choose a plan, pick your class days and time slots, and track every class in one calendar.'
          : 'Log in to see your upcoming classes, book new slots and track your progress.'}</p>
        <ul>
          <li><ShieldCheck size={16} /> Your data is encrypted in transit and passwords are never stored in plain text</li>
        </ul>
      </aside>

      <main className="auth-main">
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to website</Link>
        <form className="auth-card" onSubmit={submit} noValidate={false}>
          <h2>{signup ? 'Create your account' : 'Log in'}</h2>
          <ErrorBox msg={err} />
          {signup && <Field label="Full name"><input required minLength={2} maxLength={80} value={f.name} onChange={set('name')} autoComplete="name" /></Field>}
          <Field label="Email"><input required type="email" maxLength={254} value={f.email} onChange={set('email')} autoComplete="email" /></Field>
          {signup && (
            <div className="two">
              <Field label="Phone (optional)"><input type="tel" maxLength={20} value={f.phone} onChange={set('phone')} autoComplete="tel" /></Field>
              <Field label="Your French level">
                <select value={f.level} onChange={set('level')}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </Field>
            </div>
          )}
          <Field label="Password">
            <div className="pw-wrap">
              <input required type={show ? 'text' : 'password'} maxLength={128} value={f.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} />
              <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </Field>
          {signup && (
            <>
              <div className="pw-rules">{rules(f.password).map(([t, ok]) => <span key={t} className={ok ? 'ok' : ''}>{ok ? '✓' : '•'} {t}</span>)}</div>
              <label className="check"><input type="checkbox" checked={f.acceptTerms} onChange={set('acceptTerms')} required /> <span>I agree to the <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link></span></label>
            </>
          )}
          <button className="primary full" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}</button>
          <p className="switch">{signup ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New to VOZ LINGUA? <Link to="/signup">Create an account</Link></>}</p>
        </form>
      </main>
    </div>
  );
}
