import type { Conexao } from '../conexao';

export type ObterConexao = () => Conexao;

/** Erro de índice único do SQLite (ex.: identificação duplicada). */
export function ehErroDeUnicidade(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

/** Escapa curingas do LIKE para buscar o texto literal digitado. */
export function padraoLike(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function comoBooleano(valor: number): boolean {
  return valor === 1;
}

export function referencia(
  id: string | null,
  nome: string | null,
): { id: string; nome: string } | null {
  return id && nome !== null ? { id, nome } : null;
}
