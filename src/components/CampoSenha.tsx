'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Campo, Rotulo } from './ui';

// Sem caracteres ambíguos (0/O, 1/l/I) — a senha costuma ser ditada ou anotada.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

function gerarSenha(tamanho = 12) {
  const bytes = crypto.getRandomValues(new Uint32Array(tamanho));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

export function CampoSenha({ rotulo, name = 'senha' }: { rotulo?: string; name?: string }) {
  const id = useId();
  const [valor, setValor] = useState('');
  const [visivel, setVisivel] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Limpa junto com o formulário (FormServidor reseta após salvar).
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const limpar = () => {
      setValor('');
      setVisivel(false);
    };
    form.addEventListener('reset', limpar);
    return () => form.removeEventListener('reset', limpar);
  }, []);

  return (
    <div>
      {rotulo && <Rotulo htmlFor={id}>{rotulo}</Rotulo>}
      <div className="flex gap-1">
        <Campo
          ref={input}
          id={id}
          name={name}
          type={visivel ? 'text' : 'password'}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          minLength={8}
          maxLength={72}
          required
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          className="min-w-0 font-mono"
          aria-label={rotulo ? undefined : 'Nova senha'}
        />
        <button
          type="button"
          onClick={() => {
            setValor(gerarSenha());
            setVisivel(true);
          }}
          className="shrink-0 rounded-xl border border-line px-3 text-sm font-semibold text-primary hover:bg-bg"
        >
          Gerar
        </button>
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          className="shrink-0 rounded-xl px-2.5 text-sm text-muted hover:bg-bg hover:text-fg"
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          title={visivel ? 'Ocultar' : 'Mostrar'}
        >
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </div>
  );
}
