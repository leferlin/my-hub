# Personal Hub — OAuth 2.1 setup

## Status

The OAuth implementation is committed in `src/oauth.ts` and routed from `src/index.ts`. It is **disabled by default** and has not yet passed a live OAuth login or write test. The original `/mcp` demo endpoint remains unchanged.

- OAuth-protected MCP: `https://personal-hub.leandroferlin5.workers.dev/mcp-secure`
- Consent URL: `https://personal-hub.leandroferlin5.workers.dev/authorize`
- Identity callback: `https://personal-hub.leandroferlin5.workers.dev/callback`
- Token endpoint (owned by library): `/oauth/token`
- Client registration (owned by library): `/oauth/register`
- OAuth discovery: `/.well-known/...` (owned by library)

The Worker is its **own OAuth authorization server** for MCP clients; GitHub is only its initial identity provider. The user is mapped to internal `user-001` after validating a stable GitHub numeric ID. The GitHub identity token is discarded after login.

## 1. Create a GitHub OAuth App (for identity only)

Open https://github.com/settings/developers → OAuth Apps → New OAuth App.

- Application name: `Personal Hub MCP`
- Homepage URL: `https://personal-hub.leandroferlin5.workers.dev`
- Authorization callback URL: `https://personal-hub.leandroferlin5.workers.dev/callback`

The OAuth App should request no repository scopes. It is only used to verify the owner identity. Record the Client ID and generate a Client Secret. **Never put secrets in Git, a message, or a screenshot.**

## 2. Configure Cloudflare KV

Cloudflare Dashboard → Storage & databases → KV → Create namespace: `PERSONAL_HUB_OAUTH`.

Copy the namespace ID. Edit `mcp-server/cloudflare/wrangler.jsonc` and add:

```jsonc
"kv_namespaces": [
  { "binding": "OAUTH_KV", "id": "YOUR_CLOUDFLARE_KV_NAMESPACE_ID" }
]
```

Use your actual namespace ID. The OAuth library needs the Worker binding named **exactly** `OAUTH_KV`. Do not enable OAuth before this binding is deployed.

## 3. Configure Cloudflare environment variables and secrets

Cloudflare → Workers & Pages → personal-hub → Settings → Variables and Secrets.

Set these **secrets**:

- `GITHUB_CLIENT_ID` — GitHub OAuth App Client ID.
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App Client Secret.
- `GITHUB_TOKEN` — separate *fine-grained* token limited to `leandroferlin5/personal-hub`, permission **Contents: Read and write**. This is the temporary MVP repository credential; later replace with a GitHub App installation token.

Set this **variable**:

- `ALLOWED_GITHUB_USER_ID` — the stable numeric GitHub user ID of the repository owner. You can get it from GitHub's `/user` API while authenticated.
- `ENABLE_OAUTH` — leave unset or `false` until prerequisites and build are verified.

Never reuse the GitHub login token as the repository token. Never expose `GITHUB_TOKEN` through MCP responses.

## 4. Verify before enabling

1. Make sure the Cloudflare deployment compiles successfully after adding `@cloudflare/workers-oauth-provider`.
2. Bind `OAUTH_KV` and deploy.
3. Set credentials and allowlisted numeric GitHub user ID.
4. Change `ENABLE_OAUTH` to `true` and deploy.
5. Confirm `GET /health` reports `oauthEnabled: true`.
6. An unauthenticated MCP request to `/mcp-secure` should return HTTP 401 and OAuth discovery.
7. Connect an MCP client; verify the consent screen shows the correct client, redirect host, and requested scopes.
8. Authenticate with GitHub and verify a non-allowlisted user is rejected.
9. Obtain `hub:read`, then test `list_entries` and `get_entry` using the MCP client.
10. Grant `hub:write`, run `create_note` with a dummy entry, confirm the GitHub commit, then test update/delete scopes separately.
11. Confirm no private repository content appears through the public `/mcp` endpoint.

## Scope policy

- `hub:read`: list/read entries.
- `hub:write`: create/update entries (also requires `hub:read`).
- `hub:delete`: delete entries (also requires `hub:read`).
- `offline_access`: request refresh-token support when the client supports it.

OAuth consent is per client and should be reviewed carefully. The SDK handles token issuance, discovery, client registration, and refresh token rotation, while the app handles GitHub sign-in and consent.

## Important limitation for a corporate laptop

This version uses standard **browser-based OAuth authorization**. It does **not** implement the OAuth Device Authorization Grant or phone approval. If the laptop cannot log in to GitHub, this flow alone will not solve that problem. We can add device authorization or passkey login later, subject to MCP client support and corporate security policy.

## Security / operations

- The new OAuth code is an untested MVP, not a production security guarantee.
- Do not enable write access with real personal content before validation.
- The existing static `/mcp-admin` endpoint remains separate for now. Retire it after secure OAuth migration.
- Review consent, scope enforcement, cookie security, and token refresh behavior before wider deployment.

## Optional: approve a desktop OAuth request from your phone (pilot)

The code in `src/phone-approval.ts` implements **browser-mediated cross-device approval** for normal VS Code OAuth + PKCE, without requiring VS Code to support RFC 8628 device grants.

**Status:** committed but disabled by default. The code has not yet passed build verification or a live phone-to-desktop login test. Do not enable until the current OAuth connection and Worker deployment have been checked.

When eventually enabled, set `ENABLE_PHONE_APPROVAL = "true"` in Wrangler `vars` (not a secret) and deploy. The `ENABLE_OAUTH` flag must also remain enabled.

Expected flow:

1. On the laptop, add/start the existing `/mcp-secure` connection in VS Code. Keep its initial Personal Hub consent page open.
2. Instead of the normal **Approve** button, use the **Approve from your personal phone** option. The page displays a four-character pairing identifier (32-character alphabet), valid for 10 minutes.
3. Open `https://personal-hub.leandroferlin5.workers.dev/phone` on your phone. Type the pairing code.
4. Review the requesting client, callback destination, and scopes on the phone. Choose **Authenticate with GitHub and approve**, using the allowlisted personal GitHub account.
5. On successful GitHub callback, the phone displays an approval confirmation. GitHub's identity token is discarded.
6. On the original laptop consent page, select **I approved on my phone — finish on this computer**. The Worker validates the approved pairing code AND the original laptop's consent cookie before issuing the usual OAuth authorization code to VS Code, which redeems it with PKCE.

Technical properties:
- The laptop still uses the normal OAuth authorization code/PKCE flow; VS Code requires no plugin or device-grant support.
- No GitHub password, GitHub token, Personal Hub token, or authorization code is transferred between phone and laptop.
- Pairing identifiers are four characters long (20 bits of entropy), stored with a short TTL in `OAUTH_KV`. Code lookups have best-effort per-IP throttling (five lookups per 10 minutes), though KV counters are not atomic and are not a substitute for edge rate limiting. The GitHub callback uses its own one-time `state` and browser-bound cookie.
- Only the configured numeric `ALLOWED_GITHUB_USER_ID` can authorize; the laptop must also possess its original browser-bound consent cookie.
- Phone approval grants exactly the scopes shown on the pairing page. It does not expand the client's requested permissions.
- This implementation intentionally keeps consent before the identity-provider redirect, following Cloudflare's shared-upstream OAuth guidance.
- A successful pair does not automatically finish the laptop flow: the user must click the completion button on the original laptop page.
- This is **not** a standard RFC 8628 Device Authorization Grant and does not work if the company also blocks Personal Hub or forbids external MCP connections.

Security caveats / verification plan:
- Validate `npm run check` and `npm run deploy` before enabling the pilot.
- Confirm ordinary ChatGPT OAuth still works when the pilot is disabled.
- Confirm pairing expiration, guessing rate limits, and accidental collision handling; verify a different GitHub account cannot approve. For production-grade protection, add Cloudflare edge rate limiting / Turnstile and monitor abuse.
- Confirm the phone cannot finish OAuth by itself; the desktop consent cookie and PKCE must be required.
- Confirm the callback only completes when the correct phone browser cookie and `state` match.
- Check Cloudflare Worker logs for OAuth failures without logging sensitive token values.
- Confirm your organization's policies permit this access method. Never use it to evade an explicit company prohibition on personal external services.
