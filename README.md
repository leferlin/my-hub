# personal-hub

Repositório privado e centralizado de planos, tarefas, listas, procedimentos, conhecimento, skills de IA, workflows e scripts.

## Estrutura
- `plans/`: planos e objetivos
- `tasks/`: tarefas e listas
- `procedures/`: procedimentos operacionais
- `knowledge/`: notas e referências
- `workflows/`: fluxos e automações
- `skills/`: instruções reutilizáveis para agentes (padrão Agent Skills)
- `scripts/`: algoritmos e utilitários
- `mcp-server/`: interface de consulta pelos agentes

Os diretórios aparecerão à medida que arquivos forem adicionados.

## MVP de integração
`mcp-server/cloudflare/` contém um MCP remoto de **demonstração**, com as ferramentas `list_skills`, `search_skills` e `get_skill`.

**Atenção:** o MVP ainda não tem autenticação: NÃO publique skills privadas. As skills de demonstração são intencionalmente fictícias. Antes de qualquer deploy com dados reais, adicionar OAuth e controle de acesso.

O catálogo é incorporado ao build. O servidor não acessa diretamente o repositório privado em tempo real; alterações exigem novo deploy.

## Escrita pelo MCP (MVP)

O servidor oferece uma segunda interface administrativa `/mcp-admin`, separada do endpoint público `/mcp`. Ela permite criar, ler, atualizar, listar e excluir **skills, notes e modes** no GitHub, com histórico de commits e verificação de SHA antes de atualizações/exclusões.

A interface administrativa exige `MCP_ADMIN_TOKEN` e `GITHUB_TOKEN` como secrets no Cloudflare Worker. **Não está pronta para o ChatGPT com OAuth:** requer uma etapa adicional de autenticação OAuth 2.1. Não inclua tokens no repositório nem na conversa.

Consulte [instruções do MCP](mcp-server/cloudflare/README.md).
