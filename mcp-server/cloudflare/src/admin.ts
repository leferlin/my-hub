import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { registerHubTools } from './core/tools';
import { GitHubStorage } from './storage/github';

export type Secrets = {
  GITHUB_TOKEN?: string;
  MCP_ADMIN_TOKEN?: string;
  GITHUB_REPO_OWNER?: string;
  GITHUB_REPO_NAME?: string;
};

export function createGitHubMcpServer(
  env: Secrets,
  scopes: readonly string[] = ['hub:read', 'hub:write', 'hub:delete']
): McpServer {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not configured');
  const server = new McpServer(
    {
      name: 'my-hub-secure',
      version: '0.5.0',
      description: 'My Hub: GitHub-backed knowledge, reusable agent skills and modes.'
    },
    {
      instructions:
        'My Hub is a remote GitHub-backed repository for skills, modes, notes, plans, tasks, procedures, knowledge, workflows, and scripts. ' +
        'Use list_entries and get_entry to discover and read them. ' +
        'For complete usage rules call get_hub_guide. ' +
        'Each skill and mode must be self-contained. ' +
        'Writes use create_entry or update_entry; updates require the current GitHub SHA. ' +
        'Do not delete entries without explicit user confirmation.'
    }
  );
  const storage = new GitHubStorage({
    token: env.GITHUB_TOKEN,
    owner: env.GITHUB_REPO_OWNER || 'leferlin',
    repository: env.GITHUB_REPO_NAME || 'my-hub'
  });
  registerHubTools(server, storage, {
    read: scopes.includes('hub:read'),
    write: scopes.includes('hub:write'),
    delete: scopes.includes('hub:delete')
  });
  return server;
}

/** Legacy bearer-protected endpoint. Cloudflare routes and authentication remain here. */
export async function serveAdminMcp(request: Request, env: Secrets): Promise<Response> {
  if (!env.MCP_ADMIN_TOKEN || !env.GITHUB_TOKEN) {
    return new Response('Admin MCP not configured', { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${env.MCP_ADMIN_TOKEN}`) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer realm="my-hub-admin"', 'Cache-Control': 'no-store' }
    });
  }
  return createMcpHandler(() => createGitHubMcpServer(env)).fetch(request);
}
