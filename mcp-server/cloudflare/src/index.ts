import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import catalog from './catalog.json';

function createServer() {
  const server = new McpServer({ name: 'personal-hub', version: '0.2.0' });

  server.registerTool('list_skills', {
    description: 'Lista as skills disponíveis.',
    inputSchema: z.object({})
  }, async () => ({
    content: [{ type: 'text', text: JSON.stringify(catalog.map(({ name, description }) => ({ name, description })), null, 2) }]
  }));

  server.registerTool('search_skills', {
    description: 'Busca skills por texto.',
    inputSchema: z.object({ query: z.string().min(1) })
  }, async ({ query }) => {
    const q = query.toLowerCase();
    const matches = catalog.filter(s => `${s.name} ${s.description} ${s.content}`.toLowerCase().includes(q));
    return {
      content: [{ type: 'text', text: JSON.stringify(matches.map(({ name, description }) => ({ name, description })), null, 2) }]
    };
  });

  server.registerTool('get_skill', {
    description: 'Obtém as instruções completas de uma skill.',
    inputSchema: z.object({ name: z.string().min(1) })
  }, async ({ name }) => {
    const skill = catalog.find(s => s.name === name);
    return skill
      ? { content: [{ type: 'text', text: skill.content }] }
      : { isError: true, content: [{ type: 'text', text: 'Skill não encontrada' }] };
  });

  return server;
}

const mcpHandler = createMcpHandler(createServer);

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/health') return Response.json({ ok: true, skills: catalog.length, version: '0.2.0' });
    if (pathname !== '/mcp') return new Response('Not Found', { status: 404 });
    return mcpHandler.fetch(request);
  }
} satisfies ExportedHandler;
