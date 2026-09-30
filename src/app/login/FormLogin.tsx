'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Alerta, Botao, Campo, Cartao, Rotulo } from '@/components/ui';
import { entrar } from './actions';

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" className="w-full" disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar'}
    </Botao>
  );
}

export function FormLogin() {
  const [erro, acao] = useFormState(entrar, null);
  return (
    <Cartao>
      <form action={acao} className="space-y-4">
        {erro && <Alerta>{erro}</Alerta>}
        <div>
          <Rotulo htmlFor="email">E-mail</Rotulo>
          <Campo id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        <div>
          <Rotulo htmlFor="senha">Senha</Rotulo>
          <Campo id="senha" name="senha" type="password" autoComplete="current-password" required />
        </div>
        <BotaoEntrar />
      </form>
    </Cartao>
  );
}
