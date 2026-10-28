import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { abrirConexao, lerVersaoSchema, type Conexao } from '../src/conexao';
import {
  aplicarMigracoes,
  checksumMigracao,
  ErroMigracao,
  listarMigracoesAplicadas,
  montarMigracoes,
  validarMigracoes,
  type Migracao,
} from '../src/migracoes/migrador';
import {
  MIGRACOES_DO_PROJETO,
  VERSAO_SCHEMA_SUPORTADA,
} from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria, MIGRACAO_TESTE_EXTRA } from './apoio';

const EXTRA = MIGRACAO_TESTE_EXTRA;
const ATUAL = VERSAO_SCHEMA_SUPORTADA;

function tabelas(db: Conexao): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((t) => t.name);
}

describe('migrations do projeto', () => {
  it('carrega os arquivos SQL embutidos pelo bundler, em sequência', () => {
    expect(MIGRACOES_DO_PROJETO.length).toBeGreaterThanOrEqual(1);
    expect(MIGRACOES_DO_PROJETO[0]?.versao).toBe(1);
    expect(MIGRACOES_DO_PROJETO[0]?.nome).toBe('infraestrutura');
    expect(VERSAO_SCHEMA_SUPORTADA).toBe(MIGRACOES_DO_PROJETO.length);
  });

  it('a migration 0001 só cria tabelas técnicas', () => {
    const sql = MIGRACOES_DO_PROJETO[0]?.sql ?? '';
    const criadas = [...sql.matchAll(/CREATE TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(criadas).toEqual(['configuracao']);
  });

  it('a migration 0002 cria as tabelas do rebanho', () => {
    expect(MIGRACOES_DO_PROJETO[1]?.nome).toBe('rebanho');
    const criadas = [
      ...(MIGRACOES_DO_PROJETO[1]?.sql ?? '').matchAll(/CREATE TABLE\s+(\w+)/gi),
    ].map((m) => m[1]);
    expect(criadas).toEqual([
      'propriedade',
      'area',
      'raca',
      'lote',
      'movimentacao_lote',
      'animal',
      'movimentacao_animal',
      'pesagem',
      'historico_alteracao',
    ]);
  });
});

describe('aplicarMigracoes', () => {
  let pasta: ReturnType<typeof criarPastaTemporaria>;
  let db: Conexao;

  beforeEach(() => {
    pasta = criarPastaTemporaria();
    db = abrirConexao(join(pasta.caminho, 'teste.db'));
  });

  afterEach(() => {
    if (db.open) db.close();
    pasta.limpar();
  });

  it('aplica todas as migrations em banco vazio', async () => {
    const resultado = await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    expect(resultado.versaoAnterior).toBe(0);
    expect(resultado.versaoAtual).toBe(VERSAO_SCHEMA_SUPORTADA);
    expect(resultado.aplicadas.map((m) => m.versao)).toEqual(
      MIGRACOES_DO_PROJETO.map((m) => m.versao),
    );
    expect(lerVersaoSchema(db)).toBe(ATUAL);
    expect(tabelas(db)).toEqual(
      expect.arrayContaining(['_migracoes', 'configuracao', 'animal', 'pesagem']),
    );
    expect(listarMigracoesAplicadas(db)).toHaveLength(ATUAL);
  });

  it('pode ser executado de novo sem efeito e sem chamar o gancho de backup', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    const registrosAntes = listarMigracoesAplicadas(db);
    const gancho = vi.fn();

    const segunda = await aplicarMigracoes(db, MIGRACOES_DO_PROJETO, { antesDeMigrar: gancho });
    const terceira = await aplicarMigracoes(db, MIGRACOES_DO_PROJETO, { antesDeMigrar: gancho });

    expect(segunda.aplicadas).toEqual([]);
    expect(terceira.aplicadas).toEqual([]);
    expect(gancho).not.toHaveBeenCalled();
    expect(listarMigracoesAplicadas(db)).toEqual(registrosAntes);
    expect(lerVersaoSchema(db)).toBe(ATUAL);
  });

  it('aplica apenas as pendentes e chama o gancho uma vez antes delas', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    const gancho = vi.fn();
    const resultado = await aplicarMigracoes(db, [...MIGRACOES_DO_PROJETO, EXTRA], {
      antesDeMigrar: gancho,
    });
    expect(gancho).toHaveBeenCalledTimes(1);
    expect(gancho.mock.calls[0]?.[0]).toMatchObject({ versaoAtual: ATUAL });
    expect(resultado.aplicadas.map((m) => m.versao)).toEqual([EXTRA.versao]);
    expect(lerVersaoSchema(db)).toBe(EXTRA.versao);
  });

  it('desfaz por inteiro uma migration que falha e mantém a versão anterior', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    const quebrada: Migracao = {
      versao: EXTRA.versao,
      nome: 'quebrada',
      sql: 'CREATE TABLE parcial (id INTEGER PRIMARY KEY) STRICT;\nINSERT INTO tabela_inexistente VALUES (1);',
    };
    await expect(aplicarMigracoes(db, [...MIGRACOES_DO_PROJETO, quebrada])).rejects.toBeInstanceOf(
      ErroMigracao,
    );
    expect(lerVersaoSchema(db)).toBe(ATUAL);
    expect(tabelas(db)).not.toContain('parcial');
    expect(listarMigracoesAplicadas(db)).toHaveLength(ATUAL);
  });

  it('detecta migration alterada depois de aplicada', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    const alterada = MIGRACOES_DO_PROJETO.map((m) =>
      m.versao === 1 ? { ...m, sql: `${m.sql}\n-- alteração indevida` } : m,
    );
    await expect(aplicarMigracoes(db, alterada)).rejects.toThrow(/alterada depois de aplicada/);
  });

  it('o checksum ignora diferença entre CRLF e LF', () => {
    const base: Migracao = { versao: 1, nome: 'x', sql: 'CREATE TABLE a (b TEXT);\nSELECT 1;' };
    expect(checksumMigracao({ ...base, sql: base.sql.replace(/\n/g, '\r\n') })).toBe(
      checksumMigracao(base),
    );
  });

  it('recusa banco de versão mais nova que o aplicativo', async () => {
    await aplicarMigracoes(db, [...MIGRACOES_DO_PROJETO, EXTRA]);
    await expect(aplicarMigracoes(db, MIGRACOES_DO_PROJETO)).rejects.toThrow(/mais nova/);
  });
});

describe('validação da lista de migrations', () => {
  it('rejeita sequência com buraco', () => {
    expect(() =>
      validarMigracoes([
        { versao: 1, nome: 'a', sql: 'SELECT 1;' },
        { versao: 3, nome: 'c', sql: 'SELECT 1;' },
      ]),
    ).toThrow(/Sequência/);
  });

  it('rejeita controle de transação dentro do arquivo', () => {
    expect(() =>
      validarMigracoes([
        { versao: 1, nome: 'a', sql: 'BEGIN;\nCREATE TABLE x (y TEXT);\nCOMMIT;' },
      ]),
    ).toThrow(/transação/);
  });

  it('rejeita nome de arquivo fora do padrão', () => {
    expect(() => montarMigracoes({ './migrations/primeira.sql': 'SELECT 1;' })).toThrow(/inválido/);
  });

  it('ordena por versão independentemente da ordem de entrada', () => {
    const lista = montarMigracoes({
      '../migrations/0002_b.sql': 'SELECT 2;',
      '../migrations/0001_a.sql': 'SELECT 1;',
    });
    expect(lista.map((m) => m.versao)).toEqual([1, 2]);
  });
});
