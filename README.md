# Auditoria de Estoque — MVP

Acompanha o progresso das auditorias de estoque por marca (pendente / parcial /
concluída) e substitui o relatório impresso riscado com marca-texto. A contagem
física continua sendo feita no Santri ADM. Especificação completa em
[PROMPT-MVP-AUDITORIA-ESTOQUE.md](PROMPT-MVP-AUDITORIA-ESTOQUE.md).

Stack: Next.js 14 (App Router) · Supabase (Postgres + Auth + RLS) · Tailwind · Zod · SheetJS.

## Rodando localmente (Docker)

Requer Docker Desktop. A Supabase CLI não é usada (bloqueada nesta máquina); o
stack fica em [docker/supabase/](docker/supabase/docker-compose.yml).

```bash
npm install
npm run db:up                                   # sobe o Supabase, gera .env.docker/.env.local e aplica as migrations
npm run db:admin -- email@exemplo.com Senha Nome # cria um usuário administrador
npm run dev                                     # http://localhost:3000
```

| Endereço | O quê |
|---|---|
| http://localhost:3000 | o app |
| http://localhost:54323 | Supabase Studio (tabelas, SQL, usuários) |
| http://127.0.0.1:54321 | API (auth + rest) |
| 127.0.0.1:54322 | Postgres (usuário `postgres`, senha no `.env.docker`) |

Outros comandos: `db:migrate` (aplica migrations novas), `db:down`, `db:reset`
(**apaga todos os dados**), `db:logs`, `test` (unitários) e `test:integracao`
(fluxo completo e RLS contra o banco local; apaga os dados de teste ao terminar).

## Rodando com Supabase na nuvem

1. **Banco** — aplique, em ordem, os arquivos de [supabase/migrations/](supabase/migrations/) (o primeiro é [supabase/migrations/20260929120000_schema_inicial.sql](supabase/migrations/20260929120000_schema_inicial.sql)
   [20260929120000_schema_inicial.sql](supabase/migrations/20260929120000_schema_inicial.sql))
   no SQL Editor do projeto.
2. **Primeiro usuário** — crie em *Authentication → Users → Add user* e promova no SQL Editor:
   ```sql
   update public.profiles set perfil = 'administrador', nome = 'Seu Nome'
   where id = (select id from auth.users where email = 'voce@empresa.com.br');
   ```
3. **Variáveis** — copie `.env.example` para `.env.local` e preencha URL, anon key e
   service_role key (*Project Settings → API*). A service_role fica só no servidor
   (sem prefixo `NEXT_PUBLIC_`) e é usada para criar usuários pela tela.
4. **App**
   ```bash
   npm install
   npm run dev      # http://localhost:3000
   npm test         # parsers e regra de sugestão
   ```

Ordem de uso: Empresas → Lojas → Importar marcas → Nova auditoria → (opcional)
Importar contagens.

Usuários: o administrador cria os acessos em *Administração → Usuários* (nome,
e-mail, senha inicial e nível), redefine senhas e desativa quem sai — o usuário
desativado tem o login bloqueado no Auth. O sistema não envia e-mail: a senha é
repassada pelo administrador.

## Decisões que vão além da especificação

Todas estão comentadas na migration (`AJUSTE 1..4`) ou no código:

- **Status de contagem do Santri**: o relatório real de set/2026 traz seis status
  (Aberta, Em contagem, Contada, Recontada, Baixada, Cancelada), não três. O enum
  tem os seis. Na sugestão, Recontada conta como Contada (→ parcial); Aberta e Em
  contagem são ignoradas (a contagem ainda não aconteceu).
- **Segurança**: usuário não consegue mais se autopromover a administrador
  (trigger em `profiles`); só grava evento quem enxerga a auditoria, em nome
  próprio; usuário desativado perde os poderes de gestor/admin.
- **Operações atômicas** em funções SQL `security invoker` (a RLS continua
  valendo): `criar_auditoria`, `atualizar_status_marca`, `finalizar_auditoria`,
  `importar_marcas`, `importar_contagens`.
- **Uma auditoria em andamento por loja** (índice único parcial) — é nela que a
  importação de contagens aplica as sugestões.
- **Casamento de marcas nas contagens é por nome** (o relatório não traz o código
  da marca), normalizado em maiúsculas e espaços. A pré-visualização lista as
  marcas que não casaram.
- **Importações**: o `.ods` é lido no navegador para a pré-visualização; na
  confirmação o servidor revalida tudo com Zod e recalcula as sugestões.

## Estrutura

```
supabase/migrations/     schema, RLS, funções e view auditorias_resumo
src/lib/parsers/         leitura dos relatórios do Santri (+ testes)
src/lib/sugestao.ts      regra de sugestão de status
src/app/login/           login
src/app/(app)/           painel, auditorias, administração
```

## Observações desta máquina

- O Node está em `%LOCALAPPDATA%\Programs\node-v24.19.0-win-x64` (instalado sem admin).
- A política de grupo bloqueia o `cmd.exe` iniciado pelo npm e o binário da
  Supabase CLI; o `.npmrc` do projeto faz o npm rodar scripts pelo Git Bash.
- O Docker Desktop roda sobre o WSL 2.
