'use client';

import { useId } from 'react';
import { Rotulo } from './ui';

export function SeletorArquivo({
  rotulo,
  desabilitado,
  onArquivo,
}: {
  rotulo: string;
  desabilitado?: boolean;
  onArquivo: (arquivo: File) => void;
}) {
  const id = useId();
  return (
    <div>
      <Rotulo htmlFor={id}>{rotulo}</Rotulo>
      <input
        id={id}
        type="file"
        accept=".ods,.xlsx,.xls"
        disabled={desabilitado}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) onArquivo(arquivo);
          e.target.value = '';
        }}
        className="block w-full rounded-xl border border-dashed border-line bg-card px-3.5 py-3 text-sm text-muted file:mr-4 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:border-primary/50 disabled:opacity-50"
      />
    </div>
  );
}

/** Lê o arquivo no navegador; o SheetJS só é baixado quando necessário. */
export async function lerLinhasDoArquivo(arquivo: File) {
  const { lerPrimeiraAba } = await import('@/lib/parsers/planilha');
  return lerPrimeiraAba(await arquivo.arrayBuffer());
}
