# OAuth — Personal Hub

## Objetivo
Permitir que ChatGPT, Claude e VS Code autentiquem no MCP sem receber credenciais do GitHub. O Worker autoriza usuários e escopos antes de usar a GitHub API para acessar o repositório privado.

## Endereços previstos
- MCP autenticado (novo endpoint, ainda **não implementado**): `https://personal-hub.leandroferlin5.workers.dev/mcp-secure`
- Autorização OAuth: `https://personal-hub.leandroferlin5.workers.dev/authorize`
- Callback da identidade GitHub: `https://personal-hub.leandroferlin5.workers.dev/callback`

Até ativar e testar OAuth, manter `/mcp` funcionando com apenas material fictício; não mudar seu comportamento.

## Primeiro passo manual — OAuth App do GitHub

Acesse https://github.com/settings/developers → OAuth Apps → New OAuth App.

- Application name: `Personal Hub MCP`
- Homepage URL: `https://personal-hub.leandroferlin5.workers.dev`
- Authorization callback URL: `https://personal-hub.leandroferlin5.workers.dev/callback`

O callback é utilizado pelo Worker, não pelo VS Code nem pelo ChatGPT.

Ao criar, o GitHub mostra um **Client ID** (não é segredo) e permite gerar um **Client Secret** (é segredo). Configure este último somente em Cloudflare Workers → Settings → Variables and Secrets como *secret*. Nunca envie Client Secret, tokens ou códigos de autenticação por chat.

## Próximas implementações (ainda pendentes)

1. Adaptar `@cloudflare/workers-oauth-provider` e storage KV para OAuth com PKCE, consentimento e descoberta MCP.
2. Verificar a identidade GitHub do usuário contra uma allowlist, sem confiar apenas no nome apresentado ou nos prompts do agente.
3. Separar escopos `hub:read`, `hub:write` e `hub:delete`; escrita/exclusão somente após autorização explícita.
4. Separar identidade GitHub (OAuth login) de permissão para arquivos (GitHub App ou token GitHub fine-grained, limitado ao repositório).
5. Fazer leitura dinâmica em runtime do GitHub e testar CRUD de skill/note/mode.
6. Auditar e remover logs sensíveis; revisar CSRF, cookies, redirect URI e consentimento de cada cliente.
7. Desativar o endpoint administrativo estático quando a migração estiver validada.

## Segurança
O login GitHub autentica o usuário; **não autoriza sozinho** qualquer escrita. MCP `/mcp-admin` permanece separado e exige credenciais secretas. Não configurar permissões públicas para dados pessoais. Os arquivos dummy atuais são somente conteúdo de teste.
