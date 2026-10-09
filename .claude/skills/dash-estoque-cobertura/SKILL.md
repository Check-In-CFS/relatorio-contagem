---
name: dash-estoque-cobertura
description: Importação do estoque ativo da loja (relatório "Valor de Estoque - Analítico") e a regra de status das marcas por COBERTURA DE SKUs na importação de contagens — tabelas, funções SQL (cobertura_auditoria, aplicar_cobertura, importar_estoque, importar_contagens), formato do relatório e decisões. Use ao mexer em importação de estoque/contagens, no status sugerido das marcas, no filtro por departamento ou nos SKUs mostrados na auditoria.
---

# Estoque ativo + cobertura de SKUs (2026-10-09)

Migration `20261009120000_estoque_e_cobertura_sku.sql`. Substituiu a regra antiga
(contagem Baixada → marca concluída), que concluía marcas com só parte dos produtos contados.

## Regra (igual ao outro sistema do usuário — ele pediu "igualar")

- **SKUs ativos** da marca = produtos dela em `estoque_itens` da loja (inclui saldo zero).
- **SKUs contados** = códigos de produto DISTINTOS da marca em todas as contagens das
  importações vinculadas à auditoria (`importacoes_contagem.auditoria_id`), de **qualquer
  status** (Cancelada/Aberta contam), acertando ou não.
- `contados >= ativos` → concluida · `0 < contados < ativos` → parcial · 0 → não mexe.
- Status **manual** só sobe. Status com `status_origem = 'sugerido_importacao'` acompanha a
  cobertura (sobe **e desce**: concluída → parcial). Isso corrige as concluídas da regra antiga.
- Marca casada **por nome normalizado** (`normalizar_nome_marca`); produto pelo código só com
  dígitos (`"71.340"` → `71340`; estoque guarda integer, contagens guardam texto cru).
- Marca da auditoria sem nenhum item no estoque: `ativos = 0` → qualquer contagem a conclui.

Decisões não óbvias (oferecer mudar, se o usuário pedir): comparar com "itens com saldo" em vez de
ativos; considerar só contagens Baixadas. A regra do usuário avisa que marca com SKU sem saldo
pode nunca chegar a 100%.

## Banco

- `estoque_itens (loja_id, produto_codigo) PK` — só a foto **mais recente** por loja;
  `importar_estoque` apaga e regrava. `marca_chave` = nome normalizado (indexado).
  `importacoes_estoque` = histórico. RLS: leitura autenticada, escrita gestor/admin.
- `cobertura_auditoria(p_auditoria_id, p_extras jsonb)` → por `auditoria_marca_id`: `skus_ativos`,
  `skus_com_saldo`, `skus_contados`, `departamentos[]`. `p_extras` = `[{marca, produto_codigo}]`
  do arquivo ainda não importado (a prévia da tela de contagens usa). SECURITY INVOKER.
  Retorna 1 linha por marca → use `buscarTodas` + `.order('auditoria_marca_id')`.
- `aplicar_cobertura(p_auditoria_id, p_motivo)` — aplica a regra e grava evento
  `importacao_aplicada` ("X: Concluída → Parcial (360 de 371 SKUs contados; ...)").
  Chamada por `importar_estoque` (se a loja tem auditoria em andamento) e `importar_contagens`.
- `importar_contagens(p_loja_id, p_arquivo_nome, p_periodo_inicio, p_periodo_fim, p_contagens)`
  — **sem `p_sugestoes`** (assinatura antiga foi dropada). Se a loja tem auditoria em andamento
  e não tem estoque → erro P0001 "Importe primeiro o estoque...".
- Backfill: importações antigas foram vinculadas à auditoria da loja pelo horário.

## TypeScript

- Parser `src/lib/parsers/estoque.ts`: linha de colunas `Produto | Nome | Marca`; agrupamento =
  "Qtd: N" na coluna Marca; só o 1º nível (código sem ponto, "001") vira `departamento`
  ("001 - LOUÇAS"). Produto de código < 1000 ("628") é item, não departamento — distingue pelo "Qtd:".
  Rodapé "Filtros selecionados" → `empresas[]` (aviso na tela se > 1: estoque somado).
- `src/lib/sugestao.ts`: espelho da regra só para **prévia** (`classificarCobertura`,
  `planejarAplicacao`, `skusDoArquivo`). Quem grava é o banco.
- Telas: `/admin/estoque` (gestor/admin); prévia de `/admin/contagens` mostra X/Y SKUs e bloqueia
  sem estoque; auditoria mostra "X/Y SKUs · Z%" (floor — 370/371 não pode virar 100%) e filtro
  por departamento (some quando não há estoque).

## Números reais (arquivo de 05/10, 11 empresas no filtro)

19.630 itens ativos (16.304 com saldo), 18 departamentos, 637 marcas; 484 das 485 marcas do
cadastro casam por nome (CONDUMIG sem itens). Payload ~2,7 MB — abaixo dos 4,5 MB da Vercel.
Simulação na auditoria #1 (Samambaia): 215 concluídas → só 50 com todos os SKUs; 164 voltam a parcial.
