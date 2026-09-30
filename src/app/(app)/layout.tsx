import Image from 'next/image';
import Link from 'next/link';
import { AlternarTema } from '@/components/AlternarTema';
import { Navegacao, type ItemNav } from '@/components/Navegacao';
import { exigirSessao, podeImportarContagens } from '@/lib/auth';
import { ROTULO_PERFIL } from '@/lib/tipos';
import { sair } from '../login/actions';

export default async function LayoutAutenticado({ children }: { children: React.ReactNode }) {
  const { profile } = await exigirSessao();

  const itens: ItemNav[] = [
    { href: '/', rotulo: 'Painel' },
    { href: '/auditorias', rotulo: 'Auditorias' },
  ];
  if (podeImportarContagens(profile.perfil)) itens.push({ href: '/admin', rotulo: 'Administração' });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={32} height={32} priority className="h-8 w-8" />
            <span className="hidden font-display font-bold sm:inline">Auditoria de Estoque</span>
            <span className="sr-only sm:hidden">Auditoria de Estoque — início</span>
          </Link>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <Navegacao itens={itens} />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <div className="mr-2 text-right leading-tight">
              <p className="text-sm font-semibold">{profile.nome}</p>
              <p className="text-xs text-muted">{ROTULO_PERFIL[profile.perfil]}</p>
            </div>
            <AlternarTema />
            <form action={sair}>
              <button
                type="submit"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-muted transition-colors duration-150 hover:bg-bg hover:text-fg"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
