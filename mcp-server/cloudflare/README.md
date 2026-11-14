# My Hub MCP — Cloudflare deployment

The shared MCP functionality is extracted from the Cloudflare entrypoint:

- `src/core/types.ts`: nine content kinds, paths, and `EntryStorage` interface.
- `src/core/tools.ts`: generic MCP tool registrations, independent of storage and hosting.
- `src/core/demo-tools.ts`: public demo catalog tools.
- `src/storage/github.ts`: repository adapter using GitHub Contents API.
- `src/admin.ts`: MCP composition and legacy bearer auth.
- `src/oauth.ts`, `src/phone-approval.ts`, `src/index.ts`: Cloudflare-specific OAuth, phone approval, and HTTP routing.

## Endpoints

- `/health`: public health check.
- `/mcp`: unauthenticated, static demo tools `list_skills`, `search_skills`, `get_skill`.
- `/mcp-secure`: authenticated live GitHub-backed tools.
- `/mcp-admin`: optional legacy bearer-protected endpoint, if `MCP_ADMIN_TOKEN` is installed.

## Secure tools

The compact API has six generic tools: `list_entries`, `get_entry`, `search_entries`, `create_entry`, `update_entry`, `delete_entry`. A seventh helper, `get_hub_guide`, returns `AGENTS.md`.

Each entry tool accepts `kind` from skill, note, mode, plan, task, procedure, knowledge, workflow, or script. Search matches **names and paths**, not full text or semantic similarity. Create/update tools are only registered with `hub:write`, and delete only with `hub:delete`. Updating/deleting requires `expected_sha` for optimistic concurrency.

Clients relying on former kind-specific tools (`get_note`, `list_skills` on the secure endpoint, etc.) need to refresh tool discovery and use generic equivalents. The public demo API remains unchanged.

## Deployment

Source: `leferlin/my-hub`, branch `deploy/my-hub-mcp` after review. Root: `mcp-server/cloudflare`. Worker: `my-hub-mcp`.

```sh
cd mcp-server/cloudflare
npm install
npm run build:catalog
npm run check
npm run deploy
```

Set Cloudflare secrets `GITHUB_TOKEN` (PAT for `leferlin/my-hub`, Contents read/write), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. Optional `MCP_ADMIN_TOKEN` is for the legacy admin route; never share it with untrusted clients.

Wrangler variables include `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `ALLOWED_GITHUB_USER_ID`, `ENABLE_OAUTH`, and `ENABLE_PHONE_APPROVAL`. `OAUTH_KV` provides OAuth state. Do not commit secrets.

**Release gate:** typecheck, public health/demo, authenticated list/get, create/update with SHA, and OAuth scope checks. Keep the currently deployed Worker untouched until these pass.
