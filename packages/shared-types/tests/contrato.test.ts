import { describe, expect, it } from 'vitest';
import {
  CANAIS_API,
  contratoApi,
  ehCanalApi,
  esquemaChaveConfiguracao,
  esquemaIdBackup,
} from '../src';

describe('contrato da API', () => {
  it('todo canal da lista tem esquema e não há esquema sem canal', () => {
    expect(Object.keys(contratoApi).sort()).toEqual([...CANAIS_API].sort());
  });

  it('reconhece apenas canais da lista', () => {
    expect(ehCanalApi('backup:listar')).toBe(true);
    expect(ehCanalApi('backup:apagarTudo')).toBe(false);
    expect(ehCanalApi(42)).toBe(false);
  });

  it('chave de configuração aceita segmentos e recusa caracteres perigosos', () => {
    expect(esquemaChaveConfiguracao.safeParse('interface.tema').success).toBe(true);
    expect(esquemaChaveConfiguracao.safeParse('backup.pastaEspelho').success).toBe(true);
    for (const invalida of [
      '',
      'Interface',
      '../x',
      'a..b',
      'a b',
      "a'; DROP TABLE x;--",
      'x'.repeat(65),
    ]) {
      expect(esquemaChaveConfiguracao.safeParse(invalida).success, invalida).toBe(false);
    }
  });

  it('id de backup recusa caminhos e nomes fora do padrão', () => {
    expect(esquemaIdBackup.safeParse('pecuaria_20261015-090507-042_manual.db').success).toBe(true);
    expect(esquemaIdBackup.safeParse('pecuaria_20261015-090507-042_manual-2.db').success).toBe(
      true,
    );
    for (const invalido of [
      '../pecuaria_20261015-090507-042_manual.db',
      'C:\\Windows\\x.db',
      'pecuaria_20261015-090507-042_manual.db/../../x',
      'outro.db',
    ]) {
      expect(esquemaIdBackup.safeParse(invalido).success, invalido).toBe(false);
    }
  });

  it('entradas são estritas: campos extras são recusados', () => {
    const r = contratoApi['backup:listar'].entrada.safeParse({ inesperado: true });
    expect(r.success).toBe(false);
  });

  it('valor de configuração precisa ser JSON e tem tamanho máximo', () => {
    const esquema = contratoApi['configuracao:definir'].entrada;
    expect(esquema.safeParse({ chave: 'a.b', valor: { x: [1, 'dois', null] } }).success).toBe(true);
    expect(esquema.safeParse({ chave: 'a.b', valor: 'x'.repeat(20_000) }).success).toBe(false);
    expect(esquema.safeParse({ chave: 'a.b', valor: () => 1 }).success).toBe(false);
  });
});
