import { limparCelula, linhaContem, linhaVazia, parseDecimalBR, parseInteiroBR, type Linha } from './celulas';

// Relatório "Valor de Estoque - Analítico" do Santri ADM (filtro Ativo: Sim,
// agrupamento por Grupo). Depois da linha de colunas `Produto | Nome | Marca |
// ... | Disponível (10) | Und. (11)` vêm linhas de agrupamento e de item:
//   agrupamento → código hierárquico "001", "001.001", "001.001.0001"... na
//                 coluna 0 e "Qtd: N" na coluna Marca. O 1º nível é o departamento.
//   item        → código do produto ("71.340"), nome, marca, ..., disponível.
// Termina em "TOTAL:"; o rodapé "Filtros selecionados" lista as empresas.

export type ItemEstoque = {
  codigo: number;
  nome: string;
  marca: string;
  departamento: string | null;
  disponivel: number;
};

export type ResultadoEstoque = {
  itens: ItemEstoque[];
  departamentos: string[];
  empresas: string[];
  avisos: string[];
};

const COL = { codigo: 0, nome: 1, marca: 2, disponivel: 10 } as const;

const celula = (linha: Linha, i: number) => limparCelula(linha[i]);

function ehCabecalhoDeColunas(linha: Linha) {
  return (
    celula(linha, 0).toUpperCase() === 'PRODUTO' &&
    celula(linha, 1).toUpperCase() === 'NOME' &&
    celula(linha, 2).toUpperCase() === 'MARCA'
  );
}

export function parseValorEstoque(linhas: Linha[]): ResultadoEstoque {
  const inicio = linhas.findIndex(ehCabecalhoDeColunas);
  if (inicio === -1) {
    throw new Error(
      'Não encontrei a linha de colunas "Produto | Nome | Marca". Confira se o arquivo é o "Valor de Estoque - Analítico".',
    );
  }

  const avisos: string[] = [];
  const porCodigo = new Map<number, ItemEstoque>();
  const departamentos: string[] = [];
  const empresas: string[] = [];
  let departamento: string | null = null;
  let noRodape = false;

  for (let i = inicio + 1; i < linhas.length; i++) {
    const linha = linhas[i];

    if (noRodape) {
      const emp = celula(linha, 0).match(/^\d+\s*-\s*(.+)$/);
      if (emp) empresas.push(celula(linha, 0));
      continue;
    }
    if (linhaContem(linha, 'Filtros selecionados')) {
      noRodape = true;
      continue;
    }
    if (linhaVazia(linha) || celula(linha, 0).toUpperCase().startsWith('TOTAL')) continue;
    if (ehCabecalhoDeColunas(linha)) continue; // repetido em quebra de página

    const codigo = celula(linha, COL.codigo);
    const nome = celula(linha, COL.nome);
    const marca = celula(linha, COL.marca);

    if (/^Qtd:/i.test(marca)) {
      // Agrupamento: só o 1º nível ("001", sem ponto) vira departamento.
      if (/^\d+$/.test(codigo)) {
        departamento = `${codigo} - ${nome}`;
        departamentos.push(departamento);
      }
      continue;
    }

    const numero = parseInteiroBR(codigo);
    if (numero === null || nome === '') {
      avisos.push(`Linha ${i + 1} ignorada: código de produto inválido ("${codigo}").`);
      continue;
    }
    if (marca === '') {
      avisos.push(`Produto ${numero} (${nome}) sem marca, ignorado.`);
      continue;
    }
    if (porCodigo.has(numero)) avisos.push(`Produto ${numero} aparece mais de uma vez; mantida a última linha.`);
    porCodigo.set(numero, { codigo: numero, nome, marca, departamento, disponivel: parseDecimalBR(linha[COL.disponivel]) ?? 0 });
  }

  if (porCodigo.size === 0) throw new Error('O relatório não tem nenhum produto.');
  return { itens: [...porCodigo.values()], departamentos, empresas, avisos };
}
