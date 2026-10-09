import { Cabecalho, Vazio } from '@/components/ui';
import { exigirPerfil } from '@/lib/auth';
import { formatarDataHora } from '@/lib/formato';
import type { LojaComEmpresa } from '../contagens/ImportarContagens';
import { ImportarEstoque } from './ImportarEstoque';

type Importacao = {
  id: string;
  arquivo_nome: string;
  total_itens: number;
  total_com_saldo: number;
  importado_em: string;
  loja: { nome: string } | null;
  usuario: { nome: string } | null;
};

export default async function EstoquePage() {
  const { supabase } = await exigirPerfil('gestor', 'administrador');
  const [lojas, importacoes] = await Promise.all([
    supabase
      .from('lojas')
      .select('id, nome, empresa:empresas(nome)')
      .eq('ativo', true)
      .order('nome')
      .returns<LojaComEmpresa[]>(),
    supabase
      .from('importacoes_estoque')
      .select('id, arquivo_nome, total_itens, total_com_saldo, importado_em, loja:lojas(nome), usuario:profiles(nome)')
      .order('importado_em', { ascending: false })
      .limit(10)
      .returns<Importacao[]>(),
  ]);

  return (
    <>
      <Cabecalho
        titulo="Importar estoque"
        descricao='Envie o relatório "Valor de Estoque - Analítico" do Santri ADM (Ativo: Sim, agrupado por grupo) antes de começar a auditoria. Ele define quantos SKUs cada marca tem: a marca só fica concluída quando todos forem contados.'
      />
      {lojas.data?.length ? (
        <ImportarEstoque lojas={lojas.data} />
      ) : (
        <Vazio titulo="Nenhuma loja ativa" descricao="Peça ao administrador para cadastrar a loja." />
      )}

      {(importacoes.data?.length ?? 0) > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Últimas importações</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {importacoes.data!.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{i.loja?.nome}</p>
                  <p className="truncate text-xs text-muted" title={i.arquivo_nome}>
                    {i.arquivo_nome} · {i.usuario?.nome}
                  </p>
                </div>
                <p className="font-mono text-xs text-muted">
                  {i.total_itens.toLocaleString('pt-BR')} itens ({i.total_com_saldo.toLocaleString('pt-BR')} com saldo) ·{' '}
                  {formatarDataHora(i.importado_em)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
