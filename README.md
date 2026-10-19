# VOZ LINGUA — complete website, student portal & admin

React 19 + Vite front end, zero-dependency Node backend (built-in `node:sqlite`).
Brand: your real `logo.svg` (orange #EF8A00). WhatsApp hand-off from your original site is kept.

## Run
```bash
npm install
cp .env.example .env     # set ADMIN_EMAIL + ADMIN_PASSWORD
npm run dev              # http://localhost:5173  (API :3001)
npm test                 # server tests
npm run build && npm start   # production: one server serves site + API
```
Needs Node 22.13+. Log in at `/login` with the admin email → `/admin`.

## Keycloak signup and login

The login and signup pages use Keycloak's hosted OIDC flow (Authorization Code + PKCE). In local development, the app defaults to the realm `Voz Lingua`, client `voz-lingua-web`, and site origin `http://localhost:5173`. The Vite development server proxies the OIDC callback to the backend.

In Keycloak, enable **Realm settings → Login → User registration**. For the `voz-lingua-web` client, keep client authentication off, Standard flow on, Direct access grants off, and Require PKCE set to S256. Allow the redirect URI `http://localhost:5173/*`, post-logout URI `http://localhost:5173/*`, and web origin `http://localhost:5173` for local development only.

The backend validates the OIDC response and stores each Keycloak subject in `external_identities`, linked to the user's row in `data/voz-lingua.db`. New local profiles get student role, level A0, and the academy timezone by default. The app does not store Keycloak passwords. Existing local accounts can be linked only when Keycloak reports a verified matching email.

For production, set `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_CLIENT_ID`, and `APP_ORIGIN` in the server environment, then add the exact production callback (`APP_ORIGIN` + `/api/auth/keycloak/callback`), post-logout origin, and web origin to the Keycloak client. Serve both the site and API over HTTPS. Configure Keycloak SMTP and email verification, and leave `KEYCLOAK_REQUIRE_VERIFIED_EMAIL` unset or set it to `1`. Never enable Direct access grants for this flow.

## Pages
`/` landing (programs, levels, method, FAQ, demo form → DB + WhatsApp) · `/terms` `/privacy` · `/login` `/signup` · `/app/*` student portal · `/admin/*` admin.

## What came from where
| From | Kept |
|---|---|
| `Voz-Lingua.zip` | logo, QR files, WhatsApp number & hand-off, brand colours |
| `voz-lingua.zip` | everything else: portal, admin, booking, scheduling, backend, security |
| New | real logo in every header, floating WhatsApp button, Terms/Privacy pages, favicon & share metadata, `src/config.js` |

Dropped on purpose: the Netlify push-notification functions (this build runs on Node, not Netlify; new enquiries appear in **Admin → Enquiries**).

## Bring your own auth
Two seams only:
1. **Frontend:** `src/auth.jsx` (contract documented at the top) and `src/pages/Auth.jsx` (the login/signup screen).
2. **Backend:** `loadSession()` in `server/http.js` — return `{ hash, csrf, user:{id,role,...} }` for a valid request, else `null`. Map your identity to a row in `users` (role `student`/`admin`). Remove `server/routes/auth.js` routes you no longer need.
Keep CSRF + Origin checks for cookie-based auth; if you move to bearer tokens, drop the cookie/CSRF bits.

## Before launch
- Set `ALLOWED_ORIGINS`, `TRUST_PROXY=1`, HTTPS; back up `data/voz-lingua.db`.
- Payments (plans are approved manually), password reset/email verification — not built.
- Have `/terms` and `/privacy` reviewed by a legal professional.
- `public/vozlingua-qr.png` is included but not shown on the site (its target URL couldn't be verified).
