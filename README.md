# My Hub

**My Hub** (formerly Personal Hub) is a private, centralized repository for personal plans, tasks, lists, procedures, knowledge, AI agent skills, workflows, and scripts.

## Repository structure

- `plans/`: goals, plans, and progress
- `notes/`: Markdown notes
- `modes/`: behavioral instructions for agents (e.g., PING and Brief)
- `tasks/`: tasks and checklists
- `procedures/`: repeatable operating procedures
- `knowledge/`: reference notes and documentation
- `workflows/`: workflows and automations
- `skills/`: reusable agent instructions following the Agent Skills convention
- `scripts/`: algorithms and utilities
- `mcp-server/`: MCP interfaces and deployment code

Git tracks files, not empty directories, so each folder contains Markdown or other files.

## Repository and deployment

The source repository is [`leferlin/my-hub`](https://github.com/leferlin/my-hub). The existing Cloudflare Worker name and OAuth endpoints intentionally keep their original `personal-hub` addresses for client compatibility. `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` configure the live GitHub source.

**After switching repositories:** authorize Cloudflare's `GITHUB_TOKEN` for `leferlin/my-hub` (Contents: read/write), point Cloudflare's Git integration to this repository or deploy it manually, then verify authenticated reads and writes. GitHub App access granted to ChatGPT does not automatically authorize Cloudflare.

## MCP status

The Cloudflare implementation currently exposes two separate endpoints:

| Endpoint | Purpose | Status |
| --- | --- | --- |
| `/health` | Health check | Public |
| `/mcp` | Demo skill discovery and reading | Public, read-only, bundled at build time |
| `/mcp-admin` | GitHub-backed reading and writing of skills, notes, and modes | Implemented, but requires secrets and integration testing |

The public `/mcp` endpoint does **not** load the live GitHub repository. Its bundled catalog is refreshed only during deployment. New GitHub files do not automatically appear there.

The administrative tools use the GitHub API at runtime and produce Git commits when writing files. They require both `MCP_ADMIN_TOKEN` and `GITHUB_TOKEN` configured as Cloudflare secrets. OAuth is implemented behind the `ENABLE_OAUTH` flag and uses Cloudflare KV and GitHub sign-in. Ensure Worker secrets and deployment bindings remain configured after repository migration. Do not treat the admin endpoint as ready for public use.

**Security:** The public demo endpoint has no authentication. Never expose private notes, plans, credentials, or sensitive skills through the demo catalog. Keep secrets out of Git, screenshots, logs, and conversations.

The OAuth-protected endpoint is `/mcp-secure` when enabled. GitHub sign-in provides user identity; the `GITHUB_TOKEN` secret provides separate repository access. Cross-device phone approval is implemented behind `ENABLE_PHONE_APPROVAL`.

See [MCP documentation](mcp-server/cloudflare/README.md) and [OAuth setup instructions](mcp-server/cloudflare/OAUTH_SETUP.md).

## Language policy

English is the default language for documentation, content, agent-facing descriptions, and new code comments. Existing stable directory names, skill slugs, API identifiers, and literal test responses remain unchanged for compatibility. Use English for newly created entries.
