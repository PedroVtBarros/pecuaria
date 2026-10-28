import Database from 'better-sqlite3';

export type Conexao = Database.Database;

/**
 * Identificador gravado no cabeçalho do arquivo SQLite (PRAGMA application_id).
 * Permite recusar arquivos SQLite que não pertencem a este aplicativo,
 * por exemplo ao restaurar um backup escolhido pelo usuário.
 * Valor: bytes ASCII de "PECU".
 */
export const ID_APLICACAO = 0x50454355;

export interface OpcoesConexao {
  somenteLeitura?: boolean;
  deveExistir?: boolean;
}

/**
 * Abre uma conexão com os pragmas obrigatórios do projeto
 * (ver BANCO_DE_DADOS.md, seção 1).
 */
export function abrirConexao(caminho: string, opcoes: OpcoesConexao = {}): Conexao {
  const db = new Database(caminho, {
    readonly: opcoes.somenteLeitura ?? false,
    fileMustExist: opcoes.deveExistir ?? false,
  });
  try {
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    if (!opcoes.somenteLeitura) {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
    }
    return db;
  } catch (erro) {
    db.close();
    throw erro;
  }
}

export function lerIdAplicacao(db: Conexao): number {
  return Number(db.pragma('application_id', { simple: true }));
}

export function lerVersaoSchema(db: Conexao): number {
  return Number(db.pragma('user_version', { simple: true }));
}

export function versaoSqlite(db: Conexao): string {
  const linha = db.prepare('SELECT sqlite_version() AS versao').get() as { versao: string };
  return linha.versao;
}
