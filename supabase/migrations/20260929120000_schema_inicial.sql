-- =========================================================================
-- Auditoria de Estoque — schema inicial (MVP)
-- =========================================================================
create extension if not exists "pgcrypto";

create type perfil_usuario as enum ('auditor', 'gestor', 'administrador');
create type status_auditoria as enum ('em_andamento', 'concluida', 'cancelada');
create type status_marca as enum ('pendente', 'parcial', 'concluida');
create type origem_status as enum ('manual', 'sugerido_importacao');
-- AJUSTE 1 em relação à especificação: o relatório real de set/2026 traz seis
-- status, não três (Aberta, Em contagem, Contada, Recontada, Baixada,
-- Cancelada). Sem os valores extras a importação quebraria.
create type status_contagem_santri as enum (
  'aberta', 'em_contagem', 'contada', 'recontada', 'baixada', 'cancelada'
);

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
  -- AJUSTE 2: usuário desativado perde os poderes de gestor/administrador.
  select perfil from public.profiles where id = auth.uid() and ativo;
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
-- AJUSTE 3: a especificação deixava qualquer autenticado gravar evento em
-- qualquer auditoria, em nome de qualquer usuário. O log precisa ser confiável:
-- só grava quem enxerga a auditoria, e sempre em nome próprio.
create policy "eventos_auditoria: insercao pelo dono da auditoria" on public.eventos_auditoria
  for insert with check (
    usuario_id = auth.uid()
    and exists (
      select 1 from public.auditorias a
      where a.id = auditoria_id
        and (a.auditor_id = auth.uid() or public.meu_perfil() in ('gestor', 'administrador'))
    )
  );

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

-- =========================================================================
-- Complementos à especificação (regras de integridade e operações atômicas)
-- =========================================================================

-- AJUSTE 4: a policy "usuario edita a si mesmo" permitia que um auditor
-- fizesse `update profiles set perfil = 'administrador'` no próprio registro.
-- Mantemos a policy (o usuário pode trocar o próprio nome), mas perfil e
-- ativo só mudam pelas mãos de um administrador. auth.uid() nulo = SQL Editor
-- / service role, usado para promover o primeiro administrador.
create function public.proteger_campos_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.perfil is distinct from old.perfil or new.ativo is distinct from old.ativo)
     and public.meu_perfil() is distinct from 'administrador' then
    raise exception 'Somente administradores podem alterar perfil ou situação de usuários.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_profiles_proteger_campos
  before update on public.profiles
  for each row execute procedure public.proteger_campos_profile();

-- Uma loja tem no máximo uma auditoria em andamento: é nela que a importação
-- de contagens aplica as sugestões.
create unique index uq_auditoria_em_andamento_por_loja
  on public.auditorias (loja_id) where status = 'em_andamento';

-- As funções abaixo são SECURITY INVOKER (padrão): rodam com as permissões de
-- quem chama, então toda a RLS acima continua valendo. Elas existem para que
-- cada operação (mudar status + gravar evento, por exemplo) seja atômica.

-- Cria a auditoria e fotografa as marcas ativas da empresa da loja.
create function public.criar_auditoria(p_loja_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_empresa_id uuid;
  v_auditoria_id uuid;
  v_total integer;
begin
  select empresa_id into v_empresa_id
  from lojas where id = p_loja_id and ativo;
  if v_empresa_id is null then
    raise exception 'Loja não encontrada ou inativa.';
  end if;

  if exists (select 1 from auditorias where loja_id = p_loja_id and status = 'em_andamento') then
    raise exception 'Esta loja já tem uma auditoria em andamento.';
  end if;

  insert into auditorias (empresa_id, loja_id, auditor_id)
  values (v_empresa_id, p_loja_id, auth.uid())
  returning id into v_auditoria_id;

  insert into auditoria_marcas (auditoria_id, marca_id, marca_nome)
  select v_auditoria_id, m.id, m.nome
  from marcas m
  where m.empresa_id = v_empresa_id and m.ativo;
  get diagnostics v_total = row_count;

  if v_total = 0 then
    raise exception 'A empresa desta loja não tem marcas ativas. Importe o relatório de marcas primeiro.';
  end if;

  insert into eventos_auditoria (auditoria_id, tipo, descricao, usuario_id)
  values (v_auditoria_id, 'auditoria_criada',
          format('Auditoria iniciada com %s marcas.', v_total), auth.uid());

  return v_auditoria_id;
end;
$$;

-- Troca manual de status/observação de uma marca, com registro no log.
create function public.atualizar_status_marca(
  p_auditoria_marca_id uuid,
  p_status status_marca,
  p_observacao text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_atual auditoria_marcas%rowtype;
  v_status_auditoria status_auditoria;
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
begin
  select * into v_atual from auditoria_marcas where id = p_auditoria_marca_id for update;
  if not found then
    raise exception 'Marca da auditoria não encontrada.';
  end if;

  select status into v_status_auditoria from auditorias where id = v_atual.auditoria_id;
  if v_status_auditoria <> 'em_andamento' then
    raise exception 'Esta auditoria já foi encerrada e não aceita alterações.';
  end if;

  if v_atual.status = p_status and v_atual.observacao is not distinct from v_obs then
    return;
  end if;

  update auditoria_marcas
  set status = p_status,
      status_origem = 'manual',
      observacao = v_obs,
      atualizado_por = auth.uid()
  where id = p_auditoria_marca_id;

  if v_atual.status <> p_status then
    insert into eventos_auditoria
      (auditoria_id, auditoria_marca_id, tipo, descricao, status_anterior, status_novo, usuario_id)
    values
      (v_atual.auditoria_id, v_atual.id, 'status_alterado',
       format('%s: %s → %s', v_atual.marca_nome, v_atual.status, p_status),
       v_atual.status, p_status, auth.uid());
  end if;

  if v_atual.observacao is distinct from v_obs then
    insert into eventos_auditoria (auditoria_id, auditoria_marca_id, tipo, descricao, usuario_id)
    values (v_atual.auditoria_id, v_atual.id, 'observacao_alterada',
            format('%s: observação %s', v_atual.marca_nome,
                   case when v_obs is null then 'removida' else 'atualizada' end),
            auth.uid());
  end if;
end;
$$;

-- Finaliza a auditoria. O aviso de pendências é feito na tela; aqui só se
-- registra o retrato final no log.
create function public.finalizar_auditoria(p_auditoria_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_concluidas integer;
  v_parciais integer;
  v_pendentes integer;
begin
  update auditorias
  set status = 'concluida', finalizada_em = now()
  where id = p_auditoria_id and status = 'em_andamento';
  if not found then
    raise exception 'Auditoria não encontrada ou já encerrada.';
  end if;

  select count(*) filter (where status = 'concluida'),
         count(*) filter (where status = 'parcial'),
         count(*) filter (where status = 'pendente')
  into v_concluidas, v_parciais, v_pendentes
  from auditoria_marcas where auditoria_id = p_auditoria_id;

  insert into eventos_auditoria (auditoria_id, tipo, descricao, usuario_id)
  values (p_auditoria_id, 'auditoria_finalizada',
          format('Auditoria finalizada: %s concluídas, %s parciais, %s pendentes.',
                 v_concluidas, v_parciais, v_pendentes),
          auth.uid());
end;
$$;

-- Reconciliação do relatório "Relação de Produtos por Marca".
-- p_marcas: [{"codigo": 1625, "nome": "HEVVY"}, ...] (códigos únicos).
create function public.importar_marcas(
  p_empresa_id uuid,
  p_arquivo_nome text,
  p_marcas jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_novas integer;
  v_reativadas integer;
  v_desativadas integer;
  v_lidas integer := jsonb_array_length(p_marcas);
begin
  if public.meu_perfil() is distinct from 'administrador' then
    raise exception 'Somente administradores podem importar marcas.' using errcode = '42501';
  end if;
  if v_lidas = 0 then
    raise exception 'O arquivo não tem nenhuma marca.';
  end if;

  create temp table _arquivo on commit drop as
  select (x->>'codigo')::integer as codigo, btrim(x->>'nome') as nome
  from jsonb_array_elements(p_marcas) x;

  select count(*) into v_reativadas
  from marcas m join _arquivo a on a.codigo = m.codigo_santri
  where m.empresa_id = p_empresa_id and not m.ativo;

  select count(*) into v_desativadas
  from marcas m
  where m.empresa_id = p_empresa_id and m.ativo
    and not exists (select 1 from _arquivo a where a.codigo = m.codigo_santri);

  update marcas m
  set nome = a.nome, ativo = true
  from _arquivo a
  where m.empresa_id = p_empresa_id and m.codigo_santri = a.codigo
    and (m.nome <> a.nome or not m.ativo);

  update marcas m
  set ativo = false
  where m.empresa_id = p_empresa_id and m.ativo
    and not exists (select 1 from _arquivo a where a.codigo = m.codigo_santri);

  insert into marcas (empresa_id, codigo_santri, nome)
  select p_empresa_id, a.codigo, a.nome
  from _arquivo a
  where not exists (
    select 1 from marcas m where m.empresa_id = p_empresa_id and m.codigo_santri = a.codigo
  );
  get diagnostics v_novas = row_count;

  insert into importacoes_marcas
    (empresa_id, arquivo_nome, total_linhas_lidas, total_marcas_novas,
     total_marcas_reativadas, total_marcas_desativadas, importado_por)
  values (p_empresa_id, p_arquivo_nome, v_lidas, v_novas, v_reativadas, v_desativadas, auth.uid());

  return jsonb_build_object(
    'lidas', v_lidas, 'novas', v_novas,
    'reativadas', v_reativadas, 'desativadas', v_desativadas
  );
end;
$$;

-- Nome de marca normalizado para casar o relatório de contagens (que só traz
-- o nome) com as marcas da auditoria. Mesma regra de normalizarNomeMarca() no TS.
create function public.normalizar_nome_marca(p_nome text)
returns text
language sql immutable
as $$
  select upper(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')));
$$;

-- Grava o histórico bruto do relatório "Ordens de Contagens Acompanhadas" e
-- aplica as sugestões na auditoria em andamento da loja.
-- p_contagens: [{"numero", "status", "local", "usuario", "data_insercao",
--               "data_baixa", "itens": [{"marca", "produto_codigo",
--               "produto_nome", "estoque_fisico", "qtd_contada", "diferenca"}]}]
-- p_sugestoes: [{"marca": "HEVVY", "status": "concluida"}, ...] — calculadas
--              no servidor a partir de p_contagens (src/lib/sugestao.ts).
create function public.importar_contagens(
  p_loja_id uuid,
  p_arquivo_nome text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_contagens jsonb,
  p_sugestoes jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_importacao_id uuid;
  v_auditoria_id uuid;
  v_aplicadas integer := 0;
  r record;
begin
  if public.meu_perfil() is null or public.meu_perfil() not in ('gestor', 'administrador') then
    raise exception 'Somente gestores e administradores podem importar contagens.'
      using errcode = '42501';
  end if;

  insert into importacoes_contagem
    (loja_id, arquivo_nome, periodo_inicio, periodo_fim, total_contagens_lidas, importado_por)
  values (p_loja_id, p_arquivo_nome, p_periodo_inicio, p_periodo_fim,
          jsonb_array_length(p_contagens), auth.uid())
  returning id into v_importacao_id;

  insert into contagens_santri
    (importacao_id, numero_contagem, status, local_interno, usuario_contagem, data_insercao, data_baixa)
  select v_importacao_id, (c->>'numero')::integer, (c->>'status')::status_contagem_santri,
         c->>'local', c->>'usuario',
         (c->>'data_insercao')::timestamptz, (c->>'data_baixa')::timestamptz
  from jsonb_array_elements(p_contagens) c;

  insert into contagens_santri_itens
    (contagem_santri_id, marca_nome, produto_codigo, produto_nome, estoque_fisico, qtd_contada, diferenca)
  select cs.id, i->>'marca', i->>'produto_codigo', i->>'produto_nome',
         (i->>'estoque_fisico')::numeric, (i->>'qtd_contada')::numeric, (i->>'diferenca')::numeric
  from jsonb_array_elements(p_contagens) c
  cross join jsonb_array_elements(c->'itens') i
  join contagens_santri cs
    on cs.importacao_id = v_importacao_id and cs.numero_contagem = (c->>'numero')::integer;

  select id into v_auditoria_id
  from auditorias where loja_id = p_loja_id and status = 'em_andamento';

  if v_auditoria_id is not null then
    -- status_marca é um enum ordenado (pendente < parcial < concluida):
    -- a condição "s.status > am.status" garante que a sugestão nunca rebaixa.
    for r in
      select am.id, am.marca_nome, am.status as anterior, s.status as novo
      from auditoria_marcas am
      join (
        select public.normalizar_nome_marca(x->>'marca') as marca,
               max((x->>'status')::status_marca) as status
        from jsonb_array_elements(p_sugestoes) x
        group by 1
      ) s on s.marca = public.normalizar_nome_marca(am.marca_nome)
      where am.auditoria_id = v_auditoria_id and s.status > am.status
      for update of am
    loop
      update auditoria_marcas
      set status = r.novo, status_origem = 'sugerido_importacao', atualizado_por = auth.uid()
      where id = r.id;

      insert into eventos_auditoria
        (auditoria_id, auditoria_marca_id, tipo, descricao, status_anterior, status_novo, usuario_id)
      values
        (v_auditoria_id, r.id, 'importacao_aplicada',
         format('%s: %s → %s (sugestão da importação %s)', r.marca_nome, r.anterior, r.novo, p_arquivo_nome),
         r.anterior, r.novo, auth.uid());

      v_aplicadas := v_aplicadas + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'importacao_id', v_importacao_id,
    'auditoria_id', v_auditoria_id,
    'sugestoes_aplicadas', v_aplicadas
  );
end;
$$;

-- Resumo de progresso por auditoria para o dashboard e o histórico.
-- security_invoker: a view aplica a RLS de quem consulta (auditor só vê as
-- próprias auditorias), em vez das permissões do dono da view.
create view public.auditorias_resumo
with (security_invoker = true)
as
select
  a.id,
  a.numero,
  a.empresa_id,
  a.loja_id,
  a.auditor_id,
  a.status,
  a.iniciada_em,
  a.finalizada_em,
  e.nome as empresa_nome,
  l.nome as loja_nome,
  p.nome as auditor_nome,
  count(am.id)::integer as total_marcas,
  (count(am.id) filter (where am.status = 'concluida'))::integer as marcas_concluidas,
  (count(am.id) filter (where am.status = 'parcial'))::integer as marcas_parciais,
  (count(am.id) filter (where am.status = 'pendente'))::integer as marcas_pendentes
from public.auditorias a
join public.empresas e on e.id = a.empresa_id
join public.lojas l on l.id = a.loja_id
join public.profiles p on p.id = a.auditor_id
left join public.auditoria_marcas am on am.auditoria_id = a.id
group by a.id, e.nome, l.nome, p.nome;
