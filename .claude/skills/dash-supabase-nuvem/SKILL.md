---
name: dash-supabase-nuvem
description: Estado da publicação do Auditoria de Estoque no Supabase nuvem (projeto "Relatorio Eixo", ref osldkpeuoynadboazmph) — quais migrations já foram aplicadas, o que falta (RLS desempenho, signup, primeiro admin, variáveis, hospedagem do Next) e armadilhas. Use ao mexer no banco da nuvem, aplicar migration nova lá ou colocar o sistema online.
---

# Supabase nuvem

Projeto: **Relatorio Eixo** · ref `osldkpeuoynadboazmph` · região sa-east-1 ·
org `marcelobdias` · URL `https://osldkpeuoynadboazmph.supabase.co`.
(Outro projeto da org, `ejsodizkrglizojnlezj`, está INACTIVE e não é deste sistema.)

## Migrations aplicadas (via MCP `apply_migration`, 2026-09-30)

O MCP grava com timestamp próprio (não o do nome do arquivo); confira com
`list_migrations`, não pelo nome do arquivo.

| Arquivo local | Na nuvem |
|---|---|
| 20260929120000_schema_inicial | ✅ `schema_inicial` |
| 20260930090000_criar_auditoria_mensagem_duplicidade | ✅ |
| 20260930100000_rls_desempenho | ✅ aplicada pelo usuário no SQL Editor (não aparece em `list_migrations`; conferida pelas policies e os 5 índices) |
| 20260930110000_status_em_contagem | ✅ |
| 20260930110100_inicio_de_marca_e_codigo | ✅ (independe da rls_desempenho; os índices dela usam `if not exists`) |

Toda migration nova precisa ser aplicada **nos dois lugares**: local (`npm run db:migrate`) e nuvem.

## Falta para usar online

Feito em 2026-09-30 (conferido):
- Auth: `disable_signup=true`, `mailer_autoconfirm=true`, provedor Email **ligado**
  (`external.email=true` — se ficar false, ninguém loga). Conferir com
  `curl -H "apikey: <anon>" https://osldkpeuoynadboazmph.supabase.co/auth/v1/settings`.
- Administrador: `dias@casteloforte.com.br` (Marcelo), promovido pelo usuário no SQL Editor
  (o trigger `proteger_campos_profile` libera quando `auth.uid()` é nulo). Novos usuários: tela Usuários.

Pendente:
4. Variáveis (Project Settings → API): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (só servidor). Não trocar o `.env.local` do dev sem pedido —
   ele aponta para o banco local com dados reais.
5. Hospedar o Next.js (ex.: Vercel, repositório Check-In-CFS/relatorio-contagem) com as 3 variáveis.
   `serverActions.bodySizeLimit = 20mb` — na Vercel o corpo de função é limitado a ~4,5 MB;
   importação de contagens grande pode falhar lá (verificar antes).
   Deploy na Vercel falhava: `.npmrc` versionado com `script-shell` Windows (removido em 2026-10-01,
   movido para o `.npmrc` do usuário). `src/lib/supabase/env.ts` lança erro no build se faltar
   `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` — cadastrar na Vercel antes do deploy.
   Sem acesso ao conector Vercel nesta máquina; GitHub não mostrava deployments da Vercel no repo.
6. Dados reais do banco local (empresas, lojas, marcas, auditorias) **não** foram copiados;
   auditorias referenciam `profiles.id` = uuid do usuário no Auth, então copiar exige recriar
   os usuários com os mesmos uuid ou remapear.

## Avisos do Security Advisor (aceitos por ora)

- `search_path` mutável em `normalizar_nome_marca`, `set_atualizado_em`, `rotulo_status_marca` (funções puras, baixo risco).
- `meu_perfil()` executável por anon/authenticated: necessário para as policies; retorna só o perfil de quem chama.
- `handle_new_user()` e `rls_auto_enable()` (esta criada pela própria Supabase) executáveis via RPC:
  dá para `revoke execute ... from anon, authenticated` numa migration futura.
