# Auditoria de Estoque

Sistema interno (Next.js 14 + Supabase local em Docker) que acompanha a
auditoria de estoque por marca, substituindo o relatório de papel. UI em pt-BR.

**Antes de alterar, rodar ou testar qualquer coisa, carregue a skill
`auditoria-estoque`** (`.claude/skills/auditoria-estoque/SKILL.md`): ela tem a
arquitetura, regras de negócio, decisões já tomadas, pendências e as restrições
desta máquina.

Regras que não podem ser esquecidas:
- Há **dados reais** no banco local: nunca rode `npm run db:reset` sem pedido explícito.
- Migrations: nunca edite uma já aplicada; crie arquivo novo em `supabase/migrations/` e rode `npm run db:migrate`.
- Máquina com política de grupo: Supabase CLI, `npx` e `npm` no PowerShell não funcionam.
  Use a ferramenta Bash com `export PATH="/c/Users/castelo/AppData/Local/Programs/node-v24.19.0-win-x64:$PATH"`.
- Subir o sistema: Docker Desktop aberto → `npm run db:up` → `npm run dev` (http://localhost:3000).
- Não rode `next build` com o `npm run dev` do usuário aberto (compartilham `.next`).
- Verificação: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integracao`.
