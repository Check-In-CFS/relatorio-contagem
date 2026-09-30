# Prompt para o Claude Code — MVP "Auditoria de Estoque"

> Cole este arquivo inteiro como primeira mensagem para o Claude Code (ou
> salve como `CLAUDE.md` na raiz do projeto). Ele contém tudo que foi
> decidido na fase de análise: o problema, o modelo de dados, as regras de
> negócio e o plano de execução. Não invente estrutura de planilha nem
> regra de negócio que não esteja aqui — o que está descrito veio de dados
> reais exportados do sistema da empresa (Santri ADM).

## 1. Contexto

Sistema web interno para uma equipe de auditoria de estoque de uma empresa
de materiais de construção (grupo com múltiplas empresas/lojas). Hoje o
processo é manual: o auditor imprime um relatório de marcas, faz a
contagem física no sistema principal (Santri ADM) e risca cada marca no
papel com marca-texto conforme termina. O papel virou um controle
paralelo porque o sistema principal não tem essa visão de acompanhamento.

Este sistema **não substitui** a contagem física (que continua sendo feita
no Santri ADM). Ele só acompanha o progresso: quais marcas já foram
contadas, quais estão parciais, quais faltam — eliminando o papel.

**Princípio mais importante:** tem que ser muito simples para o auditor.
Ele precisa responder rápido: quais marcas já contei, quais estão
parciais, quais faltam, quanto já foi concluído.

## 2. Stack

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (Postgres + Auth + Row Level Security)
- **Tailwind CSS**
- **Zod** para validação
- **xlsx (SheetJS)** para ler os relatórios `.ods` exportados do Santri ADM

Priorize simplicidade, segurança, manutenção, performance e possibilidade
de crescimento — nessa ordem. Não confie no frontend como mecanismo de
segurança: toda regra de acesso precisa estar em RLS no Postgres, o
frontend é só UX.

## 3. Decisão central de modelagem

**O status de uma marca pertence à relação Auditoria + Marca, nunca à
marca em si.** A mesma marca pode estar `concluída` numa auditoria de uma
loja e `pendente` em outra auditoria de outra loja, ao mesmo tempo. Toda a
modelagem abaixo existe para respeitar isso.

## 4. Entidades e por que existem

| Entidade | Origem | Observação |
|---|---|---|
| `empresas` | cadastro manual | ex.: Castelo Forte (CFS), Capital |
| `lojas` | cadastro manual | pertence a uma empresa |
| `profiles` (usuários) | cadastro manual via Supabase Auth | perfil: auditor / gestor / administrador |
| `marcas` | **importadas** do relatório "Relação de Produtos por Marca" do Santri | reconciliadas por código a cada reimportação |
| `auditorias` | criadas no app | uma auditoria = um trabalho de contagem numa loja |
| `auditoria_marcas` | criadas no app | **fotografia** das marcas ativas no momento da criação da auditoria + status atual |
| `eventos_auditoria` | gerados pelo app | log append-only: quem fez o quê, quando |
| `contagens_santri` / `contagens_santri_itens` | **importadas** do relatório "Ordens de Contagens Acompanhadas" do Santri | histórico bruto, usado para **sugerir** status |

### Por que "fotografia" de marcas na auditoria?

Se o cadastro de marcas mudar depois, auditorias já criadas não podem ser
afetadas. Por isso, ao criar uma auditoria, copiamos a lista de marcas
ativas da empresa para `auditoria_marcas` (com o nome da marca também
copiado, não só a referência).

### Por que nunca apagar marca?

Reimportar o relatório de marcas é rotina (marcas novas aparecem sempre
que a empresa cadastra produtos novos). Uma marca que sumiu do relatório
(porque zerou o estoque, por exemplo) é **desativada**, nunca apagada —
ela pode estar referenciada em auditorias antigas e isso quebraria o
histórico.

### Por que "sugestão" e não status automático definitivo?

O relatório de contagens do Santri tem uma estrutura real observada:
- Uma "Contagem" (ordem de contagem) pode ter status `Baixada`
  (confirmada), `Cancelada` (ignorar) ou `Contada` (ainda não confirmada).
- **Uma Contagem pode misturar produtos de mais de uma marca** — não dá
  para assumir 1 Contagem = 1 marca.
- **Uma marca é tocada por várias Contagens diferentes** ao longo do
  período (às vezes 80+ contagens para a mesma marca no mês), algumas
  Baixadas, outras Canceladas.
- O sistema **não tem** uma lista de "todos os produtos que uma marca
  deveria ter" — só o total em estoque. Por isso ele nunca pode ter 100%
  de certeza de que uma marca foi totalmente contada.

Por isso: a importação de contagens **sugere** o status (marca como
`sugerido_importacao` a origem do valor), mas o auditor sempre pode
sobrescrever manualmente a qualquer momento (`manual`). A sugestão nunca
rebaixa um status que já esteja mais avançado (não derruba `concluída`
para `parcial`, por exemplo).

## 5. Schema do banco (SQL completo — rode como está)

Crie um projeto Supabase e rode esta migration completa. **Não altere a
lógica de RLS sem entender o motivo de cada policy** — auditor só vê as
próprias auditorias, gestor/administrador veem tudo, admin gerencia
cadastros.

```sql
-- =========================================================================
-- Auditoria de Estoque — schema inicial (MVP)
-- =========================================================================
create extension if not exists "pgcrypto";

create type perfil_usuario as enum ('auditor', 'gestor', 'administrador');
create type status_auditoria as enum ('em_andamento', 'concluida', 'cancelada');
create type status_marca as enum ('pendente', 'parcial', 'concluida');
create type origem_status as enum ('manual', 'sugerido_importacao');
create type status_contagem_santri as enum ('baixada', 'cancelada', 'contada');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  perfil perfil_usuario not null default 'auditor',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nome, perfil)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', new.email),
    'auditor'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.lojas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete restrict,
  nome text not null,
  codigo_interno text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete restrict,
  codigo_santri integer not null,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, codigo_santri)
);

create table public.importacoes_marcas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete restrict,
  arquivo_nome text not null,
  total_linhas_lidas integer not null default 0,
  total_marcas_novas integer not null default 0,
  total_marcas_reativadas integer not null default 0,
  total_marcas_desativadas integer not null default 0,
  importado_por uuid not null references public.profiles (id),
  importado_em timestamptz not null default now()
);

create table public.auditorias (
  id uuid primary key default gen_random_uuid(),
  numero serial,
  empresa_id uuid not null references public.empresas (id) on delete restrict,
  loja_id uuid not null references public.lojas (id) on delete restrict,
  auditor_id uuid not null references public.profiles (id),
  status status_auditoria not null default 'em_andamento',
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  criado_em timestamptz not null default now()
);

create table public.auditoria_marcas (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references public.auditorias (id) on delete cascade,
  marca_id uuid not null references public.marcas (id) on delete restrict,
  marca_nome text not null,
  status status_marca not null default 'pendente',
  status_origem origem_status not null default 'manual',
  observacao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id),
  unique (auditoria_id, marca_id)
);

create table public.eventos_auditoria (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references public.auditorias (id) on delete cascade,
  auditoria_marca_id uuid references public.auditoria_marcas (id) on delete set null,
  tipo text not null,
  descricao text not null,
  status_anterior status_marca,
  status_novo status_marca,
  usuario_id uuid references public.profiles (id),
  criado_em timestamptz not null default now()
);

create table public.importacoes_contagem (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete restrict,
  arquivo_nome text not null,
  periodo_inicio date,
  periodo_fim date,
  total_contagens_lidas integer not null default 0,
  importado_por uuid not null references public.profiles (id),
  importado_em timestamptz not null default now()
);

create table public.contagens_santri (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.importacoes_contagem (id) on delete cascade,
  numero_contagem integer not null,
  status status_contagem_santri not null,
  local_interno text,
  usuario_contagem text,
  data_insercao timestamptz,
  data_baixa timestamptz,
  unique (importacao_id, numero_contagem)
);

create table public.contagens_santri_itens (
  id uuid primary key default gen_random_uuid(),
  contagem_santri_id uuid not null references public.contagens_santri (id) on delete cascade,
  marca_nome text not null,
  produto_codigo text,
  produto_nome text,
  estoque_fisico numeric,
  qtd_contada numeric,
  diferenca numeric
);

create function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trg_marcas_atualizado_em
  before update on public.marcas
  for each row execute procedure public.set_atualizado_em();

create trigger trg_auditoria_marcas_atualizado_em
  before update on public.auditoria_marcas
  for each row execute procedure public.set_atualizado_em();

alter table public.profiles enable row level security;
alter table public.empresas enable row level security;
alter table public.lojas enable row level security;
alter table public.marcas enable row level security;
alter table public.importacoes_marcas enable row level security;
alter table public.auditorias enable row level security;
alter table public.auditoria_marcas enable row level security;
alter table public.eventos_auditoria enable row level security;
alter table public.importacoes_contagem enable row level security;
alter table public.contagens_santri enable row level security;
alter table public.contagens_santri_itens enable row level security;

create function public.meu_perfil()
returns perfil_usuario
language sql stable security definer set search_path = public
as $$
  select perfil from public.profiles where id = auth.uid();
$$;

create policy "profiles: leitura autenticada" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles: admin gerencia" on public.profiles
  for all using (public.meu_perfil() = 'administrador');
create policy "profiles: usuario edita a si mesmo" on public.profiles
  for update using (id = auth.uid());

create policy "empresas: leitura autenticada" on public.empresas
  for select using (auth.role() = 'authenticated');
create policy "empresas: admin gerencia" on public.empresas
  for all using (public.meu_perfil() = 'administrador');

create policy "lojas: leitura autenticada" on public.lojas
  for select using (auth.role() = 'authenticated');
create policy "lojas: admin gerencia" on public.lojas
  for all using (public.meu_perfil() = 'administrador');

create policy "marcas: leitura autenticada" on public.marcas
  for select using (auth.role() = 'authenticated');
create policy "marcas: admin gerencia" on public.marcas
  for all using (public.meu_perfil() = 'administrador');

create policy "importacoes_marcas: leitura autenticada" on public.importacoes_marcas
  for select using (auth.role() = 'authenticated');
create policy "importacoes_marcas: admin gerencia" on public.importacoes_marcas
  for all using (public.meu_perfil() = 'administrador');

create policy "auditorias: auditor ve as proprias" on public.auditorias
  for select using (
    auditor_id = auth.uid() or public.meu_perfil() in ('gestor', 'administrador')
  );
create policy "auditorias: auditor cria as proprias" on public.auditorias
  for insert with check (auditor_id = auth.uid());
create policy "auditorias: auditor atualiza as proprias" on public.auditorias
  for update using (
    auditor_id = auth.uid() or public.meu_perfil() in ('gestor', 'administrador')
  );

create policy "auditoria_marcas: segue a auditoria" on public.auditoria_marcas
  for select using (
    exists (
      select 1 from public.auditorias a
      where a.id = auditoria_id
        and (a.auditor_id = auth.uid() or public.meu_perfil() in ('gestor', 'administrador'))
    )
  );
create policy "auditoria_marcas: auditor atualiza da sua auditoria" on public.auditoria_marcas
  for update using (
    exists (
      select 1 from public.auditorias a
      where a.id = auditoria_id
        and (a.auditor_id = auth.uid() or public.meu_perfil() in ('gestor', 'administrador'))
    )
  );
create policy "auditoria_marcas: insercao pelo dono da auditoria" on public.auditoria_marcas
  for insert with check (
    exists (
      select 1 from public.auditorias a
      where a.id = auditoria_id
        and (a.auditor_id = auth.uid() or public.meu_perfil() in ('gestor', 'administrador'))
    )
  );

create policy "eventos_auditoria: segue a auditoria" on public.eventos_auditoria
  for select using (
    exists (
      select 1 from public.auditorias a
      where a.id = auditoria_id
        and (a.auditor_id = auth.uid() or public.meu_perfil() in ('gestor', 'administrador'))
    )
  );
create policy "eventos_auditoria: insercao autenticada" on public.eventos_auditoria
  for insert with check (auth.role() = 'authenticated');

create policy "importacoes_contagem: leitura autenticada" on public.importacoes_contagem
  for select using (auth.role() = 'authenticated');
create policy "importacoes_contagem: admin/gestor gerencia" on public.importacoes_contagem
  for all using (public.meu_perfil() in ('gestor', 'administrador'));

create policy "contagens_santri: leitura autenticada" on public.contagens_santri
  for select using (auth.role() = 'authenticated');
create policy "contagens_santri: admin/gestor gerencia" on public.contagens_santri
  for all using (public.meu_perfil() in ('gestor', 'administrador'));

create policy "contagens_santri_itens: leitura autenticada" on public.contagens_santri_itens
  for select using (auth.role() = 'authenticated');
create policy "contagens_santri_itens: admin/gestor gerencia" on public.contagens_santri_itens
  for all using (public.meu_perfil() in ('gestor', 'administrador'));

create index idx_marcas_empresa on public.marcas (empresa_id);
create index idx_auditorias_loja on public.auditorias (loja_id);
create index idx_auditorias_auditor on public.auditorias (auditor_id);
create index idx_auditoria_marcas_auditoria on public.auditoria_marcas (auditoria_id);
create index idx_eventos_auditoria_auditoria on public.eventos_auditoria (auditoria_id);
create index idx_contagens_santri_itens_marca on public.contagens_santri_itens (marca_nome);
create index idx_contagens_santri_importacao on public.contagens_santri (importacao_id);
```

## 6. Parsers dos relatórios do Santri (.ods) — formatos reais

Os dois relatórios **não são planilhas limpas** — são relatórios impressos
convertidos em `.ods`, com cabeçalho, rodapé e cada célula vindo com `\n`
embutido. Use a biblioteca `xlsx` (SheetJS), que lê `.ods` nativamente.

### 6.1. Relação de Produtos por Marca

Estrutura: linhas 0-3 cabeçalho do relatório; a partir da linha onde as
colunas são `Código | Nome | (vazio) | (vazio) | Total`, uma linha por
marca, até encontrar linha em branco ou o texto "Filtros Selecionados"
(início do rodapé). Código vem formatado com separador de milhar (ex.:
`"1.625"` → `1625`).

Regra de reconciliação na importação (roda toda vez que o arquivo é
reimportado):
- código já existe na empresa → atualiza nome, marca `ativo = true`
- código não existe → cria marca nova
- código existia mas não apareceu neste arquivo → marca `ativo = false`
  (nunca apaga)

### 6.2. Ordens de Contagens Acompanhadas Analítico

Estrutura de **blocos aninhados**, repetidos até "TOTAL GERAL" / "Filtros
Selecionados":

```
[linha "Contagem"]  → nº, Data/hora de inserção, Status (Baixada/Cancelada/Contada),
                       Local (depósito interno, NÃO é loja), Usuário da contagem, ...,
                       Data/hora baixa (coluna 24, índice 23 zero-based)
[linha de cabeçalho de item] → Produto, Nome, Marca, ...
[linhas de item]    → Produto (código), Nome, Marca, ..., Estoque físico (índice 9),
                       Qtd. contada (índice 10), Dif. qtd. contada (índice 12)
[linha em branco]
```

Pontos confirmados analisando um arquivo real (setembro/2026, 1.379
contagens, 16.135 itens): ~92% dos blocos têm uma única marca, mas ~8%
misturam mais de uma marca no mesmo bloco — **sempre agregue por item, não
pelo bloco inteiro**. Cerca de 91% das marcas do mês foram tocadas por
mais de uma Contagem, e ~30% delas tiveram Contagens com status misto
(algumas Baixadas, outras Canceladas) — **uma marca só deve ser
considerada concluída depois de agregar todas as Contagens do período**,
nunca por uma única Contagem isolada.

Regra de sugestão de status (aplicada às marcas da auditoria em andamento
da loja selecionada na importação):
- ignore Contagens `Cancelada`
- se pelo menos uma Contagem `Baixada` tocou a marca → sugere `concluida`
- senão, se alguma Contagem (`Baixada` ou `Contada`) tocou a marca →
  sugere `parcial`
- nunca rebaixa um status já mais avançado (`concluida` > `parcial` >
  `pendente`)
- toda mudança sugerida grava evento em `eventos_auditoria` com
  `tipo = 'importacao_aplicada'`

## 7. Fluxo de telas do MVP

```
Login
  → Dashboard (auditoria em andamento, recentes, contador de concluídas)
  → Nova auditoria (seleciona empresa → loja; ao criar, fotografa as
    marcas ativas da empresa para auditoria_marcas)
  → Tela da auditoria (a mais importante):
      - progresso (%, concluídas/parciais/pendentes), duração automática
      - busca por nome, filtro (todas/pendentes/parciais/concluídas),
        ordenação (A-Z, Z-A, pendentes primeiro, mais recentes)
      - cada marca: toque rápido troca status (Pendente/Parcial/Concluída),
        com campo de observação opcional
      - finalizar: se houver pendentes/parciais, avisa e pede confirmação
        ("existem marcas pendentes, deseja finalizar mesmo assim?")
Administração (gestor/administrador):
  → Empresas (CRUD simples)
  → Lojas (CRUD simples, vinculada a uma empresa)
  → Usuários (definir perfil: auditor/gestor/administrador — cadastro em
    si acontece pelo Supabase Auth, aqui só se define o perfil)
  → Importar marcas (upload → validação → pré-visualização com contagem
    de novas/reativadas/desativadas → confirmação)
  → Importar contagens (upload → pré-visualização com contagem de
    contagens/itens/marcas e resumo da sugestão que será aplicada →
    confirmação, aplica sugestões na auditoria em andamento da loja)
```

## 8. Ordem de execução recomendada

1. Rodar a migration no Supabase, criar o primeiro usuário e promovê-lo a
   `administrador` via SQL.
2. Scaffold do projeto (Next.js + Tailwind + clients Supabase
   browser/server/middleware + proteção de rotas).
3. Login + layout autenticado com navegação (Dashboard / Administração).
4. CRUD de Empresas e Lojas (bloqueia tudo mais até existir pelo menos uma
   loja).
5. Parser + tela de importação de marcas.
6. Fluxo completo de auditoria: criar → tela da auditoria (lista, busca,
   filtro, ordenação, toggle de status, observação) → finalizar.
7. Log de eventos (gravado a cada mudança de status e a cada finalização).
8. Parser + tela de importação de contagens, com aplicação de sugestões.
9. Dashboard com números reais (concluídas, em andamento, recentes).
10. Revisão de RLS: testar com um usuário `auditor` de verdade que ele não
    enxerga auditorias de outro auditor, e que `gestor`/`administrador`
    enxergam tudo.

## 9. Fora de escopo neste MVP (não implementar agora)

ERP completo, sistema de estoque, PDV, emissão fiscal, contagem individual
de produto a produto, integração direta com o ERP, aplicativo mobile
nativo, modo offline completo, IA, BI avançado, notificações complexas,
automações complexas. Podem ser avaliados depois.

## 10. Critério de sucesso

O sistema é bem-sucedido se elimina: imprimir relatório → levar papel para
a loja → contar marcas → usar marca-texto → guardar papel. Substituindo
por: abrir sistema → iniciar auditoria → visualizar marcas → marcar status
→ acompanhar progresso → finalizar → histórico armazenado automaticamente.

---

**Se você (Claude Code) já receber uma pasta de projeto com esse mesmo
nome contendo `package.json`, `src/` e `supabase/migrations/`, é um
scaffold inicial já criado a partir desta mesma especificação — continue a
partir dele em vez de recomeçar do zero.**
