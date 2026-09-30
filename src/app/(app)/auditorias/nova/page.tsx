import { Cabecalho, Vazio, BotaoLink } from '@/components/ui';
import { exigirSessao, podeAdministrar } from '@/lib/auth';
import type { Empresa, Loja } from '@/lib/tipos';
import { FormNovaAuditoria } from './FormNovaAuditoria';

export default async function NovaAuditoriaPage() {
  const { profile, supabase } = await exigirSessao();
  const [empresas, lojas] = await Promise.all([
    supabase.from('empresas').select('id, nome, ativo').eq('ativo', true).order('nome').returns<Empresa[]>(),
    supabase
      .from('lojas')
      .select('id, empresa_id, nome, codigo_interno, ativo')
      .eq('ativo', true)
      .order('nome')
      .returns<Loja[]>(),
  ]);

  const contagens = await Promise.all(
    (empresas.data ?? []).map(async (e) => {
      const { count } = await supabase
        .from('marcas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', e.id)
        .eq('ativo', true);
      return [e.id, count ?? 0] as const;
    }),
  );
  const marcasPorEmpresa = Object.fromEntries(contagens);

  if (!lojas.data?.length) {
    return (
      <>
        <Cabecalho titulo="Nova auditoria" />
        <Vazio
          titulo="Nenhuma loja cadastrada"
          descricao="É preciso ter pelo menos uma loja ativa para iniciar uma auditoria."
          acao={podeAdministrar(profile.perfil) && <BotaoLink href="/admin/lojas">Cadastrar loja</BotaoLink>}
        />
      </>
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Nova auditoria"
        descricao="Ao iniciar, a lista de marcas ativas da empresa é copiada para esta auditoria."
      />
      <FormNovaAuditoria empresas={empresas.data ?? []} lojas={lojas.data} marcasPorEmpresa={marcasPorEmpresa} />
    </>
  );
}
