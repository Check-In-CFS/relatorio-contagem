// Utilitário do Supabase local em Docker.
//   node scripts/supabase-local.mjs preparar            → gera .env.docker (segredos) e .env.local (app)
//   node scripts/supabase-local.mjs admin <email> <senha> [nome]
//                                                       → cria o usuário e o promove a administrador
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_DOCKER = '.env.docker';
const ENV_LOCAL = '.env.local';
const API_URL = 'http://127.0.0.1:54321';

const base64url = (dados) => Buffer.from(dados).toString('base64url');

function assinarJwt(payload, segredo) {
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = base64url(JSON.stringify(payload));
  const assinatura = createHmac('sha256', segredo).update(`${cabecalho}.${corpo}`).digest('base64url');
  return `${cabecalho}.${corpo}.${assinatura}`;
}

function lerEnv(caminho) {
  if (!existsSync(caminho)) return {};
  return Object.fromEntries(
    readFileSync(caminho, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

function preparar() {
  let env = lerEnv(ENV_DOCKER);
  if (!env.JWT_SECRET) {
    const jwtSecret = randomBytes(32).toString('hex');
    const agora = Math.floor(Date.now() / 1000);
    const dezAnos = agora + 10 * 365 * 24 * 3600;
    env = {
      POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
      JWT_SECRET: jwtSecret,
      ANON_KEY: assinarJwt({ role: 'anon', iss: 'supabase', iat: agora, exp: dezAnos }, jwtSecret),
      SERVICE_ROLE_KEY: assinarJwt({ role: 'service_role', iss: 'supabase', iat: agora, exp: dezAnos }, jwtSecret),
      PG_META_CRYPTO_KEY: randomBytes(16).toString('hex'),
    };
    const conteudo = [
      '# Segredos do Supabase local (gerados por scripts/supabase-local.mjs). NÃO versionar.',
      ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
      '',
    ].join('\n');
    writeFileSync(ENV_DOCKER, conteudo);
    console.log(`Gerado ${ENV_DOCKER} com segredos novos.`);
  }

  // Mantém outras variáveis que o usuário tenha colocado no .env.local.
  const local = lerEnv(ENV_LOCAL);
  local.NEXT_PUBLIC_SUPABASE_URL = API_URL;
  local.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.ANON_KEY;
  // Só no servidor (sem NEXT_PUBLIC_): usada para criar usuários na tela de administração.
  local.SUPABASE_SERVICE_ROLE_KEY = env.SERVICE_ROLE_KEY;
  writeFileSync(
    ENV_LOCAL,
    ['# Supabase local em Docker (npm run db:up).', ...Object.entries(local).map(([k, v]) => `${k}=${v}`), ''].join('\n'),
  );
  console.log(`${ENV_LOCAL} aponta para ${API_URL}.`);
}

async function admin(email, senha, nome) {
  if (!email || !senha) {
    console.error('Uso: npm run db:admin -- <email> <senha> [nome]');
    process.exit(1);
  }
  const { SERVICE_ROLE_KEY: chave } = lerEnv(ENV_DOCKER);
  if (!chave) {
    console.error('Rode `npm run db:up` antes.');
    process.exit(1);
  }
  const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' };

  const criar = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome: nome ?? email } }),
  });
  const usuario = await criar.json();
  if (!criar.ok) {
    console.error('Não foi possível criar o usuário:', usuario.msg ?? usuario.message ?? usuario);
    process.exit(1);
  }

  // service_role ignora a RLS; auth.uid() nulo libera a troca de perfil no trigger.
  const promover = await fetch(`${API_URL}/rest/v1/profiles?id=eq.${usuario.id}`, {
    method: 'PATCH',
    headers: { ...cabecalhos, Prefer: 'return=representation' },
    body: JSON.stringify({ perfil: 'administrador', ...(nome ? { nome } : {}) }),
  });
  const perfil = await promover.json();
  if (!promover.ok || !perfil.length) {
    console.error('Usuário criado, mas não foi possível promovê-lo:', perfil);
    process.exit(1);
  }
  console.log(`Administrador criado: ${email} (${perfil[0].nome}).`);
}

const [comando, ...args] = process.argv.slice(2);
if (comando === 'preparar') preparar();
else if (comando === 'admin') await admin(...args);
else {
  console.error('Comandos: preparar | admin <email> <senha> [nome]');
  process.exit(1);
}
