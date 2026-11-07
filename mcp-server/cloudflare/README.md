# MCP de demonstração — Cloudflare Workers

MCP remoto usando HTTPS/Streamable HTTP, com três ferramentas: `list_skills`, `search_skills`, `get_skill`.

## Execução local
Requer Node.js 20+ e npm.

```bash
cd mcp-server/cloudflare
npm install
npm run check
npm run dev
```

Verifique `http://localhost:8787/health`. Endpoint MCP: `http://localhost:8787/mcp`.

## Deploy
```bash
npx wrangler login
npm run deploy
```

Depois use a URL publicada com sufixo `/mcp`. O comando `build:catalog` lê os arquivos em `../../skills/` e gera o JSON usado pelo Worker.

**Segurança:** endpoint MCP sem autenticação no MVP, logo **qualquer pessoa que alcance a URL consegue ler as skills embutidas**. Utilize apenas material fictício, nunca seus planos pessoais, dados privados ou credenciais.

**Próxima fase:** OAuth, permissões de leitura do repositório privado e carregamento dinâmico. Não assuma que um token do GitHub no Worker fornece autenticação aos clientes MCP.
