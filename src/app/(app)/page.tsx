import { CartaoAuditoria, COLUNAS_RESUMO, type ResumoAuditoria } from '@/components/CartaoAuditoria';
import { BotaoLink, Cabecalho, Cartao, Vazio } from '@/components/ui';
import { exigirSessao, podeAdministrar } from '@/lib/auth';

export default async function PainelPage() {
  const { profile, supabase } = await exigirSessao();
  const veTodas = profile.perfil !== 'auditor';

  const trintaDiasAtras = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [lojas, emAndamento, recentes, concluidas, concluidasMes] = await Promise.all([
    supabase.from('lojas').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabase
      .from('auditorias_resumo')
      .select(COLUNAS_RESUMO)
      .eq('status', 'em_andamento')
      .order('iniciada_em', { ascending: false })
      .returns<ResumoAuditoria[]>(),
    supabase
      .from('auditorias_resumo')
      .select(COLUNAS_RESUMO)
      .neq('status', 'em_andamento')
      .order('iniciada_em', { ascending: false })
      .limit(5)
      .returns<ResumoAuditoria[]>(),
    supabase.from('auditorias').select('id', { count: 'exact', head: true }).eq('status', 'concluida'),
    supabase
      .from('auditorias')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'concluida')
      .gte('finalizada_em', trintaDiasAtras),
  ]);

  if (!lojas.count) {
    return (
      <>
        <Cabecalho titulo={`Olá, ${profile.nome.split(' ')[0]}`} />
        <Vazio
          titulo="Nenhuma loja cadastrada ainda"
          descricao={
            podeAdministrar(profile.perfil)
              ? 'Cadastre a empresa, a loja e importe o relatório de marcas para liberar as auditorias.'
              : 'Peça ao administrador para cadastrar empresas, lojas e marcas.'
          }
          acao={podeAdministrar(profile.perfil) && <BotaoLink href="/admin/empresas">Cadastrar empresa</BotaoLink>}
        />
      </>
    );
  }

  const andamento = emAndamento.data ?? [];

  return (
    <>
      <Cabecalho
        titulo={`Olá, ${profile.nome.split(' ')[0]}`}
        descricao={veTodas ? 'Visão de todas as auditorias.' : 'Suas auditorias.'}
        acoes={<BotaoLink href="/auditorias/nova">Nova auditoria</BotaoLink>}
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Indicador rotulo="Em andamento" valor={andamento.length} />
        <Indicador rotulo="Concluídas (30 dias)" valor={concluidasMes.count ?? 0} destaque />
        <Indicador rotulo="Concluídas no total" valor={concluidas.count ?? 0} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Em andamento</h2>
        {andamento.length ? (
          <div className="grid gap-3">
            {andamento.map((a) => (
              <CartaoAuditoria key={a.id} a={a} mostrarAuditor={veTodas} />
            ))}
          </div>
        ) : (
          <Vazio
            titulo="Nenhuma auditoria em andamento"
            descricao="Inicie uma auditoria para acompanhar as marcas da loja sem papel."
            acao={<BotaoLink href="/auditorias/nova">Iniciar auditoria</BotaoLink>}
          />
        )}
      </section>

      {(recentes.data?.length ?? 0) > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Finalizadas recentemente</h2>
            <BotaoLink href="/auditorias" variante="fantasma">
              Ver histórico
            </BotaoLink>
          </div>
          <div className="grid gap-3">
            {recentes.data!.map((a) => (
              <CartaoAuditoria key={a.id} a={a} mostrarAuditor={veTodas} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <Cartao>
      <p className="text-sm text-muted">{rotulo}</p>
      <p className={`mt-1 font-mono text-3xl font-semibold ${destaque ? 'texto-sucesso' : ''}`}>{valor}</p>
    </Cartao>
  );
}
