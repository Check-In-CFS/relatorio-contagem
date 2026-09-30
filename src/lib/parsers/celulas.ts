// Utilitários para células dos relatórios do Santri ADM. Os relatórios são
// impressões convertidas em .ods: tudo chega como texto formatado em pt-BR,
// às vezes com quebras de linha embutidas.

export type Linha = string[];

export function limparCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s*\n\s*/g, ' ').trim();
}

export function linhaVazia(linha: Linha): boolean {
  return linha.every((c) => limparCelula(c) === '');
}

export function linhaContem(linha: Linha, texto: string): boolean {
  return linha.some((c) => limparCelula(c).toUpperCase().startsWith(texto.toUpperCase()));
}

/** "1.625" → 1625. Retorna null se não for um inteiro válido. */
export function parseInteiroBR(valor: unknown): number | null {
  const texto = limparCelula(valor);
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(texto)) return null;
  return Number(texto.replace(/\./g, ''));
}

/** "-1.131,46" → -1131.46. Célula vazia → null. */
export function parseDecimalBR(valor: unknown): number | null {
  const texto = limparCelula(valor);
  if (texto === '') return null;
  const normalizado = texto.replace(/\./g, '').replace(',', '.');
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * "29/09/26 09:12:12" ou "29/09/2026 09:12:12" → ISO com fuso de Brasília
 * (sem horário de verão desde 2019). Célula vazia ou inválida → null.
 */
export function parseDataHoraBR(valor: unknown): string | null {
  const texto = limparCelula(valor);
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, dia, mes, anoBruto, hora = '00', minuto = '00', segundo = '00'] = m;
  const ano = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
  return `${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}-03:00`;
}

/** "01/09/2026" → "2026-09-01". */
export function parseDataBR(valor: unknown): string | null {
  const iso = parseDataHoraBR(valor);
  return iso ? iso.slice(0, 10) : null;
}
