import { Cabecalho, Vazio, BotaoLink } from '@/components/ui';
import { exigirPerfil } from '@/lib/auth';
import { formatarDataHora } from '@/lib/formato';
import type { Empresa } from '@/lib/tipos';
import { ImportarMarcas } from './ImportarMarcas';

type Importacao = {
  id: string;
  arquivo_nome: string;
  total_linhas_lidas: number;
  total_marcas_novas: number;
  total_marcas_reativadas: number;
  total_marcas_desativadas: number;
  importado_em: string;
  empresa: { nome: string } | null;
  usuario: { nome: string } | null;
};

export default async function MarcasPage() {
  const { supabase } = await exigirPerfil('administrador');
  const [empresas, importacoes] = await Promise.all([
    supabase.from('empresas').select('id, nome, ativo').eq('ativo', true).order('nome').returns<Empresa[]>(),
    supabase
      .from('importacoes_marcas')
      .select(
        'id, arquivo_nome, total_linhas_lidas, total_marcas_novas, total_marcas_reativadas, total_marcas_desativadas, importado_em, empresa:empresas(nome), usuario:profiles(nome)',
      )
      .order('importado_em', { ascending: false })
      .limit(10)
      .returns<Importacao[]>(),
  ]);

  if (!empresas.data?.length) {
    return (
      <>
        <Cabecalho titulo="Importar marcas" />
        <Vazio titulo="Cadastre uma empresa primeiro" acao={<BotaoLink href="/admin/empresas">Ir para Empresas</BotaoLink>} />
      </>
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Importar marcas"
        descricao='Envie o relatório "Relação de Produtos por Marca" exportado do Santri ADM em .ods. Marcas que sumirem do relatório são desativadas, nunca apagadas.'
      />
      <ImportarMarcas empresas={empresas.data} />

      {(importacoes.data?.length ?? 0) > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Últimas importações</h2>
          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Quando</th>
                  <th className="px-4 py-2 font-semibold">Empresa</th>
                  <th className="px-4 py-2 font-semibold">Arquivo</th>
                  <th className="px-4 py-2 text-right font-semibold">Lidas</th>
                  <th className="px-4 py-2 text-right font-semibold">Novas</th>
                  <th className="px-4 py-2 text-right font-semibold">Reativadas</th>
                  <th className="px-4 py-2 text-right font-semibold">Desativadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {importacoes.data!.map((i) => (
                  <tr key={i.id}>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{formatarDataHora(i.importado_em)}</td>
                    <td className="px-4 py-2">{i.empresa?.nome}</td>
                    <td className="max-w-56 truncate px-4 py-2 text-muted" title={i.arquivo_nome}>
                      {i.arquivo_nome}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{i.total_linhas_lidas}</td>
                    <td className="px-4 py-2 text-right font-mono">{i.total_marcas_novas}</td>
                    <td className="px-4 py-2 text-right font-mono">{i.total_marcas_reativadas}</td>
                    <td className="px-4 py-2 text-right font-mono">{i.total_marcas_desativadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
