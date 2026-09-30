import {
  limparCelula,
  linhaContem,
  linhaVazia,
  parseDataBR,
  parseDataHoraBR,
  parseDecimalBR,
  parseInteiroBR,
  type Linha,
} from './celulas';

// Relatório "Ordens de Contagens Acompanhadas Analítico" do Santri ADM.
// Blocos repetidos até "TOTAL GERAL" / "Filtros Selecionados":
//   linha de colunas "Contagem | Data/hora de inserção | Status | ..."
//   linha da contagem  → nº, inserção, status, local, usuário, ..., baixa (índice 23)
//   linha de colunas "(vazio) | Produto | Nome | Marca | ..."
//   linhas de item     → produto (1), nome (2), marca (3), estoque físico (9),
//                        qtd. contada (10), dif. qtd. contada (12)
//   linha em branco

export const STATUS_CONTAGEM = [
  'aberta',
  'em_contagem',
  'contada',
  'recontada',
  'baixada',
  'cancelada',
] as const;
export type StatusContagem = (typeof STATUS_CONTAGEM)[number];

const STATUS_POR_ROTULO: Record<string, StatusContagem> = {
  ABERTA: 'aberta',
  'EM CONTAGEM': 'em_contagem',
  CONTADA: 'contada',
  RECONTADA: 'recontada',
  BAIXADA: 'baixada',
  CANCELADA: 'cancelada',
};

export type ItemContagem = {
  marca: string;
  produto_codigo: string | null;
  produto_nome: string | null;
  estoque_fisico: number | null;
  qtd_contada: number | null;
  diferenca: number | null;
};

export type ContagemImportada = {
  numero: number;
  status: StatusContagem;
  local: string | null;
  usuario: string | null;
  data_insercao: string | null;
  data_baixa: string | null;
  itens: ItemContagem[];
};

export type ResultadoContagens = {
  contagens: ContagemImportada[];
  periodoInicio: string | null;
  periodoFim: string | null;
  empresa: string | null;
  avisos: string[];
};

const COL = {
  numero: 0,
  insercao: 1,
  status: 2,
  local: 3,
  usuario: 4,
  baixa: 23,
  produto: 1,
  nome: 2,
  marca: 3,
  estoqueFisico: 9,
  qtdContada: 10,
  diferenca: 12,
} as const;

const celula = (linha: Linha, i: number) => limparCelula(linha[i]);
const ouNull = (texto: string) => (texto === '' ? null : texto);

function ehCabecalhoContagem(linha: Linha) {
  return celula(linha, 0).toUpperCase() === 'CONTAGEM' && celula(linha, 2).toUpperCase() === 'STATUS';
}

function ehCabecalhoItens(linha: Linha) {
  return celula(linha, 1).toUpperCase() === 'PRODUTO' && celula(linha, 3).toUpperCase() === 'MARCA';
}

export function parseContagensAcompanhadas(linhas: Linha[]): ResultadoContagens {
  const avisos: string[] = [];
  const porNumero = new Map<number, ContagemImportada>();
  let periodoInicio: string | null = null;
  let periodoFim: string | null = null;
  let empresa: string | null = null;

  let atual: ContagemImportada | null = null;
  let esperandoContagem = false;
  let lendoItens = false;
  let encontrouCabecalho = false;
  let noRodape = false;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    if (noRodape) {
      const texto = celula(linha, 0);
      const periodo = texto.match(/Data da inser[çc][ãa]o:\s*(\S+)\s+at[ée]\s+(\S+)/i);
      if (periodo) {
        periodoInicio = parseDataBR(periodo[1]);
        periodoFim = parseDataBR(periodo[2]);
      }
      const emp = texto.match(/^Empresa:\s*(.+)$/i);
      if (emp) empresa = emp[1].trim();
      continue;
    }

    if (linhaContem(linha, 'Filtros Selecionados')) {
      noRodape = true;
      continue;
    }
    if (linha.some((c) => limparCelula(c).toUpperCase().startsWith('TOTAL GERAL'))) {
      atual = null;
      lendoItens = false;
      continue;
    }
    if (linhaVazia(linha)) {
      atual = null;
      lendoItens = false;
      continue;
    }
    if (ehCabecalhoContagem(linha)) {
      encontrouCabecalho = true;
      esperandoContagem = true;
      atual = null;
      lendoItens = false;
      continue;
    }

    if (esperandoContagem) {
      esperandoContagem = false;
      const numero = parseInteiroBR(linha[COL.numero]);
      const rotulo = celula(linha, COL.status).toUpperCase();
      const status = STATUS_POR_ROTULO[rotulo];
      if (numero === null || !status) {
        avisos.push(
          `Linha ${i + 1}: contagem ignorada (nº "${celula(linha, COL.numero)}", status "${celula(linha, COL.status)}").`,
        );
        continue;
      }
      if (porNumero.has(numero)) {
        avisos.push(`Contagem ${numero} aparece mais de uma vez; mantida a última ocorrência.`);
      }
      atual = {
        numero,
        status,
        local: ouNull(celula(linha, COL.local)),
        usuario: ouNull(celula(linha, COL.usuario)),
        data_insercao: parseDataHoraBR(linha[COL.insercao]),
        data_baixa: parseDataHoraBR(linha[COL.baixa]),
        itens: [],
      };
      porNumero.set(numero, atual);
      continue;
    }

    if (atual && ehCabecalhoItens(linha)) {
      lendoItens = true;
      continue;
    }

    if (atual && lendoItens) {
      const marca = celula(linha, COL.marca);
      if (marca === '') {
        avisos.push(`Linha ${i + 1}: item da contagem ${atual.numero} sem marca, ignorado.`);
        continue;
      }
      atual.itens.push({
        marca,
        produto_codigo: ouNull(celula(linha, COL.produto)),
        produto_nome: ouNull(celula(linha, COL.nome)),
        estoque_fisico: parseDecimalBR(linha[COL.estoqueFisico]),
        qtd_contada: parseDecimalBR(linha[COL.qtdContada]),
        diferenca: parseDecimalBR(linha[COL.diferenca]),
      });
    }
    // Demais linhas (cabeçalho do relatório, quebras de página) são ignoradas.
  }

  if (!encontrouCabecalho) {
    throw new Error(
      'Não encontrei nenhum bloco "Contagem". Confira se o arquivo é o "Ordens de Contagens Acompanhadas Analítico".',
    );
  }

  return { contagens: [...porNumero.values()], periodoInicio, periodoFim, empresa, avisos };
}
