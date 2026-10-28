import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import {
  escolherPastaDeDados,
  estaDentroDe,
  resolverCaminhos,
  validarLocalDoBanco,
  VARIAVEL_PASTA_DADOS,
} from './caminhos';

const appData = resolve('/Users/fulano/AppData/Roaming');

describe('escolherPastaDeDados', () => {
  it('usa pastas diferentes para desenvolvimento e versão instalada', () => {
    expect(escolherPastaDeDados({ pastaAppData: appData, empacotado: true, env: {} })).toBe(
      join(appData, 'GestaoPecuaria'),
    );
    expect(escolherPastaDeDados({ pastaAppData: appData, empacotado: false, env: {} })).toBe(
      join(appData, 'GestaoPecuaria-dev'),
    );
  });

  it('aceita pasta redirecionada pela variável de ambiente', () => {
    const pasta = resolve('/tmp/teste-e2e');
    expect(
      escolherPastaDeDados({
        pastaAppData: appData,
        empacotado: true,
        env: { [VARIAVEL_PASTA_DADOS]: pasta },
      }),
    ).toBe(pasta);
  });
});

describe('validarLocalDoBanco', () => {
  it('recusa banco dentro da pasta do código', () => {
    const codigo = resolve('/dev/pecuaria/apps/desktop');
    const r = validarLocalDoBanco(resolverCaminhos(join(codigo, 'dados')), codigo);
    expect(r.erro).toMatch(/pasta do código/);
  });

  it('aceita banco em AppData, sem avisos', () => {
    const r = validarLocalDoBanco(
      resolverCaminhos(join(appData, 'GestaoPecuaria')),
      resolve('/dev/pecuaria/apps/desktop'),
    );
    expect(r).toEqual({ erro: null, avisos: [] });
  });

  it('avisa quando o banco está no OneDrive', () => {
    const r = validarLocalDoBanco(
      resolverCaminhos(resolve('/Users/fulano/OneDrive/Desktop/dados')),
      resolve('/dev/pecuaria'),
    );
    expect(r.erro).toBeNull();
    expect(r.avisos[0]).toMatch(/OneDrive/);
  });
});

describe('estaDentroDe', () => {
  it('não confunde prefixo de nome com subpasta', () => {
    expect(estaDentroDe(resolve('/a/bc/x'), resolve('/a/b'))).toBe(false);
    expect(estaDentroDe(resolve('/a/b/x'), resolve('/a/b'))).toBe(true);
    expect(estaDentroDe(resolve('/a/b'), resolve('/a/b'))).toBe(true);
  });
});
