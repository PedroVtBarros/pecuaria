import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GerenciadorBanco } from '../src/gerenciador-banco';
import type { ContextoLog, Logger } from '../src/logger';
import type { Migracao } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { ServicoBackup } from '../src/backup/servico-backup';

export function criarPastaTemporaria(): { caminho: string; limpar: () => void } {
  const caminho = mkdtempSync(join(tmpdir(), 'pecuaria-teste-'));
  return { caminho, limpar: () => rmSync(caminho, { recursive: true, force: true }) };
}

export interface RegistroLog {
  nivel: keyof Logger;
  mensagem: string;
  contexto?: ContextoLog | undefined;
}

export function criarLoggerColetor(): Logger & { registros: RegistroLog[] } {
  const registros: RegistroLog[] = [];
  const registrar =
    (nivel: keyof Logger) =>
    (mensagem: string, contexto?: ContextoLog): void => {
      registros.push({ nivel, mensagem, contexto });
    };
  return {
    registros,
    debug: registrar('debug'),
    info: registrar('info'),
    aviso: registrar('aviso'),
    erro: registrar('erro'),
  };
}

/** Relógio controlado pelo teste. */
export function criarRelogio(inicial: Date): {
  relogio: () => Date;
  avancar: (ms: number) => void;
  definir: (d: Date) => void;
} {
  let atual = new Date(inicial);
  return {
    relogio: () => new Date(atual),
    avancar: (ms) => {
      atual = new Date(atual.getTime() + ms);
    },
    definir: (d) => {
      atual = new Date(d);
    },
  };
}

/** Migration fictícia, só para testar evolução de schema além da versão atual do projeto. */
export const MIGRACAO_TESTE_EXTRA: Migracao = {
  versao: MIGRACOES_DO_PROJETO.length + 1,
  nome: 'teste_extra',
  sql: 'CREATE TABLE teste_extra (id INTEGER PRIMARY KEY, texto TEXT NOT NULL) STRICT;',
};

export interface Ambiente {
  pasta: string;
  gerenciador: GerenciadorBanco;
  backup: ServicoBackup;
  logger: ReturnType<typeof criarLoggerColetor>;
  relogio: ReturnType<typeof criarRelogio>;
}

/** Monta gerenciador e serviço de backup ligados, como o processo main faz. */
export function montarAmbiente(
  pasta: string,
  migracoes: readonly Migracao[] = MIGRACOES_DO_PROJETO,
  relogio = criarRelogio(new Date(2026, 9, 15, 10, 0, 0)),
): Ambiente {
  const logger = criarLoggerColetor();
  let backup: ServicoBackup | null = null;
  const gerenciador = new GerenciadorBanco({
    caminhoBanco: join(pasta, 'dados', 'pecuaria.db'),
    migracoes,
    logger,
    relogio: relogio.relogio,
    antesDeMigrar: async (db, estado) => {
      await backup?.criarDaConexao(
        db,
        'pre_migracao',
        `Antes de migrar da versão ${estado.versaoAtual}`,
      );
    },
  });
  backup = new ServicoBackup({
    gerenciador,
    pastaBackups: join(pasta, 'backups'),
    versaoApp: '0.0.0-teste',
    logger,
    relogio: relogio.relogio,
  });
  return { pasta, gerenciador, backup, logger, relogio };
}
