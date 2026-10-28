import type { MigracaoAplicada } from '@pecuaria/shared-types';
import { lerVersaoSchema, type Conexao } from '../conexao';
import { normalizarQuebrasDeLinha, sha256Texto } from '../util';

export interface Migracao {
  versao: number;
  nome: string;
  sql: string;
}

export interface EstadoAntesDeMigrar {
  versaoAtual: number;
  pendentes: Migracao[];
}

export interface OpcoesMigracao {
  /** Executado uma vez, antes da primeira migration pendente. Usado para backup. */
  antesDeMigrar?: (estado: EstadoAntesDeMigrar) => Promise<void> | void;
  relogio?: () => Date;
}

export interface ResultadoMigracao {
  versaoAnterior: number;
  versaoAtual: number;
  aplicadas: MigracaoAplicada[];
}

export class ErroMigracao extends Error {
  constructor(mensagem: string, opcoes?: { cause?: unknown }) {
    super(mensagem, opcoes);
    this.name = 'ErroMigracao';
  }
}

const PADRAO_NOME_ARQUIVO = /^(\d{4})_([a-z0-9_]+)\.sql$/;
/**
 * Comandos de controle de transação proibidos dentro de uma migration.
 * O corpo de gatilhos (CREATE TRIGGER ... BEGIN ... END;) é permitido: "BEGIN"
 * no fim da linha do gatilho e "END;" sozinho não casam com este padrão.
 * "END TRANSACTION" e "BEGIN;" / "BEGIN TRANSACTION" / "BEGIN IMMEDIATE" casam.
 */
const PADRAO_CONTROLE_TRANSACAO =
  /^\s*(BEGIN\s*(;|TRANSACTION\b|DEFERRED\b|IMMEDIATE\b|EXCLUSIVE\b)|COMMIT\b|END\s+TRANSACTION\b|ROLLBACK\b|SAVEPOINT\b|RELEASE\b)/im;

/** Converte o mapa {caminho: sql} vindo do bundler em lista ordenada e validada. */
export function montarMigracoes(arquivos: Record<string, string>): Migracao[] {
  const migracoes = Object.entries(arquivos).map(([caminho, sql]) => {
    const nomeArquivo = caminho.split(/[\\/]/).pop() ?? caminho;
    const partes = PADRAO_NOME_ARQUIVO.exec(nomeArquivo);
    if (!partes?.[1] || !partes[2]) {
      throw new ErroMigracao(
        `Nome de migration inválido: "${nomeArquivo}". Use o padrão 0001_descricao.sql.`,
      );
    }
    return { versao: Number(partes[1]), nome: partes[2], sql: normalizarQuebrasDeLinha(sql) };
  });
  migracoes.sort((a, b) => a.versao - b.versao);
  validarMigracoes(migracoes);
  return migracoes;
}

export function validarMigracoes(migracoes: readonly Migracao[]): void {
  migracoes.forEach((migracao, indice) => {
    const esperada = indice + 1;
    if (migracao.versao !== esperada) {
      throw new ErroMigracao(
        `Sequência de migrations quebrada: esperada a versão ${esperada}, encontrada ${migracao.versao}.`,
      );
    }
    if (migracao.sql.trim().length === 0) {
      throw new ErroMigracao(`A migration ${migracao.versao} está vazia.`);
    }
    if (PADRAO_CONTROLE_TRANSACAO.test(migracao.sql)) {
      throw new ErroMigracao(
        `A migration ${migracao.versao} contém controle de transação. O migrador já usa uma transação por arquivo.`,
      );
    }
  });
}

export function checksumMigracao(migracao: Migracao): string {
  return sha256Texto(normalizarQuebrasDeLinha(migracao.sql));
}

function garantirTabelaControle(db: Conexao): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migracoes (
      versao INTEGER PRIMARY KEY NOT NULL,
      nome TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      aplicada_em TEXT NOT NULL
    ) STRICT;
  `);
}

interface LinhaMigracao {
  versao: number;
  nome: string;
  checksum_sha256: string;
  aplicada_em: string;
}

export function listarMigracoesAplicadas(db: Conexao): MigracaoAplicada[] {
  const existe = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_migracoes'")
    .get();
  if (!existe) return [];
  const linhas = db
    .prepare('SELECT versao, nome, checksum_sha256, aplicada_em FROM _migracoes ORDER BY versao')
    .all() as LinhaMigracao[];
  return linhas.map((l) => ({ versao: l.versao, nome: l.nome, aplicadaEm: l.aplicada_em }));
}

/**
 * Aplica as migrations pendentes, uma transação por arquivo.
 *
 * Garantias:
 * - Rodar de novo sem migrations pendentes não altera nada.
 * - Migration já aplicada que foi editada depois é detectada pelo checksum.
 * - Banco de versão mais nova que o aplicativo é recusado.
 * - Falha em uma migration desfaz apenas aquela migration e interrompe o processo.
 */
export async function aplicarMigracoes(
  db: Conexao,
  migracoes: readonly Migracao[],
  opcoes: OpcoesMigracao = {},
): Promise<ResultadoMigracao> {
  validarMigracoes(migracoes);
  const relogio = opcoes.relogio ?? (() => new Date());

  garantirTabelaControle(db);
  const versaoAnterior = lerVersaoSchema(db);
  const versaoMaxima = migracoes.at(-1)?.versao ?? 0;

  if (versaoAnterior > versaoMaxima) {
    throw new ErroMigracao(
      `O banco de dados está na versão ${versaoAnterior}, mais nova que a suportada por este aplicativo (${versaoMaxima}). Atualize o aplicativo.`,
    );
  }

  const registradas = db
    .prepare('SELECT versao, nome, checksum_sha256, aplicada_em FROM _migracoes ORDER BY versao')
    .all() as LinhaMigracao[];

  if (registradas.length !== versaoAnterior) {
    throw new ErroMigracao(
      `Controle de migrations inconsistente: versão ${versaoAnterior} no cabeçalho, ${registradas.length} registros em _migracoes.`,
    );
  }

  for (const registro of registradas) {
    const migracao = migracoes[registro.versao - 1];
    if (!migracao || migracao.versao !== registro.versao) {
      throw new ErroMigracao(
        `Migration ${registro.versao} registrada no banco não existe no aplicativo.`,
      );
    }
    if (checksumMigracao(migracao) !== registro.checksum_sha256) {
      throw new ErroMigracao(
        `A migration ${registro.versao}_${registro.nome} foi alterada depois de aplicada. Migrations são imutáveis: crie uma nova migration.`,
      );
    }
  }

  const pendentes = migracoes.filter((m) => m.versao > versaoAnterior);
  if (pendentes.length === 0) {
    return { versaoAnterior, versaoAtual: versaoAnterior, aplicadas: [] };
  }

  await opcoes.antesDeMigrar?.({ versaoAtual: versaoAnterior, pendentes });

  const inserir = db.prepare(
    'INSERT INTO _migracoes (versao, nome, checksum_sha256, aplicada_em) VALUES (?, ?, ?, ?)',
  );
  const aplicadas: MigracaoAplicada[] = [];

  for (const migracao of pendentes) {
    const aplicadaEm = relogio().toISOString();
    const aplicar = db.transaction(() => {
      db.exec(migracao.sql);
      inserir.run(migracao.versao, migracao.nome, checksumMigracao(migracao), aplicadaEm);
      db.pragma(`user_version = ${migracao.versao}`);
    });
    try {
      aplicar();
    } catch (erro) {
      throw new ErroMigracao(
        `Falha ao aplicar a migration ${migracao.versao}_${migracao.nome}. Nenhuma alteração dessa migration foi mantida.`,
        { cause: erro },
      );
    }
    aplicadas.push({ versao: migracao.versao, nome: migracao.nome, aplicadaEm });
  }

  return { versaoAnterior, versaoAtual: lerVersaoSchema(db), aplicadas };
}
