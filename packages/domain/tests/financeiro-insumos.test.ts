import { describe, expect, it } from 'vitest';
import {
  CENTAVOS_MAXIMO,
  SEMENTES_PADRAO,
  apuracaoDeContagens,
  apurarCustoSanitario,
  criarGeradorDeterministico,
  ratearCustoEntreAnimais,
  ratearFretePorValor,
} from '../src';

describe('rateio do frete por valor', () => {
  it('sem frete, cada item fica com o próprio valor', () => {
    const r = ratearFretePorValor(
      [
        { id: 'a', valorCentavos: 100000 },
        { id: 'b', valorCentavos: 50000 },
      ],
      0,
    );
    expect(r.erros).toEqual([]);
    expect([...r.valores]).toEqual([
      ['a', 100000],
      ['b', 50000],
    ]);
  });
  it('divide o frete em proporção ao valor, calculado à mão, e a soma fecha', () => {
    // Frete R$ 90,00 sobre R$ 600,00 (a) e R$ 300,00 (b): 60,00 e 30,00.
    const r = ratearFretePorValor(
      [
        { id: 'a', valorCentavos: 60000 },
        { id: 'b', valorCentavos: 30000 },
      ],
      9000,
    );
    expect(r.valores.get('a')).toBe(66000);
    expect(r.valores.get('b')).toBe(33000);
    expect([...r.valores.values()].reduce((s, v) => s + v, 0)).toBe(99000);
  });
  it('resto de centavos vai para um item; nada se perde', () => {
    const r = ratearFretePorValor(
      [
        { id: 'a', valorCentavos: 1 },
        { id: 'b', valorCentavos: 1 },
        { id: 'c', valorCentavos: 1 },
      ],
      100,
    );
    expect([...r.valores.values()].sort()).toEqual([34, 34, 35]);
  });
  it('item sem valor impede o rateio por valor em vez de inventar outro critério', () => {
    const r = ratearFretePorValor(
      [
        { id: 'a', valorCentavos: 0 },
        { id: 'b', valorCentavos: 100 },
      ],
      500,
    );
    expect(r.valores.size).toBe(0);
    expect(r.erros[0]).toMatch(/maior que zero/);
  });
});

describe('apuração por contagens', () => {
  it('só conhecidos: completa; com desconhecidos: parcial; só desconhecidos: desconhecida', () => {
    expect(
      apuracaoDeContagens({ conhecidoCentavos: 5000, conhecidos: 2, desconhecidos: 0 }),
    ).toMatchObject({
      estado: 'completa',
      valorConhecidoCentavos: 5000,
      componentesConhecidos: 2,
    });
    expect(
      apuracaoDeContagens({ conhecidoCentavos: 5000, conhecidos: 2, desconhecidos: 1 }),
    ).toMatchObject({
      estado: 'parcial',
      componentesDesconhecidos: 1,
    });
    expect(
      apuracaoDeContagens({ conhecidoCentavos: 0, conhecidos: 0, desconhecidos: 3 }).estado,
    ).toBe('desconhecida');
  });
  it('zero conhecido é diferente de desconhecido', () => {
    expect(
      apuracaoDeContagens({ conhecidoCentavos: 0, conhecidos: 1, desconhecidos: 0 }).estado,
    ).toBe('completa');
    expect(
      apuracaoDeContagens({ conhecidoCentavos: 0, conhecidos: 0, desconhecidos: 1 }).estado,
    ).toBe('desconhecida');
  });
  it('recusa valor sem consumo conhecido e contagem negativa', () => {
    expect(() =>
      apuracaoDeContagens({ conhecidoCentavos: 1, conhecidos: 0, desconhecidos: 0 }),
    ).toThrow();
    expect(() =>
      apuracaoDeContagens({ conhecidoCentavos: 0, conhecidos: -1, desconhecidos: 0 }),
    ).toThrow();
  });
});

describe('custo sanitário e precedência (plano 5.6)', () => {
  it('só baixa de estoque: conta a baixa; o valor informado não entra se houver estoque', () => {
    const c = apurarCustoSanitario({
      consumosEstoque: [4000],
      servicos: [],
      informadoCentavos: 9000,
    });
    expect(c.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 4000 });
    expect(c.informadoContado).toBe(false);
    expect(c.informadoNaoContadoCentavos).toBe(9000);
  });
  it('baixa mais serviço somam sem repetir', () => {
    const c = apurarCustoSanitario({
      consumosEstoque: [4000, 1500],
      servicos: [8000],
      informadoCentavos: null,
    });
    expect(c.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 13500 });
    expect(c.servicosCentavos).toBe(8000);
    expect(c.estoque).toEqual({ quantidade: 2, conhecidoCentavos: 5500, desconhecidos: 0 });
    expect(c.informadoNaoContadoCentavos).toBeNull();
  });
  it('só o valor informado (registro antigo) conta', () => {
    const c = apurarCustoSanitario({ consumosEstoque: [], servicos: [], informadoCentavos: 9000 });
    expect(c.informadoContado).toBe(true);
    expect(c.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 9000 });
  });
  it('baixa com custo desconhecido torna o total parcial ou desconhecido, nunca zero', () => {
    const parcial = apurarCustoSanitario({
      consumosEstoque: [4000, null],
      servicos: [],
      informadoCentavos: null,
    });
    expect(parcial.apuracao).toMatchObject({ estado: 'parcial', valorConhecidoCentavos: 4000 });
    expect(parcial.estoque.desconhecidos).toBe(1);
    const desconhecido = apurarCustoSanitario({
      consumosEstoque: [null],
      servicos: [],
      informadoCentavos: 5000,
    });
    expect(desconhecido.apuracao.estado).toBe('desconhecida');
    expect(desconhecido.informadoNaoContadoCentavos).toBe(5000);
  });
  it('sem nenhum componente: não apurado, nunca zero', () => {
    const c = apurarCustoSanitario({ consumosEstoque: [], servicos: [], informadoCentavos: null });
    expect(c.apuracao.estado).toBe('nao_apurada');
    expect(c.apuracao.componentesConhecidos).toBe(0);
  });
  it('divide o valor conhecido por igual entre os animais tratados', () => {
    const partes = ratearCustoEntreAnimais(1000, ['a1', 'a2', 'a3']);
    expect(partes.map((p) => p.valorCentavos).sort()).toEqual([333, 333, 334]);
    expect(ratearCustoEntreAnimais(1000, [])).toEqual([]);
  });
});

describe('propriedades do rateio de frete', () => {
  it('a soma dos itens com frete é sempre valor dos itens mais o frete', () => {
    for (const semente of SEMENTES_PADRAO) {
      const g = criarGeradorDeterministico(semente);
      for (let caso = 0; caso < 1000; caso++) {
        const n = g.inteiro(1, 10);
        const itens = Array.from({ length: n }, (_, i) => ({
          id: `i${i}`,
          valorCentavos: g.booleano(0.1) ? CENTAVOS_MAXIMO / 100 : g.inteiro(1, 5_000_000),
        }));
        const frete = g.booleano(0.1) ? 0 : g.inteiro(1, 3_000_000);
        const r = ratearFretePorValor(itens, frete);
        try {
          expect(r.erros).toEqual([]);
          const soma = [...r.valores.values()].reduce((s, v) => s + v, 0);
          expect(soma).toBe(itens.reduce((s, i) => s + i.valorCentavos, 0) + frete);
          for (const i of itens)
            expect(r.valores.get(i.id)!).toBeGreaterThanOrEqual(i.valorCentavos);
        } catch (e) {
          throw new Error(`Falha na semente ${semente}, caso ${caso}: ${(e as Error).message}`);
        }
      }
    }
  });
});
