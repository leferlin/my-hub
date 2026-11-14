import { entryPath, folders, type EntryStorage, type Entry, type EntrySummary, type Kind } from '../core/types';

export interface GitHubConfig { token: string; owner: string; repository: string; branch?: string; }

function encodeContent(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
function decodeContent(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

export class GitHubStorage implements EntryStorage {
  constructor(private readonly config: GitHubConfig) {}

  private async request(method: string, path: string, payload?: unknown): Promise<any> {
    const { token, owner, repository } = this.config;
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encoded}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'my-hub-mcp',
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
      }
    );
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`GitHub HTTP ${response.status}: ${typeof data.message === 'string' ? data.message.slice(0, 240) : 'request rejected'}`);
    }
    return data;
  }

  async list(kind: Kind): Promise<EntrySummary[]> {
    const data = await this.request('GET', folders[kind]);
    if (!Array.isArray(data)) throw new Error('GitHub folder is unavailable');
    return data.filter((item: any) =>
      kind === 'skill' ? item.type === 'dir' : item.type === 'file' && item.name.endsWith('.md')
    ).map((item: any) => ({
      kind,
      slug: kind === 'skill' ? item.name : item.name.slice(0, -3),
      path: item.path
    }));
  }

  async get(kind: Kind, slug: string): Promise<Entry> {
    const path = entryPath(kind, slug);
    const data = await this.request('GET', path);
    if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string' || typeof data.sha !== 'string') {
      throw new Error('Invalid GitHub file response');
    }
    return { kind, slug, path, sha: data.sha, content: decodeContent(data.content) };
  }

  async create(kind: Kind, slug: string, content: string): Promise<string> {
    const data = await this.request('PUT', entryPath(kind, slug), {
      message: `Create ${kind}: ${slug}`, content: encodeContent(content), branch: this.config.branch || 'main'
    });
    return data.commit?.sha || '';
  }

  async update(kind: Kind, slug: string, content: string, expectedSha: string): Promise<string> {
    const data = await this.request('PUT', entryPath(kind, slug), {
      message: `Update ${kind}: ${slug}`, content: encodeContent(content), sha: expectedSha, branch: this.config.branch || 'main'
    });
    return data.commit?.sha || '';
  }

  async delete(kind: Kind, slug: string, expectedSha: string): Promise<string> {
    const data = await this.request('DELETE', entryPath(kind, slug), {
      message: `Delete ${kind}: ${slug}`, sha: expectedSha, branch: this.config.branch || 'main'
    });
    return data.commit?.sha || '';
  }

  async readGuide(): Promise<string> {
    const data = await this.request('GET', 'AGENTS.md');
    if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string') {
      throw new Error('Invalid guide response');
    }
    return decodeContent(data.content);
  }
}
