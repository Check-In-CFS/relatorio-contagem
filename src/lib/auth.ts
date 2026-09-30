import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Perfil, Profile } from './tipos';

export const obterSessao = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nome, perfil, ativo')
    .eq('id', user.id)
    .single<Profile>();
  if (!profile) return null;

  return { user, profile, supabase };
});

export async function exigirSessao() {
  const sessao = await obterSessao();
  if (!sessao) redirect('/login');
  if (!sessao.profile.ativo) redirect('/login?erro=inativo');
  return sessao;
}

/** Barra a tela para quem não tem o perfil. A RLS barra os dados de qualquer forma. */
export async function exigirPerfil(...perfis: Perfil[]) {
  const sessao = await exigirSessao();
  if (!perfis.includes(sessao.profile.perfil)) redirect('/');
  return sessao;
}

export const podeAdministrar = (perfil: Perfil) => perfil === 'administrador';
export const podeImportarContagens = (perfil: Perfil) => perfil === 'gestor' || perfil === 'administrador';
