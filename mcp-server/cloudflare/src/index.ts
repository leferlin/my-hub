import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import catalog from './catalog.json';
import { serveAdminMcp, type Secrets } from './admin';
import { personalHubOAuth } from './oauth';

function createServer() {
  const server = new McpServer({ name: 'personal-hub', version: '0.2.0' });

  server.registerTool('list_skills', {
    description: 'List available skills.',
    inputSchema: z.object({})
  }, async () => ({
    content: [{ type: 'text', text: JSON.stringify(catalog.map(({ name, description }) => ({ name, description })), null, 2) }]
  }));

  server.registerTool('search_skills', {
    description: 'Search skills by text.',
    inputSchema: z.object({ query: z.string().min(1) })
  }, async ({ query }) => {
    const q = query.toLowerCase();
    const matches = catalog.filter(s => `${s.name} ${s.description} ${s.content}`.toLowerCase().includes(q));
    return {
      content: [{ type: 'text', text: JSON.stringify(matches.map(({ name, description }) => ({ name, description })), null, 2) }]
    };
  });

  server.registerTool('get_skill', {
    description: 'Retrieve the complete instructions for a skill.',
    inputSchema: z.object({ name: z.string().min(1) })
  }, async ({ name }) => {
    const skill = catalog.find(s => s.name === name);
    return skill
      ? { content: [{ type: 'text', text: skill.content }] }
      : { isError: true, content: [{ type: 'text', text: 'Skill not found' }] };
  });

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
