import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDataHoraBR, parseDecimalBR, parseInteiroBR } from './celulas';
import { parseContagensAcompanhadas } from './contagens';
import { parseValorEstoque } from './estoque';
import { parseRelacaoMarcas } from './marcas';
import { lerPrimeiraAba } from './planilha';
import { classificarCobertura, marcasSemCorrespondencia, planejarAplicacao, skusDoArquivo } from '../sugestao';

const vazia = () => Array(25).fill('');
const linha = (valores: Record<number, string>) => {
  const l = vazia();
  for (const [i, v] of Object.entries(valores)) l[Number(i)] = v;
  return l;
};

const CAB_CONTAGEM = linha({ 0: 'Contagem', 1: 'Data/hora de inserção', 2: 'Status', 3: 'Local', 23: 'Data/hora baixa' });
const CAB_ITENS = linha({ 1: 'Produto', 2: 'Nome', 3: 'Marca', 9: 'Estoque físico', 10: 'Qtd. contada', 12: 'Dif. qtd. contada' });
const contagem = (numero: string, status: string, baixa = '') =>
  linha({ 0: numero, 1: '29/09/26 09:12:12', 2: status, 3: 'DEPOSITO 02-A', 4: 'FULANO', 23: baixa });
const item = (marca: string, codigo = '137.272') =>
  linha({ 1: codigo, 2: 'PRODUTO X', 3: marca, 9: '21,000', 10: '3,000', 12: '-1.131,46' });

describe('células pt-BR', () => {
  it('converte números e datas do Santri', () => {
    expect(parseInteiroBR('1.625')).toBe(1625);
    expect(parseInteiroBR('43.574')).toBe(43574);
    expect(parseInteiroBR('12a')).toBeNull();
    expect(parseDecimalBR('-1.131,46')).toBe(-1131.46);
    expect(parseDecimalBR('')).toBeNull();
    expect(parseDataHoraBR('29/09/26 09:12:12')).toBe('2026-09-29T09:12:12-03:00');
    expect(parseDataHoraBR('')).toBeNull();
  });
});

describe('Relação de Produtos por Marca', () => {
  it('lê do cabeçalho de colunas até o rodapé, com quebras de linha nas células', () => {
    const r = parseRelacaoMarcas([
      ['Santri ADM', '', '', '', ''],
      ['Relação de Produtos por Marca', '', '', '', ''],
      ['', '', '', '', ''],
      ['Emitido em', '', '', '', ''],
      ['Código', 'Nome', '', '', 'Total'],
      ['1.625', 'HEVVY\n', '', '', '120'],
      ['7', ' GERMANY ', '', '', '30'],
      ['xx', 'SEM CODIGO', '', '', '1'],
      ['7', 'GERMANY LUX', '', '', '30'],
      ['', '', '', '', ''],
      ['Filtros Selecionados', '', '', '', ''],
      ['99', 'NAO LER', '', '', ''],
    ]);
    expect(r.marcas).toEqual([
      { codigo: 1625, nome: 'HEVVY' },
      { codigo: 7, nome: 'GERMANY LUX' },
    ]);
    expect(r.avisos).toHaveLength(2);
  });

  it('recusa arquivo sem a linha de colunas', () => {
    expect(() => parseRelacaoMarcas([['qualquer coisa']])).toThrow(/Código \| Nome/);
  });
});

describe('Ordens de Contagens Acompanhadas', () => {
  const linhas = [
    linha({ 0: 'Santri ADM 1.1.5.9 R1' }),
    linha({ 0: 'Ordens de Contagens Acompanhadas Analítico' }),
    vazia(),
    CAB_CONTAGEM,
    contagem('43.574', 'Baixada', '29/09/26 10:00:00'),
    CAB_ITENS,
    item('HEVVY'),
    item('GERMANY', '1'),
    vazia(),
    CAB_CONTAGEM,
    contagem('43.575', 'Cancelada'),
    CAB_ITENS,
    item('BLUMENAU'),
    vazia(),
    CAB_CONTAGEM,
    contagem('43.576', 'Contada'),
    CAB_ITENS,
    item('GERMANY'),
    item('TASCHIBRA'),
    vazia(),
    CAB_CONTAGEM,
    contagem('43.577', 'Em contagem'),
    CAB_ITENS,
    item('ELGIN'),
    vazia(),
    vazia(),
    linha({ 3: 'TOTAL GERAL:', 4: '4' }),
    vazia(),
    linha({ 0: 'Filtros Selecionados' }),
    linha({ 0: 'Empresa: 1 - CFS' }),
    linha({ 0: 'Data da inserção:01/09/2026 até 29/09/2026' }),
  ];

  it('separa blocos, itens e rodapé', () => {
    const r = parseContagensAcompanhadas(linhas);
    expect(r.contagens.map((c) => [c.numero, c.status, c.itens.length])).toEqual([
      [43574, 'baixada', 2],
      [43575, 'cancelada', 1],
      [43576, 'contada', 2],
      [43577, 'em_contagem', 1],
    ]);
    expect(r.contagens[0].data_baixa).toBe('2026-09-29T10:00:00-03:00');
    expect(r.contagens[0].itens[0]).toMatchObject({
      marca: 'HEVVY',
      produto_codigo: '137.272',
      estoque_fisico: 21,
      qtd_contada: 3,
      diferenca: -1131.46,
    });
    expect(r.periodoInicio).toBe('2026-09-01');
    expect(r.periodoFim).toBe('2026-09-29');
    expect(r.empresa).toBe('1 - CFS');
    expect(r.avisos).toEqual([]);
  });

  it('lista SKUs distintos do arquivo, de qualquer status, e marcas sem correspondência', () => {
    const { contagens } = parseContagensAcompanhadas(linhas);
    const skus = skusDoArquivo(contagens);
    // Cancelada e Em contagem também contam como cobertura; "137.272" vira "137272".
    expect(skus.some((s) => s.marca === 'BLUMENAU')).toBe(true);
    expect(skus.every((s) => /^\d+$/.test(s.produto_codigo))).toBe(true);
    expect(new Set(skus.map((s) => `${s.marca}|${s.produto_codigo}`)).size).toBe(skus.length);
    expect(marcasSemCorrespondencia(contagens, [{ marca_nome: 'germany' }, { marca_nome: 'TASCHIBRA' }])).toEqual(
      expect.arrayContaining(['HEVVY']),
    );
  });
});

describe('cobertura de SKUs', () => {
  const cob = (id: string, ativos: number, contados: number) => ({
    auditoria_marca_id: id,
    skus_ativos: ativos,
    skus_com_saldo: ativos,
    skus_contados: contados,
    departamentos: [],
  });

  it('classifica pela quantidade de SKUs distintos contados', () => {
    expect(classificarCobertura(371, 360)).toBe('parcial'); // exemplo do outro sistema: 97%
    expect(classificarCobertura(371, 371)).toBe('concluida');
    expect(classificarCobertura(10, 12)).toBe('concluida');
    expect(classificarCobertura(10, 0)).toBeNull();
  });

  it('manual só sobe; o que veio da importação acompanha a cobertura', () => {
    const mudancas = planejarAplicacao(
      [
        { id: '1', marca_nome: 'A', status: 'pendente', status_origem: 'manual' },
        { id: '2', marca_nome: 'B', status: 'concluida', status_origem: 'manual' },
        { id: '3', marca_nome: 'C', status: 'concluida', status_origem: 'sugerido_importacao' },
        { id: '4', marca_nome: 'D', status: 'pendente', status_origem: 'manual' },
        { id: '5', marca_nome: 'E', status: 'em_contagem', status_origem: 'manual' },
      ],
      [cob('1', 5, 5), cob('2', 5, 1), cob('3', 371, 360), cob('4', 5, 0), cob('5', 5, 2)],
    );
    expect(mudancas.map((m) => [m.marca, m.de, m.para])).toEqual([
      ['A', 'pendente', 'concluida'],
      ['C', 'concluida', 'parcial'],
      ['E', 'em_contagem', 'parcial'],
    ]);
  });
});

// Validação contra o relatório real (não versionado). Defina SANTRI_CONTAGENS_ODS
// para apontar outro arquivo.
const ARQUIVO_REAL =
  process.env.SANTRI_CONTAGENS_ODS ??
  'C:/Users/castelo/Desktop/Relatorios-Logistica-Marcio/Arquivos_ods/contagens_acompanhadas 2026 9.ods';

describe.skipIf(!existsSync(ARQUIVO_REAL))('arquivo real de contagens', () => {
  it('lê todas as contagens e itens sem avisos', () => {
    const buffer = readFileSync(ARQUIVO_REAL);
    const linhas = lerPrimeiraAba(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    const r = parseContagensAcompanhadas(linhas);
    const itens = r.contagens.reduce((t, c) => t + c.itens.length, 0);
    const porStatus = r.contagens.reduce<Record<string, number>>((t, c) => {
      t[c.status] = (t[c.status] ?? 0) + 1;
      return t;
    }, {});
    console.log({ contagens: r.contagens.length, itens, porStatus, periodo: [r.periodoInicio, r.periodoFim] });
    expect(r.avisos).toEqual([]);
    expect(r.contagens.length).toBeGreaterThan(1000);
    expect(itens).toBeGreaterThan(10000);
    expect(r.periodoInicio).not.toBeNull();
  }, 60_000);
});

describe('Valor de Estoque - Analítico', () => {
  const l = (valores: Record<number, string>) => {
    const r = Array(17).fill('');
    for (const [i, v] of Object.entries(valores)) r[Number(i)] = v;
    return r;
  };
  const linhas = [
    l({ 0: 'Santri ADM 1.1.5.9 R1' }),
    l({ 0: 'Valor de Estoque - Analítico' }),
    l({ 0: 'Produto', 1: 'Nome', 2: 'Marca', 10: 'Disponível', 11: 'Und.' }),
    l({ 0: '001', 1: 'LOUÇAS', 2: 'Qtd: 3' }),
    l({ 0: '001.001', 1: 'SETOR LOUÇAS', 2: 'Qtd: 3' }),
    l({ 0: '001.001.0001', 1: 'CUBAS EMBUTIR', 2: 'Qtd: 3' }),
    l({ 0: '71.340', 1: 'CUBA OVAL', 2: 'CELITE/ROCA', 10: '18,000', 11: 'UND' }),
    l({ 0: '135.356', 1: 'CUBA OVAL 390', 2: 'ROCA', 11: 'UND' }),
    l({}),
    // Produto de código curto (< 1000) não pode ser confundido com departamento.
    l({ 0: '628', 1: 'BOLSA PARA SAIDA DE VASO', 2: 'ASTRA', 10: '1.250,500', 11: 'UND' }),
    l({ 0: '002', 1: 'MATERIAL BASICO', 2: 'Qtd: 1' }),
    l({ 0: '905', 1: 'CIMENTO 1 KG', 2: 'TOCANTINS', 10: '0,000', 11: 'UND' }),
    l({ 0: 'TOTAL:', 1: 'Qtd: 4' }),
    l({ 0: 'Filtros selecionados' }),
    l({ 0: 'Empresas:' }),
    l({ 0: '1 - HOME CENTER CASTELO FORTE LTDA' }),
    l({ 0: 'Ativo: Sim' }),
  ];

  it('lê itens com departamento e as empresas do rodapé', () => {
    const r = parseValorEstoque(linhas);
    expect(r.avisos).toEqual([]);
    expect(r.departamentos).toEqual(['001 - LOUÇAS', '002 - MATERIAL BASICO']);
    expect(r.empresas).toEqual(['1 - HOME CENTER CASTELO FORTE LTDA']);
    expect(r.itens).toEqual([
      { codigo: 71340, nome: 'CUBA OVAL', marca: 'CELITE/ROCA', departamento: '001 - LOUÇAS', disponivel: 18 },
      { codigo: 135356, nome: 'CUBA OVAL 390', marca: 'ROCA', departamento: '001 - LOUÇAS', disponivel: 0 },
      { codigo: 628, nome: 'BOLSA PARA SAIDA DE VASO', marca: 'ASTRA', departamento: '001 - LOUÇAS', disponivel: 1250.5 },
      { codigo: 905, nome: 'CIMENTO 1 KG', marca: 'TOCANTINS', departamento: '002 - MATERIAL BASICO', disponivel: 0 },
    ]);
  });

  it('recusa arquivo que não é o relatório de estoque', () => {
    expect(() => parseValorEstoque([l({ 0: 'Código', 1: 'Nome' })])).toThrow(/Valor de Estoque/);
  });
});

const ESTOQUE_REAL = process.env.SANTRI_ESTOQUE_ODS ?? 'Valor do estoque.ods';

describe.skipIf(!existsSync(ESTOQUE_REAL))('arquivo real de estoque', () => {
  it('lê todos os itens e departamentos sem avisos', () => {
    const buffer = readFileSync(ESTOQUE_REAL);
    const r = parseValorEstoque(lerPrimeiraAba(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
    console.log({ itens: r.itens.length, departamentos: r.departamentos.length, empresas: r.empresas.length });
    expect(r.avisos).toEqual([]);
    expect(r.itens.length).toBeGreaterThan(10000);
    expect(r.itens.every((i) => i.departamento)).toBe(true);
  }, 60_000);
});
