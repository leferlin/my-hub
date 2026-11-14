import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import catalog from './catalog.json';
import { registerDemoTools } from './core/demo-tools';
import { serveAdminMcp, type Secrets } from './admin';
import { personalHubOAuth } from './oauth';

function createServer() {
  const server = new McpServer({ name: 'my-hub', version: '0.2.0' });

  registerDemoTools(server, catalog);

  return server;
}

const mcpHandler = createMcpHandler(createServer);

export default {
  async fetch(request: Request, env: Secrets & { ENABLE_OAUTH?: string }, ctx: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/health') return Response.json({ ok: true, skills: catalog.length, version: '0.3.0', oauthEnabled: env.ENABLE_OAUTH === 'true' });
    // Keep OAuth disabled until KV and secrets are installed and tested.
    const oauthRoute = pathname === '/mcp-secure' || pathname === '/authorize' || pathname === '/callback' || pathname === '/phone' || pathname === '/phone/start' || pathname.startsWith('/oauth/') || pathname.startsWith('/.well-known/');
    if (oauthRoute) {
      if (env.ENABLE_OAUTH !== 'true') return new Response('OAuth setup pending', { status: 503 });
      return personalHubOAuth.fetch(request, env as any, ctx);
    }
    if (pathname === '/mcp-admin') return serveAdminMcp(request, env);
    if (pathname !== '/mcp') return new Response('Not Found', { status: 404 });
    const response = await mcpHandler.fetch(request);

    return response;
  }
} satisfies ExportedHandler;
