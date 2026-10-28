import { describe, expect, it, vi } from 'vitest';
import { ErroAplicacao } from '@pecuaria/shared-types';
import { loggerSilencioso } from '@pecuaria/database';
import { criarManipulador } from './criar-manipulador';
import type { RemetenteIpc } from '../seguranca';

const evento: RemetenteIpc = {
  sender: { id: 1 },
  senderFrame: { url: 'file:///app/index.html', parent: null },
};

function deps(autorizado = true) {
  return { validarRemetente: () => autorizado, logger: loggerSilencioso };
}

describe('criarManipulador', () => {
  it('recusa remetente não autorizado sem executar nada', async () => {
    const executar = vi.fn();
    const m = criarManipulador('configuracao:obter', executar, deps(false));
    const r = await m(evento, { chave: 'a.b' });
    expect(r).toEqual({
      ok: false,
      erro: { codigo: 'REMETENTE_NAO_AUTORIZADO', mensagem: expect.any(String) },
    });
    expect(executar).not.toHaveBeenCalled();
  });

  it('recusa entrada inválida antes de executar', async () => {
    const executar = vi.fn();
    const m = criarManipulador('configuracao:definir', executar, deps());
    const r = await m(evento, { chave: '../../x', valor: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.codigo).toBe('ENTRADA_INVALIDA');
      expect(r.erro.detalhes?.[0]).toMatch(/^chave:/);
    }
    expect(executar).not.toHaveBeenCalled();
  });

  it('recusa campos extras', async () => {
    const m = criarManipulador('backup:listar', vi.fn(), deps());
    const r = await m(evento, { comando: 'rm -rf' });
    expect(r.ok).toBe(false);
  });

  it('trata entrada ausente como objeto vazio em canais sem parâmetros', async () => {
    const m = criarManipulador('backup:listar', () => Promise.resolve([]), deps());
    expect(await m(evento, undefined)).toEqual({ ok: true, dados: [] });
  });

  it('devolve o resultado do executor', async () => {
    const m = criarManipulador('configuracao:obter', ({ chave }) => ({ valor: chave }), deps());
    expect(await m(evento, { chave: 'interface.tema' })).toEqual({
      ok: true,
      dados: { valor: 'interface.tema' },
    });
  });

  it('converte ErroAplicacao mantendo código e mensagem', async () => {
    const m = criarManipulador(
      'backup:restaurar',
      () => {
        throw new ErroAplicacao('BACKUP_INVALIDO', 'Backup corrompido.', ['detalhe']);
      },
      deps(),
    );
    const r = await m(evento, { id: 'pecuaria_20261015-090507-042_manual.db' });
    expect(r).toEqual({
      ok: false,
      erro: { codigo: 'BACKUP_INVALIDO', mensagem: 'Backup corrompido.', detalhes: ['detalhe'] },
    });
  });

  it('erro inesperado vira ERRO_INTERNO sem vazar a mensagem original e é registrado', async () => {
    const logger = { ...loggerSilencioso, erro: vi.fn() };
    const m = criarManipulador(
      'backup:listar',
      () => {
        throw new Error('SQLITE_CORRUPT em C:\\caminho\\secreto');
      },
      { validarRemetente: () => true, logger },
    );
    const r = await m(evento, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.codigo).toBe('ERRO_INTERNO');
      expect(r.erro.mensagem).not.toContain('secreto');
    }
    expect(logger.erro).toHaveBeenCalledOnce();
  });
});
