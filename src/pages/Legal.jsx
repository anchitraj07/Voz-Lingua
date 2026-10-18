import { Link } from '../router.jsx';

const DOCS = {
  terms: ['Terms of Service', [
    ['Using VOZ LINGUA', 'VOZ LINGUA provides live online French classes. By creating an account you agree to use the service lawfully and to keep your login details private.'],
    ['Plans and booking', 'A plan must be active before you can book classes. Plans, prices and schedules may change; changes are shown in your dashboard before they apply.'],
    ['Cancellations', 'You can cancel a booked class up to the notice period shown in your dashboard. Classes cancelled later, or missed, may count as attended.'],
    ['Accounts', 'We may suspend accounts that misuse the service. You can delete your account at any time from Profile.'],
  ]],
  privacy: ['Privacy Policy', [
    ['What we collect', 'Your name, email, optional phone number, French level, timezone, plan selections and class bookings/attendance. Enquiry-form details are stored so we can contact you.'],
    ['How we use it', 'To run your classes, schedule sessions in your timezone and respond to enquiries. We do not sell your data.'],
    ['Security', 'Passwords are hashed and never stored in plain text. Sessions use secure cookies.'],
    ['Your choices', 'You can edit your details or permanently delete your account and bookings from Profile, or contact us on WhatsApp.'],
  ]],
};

export default function Legal({ kind }) {
  const [title, sections] = DOCS[kind];
  return (
    <div className="legal">
      <Link to="/" className="brand"><img src="/logo.svg" alt="" className="brand-logo" /><span>VOZ <em>LINGUA</em></span></Link>
      <h1>{title}</h1>
      <p className="muted small">Plain-language summary. Have this reviewed by a legal professional before launch.</p>
      {sections.map(([h, t]) => <section key={h}><h3>{h}</h3><p>{t}</p></section>)}
      <Link to="/" className="primary">Back to home</Link>
    </div>
  );
}
