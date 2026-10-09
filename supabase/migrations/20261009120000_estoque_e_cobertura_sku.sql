-- Estoque ativo por loja + status das marcas pela COBERTURA DE SKUs.
--
-- Antes: a importação de contagens marcava "concluída" qualquer marca tocada
-- por uma contagem Baixada, mesmo que só alguns produtos dela tivessem sido
-- contados. Agora (mesma regra do outro sistema do usuário):
--   SKUs ativos   = produtos da marca no relatório "Valor de Estoque - Analítico"
--                   da loja (inclui os de saldo zero — é a foto do cadastro atual)
--   SKUs contados = códigos de produto DISTINTOS da marca em todas as contagens
--                   importadas durante a auditoria (qualquer status, acertando
--                   ou não; o mesmo SKU contado 3 vezes vale 1)
--   contados >= ativos → concluida · 0 < contados < ativos → parcial · 0 → não mexe
-- Status manual nunca é rebaixado; status que veio da importação é recalculado
-- (pode cair de concluída para parcial — corrige as concluídas indevidas).

-- ------------------------------------------------------------ Estoque

create table public.importacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete restrict,
  arquivo_nome text not null,
  total_itens integer not null default 0,
  total_com_saldo integer not null default 0,
  importado_por uuid not null references public.profiles (id),
  importado_em timestamptz not null default now()
);

-- Só a foto mais recente de cada loja: cada importação substitui a anterior.
create table public.estoque_itens (
  loja_id uuid not null references public.lojas (id) on delete cascade,
  produto_codigo integer not null,
  produto_nome text not null,
  marca_nome text not null,
  marca_chave text not null, -- normalizar_nome_marca(marca_nome)
  departamento text,
  disponivel numeric not null default 0,
  primary key (loja_id, produto_codigo)
);

create index idx_estoque_itens_marca on public.estoque_itens (loja_id, marca_chave);
create index idx_importacoes_estoque_loja on public.importacoes_estoque (loja_id);

alter table public.importacoes_estoque enable row level security;
alter table public.estoque_itens enable row level security;

create policy "importacoes_estoque: leitura autenticada" on public.importacoes_estoque
  for select using ((select auth.role()) = 'authenticated');
create policy "importacoes_estoque: admin/gestor gerencia" on public.importacoes_estoque
  for all using ((select public.meu_perfil()) in ('gestor', 'administrador'));
create policy "estoque_itens: leitura autenticada" on public.estoque_itens
  for select using ((select auth.role()) = 'authenticated');
create policy "estoque_itens: admin/gestor gerencia" on public.estoque_itens
  for all using ((select public.meu_perfil()) in ('gestor', 'administrador'));

-- ------------------------------------- Importação de contagens ↔ auditoria

-- A cobertura soma as contagens de todas as importações feitas DURANTE a
-- auditoria (o relatório pode vir em vários arquivos ao longo do mês).
alter table public.importacoes_contagem
  add column auditoria_id uuid references public.auditorias (id) on delete set null;
create index idx_importacoes_contagem_auditoria on public.importacoes_contagem (auditoria_id);

update public.importacoes_contagem ic
set auditoria_id = a.id
from public.auditorias a
where a.loja_id = ic.loja_id
  and ic.importado_em >= a.iniciada_em
  and ic.importado_em <= coalesce(a.finalizada_em, 'infinity');

-- Índice para agrupar itens contados por marca normalizada.
create index idx_contagens_santri_itens_marca_chave
  on public.contagens_santri_itens (public.normalizar_nome_marca(marca_nome));

-- ------------------------------------------------------- Cobertura

-- SKUs ativos / com saldo / contados de cada marca da auditoria.
-- p_extras: [{marca, produto_codigo}] ainda não gravados (pré-visualização
-- de um arquivo antes de importar). SECURITY INVOKER: a RLS vale.
create function public.cobertura_auditoria(p_auditoria_id uuid, p_extras jsonb default null)
returns table (
  auditoria_marca_id uuid,
  skus_ativos integer,
  skus_com_saldo integer,
  skus_contados integer,
  departamentos text[]
)
language sql stable
set search_path = public
as $$
  with est as (
    select e.marca_chave as chave,
           count(*)::integer as ativos,
           (count(*) filter (where e.disponivel > 0))::integer as com_saldo,
           array_agg(distinct e.departamento order by e.departamento)
             filter (where e.departamento is not null) as deps
    from estoque_itens e
    where e.loja_id = (select loja_id from auditorias where id = p_auditoria_id)
    group by e.marca_chave
  ),
  cont as (
    select s.chave, count(distinct s.codigo)::integer as contados
    from (
      select normalizar_nome_marca(i.marca_nome) as chave,
             regexp_replace(i.produto_codigo, '\D', '', 'g') as codigo
      from importacoes_contagem ic
      join contagens_santri cs on cs.importacao_id = ic.id
      join contagens_santri_itens i on i.contagem_santri_id = cs.id
      where ic.auditoria_id = p_auditoria_id
      union all
      select normalizar_nome_marca(x->>'marca'), regexp_replace(x->>'produto_codigo', '\D', '', 'g')
      from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) x
    ) s
    where s.codigo <> ''
    group by s.chave
  )
  select am.id,
         coalesce(est.ativos, 0),
         coalesce(est.com_saldo, 0),
         coalesce(cont.contados, 0),
         coalesce(est.deps, '{}')
  from auditoria_marcas am
  left join est on est.chave = normalizar_nome_marca(am.marca_nome)
  left join cont on cont.chave = normalizar_nome_marca(am.marca_nome)
  where am.auditoria_id = p_auditoria_id;
$$;

-- Aplica a regra de cobertura na auditoria. Chamada pelas duas importações.
create function public.aplicar_cobertura(p_auditoria_id uuid, p_motivo text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_aplicadas integer := 0;
  r record;
begin
  for r in
    select am.id, am.marca_nome, am.status as anterior, am.status_origem,
           c.skus_ativos, c.skus_contados,
           (case when c.skus_contados >= c.skus_ativos then 'concluida' else 'parcial' end)::status_marca as novo
    from cobertura_auditoria(p_auditoria_id) c
    join auditoria_marcas am on am.id = c.auditoria_marca_id
    where c.skus_contados > 0
  loop
    -- Manual: só sobe. Vindo da importação: acompanha a cobertura (sobe ou desce).
    continue when r.novo = r.anterior;
    continue when r.status_origem = 'manual' and r.novo < r.anterior;

    update auditoria_marcas
    set status = r.novo, status_origem = 'sugerido_importacao', atualizado_por = auth.uid()
    where id = r.id;

    insert into eventos_auditoria
      (auditoria_id, auditoria_marca_id, tipo, descricao, status_anterior, status_novo, usuario_id)
    values
      (p_auditoria_id, r.id, 'importacao_aplicada',
       format('%s: %s → %s (%s de %s SKUs contados; %s)',
              r.marca_nome, rotulo_status_marca(r.anterior), rotulo_status_marca(r.novo),
              r.skus_contados, r.skus_ativos, p_motivo),
       r.anterior, r.novo, auth.uid());

    v_aplicadas := v_aplicadas + 1;
  end loop;
  return v_aplicadas;
end;
$$;

-- ------------------------------------------------ Importar estoque

create function public.importar_estoque(p_loja_id uuid, p_arquivo_nome text, p_itens jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_importacao_id uuid;
  v_auditoria_id uuid;
  v_aplicadas integer := 0;
begin
  if public.meu_perfil() is null or public.meu_perfil() not in ('gestor', 'administrador') then
    raise exception 'Somente gestores e administradores podem importar o estoque.'
      using errcode = '42501';
  end if;

  delete from estoque_itens where loja_id = p_loja_id;

  insert into estoque_itens (loja_id, produto_codigo, produto_nome, marca_nome, marca_chave, departamento, disponivel)
  select p_loja_id, (x->>'codigo')::integer, x->>'nome', x->>'marca',
         normalizar_nome_marca(x->>'marca'), x->>'departamento', coalesce((x->>'disponivel')::numeric, 0)
  from jsonb_array_elements(p_itens) x;

  insert into importacoes_estoque (loja_id, arquivo_nome, total_itens, total_com_saldo, importado_por)
  select p_loja_id, p_arquivo_nome, count(*), count(*) filter (where disponivel > 0), auth.uid()
  from estoque_itens where loja_id = p_loja_id
  returning id into v_importacao_id;

  select id into v_auditoria_id from auditorias where loja_id = p_loja_id and status = 'em_andamento';
  if v_auditoria_id is not null then
    v_aplicadas := aplicar_cobertura(v_auditoria_id, format('estoque atualizado: %s', p_arquivo_nome));
  end if;

  return jsonb_build_object(
    'importacao_id', v_importacao_id,
    'auditoria_id', v_auditoria_id,
    'marcas_atualizadas', v_aplicadas
  );
end;
$$;

-- ----------------------------------------------- Importar contagens

-- Assinatura nova: as sugestões não vêm mais do servidor Next — o banco
-- calcula a cobertura a partir do que está gravado.
drop function public.importar_contagens(uuid, text, date, date, jsonb, jsonb);

create function public.importar_contagens(
  p_loja_id uuid,
  p_arquivo_nome text,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_contagens jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_importacao_id uuid;
  v_auditoria_id uuid;
  v_aplicadas integer := 0;
begin
  if public.meu_perfil() is null or public.meu_perfil() not in ('gestor', 'administrador') then
    raise exception 'Somente gestores e administradores podem importar contagens.'
      using errcode = '42501';
  end if;

  select id into v_auditoria_id from auditorias where loja_id = p_loja_id and status = 'em_andamento';

  if v_auditoria_id is not null and not exists (select 1 from estoque_itens where loja_id = p_loja_id) then
    raise exception 'Importe primeiro o estoque da loja (relatório "Valor de Estoque - Analítico"): sem ele não há como saber quantos SKUs cada marca tem.'
      using errcode = 'P0001';
  end if;

  insert into importacoes_contagem
    (loja_id, auditoria_id, arquivo_nome, periodo_inicio, periodo_fim, total_contagens_lidas, importado_por)
  values (p_loja_id, v_auditoria_id, p_arquivo_nome, p_periodo_inicio, p_periodo_fim,
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

  if v_auditoria_id is not null then
    v_aplicadas := aplicar_cobertura(v_auditoria_id, format('importação %s', p_arquivo_nome));
  end if;

  return jsonb_build_object(
    'importacao_id', v_importacao_id,
    'auditoria_id', v_auditoria_id,
    'sugestoes_aplicadas', v_aplicadas
  );
end;
$$;
