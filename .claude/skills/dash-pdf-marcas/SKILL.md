---
name: dash-pdf-marcas
description: Como funciona o PDF "Relação de marcas" da auditoria (botão Gerar PDF) — jsPDF no navegador, filtros por status, layout, compressão e como testar/visualizar. Use ao alterar o PDF, criar outro relatório em PDF ou investigar problema de geração.
---

# PDF de marcas da auditoria

- Botão **Gerar PDF** na tela `/auditorias/[id]` (`GerarPdf.tsx`) abre um
  `<dialog>`: filtro (Todas / Pendentes / Em contagem / Parciais / Concluídas,
  começa no filtro ativo da tela, mostra a contagem de cada um) + ordem (nome ou
  código). Botão desabilitado se o filtro não tem marcas.
- Geração **no navegador** com os dados já carregados na tela (RLS já aplicada;
  nada novo no servidor). `jspdf` + `jspdf-autotable` são carregados por
  `import()` dinâmico só no clique — não pesam no bundle da página.
- Lógica pura em `src/lib/pdf/relatorioMarcas.ts` (roda também no Node):
  `selecionarMarcas`, `gerarPdfMarcas`, `nomeArquivoPdf`
  (`marcas-<loja>-<nº>-<status>-<AAAA-MM-DD>.pdf`, sem acentos).
- Layout A4 retrato: logo + título "<filtro> — <loja>", resumo da auditoria
  INTEIRA (não só do filtro), tabela `# | Código | Marca | Status | Início |
  Observação | Visto` (caixinha vazia para marcar à mão), rodapé "Página X de Y".
  Início em formato curto "30/09 10:15" e larguras de coluna escolhidas para cada
  linha ocupar uma linha só (485 marcas ≈ 13 páginas).
- Ordenação por nome usa `localeCompare(..., { numeric: true })` (mesma regra da tela).
- **Compressão ligada por padrão** (`comprimir`): sem ela a logo PNG com
  transparência vira ~400 KB. Os testes passam `comprimir: false` para poder
  procurar o texto dentro do arquivo gerado.
- Fonte padrão Helvetica (WinAnsi): acentos pt-BR funcionam; evite caracteres
  fora do Latin-1 (emoji, aspas tipográficas raras) no texto do PDF.

## Testar e ver o resultado

- `npm test -- src/lib/pdf` (filtro, ordem, PDF vazio, 485 marcas, nome do arquivo).
- Para olhar o PDF (não há poppler): gere o arquivo num teste temporário
  (`doc.output('arraybuffer')` → `writeFileSync` no scratchpad) e renderize com
  PyMuPDF (instalado com `pip install --user pymupdf` no Python real):
  `pymupdf.open(pdf)[0].get_pixmap(dpi=110).save('pag1.png')`, depois leia o PNG.
