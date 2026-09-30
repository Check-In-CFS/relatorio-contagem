import type { ContagemImportada, StatusContagem } from './parsers/contagens';
import type { StatusMarca } from './tipos';

// Regra de sugestão de status a partir das contagens do Santri (seção 6.2 da
// especificação). Agrega por ITEM, nunca pelo bloco inteiro, e considera
// todas as contagens do arquivo antes de decidir.
//   - Cancelada: ignorada
//   - alguma Baixada tocou a marca → concluida
//   - senão, alguma Contada/Recontada tocou a marca → parcial
//   - Aberta / Em contagem: ainda não houve contagem de fato → ignoradas
// A sugestão nunca rebaixa um status mais avançado, e pode levar uma marca
// pendente ou em contagem direto para parcial/concluída (não exige o "Iniciar").

// Mesma ordem do enum status_marca no banco.
export const ORDEM_STATUS: Record<StatusMarca, number> = { pendente: 0, em_contagem: 1, parcial: 2, concluida: 3 };

const EFEITO: Record<StatusContagem, StatusMarca | null> = {
  baixada: 'concluida',
  contada: 'parcial',
  recontada: 'parcial',
  aberta: null,
  em_contagem: null,
  cancelada: null,
};

/** Mesma regra de public.normalizar_nome_marca() no banco. */
export function normalizarNomeMarca(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim().toUpperCase();
}

export type SugestaoMarca = {
  marca: string;
  status: 'parcial' | 'concluida';
  contagensBaixadas: number;
  contagensNaoConfirmadas: number;
};

export function calcularSugestoes(contagens: ContagemImportada[]): Map<string, SugestaoMarca> {
  const acumulado = new Map<
    string,
    { marca: string; baixadas: Set<number>; naoConfirmadas: Set<number> }
  >();

  for (const contagem of contagens) {
    const efeito = EFEITO[contagem.status];
    if (!efeito) continue;
    for (const item of contagem.itens) {
      const chave = normalizarNomeMarca(item.marca);
      let registro = acumulado.get(chave);
      if (!registro) {
        registro = { marca: item.marca.trim(), baixadas: new Set(), naoConfirmadas: new Set() };
        acumulado.set(chave, registro);
      }
      (efeito === 'concluida' ? registro.baixadas : registro.naoConfirmadas).add(contagem.numero);
    }
  }

  const sugestoes = new Map<string, SugestaoMarca>();
  for (const [chave, r] of acumulado) {
    sugestoes.set(chave, {
      marca: r.marca,
      status: r.baixadas.size > 0 ? 'concluida' : 'parcial',
      contagensBaixadas: r.baixadas.size,
      contagensNaoConfirmadas: r.naoConfirmadas.size,
    });
  }
  return sugestoes;
}

export type MarcaDaAuditoria = { id: string; marca_nome: string; status: StatusMarca };
export type MudancaPlanejada = { id: string; marca: string; de: StatusMarca; para: StatusMarca };

export function planejarAplicacao(marcas: MarcaDaAuditoria[], sugestoes: Map<string, SugestaoMarca>) {
  const mudancas: MudancaPlanejada[] = [];
  const casadas = new Set<string>();

  for (const marca of marcas) {
    const chave = normalizarNomeMarca(marca.marca_nome);
    const sugestao = sugestoes.get(chave);
    if (!sugestao) continue;
    casadas.add(chave);
    if (ORDEM_STATUS[sugestao.status] > ORDEM_STATUS[marca.status]) {
      mudancas.push({ id: marca.id, marca: marca.marca_nome, de: marca.status, para: sugestao.status });
    }
  }

  const semCorrespondencia = [...sugestoes.entries()]
    .filter(([chave]) => !casadas.has(chave))
    .map(([, s]) => s.marca)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return { mudancas, semCorrespondencia };
}
