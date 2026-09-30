-- A checagem "loja já tem auditoria em andamento" em criar_auditoria() roda
-- com a RLS de quem chama: um auditor não enxerga a auditoria de outro e a
-- checagem passava, estourando o índice único com uma mensagem técnica.
-- Agora a violação do índice vira a mesma mensagem amigável.
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
