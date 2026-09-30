import Link from 'next/link';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import type { StatusMarca } from '@/lib/tipos';
import { ROTULO_STATUS_MARCA } from '@/lib/tipos';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');
export { cx };

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-primary text-white hover:bg-primary/90',
  secundario: 'border border-line bg-card text-fg hover:bg-bg',
  fantasma: 'text-muted hover:bg-bg hover:text-fg',
  perigo: 'bg-danger text-white hover:bg-danger/90',
};

const BASE_BOTAO =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50';

export function Botao({
  variante = 'primario',
  className,
  ...props
}: ComponentProps<'button'> & { variante?: Variante }) {
  return <button className={cx(BASE_BOTAO, VARIANTES[variante], className)} {...props} />;
}

export function BotaoLink({
  variante = 'primario',
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={cx(BASE_BOTAO, VARIANTES[variante], className)} {...props} />;
}

export function Cartao({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('rounded-xl border border-line bg-card p-5 shadow-sm', className)} {...props} />;
}

const BASE_CAMPO =
  'w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60';

export const Campo = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Campo({ className, ...props }, ref) {
  return <input ref={ref} className={cx(BASE_CAMPO, className)} {...props} />;
});

export function Selecao({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cx(BASE_CAMPO, className)} {...props} />;
}

export function AreaTexto({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx(BASE_CAMPO, 'min-h-20', className)} {...props} />;
}

export function Rotulo({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-fg">
      {children}
    </label>
  );
}

export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Vazio({ titulo, descricao, acao }: { titulo: string; descricao?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold">{titulo}</p>
      {descricao && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{descricao}</p>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

export function Alerta({ tipo = 'erro', children }: { tipo?: 'erro' | 'aviso' | 'sucesso'; children: ReactNode }) {
  const estilos = {
    erro: 'border-danger/40 bg-danger/10 texto-perigo',
    aviso: 'border-warn/40 bg-warn/10 texto-aviso',
    sucesso: 'border-accent/40 bg-accent/10 texto-sucesso',
  };
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={cx('rounded-xl border px-4 py-3 text-sm font-medium', estilos[tipo])}>
      {children}
    </div>
  );
}

export const ESTILO_STATUS: Record<StatusMarca, string> = {
  pendente: 'bg-line/60 text-muted',
  em_contagem: 'bg-primary/10 text-primary',
  parcial: 'bg-warn/15 texto-aviso',
  concluida: 'bg-accent/15 texto-sucesso',
};

export function SeloStatus({ status }: { status: StatusMarca }) {
  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', ESTILO_STATUS[status])}>
      {ROTULO_STATUS_MARCA[status]}
    </span>
  );
}

export function Selo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex rounded-full bg-line/60 px-2.5 py-0.5 text-xs font-semibold text-muted', className)}>
      {children}
    </span>
  );
}

/** Barra empilhada concluídas (menta) + parciais (laranja) sobre o total. */
export function BarraProgresso({ concluidas, parciais, total }: { concluidas: number; parciais: number; total: number }) {
  const pc = total ? (concluidas / total) * 100 : 0;
  const pp = total ? (parciais / total) * 100 : 0;
  return (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-line/70"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={concluidas}
      aria-label={`${concluidas} de ${total} marcas concluídas`}
    >
      <div className="bg-accent transition-all duration-200" style={{ width: `${pc}%` }} />
      <div className="bg-warn transition-all duration-200" style={{ width: `${pp}%` }} />
    </div>
  );
}
