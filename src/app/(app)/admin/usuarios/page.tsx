import { CampoSenha } from '@/components/CampoSenha';
import { BotaoEnviar, FormServidor } from '@/components/FormServidor';
import { Alerta, Cabecalho, Campo, Cartao, Rotulo, Selecao } from '@/components/ui';
import { exigirPerfil } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ROTULO_PERFIL, type Perfil, type Profile } from '@/lib/tipos';
import { emailsPorUsuario } from '@/lib/usuarios';
import { criarNovoUsuario, redefinirSenhaUsuario, salvarUsuario } from '../actions';

const PERFIS = Object.keys(ROTULO_PERFIL) as Perfil[];

function OpcoesPerfil() {
  return PERFIS.map((p) => (
    <option key={p} value={p}>
      {ROTULO_PERFIL[p]}
    </option>
  ));
}

export default async function UsuariosPage() {
  const { user, supabase } = await exigirPerfil('administrador');
  const { data } = await supabase.from('profiles').select('id, nome, perfil, ativo').order('nome').returns<Profile[]>();

  let emails = new Map<string, string>();
  let erroChave: string | null = null;
  try {
    emails = await emailsPorUsuario(createAdminClient());
  } catch (e) {
    erroChave = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <Cabecalho titulo="Usuários" descricao="Crie os acessos da equipe e defina o nível de cada pessoa." />

      <Cartao className="mb-6 text-sm text-muted">
        <strong className="text-fg">Auditor</strong> vê e altera só as próprias auditorias.{' '}
        <strong className="text-fg">Gestor</strong> vê todas e importa contagens.{' '}
        <strong className="text-fg">Administrador</strong> faz tudo, inclusive cadastros, usuários e importação de marcas.
      </Cartao>

      {erroChave ? (
        <div className="mb-6">
          <Alerta tipo="aviso">Não é possível criar usuários agora: {erroChave}</Alerta>
        </div>
      ) : (
        <Cartao className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Novo usuário</h2>
          <FormServidor acao={criarNovoUsuario} limparAoSalvar className="grid gap-4 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="novo-nome">Nome</Rotulo>
              <Campo id="novo-nome" name="nome" required maxLength={120} autoComplete="off" placeholder="Ex.: Gil Souza" />
            </div>
            <div>
              <Rotulo htmlFor="novo-email">E-mail (login)</Rotulo>
              <Campo id="novo-email" name="email" type="email" required autoComplete="off" placeholder="gil@empresa.com.br" />
            </div>
            <CampoSenha rotulo="Senha inicial" />
            <div>
              <Rotulo htmlFor="novo-perfil">Nível de acesso</Rotulo>
              <Selecao id="novo-perfil" name="perfil" defaultValue="auditor">
                <OpcoesPerfil />
              </Selecao>
            </div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <p className="text-xs text-muted">
                O sistema não envia e-mail: repasse o login e a senha para a pessoa.
              </p>
              <BotaoEnviar>Criar usuário</BotaoEnviar>
            </div>
          </FormServidor>
        </Cartao>
      )}

      <h2 className="mb-3 text-lg font-semibold">Equipe</h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {(data ?? []).map((u) => {
          const voce = u.id === user.id;
          return (
            <li key={u.id} className={u.ativo ? 'px-4 py-3' : 'px-4 py-3 opacity-70'}>
              <FormServidor acao={salvarUsuario} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={u.id} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-semibold">
                    {u.nome}
                    {voce && <span className="ml-2 text-xs font-normal text-muted">(você)</span>}
                    {!u.ativo && <span className="ml-2 text-xs font-normal texto-perigo">desativado</span>}
                  </p>
                  {emails.get(u.id) && <p className="truncate text-xs text-muted">{emails.get(u.id)}</p>}
                </div>
                <Selecao
                  name="perfil"
                  defaultValue={u.perfil}
                  className="w-auto"
                  aria-label={`Nível de ${u.nome}`}
                  disabled={voce}
                >
                  <OpcoesPerfil />
                </Selecao>
                {voce && <input type="hidden" name="perfil" value={u.perfil} />}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="ativo"
                    defaultChecked={u.ativo}
                    disabled={voce}
                    className="h-4 w-4 accent-[rgb(var(--brand-primary))]"
                  />
                  Ativo
                </label>
                {voce && <input type="hidden" name="ativo" value="on" />}
                {!voce && <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>}
              </FormServidor>

              {!erroChave && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-fg">Redefinir senha</summary>
                  <FormServidor acao={redefinirSenhaUsuario} limparAoSalvar className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <div className="min-w-0 flex-1 basis-64">
                      <CampoSenha />
                    </div>
                    <BotaoEnviar variante="secundario">Salvar senha</BotaoEnviar>
                  </FormServidor>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
