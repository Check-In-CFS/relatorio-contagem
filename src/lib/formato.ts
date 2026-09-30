const dataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export const formatarDataHora = (iso: string | null | undefined) => (iso ? dataHora.format(new Date(iso)) : '—');

export function formatarDuracao(inicioIso: string, fimIso?: string | null, agora = Date.now()): string {
  const fim = fimIso ? new Date(fimIso).getTime() : agora;
  const minutos = Math.max(0, Math.floor((fim - new Date(inicioIso).getTime()) / 60_000));
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const min = minutos % 60;
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${String(min).padStart(2, '0')}min`;
  return `${min}min`;
}

export const percentual = (parte: number, total: number) => (total === 0 ? 0 : Math.round((parte / total) * 100));
