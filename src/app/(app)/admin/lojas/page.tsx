import { BotaoEnviar, FormServidor } from '@/components/FormServidor';
import { BotaoLink, Cabecalho, Campo, Cartao, Rotulo, Selecao, Vazio } from '@/components/ui';
import { exigirPerfil } from '@/lib/auth';
import type { Empresa, Loja } from '@/lib/tipos';
import { salvarLoja } from '../actions';

export default async function LojasPage() {
  const { supabase } = await exigirPerfil('administrador');
  const [empresas, lojas] = await Promise.all([
    supabase.from('empresas').select('id, nome, ativo').order('nome').returns<Empresa[]>(),
    supabase.from('lojas').select('id, empresa_id, nome, codigo_interno, ativo').order('nome').returns<Loja[]>(),
  ]);
  const listaEmpresas = empresas.data ?? [];
  const empresasAtivas = listaEmpresas.filter((e) => e.ativo);

  if (!empresasAtivas.length) {
    return (
      <>
        <Cabecalho titulo="Lojas" />
        <Vazio
          titulo="Cadastre uma empresa primeiro"
          descricao="Toda loja pertence a uma empresa."
          acao={<BotaoLink href="/admin/empresas">Ir para Empresas</BotaoLink>}
        />
      </>
    );
  }

  return (
    <>
      <Cabecalho titulo="Lojas" descricao="Cada auditoria é feita em uma loja." />

      <Cartao className="mb-6">
        <FormServidor acao={salvarLoja} limparAoSalvar className="flex flex-wrap items-end gap-3">
          <div className="basis-48">
            <Rotulo htmlFor="empresa">Empresa</Rotulo>
            <Selecao id="empresa" name="empresa_id" required defaultValue={empresasAtivas.length === 1 ? empresasAtivas[0].id : ''}>
              <option value="">Selecione…</option>
              {empresasAtivas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </Selecao>
          </div>
          <div className="min-w-0 flex-1 basis-48">
            <Rotulo htmlFor="nome">Nome da loja</Rotulo>
            <Campo id="nome" name="nome" required maxLength={120} />
          </div>
          <div className="basis-32">
            <Rotulo htmlFor="codigo">Código interno</Rotulo>
            <Campo id="codigo" name="codigo_interno" maxLength={30} placeholder="Opcional" />
          </div>
          <BotaoEnviar>Cadastrar</BotaoEnviar>
        </FormServidor>
      </Cartao>

      {lojas.data?.length ? (
        <div className="space-y-6">
          {listaEmpresas.map((empresa) => {
            const daEmpresa = lojas.data!.filter((l) => l.empresa_id === empresa.id);
            if (!daEmpresa.length) return null;
            return (
              <section key={empresa.id}>
                <h2 className="mb-2 text-sm font-semibold text-muted">{empresa.nome}</h2>
                <ul className="divide-y divide-line rounded-xl border border-line bg-card">
                  {daEmpresa.map((l) => (
                    <li key={l.id} className="px-4 py-3">
                      <FormServidor acao={salvarLoja} className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="empresa_id" value={l.empresa_id} />
                        <Campo name="nome" defaultValue={l.nome} required maxLength={120} className="min-w-0 flex-1 basis-40" aria-label="Nome" />
                        <Campo
                          name="codigo_interno"
                          defaultValue={l.codigo_interno ?? ''}
                          maxLength={30}
                          className="basis-28 font-mono"
                          aria-label="Código interno"
                          placeholder="Código"
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="ativo" defaultChecked={l.ativo} className="h-4 w-4 accent-[rgb(var(--brand-primary))]" />
                          Ativa
                        </label>
                        <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
                      </FormServidor>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Vazio titulo="Nenhuma loja ainda" descricao="Cadastre a primeira loja acima." />
      )}
    </>
  );
}
