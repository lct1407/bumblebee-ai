# Google OAuth setup

How operators wire "Sign in with Google" into a Bumblebee deployment. End users see a Google button on `/login` + `/register` — but the button only works when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are configured.

## 1. Create OAuth client in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Project → select or create
3. **OAuth consent screen** → External → fill in:
   - App name: `Bumblebee` (or your branding)
   - User support email: ops@example.com
   - Authorized domains: `bumblebee.example.com`
   - Scopes: `openid` · `email` · `profile`
4. **Credentials** → **Create credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Authorized redirect URIs (add both):
   - `http://localhost:8000/api/auth/google/callback` (dev)
   - `https://api.bumblebee.example.com/api/auth/google/callback` (prod)
7. Click **Create** — copy the **Client ID** and **Client Secret**

## 2. Add to `.env`

```env
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REDIRECT_URL=http://localhost:8000/api/auth/google/callback
WEB_BASE_URL=http://localhost:3000
```

Restart the API server.

## 3. Test the flow

1. Open `/login` → click **Sign in with Google**
2. Choose a Google account → consent
3. Get redirected back to `/auth/google/complete` with JWT in URL fragment
4. Landed on `/dashboard` (or `/onboard` if first time)

## 4. Account linking behavior

When a user signs in with Google:

| Existing user? | Result |
|---|---|
| No account with this email | Create new user + workspace, `oauth_provider=google` |
| Account exists, no OAuth linked | Link Google identity to existing email account |
| Account exists, already linked to Google | Just sign in |
| Account linked to a different Google sub | Reject (account mismatch) |

The decision tree lives in `bumblebee/routers/oauth_google.py::google_callback`.

## 5. Security notes

- **CSRF**: a random `state` token is generated server-side, tracked in-memory, and verified on callback. Production: persist to Redis with TTL.
- **Token in URL fragment**: the JWT is passed back via `#token=...` hash — fragments are never sent to the server, so the token doesn't leak to access logs.
- **Account takeover**: linking by email allows takeover if a user controls an email that's already registered. Mitigation: send a confirmation email before linking (Phase B-future).
- **Refresh tokens**: we request `access_type=offline` but don't currently store the refresh token. Re-consent required after the access token expires.
- **PII**: name + avatar URL are stored from the Google profile. User can clear via `Settings → Profile` (TBD).

## 6. Production checklist

- [ ] Set `GOOGLE_OAUTH_REDIRECT_URL` to the HTTPS prod URL
- [ ] Set `WEB_BASE_URL` to the HTTPS prod web URL
- [ ] Verify domain ownership in Google Search Console
- [ ] Complete OAuth consent screen verification (Google review, ~3-5 business days)
- [ ] Move CSRF state from in-memory to Redis
- [ ] Add per-email rate limit on `/api/auth/google/start` (Phase B-future)

## Troubleshooting

| Error | Fix |
|---|---|
| `google_oauth_not_configured` | Check both env vars are set + restart API |
| `invalid_or_expired_state` | User took >10 min between Start and Callback, or server restarted (in-memory state lost). Retry. |
| `redirect_uri_mismatch` (from Google) | The `GOOGLE_OAUTH_REDIRECT_URL` in `.env` doesn't match what's registered in Cloud Console. They must be byte-identical including trailing slash. |
| `token_exchange_failed` | Client secret wrong, or auth code already used. Re-issue. |
| `account_mismatch` | The email is already linked to a different Google sub. Sign in with the original Google account, or contact support. |
