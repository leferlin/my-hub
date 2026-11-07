import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';

export type Secrets = { GITHUB_TOKEN?: string; MCP_ADMIN_TOKEN?: string };
const owner = 'leandroferlin5';
const repository = 'personal-hub';
const prefix: Record<'skill' | 'note' | 'mode', (slug: string) => string> = {
  skill: slug => `skills/${slug}/SKILL.md`,
  note: slug => `notes/${slug}.md`,
  mode: slug => `modes/${slug}.md`
};
type Kind = keyof typeof prefix;
type Entry = { content: string; sha?: string };
const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens');
const kindSchema = z.enum(['skill', 'note', 'mode']);
const bodySchema = z.string().min(1).max(64000);
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);

function gitPath(kind: Kind, slug: string) {
  return prefix[kind](slug);
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
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN não configurado');
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
    throw new Error(`GitHub HTTP ${code}: ${typeof data.message === 'string' ? data.message.slice(0, 240) : 'requisição recusada'}`);
  }
  return data;
}
function result(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}
function failed(error: unknown) {
  return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Falha desconhecida' }] };
}
async function loadEntry(env: Secrets, kind: Kind, slug: string) {
  const data = await github(env, 'GET', gitPath(kind, slug));
  if (data.type !== 'file' || typeof data.sha !== 'string') throw new Error('Arquivo inválido');
  return { path: gitPath(kind, slug), sha: data.sha, html_url: data.html_url };
}
function createServer(env: Secrets) {
  const server = new McpServer({ name: 'personal-hub-admin', version: '0.3.0' });
  server.registerTool('get_entry', {
    description: 'Lê o conteúdo Markdown e o SHA de uma skill, note ou mode do GitHub privado.',
    inputSchema: z.object({ kind: kindSchema, slug: slugSchema })
  }, async ({ kind, slug }) => {
    try {
      const data = await github(env, 'GET', gitPath(kind, slug));
      if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string') {
        throw new Error('Resposta de arquivo inválida');
      }
      const binary = atob(data.content.replace(/\s/g, ''));
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return result({ kind, slug, path: gitPath(kind, slug), sha: data.sha, content: new TextDecoder().decode(bytes) });
    } catch (e) { return failed(e); }
  });
  server.registerTool('list_entries', {
    description: 'Lista nomes de skills, notes ou modes no repositório privado.',
    inputSchema: z.object({ kind: kindSchema })
  }, async ({ kind }) => {
    try {
      const folder = kind === 'skill' ? 'skills' : kind === 'note' ? 'notes' : 'modes';
      const data = await github(env, 'GET', folder);
      if (!Array.isArray(data)) throw new Error('Pasta indisponível');
      return result(data
        .filter((entry: any) => kind === 'skill' ? entry.type === 'dir' : entry.type === 'file' && entry.name.endsWith('.md'))
        .map((entry: any) => ({ name: entry.name, path: entry.path })));
    } catch (e) { return failed(e); }
  });
  server.registerTool('get_entry_metadata', {
    description: 'Obtém o SHA atual de uma skill, note ou mode antes de atualizar ou excluir.',
    inputSchema: z.object({ kind: kindSchema, slug: slugSchema })
  }, async ({ kind, slug }) => {
    try { return result(await loadEntry(env, kind, slug)); } catch (e) { return failed(e); }
  });
  for (const kind of ['skill', 'note', 'mode'] as const) {
    const pathOf = (slug: string) => gitPath(kind, slug);
    server.registerTool(`create_${kind}`, {
      description: `Cria ${kind} como arquivo Markdown no GitHub privado. Não sobrescreve arquivos existentes.`,
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
    server.registerTool(`update_${kind}`, {
      description: `Atualiza ${kind} somente se expected_sha corresponder à versão atual; preserva histórico Git.`,
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
    server.registerTool(`delete_${kind}`, {
      description: `Exclui ${kind} explicitamente, exigindo SHA atual para evitar exclusão acidental de outra versão.`,
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
  // O servidor só é instanciado após autenticação; nenhuma ferramenta admin é pública.
  return createMcpHandler(() => createServer(env)).fetch(request);
}
