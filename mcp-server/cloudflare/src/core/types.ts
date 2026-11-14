export const kinds = ['skill', 'note', 'mode', 'plan', 'task', 'procedure', 'knowledge', 'workflow', 'script'] as const;
export type Kind = typeof kinds[number];
export const folders: Record<Kind, string> = {
  skill: 'skills', note: 'notes', mode: 'modes', plan: 'plans',
  task: 'tasks', procedure: 'procedures', knowledge: 'knowledge',
  workflow: 'workflows', script: 'scripts'
};
export function entryPath(kind: Kind, slug: string): string {
  return kind === 'skill' ? `skills/${slug}/SKILL.md` : `${folders[kind]}/${slug}.md`;
}
export interface Entry { kind: Kind; slug: string; path: string; sha: string; content: string; }
export interface EntrySummary { kind: Kind; slug: string; path: string; }
export interface EntryStorage {
  list(kind: Kind): Promise<EntrySummary[]>;
  get(kind: Kind, slug: string): Promise<Entry>;
  create(kind: Kind, slug: string, content: string): Promise<string>;
  update(kind: Kind, slug: string, content: string, expectedSha: string): Promise<string>;
  delete(kind: Kind, slug: string, expectedSha: string): Promise<string>;
  readGuide(): Promise<string>;
}
