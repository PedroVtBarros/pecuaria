import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarLoggerArquivo, logsParaRemover, serializarParaLog } from './logger';

describe('criarLoggerArquivo', () => {
  let pasta: string;

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'pecuaria-log-'));
  });

  afterEach(() => {
    rmSync(pasta, { recursive: true, force: true });
  });

  it('grava uma linha JSON por registro no arquivo do dia, respeitando o nível mínimo', () => {
    const logger = criarLoggerArquivo({
      pasta,
      nivelMinimo: 'info',
      relogio: () => new Date(2026, 9, 15, 12),
    });
    logger.debug('não deve aparecer');
    logger.info('iniciado', { versao: '0.1.0' });
    logger.erro('falhou', { erro: new Error('boom', { cause: new Error('raiz') }) });

    const linhas = readFileSync(join(pasta, 'app-2026-10-15.log'), 'utf8').trim().split('\n');
    expect(linhas).toHaveLength(2);
    const [info, erro] = linhas.map((l) => JSON.parse(l));
    expect(info).toMatchObject({
      nivel: 'info',
      mensagem: 'iniciado',
      contexto: { versao: '0.1.0' },
    });
    expect(erro.contexto.erro).toMatchObject({
      nome: 'Error',
      mensagem: 'boom',
      causa: { mensagem: 'raiz' },
    });
    expect(erro.contexto.erro.pilha).toContain('boom');
  });

  it('remove arquivos de log além da retenção ao iniciar', () => {
    writeFileSync(join(pasta, 'app-2026-01-01.log'), 'x');
    writeFileSync(join(pasta, 'app-2026-10-14.log'), 'x');
    writeFileSync(join(pasta, 'outro-arquivo.txt'), 'x');
    criarLoggerArquivo({ pasta, retencaoDias: 30, relogio: () => new Date(2026, 9, 15) });
    expect(readdirSync(pasta).sort()).toEqual(['app-2026-10-14.log', 'outro-arquivo.txt']);
  });
});

describe('logsParaRemover', () => {
  it('mantém exatamente os N dias mais recentes', () => {
    const nomes = ['app-2026-10-13.log', 'app-2026-10-14.log', 'app-2026-10-15.log'];
    expect(logsParaRemover(nomes, new Date(2026, 9, 15), 2)).toEqual(['app-2026-10-13.log']);
  });
});

describe('serializarParaLog', () => {
  it('lida com estruturas profundas, bigint e funções', () => {
    const profundo = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    expect(JSON.stringify(serializarParaLog(profundo))).toContain('profundidade máxima');
    expect(serializarParaLog(10n)).toBe('10');
    expect(typeof serializarParaLog(() => 1)).toBe('string');
  });
});
