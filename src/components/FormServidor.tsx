'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { EstadoForm } from '@/app/(app)/admin/actions';
import { Alerta, Botao } from './ui';

export function BotaoEnviar({ children, variante }: { children: ReactNode; variante?: 'primario' | 'secundario' }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" variante={variante} disabled={pending}>
      {pending ? 'Salvando…' : children}
    </Botao>
  );
}

/** Formulário ligado a uma server action que devolve Resultado<string>. */
export function FormServidor({
  acao,
  children,
  className,
  limparAoSalvar,
}: {
  acao: (anterior: EstadoForm, form: FormData) => Promise<EstadoForm>;
  children: ReactNode;
  className?: string;
  limparAoSalvar?: boolean;
}) {
  const [estado, despachar] = useFormState(acao, null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (limparAoSalvar && estado?.ok) form.current?.reset();
  }, [estado, limparAoSalvar]);

  return (
    <form ref={form} action={despachar} className={className}>
      {children}
      {estado && (
        <div className="w-full basis-full">
          <Alerta tipo={estado.ok ? 'sucesso' : 'erro'}>{estado.ok ? estado.dados : estado.erro}</Alerta>
        </div>
      )}
    </form>
  );
}
