import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { kinds, type Kind, type EntryStorage } from './types';

const kindSchema = z.enum(kinds);
const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');
const bodySchema = z.string().min(1).max(64000);
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);

export interface HubScopes {
  read: boolean;
  write: boolean;
  delete: boolean;
}
const response = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const errorResponse = (error: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Unknown error' }]
});

/** Install a compact, provider-independent interface onto an MCP server.
 *  Storage owns persistence. OAuth / the host provide scopes.
 */
export function registerHubTools(server: McpServer, storage: EntryStorage, scopes: HubScopes): void {
  if (!scopes.read) throw new Error('Missing hub:read scope');

  server.registerTool('get_hub_guide', {
    description: 'Read My Hub agent guide and usage rules (AGENTS.md).',
    inputSchema: z.object({})
  }, async () => {
    try {
      return { content: [{ type: 'text' as const, text: await storage.readGuide() }] };
    } catch (e) { return errorResponse(e); }
  });

  server.registerTool('install_skills', {
    description: 'Discover every My Hub skill and get a short, harness-independent guide for installing the selected skills into this agent environment. Read-only: does not install anything.',
    inputSchema: z.object({})
  }, async () => {
    try {
      const skills = await storage.list('skill');
      const catalog = skills.map(({ slug, path }) => ({ slug, path }));
      const guide = [
        'Choose which skills to install from the list below.',
        'For each chosen slug, call get_entry({ kind: "skill", slug }) to read its complete SKILL.md.',
        'Use your agent/harness supported skill installation mechanism and location (local, user-level or project-level); do not assume a universal path.',
        'With user approval where needed, preserve the SKILL.md content and frontmatter as <slug>/SKILL.md. Do not overwrite existing installations without reviewing them.',
        'Do not write installation files into the remote My Hub repository; that repository is the source.',
        'If your environment cannot install skills, explain the appropriate manual steps. Never claim installation succeeded without verifying it.',
        'get_entry returns SKILL.md only. If a skill refers to supporting assets/files, fetch them separately before claiming a complete installation.'
      ].join('\\n');
      return response({ skills: catalog, count: catalog.length, installation_guide: guide, installed: false });
    } catch (e) { return errorResponse(e); }
  });

  server.registerTool('list_entries', {
    description: 'List entries in one category. Valid categories: skill, note, mode, plan, task, procedure, knowledge, workflow, script.',
    inputSchema: z.object({ kind: kindSchema })
  }, async ({ kind }) => {
    try { return response(await storage.list(kind)); }
    catch (e) { return errorResponse(e); }
  });

  server.registerTool('get_entry', {
    description: 'Read the full Markdown body and current SHA of a Hub entry. List entries before guessing a slug.',
    inputSchema: z.object({ kind: kindSchema, slug: slugSchema })
  }, async ({ kind, slug }) => {
    try {
      const entry = await storage.get(kind, slug);
      return { content: [{ type: 'text' as const, text: `File: ${entry.path}\nSHA: ${entry.sha}\n\n${entry.content}` }] };
    } catch (e) { return errorResponse(e); }
  });

  server.registerTool('search_entries', {
    description: 'Search entry names/slugs across all categories, optionally filtering by kind. This is name matching, not semantic search or content indexing.',
    inputSchema: z.object({ query: z.string().min(1).max(100), kind: kindSchema.optional() })
  }, async ({ query, kind }) => {
    try {
      const q = query.trim().toLowerCase();
      if (!q) throw new Error('Query must not be blank');
      const categories: readonly Kind[] = kind ? [kind] : kinds;
      const lists = await Promise.all(categories.map(async k => {
        try { return await storage.list(k); }
        catch (e) { if (kind) throw e; return []; }
      }));
      return response(lists.flat().filter(entry =>
        entry.slug.toLowerCase().includes(q) || entry.path.toLowerCase().includes(q)
      ).slice(0, 100));
    } catch (e) { return errorResponse(e); }
  });

  if (scopes.write) {
    server.registerTool('create_entry', {
      description: 'Create a new Markdown entry. Fails if the path already exists. Requires hub:write.',
      inputSchema: z.object({ kind: kindSchema, slug: slugSchema, content: bodySchema })
    }, async ({ kind, slug, content }) => {
      try { return response({ action: 'created', kind, slug, commit: await storage.create(kind, slug, content) }); }
      catch (e) { return errorResponse(e); }
    });

    server.registerTool('update_entry', {
      description: 'Update an existing entry with its current GitHub SHA to avoid overwriting concurrent edits. Requires hub:write.',
      inputSchema: z.object({ kind: kindSchema, slug: slugSchema, content: bodySchema, expected_sha: shaSchema })
    }, async ({ kind, slug, content, expected_sha }) => {
      try { return response({ action: 'updated', kind, slug, commit: await storage.update(kind, slug, content, expected_sha) }); }
      catch (e) { return errorResponse(e); }
    });
  }

  if (scopes.delete) {
    server.registerTool('delete_entry', {
      description: 'Delete an entry by its current SHA. Destructive; confirm with the user. Requires hub:delete.',
      inputSchema: z.object({ kind: kindSchema, slug: slugSchema, expected_sha: shaSchema })
    }, async ({ kind, slug, expected_sha }) => {
      try { return response({ action: 'deleted', kind, slug, commit: await storage.delete(kind, slug, expected_sha) }); }
      catch (e) { return errorResponse(e); }
    });
  }
}
