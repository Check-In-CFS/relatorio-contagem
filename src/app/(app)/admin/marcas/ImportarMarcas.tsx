'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lerLinhasDoArquivo, SeletorArquivo } from '@/components/SeletorArquivo';
import { Alerta, Botao, Cartao, Rotulo, Selecao } from '@/components/ui';
import { buscarTodas } from '@/lib/paginacao';
import { parseRelacaoMarcas, type MarcaImportada } from '@/lib/parsers/marcas';
import { createClient } from '@/lib/supabase/client';
import type { Empresa } from '@/lib/tipos';
import { importarMarcas, type TotaisImportacaoMarcas } from '../actions';

type Previa = {
  arquivoNome: string;
  marcas: MarcaImportada[];
  avisos: string[];
  novas: MarcaImportada[];
  reativadas: MarcaImportada[];
  desativadas: { codigo: number; nome: string }[];
};

export function ImportarMarcas({ empresas }: { empresas: Empresa[] }) {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState(empresas.length === 1 ? empresas[0].id : '');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<TotaisImportacaoMarcas | null>(null);

  async function aoEscolherArquivo(arquivo: File) {
    setErro(null);
    setResultado(null);
    setPrevia(null);
    setLendo(true);
    try {
      const { marcas, avisos } = parseRelacaoMarcas(await lerLinhasDoArquivo(arquivo));
      if (!marcas.length) throw new Error('Nenhuma marca encontrada no arquivo.');

      const supabase = createClient();
      const existentes = await buscarTodas<{ codigo_santri: number; nome: string; ativo: boolean }>((de, ate) =>
        supabase
          .from('marcas')
          .select('codigo_santri, nome, ativo')
          .eq('empresa_id', empresaId)
          .order('codigo_santri')
          .range(de, ate),
      );
      const porCodigo = new Map(existentes.map((m) => [m.codigo_santri, m]));
      const noArquivo = new Set(marcas.map((m) => m.codigo));

      setPrevia({
        arquivoNome: arquivo.name,
        marcas,
        avisos,
        novas: marcas.filter((m) => !porCodigo.has(m.codigo)),
        reativadas: marcas.filter((m) => porCodigo.get(m.codigo)?.ativo === false),
        desativadas: existentes
          .filter((m) => m.ativo && !noArquivo.has(m.codigo_santri))
          .map((m) => ({ codigo: m.codigo_santri, nome: m.nome })),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  }

  async function confirmar() {
    if (!previa) return;
    setEnviando(true);
    setErro(null);
    const r = await importarMarcas({ empresaId, arquivoNome: previa.arquivoNome, marcas: previa.marcas });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setResultado(r.dados);
    setPrevia(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Cartao className="grid gap-4 sm:grid-cols-2">
        <div>
          <Rotulo htmlFor="empresa">Empresa</Rotulo>
          <Selecao
            id="empresa"
            value={empresaId}
            onChange={(e) => {
              setEmpresaId(e.target.value);
              setPrevia(null);
            }}
          >
            <option value="">Selecione…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Selecao>
        </div>
        <SeletorArquivo rotulo="Arquivo .ods" desabilitado={!empresaId || lendo || enviando} onArquivo={aoEscolherArquivo} />
      </Cartao>

      {lendo && <p className="text-sm text-muted">Lendo o arquivo…</p>}
      {erro && <Alerta>{erro}</Alerta>}
      {resultado && (
        <Alerta tipo="sucesso">
          Importação concluída: {resultado.lidas} marcas lidas, {resultado.novas} novas, {resultado.reativadas} reativadas e{' '}
          {resultado.desativadas} desativadas.
        </Alerta>
      )}

      {previa && (
        <Cartao>
          <h2 className="text-lg font-semibold">Pré-visualização</h2>
          <p className="text-sm text-muted">{previa.arquivoNome}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero rotulo="Marcas no arquivo" valor={previa.marcas.length} />
            <Numero rotulo="Novas" valor={previa.novas.length} />
            <Numero rotulo="Reativadas" valor={previa.reativadas.length} />
            <Numero rotulo="Serão desativadas" valor={previa.desativadas.length} alerta={previa.desativadas.length > 0} />
          </div>

          {previa.avisos.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold texto-aviso">
                {previa.avisos.length} linhas com aviso
              </summary>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                {previa.avisos.slice(0, 50).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          )}
          <ListaAmostra titulo="Novas" itens={previa.novas} />
          <ListaAmostra titulo="Serão desativadas" itens={previa.desativadas} />

          <div className="mt-6 flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => setPrevia(null)} disabled={enviando}>
              Cancelar
            </Botao>
            <Botao onClick={confirmar} disabled={enviando}>
              {enviando ? 'Importando…' : 'Confirmar importação'}
            </Botao>
          </div>
        </Cartao>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className={`font-mono text-2xl font-semibold ${alerta ? 'texto-aviso' : ''}`}>{valor}</p>
      <p className="text-xs text-muted">{rotulo}</p>
    </div>
  );
}

function ListaAmostra({ titulo, itens }: { titulo: string; itens: { codigo: number; nome: string }[] }) {
  if (!itens.length) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {titulo} ({itens.length})
      </summary>
      <ul className="mt-2 columns-1 text-sm sm:columns-2">
        {itens.slice(0, 200).map((m) => (
          <li key={m.codigo}>
            <span className="font-mono text-xs text-muted">{m.codigo}</span> {m.nome}
          </li>
        ))}
      </ul>
      {itens.length > 200 && <p className="mt-1 text-xs text-muted">…e mais {itens.length - 200}.</p>}
    </details>
  );
}
