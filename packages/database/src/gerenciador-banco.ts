import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ErroAplicacao } from '@pecuaria/shared-types';
import { abrirConexao, ID_APLICACAO, lerIdAplicacao, type Conexao } from './conexao';
import type { Logger } from './logger';
import {
  aplicarMigracoes,
  type EstadoAntesDeMigrar,
  type Migracao,
  type ResultadoMigracao,
} from './migracoes/migrador';

export interface OpcoesGerenciadorBanco {
  caminhoBanco: string;
  migracoes: readonly Migracao[];
  logger: Logger;
  /** Chamado antes de migrar um banco existente. Usado para o backup pré-migração. */
  antesDeMigrar?: (db: Conexao, estado: EstadoAntesDeMigrar) => Promise<void>;
  relogio?: () => Date;
}

export interface ResultadoAbertura extends ResultadoMigracao {
  bancoNovo: boolean;
}

/**
 * Dono único da conexão operacional. Repositórios recebem uma função que
 * consulta `conexao` a cada uso, para continuar funcionando depois que uma
 * restauração fecha e reabre o banco.
 */
export class GerenciadorBanco {
  readonly caminho: string;
  readonly versaoSuportada: number;
  private readonly opcoes: OpcoesGerenciadorBanco;
  private db: Conexao | null = null;

  constructor(opcoes: OpcoesGerenciadorBanco) {
    this.opcoes = opcoes;
    this.caminho = opcoes.caminhoBanco;
    this.versaoSuportada = opcoes.migracoes.at(-1)?.versao ?? 0;
  }

  get aberto(): boolean {
    return this.db !== null;
  }

  get conexao(): Conexao {
    if (!this.db) {
      throw new ErroAplicacao('BANCO_INDISPONIVEL', 'O banco de dados não está aberto.');
    }
    return this.db;
  }

  async abrir(): Promise<ResultadoAbertura> {
    if (this.db) {
      throw new Error('O banco de dados já está aberto.');
    }
    mkdirSync(dirname(this.caminho), { recursive: true });
    const bancoNovo = !existsSync(this.caminho);
    const db = abrirConexao(this.caminho);

    try {
      if (bancoNovo) {
        db.pragma(`application_id = ${ID_APLICACAO}`);
      } else if (lerIdAplicacao(db) !== ID_APLICACAO) {
        throw new ErroAplicacao(
          'BANCO_INDISPONIVEL',
          'O arquivo de banco de dados não pertence a este aplicativo.',
        );
      }

      const antesDeMigrar = this.opcoes.antesDeMigrar;
      const resultado = await aplicarMigracoes(db, this.opcoes.migracoes, {
        ...(this.opcoes.relogio ? { relogio: this.opcoes.relogio } : {}),
        ...(!bancoNovo && antesDeMigrar
          ? { antesDeMigrar: (estado: EstadoAntesDeMigrar) => antesDeMigrar(db, estado) }
          : {}),
      });

      this.db = db;
      this.opcoes.logger.info('Banco de dados aberto', {
        caminho: this.caminho,
        bancoNovo,
        versaoAnterior: resultado.versaoAnterior,
        versaoAtual: resultado.versaoAtual,
        migracoesAplicadas: resultado.aplicadas.map((m) => `${m.versao}_${m.nome}`),
      });
      return { ...resultado, bancoNovo };
    } catch (erro) {
      db.close();
      throw erro;
    }
  }

  /**
   * Executa `operacao` numa transação: tudo é gravado ou nada é. Usar em toda
   * operação que modifica mais de uma tabela (CLAUDE.md, regras do rebanho).
   */
  transacao<T>(operacao: (db: Conexao) => T): T {
    const db = this.conexao;
    return db.transaction(() => operacao(db))();
  }

  fechar(): void {
    if (!this.db) return;
    this.db.close();
    this.db = null;
    this.opcoes.logger.info('Banco de dados fechado', { caminho: this.caminho });
  }
}
