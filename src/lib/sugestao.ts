import type { ContagemImportada } from './parsers/contagens';
import type { OrigemStatus, StatusMarca } from './tipos';

// Status sugerido pela COBERTURA DE SKUs (mesma regra de public.aplicar_cobertura
// no banco, que é quem grava — aqui é só a pré-visualização):
//   SKUs ativos   = produtos da marca no estoque da loja (inclui saldo zero)
//   SKUs contados = códigos de produto distintos da marca nas contagens da
//                   auditoria, de qualquer status (Cancelada também conta)
//   contados >= ativos → concluida · 0 < contados < ativos → parcial · 0 → nada
// Status manual nunca é rebaixado; o que veio da importação acompanha a cobertura.

// Mesma ordem do enum status_marca no banco.
export const ORDEM_STATUS: Record<StatusMarca, number> = { pendente: 0, em_contagem: 1, parcial: 2, concluida: 3 };

/** Mesma regra de public.normalizar_nome_marca() no banco. */
export function normalizarNomeMarca(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim().toUpperCase();
}

/** "71.340" → "71340" (o banco compara só os dígitos). */
export function normalizarCodigoProduto(codigo: string | null): string {
  return (codigo ?? '').replace(/\D/g, '');
}

export function classificarCobertura(ativos: number, contados: number): 'parcial' | 'concluida' | null {
  if (contados <= 0) return null;
  return contados >= ativos ? 'concluida' : 'parcial';
}

/** Pares distintos (marca, produto) do arquivo — enviados para a prévia no banco. */
export function skusDoArquivo(contagens: ContagemImportada[]) {
  const vistos = new Map<string, { marca: string; produto_codigo: string }>();
  for (const c of contagens) {
    for (const item of c.itens) {
      const codigo = normalizarCodigoProduto(item.produto_codigo);
      if (!codigo) continue;
      const chave = `${normalizarNomeMarca(item.marca)}\u0000${codigo}`;
      if (!vistos.has(chave)) vistos.set(chave, { marca: item.marca, produto_codigo: codigo });
    }
  }
  return [...vistos.values()];
}

export type Cobertura = {
  auditoria_marca_id: string;
  skus_ativos: number;
  skus_com_saldo: number;
  skus_contados: number;
  departamentos: string[];
};

export type MarcaDaAuditoria = { id: string; marca_nome: string; status: StatusMarca; status_origem: OrigemStatus };
export type MudancaPlanejada = {
  id: string;
  marca: string;
  de: StatusMarca;
  para: StatusMarca;
  contados: number;
  ativos: number;
};

export function planejarAplicacao(marcas: MarcaDaAuditoria[], cobertura: Cobertura[]): MudancaPlanejada[] {
  const porId = new Map(cobertura.map((c) => [c.auditoria_marca_id, c]));
  const mudancas: MudancaPlanejada[] = [];
  for (const marca of marcas) {
    const c = porId.get(marca.id);
    const para = c && classificarCobertura(c.skus_ativos, c.skus_contados);
    if (!para || para === marca.status) continue;
    if (marca.status_origem === 'manual' && ORDEM_STATUS[para] < ORDEM_STATUS[marca.status]) continue;
    mudancas.push({ id: marca.id, marca: marca.marca_nome, de: marca.status, para, contados: c.skus_contados, ativos: c.skus_ativos });
  }
  return mudancas;
}

/** Marcas do arquivo que não existem na auditoria (nome diferente do cadastro). */
export function marcasSemCorrespondencia(contagens: ContagemImportada[], marcas: { marca_nome: string }[]): string[] {
  const naAuditoria = new Set(marcas.map((m) => normalizarNomeMarca(m.marca_nome)));
  const fora = new Map<string, string>();
  for (const c of contagens) {
    for (const item of c.itens) {
      const chave = normalizarNomeMarca(item.marca);
      if (!naAuditoria.has(chave) && !fora.has(chave)) fora.set(chave, item.marca.trim());
    }
  }
  return [...fora.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
