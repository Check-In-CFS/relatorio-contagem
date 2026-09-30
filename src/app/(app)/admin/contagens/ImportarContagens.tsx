'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lerLinhasDoArquivo, SeletorArquivo } from '@/components/SeletorArquivo';
import { Alerta, Botao, Cartao, Rotulo, Selecao, SeloStatus } from '@/components/ui';
import { buscarTodas } from '@/lib/paginacao';
import { parseContagensAcompanhadas, type ResultadoContagens, type StatusContagem } from '@/lib/parsers/contagens';
import { calcularSugestoes, planejarAplicacao, type MarcaDaAuditoria, type MudancaPlanejada } from '@/lib/sugestao';
import { createClient } from '@/lib/supabase/client';
import { importarContagens, type ResultadoImportacaoContagens } from '../actions';

export type LojaComEmpresa = { id: string; nome: string; empresa: { nome: string } | null };

const ROTULO_CONTAGEM: Record<StatusContagem, string> = {
  baixada: 'Baixadas',
  cancelada: 'Canceladas',
  contada: 'Contadas',
  recontada: 'Recontadas',
  em_contagem: 'Em contagem',
  aberta: 'Abertas',
};

type Previa = {
  arquivoNome: string;
  leitura: ResultadoContagens;
  totalItens: number;
  porStatus: Partial<Record<StatusContagem, number>>;
  marcasTocadas: number;
  auditoria: { id: string; numero: number } | null;
  mudancas: MudancaPlanejada[];
  semCorrespondencia: string[];
};

export function ImportarContagens({ lojas }: { lojas: LojaComEmpresa[] }) {
  const router = useRouter();
  const [lojaId, setLojaId] = useState(lojas.length === 1 ? lojas[0].id : '');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacaoContagens | null>(null);

  async function aoEscolherArquivo(arquivo: File) {
    setErro(null);
    setResultado(null);
    setPrevia(null);
    setLendo(true);
    try {
      const leitura = parseContagensAcompanhadas(await lerLinhasDoArquivo(arquivo));
      const sugestoes = calcularSugestoes(leitura.contagens);

      const supabase = createClient();
      const { data: auditoria, error } = await supabase
        .from('auditorias')
        .select('id, numero')
        .eq('loja_id', lojaId)
        .eq('status', 'em_andamento')
        .maybeSingle<{ id: string; numero: number }>();
      if (error) throw new Error(error.message);

      const marcas = auditoria
        ? await buscarTodas<MarcaDaAuditoria>((de, ate) =>
            supabase
              .from('auditoria_marcas')
              .select('id, marca_nome, status')
              .eq('auditoria_id', auditoria.id)
              .order('id')
              .range(de, ate),
          )
        : [];
      const plano = planejarAplicacao(marcas, sugestoes);

      const porStatus: Previa['porStatus'] = {};
      for (const c of leitura.contagens) porStatus[c.status] = (porStatus[c.status] ?? 0) + 1;

      setPrevia({
        arquivoNome: arquivo.name,
        leitura,
        totalItens: leitura.contagens.reduce((t, c) => t + c.itens.length, 0),
        porStatus,
        marcasTocadas: sugestoes.size,
        auditoria,
        mudancas: plano.mudancas,
        semCorrespondencia: auditoria ? plano.semCorrespondencia : [],
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
    const r = await importarContagens({
      lojaId,
      arquivoNome: previa.arquivoNome,
      periodoInicio: previa.leitura.periodoInicio,
      periodoFim: previa.leitura.periodoFim,
      contagens: previa.leitura.contagens,
    });
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setResultado(r.dados);
    setPrevia(null);
    router.refresh();
  }

  const loja = lojas.find((l) => l.id === lojaId);
  const paraConcluida = previa?.mudancas.filter((m) => m.para === 'concluida').length ?? 0;
  const paraParcial = (previa?.mudancas.length ?? 0) - paraConcluida;

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

      {lendo && <p className="text-sm text-muted">Lendo o arquivo… relatórios de um mês inteiro podem levar alguns segundos.</p>}
      {erro && <Alerta>{erro}</Alerta>}
      {resultado && (
        <Alerta tipo="sucesso">
          Contagens importadas.{' '}
          {resultado.auditoria_id ? (
            <>
              {resultado.sugestoes_aplicadas} marcas atualizadas na auditoria.{' '}
              <Link href={`/auditorias/${resultado.auditoria_id}`} className="underline">
                Abrir auditoria
              </Link>
            </>
          ) : (
            'A loja não tinha auditoria em andamento; o histórico foi guardado.'
          )}
        </Alerta>
      )}

      {previa && (
        <Cartao>
          <h2 className="text-lg font-semibold">Pré-visualização</h2>
          <p className="text-sm text-muted">
            {previa.arquivoNome}
            {previa.leitura.empresa && <> · empresa no relatório: {previa.leitura.empresa}</>}
            {previa.leitura.periodoInicio && (
              <>
                {' '}
                · período {previa.leitura.periodoInicio.split('-').reverse().join('/')} a{' '}
                {previa.leitura.periodoFim?.split('-').reverse().join('/')}
              </>
            )}
          </p>
          {previa.leitura.empresa && loja?.empresa && (
            <p className="mt-1 text-xs text-muted">
              Confira se o relatório é mesmo de <strong className="text-fg">{loja.empresa.nome}</strong>.
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Numero rotulo="Contagens" valor={previa.leitura.contagens.length} />
            <Numero rotulo="Itens" valor={previa.totalItens} />
            <Numero rotulo="Marcas contadas" valor={previa.marcasTocadas} />
          </div>
          <p className="mt-3 text-xs text-muted">
            {(Object.keys(ROTULO_CONTAGEM) as StatusContagem[])
              .filter((s) => previa.porStatus[s])
              .map((s) => `${previa.porStatus[s]} ${ROTULO_CONTAGEM[s].toLowerCase()}`)
              .join(' · ')}
          </p>

          <div className="mt-5">
            {previa.auditoria ? (
              <Alerta tipo={previa.mudancas.length ? 'sucesso' : 'aviso'}>
                Auditoria #{previa.auditoria.numero} em andamento: {paraConcluida} marcas passam para Concluída e{' '}
                {paraParcial} para Parcial. Nenhum status será rebaixado.
              </Alerta>
            ) : (
              <Alerta tipo="aviso">
                Esta loja não tem auditoria em andamento. O histórico será guardado, mas nenhuma sugestão será aplicada.
              </Alerta>
            )}
          </div>

          {previa.leitura.avisos.length > 0 && (
            <details className="mt-4">
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

          {previa.mudancas.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold">Mudanças sugeridas ({previa.mudancas.length})</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {previa.mudancas.slice(0, 300).map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{m.marca}</span>
                    <SeloStatus status={m.de} /> → <SeloStatus status={m.para} />
                  </li>
                ))}
              </ul>
            </details>
          )}

          {previa.semCorrespondencia.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold texto-aviso">
                {previa.semCorrespondencia.length} marcas do relatório não estão na auditoria
              </summary>
              <p className="mt-2 text-xs text-muted">
                O relatório de contagens só traz o nome da marca. Se o nome estiver diferente do cadastro, ela não é casada.
              </p>
              <p className="mt-1 text-sm">{previa.semCorrespondencia.join(', ')}</p>
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
