import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDataHoraBR, parseDecimalBR, parseInteiroBR } from './celulas';
import { parseContagensAcompanhadas } from './contagens';
import { parseRelacaoMarcas } from './marcas';
import { lerPrimeiraAba } from './planilha';
import { calcularSugestoes, planejarAplicacao } from '../sugestao';

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

  it('sugere por item, agregando todas as contagens', () => {
    const { contagens } = parseContagensAcompanhadas(linhas);
    const s = calcularSugestoes(contagens);
    // Baixada vence, mesmo com outra contagem Contada da mesma marca
    expect(s.get('GERMANY')?.status).toBe('concluida');
    expect(s.get('HEVVY')?.status).toBe('concluida');
    // Contagem mista: a segunda marca do bloco também é considerada
    expect(s.get('TASCHIBRA')?.status).toBe('parcial');
    // Cancelada e Em contagem não sugerem nada
    expect(s.has('BLUMENAU')).toBe(false);
    expect(s.has('ELGIN')).toBe(false);
  });

  it('nunca rebaixa status e lista marcas sem correspondência', () => {
    const { contagens } = parseContagensAcompanhadas(linhas);
    const plano = planejarAplicacao(
      [
        { id: '1', marca_nome: 'germany', status: 'pendente' },
        { id: '2', marca_nome: 'TASCHIBRA', status: 'concluida' },
        { id: '3', marca_nome: 'ELGIN', status: 'pendente' },
      ],
      calcularSugestoes(contagens),
    );
    expect(plano.mudancas).toEqual([{ id: '1', marca: 'germany', de: 'pendente', para: 'concluida' }]);
    expect(plano.semCorrespondencia).toEqual(['HEVVY']);
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
