import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatarDataHora, percentual } from '../formato';
import {
  ROTULO_STATUS_AUDITORIA,
  ROTULO_STATUS_MARCA,
  ROTULO_STATUS_MARCA_PLURAL,
  type AuditoriaMarca,
  type StatusAuditoria,
  type StatusMarca,
} from '../tipos';

// Relação de marcas de uma auditoria em PDF (A4 retrato), gerada no navegador
// a partir dos dados já carregados na tela — a RLS já filtrou o que o usuário vê.
// Também roda no Node (testes).

export type FiltroPdf = 'todas' | StatusMarca;
export type OrdemPdf = 'nome' | 'codigo';

export type CabecalhoAuditoria = {
  numero: number;
  loja_nome: string;
  empresa_nome: string;
  auditor_nome: string;
  status: StatusAuditoria;
  iniciada_em: string;
  finalizada_em: string | null;
};

export type OpcoesPdf = {
  auditoria: CabecalhoAuditoria;
  marcas: AuditoriaMarca[];
  filtro: FiltroPdf;
  ordem: OrdemPdf;
  /** PNG em data URL (opcional). */
  logo?: string;
  geradoEm?: Date;
  /** Comprime o PDF (padrão). Os testes desligam para ler o texto do arquivo. */
  comprimir?: boolean;
};

const COR_STATUS: Record<StatusMarca, [number, number, number]> = {
  pendente: [107, 107, 125],
  em_contagem: [91, 61, 245],
  parcial: [166, 75, 0],
  concluida: [0, 121, 92],
};
const VIOLETA: [number, number, number] = [91, 61, 245];
const TEXTO: [number, number, number] = [20, 20, 31];
const MUTED: [number, number, number] = [107, 107, 125];
const MARGEM = 12;

// Início da marca em formato curto ("30/09 10:15") para caber numa linha.
const diaHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const formatarInicio = (iso: string) => diaHora.format(new Date(iso)).replace(',', '');

export function selecionarMarcas(marcas: AuditoriaMarca[], filtro: FiltroPdf, ordem: OrdemPdf) {
  const porNome = (a: AuditoriaMarca, b: AuditoriaMarca) =>
    a.marca_nome.localeCompare(b.marca_nome, 'pt-BR', { numeric: true });
  return marcas
    .filter((m) => filtro === 'todas' || m.status === filtro)
    .sort(
      ordem === 'codigo'
        ? (a, b) => (a.marca_codigo ?? Infinity) - (b.marca_codigo ?? Infinity) || porNome(a, b)
        : porNome,
    );
}

export const tituloFiltro = (filtro: FiltroPdf) =>
  filtro === 'todas' ? 'Todas as marcas' : `Marcas ${ROTULO_STATUS_MARCA_PLURAL[filtro].toLowerCase()}`;

function slug(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function nomeArquivoPdf(auditoria: CabecalhoAuditoria, filtro: FiltroPdf, data = new Date()) {
  const dia = data.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
  const status = filtro === 'todas' ? 'todas' : slug(ROTULO_STATUS_MARCA_PLURAL[filtro]);
  return `marcas-${slug(auditoria.loja_nome)}-${auditoria.numero}-${status}-${dia}.pdf`;
}

export function gerarPdfMarcas({
  auditoria,
  marcas,
  filtro,
  ordem,
  logo,
  geradoEm = new Date(),
  comprimir = true,
}: OpcoesPdf): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: comprimir });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const selecionadas = selecionarMarcas(marcas, filtro, ordem);

  const totais: Record<StatusMarca, number> = { pendente: 0, em_contagem: 0, parcial: 0, concluida: 0 };
  for (const m of marcas) totais[m.status]++;

  // Cabeçalho (só na primeira página)
  let x = MARGEM;
  if (logo) {
    doc.addImage(logo, 'PNG', MARGEM, 10, 14, 14);
    x = MARGEM + 18;
  }
  doc.setTextColor(...TEXTO);
  doc.setFont('helvetica', 'bold').setFontSize(15);
  doc.text(`${tituloFiltro(filtro)} — ${auditoria.loja_nome}`, x, 15);
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...MUTED);
  doc.text(`${auditoria.empresa_nome} · Auditoria #${auditoria.numero} · Auditor: ${auditoria.auditor_nome}`, x, 20.5);
  const periodo = auditoria.finalizada_em
    ? `de ${formatarDataHora(auditoria.iniciada_em)} a ${formatarDataHora(auditoria.finalizada_em)}`
    : `iniciada em ${formatarDataHora(auditoria.iniciada_em)}`;
  doc.text(`${ROTULO_STATUS_AUDITORIA[auditoria.status]} · ${periodo}`, x, 25);

  // Resumo da auditoria inteira (não só do filtro)
  const topoResumo = 30;
  doc.setDrawColor(228, 228, 238).setFillColor(247, 247, 251);
  doc.roundedRect(MARGEM, topoResumo, largura - 2 * MARGEM, 12, 2, 2, 'FD');
  const itensResumo: [string, string, [number, number, number]][] = [
    ['Concluído', `${percentual(totais.concluida, marcas.length)}%`, TEXTO],
    ['Total', String(marcas.length), TEXTO],
    ['Concluídas', String(totais.concluida), COR_STATUS.concluida],
    ['Parciais', String(totais.parcial), COR_STATUS.parcial],
    ['Em contagem', String(totais.em_contagem), COR_STATUS.em_contagem],
    ['Pendentes', String(totais.pendente), COR_STATUS.pendente],
  ];
  const passo = (largura - 2 * MARGEM) / itensResumo.length;
  itensResumo.forEach(([rotulo, valor, cor], i) => {
    const cx = MARGEM + passo * i + 4;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...cor);
    doc.text(valor, cx, topoResumo + 5.5);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(rotulo, cx, topoResumo + 9.5);
  });

  doc.setFontSize(9).setTextColor(...MUTED);
  doc.text(
    `Neste relatório: ${selecionadas.length} ${selecionadas.length === 1 ? 'marca' : 'marcas'} · ordenadas por ${ordem === 'codigo' ? 'código' : 'nome'}`,
    MARGEM,
    topoResumo + 18,
  );

  autoTable(doc, {
    startY: topoResumo + 21,
    margin: { left: MARGEM, right: MARGEM, bottom: 16 },
    head: [['#', 'Código', 'Marca', 'Status', 'Início', 'Observação', 'Visto']],
    body: selecionadas.length
      ? selecionadas.map((m, i) => [
          String(i + 1),
          m.marca_codigo === null ? '—' : String(m.marca_codigo),
          m.marca_nome,
          ROTULO_STATUS_MARCA[m.status],
          m.iniciada_em && m.status !== 'pendente' ? formatarInicio(m.iniciada_em) : '',
          m.observacao ?? '',
          '',
        ])
      : [[{ content: 'Nenhuma marca com este status.', colSpan: 7, styles: { halign: 'center', textColor: MUTED } }]],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, textColor: TEXTO, lineColor: [228, 228, 238], lineWidth: 0.1 },
    headStyles: { fillColor: VIOLETA, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 247, 251] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'right', textColor: MUTED },
      1: { cellWidth: 16, font: 'courier' },
      2: { cellWidth: 'auto', fontStyle: 'bold' },
      3: { cellWidth: 24 },
      4: { cellWidth: 21 },
      5: { cellWidth: 52 },
      6: { cellWidth: 12 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3 && selecionadas.length) {
        const status = selecionadas[data.row.index].status;
        data.cell.styles.textColor = COR_STATUS[status];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: (data) => {
      // Caixinha para marcar à mão na coluna "Visto"
      if (data.section === 'body' && data.column.index === 6 && selecionadas.length) {
        const lado = 3.6;
        doc.setDrawColor(...MUTED).setLineWidth(0.25);
        doc.rect(data.cell.x + (data.cell.width - lado) / 2, data.cell.y + (data.cell.height - lado) / 2, lado, lado);
      }
    },
  });

  // Rodapé com numeração em todas as páginas
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text(
      `Auditoria de Estoque · ${auditoria.loja_nome} #${auditoria.numero} · gerado em ${formatarDataHora(geradoEm.toISOString())}`,
      MARGEM,
      altura - 8,
    );
    doc.text(`Página ${p} de ${paginas}`, largura - MARGEM, altura - 8, { align: 'right' });
  }

  doc.setProperties({
    title: `${tituloFiltro(filtro)} — ${auditoria.loja_nome} #${auditoria.numero}`,
    creator: 'Auditoria de Estoque',
  });
  return doc;
}
