'use client';

import { useRef, useState } from 'react';
import type { ResumoAuditoria } from '@/components/CartaoAuditoria';
import { Alerta, Botao, cx, Rotulo, Selecao } from '@/components/ui';
import type { FiltroPdf, OrdemPdf } from '@/lib/pdf/relatorioMarcas';
import { ROTULO_STATUS_MARCA_PLURAL, type AuditoriaMarca, type StatusMarca } from '@/lib/tipos';

const STATUS: StatusMarca[] = ['pendente', 'em_contagem', 'parcial', 'concluida'];

async function carregarLogo(): Promise<string | undefined> {
  try {
    const resposta = await fetch('/logo.png');
    if (!resposta.ok) return undefined;
    const blob = await resposta.blob();
    return await new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result as string);
      leitor.onerror = () => resolve(undefined);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return undefined; // PDF sai sem logo, mas sai
  }
}

export function GerarPdf({
  auditoria,
  marcas,
  filtroAtual,
}: {
  auditoria: ResumoAuditoria;
  marcas: AuditoriaMarca[];
  filtroAtual: FiltroPdf;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [filtro, setFiltro] = useState<FiltroPdf>(filtroAtual);
  const [ordem, setOrdem] = useState<OrdemPdf>('nome');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const contagem = (f: FiltroPdf) => (f === 'todas' ? marcas.length : marcas.filter((m) => m.status === f).length);
  const quantidade = contagem(filtro);

  function abrir() {
    setFiltro(filtroAtual); // começa no filtro que está na tela
    setErro(null);
    dialogo.current?.showModal();
  }

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      // jsPDF só é baixado quando alguém pede um PDF.
      const [{ gerarPdfMarcas, nomeArquivoPdf }, logo] = await Promise.all([
        import('@/lib/pdf/relatorioMarcas'),
        carregarLogo(),
      ]);
      const doc = gerarPdfMarcas({ auditoria, marcas, filtro, ordem, logo });
      doc.save(nomeArquivoPdf(auditoria, filtro));
      dialogo.current?.close();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.');
    } finally {
      setGerando(false);
    }
  }

  const opcoes: FiltroPdf[] = ['todas', ...STATUS];

  return (
    <>
      <Botao variante="secundario" onClick={abrir}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" />
        </svg>
        Gerar PDF
      </Botao>
      <dialog
        ref={dialogo}
        className="w-[min(30rem,calc(100%-2rem))] rounded-xl border border-line bg-card p-6 text-fg shadow-md backdrop:bg-black/40"
      >
        <h2 className="text-lg font-bold">Gerar PDF das marcas</h2>
        <p className="mt-1 text-sm text-muted">Escolha quais marcas entram no relatório.</p>

        <fieldset className="mt-4">
          <legend className="mb-1.5 text-sm font-semibold">Marcas</legend>
          <div className="grid grid-cols-2 gap-2">
            {opcoes.map((f) => (
              <label
                key={f}
                className={cx(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors duration-150',
                  filtro === f ? 'border-primary ring-2 ring-primary/30' : 'border-line hover:bg-bg',
                  f === 'todas' && 'col-span-2',
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="filtro-pdf"
                    value={f}
                    checked={filtro === f}
                    onChange={() => setFiltro(f)}
                    className="accent-[rgb(var(--brand-primary))]"
                  />
                  {f === 'todas' ? 'Todas' : ROTULO_STATUS_MARCA_PLURAL[f]}
                </span>
                <span className="font-mono text-xs text-muted">{contagem(f)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <Rotulo htmlFor="ordem-pdf">Ordenar por</Rotulo>
          <Selecao id="ordem-pdf" value={ordem} onChange={(e) => setOrdem(e.target.value as OrdemPdf)}>
            <option value="nome">Nome da marca</option>
            <option value="codigo">Código</option>
          </Selecao>
        </div>

        {quantidade === 0 && (
          <div className="mt-4">
            <Alerta tipo="aviso">Nenhuma marca com este status agora.</Alerta>
          </div>
        )}
        {erro && (
          <div className="mt-4">
            <Alerta>{erro}</Alerta>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => dialogo.current?.close()} disabled={gerando}>
            Cancelar
          </Botao>
          <Botao onClick={gerar} disabled={gerando || quantidade === 0}>
            {gerando ? 'Gerando…' : `Baixar PDF (${quantidade})`}
          </Botao>
        </div>
      </dialog>
    </>
  );
}
