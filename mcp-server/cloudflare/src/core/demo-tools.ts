import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export interface DemoSkill { name: string; description: string; content: string; }

/** Public build-time catalog, separate from the authenticated live repository. */
export function registerDemoTools(server: McpServer, catalog: readonly DemoSkill[]): void {
  server.registerTool('list_skills', {
    description: 'List skills in the public build-time demo catalog.',
    inputSchema: z.object({})
  }, async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify(catalog.map(({ name, description }) => ({ name, description }))) }]
  }));

  server.registerTool('search_skills', {
    description: 'Search the public demo catalog by text.',
    inputSchema: z.object({ query: z.string().min(1) })
  }, async ({ query }) => {
    const q = query.toLowerCase();
    const matches = catalog.filter(s => `${s.name} ${s.description} ${s.content}`.toLowerCase().includes(q));
    return { content: [{ type: 'text' as const, text: JSON.stringify(matches.map(({ name, description }) => ({ name, description }))) }] };
  });

  server.registerTool('get_skill', {
    description: 'Read instructions for a skill in the public demo catalog.',
    inputSchema: z.object({ name: z.string().min(1) })
  }, async ({ name }) => {
    const skill = catalog.find(s => s.name === name);
    return skill
      ? { content: [{ type: 'text' as const, text: skill.content }] }
      : { isError: true, content: [{ type: 'text' as const, text: 'Skill not found' }] };
  });
}
