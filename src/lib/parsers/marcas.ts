import { limparCelula, linhaContem, linhaVazia, parseInteiroBR, type Linha } from './celulas';

// Relatório "Relação de Produtos por Marca" do Santri ADM.
// Cabeçalho do relatório nas primeiras linhas; depois uma linha de colunas
// `Código | Nome | | | Total` e uma linha por marca até uma linha em branco
// ou "Filtros Selecionados".

export type MarcaImportada = { codigo: number; nome: string };

export type ResultadoMarcas = {
  marcas: MarcaImportada[];
  avisos: string[];
};

function ehCabecalhoDeColunas(linha: Linha): boolean {
  const a = limparCelula(linha[0]).toUpperCase();
  const b = limparCelula(linha[1]).toUpperCase();
  return (a === 'CÓDIGO' || a === 'CODIGO') && b === 'NOME';
}

export function parseRelacaoMarcas(linhas: Linha[]): ResultadoMarcas {
  const avisos: string[] = [];
  const inicio = linhas.findIndex(ehCabecalhoDeColunas);
  if (inicio === -1) {
    throw new Error(
      'Não encontrei a linha de colunas "Código | Nome". Confira se o arquivo é a "Relação de Produtos por Marca".',
    );
  }

  const porCodigo = new Map<number, MarcaImportada>();
  for (let i = inicio + 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linhaVazia(linha) || linhaContem(linha, 'Filtros Selecionados')) break;

    const codigo = parseInteiroBR(linha[0]);
    const nome = limparCelula(linha[1]);
    if (codigo === null || nome === '') {
      avisos.push(`Linha ${i + 1} ignorada: código ou nome inválido ("${limparCelula(linha[0])}").`);
      continue;
    }
    if (porCodigo.has(codigo)) {
      avisos.push(`Código ${codigo} repetido na linha ${i + 1}; mantido o último nome.`);
    }
    porCodigo.set(codigo, { codigo, nome });
  }

  return { marcas: [...porCodigo.values()], avisos };
}
