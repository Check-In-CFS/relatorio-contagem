import type { PostgrestError } from '@supabase/supabase-js';

const TAMANHO_PAGINA = 1000; // limite padrão de linhas por resposta do PostgREST

type Pagina<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/**
 * Busca todas as linhas de uma consulta, página por página. A consulta precisa
 * ter ordenação estável (ex.: por id ou nome + id).
 */
export async function buscarTodas<T>(consulta: (de: number, ate: number) => Pagina<T>): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await consulta(de, de + TAMANHO_PAGINA - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < TAMANHO_PAGINA) return linhas;
  }
}
