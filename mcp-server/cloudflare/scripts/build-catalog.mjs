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
    // Diretórios sem SKILL.md não entram no catálogo.
  }
}
if (!skills.length) throw new Error('Nenhuma skill encontrada');
await writeFile(new URL('../src/catalog.json', import.meta.url), JSON.stringify(skills, null, 2));
console.log(`Catálogo gerado: ${skills.length} skills`);
