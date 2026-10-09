'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lerLinhasDoArquivo, SeletorArquivo } from '@/components/SeletorArquivo';
import { Alerta, Botao, Cartao, Rotulo, Selecao } from '@/components/ui';
import { parseValorEstoque, type ResultadoEstoque } from '@/lib/parsers/estoque';
import { normalizarNomeMarca } from '@/lib/sugestao';
import { importarEstoque, type ResultadoImportacaoEstoque } from '../actions';
import type { LojaComEmpresa } from '../contagens/ImportarContagens';

type Previa = {
  arquivoNome: string;
  leitura: ResultadoEstoque;
  comSaldo: number;
  marcas: number;
  porDepartamento: { nome: string; itens: number }[];
};

export function ImportarEstoque({ lojas }: { lojas: LojaComEmpresa[] }) {
  const router = useRouter();
  const [lojaId, setLojaId] = useState(lojas.length === 1 ? lojas[0].id : '');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoEstoque | null>(null);

  async function aoEscolherArquivo(arquivo: File) {
    setErro(null);
    setResultado(null);
    setPrevia(null);
    setLendo(true);
    try {
      const leitura = parseValorEstoque(await lerLinhasDoArquivo(arquivo));
      const contagem = new Map<string, number>();
      for (const i of leitura.itens) contagem.set(i.departamento ?? 'Sem departamento', (contagem.get(i.departamento ?? 'Sem departamento') ?? 0) + 1);
      setPrevia({
        arquivoNome: arquivo.name,
        leitura,
        comSaldo: leitura.itens.filter((i) => i.disponivel > 0).length,
        marcas: new Set(leitura.itens.map((i) => normalizarNomeMarca(i.marca))).size,
        porDepartamento: [...contagem].map(([nome, itens]) => ({ nome, itens })),
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
    const r = await importarEstoque({ lojaId, arquivoNome: previa.arquivoNome, itens: previa.leitura.itens });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setResultado(r.dados);
    setPrevia(null);
    router.refresh();
  }

  const loja = lojas.find((l) => l.id === lojaId);

  return (
    <div className="space-y-4">
      <Cartao className="grid gap-4 sm:grid-cols-2">
        <div>
          <Rotulo htmlFor="loja">Loja</Rotulo>
          <Selecao
            id="loja"
            value={lojaId}
            onChange={(e) => {
              setLojaId(e.target.value);
              setPrevia(null);
            }}
          >
            <option value="">Selecione…</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
                {l.empresa ? ` — ${l.empresa.nome}` : ''}
              </option>
            ))}
          </Selecao>
        </div>
        <SeletorArquivo rotulo="Arquivo .ods" desabilitado={!lojaId || lendo || enviando} onArquivo={aoEscolherArquivo} />
      </Cartao>

      {lendo && <p className="text-sm text-muted">Lendo o arquivo… o relatório completo leva alguns segundos.</p>}
      {erro && <Alerta>{erro}</Alerta>}
      {resultado && (
        <Alerta tipo="sucesso">
          Estoque importado.{' '}
          {resultado.auditoria_id ? (
            <>
              {resultado.marcas_atualizadas} marcas recalculadas na auditoria em andamento.{' '}
              <Link href={`/auditorias/${resultado.auditoria_id}`} className="underline">
                Abrir auditoria
              </Link>
            </>
          ) : (
            'Ele será a base de SKUs da próxima auditoria desta loja.'
          )}
        </Alerta>
      )}

      {previa && (
        <Cartao>
          <h2 className="text-lg font-semibold">Pré-visualização</h2>
          <p className="text-sm text-muted">{previa.arquivoNome}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Numero rotulo="Itens ativos" valor={previa.leitura.itens.length} />
            <Numero rotulo="Com saldo" valor={previa.comSaldo} />
            <Numero rotulo="Marcas" valor={previa.marcas} />
            <Numero rotulo="Departamentos" valor={previa.porDepartamento.length} />
          </div>

          {previa.leitura.empresas.length > 1 && (
            <div className="mt-4">
              <Alerta tipo="aviso">
                O relatório foi gerado com {previa.leitura.empresas.length} empresas no filtro — o estoque está somado.
                Para {loja?.nome ?? 'esta loja'}, gere o relatório filtrando só a empresa dela. Os SKUs ativos de cada
                marca não mudam, mas a coluna &quot;com saldo&quot; fica errada.
              </Alerta>
            </div>
          )}

          <div className="mt-4">
            <Alerta tipo="aviso">
              Substitui o estoque atual de {loja?.nome ?? 'esta loja'}. Se houver auditoria em andamento, o status das marcas
              importadas é recalculado pela cobertura de SKUs.
            </Alerta>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">Itens por departamento</summary>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {previa.porDepartamento.map((d) => (
                <li key={d.nome} className="flex justify-between gap-3">
                  <span className="truncate">{d.nome}</span>
                  <span className="font-mono text-muted">{d.itens.toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          </details>

          {previa.leitura.avisos.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold texto-aviso">
                {previa.leitura.avisos.length} avisos de leitura
              </summary>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted">
                {previa.leitura.avisos.slice(0, 50).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          )}

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

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="font-mono text-2xl font-semibold">{valor.toLocaleString('pt-BR')}</p>
      <p className="text-xs text-muted">{rotulo}</p>
    </div>
  );
}
