import * as XLSX from 'xlsx';
import type { Linha } from './celulas';

/** Lê a primeira aba de um .ods/.xlsx como matriz de textos formatados. */
export function lerPrimeiraAba(conteudo: ArrayBuffer): Linha[] {
  const workbook = XLSX.read(conteudo, { type: 'array' });
  const primeira = workbook.SheetNames[0];
  if (!primeira) return [];
  return XLSX.utils.sheet_to_json<Linha>(workbook.Sheets[primeira], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
  });
}
