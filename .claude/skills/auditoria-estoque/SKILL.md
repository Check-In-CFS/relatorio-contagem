---
name: auditoria-estoque
description: Manual do sistema Auditoria de Estoque (pasta RelatorioEixo) — arquitetura Next.js 14 + Supabase local em Docker, modelo de dados, regras de negócio (status de marca, fluxo Iniciar, sugestão por importação do Santri), segurança/RLS, decisões já tomadas, como rodar/testar e as restrições desta máquina Windows (GPO, PowerShell restrito). Use SEMPRE antes de alterar, rodar, testar, depurar ou explicar qualquer parte deste projeto, ou quando o usuário pedir para continuar o desenvolvimento.
---

# Auditoria de Estoque — manual do projeto

Sistema web interno que substitui o papel riscado com marca-texto na auditoria
de estoque por marca, em lojas de material de construção (grupo com várias
empresas: Home Center Castelo Forte, Capital Atacadista). A contagem física
continua no **Santri ADM** (ERP); o sistema só acompanha o progresso das marcas.
Especificação original: `PROMPT-MVP-AUDITORIA-ESTOQUE.md` (leia para detalhes;
este manual registra o que mudou em relação a ela).

Usuário: Marcelo. Fala português do Brasil; UI e mensagens em pt-BR, tom direto.
Identidade visual: skill `identidade-visual-marcelo` (violeta #5B3DF5, menta,
Space Grotesk/Inter/JetBrains Mono, claro/escuro). Logo: `public/logo.png`
(torre branca em quadrado vermelho); favicon `src/app/icon.png`.

## Estado atual (2026-09-30)

Etapas 1–10 da especificação concluídas e extras abaixo. Roda localmente com
dados reais do usuário (2 empresas, 485 marcas cada, auditorias em uso).
Repositório: https://github.com/Check-In-CFS/relatorio-contagem (organização
Check-In-CFS, branch `main`, remoto `origin`). Push via HTTPS com Git Credential
Manager (sem `gh` instalado). Commitar/enviar só quando o usuário pedir; antes de
enviar, conferir que nenhum `.env*`, `.ods` ou senha entrou no commit.

Extras além da especificação, pedidos pelo usuário:
1. **Código da marca** exibido/buscável/ordenável na tela da auditoria
   (`auditoria_marcas.marca_codigo`, copiado na fotografia).
2. **Botão Iniciar**: fluxo pendente → em_contagem → parcial|concluida
   (detalhes em "Regras de negócio").
3. **Gestão de usuários pela tela** (Administração → Usuários): criar usuário
   com nível, redefinir senha, desativar = bloqueio de login no Auth.
4. **Logo** no cabeçalho, login e favicon.
5. **Gerar PDF** das marcas por status na tela da auditoria — ver skill `dash-pdf-marcas`.

Skills focadas complementares (`.claude/skills/dash-*`): `dash-pdf-marcas`,
`dash-diagnostico-dev` (erro 500 no dev do usuário, instância paralela, login via curl),
`dash-supabase-nuvem` (projeto na nuvem: migrations aplicadas e pendências para ir online).

Pendências/ideias em aberto (perguntar antes de fazer):
- Trocar a cor primária (violeta) pelo vermelho da logo — oferecido, sem resposta.
- Importação de contagens hoje pula o "Iniciar" (leva pendente → parcial/concluída
  direto). Oferecido tornar isso restrito — sem resposta.
- Supabase nuvem: em andamento — projeto `osldkpeuoynadboazmph`; estado e o que falta na skill `dash-supabase-nuvem`.
- Build de produção não foi rodado após as últimas mudanças (não rodar
  `next build` enquanto o usuário estiver com `npm run dev` aberto: compartilham `.next`).

## Como rodar

Pré-requisito: Docker Desktop aberto.

```bash
npm run db:up      # sobe Supabase local, gera .env.docker/.env.local, aplica migrations (não apaga dados)
npm run dev        # http://localhost:3000
```

- VS Code: **Ctrl+Shift+B** roda a tarefa "Iniciar sistema" (`.vscode/tasks.json`).
- Studio (tabelas/SQL/usuários): http://localhost:54323 · API: http://127.0.0.1:54321 · Postgres: 127.0.0.1:54322.
- Admin local: `admin@auditoria.local` (senha já informada ao usuário; não
  registrar senhas em arquivos). Para trocar senha: tela Usuários → Redefinir
  senha, ou Studio. `npm run db:admin` só CRIA usuário novo.
- Outros: `db:migrate` (migrations novas), `db:down`, `db:logs`,
  `db:admin -- email senha Nome` (cria administrador).
- **`db:reset` APAGA TODOS OS DADOS** — nunca rodar sem pedido explícito; há dados reais.

## Restrições desta máquina (críticas)

- **Sem admin.** Node 24.19.0 em `%LOCALAPPDATA%\Programs\node-v24.19.0-win-x64`
  (no PATH do usuário). No Bash da sessão prefixe:
  `export PATH="/c/Users/castelo/AppData/Local/Programs/node-v24.19.0-win-x64:$PATH"`.
- **Política de grupo** bloqueia: `cmd.exe` iniciado pelo npm/npx, `npm.cmd`, e o
  binário da **Supabase CLI** (por isso o Supabase roda via compose próprio).
  `script-shell` = Git Bash fica no `.npmrc` do **usuário** (`C:\Users\castelo\.npmrc`),
  NUNCA no do projeto: o `.npmrc` versionado com caminho Windows quebrava o build da Vercel (Linux). `npx` falha → use
  `node node_modules/<pkg>/...` ou scripts do package.json.
- **PowerShell em Constrained Language Mode**: `npm` não roda no PowerShell do
  usuário. Terminal padrão do VS Code no projeto = Git Bash (`.vscode/settings.json`).
  Alternativa no PowerShell: `& "$n\node.exe" "$n\node_modules\npm\bin\npm-cli.js" run dev`.
  Nas ferramentas do Claude, prefira a ferramenta Bash.
- Python real: `C:\Users\castelo\AppData\Local\Python\bin\python.exe` (o do PATH é alias da Store).
- Heredoc com aspas simples às vezes falha no parser do Bash da ferramenta:
  para editar SQL/arquivos grandes use Write/Edit ou um script Python.
- **Nunca gravar o PATH** sem ler antes via `reg query HKCU\Environment`
  (um `setx` já apagou o PATH do usuário uma vez).

## Arquitetura

- Next.js 14 App Router + TypeScript 5.9 + Tailwind 3 + Zod 4 + SheetJS 0.20.3 (CDN tarball) + Vitest 5.
- `@supabase/ssr`: `src/lib/supabase/{client,server,middleware}.ts`; `admin.ts`
  (service_role, `import 'server-only'`) só após `exigirPerfil('administrador')`.
- `src/middleware.ts` redireciona não logado → `/login` (só UX; segurança = RLS).
- `src/lib/auth.ts`: `obterSessao` (cache por request), `exigirSessao`, `exigirPerfil`.
- Server actions validam com Zod e chamam **funções SQL** (RPC) atômicas.
- Resultados de action: `Resultado<T>` (`src/lib/acoes.ts`); `mensagemDoBanco`
  traduz erros (P0001/42501 = mensagem da nossa função, já em pt-BR).
- PostgREST limita 1000 linhas: use `buscarTodas` (`src/lib/paginacao.ts`) ou `count`.
- Importações: `.ods` lido **no navegador** (pré-visualização); na confirmação o
  servidor revalida com Zod e **recalcula** sugestões (nunca confia no cliente).
  `serverActions.bodySizeLimit = 20mb`.

Mapa: `src/app/(app)/` (painel, auditorias, admin/*), `src/app/login/`,
`src/components/ui.tsx` (Botao, Cartao, Campo[forwardRef], Selecao, SeloStatus,
BarraProgresso...), `src/lib/parsers/` (relatórios Santri), `src/lib/sugestao.ts`,
`src/lib/usuarios.ts`, `docker/supabase/` (compose, nginx, init SQL, aplicar-migrations.sh),
`scripts/supabase-local.mjs` (gera segredos/.env, cria admin).

## Supabase local (docker/supabase)

Compose próprio (projeto `auditoria-supabase`) com imagens do self-hosting oficial:
supabase/postgres 17.6.1.136, gotrue v2.196.0, postgrest v14.17, nginx (gateway
em :54321 roteando `/auth/v1`, `/rest/v1` + CORS — GoTrue não aceita header
`apikey` no CORS), postgres-meta + studio (:54323). Serviço `migrate` (profile
`ferramentas`) aplica `supabase/migrations/*.sql` em ordem, cada arquivo em
**uma transação**, registrando em `supabase_migrations.schema_migrations`, e
faz `notify pgrst, 'reload schema'`. Segredos em `.env.docker` (gitignored);
`.env.local` recebe URL, anon key e `SUPABASE_SERVICE_ROLE_KEY` (só servidor).
Signup público desativado; e-mail autoconfirmado (não há SMTP).

## Banco — migrations (em ordem)

1. `20260929120000_schema_inicial.sql` — SQL da especificação + AJUSTES 1–4:
   enum de contagem com 6 status; `meu_perfil()` ignora usuário inativo;
   evento só por quem vê a auditoria e em nome próprio; trigger impede
   autopromoção de perfil. Índice único: 1 auditoria `em_andamento` por loja.
   RPCs: `criar_auditoria`, `atualizar_status_marca`, `finalizar_auditoria`,
   `importar_marcas`, `importar_contagens`, `normalizar_nome_marca`.
   View `auditorias_resumo` (`security_invoker = true`).
2. `20260930090000_...duplicidade.sql` — `criar_auditoria` traduz unique_violation
   (auditor não enxerga auditoria de outro pela RLS).
3. `20260930100000_rls_desempenho.sql` — policies com `(select auth.uid())` /
   `(select meu_perfil())` (evita timeout de 8 s em ~18 mil itens) + índices de FK.
4. `20260930110000_status_em_contagem.sql` — enum `status_marca` ganha
   `em_contagem` após `pendente` (arquivo isolado: valor novo de enum não pode ser
   usado na mesma transação).
5. `20260930110100_inicio_de_marca_e_codigo.sql` — `marca_codigo`, `iniciada_em`,
   `iniciada_por`; transições manuais; `rotulo_status_marca`; view com
   `marcas_em_contagem`.

Regras para migrations novas: **nunca editar uma já aplicada** — criar arquivo
novo `AAAAMMDDHHMMSS_descricao.sql`; funções SECURITY INVOKER (RLS vale);
envolver `auth.*`/`meu_perfil()` em `(select ...)` nas policies; `create or
replace view` só acrescenta colunas no fim; depois `npm run db:migrate`.

## Regras de negócio

- **Status pertence a Auditoria+Marca**, nunca à marca. Criar auditoria
  **fotografa** marcas ativas (nome e código copiados).
- Marcas nunca são apagadas: reimportação cria/atualiza/reativa; ausentes → `ativo=false`.
- `status_marca`: `pendente < em_contagem < parcial < concluida` (a ordem do enum
  é usada para "nunca rebaixar").
- **Transições manuais** (enforçadas em `atualizar_status_marca`):
  pendente→em_contagem (Iniciar, grava `iniciada_em`); em_contagem→parcial|concluida|pendente
  (desfazer limpa `iniciada_em`); parcial→em_contagem (Retomar, mantém horário);
  concluida→em_contagem (Reabrir). Pendente→parcial/concluída é recusado
  ("Inicie a marca antes...").
- Eventos (`eventos_auditoria`): auditoria_criada, marca_iniciada, inicio_desfeito,
  status_alterado, marca_reaberta, observacao_alterada, importacao_aplicada, auditoria_finalizada.
- Finalizar com pendências: aviso na tela; depois de finalizada não aceita mudanças.
- **Sugestão por importação de contagens** (`src/lib/sugestao.ts` + `importar_contagens`):
  agrega por ITEM todas as contagens do arquivo; Cancelada ignorada; alguma Baixada →
  concluida; senão Contada/Recontada → parcial; Aberta/Em contagem ignoradas; nunca
  rebaixa; aplica só na auditoria em andamento da loja; casa marca **por nome
  normalizado** (upper, trim, espaços) — o relatório não traz código da marca.
  Contagens anteriores ao início da auditoria também contam (decisão não definida
  na especificação).
- Perfis: auditor (só as próprias auditorias), gestor (vê tudo, importa
  contagens), administrador (tudo + cadastros, usuários, importar marcas).
  Admin não pode rebaixar/desativar a si mesmo. Desativar = `profiles.ativo=false`
  + ban no GoTrue (`sincronizarBloqueio`).
- Cuidado: update bloqueado pela RLS **não dá erro, afeta 0 linhas** — use
  `.select('id')` e confira o tamanho quando importar.

## Relatórios do Santri (formatos reais)

- **Ordens de Contagens Acompanhadas Analítico** (`parsers/contagens.ts`): blocos
  "Contagem" (nº col 0, inserção 1, status 2, local 3, usuário 4, baixa 23) →
  cabeçalho de itens (Produto 1, Nome 2, Marca 3) → itens (estoque físico 9,
  qtd contada 10, dif 12) → linha em branco; rodapé "Filtros Selecionados" com
  `Empresa: 1 - CFS` e `Data da inserção:dd/mm/aaaa até dd/mm/aaaa`. Números/datas
  pt-BR como texto ("43.574", "-1.131,46", "29/09/26 09:12:12" → -03:00).
  Status reais: Aberta, Em contagem, Contada, Recontada, Baixada, Cancelada.
  Arquivo real de teste: `C:/Users/castelo/Desktop/Relatorios-Logistica-Marcio/Arquivos_ods/contagens_acompanhadas 2026 9.ods`
  (1.537 contagens, 17.960 itens; importa em ~0,6 s).
- **Relação de Produtos por Marca** (`parsers/marcas.ts`): linha de colunas
  `Código | Nome | | | Total`, uma marca por linha até branco/"Filtros Selecionados";
  código "1.625" → 1625. Validado pelo usuário com arquivo real (485 marcas).
- `.ods` estão no `.gitignore` (dados da empresa).

## Testes

- `npm test` — unitários (parsers, sugestão; inclui leitura do arquivo real se existir).
- `npm run test:integracao` — contra o banco local: fluxo completo, RLS entre
  auditor/gestor/admin, Iniciar/transições, importação real, gestão de usuários.
  Cria dados com sufixo único e **apaga tudo no afterAll** (o banco é o mesmo
  dos dados reais do usuário — confira depois que só restaram as empresas reais).
- `npm run typecheck`, `npm run lint`.
- Para testar telas logado sem navegador: gerar cookie `sb-127-auth-token=base64-<session base64url>`
  com supabase-js `signInWithPassword` e usar no curl.

## Agentes do projeto (`.claude/agents/`)

`designer-ux-ui`, `seguranca`, `testes` — só usar se o usuário pedir.
