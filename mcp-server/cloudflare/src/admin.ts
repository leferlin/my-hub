import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';

export type Secrets = { GITHUB_TOKEN?: string; MCP_ADMIN_TOKEN?: string };
const owner = 'leandroferlin5';
const repository = 'personal-hub';
const kinds = ['skill', 'note', 'mode', 'plan', 'task', 'procedure', 'knowledge', 'workflow', 'script'] as const;
type Kind = typeof kinds[number];
const folders: Record<Kind, string> = {
  skill: 'skills', note: 'notes', mode: 'modes', plan: 'plans',
  task: 'tasks', procedure: 'procedures', knowledge: 'knowledge',
  workflow: 'workflows', script: 'scripts'
};
const pathFor: Record<Kind, (slug: string) => string> = {
  skill: slug => `skills/${slug}/SKILL.md`,
  note: slug => `notes/${slug}.md`,
  mode: slug => `modes/${slug}.md`,
  plan: slug => `plans/${slug}.md`,
  task: slug => `tasks/${slug}.md`,
  procedure: slug => `procedures/${slug}.md`,
  knowledge: slug => `knowledge/${slug}.md`,
  workflow: slug => `workflows/${slug}.md`,
  script: slug => `scripts/${slug}.md`
};
const toolPlural: Record<Kind, string> = {
  skill: 'skills', note: 'notes', mode: 'modes', plan: 'plans',
  task: 'tasks', procedure: 'procedures', knowledge: 'knowledge',
  workflow: 'workflows', script: 'scripts'
};
const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens');
const kindSchema = z.enum(kinds);
const bodySchema = z.string().min(1).max(64000);
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);

function gitPath(kind: Kind, slug: string) {
  return pathFor[kind](slug);
}
function base64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
async function github(env: Secrets, method: string, path: string, payload?: unknown) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not configured');
  const url = `https://api.github.com/repos/${owner}/${repository}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'personal-hub-mcp',
      ...(payload ? { 'Content-Type': 'application/json' } : {})
    },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = response.status;
    throw new Error(`GitHub HTTP ${code}: ${typeof data.message === 'string' ? data.message.slice(0, 240) : 'request rejected'}`);
  }
  return data;
}
function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}
function failed(error: unknown) {
  return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Unknown error' }] };
}
async function loadEntry(env: Secrets, kind: Kind, slug: string) {
  const data = await github(env, 'GET', gitPath(kind, slug));
  if (data.type !== 'file' || typeof data.sha !== 'string') throw new Error('Invalid file');
  return { path: gitPath(kind, slug), sha: data.sha, html_url: data.html_url };
}
export function createGitHubMcpServer(env: Secrets, scopes: readonly string[] = ['hub:read', 'hub:write', 'hub:delete']) {
  const canRead = scopes.includes('hub:read');
  const canWrite = scopes.includes('hub:write');
  const canDelete = scopes.includes('hub:delete');
  if (!canRead) throw new Error('Missing hub:read scope');
  const server = new McpServer({ name: 'personal-hub-admin', version: '0.3.0' });
  server.registerTool('get_entry', {
    description: 'Read full Markdown and SHA for a skill, note, mode, plan, task, procedure, knowledge item, workflow, or script directly from private GitHub.',
    inputSchema: z.object({ kind: kindSchema, slug: slugSchema })
  }, async ({ kind, slug }) => {
    try {
      const data = await github(env, 'GET', gitPath(kind, slug));
      if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string') {
        throw new Error('Invalid file response');
      }
      const binary = atob(data.content.replace(/\s/g, ''));
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const markdown = new TextDecoder().decode(bytes);
      // Return the file body as MCP text, rather than JSON nesting a "content"
      // field. Some MCP clients unwrap tool responses and discard nested content.
      return {
        content: [{
          type: 'text' as const,
          text: `File: ${gitPath(kind, slug)}\nSHA: ${data.sha}\n\n${markdown}`
        }]
      };
    } catch (e) { return failed(e); }
  });
  server.registerTool('list_entries', {
    description: 'List entries in any Personal Hub category from the live private GitHub repository.',
    inputSchema: z.object({ kind: kindSchema })
  }, async ({ kind }) => {
    try {
      const folder = folders[kind];
      const data = await github(env, 'GET', folder);
      if (!Array.isArray(data)) throw new Error('Folder unavailable');
      return result(data
        .filter((entry: any) => kind === 'skill' ? entry.type === 'dir' : entry.type === 'file' && entry.name.endsWith('.md'))
        .map((entry: any) => ({ name: entry.name, path: entry.path })));
    } catch (e) { return failed(e); }
  });
  server.registerTool('get_entry_metadata', {
    description: 'Get the current GitHub SHA for any Personal Hub entry before updating or deleting.',
    inputSchema: z.object({ kind: kindSchema, slug: slugSchema })
  }, async ({ kind, slug }) => {
    try { return result(await loadEntry(env, kind, slug)); } catch (e) { return failed(e); }
  });
  for (const kind of kinds) {
    const pathOf = (slug: string) => gitPath(kind, slug);
    if (canWrite) server.registerTool(`create_${kind}`, {
      description: `Create ${kind} as a Markdown file in the private GitHub repository. Do not overwrite existing files.`,
      inputSchema: z.object({ slug: slugSchema, content: bodySchema })
    }, async ({ slug, content }) => {
      try {
        const path = pathOf(slug);
        const created = await github(env, 'PUT', path, {
          message: `Create ${kind}: ${slug}`, content: base64(content), branch: 'main'
        });
        return result({ action: 'created', kind, path, commit: created.commit?.sha });
      } catch (e) { return failed(e); }
    });
    if (canWrite) server.registerTool(`update_${kind}`, {
      description: `Update ${kind} only if expected_sha matches the current version; preserve Git history.`,
      inputSchema: z.object({ slug: slugSchema, content: bodySchema, expected_sha: shaSchema })
    }, async ({ slug, content, expected_sha }) => {
      try {
        const path = pathOf(slug);
        const updated = await github(env, 'PUT', path, {
          message: `Update ${kind}: ${slug}`, content: base64(content), sha: expected_sha, branch: 'main'
        });
        return result({ action: 'updated', kind, path, commit: updated.commit?.sha });
      } catch (e) { return failed(e); }
    });
    if (canDelete) server.registerTool(`delete_${kind}`, {
      description: `Delete ${kind} only with the current SHA to prevent accidentally deleting a newer version.`,
      inputSchema: z.object({ slug: slugSchema, expected_sha: shaSchema })
    }, async ({ slug, expected_sha }) => {
      try {
        const path = pathOf(slug);
        const deleted = await github(env, 'DELETE', path, {
          message: `Delete ${kind}: ${slug}`, sha: expected_sha, branch: 'main'
        });
        return result({ action: 'deleted', kind, path, commit: deleted.commit?.sha });
      } catch (e) { return failed(e); }
    });
  }

  // Human-readable aliases improve automatic tool selection by AI agents.
  // They reuse exactly the same fixed paths, scope checks and optimistic SHA
  // requirements as the generic tools. All reads use live GitHub contents.
  for (const kind of kinds) {
    const folder = folders[kind];
    const singular = kind;
    const plural = toolPlural[kind];
    server.registerTool(`list_${plural}`, {
      description: `List available ${plural} in Personal Hub from live GitHub. Use this when the user asks which ${plural} exist.`,
      inputSchema: z.object({})
    }, async () => {
      try {
        const entries = await github(env, 'GET', folder);
        if (!Array.isArray(entries)) throw new Error('Folder unavailable');
        return result(entries
          .filter((item: any) => kind === 'skill' ? item.type === 'dir' : item.type === 'file' && item.name.endsWith('.md'))
          .map((item: any) => ({
            slug: kind === 'skill' ? item.name : item.name.slice(0, -3),
            path: item.path
          })));
      } catch (error) { return failed(error); }
    });

    server.registerTool(`get_${singular}`, {
      description: `Read the complete ${singular} Markdown file from live private GitHub. Returns its current SHA for updates. Use when the user asks to retrieve or apply a ${singular}.`,
      inputSchema: z.object({ slug: slugSchema })
    }, async ({ slug }) => {
      try {
        const data = await github(env, 'GET', gitPath(kind, slug));
        if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string') {
          throw new Error('Invalid file response');
        }
        const binary = atob(data.content.replace(/\\s/g, ''));
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return { content: [{
          type: 'text' as const,
          text: `File: ${gitPath(kind, slug)}\\nSHA: ${data.sha}\\n\\n${new TextDecoder().decode(bytes)}`
        }] };
      } catch (error) { return failed(error); }
    });

    if (canWrite) {
      server.registerTool(`create_${singular}_file`, {
        description: `Create a new ${singular} Markdown file in Personal Hub's private GitHub repository. Does not overwrite existing files.`,
        inputSchema: z.object({ slug: slugSchema, content: bodySchema })
      }, async ({ slug, content }) => {
        try {
          const path = gitPath(kind, slug);
          const created = await github(env, 'PUT', path, {
            message: `Create ${singular}: ${slug}`, content: base64(content), branch: 'main'
          });
          return result({ action: 'created', kind, path, commit: created.commit?.sha });
        } catch (error) { return failed(error); }
      });
      server.registerTool(`update_${singular}_file`, {
        description: `Update an existing ${singular} Markdown file in GitHub. First fetch it to obtain the latest SHA, then supply expected_sha to prevent conflicts.`,
        inputSchema: z.object({ slug: slugSchema, content: bodySchema, expected_sha: shaSchema })
      }, async ({ slug, content, expected_sha }) => {
        try {
          const path = gitPath(kind, slug);
          const updated = await github(env, 'PUT', path, {
            message: `Update ${singular}: ${slug}`, content: base64(content),
            sha: expected_sha, branch: 'main'
          });
          return result({ action: 'updated', kind, path, commit: updated.commit?.sha });
        } catch (error) { return failed(error); }
      });
    }
  }
  return server;
}
export async function serveAdminMcp(request: Request, env: Secrets): Promise<Response> {
  if (!env.MCP_ADMIN_TOKEN || !env.GITHUB_TOKEN) {
    return new Response('Admin MCP not configured', { status: 503 });
  }
  const authorization = request.headers.get('authorization');
  if (!authorization || authorization !== `Bearer ${env.MCP_ADMIN_TOKEN}`) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer realm="personal-hub-admin"', 'Cache-Control': 'no-store' }
    });
  }
  // Instantiate the admin server only after authentication; no admin tools are public.
  return createMcpHandler(() => createGitHubMcpServer(env)).fetch(request);
}
