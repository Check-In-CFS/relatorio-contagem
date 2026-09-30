import { Cabecalho, Vazio } from '@/components/ui';
import { exigirPerfil } from '@/lib/auth';
import { formatarDataHora } from '@/lib/formato';
import { ImportarContagens, type LojaComEmpresa } from './ImportarContagens';

type Importacao = {
  id: string;
  arquivo_nome: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  total_contagens_lidas: number;
  importado_em: string;
  loja: { nome: string } | null;
  usuario: { nome: string } | null;
};

const formatarData = (d: string | null) => (d ? d.split('-').reverse().join('/') : '?');

export default async function ContagensPage() {
  const { supabase } = await exigirPerfil('gestor', 'administrador');
  const [lojas, importacoes] = await Promise.all([
    supabase
      .from('lojas')
      .select('id, nome, empresa:empresas(nome)')
      .eq('ativo', true)
      .order('nome')
      .returns<LojaComEmpresa[]>(),
    supabase
      .from('importacoes_contagem')
      .select(
        'id, arquivo_nome, periodo_inicio, periodo_fim, total_contagens_lidas, importado_em, loja:lojas(nome), usuario:profiles(nome)',
      )
      .order('importado_em', { ascending: false })
      .limit(10)
      .returns<Importacao[]>(),
  ]);

  return (
    <>
      <Cabecalho
        titulo="Importar contagens"
        descricao='Envie o relatório "Ordens de Contagens Acompanhadas Analítico" do Santri ADM. As contagens sugerem o status das marcas na auditoria em andamento da loja — o auditor pode alterar depois.'
      />
      {lojas.data?.length ? (
        <ImportarContagens lojas={lojas.data} />
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
                    {i.arquivo_nome} · período {formatarData(i.periodo_inicio)} a {formatarData(i.periodo_fim)} ·{' '}
                    {i.usuario?.nome}
                  </p>
                </div>
                <p className="font-mono text-xs text-muted">
                  {i.total_contagens_lidas} contagens · {formatarDataHora(i.importado_em)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
