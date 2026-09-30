import { describe, expect, it } from 'vitest';
import type { AuditoriaMarca, StatusMarca } from '../tipos';
import { gerarPdfMarcas, nomeArquivoPdf, selecionarMarcas } from './relatorioMarcas';

const marca = (nome: string, codigo: number, status: StatusMarca, obs: string | null = null): AuditoriaMarca => ({
  id: `${codigo}`,
  marca_nome: nome,
  marca_codigo: codigo,
  status,
  status_origem: 'manual',
  observacao: obs,
  iniciada_em: status === 'pendente' ? null : '2026-09-30T10:15:00-03:00',
  atualizado_em: '2026-09-30T10:15:00-03:00',
});

const auditoria = {
  numero: 7,
  loja_nome: 'Loja Centro',
  empresa_nome: 'Home Center Castelo Forte',
  auditor_nome: 'Gil',
  status: 'em_andamento' as const,
  iniciada_em: '2026-09-30T08:00:00-03:00',
  finalizada_em: null,
};

const marcas = [
  marca('TASCHIBRA', 30, 'parcial', 'faltou o depósito 2'),
  marca('HEVVY', 10, 'concluida'),
  marca('GERMANY', 20, 'pendente'),
  marca('BLUMENAU', 40, 'em_contagem'),
];

// jsPDF grava o texto sem compressão: dá para procurar no conteúdo do arquivo.
const textoDoPdf = (filtro: Parameters<typeof gerarPdfMarcas>[0]['filtro']) =>
  gerarPdfMarcas({ auditoria, marcas, filtro, ordem: 'nome', comprimir: false }).output();

describe('PDF de marcas', () => {
  it('filtra por status e ordena por nome ou código', () => {
    expect(selecionarMarcas(marcas, 'todas', 'nome').map((m) => m.marca_nome)).toEqual([
      'BLUMENAU',
      'GERMANY',
      'HEVVY',
      'TASCHIBRA',
    ]);
    expect(selecionarMarcas(marcas, 'todas', 'codigo').map((m) => m.marca_codigo)).toEqual([10, 20, 30, 40]);
    expect(selecionarMarcas(marcas, 'parcial', 'nome').map((m) => m.marca_nome)).toEqual(['TASCHIBRA']);
    // não altera a lista original
    expect(marcas[0].marca_nome).toBe('TASCHIBRA');
  });

  it('gera um PDF só com as marcas do status escolhido', () => {
    const todas = textoDoPdf('todas');
    expect(todas.startsWith('%PDF-')).toBe(true);
    for (const nome of ['HEVVY', 'GERMANY', 'TASCHIBRA', 'BLUMENAU']) expect(todas).toContain(nome);

    const pendentes = textoDoPdf('pendente');
    expect(pendentes).toContain('GERMANY');
    expect(pendentes).not.toContain('HEVVY');
    expect(pendentes).not.toContain('TASCHIBRA');
  });

  it('gera PDF válido mesmo sem marcas no status e com muitas páginas', () => {
    expect(textoDoPdf('concluida')).toContain('HEVVY');
    const vazio = gerarPdfMarcas({ auditoria, marcas: [], filtro: 'pendente', ordem: 'nome' });
    expect(vazio.getNumberOfPages()).toBe(1);

    const muitas = Array.from({ length: 485 }, (_, i) => marca(`MARCA ${i}`, i + 1, 'pendente'));
    const grande = gerarPdfMarcas({ auditoria, marcas: muitas, filtro: 'todas', ordem: 'codigo' });
    expect(grande.getNumberOfPages()).toBeGreaterThan(5);
  });

  it('monta um nome de arquivo sem acentos nem espaços', () => {
    expect(nomeArquivoPdf({ ...auditoria, loja_nome: 'Loja São João' }, 'concluida', new Date('2026-09-30T15:00:00Z'))).toBe(
      'marcas-loja-sao-joao-7-concluidas-2026-09-30.pdf',
    );
  });
});
