'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Alerta, Botao, Cartao, Rotulo, Selecao } from '@/components/ui';
import type { Empresa, Loja } from '@/lib/tipos';
import { criarAuditoria } from '../actions';

function BotaoIniciar({ desabilitado }: { desabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={desabilitado || pending}>
      {pending ? 'Iniciando…' : 'Iniciar auditoria'}
    </Botao>
  );
}

export function FormNovaAuditoria({
  empresas,
  lojas,
  marcasPorEmpresa,
}: {
  empresas: Empresa[];
  lojas: Loja[];
  marcasPorEmpresa: Record<string, number>;
}) {
  const [erro, acao] = useFormState(criarAuditoria, null);
  const [empresaId, setEmpresaId] = useState(empresas.length === 1 ? empresas[0].id : '');
  const [lojaId, setLojaId] = useState('');

  const lojasDaEmpresa = lojas.filter((l) => l.empresa_id === empresaId);
  const totalMarcas = empresaId ? (marcasPorEmpresa[empresaId] ?? 0) : 0;

  return (
    <Cartao className="max-w-lg">
      <form action={acao} className="space-y-4">
        {erro && <Alerta>{erro}</Alerta>}
        <div>
          <Rotulo htmlFor="empresa">Empresa</Rotulo>
          <Selecao
            id="empresa"
            value={empresaId}
            onChange={(e) => {
              setEmpresaId(e.target.value);
              setLojaId('');
            }}
            required
          >
            <option value="">Selecione…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Selecao>
        </div>
        <div>
          <Rotulo htmlFor="loja">Loja</Rotulo>
          <Selecao
            id="loja"
            name="loja_id"
            value={lojaId}
            onChange={(e) => setLojaId(e.target.value)}
            disabled={!empresaId}
            required
          >
            <option value="">{empresaId ? 'Selecione…' : 'Escolha a empresa primeiro'}</option>
            {lojasDaEmpresa.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
                {l.codigo_interno ? ` (${l.codigo_interno})` : ''}
              </option>
            ))}
          </Selecao>
        </div>
        {empresaId && (
          totalMarcas > 0 ? (
            <p className="text-sm text-muted">
              <span className="font-mono font-semibold text-fg">{totalMarcas}</span> marcas ativas entrarão na auditoria.
            </p>
          ) : (
            <Alerta tipo="aviso">Esta empresa ainda não tem marcas. Importe o relatório de marcas antes.</Alerta>
          )
        )}
        <BotaoIniciar desabilitado={!lojaId || totalMarcas === 0} />
      </form>
    </Cartao>
  );
}
