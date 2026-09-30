'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const esquema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export async function entrar(_anterior: string | null, form: FormData): Promise<string | null> {
  const dados = esquema.safeParse({ email: form.get('email'), senha: form.get('senha') });
  if (!dados.success) return dados.error.issues[0].message;

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error) return 'E-mail ou senha incorretos.';

  redirect('/');
}

export async function sair() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
