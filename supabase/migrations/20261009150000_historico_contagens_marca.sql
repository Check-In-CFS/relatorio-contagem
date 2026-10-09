-- Histórico de contagens por marca: quantas vezes cada marca foi contada 100%
-- dentro da auditoria.
--
-- Rodada = sequência de lotes de contagem (em ordem cronológica) cujos SKUs
-- distintos somados cobrem todos os SKUs ativos da marca (mesma regra de
-- cobertura_auditoria: contados >= ativos). Quando cobre, a rodada fecha e o
-- próximo lote da marca abre a rodada seguinte.
--
-- Lote = contagens criadas no mesmo instante (data_insercao): o Santri gera
-- uma contagem por local (depósito, loja...) com os mesmos produtos; contá-las
-- separadas faria uma única contagem física virar "contada 2x". Contagem sem
-- data de inserção é um lote sozinha. Um lote inteiro entra em uma rodada só.
--
-- Calculado na hora a partir do que foi importado (nada é gravado). A mesma
-- contagem presente em mais de um arquivo vale uma vez (itens do arquivo mais novo).

create function public.historico_contagens_auditoria(p_auditoria_id uuid)
returns table (
  auditoria_marca_id uuid,
  rodada integer,
  completa boolean,
  skus_contados integer,
  skus_ativos integer,
  inicio timestamptz,
  fim timestamptz,
  contagens integer[]
)
language plpgsql stable
set search_path = public
as $$
#variable_conflict use_column
declare
  r record;
  v_marca uuid;
  v_vistos text[];
begin
  for r in
    with est as (
      select e.marca_chave as chave, count(*)::integer as ativos
      from estoque_itens e
      where e.loja_id = (select a.loja_id from auditorias a where a.id = p_auditoria_id)
      group by e.marca_chave
    ),
    cont as (
      select distinct on (cs.numero_contagem)
             cs.id, cs.numero_contagem as numero,
             -- Sem data no relatório: vale a 1ª vez que foi importada (reimportar não muda a ordem).
             coalesce(cs.data_insercao, cs.data_baixa,
                      min(ic.importado_em) over (partition by cs.numero_contagem)) as momento,
             case when cs.data_insercao is null then cs.numero_contagem end as avulsa
      from importacoes_contagem ic
      join contagens_santri cs on cs.importacao_id = ic.id
      where ic.auditoria_id = p_auditoria_id
      order by cs.numero_contagem, ic.importado_em desc
    ),
    por_lote as (
      select normalizar_nome_marca(i.marca_nome) as chave, c.momento, c.avulsa,
             array_agg(distinct c.numero order by c.numero) as numeros,
             array_agg(distinct regexp_replace(i.produto_codigo, '\D', '', 'g'))
               filter (where regexp_replace(i.produto_codigo, '\D', '', 'g') <> '') as codigos
      from cont c
      join contagens_santri_itens i on i.contagem_santri_id = c.id
      group by 1, 2, 3
    )
    select am.id as marca_id, coalesce(est.ativos, 0) as ativos, p.numeros, p.momento, p.codigos
    from auditoria_marcas am
    join por_lote p on p.chave = normalizar_nome_marca(am.marca_nome)
    left join est on est.chave = p.chave
    where am.auditoria_id = p_auditoria_id
      and p.codigos is not null
    order by am.id, p.momento, p.numeros[1]
  loop
    if v_marca is distinct from r.marca_id then
      -- Rodada em aberto da marca anterior.
      if v_marca is not null and cardinality(contagens) > 0 then
        return next;
      end if;
      v_marca := r.marca_id;
      auditoria_marca_id := r.marca_id;
      skus_ativos := r.ativos;
      rodada := 1;
      v_vistos := '{}';
      contagens := '{}';
    end if;

    if cardinality(contagens) = 0 then
      inicio := r.momento;
    end if;
    fim := r.momento;
    contagens := contagens || r.numeros;
    v_vistos := array(select distinct x from unnest(v_vistos || r.codigos) x);
    skus_contados := cardinality(v_vistos);
    completa := skus_contados >= skus_ativos;

    if completa then
      return next;
      rodada := rodada + 1;
      v_vistos := '{}';
      contagens := '{}';
      skus_contados := 0;
      completa := false;
    end if;
  end loop;

  if v_marca is not null and cardinality(contagens) > 0 then
    return next;
  end if;
end;
$$;
