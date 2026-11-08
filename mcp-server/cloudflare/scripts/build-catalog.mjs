import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../../skills/', import.meta.url);
const names = await readdir(root);
const skills = [];
for (const dir of names) {
  try {
    const content = await readFile(new URL(`${dir}/SKILL.md`, root), 'utf8');
    const name = content.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = content.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    if (name && description) skills.push({ name, description, content });
  } catch {
    // Directories without SKILL.md are excluded from the catalog.
  }
}
if (!skills.length) throw new Error('No skills found');
await writeFile(new URL('../src/catalog.json', import.meta.url), JSON.stringify(skills, null, 2));
console.log(`Catalog generated: ${skills.length} skills`);
