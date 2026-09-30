import { BotaoEnviar, FormServidor } from '@/components/FormServidor';
import { Cabecalho, Campo, Cartao, Rotulo, Vazio } from '@/components/ui';
import { exigirPerfil } from '@/lib/auth';
import type { Empresa } from '@/lib/tipos';
import { salvarEmpresa } from '../actions';

export default async function EmpresasPage() {
  const { supabase } = await exigirPerfil('administrador');
  const { data } = await supabase.from('empresas').select('id, nome, ativo').order('nome').returns<Empresa[]>();
  const empresas = data ?? [];

  return (
    <>
      <Cabecalho titulo="Empresas" descricao="Ex.: Castelo Forte (CFS), Capital." />

      <Cartao className="mb-6">
        <FormServidor acao={salvarEmpresa} limparAoSalvar className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <Rotulo htmlFor="nova-empresa">Nova empresa</Rotulo>
            <Campo id="nova-empresa" name="nome" placeholder="Nome da empresa" required maxLength={120} />
          </div>
          <BotaoEnviar>Cadastrar</BotaoEnviar>
        </FormServidor>
      </Cartao>

      {empresas.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {empresas.map((e) => (
            <li key={e.id} className="px-4 py-3">
              <FormServidor acao={salvarEmpresa} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="id" value={e.id} />
                <Campo name="nome" defaultValue={e.nome} required maxLength={120} className="min-w-0 flex-1 basis-48" aria-label="Nome" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="ativo" defaultChecked={e.ativo} className="h-4 w-4 accent-[rgb(var(--brand-primary))]" />
                  Ativa
                </label>
                <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
              </FormServidor>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio titulo="Nenhuma empresa ainda" descricao="Cadastre a primeira empresa acima para depois criar as lojas." />
      )}
    </>
  );
}
