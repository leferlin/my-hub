# Personal Hub MCP — Cloudflare Workers

This Cloudflare Worker hosts two separate MCP interfaces. The deployment-specific folder currently contains the runtime implementation; shared business logic may later be extracted to a provider-neutral `core/` directory.

## Endpoints

- `GET /health`: public server status and version.
- `POST /mcp`: public, read-only demo MCP with a build-time skill catalog. Tools: `list_skills`, `search_skills`, `get_skill`.
- `POST /mcp-admin`: protected GitHub-backed MCP for reading/writing skills, notes, and modes. Requires `Authorization: Bearer <MCP_ADMIN_TOKEN>`.

**Do not connect the unauthenticated ChatGPT plugin to `/mcp-admin`.** A proper OAuth flow is still required for ChatGPT and other OAuth-based clients. The current static Bearer header is intended only for explicitly controlled clients that support it.

## Administrative tools

- `list_entries`, `get_entry`, `get_entry_metadata`
- `create_skill`, `update_skill`, `delete_skill`
- `create_note`, `update_note`, `delete_note`
- `create_mode`, `update_mode`, `delete_mode`

Entry paths:
- Skills: `skills/{slug}/SKILL.md`
- Notes: `notes/{slug}.md`
- Modes: `modes/{slug}.md`

Slugs contain lowercase letters, numbers, and hyphens. Markdown content has a 64,000-character limit. Updates and deletions require `expected_sha` for optimistic concurrency. All writes produce Git commits. There is no bulk-delete tool.

## Private Cloudflare configuration

Under **Workers & Pages → personal-hub → Settings → Variables and Secrets**, configure the following as **secrets**, never plaintext variables:

1. `GITHUB_TOKEN`: a fine-grained GitHub token restricted to `leandroferlin5/personal-hub`, with **Contents: Read and write** only.
2. `MCP_ADMIN_TOKEN`: an independent, high-entropy random admin secret (ideally at least 32 bytes).

Without these secrets, `/mcp-admin` responds with HTTP 503. Without a valid Bearer token, it returns HTTP 401.

The admin token authenticates the MCP client to the Worker; the GitHub token authenticates the Worker to GitHub. Do not share either token in chat, Git, screenshots, or logs.

**Next security milestone:** replace the static admin-token model with OAuth 2.1, individual user identity, consent, scopes for read/write/delete, and secure session/token handling.

## Deployment

Cloudflare Git integration:
- Root directory: `mcp-server/cloudflare`
- Build: `npm run build:catalog`
- Deploy: `npx wrangler deploy`

Local setup using Node.js 20+:

```bash
cd mcp-server/cloudflare
npm install
npm run build:catalog
npm run check
npx wrangler dev
```

The public skill catalog is bundled at build time. Entries written by the admin MCP do not appear automatically in `/mcp`. A future OAuth-protected endpoint should read private GitHub content dynamically at runtime.

## Operational safeguards

- Review agent-proposed changes, especially deletions.
- Keep secrets out of the repository.
- Rotate credentials and review access regularly.
- Do not distribute the admin Bearer token to third-party clients.
- This is an MVP and still requires compilation and end-to-end security testing before production use.
