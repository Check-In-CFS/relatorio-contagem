'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { falha, mensagemDeValidacao, mensagemDoBanco, sucesso, type Resultado } from '@/lib/acoes';
import { exigirPerfil } from '@/lib/auth';
import { STATUS_CONTAGEM } from '@/lib/parsers/contagens';
import { calcularSugestoes } from '@/lib/sugestao';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROTULO_PERFIL } from '@/lib/tipos';
import { criarUsuario, redefinirSenha, sincronizarBloqueio } from '@/lib/usuarios';

export type EstadoForm = Resultado<string> | null;

const uuid = z.string().uuid('Identificador inválido.');
const idOpcional = z.preprocess((v) => (v === '' || v === null ? undefined : v), uuid.optional());
const textoObrigatorio = (campo: string, max = 120) =>
  z.string().trim().min(1, `Informe ${campo}.`).max(max, `${campo} pode ter no máximo ${max} caracteres.`);
const checkbox = z.preprocess((v) => v === 'on' || v === 'true', z.boolean());

// ---------------------------------------------------------------- Empresas

const esquemaEmpresa = z.object({ id: idOpcional, nome: textoObrigatorio('o nome'), ativo: checkbox });

export async function salvarEmpresa(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const dados = esquemaEmpresa.safeParse({
    id: form.get('id'),
    nome: form.get('nome'),
    ativo: form.get('ativo') ?? (form.get('id') ? 'false' : 'true'),
  });
  if (!dados.success) return falha(mensagemDeValidacao(dados.error));

  const { supabase } = await exigirPerfil('administrador');
  const { id, ...campos } = dados.data;
  const { error } = id
    ? await supabase.from('empresas').update(campos).eq('id', id)
    : await supabase.from('empresas').insert(campos);
  if (error) return falha(mensagemDoBanco(error));

  revalidatePath('/admin/empresas');
  return sucesso(id ? 'Empresa atualizada.' : 'Empresa cadastrada.');
}

// ------------------------------------------------------------------- Lojas

const esquemaLoja = z.object({
  id: idOpcional,
  empresa_id: uuid,
  nome: textoObrigatorio('o nome'),
  codigo_interno: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(30, 'O código pode ter no máximo 30 caracteres.').nullable(),
  ),
  ativo: checkbox,
});

export async function salvarLoja(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const dados = esquemaLoja.safeParse({
    id: form.get('id'),
    empresa_id: form.get('empresa_id'),
    nome: form.get('nome'),
    codigo_interno: form.get('codigo_interno'),
    ativo: form.get('ativo') ?? (form.get('id') ? 'false' : 'true'),
  });
  if (!dados.success) return falha(mensagemDeValidacao(dados.error));

  const { supabase } = await exigirPerfil('administrador');
  const { id, ...campos } = dados.data;
  const { error } = id
    ? await supabase.from('lojas').update(campos).eq('id', id)
    : await supabase.from('lojas').insert(campos);
  if (error) return falha(mensagemDoBanco(error));

  revalidatePath('/admin/lojas');
  return sucesso(id ? 'Loja atualizada.' : 'Loja cadastrada.');
}

// ---------------------------------------------------------------- Usuários

const esquemaUsuario = z.object({
  id: uuid,
  perfil: z.enum(['auditor', 'gestor', 'administrador']),
  ativo: checkbox,
});

export async function salvarUsuario(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const dados = esquemaUsuario.safeParse({
    id: form.get('id'),
    perfil: form.get('perfil'),
    ativo: form.get('ativo') ?? 'false',
  });
  if (!dados.success) return falha(mensagemDeValidacao(dados.error));

  const { user, supabase } = await exigirPerfil('administrador');
  if (dados.data.id === user.id && (dados.data.perfil !== 'administrador' || !dados.data.ativo)) {
    return falha('Você não pode rebaixar ou desativar o próprio usuário.');
  }

  const { id, ...campos } = dados.data;
  const { data: anterior } = await supabase.from('profiles').select('ativo').eq('id', id).single<{ ativo: boolean }>();
  const { data: alterados, error } = await supabase.from('profiles').update(campos).eq('id', id).select('id');
  if (error) return falha(mensagemDoBanco(error));
  if (!alterados?.length) return falha('Usuário não encontrado ou sem permissão para alterá-lo.');

  if (anterior && anterior.ativo !== campos.ativo) {
    const bloqueio = await sincronizarBloqueio(createAdminClient(), id, campos.ativo);
    if (!bloqueio.ok) return falha(`Perfil salvo, mas o login não foi ${campos.ativo ? 'liberado' : 'bloqueado'}: ${bloqueio.erro}`);
  }

  revalidatePath('/admin/usuarios');
  return sucesso(campos.ativo || anterior?.ativo === false ? 'Usuário atualizado.' : 'Usuário desativado: o login dele foi bloqueado.');
}

const senha = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(72, 'A senha pode ter no máximo 72 caracteres.');

const esquemaNovoUsuario = z.object({
  nome: textoObrigatorio('o nome', 120),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.'),
  senha,
  perfil: z.enum(['auditor', 'gestor', 'administrador']),
});

export async function criarNovoUsuario(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const dados = esquemaNovoUsuario.safeParse({
    nome: form.get('nome'),
    email: form.get('email'),
    senha: form.get('senha'),
    perfil: form.get('perfil'),
  });
  if (!dados.success) return falha(mensagemDeValidacao(dados.error));

  // Confere o perfil ANTES de tocar na chave de serviço.
  const { supabase } = await exigirPerfil('administrador');
  const r = await criarUsuario(createAdminClient(), supabase, dados.data);
  if (!r.ok) return falha(r.erro);

  revalidatePath('/admin/usuarios');
  return sucesso(`Usuário ${dados.data.email} criado como ${ROTULO_PERFIL[dados.data.perfil]}. Repasse a senha para ele.`);
}

const esquemaSenha = z.object({ id: uuid, senha });

export async function redefinirSenhaUsuario(_anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const dados = esquemaSenha.safeParse({ id: form.get('id'), senha: form.get('senha') });
  if (!dados.success) return falha(mensagemDeValidacao(dados.error));

  await exigirPerfil('administrador');
  const r = await redefinirSenha(createAdminClient(), dados.data.id, dados.data.senha);
  if (!r.ok) return falha(r.erro);
  return sucesso('Senha redefinida. Repasse a nova senha para o usuário.');
}

// ------------------------------------------------------ Importar marcas

const esquemaImportacaoMarcas = z.object({
  empresaId: uuid,
  arquivoNome: textoObrigatorio('o nome do arquivo', 255),
  marcas: z
    .array(z.object({ codigo: z.number().int().positive(), nome: z.string().trim().min(1).max(200) }))
    .min(1, 'O arquivo não tem nenhuma marca.')
    .max(20_000, 'Arquivo grande demais para um relatório de marcas.')
    .refine((l) => new Set(l.map((m) => m.codigo)).size === l.length, 'Há códigos de marca repetidos.'),
});

export type TotaisImportacaoMarcas = { lidas: number; novas: number; reativadas: number; desativadas: number };

export async function importarMarcas(
  entrada: z.input<typeof esquemaImportacaoMarcas>,
): Promise<Resultado<TotaisImportacaoMarcas>> {
  const dados = esquemaImportacaoMarcas.safeParse(entrada);
  if (!dados.success) return falha(mensagemDeValidacao(dados.error));

  const { supabase } = await exigirPerfil('administrador');
  const { data, error } = await supabase.rpc('importar_marcas', {
    p_empresa_id: dados.data.empresaId,
    p_arquivo_nome: dados.data.arquivoNome,
    p_marcas: dados.data.marcas,
  });
  if (error) return falha(mensagemDoBanco(error));

  revalidatePath('/admin/marcas');
  return sucesso(data as TotaisImportacaoMarcas);
}

// --------------------------------------------------- Importar contagens

const numeroOuNulo = z.number().finite().nullable();
const dataIso = z.string().datetime({ offset: true }).nullable();

const esquemaImportacaoContagens = z.object({
  lojaId: uuid,
  arquivoNome: textoObrigatorio('o nome do arquivo', 255),
  periodoInicio: z.string().date().nullable(),
  periodoFim: z.string().date().nullable(),
  contagens: z
    .array(
      z.object({
        numero: z.number().int().positive(),
        status: z.enum(STATUS_CONTAGEM),
        local: z.string().max(200).nullable(),
        usuario: z.string().max(200).nullable(),
        data_insercao: dataIso,
        data_baixa: dataIso,
        itens: z
          .array(
            z.object({
              marca: z.string().trim().min(1).max(200),
              produto_codigo: z.string().max(60).nullable(),
              produto_nome: z.string().max(300).nullable(),
              estoque_fisico: numeroOuNulo,
              qtd_contada: numeroOuNulo,
              diferenca: numeroOuNulo,
            }),
          )
          .max(5_000),
      }),
    )
    .min(1, 'O arquivo não tem nenhuma contagem.')
    .max(20_000)
    .refine((l) => new Set(l.map((c) => c.numero)).size === l.length, 'Há contagens repetidas.'),
});

export type ResultadoImportacaoContagens = { importacao_id: string; auditoria_id: string | null; sugestoes_aplicadas: number };

export async function importarContagens(
  entrada: z.input<typeof esquemaImportacaoContagens>,
): Promise<Resultado<ResultadoImportacaoContagens>> {
  const dados = esquemaImportacaoContagens.safeParse(entrada);
  if (!dados.success) return falha(mensagemDeValidacao(dados.error));

  const { supabase } = await exigirPerfil('gestor', 'administrador');

  // As sugestões são recalculadas aqui, no servidor, a partir dos dados
  // validados — nunca aceitas prontas do navegador.
  const sugestoes = [...calcularSugestoes(dados.data.contagens).values()].map((s) => ({
    marca: s.marca,
    status: s.status,
  }));

  const { data, error } = await supabase.rpc('importar_contagens', {
    p_loja_id: dados.data.lojaId,
    p_arquivo_nome: dados.data.arquivoNome,
    p_periodo_inicio: dados.data.periodoInicio,
    p_periodo_fim: dados.data.periodoFim,
    p_contagens: dados.data.contagens,
    p_sugestoes: sugestoes,
  });
  if (error) return falha(mensagemDoBanco(error));

  const resultado = data as ResultadoImportacaoContagens;
  revalidatePath('/admin/contagens');
  revalidatePath('/');
  if (resultado.auditoria_id) revalidatePath(`/auditorias/${resultado.auditoria_id}`);
  return sucesso(resultado);
}
