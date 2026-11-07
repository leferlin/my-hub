# Personal Hub MCP de demonstração — Cloudflare Workers

Servidor remoto MCP 2026-07-28 (SDK v2) com três ferramentas de consulta: `list_skills`, `search_skills`, `get_skill`.

## Execução e validação
Node.js 20+ e npm:

```bash
cd mcp-server/cloudflare
npm install
npm run build:catalog
npm run check
npm run dev
```

Verifique `http://localhost:8787/health`. Acesse o protocolo MCP via `POST http://localhost:8787/mcp` com um cliente MCP (não basta abrir o endpoint no navegador).

## Deploy
```bash
npx wrangler login
npm run deploy
```

No Cloudflare Git build, use Root directory `mcp-server/cloudflare`, Build command `npm run build:catalog` e Deploy command `npx wrangler deploy`.

O catálogo é incorporado ao build. O servidor **não consulta o repositório GitHub privado em tempo real**. Um novo deploy é necessário para atualizar as skills.

## Segurança
Este protótipo não tem autenticação. Qualquer pessoa que alcançar a URL poderá ler as skills de demonstração. **Não adicione planos, listas, tarefas, dados pessoais, credenciais ou quaisquer conteúdos privados ao catálogo** antes da implementação e validação de OAuth e das regras de acesso.

A versão 0.2 migrou do SDK MCP legado para o SDK v2 com suporte ao método `server/discover`, usado por clientes MCP 2026-07-28.
