import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { ID_APLICACAO, lerIdAplicacao } from '../src/conexao';
import { RepositorioConfiguracao } from '../src/repositorios/repositorio-configuracao';
import { criarPastaTemporaria, montarAmbiente } from './apoio';

describe('GerenciadorBanco', () => {
  let pasta: ReturnType<typeof criarPastaTemporaria>;

  beforeEach(() => {
    pasta = criarPastaTemporaria();
  });

  afterEach(() => {
    pasta.limpar();
  });

  it('cria o banco em pasta inexistente, com pragmas e identificador do aplicativo', async () => {
    const { gerenciador } = montarAmbiente(pasta.caminho);
    const abertura = await gerenciador.abrir();
    try {
      expect(abertura.bancoNovo).toBe(true);
      expect(existsSync(gerenciador.caminho)).toBe(true);
      const db = gerenciador.conexao;
      expect(lerIdAplicacao(db)).toBe(ID_APLICACAO);
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      gerenciador.fechar();
    }
  });

  it('banco novo não gera backup pré-migração', async () => {
    const { gerenciador, backup } = montarAmbiente(pasta.caminho);
    await gerenciador.abrir();
    gerenciador.fechar();
    expect(await backup.listar()).toEqual([]);
  });

  it('dados persistem depois de fechar e reabrir, e a reabertura não reaplica migrations', async () => {
    const primeiro = montarAmbiente(pasta.caminho);
    await primeiro.gerenciador.abrir();
    const repo1 = new RepositorioConfiguracao(() => primeiro.gerenciador.conexao);
    repo1.definir('interface.tema', 'escuro');
    repo1.definir('teste.objeto', { a: 1, b: [true, null, 'x'] });
    primeiro.gerenciador.fechar();

    const segundo = montarAmbiente(pasta.caminho);
    const abertura = await segundo.gerenciador.abrir();
    try {
      expect(abertura.bancoNovo).toBe(false);
      expect(abertura.aplicadas).toEqual([]);
      const repo2 = new RepositorioConfiguracao(() => segundo.gerenciador.conexao);
      expect(repo2.obter('interface.tema')).toBe('escuro');
      expect(repo2.obter('teste.objeto')).toEqual({ a: 1, b: [true, null, 'x'] });
      expect(repo2.obter('nao.existe')).toBeNull();
    } finally {
      segundo.gerenciador.fechar();
    }
  });

  it('recusa arquivo SQLite que não pertence ao aplicativo', async () => {
    const { gerenciador } = montarAmbiente(pasta.caminho);
    await gerenciador.abrir();
    gerenciador.fechar();

    const estranho = new Database(gerenciador.caminho);
    estranho.pragma('application_id = 12345');
    estranho.close();

    const outro = montarAmbiente(pasta.caminho);
    await expect(outro.gerenciador.abrir()).rejects.toThrow(/não pertence/);
    expect(outro.gerenciador.aberto).toBe(false);
  });

  it('acesso à conexão com o banco fechado gera erro conhecido', () => {
    const { gerenciador } = montarAmbiente(pasta.caminho);
    expect(() => gerenciador.conexao).toThrow(/não está aberto/);
  });
});

describe('RepositorioConfiguracao', () => {
  let pasta: ReturnType<typeof criarPastaTemporaria>;

  beforeEach(() => {
    pasta = criarPastaTemporaria();
  });

  afterEach(() => {
    pasta.limpar();
  });

  it('atualiza valor existente sem duplicar e preserva created_at', async () => {
    const { gerenciador, relogio } = montarAmbiente(pasta.caminho);
    await gerenciador.abrir();
    try {
      const repo = new RepositorioConfiguracao(() => gerenciador.conexao, relogio.relogio);
      repo.definir('x.y', 1);
      relogio.avancar(60_000);
      repo.definir('x.y', 2);
      expect(repo.listar()).toHaveLength(1);
      expect(repo.obter('x.y')).toBe(2);
      const linha = gerenciador.conexao
        .prepare('SELECT created_at, updated_at FROM configuracao WHERE chave = ?')
        .get('x.y') as { created_at: string; updated_at: string };
      expect(linha.created_at < linha.updated_at).toBe(true);
    } finally {
      gerenciador.fechar();
    }
  });

  it('a constraint do banco rejeita JSON inválido gravado diretamente', async () => {
    const { gerenciador } = montarAmbiente(pasta.caminho);
    await gerenciador.abrir();
    try {
      expect(() =>
        gerenciador.conexao
          .prepare("INSERT INTO configuracao VALUES ('a', '{invalido', 'x', 'x')")
          .run(),
      ).toThrow();
    } finally {
      gerenciador.fechar();
    }
  });

  it('caminho do banco de teste fica fora do código', () => {
    const { gerenciador } = montarAmbiente(pasta.caminho);
    expect(gerenciador.caminho.startsWith(pasta.caminho)).toBe(true);
    expect(gerenciador.caminho).toBe(join(pasta.caminho, 'dados', 'pecuaria.db'));
  });
});
