# OAuth setup — Personal Hub

## Objective

Allow ChatGPT, Claude, and VS Code to authenticate to the MCP server without receiving GitHub repository credentials. The Worker must validate each user's identity and scopes before reading or writing files via the GitHub API.

## Planned routes (not implemented yet)

- Authenticated MCP: `https://personal-hub.leandroferlin5.workers.dev/mcp-secure`
- OAuth authorization: `https://personal-hub.leandroferlin5.workers.dev/authorize`
- GitHub identity callback: `https://personal-hub.leandroferlin5.workers.dev/callback`

Keep the existing public `/mcp` demo endpoint unchanged until OAuth has been fully implemented and tested.

## GitHub OAuth App setup

Open https://github.com/settings/developers → OAuth Apps → New OAuth App.

- Application name: `Personal Hub MCP`
- Homepage URL: `https://personal-hub.leandroferlin5.workers.dev`
- Authorization callback URL: `https://personal-hub.leandroferlin5.workers.dev/callback`

The callback belongs to the Worker, not directly to VS Code or ChatGPT.

GitHub provides a Client ID (not secret) and a Client Secret (secret). Store the secret only through Cloudflare Workers → Settings → Variables and Secrets. Never share OAuth secrets, access tokens, or authorization codes in chat.

## Remaining implementation tasks

1. Integrate `@cloudflare/workers-oauth-provider` with appropriate persistent storage, OAuth discovery, PKCE, and a consent page.
2. Validate the GitHub user identity against an explicit allowlist. Do not trust display names or agent instructions.
3. Define `hub:read`, `hub:write`, and `hub:delete` scopes; grant write/delete only with explicit authorization.
4. Separate GitHub login identity from repository access credentials (GitHub App installation token or a fine-grained token restricted to this repository).
5. Implement dynamic GitHub reads and verify end-to-end CRUD for skills, notes, and modes.
6. Audit sensitive logs and test CSRF protection, cookies, redirect URIs, token issuance, expiry, and client consent.
7. Retire the static admin endpoint after the replacement has been validated.

## Security notes

GitHub login establishes identity; it does **not** by itself authorize repository writes. `/mcp-admin` remains separate and requires private credentials. Never configure public access to private content. Existing dummy files are test fixtures only.
