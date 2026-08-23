# Authentication — Design Spec

Date: 2026-08-23
Branch: `feature/authentication`
Phase: 2 of the product roadmap (`docs/PRODUCT_REQUIREMENTS.md`)

## Context

Phase 1 (`feature/project-foundation`, merged in PR #1) built the backend/frontend
skeleton with zero domain logic. This phase adds the first real domain
tables and the first real user-facing flow: email/password registration,
login, session maintenance, and logout. No family/role model yet — that is
Phase 3 (`feature/family-management`). No OAuth, no email verification, no
password reset in this phase.

## Goals

- A user can register with email + password, is logged in immediately.
- A user can log in and log out; sessions persist across page reloads via
  httpOnly cookies (no token handling in frontend JS).
- Access tokens are short-lived and stateless; refresh tokens are
  revocable (stored hashed in the database) so logout actually invalidates
  the session server-side, not just client-side.
- A reusable `get_current_user` FastAPI dependency exists for every later
  phase's protected routes to use.
- Login is rate-limited per email to blunt brute-force guessing.
- The frontend gains real routing (`/login`, `/register`, a protected
  home route) — Phase 1 had none.
- Both languages (ja/vi) cover every new user-facing string from the start.

## Non-goals (explicitly deferred)

- Family/role model, family-scoped authorization (Phase 3).
- OAuth/social login providers.
- Email verification (no email-sending infrastructure exists yet).
- Password reset / forgot-password flow.
- "Log out everywhere" UI (the data model supports revoking a specific
  refresh token; a UI to list/revoke *other* sessions is not built here).
- Account lockout beyond the per-email rate limit (no CAPTCHA, no
  permanent lockout).

## Decided design

### Database

Two new tables, added via Alembic revision `0002` (the first non-empty
migration — `0001` remains the empty baseline from Phase 1):

```
users
  id             UUID, primary key (generated app-side via uuid4(), not a
                 Postgres extension — avoids managing pgcrypto/uuid-ossp)
  email          str, unique, NOT NULL, indexed — always stored lowercased
  password_hash  str, NOT NULL
  display_name   str, NOT NULL
  is_active      bool, NOT NULL, default true
  created_at     timestamptz, NOT NULL, server default now()
  updated_at     timestamptz, NOT NULL, server default now(), onupdate now()

refresh_tokens
  id           UUID, primary key
  user_id      UUID, FK -> users.id (ON DELETE CASCADE), NOT NULL, indexed
  token_hash   str, NOT NULL, indexed — SHA-256 hex digest of the raw
               token; the raw token is never persisted
  expires_at   timestamptz, NOT NULL
  revoked_at   timestamptz, nullable
  created_at   timestamptz, NOT NULL, server default now()
```

`password_hash` and `token_hash` never appear in any API response, log
line, or error message.

### Password hashing

Argon2 (via `argon2-cffi` / `passlib[argon2]`). Minimum password length: 8
characters. No composition rules (no forced uppercase/digit/symbol —
current guidance favors length over composition complexity).

### Token strategy

- **Access token**: JWT, HS256, signed with a new required
  `Settings.jwt_secret_key: str` env var. Claims: `sub` (user id), `exp`,
  `iat`, `type: "access"`. Lifetime: 15 minutes. Verified per-request with
  no database round-trip — a middleware/dependency decodes and validates
  the signature and expiry, then loads the user from the DB by `sub` to
  confirm `is_active` (a deactivated user's still-valid access token is
  rejected).
- **Refresh token**: an opaque random string (`secrets.token_urlsafe(32)`,
  not a JWT). Its SHA-256 hash is stored in `refresh_tokens`; validity is
  checked by DB lookup (exists, not expired, not revoked). Lifetime: 7
  days.
- Both are set as **httpOnly cookies** — the frontend never reads or
  stores a token in JS. `access_token` cookie: path `/`. `refresh_token`
  cookie: path `/api/v1/auth` (covers `/refresh`, `/logout`, `/login`,
  `/register`, `/me` — not a broader path than `/refresh` alone would
  need, but broad enough that `/logout` actually receives it; cookie path
  matching requires the request path to be that path or a subpath of it,
  so scoping it to `/refresh` alone would silently break logout's ability
  to revoke it). It is never sent to non-auth endpoints (`/health`,
  `/api/v1/ping`, or any later family/expense route).
- Cookie flags: `httponly=True`, `samesite="lax"`, `secure=True` only when
  `settings.env == "production"` (allows `http://localhost` in dev).
- `POST /api/v1/auth/refresh` **rotates**: revokes the presented refresh
  token, issues a new access+refresh pair, sets both cookies again. This
  means each refresh token is single-use.
- `POST /api/v1/auth/logout` revokes the current refresh token (sets
  `revoked_at`) and clears both cookies.

### Rate limiting

Redis-backed fixed-window counter (Redis is already provisioned from
Phase 1; no new infra). Key: `login_attempts:{lowercased_email}`.
On each failed `POST /api/v1/auth/login`, increment with a 15-minute TTL.
If the count exceeds 5, return `429` (with a `Retry-After` header) instead
of attempting the password check. Successful login does not reset the
counter early (avoids a timing side-channel that would otherwise let an
attacker distinguish "wrong password" from "rate limited" by whether a
correct guess resets the window) — it simply expires naturally.

### Backend endpoints (`/api/v1/auth`)

| Method | Path | Body | Success | Failure |
|---|---|---|---|---|
| POST | `/register` | `{email, password, display_name}` | 201, sets cookies, returns `{id, email, display_name}` | 409 duplicate email, 422 validation (password too short, invalid email) |
| POST | `/login` | `{email, password}` | 200, sets cookies, returns `{id, email, display_name}` | 401 invalid credentials, 429 rate limited |
| POST | `/refresh` | (reads `refresh_token` cookie) | 200, rotated cookies | 401 missing/expired/revoked refresh token |
| POST | `/logout` | (reads `refresh_token` cookie) | 204, cookies cleared | 401 if no valid session (still clears cookies) |
| GET | `/me` | (reads `access_token` cookie) | 200 `{id, email, display_name}` | 401 missing/expired/invalid access token, or inactive user |

`get_current_user` (a FastAPI dependency wrapping the `/me` logic) is
exported from `app/api/deps.py` so Phase 3+ routes can depend on it
directly.

### Frontend — adds routing

Phase 1's `App.tsx` was a single page with no router. This phase adds
`react-router-dom` and restructures:

```
frontend/src/
  routes/
    LoginPage.tsx
    RegisterPage.tsx
    HomePage.tsx        (Phase 1's App.tsx content, now route-gated)
  auth/
    authApi.ts          (wraps apiClient calls: register/login/logout/me)
    AuthContext.tsx      (holds {user, isLoading}; calls GET /me on mount)
    useAuth.ts           (hook wrapping AuthContext)
    ProtectedRoute.tsx   (redirects to /login if unauthenticated)
    LoginForm.tsx
    RegisterForm.tsx
  App.tsx                (now just the <BrowserRouter> + route table)
```

The generated `apiClient` (Task 10 of Phase 1) needs `credentials:
"include"` added to its `createClient` config so cookies are sent
cross-origin between `localhost:5173` and `localhost:8000` — CORS already
has `allow_credentials=True` from Phase 1, this is the missing
client-side half.

### i18n

New keys added to both `ja/common.json` and `vi/common.json` under an
`auth` namespace: `auth.login`, `auth.register`, `auth.email`,
`auth.password`, `auth.displayName`, `auth.loginButton`,
`auth.registerButton`, `auth.logout`, `auth.invalidCredentials`,
`auth.emailInUse`, `auth.rateLimited`, `auth.passwordTooShort`,
`auth.genericError`. Extend `docs/I18N.md`'s "Current keys" table and
terminology glossary accordingly (add 認証/Xác thực-style terms as
needed — natural translations, not literal).

## Testing plan

Backend (`pytest`):
- Unit: password hash/verify roundtrip (correct password verifies, wrong
  password rejected); JWT create/decode (valid token decodes, expired
  token rejected, tampered signature rejected).
- Integration (real Postgres + Redis): register (success; duplicate email
  → 409); login (success sets both cookies; wrong password → 401; 6th
  failed attempt in the window → 429); refresh (valid token rotates and
  the old token can no longer be reused; expired/revoked → 401); logout
  (revokes the refresh token; a subsequent refresh with the same token
  fails); `/me` (valid session → 200; no cookie → 401; tampered access
  token → 401; deactivated user with a still-valid access token → 401).

Frontend (`vitest` + React Testing Library):
- `AuthContext` fetches `/me` on mount and exposes the resulting user
  (mocking `authApi`, the one sanctioned mock boundary — same pattern as
  Phase 1's `./api/client` mock).
- `LoginForm` submit calls the login API and updates auth state on
  success; shows a translated error on 401.
- `RegisterForm` shows a translated validation error for a too-short
  password without calling the API.
- `ProtectedRoute` redirects to `/login` when `user` is null, renders its
  children when authenticated.

## Security invariants

- `password_hash` and refresh-token raw values never appear in any
  response body, log line, or error message.
- Refresh tokens are stored only as SHA-256 hashes; a database leak does
  not expose usable tokens.
- All auth cookies are httpOnly; `secure` is enforced whenever
  `env == "production"`.
- CORS remains restricted to `settings.cors_origins` (never `*`) — required
  for `allow_credentials=True` to be meaningful.
- Login failures return a generic "invalid credentials" message — never
  reveal whether the email exists.

## Acceptance criteria

- A user can register, and is immediately in a logged-in state (cookies
  set, `/me` returns their profile).
- Refreshing the browser after login keeps the user logged in (session
  persists via httpOnly cookies, verified by a real `GET /me` call on
  page load).
- Logging out, then attempting to use the old refresh token, fails with
  401 — proving server-side revocation actually works, not just cookie
  deletion.
- 6 rapid failed login attempts for the same email return 429 on the 6th.
- No user-facing string in the new frontend code is hardcoded outside the
  i18n system; both `ja` and `vi` locale files are complete.
- `docker compose up` still brings up the full stack cleanly with the new
  migration applied (`alembic upgrade head` reaches `0002`).
- CI (backend + frontend jobs, including the OpenAPI/type-drift checks)
  is green on this branch.
