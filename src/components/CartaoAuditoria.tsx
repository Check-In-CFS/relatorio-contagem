import Link from 'next/link';
import { formatarDataHora, formatarDuracao, percentual } from '@/lib/formato';
import { ROTULO_STATUS_AUDITORIA, type StatusAuditoria } from '@/lib/tipos';
import { BarraProgresso, cx } from './ui';

export type ResumoAuditoria = {
  id: string;
  numero: number;
  status: StatusAuditoria;
  iniciada_em: string;
  finalizada_em: string | null;
  empresa_nome: string;
  loja_nome: string;
  auditor_nome: string;
  total_marcas: number;
  marcas_concluidas: number;
  marcas_parciais: number;
  marcas_pendentes: number;
  marcas_em_contagem: number;
};

export const COLUNAS_RESUMO =
  'id, numero, status, iniciada_em, finalizada_em, empresa_nome, loja_nome, auditor_nome, total_marcas, marcas_concluidas, marcas_parciais, marcas_pendentes, marcas_em_contagem';

const ESTILO_STATUS_AUDITORIA: Record<StatusAuditoria, string> = {
  em_andamento: 'bg-primary/10 text-primary',
  concluida: 'bg-accent/15 texto-sucesso',
  cancelada: 'bg-line/60 text-muted',
};

export function CartaoAuditoria({ a, mostrarAuditor }: { a: ResumoAuditoria; mostrarAuditor?: boolean }) {
  const pct = percentual(a.marcas_concluidas, a.total_marcas);
  return (
    <Link
      href={`/auditorias/${a.id}`}
      className="block rounded-xl border border-line bg-card p-4 shadow-sm transition-colors duration-150 hover:border-primary/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display font-semibold">
            {a.loja_nome} <span className="font-mono text-sm font-normal text-muted">#{a.numero}</span>
          </p>
          <p className="text-xs text-muted">
            {a.empresa_nome}
            {mostrarAuditor && <> · {a.auditor_nome}</>} · início {formatarDataHora(a.iniciada_em)} ·{' '}
            {formatarDuracao(a.iniciada_em, a.finalizada_em)}
          </p>
        </div>
        <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', ESTILO_STATUS_AUDITORIA[a.status])}>
          {ROTULO_STATUS_AUDITORIA[a.status]}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <BarraProgresso concluidas={a.marcas_concluidas} parciais={a.marcas_parciais} total={a.total_marcas} />
        <span className="w-12 text-right font-mono text-sm font-semibold">{pct}%</span>
      </div>
      <p className="mt-2 font-mono text-xs text-muted">
        {a.marcas_concluidas} concluídas · {a.marcas_parciais} parciais · {a.marcas_em_contagem} em contagem ·{' '}
        {a.marcas_pendentes} pendentes
      </p>
    </Link>
  );
}
