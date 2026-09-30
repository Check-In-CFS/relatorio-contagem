'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ResumoAuditoria } from '@/components/CartaoAuditoria';
import { Alerta, AreaTexto, BarraProgresso, Botao, Campo, Cartao, cx, Selecao, SeloStatus } from '@/components/ui';
import { formatarDataHora, formatarDuracao, percentual } from '@/lib/formato';
import { ROTULO_STATUS_AUDITORIA, ROTULO_STATUS_MARCA_PLURAL, type AuditoriaMarca, type StatusMarca } from '@/lib/tipos';
import { atualizarStatusMarca, finalizarAuditoria } from '../actions';
import { GerarPdf } from './GerarPdf';

type Filtro = 'todas' | StatusMarca;
type Ordem = 'az' | 'za' | 'codigo' | 'abertas' | 'recentes';

const STATUS: StatusMarca[] = ['pendente', 'em_contagem', 'parcial', 'concluida'];
const PLURAL = ROTULO_STATUS_MARCA_PLURAL;
// "Não concluídas primeiro": as que estão sendo contadas agora vêm no topo.
const PESO_ABERTAS: Record<StatusMarca, number> = { em_contagem: 0, pendente: 1, parcial: 2, concluida: 3 };

export function TelaAuditoria({
  auditoria,
  marcasIniciais,
  podeEditar,
}: {
  auditoria: ResumoAuditoria;
  marcasIniciais: AuditoriaMarca[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [marcas, setMarcas] = useState(marcasIniciais);
  const [salvando, setSalvando] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ordem, setOrdem] = useState<Ordem>('az');
  const [agora, setAgora] = useState(() => Date.now());
  const buscaAdiada = useDeferredValue(busca);

  // Dados novos do servidor (ex.: importação aplicada) substituem o estado local.
  useEffect(() => setMarcas(marcasIniciais), [marcasIniciais]);

  useEffect(() => {
    if (auditoria.finalizada_em) return;
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [auditoria.finalizada_em]);

  const totais = useMemo(() => {
    const t: Record<StatusMarca, number> = { pendente: 0, em_contagem: 0, parcial: 0, concluida: 0 };
    for (const m of marcas) t[m.status]++;
    return t;
  }, [marcas]);

  const visiveis = useMemo(() => {
    const termo = buscaAdiada.trim().toLocaleUpperCase('pt-BR');
    const lista = marcas.filter(
      (m) =>
        (filtro === 'todas' || m.status === filtro) &&
        (!termo ||
          m.marca_nome.toLocaleUpperCase('pt-BR').includes(termo) ||
          String(m.marca_codigo ?? '').startsWith(termo.replace(/\./g, ''))),
    );
    const porNome = (a: AuditoriaMarca, b: AuditoriaMarca) =>
      a.marca_nome.localeCompare(b.marca_nome, 'pt-BR', { numeric: true });
    const comparadores: Record<Ordem, (a: AuditoriaMarca, b: AuditoriaMarca) => number> = {
      az: porNome,
      za: (a, b) => -porNome(a, b),
      codigo: (a, b) => (a.marca_codigo ?? Infinity) - (b.marca_codigo ?? Infinity) || porNome(a, b),
      abertas: (a, b) => PESO_ABERTAS[a.status] - PESO_ABERTAS[b.status] || porNome(a, b),
      recentes: (a, b) => b.atualizado_em.localeCompare(a.atualizado_em) || porNome(a, b),
    };
    return lista.sort(comparadores[ordem]);
  }, [marcas, filtro, buscaAdiada, ordem]);

  async function salvar(marca: AuditoriaMarca, status: StatusMarca, observacao: string | null) {
    const anterior = marca;
    const agoraIso = new Date().toISOString();
    setErro(null);
    setSalvando((s) => new Set(s).add(marca.id));
    setMarcas((lista) =>
      lista.map((m) =>
        m.id === marca.id
          ? {
              ...m,
              status,
              observacao,
              status_origem: 'manual',
              atualizado_em: agoraIso,
              // Espelha a regra do banco: iniciar grava o horário, desfazer limpa.
              iniciada_em: status === 'pendente' ? null : status === 'em_contagem' ? (m.iniciada_em ?? agoraIso) : m.iniciada_em,
            }
          : m,
      ),
    );
    const resultado = await atualizarStatusMarca({ id: marca.id, status, observacao });
    setSalvando((s) => {
      const novo = new Set(s);
      novo.delete(marca.id);
      return novo;
    });
    if (!resultado.ok) {
      setMarcas((lista) => lista.map((m) => (m.id === marca.id ? anterior : m)));
      setErro(`${marca.marca_nome}: ${resultado.erro}`);
    }
  }

  const pct = percentual(totais.concluida, marcas.length);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {auditoria.empresa_nome} · <span className="font-mono">#{auditoria.numero}</span> · {auditoria.auditor_nome}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{auditoria.loja_nome}</h1>
          <p className="mt-1 text-sm text-muted">
            {ROTULO_STATUS_AUDITORIA[auditoria.status]} · início {formatarDataHora(auditoria.iniciada_em)} · duração{' '}
            <span className="font-mono">{formatarDuracao(auditoria.iniciada_em, auditoria.finalizada_em, agora)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" onClick={() => router.refresh()}>
            Atualizar
          </Botao>
          <GerarPdf auditoria={auditoria} marcas={marcas} filtroAtual={filtro} />
          {podeEditar && <Finalizar auditoriaId={auditoria.id} totais={totais} />}
        </div>
      </div>

      <Cartao className="mb-4">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-4xl font-bold">{pct}%</p>
          <p className="text-sm text-muted">
            <span className="font-mono">{totais.concluida}</span> de <span className="font-mono">{marcas.length}</span>{' '}
            marcas concluídas
          </p>
        </div>
        <div className="mt-3">
          <BarraProgresso concluidas={totais.concluida} parciais={totais.parcial} total={marcas.length} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filtrar por status">
          {STATUS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFiltro(filtro === s ? 'todas' : s)}
              aria-pressed={filtro === s}
              className={cx(
                'rounded-xl border px-3 py-2 text-left transition-colors duration-150',
                filtro === s ? 'border-primary ring-2 ring-primary/30' : 'border-line hover:bg-bg',
              )}
            >
              <span className="block font-mono text-xl font-semibold">{totais[s]}</span>
              <span className="text-xs text-muted">{PLURAL[s]}</span>
            </button>
          ))}
        </div>
      </Cartao>

      {!podeEditar && auditoria.status === 'em_andamento' && (
        <div className="mb-4">
          <Alerta tipo="aviso">Você está vendo a auditoria de outro auditor. Só o responsável pode alterá-la.</Alerta>
        </div>
      )}
      {erro && (
        <div className="mb-4">
          <Alerta>{erro}</Alerta>
        </div>
      )}

      <div className="sticky top-[57px] z-10 -mx-4 mb-3 flex flex-wrap gap-2 bg-bg/95 px-4 py-2 backdrop-blur">
        <Campo
          type="search"
          placeholder="Buscar por nome ou código…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="min-w-0 flex-1 basis-48"
          aria-label="Buscar marca por nome ou código"
        />
        <Selecao value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="w-auto" aria-label="Filtro">
          <option value="todas">Todas</option>
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {PLURAL[s]}
            </option>
          ))}
        </Selecao>
        <Selecao value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="w-auto" aria-label="Ordenação">
          <option value="az">Nome A–Z</option>
          <option value="za">Nome Z–A</option>
          <option value="codigo">Código</option>
          <option value="abertas">Não concluídas primeiro</option>
          <option value="recentes">Alteradas recentemente</option>
        </Selecao>
      </div>

      <p className="mb-2 text-xs text-muted">
        {visiveis.length} de {marcas.length} marcas
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {visiveis.map((m) => (
          <LinhaMarca
            key={m.id}
            marca={m}
            podeEditar={podeEditar}
            salvando={salvando.has(m.id)}
            onSalvar={(status, obs) => salvar(m, status, obs)}
          />
        ))}
        {visiveis.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">Nenhuma marca encontrada.</li>}
      </ul>
    </>
  );
}

const BOTAO_ACAO =
  'min-h-10 rounded-xl px-4 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

function LinhaMarca({
  marca,
  podeEditar,
  salvando,
  onSalvar,
}: {
  marca: AuditoriaMarca;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (status: StatusMarca, observacao: string | null) => void;
}) {
  const [editandoObs, setEditandoObs] = useState(false);
  const [obs, setObs] = useState(marca.observacao ?? '');
  const mudar = (status: StatusMarca) => onSalvar(status, marca.observacao);

  return (
    <li className={cx('px-4 py-3', marca.status === 'em_contagem' && 'bg-primary/5')}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex items-baseline gap-2">
            {marca.marca_codigo !== null && (
              <span className="shrink-0 font-mono text-xs text-muted" title="Código da marca no Santri">
                {marca.marca_codigo}
              </span>
            )}
            <span className="truncate font-semibold">{marca.marca_nome}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <SeloStatus status={marca.status} />
            {marca.iniciada_em && marca.status !== 'pendente' && (
              <span>iniciada {formatarDataHora(marca.iniciada_em)}</span>
            )}
            {marca.status_origem === 'sugerido_importacao' && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">sugerido pela importação</span>
            )}
            {marca.observacao && !editandoObs && <span className="italic">“{marca.observacao}”</span>}
          </div>
        </div>

        {podeEditar && (
          <div className="flex items-center gap-1.5">
            {marca.status === 'pendente' && (
              <button type="button" disabled={salvando} onClick={() => mudar('em_contagem')} className={cx(BOTAO_ACAO, 'bg-primary text-white hover:bg-primary/90')}>
                Iniciar
              </button>
            )}
            {marca.status === 'em_contagem' && (
              <>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => mudar('parcial')}
                  className={cx(BOTAO_ACAO, 'border border-warn/60 bg-warn/10 texto-aviso hover:bg-warn/20')}
                >
                  Parcial
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => mudar('concluida')}
                  className={cx(BOTAO_ACAO, 'border border-accent/60 bg-accent/15 texto-sucesso hover:bg-accent/25')}
                >
                  Concluída
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => mudar('pendente')}
                  className={cx(BOTAO_ACAO, 'px-2.5 text-muted hover:bg-bg hover:text-fg')}
                  aria-label="Desfazer início (voltar para pendente)"
                  title="Desfazer início"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M3 7v6h6" />
                    <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                  </svg>
                </button>
              </>
            )}
            {marca.status === 'parcial' && (
              <button type="button" disabled={salvando} onClick={() => mudar('em_contagem')} className={cx(BOTAO_ACAO, 'border border-line hover:bg-bg')}>
                Retomar
              </button>
            )}
            {marca.status === 'concluida' && (
              <button type="button" disabled={salvando} onClick={() => mudar('em_contagem')} className={cx(BOTAO_ACAO, 'text-muted hover:bg-bg hover:text-fg')}>
                Reabrir
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditandoObs((v) => !v)}
              className="min-h-10 rounded-xl px-2.5 text-muted hover:bg-bg hover:text-fg"
              aria-label="Observação"
              aria-expanded={editandoObs}
              title="Observação"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {editandoObs && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            onSalvar(marca.status, obs.trim() || null);
            setEditandoObs(false);
          }}
        >
          <AreaTexto
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={1000}
            placeholder="Ex.: faltou contar o depósito 2"
            autoFocus
            className="min-h-16"
          />
          <Botao type="submit" variante="secundario" disabled={salvando}>
            Salvar
          </Botao>
        </form>
      )}
    </li>
  );
}

function Finalizar({ auditoriaId, totais }: { auditoriaId: string; totais: Record<StatusMarca, number> }) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const incompletas = totais.pendente + totais.em_contagem + totais.parcial;

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    const r = await finalizarAuditoria(auditoriaId);
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    dialogo.current?.close();
    router.refresh();
  }

  return (
    <>
      <Botao onClick={() => dialogo.current?.showModal()}>Finalizar</Botao>
      <dialog
        ref={dialogo}
        className="w-[min(28rem,calc(100%-2rem))] rounded-xl border border-line bg-card p-6 text-fg shadow-md backdrop:bg-black/40"
      >
        <h2 className="text-lg font-bold">Finalizar auditoria?</h2>
        {incompletas > 0 ? (
          <div className="mt-3">
            <Alerta tipo="aviso">
              Existem {totais.pendente} marcas pendentes, {totais.em_contagem} em contagem e {totais.parcial} parciais.
              Deseja finalizar mesmo assim?
            </Alerta>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Todas as marcas estão concluídas. Depois de finalizada, a auditoria não aceita mais alterações.
          </p>
        )}
        {erro && (
          <div className="mt-3">
            <Alerta>{erro}</Alerta>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => dialogo.current?.close()} disabled={enviando}>
            Voltar
          </Botao>
          <Botao onClick={confirmar} disabled={enviando}>
            {enviando ? 'Finalizando…' : incompletas > 0 ? 'Finalizar mesmo assim' : 'Finalizar'}
          </Botao>
        </div>
      </dialog>
    </>
  );
}
