import Link from 'next/link';
import { Cabecalho } from '@/components/ui';
import { exigirSessao, podeAdministrar } from '@/lib/auth';

const SECOES = [
  { href: '/admin/empresas', titulo: 'Empresas', descricao: 'Grupos e empresas auditadas.', soAdmin: true },
  { href: '/admin/lojas', titulo: 'Lojas', descricao: 'Lojas de cada empresa.', soAdmin: true },
  { href: '/admin/usuarios', titulo: 'Usuários', descricao: 'Perfil de acesso de cada pessoa.', soAdmin: true },
  { href: '/admin/marcas', titulo: 'Importar marcas', descricao: 'Relação de Produtos por Marca do Santri.', soAdmin: true },
  {
    href: '/admin/contagens',
    titulo: 'Importar contagens',
    descricao: 'Ordens de Contagens Acompanhadas do Santri — sugere status na auditoria em andamento.',
    soAdmin: false,
  },
];

export default async function AdminPage() {
  const { profile } = await exigirSessao();
  const secoes = SECOES.filter((s) => !s.soAdmin || podeAdministrar(profile.perfil));

  return (
    <>
      <Cabecalho titulo="Administração" />
      <div className="grid gap-3 sm:grid-cols-2">
        {secoes.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-line bg-card p-5 shadow-sm transition-colors duration-150 hover:border-primary/50"
          >
            <p className="font-display text-lg font-semibold">{s.titulo}</p>
            <p className="mt-1 text-sm text-muted">{s.descricao}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
