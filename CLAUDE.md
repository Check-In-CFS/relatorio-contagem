# Auditoria de Estoque

Sistema interno (Next.js 14 + Supabase local em Docker) que acompanha a
auditoria de estoque por marca, substituindo o relatório de papel. UI em pt-BR.

**Antes de alterar, rodar ou testar qualquer coisa, carregue a skill
`auditoria-estoque`** (`.claude/skills/auditoria-estoque/SKILL.md`): ela tem a
arquitetura, regras de negócio, decisões já tomadas, pendências e as restrições
desta máquina.

**Depois de qualquer implantação no codigo, atualize a skill ou crie uma nova**

Regras que não podem ser esquecidas:
- Há **dados reais** no banco local: nunca rode `npm run db:reset` sem pedido explícito.
- Migrations: nunca edite uma já aplicada; crie arquivo novo em `supabase/migrations/` e rode `npm run db:migrate`.
- Máquina com política de grupo: Supabase CLI, `npx` e `npm` no PowerShell não funcionam.
  Use a ferramenta Bash com `export PATH="/c/Users/castelo/AppData/Local/Programs/node-v24.19.0-win-x64:$PATH"`.
- Subir o sistema: Docker Desktop aberto → `npm run db:up` → `npm run dev` (http://localhost:3000).
- Não rode `next build` com o `npm run dev` do usuário aberto (compartilham `.next`).
- Verificação: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integracao`.

**Ao terminar uma melhoria**: atualizar a skill existente que ficou desatualizada
   pela mudança, OU criar uma nova skill em
   `.claude/skills/dash-<nome>/SKILL.md` documentando o padrão/decisão
   introduzido — o que for não-óbvio, específico deste projeto, e que
   custaria tokens redescobrir numa próxima sessão (não documentar o que
   já é óbvio lendo o código).

Skills devem ser pequenas e focadas em um tópico só — não voltar a
consolidar tudo num arquivo monolítico. Se uma skill crescer demais ou
passar a cobrir dois assuntos, dividir.
