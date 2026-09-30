import { notFound } from 'next/navigation';
import { COLUNAS_RESUMO, type ResumoAuditoria } from '@/components/CartaoAuditoria';
import { exigirSessao } from '@/lib/auth';
import { formatarDataHora } from '@/lib/formato';
import { buscarTodas } from '@/lib/paginacao';
import type { AuditoriaMarca } from '@/lib/tipos';
import { TelaAuditoria } from './TelaAuditoria';

type Evento = { id: string; descricao: string; criado_em: string; usuario: { nome: string } | null };

export default async function AuditoriaPage({ params }: { params: { id: string } }) {
  const { user, profile, supabase } = await exigirSessao();

  const { data: auditoria } = await supabase
    .from('auditorias_resumo')
    .select(`${COLUNAS_RESUMO}, auditor_id`)
    .eq('id', params.id)
    .maybeSingle<ResumoAuditoria & { auditor_id: string }>();
  // Sem linha = não existe ou a RLS escondeu (auditoria de outro auditor).
  if (!auditoria) notFound();

  const [marcas, eventos] = await Promise.all([
    buscarTodas<AuditoriaMarca>((de, ate) =>
      supabase
        .from('auditoria_marcas')
        .select('id, marca_nome, marca_codigo, status, status_origem, observacao, atualizado_em, iniciada_em')
        .eq('auditoria_id', params.id)
        .order('marca_nome')
        .order('id')
        .range(de, ate),
    ),
    supabase
      .from('eventos_auditoria')
      .select('id, descricao, criado_em, usuario:profiles(nome)')
      .eq('auditoria_id', params.id)
      .order('criado_em', { ascending: false })
      .limit(30)
      .returns<Evento[]>(),
  ]);

  const podeEditar =
    auditoria.status === 'em_andamento' && (auditoria.auditor_id === user.id || profile.perfil !== 'auditor');

  return (
    <>
      <TelaAuditoria auditoria={auditoria} marcasIniciais={marcas} podeEditar={podeEditar} />

      <details className="mt-8 rounded-xl border border-line bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Histórico de alterações</summary>
        <ol className="mt-3 space-y-2">
          {(eventos.data ?? []).map((e) => (
            <li key={e.id} className="text-sm">
              <span className="font-mono text-xs text-muted">{formatarDataHora(e.criado_em)}</span>{' '}
              <span>{e.descricao}</span>
              {e.usuario && <span className="text-muted"> · {e.usuario.nome}</span>}
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}
