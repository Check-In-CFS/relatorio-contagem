import { CartaoAuditoria, COLUNAS_RESUMO, type ResumoAuditoria } from '@/components/CartaoAuditoria';
import { BotaoLink, Cabecalho, Vazio } from '@/components/ui';
import { exigirSessao } from '@/lib/auth';

export default async function AuditoriasPage() {
  const { profile, supabase } = await exigirSessao();
  const { data } = await supabase
    .from('auditorias_resumo')
    .select(COLUNAS_RESUMO)
    .order('iniciada_em', { ascending: false })
    .limit(100)
    .returns<ResumoAuditoria[]>();

  const auditorias = data ?? [];
  return (
    <>
      <Cabecalho
        titulo="Auditorias"
        descricao="Histórico das auditorias, da mais recente para a mais antiga."
        acoes={<BotaoLink href="/auditorias/nova">Nova auditoria</BotaoLink>}
      />
      {auditorias.length ? (
        <div className="grid gap-3">
          {auditorias.map((a) => (
            <CartaoAuditoria key={a.id} a={a} mostrarAuditor={profile.perfil !== 'auditor'} />
          ))}
        </div>
      ) : (
        <Vazio
          titulo="Nenhuma auditoria ainda"
          descricao="Que tal iniciar a primeira?"
          acao={<BotaoLink href="/auditorias/nova">Iniciar auditoria</BotaoLink>}
        />
      )}
    </>
  );
}
