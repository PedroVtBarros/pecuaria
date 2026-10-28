import { describe, expect, it } from 'vitest';
import {
  dataLocalIso,
  diasEntre,
  ehDataIso,
  ehUuid,
  gerarUuidV7,
  idadeEmMeses,
  interpretarData,
  interpretarNumero,
  limparTexto,
  normalizarIdentificacao,
  normalizarNome,
} from '../src';

describe('gerarUuidV7', () => {
  it('gera UUID versão 7 válido, com o tempo nos primeiros 48 bits', () => {
    const id = gerarUuidV7(0x0123456789ab, (b) => b.fill(0xff));
    expect(id).toBe('01234567-89ab-7fff-bfff-ffffffffffff');
    expect(ehUuid(id)).toBe(true);
  });

  it('é ordenável pelo tempo de criação', () => {
    const a = gerarUuidV7(1_000);
    const b = gerarUuidV7(2_000);
    expect(a < b).toBe(true);
  });

  it('não repete em muitas gerações no mesmo milissegundo', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => gerarUuidV7(1_700_000_000_000)));
    expect(ids.size).toBe(5000);
  });
});

describe('normalização de texto', () => {
  it('limpa espaços e transforma vazio em null', () => {
    expect(limparTexto('  Lote   A  ')).toBe('Lote A');
    expect(limparTexto('   ')).toBeNull();
    expect(limparTexto(null)).toBeNull();
  });

  it('nome: ignora maiúsculas e espaços, mantém acentos', () => {
    expect(normalizarNome(' Pasto  SÃO João ')).toBe('pasto são joão');
    expect(normalizarNome('Pasto Sao Joao')).not.toBe(normalizarNome('Pasto São João'));
  });

  it('identificação: ignora maiúsculas e espaços extras', () => {
    expect(normalizarIdentificacao(' br  0001 ')).toBe('BR 0001');
    expect(normalizarIdentificacao('BR0001')).not.toBe(normalizarIdentificacao('BR 0001'));
  });
});

describe('datas', () => {
  it('valida datas de calendário reais', () => {
    expect(ehDataIso('2028-02-29')).toBe(true);
    expect(ehDataIso('2026-02-29')).toBe(false);
    expect(ehDataIso('2026-13-01')).toBe(false);
    expect(ehDataIso('15/10/2026')).toBe(false);
  });

  it('dias entre datas, inclusive negativo', () => {
    expect(diasEntre('2026-10-01', '2026-10-15')).toBe(14);
    expect(diasEntre('2026-10-15', '2026-10-01')).toBe(-14);
  });

  it('interpreta formatos brasileiro e ISO', () => {
    expect(interpretarData('5/3/2026')).toBe('2026-03-05');
    expect(interpretarData('2026-03-05')).toBe('2026-03-05');
    expect(interpretarData('31/02/2026')).toBeNull();
  });

  it('idade em meses completos', () => {
    expect(idadeEmMeses('2025-01-15', '2026-01-14')).toBe(11);
    expect(idadeEmMeses('2025-01-15', '2026-01-15')).toBe(12);
  });

  it('data local', () => {
    expect(dataLocalIso(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
  });
});

describe('interpretarNumero', () => {
  it('aceita vírgula ou ponto decimal e milhar inequívoco', () => {
    expect(interpretarNumero('450')).toBe(450);
    expect(interpretarNumero('450,5')).toBe(450.5);
    expect(interpretarNumero('450.5')).toBe(450.5);
    expect(interpretarNumero('1.050,5')).toBe(1050.5);
    expect(interpretarNumero('1,050.5')).toBe(1050.5);
  });

  it('recusa valores ambíguos ou inválidos', () => {
    expect(interpretarNumero('1.050')).toBeNull();
    expect(interpretarNumero('abc')).toBeNull();
    expect(interpretarNumero('')).toBeNull();
  });
});
