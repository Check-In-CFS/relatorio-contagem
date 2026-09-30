'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

export type ItemNav = { href: string; rotulo: string };

export function Navegacao({ itens }: { itens: ItemNav[] }) {
  const caminho = usePathname();
  const ativo = (href: string) => (href === '/' ? caminho === '/' : caminho.startsWith(href));
  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label="Principal">
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={ativo(item.href) ? 'page' : undefined}
          className={cx(
            'whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-150',
            ativo(item.href) ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-bg hover:text-fg',
          )}
        >
          {item.rotulo}
        </Link>
      ))}
    </nav>
  );
}
