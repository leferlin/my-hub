# Personal Hub — MCP Cloudflare Workers

## Interfaces

- `GET /health`: estado e versão do Worker.
- `POST /mcp`: MCP **público e somente leitura**, com conteúdo fictício embutido no deploy. Ferramentas `list_skills`, `search_skills`, `get_skill`.
- `POST /mcp-admin`: MCP **administrativo**, exige cabeçalho `Authorization: Bearer <MCP_ADMIN_TOKEN>` e acesso GitHub de escrita.

**Não aponte o plugin ChatGPT sem autenticação para `/mcp-admin`.** O ChatGPT ainda precisa de um fluxo OAuth adequado para essa área. O endpoint atual é útil para clientes próprios que suportem cabeçalhos Bearer, não substitui OAuth MCP.

## Ferramentas administrativas

- `create_skill`, `update_skill`, `delete_skill`
- `create_note`, `update_note`, `delete_note`
- `create_mode`, `update_mode`, `delete_mode`
- `get_entry_metadata`: recupera SHA exigido nas operações update/delete.

Os arquivos vão para:

- skill: `skills/{slug}/SKILL.md`
- note: `notes/{slug}.md`
- mode: `modes/{slug}.md`

O `slug` aceita somente minúsculas, números e hífens. O conteúdo é Markdown (máximo de 64.000 caracteres). Updates/deletes exigem `expected_sha` como controle de concorrência. O GitHub registra commits e histórico. Não há bulk delete.

## Configuração privada (Cloudflare)

Em **Workers & Pages → personal-hub → Settings → Variables and Secrets**, configure como **secrets** (nunca plaintext variables):

1. `GITHUB_TOKEN`: token fine-grained do GitHub limitado **somente** ao repositório `leandroferlin5/personal-hub` com permissão **Contents: Read and write**; sem permissões administrativas.
2. `MCP_ADMIN_TOKEN`: segredo aleatório independente e longo (mínimo sugerido 32 bytes de entropia) para autenticar o cliente administrativo.

Não cole os tokens em chats, arquivos Git, screenshots nem logs. Configure os dois secrets antes de acessar `/mcp-admin`. Sem eles, o endpoint responde `503`. Sem header Bearer válido, responde `401`.

Esses dois segredos têm papéis diferentes: `MCP_ADMIN_TOKEN` autentica o cliente MCP diante do Worker; `GITHUB_TOKEN` autoriza o Worker a gravar no GitHub.

**Próxima etapa obrigatória para ChatGPT/Claude com OAuth:** substituir a autenticação estática administrativa por OAuth 2.1 com controle de identidade, escopos de leitura/escrita, consentimento e armazenamento seguro dos tokens. A Cloudflare dispõe de `@cloudflare/workers-oauth-provider` para isso.

## Deploy

Cloudflare Git integration: Root directory `mcp-server/cloudflare`, build `npm run build:catalog`, deploy `npx wrangler deploy`.

Alternativa local com Node.js 20+:

```bash
cd mcp-server/cloudflare
npm install
npm run build:catalog
npm run check
npx wrangler dev
```

**Observação:** o catálogo público continua incorporado ao build; as entradas criadas no GitHub pelo MCP administrativo NÃO aparecem automaticamente em `/mcp`. Para um hub central realmente dinâmico, a próxima versão deverá ler conteúdo privado do GitHub através de uma sessão OAuth autenticada e não reutilizar o catálogo de demonstração.

## Segurança operacional

- Faça revisão humana das alterações propostas por agentes, principalmente exclusões.
- Não armazene senhas/tokens no repositório.
- Rotacione os tokens e revise auditorias regularmente.
- Não divulgue seu `MCP_ADMIN_TOKEN` para aplicativos de terceiros.
- O código está em fase MVP; requer teste de integração e compilação antes de ser considerado produção.
