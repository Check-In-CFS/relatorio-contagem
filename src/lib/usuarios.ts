import type { SupabaseClient } from '@supabase/supabase-js';
import type { Perfil } from './tipos';

// Operações de usuário que precisam da API de administração do Auth.
// `servico` é o cliente com a chave de serviço; `admin` é o cliente com a
// sessão do administrador que pediu (as mudanças de perfil passam pela RLS e
// pelo trigger de proteção de perfil em nome dele).

// "Banir" no Auth impede novos logins e renovação de sessão de um usuário
// desativado; ~100 anos equivale a "até ser reativado".
const BLOQUEIO_INDEFINIDO = '876000h';

export type NovoUsuario = { nome: string; email: string; senha: string; perfil: Perfil };

function traduzirErroAuth(mensagem: string): string {
  if (/already been registered|already exists/i.test(mensagem)) return 'Já existe um usuário com este e-mail.';
  if (/password/i.test(mensagem)) return `Senha recusada: ${mensagem}`;
  if (/email/i.test(mensagem)) return 'E-mail inválido.';
  return mensagem;
}

export async function criarUsuario(
  servico: SupabaseClient,
  admin: SupabaseClient,
  novo: NovoUsuario,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data, error } = await servico.auth.admin.createUser({
    email: novo.email,
    password: novo.senha,
    email_confirm: true, // não há envio de e-mail: o administrador repassa a senha
    user_metadata: { nome: novo.nome },
  });
  if (error || !data.user) return { ok: false, erro: traduzirErroAuth(error?.message ?? 'Falha ao criar usuário.') };

  // O trigger handle_new_user já criou o perfil como auditor com o nome acima.
  if (novo.perfil !== 'auditor') {
    // A RLS não gera erro quando bloqueia um update: ele só afeta zero linhas.
    const { data: alterados, error: erroPerfil } = await admin
      .from('profiles')
      .update({ perfil: novo.perfil })
      .eq('id', data.user.id)
      .select('id');
    if (erroPerfil || !alterados?.length) {
      return {
        ok: false,
        erro: `Usuário criado como Auditor, mas o nível não pôde ser alterado${erroPerfil ? `: ${erroPerfil.message}` : ' (sem permissão)'}.`,
      };
    }
  }
  return { ok: true, id: data.user.id };
}

export async function redefinirSenha(servico: SupabaseClient, id: string, senha: string) {
  const { error } = await servico.auth.admin.updateUserById(id, { password: senha });
  return error ? { ok: false as const, erro: traduzirErroAuth(error.message) } : { ok: true as const };
}

/** Mantém o bloqueio de login do Auth alinhado com profiles.ativo. */
export async function sincronizarBloqueio(servico: SupabaseClient, id: string, ativo: boolean) {
  const { error } = await servico.auth.admin.updateUserById(id, { ban_duration: ativo ? 'none' : BLOQUEIO_INDEFINIDO });
  return error ? { ok: false as const, erro: error.message } : { ok: true as const };
}

/** E-mail de cada usuário (fica em auth.users, fora do alcance da RLS). */
export async function emailsPorUsuario(servico: SupabaseClient): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await servico.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 1000) return emails;
  }
}
