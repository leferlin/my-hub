import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import { z } from 'zod';
import catalog from './catalog.json';

function makeServer() {
  const server = new McpServer({ name: 'personal-hub', version: '0.1.0' });

  server.tool('list_skills', 'Lista as skills disponíveis.', {}, async () => ({
    content: [{ type: 'text', text: JSON.stringify(catalog.map(({ name, description }) => ({ name, description })), null, 2) }]
  }));

  server.tool('search_skills', 'Busca skills por texto.', { query: z.string().min(1) }, async ({ query }) => {
    const q = query.toLowerCase();
    const matches = catalog.filter(s => `${s.name} ${s.description} ${s.content}`.toLowerCase().includes(q));
    return { content: [{ type: 'text', text: JSON.stringify(matches.map(({ name, description }) => ({ name, description })), null, 2) }] };
  });

  server.tool('get_skill', 'Obtém as instruções completas de uma skill.', { name: z.string().min(1) }, async ({ name }) => {
    const skill = catalog.find(s => s.name === name);
    return skill
      ? { content: [{ type: 'text', text: skill.content }] }
      : { isError: true, content: [{ type: 'text', text: 'Skill não encontrada' }] };
  });

  return server;
}

const handler = createMcpHandler(makeServer);

export default {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/health') return Response.json({ ok: true, skills: catalog.length });
    if (path !== '/mcp') return new Response('Not Found', { status: 404 });
    return handler(request);
  }
};
