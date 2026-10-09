---
name: dash-historico-contagens
description: Histórico de contagens por marca — quantas vezes cada marca foi contada 100% dentro da auditoria (rodadas), função SQL historico_contagens_auditoria, regra de "lote" (contagens do Santri criadas no mesmo instante = uma contagem física) e a UI "contada N×". Use ao mexer em recontagem, histórico de contagens, ordenação "Mais vezes contadas" ou ao explicar por que uma marca aparece contada N vezes.
---

# Histórico de contagens por marca (2026-10-09)

Migration `20261009150000_historico_contagens_marca.sql`. Pedido do usuário: uma marca pode
ser contada 100% mais de uma vez durante a auditoria; quer saber quantas vezes.
Nada é gravado — calculado na hora a partir das contagens importadas (~0,2 s na auditoria real).

## Regra

- **Rodada** = sequência de lotes, em ordem cronológica, cujos SKUs distintos somados cobrem os
  SKUs ativos da marca (`contados >= ativos`, mesma regra de `cobertura_auditoria`; mesmas
  contagens: as das importações com `auditoria_id`, de qualquer status, inclusive Cancelada).
  Fechou → o próximo lote abre a rodada seguinte. **Vezes contada = rodadas completas.**
- Por construção, "≥ 1 rodada completa" ⇔ marca concluída pela cobertura (conferido: 54 = 54).
- **Lote** = contagens com o mesmo `data_insercao`. O Santri cria **uma contagem por local**
  (DEPOSITO 02-A, A LOJA (06)...) com os mesmos produtos e o mesmo horário. Contar por número de
  contagem fazia uma contagem física virar "2×" (500 lotes com > 1 contagem nos dados reais).
  Contagem sem `data_insercao` é lote sozinha. Um lote inteiro entra numa rodada só.
- Mesma contagem em vários arquivos: vale 1 vez (`distinct on numero_contagem`, itens do arquivo
  mais novo; sem data no relatório, o momento é a 1ª importação — reimportar não reordena).
- Marca com 0 SKUs ativos: cada lote fecha uma rodada (raro; só CONDUMIG no estoque real).

Decisões em aberto (oferecer se o usuário estranhar números): ignorar Canceladas só no histórico
(deixaria marca concluída com 0 rodadas — por isso não foi feito); contar só SKUs que existem
no estoque.

## Banco

`historico_contagens_auditoria(p_auditoria_id)` → uma linha por rodada:
`auditoria_marca_id, rodada, completa, skus_contados, skus_ativos, inicio, fim, contagens int[]`.
A última rodada de cada marca pode ter `completa = false` (em andamento). plpgsql com
`#variable_conflict use_column` (colunas de saída têm nomes de colunas reais). SECURITY INVOKER.

## Tela (`auditorias/[id]`)

`page.tsx` busca com `buscarTodas` + `.order('auditoria_marca_id').order('rodada')`.
`TelaAuditoria`: selo clicável "contada N×" (verde se N > 1; "histórico" se só há rodada em
aberto) abre `HistoricoContagens` (rodadas com SKUs, período e nºs das contagens); resumo
"X contadas mais de uma vez" no cartão; ordenação "Mais vezes contadas". PDF não mostra o histórico.

Teste: `fluxo.test.ts` → "histórico: conta quantas vezes..." (lote, avulsas, reimportação).
Datas de teste precisam ser posteriores às importações anteriores (ordem é por horário).
