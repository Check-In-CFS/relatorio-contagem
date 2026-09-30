// Teste de integração contra o Supabase local (npm run db:up):
// fluxo completo de auditoria + isolamento de RLS entre perfis.
// Roda com: npm run test:integracao
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseContagensAcompanhadas } from '@/lib/parsers/contagens';
import { lerPrimeiraAba } from '@/lib/parsers/planilha';
import { calcularSugestoes } from '@/lib/sugestao';
import { criarUsuario as criarUsuarioAdmin, emailsPorUsuario, redefinirSenha, sincronizarBloqueio } from '@/lib/usuarios';

const URL = 'http://127.0.0.1:54321';
const ARQUIVO_REAL =
  process.env.SANTRI_CONTAGENS_ODS ??
  'C:/Users/castelo/Desktop/Relatorios-Logistica-Marcio/Arquivos_ods/contagens_acompanhadas 2026 9.ods';

function lerEnvDocker(): Record<string, string> {
  if (!existsSync('.env.docker')) return {};
  return Object.fromEntries(
    readFileSync('.env.docker', 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

const env = lerEnvDocker();
const ativo = process.env.RODAR_INTEGRACAO === '1' && !!env.SERVICE_ROLE_KEY;
const sufixo = Date.now().toString(36);
const SENHA = 'Senha-Teste-123';

describe.skipIf(!ativo)('integração com Supabase local', () => {
  const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
  let servico: SupabaseClient;
  let admin: SupabaseClient;
  let audA: SupabaseClient;
  let audB: SupabaseClient;
  let gestor: SupabaseClient;
  let idA: string;
  let idB: string;
  let empresaId: string;
  let lojaId: string;
  let auditoriaId: string;
  let marcas: { id: string; marca_nome: string; status: string }[];

  async function criarUsuario(apelido: string, perfil?: 'gestor' | 'administrador') {
    const email = `${apelido}.${sufixo}@teste.local`;
    const { data, error } = await servico.auth.admin.createUser({
      email,
      password: SENHA,
      email_confirm: true,
      user_metadata: { nome: `${apelido} ${sufixo}` },
    });
    if (error) throw error;
    if (perfil) {
      const { error: e } = await servico.from('profiles').update({ perfil }).eq('id', data.user.id);
      if (e) throw e;
    }
    const cliente = createClient(URL, env.ANON_KEY, opcoes);
    const { error: e2 } = await cliente.auth.signInWithPassword({ email, password: SENHA });
    if (e2) throw e2;
    return { id: data.user.id, cliente };
  }

  beforeAll(async () => {
    servico = createClient(URL, env.SERVICE_ROLE_KEY, opcoes);
    admin = (await criarUsuario('admin', 'administrador')).cliente;
    gestor = (await criarUsuario('gestor', 'gestor')).cliente;
    ({ id: idA, cliente: audA } = await criarUsuario('auditor-a'));
    ({ id: idB, cliente: audB } = await criarUsuario('auditor-b'));
  });

  // O banco local é o mesmo usado no dia a dia: apaga tudo o que o teste criou.
  afterAll(async () => {
    if (!servico) return;
    if (empresaId) {
      const { data: lojas } = await servico.from('lojas').select('id').eq('empresa_id', empresaId);
      const idsLojas = (lojas ?? []).map((l) => l.id);
      await servico.from('auditorias').delete().eq('empresa_id', empresaId);
      if (idsLojas.length) await servico.from('importacoes_contagem').delete().in('loja_id', idsLojas);
      await servico.from('lojas').delete().eq('empresa_id', empresaId);
      await servico.from('marcas').delete().eq('empresa_id', empresaId);
      await servico.from('importacoes_marcas').delete().eq('empresa_id', empresaId);
      await servico.from('empresas').delete().eq('id', empresaId);
    }
    const { data } = await servico.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email?.endsWith(`.${sufixo}@teste.local`)) await servico.auth.admin.deleteUser(u.id);
    }
  });

  it('administrador cria usuário com nível, redefine senha e bloqueia login', async () => {
    const email = `novo.${sufixo}@teste.local`;
    const entrar = (senha: string) =>
      createClient(URL, env.ANON_KEY, opcoes).auth.signInWithPassword({ email, password: senha });

    const criado = await criarUsuarioAdmin(servico, admin, { nome: 'Novo Gestor', email, senha: 'Primeira-123', perfil: 'gestor' });
    expect(criado.ok).toBe(true);
    const id = (criado as { id: string }).id;
    expect((await admin.from('profiles').select('nome, perfil').eq('id', id).single()).data).toEqual({
      nome: 'Novo Gestor',
      perfil: 'gestor',
    });
    expect((await entrar('Primeira-123')).error).toBeNull();

    const repetido = await criarUsuarioAdmin(servico, admin, { nome: 'X', email, senha: 'Outra-1234', perfil: 'auditor' });
    expect(repetido).toEqual({ ok: false, erro: 'Já existe um usuário com este e-mail.' });

    // A sessão de um auditor não consegue dar nível ao usuário criado.
    const viaAuditor = await criarUsuarioAdmin(servico, audA, {
      nome: 'Y', email: `y.${sufixo}@teste.local`, senha: 'Outra-1234', perfil: 'administrador',
    });
    expect(viaAuditor.ok).toBe(false);

    expect((await redefinirSenha(servico, id, 'Segunda-456')).ok).toBe(true);
    expect((await entrar('Primeira-123')).error).not.toBeNull();
    expect((await entrar('Segunda-456')).error).toBeNull();

    expect((await sincronizarBloqueio(servico, id, false)).ok).toBe(true);
    expect((await entrar('Segunda-456')).error).not.toBeNull();
    expect((await sincronizarBloqueio(servico, id, true)).ok).toBe(true);
    expect((await entrar('Segunda-456')).error).toBeNull();

    expect((await emailsPorUsuario(servico)).get(id)).toBe(email);
  });

  it('administrador cadastra empresa e loja; auditor não', async () => {
    const empresa = await admin.from('empresas').insert({ nome: `CFS ${sufixo}` }).select().single();
    expect(empresa.error).toBeNull();
    empresaId = empresa.data!.id;
    const loja = await admin.from('lojas').insert({ empresa_id: empresaId, nome: 'Loja Centro' }).select().single();
    expect(loja.error).toBeNull();
    lojaId = loja.data!.id;

    expect((await audA.from('empresas').insert({ nome: 'X' })).error).not.toBeNull();
    expect((await gestor.from('lojas').insert({ empresa_id: empresaId, nome: 'Y' })).error).not.toBeNull();
  });

  it('reconcilia marcas: cria, desativa e reativa sem apagar', async () => {
    const base = ['HEVVY', 'GERMANY', 'BLUMENAU', 'TASCHIBRA', 'MARCA SEM CONTAGEM'].map((nome, i) => ({
      codigo: 1000 + i,
      nome,
    }));
    const r1 = await admin.rpc('importar_marcas', { p_empresa_id: empresaId, p_arquivo_nome: 'a.ods', p_marcas: base });
    expect(r1.data).toMatchObject({ novas: 5, reativadas: 0, desativadas: 0 });

    const r2 = await admin.rpc('importar_marcas', {
      p_empresa_id: empresaId,
      p_arquivo_nome: 'b.ods',
      p_marcas: [...base.slice(0, 4), { codigo: 2000, nome: 'NOVA' }],
    });
    expect(r2.data).toMatchObject({ novas: 1, desativadas: 1 });

    const r3 = await admin.rpc('importar_marcas', { p_empresa_id: empresaId, p_arquivo_nome: 'c.ods', p_marcas: base });
    expect(r3.data).toMatchObject({ novas: 0, reativadas: 1, desativadas: 1 });

    const { count } = await admin.from('marcas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId);
    expect(count).toBe(6); // nenhuma apagada

    expect((await gestor.rpc('importar_marcas', { p_empresa_id: empresaId, p_arquivo_nome: 'x', p_marcas: base })).error).not.toBeNull();
  });

  it('auditor não se promove a administrador', async () => {
    const r = await audA.from('profiles').update({ perfil: 'administrador' }).eq('id', idA);
    expect(r.error?.message).toMatch(/administradores/);
  });

  it('cria auditoria com fotografia das marcas ativas, uma por loja', async () => {
    const r = await audA.rpc('criar_auditoria', { p_loja_id: lojaId });
    expect(r.error).toBeNull();
    auditoriaId = r.data;

    const snap = await audA.from('auditoria_marcas').select('id, marca_nome, status').eq('auditoria_id', auditoriaId);
    marcas = snap.data!;
    expect(marcas).toHaveLength(5);

    expect((await audB.rpc('criar_auditoria', { p_loja_id: lojaId })).error?.message).toMatch(/em andamento/);
  });

  it('RLS: auditor B não enxerga nem altera a auditoria do A; gestor enxerga', async () => {
    expect((await audB.from('auditorias').select('id').eq('id', auditoriaId)).data).toEqual([]);
    expect((await audB.from('auditoria_marcas').select('id').eq('auditoria_id', auditoriaId)).data).toEqual([]);
    expect((await audB.from('auditorias_resumo').select('id').eq('id', auditoriaId)).data).toEqual([]);
    expect((await audB.from('eventos_auditoria').select('id').eq('auditoria_id', auditoriaId)).data).toEqual([]);

    const hevvy = marcas.find((m) => m.marca_nome === 'HEVVY')!;
    expect(
      (await audB.rpc('atualizar_status_marca', { p_auditoria_marca_id: hevvy.id, p_status: 'concluida', p_observacao: null })).error,
    ).not.toBeNull();
    expect(
      (await audB.from('eventos_auditoria').insert({ auditoria_id: auditoriaId, tipo: 'x', descricao: 'forjado', usuario_id: idB })).error,
    ).not.toBeNull();
    expect(
      (await audA.from('eventos_auditoria').insert({ auditoria_id: auditoriaId, tipo: 'x', descricao: 'em nome de outro', usuario_id: idB })).error,
    ).not.toBeNull();

    expect((await gestor.from('auditorias').select('id').eq('id', auditoriaId)).data).toHaveLength(1);
    expect((await admin.from('auditoria_marcas').select('id').eq('auditoria_id', auditoriaId)).data).toHaveLength(5);
  });

  it('fotografia guarda o código da marca', async () => {
    const r = await audA.from('auditoria_marcas').select('marca_nome, marca_codigo').eq('auditoria_id', auditoriaId);
    expect(r.data).toEqual(expect.arrayContaining([{ marca_nome: 'HEVVY', marca_codigo: 1000 }]));
  });

  it('marca precisa ser iniciada antes de virar parcial ou concluída', async () => {
    const germany = marcas.find((m) => m.marca_nome === 'GERMANY')!;
    const mudar = (status: string, obs: string | null = null) =>
      audA.rpc('atualizar_status_marca', { p_auditoria_marca_id: germany.id, p_status: status, p_observacao: obs });
    const ler = async () =>
      (await audA.from('auditoria_marcas').select('status, iniciada_em').eq('id', germany.id).single()).data!;

    expect((await mudar('parcial')).error?.message).toMatch(/Inicie a marca/);
    expect((await mudar('concluida')).error?.message).toMatch(/Inicie a marca/);

    // Iniciar e desfazer
    expect((await mudar('em_contagem')).error).toBeNull();
    expect((await ler()).iniciada_em).not.toBeNull();
    expect((await mudar('pendente')).error).toBeNull();
    expect(await ler()).toMatchObject({ status: 'pendente', iniciada_em: null });

    // Iniciar → parcial (com observação) → retomar → concluída → reabrir
    expect((await mudar('em_contagem')).error).toBeNull();
    const inicio = (await ler()).iniciada_em;
    expect((await mudar('parcial', 'faltou o depósito 2')).error).toBeNull();
    expect((await mudar('pendente')).error?.message).toMatch(/Parcial para Pendente/);
    expect((await mudar('em_contagem')).error).toBeNull();
    expect((await ler()).iniciada_em).toBe(inicio); // retomar mantém o horário do primeiro início
    expect((await mudar('concluida')).error).toBeNull();
    expect((await mudar('parcial')).error).not.toBeNull();
    expect((await mudar('em_contagem')).error).toBeNull();
    expect((await mudar('parcial')).error).toBeNull();

    const ev = await audA
      .from('eventos_auditoria')
      .select('tipo')
      .eq('auditoria_marca_id', germany.id)
      .order('criado_em');
    expect(ev.data!.map((e) => e.tipo)).toEqual(
      expect.arrayContaining(['marca_iniciada', 'inicio_desfeito', 'status_alterado', 'marca_reaberta', 'observacao_alterada']),
    );
  });

  it.skipIf(!existsSync(ARQUIVO_REAL))(
    'importa o relatório real de contagens e aplica sugestões sem rebaixar',
    async () => {
      expect(
        (await audA.rpc('importar_contagens', {
          p_loja_id: lojaId, p_arquivo_nome: 'x', p_periodo_inicio: null, p_periodo_fim: null, p_contagens: [], p_sugestoes: [],
        })).error,
      ).not.toBeNull();

      const buffer = readFileSync(ARQUIVO_REAL);
      const leitura = parseContagensAcompanhadas(
        lerPrimeiraAba(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
      );
      const sugestoes = [...calcularSugestoes(leitura.contagens).values()].map((s) => ({ marca: s.marca, status: s.status }));

      const inicio = Date.now();
      const r = await gestor.rpc('importar_contagens', {
        p_loja_id: lojaId,
        p_arquivo_nome: 'contagens_acompanhadas 2026 9.ods',
        p_periodo_inicio: leitura.periodoInicio,
        p_periodo_fim: leitura.periodoFim,
        p_contagens: leitura.contagens,
        p_sugestoes: sugestoes,
      });
      console.log(`importar_contagens: ${Date.now() - inicio} ms`, r.data);
      expect(r.error).toBeNull();
      expect(r.data.auditoria_id).toBe(auditoriaId);

      const itens = await gestor
        .from('contagens_santri_itens')
        .select('id, contagem:contagens_santri!inner(importacao_id)', { count: 'exact' })
        .eq('contagem.importacao_id', r.data.importacao_id)
        .limit(1);
      expect(itens.error).toBeNull();
      expect(itens.count).toBe(leitura.contagens.reduce((t, c) => t + c.itens.length, 0));

      const depois = await audA.from('auditoria_marcas').select('marca_nome, status, status_origem').eq('auditoria_id', auditoriaId);
      const porNome = Object.fromEntries(depois.data!.map((m) => [m.marca_nome, m]));
      expect(porNome.HEVVY).toMatchObject({ status: 'concluida', status_origem: 'sugerido_importacao' });
      expect(porNome['MARCA SEM CONTAGEM']).toMatchObject({ status: 'pendente' });

      // Sugestão "parcial" não derruba uma marca já concluída.
      const r2 = await gestor.rpc('importar_contagens', {
        p_loja_id: lojaId, p_arquivo_nome: 'reimport.ods', p_periodo_inicio: null, p_periodo_fim: null,
        p_contagens: leitura.contagens.slice(0, 1), p_sugestoes: [{ marca: 'HEVVY', status: 'parcial' }],
      });
      expect(r2.data.sugestoes_aplicadas).toBe(0);
    },
    120_000,
  );

  it('finaliza e trava alterações', async () => {
    expect((await audA.rpc('finalizar_auditoria', { p_auditoria_id: auditoriaId })).error).toBeNull();
    const hevvy = marcas.find((m) => m.marca_nome === 'HEVVY')!;
    const r = await audA.rpc('atualizar_status_marca', { p_auditoria_marca_id: hevvy.id, p_status: 'pendente', p_observacao: null });
    expect(r.error?.message).toMatch(/encerrada/);
    const resumo = await audA.from('auditorias_resumo').select('status, total_marcas').eq('id', auditoriaId).single();
    expect(resumo.data).toMatchObject({ status: 'concluida', total_marcas: 5 });
  });
});
