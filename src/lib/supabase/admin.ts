import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './env';

// Cliente com a chave de serviço: ignora a RLS e acessa a API de administração
// do Auth. Só pode ser usado em código de servidor, DEPOIS de conferir que quem
// pediu é administrador (exigirPerfil('administrador')).
// O import 'server-only' faz o build falhar se este módulo chegar ao navegador.
export function createAdminClient(): SupabaseClient {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não está definida no .env.local. Rode `npm run db:up` (local) ou copie a service_role key do painel do Supabase.',
    );
  }
  return createClient(SUPABASE_URL, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
