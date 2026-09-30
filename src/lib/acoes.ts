import type { PostgrestError } from '@supabase/supabase-js';
import type { ZodError } from 'zod';

export type Resultado<T = undefined> = { ok: true; dados: T } | { ok: false; erro: string };

export const sucesso = <T,>(dados: T): Resultado<T> => ({ ok: true, dados });
export const falha = (erro: string): Resultado<never> => ({ ok: false, erro });

/** Traduz erros do Postgres/PostgREST para mensagens que o usuário entende. */
export function mensagemDoBanco(erro: PostgrestError | null | undefined): string {
  if (!erro) return 'Erro desconhecido.';
  if (/row-level security/i.test(erro.message)) return 'Você não tem permissão para esta operação.';
  // Exceções levantadas pelas nossas funções (raise exception) já vêm em português.
  if (erro.code === 'P0001' || erro.code === '42501') return erro.message;
  if (erro.code === '23505') return 'Já existe um registro com esses dados.';
  if (erro.code === '23503') return 'Este registro está em uso e não pode ser removido.';
  return `Erro no banco: ${erro.message}`;
}

export function mensagemDeValidacao(erro: ZodError): string {
  return erro.issues[0]?.message ?? 'Dados inválidos.';
}
