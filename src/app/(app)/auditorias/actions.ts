'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { falha, mensagemDeValidacao, mensagemDoBanco, sucesso, type Resultado } from '@/lib/acoes';
import { exigirSessao } from '@/lib/auth';

const uuid = z.string().uuid('Identificador inválido.');

export async function criarAuditoria(_anterior: string | null, form: FormData): Promise<string | null> {
  const lojaId = uuid.safeParse(form.get('loja_id'));
  if (!lojaId.success) return 'Selecione a loja.';

  const { supabase } = await exigirSessao();
  const { data, error } = await supabase.rpc('criar_auditoria', { p_loja_id: lojaId.data });
  if (error) return mensagemDoBanco(error);

  revalidatePath('/');
  redirect(`/auditorias/${data}`);
}

const esquemaStatus = z.object({
  id: uuid,
  status: z.enum(['pendente', 'em_contagem', 'parcial', 'concluida']),
  observacao: z.string().max(1000, 'A observação pode ter no máximo 1000 caracteres.').nullable(),
});

export async function atualizarStatusMarca(entrada: z.input<typeof esquemaStatus>): Promise<Resultado<null>> {
  const dados = esquemaStatus.safeParse(entrada);
  if (!dados.success) return falha(mensagemDeValidacao(dados.error));

  const { supabase } = await exigirSessao();
  const { error } = await supabase.rpc('atualizar_status_marca', {
    p_auditoria_marca_id: dados.data.id,
    p_status: dados.data.status,
    p_observacao: dados.data.observacao,
  });
  if (error) return falha(mensagemDoBanco(error));
  return sucesso(null);
}

export async function finalizarAuditoria(id: string): Promise<Resultado<null>> {
  const auditoriaId = uuid.safeParse(id);
  if (!auditoriaId.success) return falha('Auditoria inválida.');

  const { supabase } = await exigirSessao();
  const { error } = await supabase.rpc('finalizar_auditoria', { p_auditoria_id: auditoriaId.data });
  if (error) return falha(mensagemDoBanco(error));

  revalidatePath('/');
  revalidatePath(`/auditorias/${auditoriaId.data}`);
  return sucesso(null);
}
