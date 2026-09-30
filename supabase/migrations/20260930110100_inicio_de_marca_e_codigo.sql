-- 1. Código da marca na fotografia da auditoria (como o nome, é copiado:
--    mudanças futuras no cadastro não afetam auditorias existentes).
-- 2. Momento em que o auditor iniciou a contagem de cada marca.
-- 3. Fluxo manual obrigatório: pendente → em_contagem → parcial/concluida.

alter table public.auditoria_marcas
  add column marca_codigo integer,
  add column iniciada_em timestamptz,
  add column iniciada_por uuid references public.profiles (id);

update public.auditoria_marcas am
set marca_codigo = m.codigo_santri
from public.marcas m
where m.id = am.marca_id and am.marca_codigo is null;

create or replace function public.criar_auditoria(p_loja_id uuid)
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

  begin
    insert into auditorias (empresa_id, loja_id, auditor_id)
    values (v_empresa_id, p_loja_id, auth.uid())
    returning id into v_auditoria_id;
  exception when unique_violation then
    raise exception 'Esta loja já tem uma auditoria em andamento. Finalize-a antes de iniciar outra.';
  end;

  insert into auditoria_marcas (auditoria_id, marca_id, marca_nome, marca_codigo)
  select v_auditoria_id, m.id, m.nome, m.codigo_santri
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

create function public.rotulo_status_marca(p_status status_marca)
returns text
language sql immutable
as $$
  select case p_status
    when 'pendente' then 'Pendente'
    when 'em_contagem' then 'Em contagem'
    when 'parcial' then 'Parcial'
    when 'concluida' then 'Concluída'
  end;
$$;

-- Transições manuais permitidas:
--   pendente    → em_contagem              (Iniciar)
--   em_contagem → parcial | concluida      (resultado da contagem)
--   em_contagem → pendente                 (desfazer início por engano)
--   parcial     → em_contagem              (retomar)
--   concluida   → em_contagem              (reabrir para corrigir)
-- A importação de contagens não passa por aqui (é sugestão, ver importar_contagens).
create or replace function public.atualizar_status_marca(
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
  v_tipo text;
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

  if v_atual.status <> p_status and not (
       (v_atual.status = 'pendente'    and p_status = 'em_contagem')
    or (v_atual.status = 'em_contagem' and p_status in ('parcial', 'concluida', 'pendente'))
    or (v_atual.status = 'parcial'     and p_status = 'em_contagem')
    or (v_atual.status = 'concluida'   and p_status = 'em_contagem')
  ) then
    if v_atual.status = 'pendente' then
      raise exception 'Inicie a marca antes de marcá-la como %.', lower(rotulo_status_marca(p_status));
    end if;
    raise exception 'Não é possível passar de % para %.',
      rotulo_status_marca(v_atual.status), rotulo_status_marca(p_status);
  end if;

  update auditoria_marcas
  set status = p_status,
      status_origem = 'manual',
      observacao = v_obs,
      atualizado_por = auth.uid(),
      iniciada_em = case
        when p_status = 'pendente' then null
        when p_status = 'em_contagem' and v_atual.iniciada_em is null then now()
        else iniciada_em
      end,
      iniciada_por = case
        when p_status = 'pendente' then null
        when p_status = 'em_contagem' and v_atual.iniciada_em is null then auth.uid()
        else iniciada_por
      end
  where id = p_auditoria_marca_id;

  if v_atual.status <> p_status then
    v_tipo := case
      when v_atual.status = 'pendente' then 'marca_iniciada'
      when p_status = 'pendente' then 'inicio_desfeito'
      when p_status = 'em_contagem' then 'marca_reaberta'
      else 'status_alterado'
    end;
    insert into eventos_auditoria
      (auditoria_id, auditoria_marca_id, tipo, descricao, status_anterior, status_novo, usuario_id)
    values
      (v_atual.auditoria_id, v_atual.id, v_tipo,
       format('%s: %s → %s', v_atual.marca_nome,
              rotulo_status_marca(v_atual.status), rotulo_status_marca(p_status)),
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

create or replace function public.finalizar_auditoria(p_auditoria_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_concluidas integer;
  v_parciais integer;
  v_em_contagem integer;
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
         count(*) filter (where status = 'em_contagem'),
         count(*) filter (where status = 'pendente')
  into v_concluidas, v_parciais, v_em_contagem, v_pendentes
  from auditoria_marcas where auditoria_id = p_auditoria_id;

  insert into eventos_auditoria (auditoria_id, tipo, descricao, usuario_id)
  values (p_auditoria_id, 'auditoria_finalizada',
          format('Auditoria finalizada: %s concluídas, %s parciais, %s em contagem, %s pendentes.',
                 v_concluidas, v_parciais, v_em_contagem, v_pendentes),
          auth.uid());
end;
$$;

-- Nova coluna no fim (create or replace view só permite acrescentar no final).
create or replace view public.auditorias_resumo
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
  (count(am.id) filter (where am.status = 'pendente'))::integer as marcas_pendentes,
  (count(am.id) filter (where am.status = 'em_contagem'))::integer as marcas_em_contagem
from public.auditorias a
join public.empresas e on e.id = a.empresa_id
join public.lojas l on l.id = a.loja_id
join public.profiles p on p.id = a.auditor_id
left join public.auditoria_marcas am on am.auditoria_id = a.id
group by a.id, e.nome, l.nome, p.nome;
