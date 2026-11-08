# Personal Hub

A private, centralized repository for personal plans, tasks, lists, procedures, knowledge, AI agent skills, workflows, and scripts.

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

## MCP status

The Cloudflare implementation currently exposes two separate endpoints:

| Endpoint | Purpose | Status |
| --- | --- | --- |
| `/health` | Health check | Public |
| `/mcp` | Demo skill discovery and reading | Public, read-only, bundled at build time |
| `/mcp-admin` | GitHub-backed reading and writing of skills, notes, and modes | Implemented, but requires secrets and integration testing |

The public `/mcp` endpoint does **not** load the live GitHub repository. Its bundled catalog is refreshed only during deployment. New GitHub files do not automatically appear there.

The administrative tools use the GitHub API at runtime and produce Git commits when writing files. They require both `MCP_ADMIN_TOKEN` and `GITHUB_TOKEN` configured as Cloudflare secrets. OAuth for ChatGPT and other clients is **not yet implemented**. Do not treat the admin endpoint as ready for public use.

**Security:** The public demo endpoint has no authentication. Never expose private notes, plans, credentials, or sensitive skills through the demo catalog. Keep secrets out of Git, screenshots, logs, and conversations.

See [MCP documentation](mcp-server/cloudflare/README.md) and [OAuth setup plan](mcp-server/cloudflare/OAUTH_SETUP.md).

## Language policy

English is the default language for documentation, content, agent-facing descriptions, and new code comments. Existing stable directory names, skill slugs, API identifiers, and literal test responses remain unchanged for compatibility. Use English for newly created entries.
