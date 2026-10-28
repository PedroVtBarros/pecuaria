import { describe, expect, it } from 'vitest';
import { apurarCustoDoCentro } from '../src';

describe('custo de um centro de produção', () => {
  it('soma despesas e consumos conhecidos e leva o total à entrada', () => {
    // 1.200,00 de diesel e mão de obra + 300,50 de adubo do estoque = 1.500,50.
    const c = apurarCustoDoCentro({ despesasCentavos: [70000, 50000], consumosCentavos: [30050] });
    expect(c).toMatchObject({
      conhecidoCentavos: 150050,
      componentes: 3,
      desconhecidos: 0,
      completo: true,
      podeEncerrar: true,
      custoDaEntradaCentavos: 150050,
    });
    expect(c.apuracao.estado).toBe('completa');
  });

  it('um consumo de custo desconhecido deixa a entrada com custo desconhecido, sem tratar o conhecido como total', () => {
    const c = apurarCustoDoCentro({ despesasCentavos: [70000], consumosCentavos: [null, 5000] });
    expect(c).toMatchObject({
      conhecidoCentavos: 75000,
      desconhecidos: 1,
      completo: false,
      podeEncerrar: true,
      custoDaEntradaCentavos: null,
    });
    expect(c.apuracao.estado).toBe('parcial');
  });

  it('só consumos desconhecidos: custo totalmente desconhecido, nunca zero', () => {
    const c = apurarCustoDoCentro({ despesasCentavos: [], consumosCentavos: [null] });
    expect(c.apuracao.estado).toBe('desconhecida');
    expect(c.custoDaEntradaCentavos).toBeNull();
    expect(c.podeEncerrar).toBe(true);
  });

  it('sem nenhum componente não há o que encerrar: não apurado, nunca zero', () => {
    const c = apurarCustoDoCentro({ despesasCentavos: [], consumosCentavos: [] });
    expect(c).toMatchObject({
      componentes: 0,
      podeEncerrar: false,
      completo: false,
      custoDaEntradaCentavos: null,
    });
    expect(c.apuracao.estado).toBe('nao_apurada');
  });

  it('despesa de zero centavo conhecida conta como componente conhecido (zero conhecido não é desconhecido)', () => {
    const c = apurarCustoDoCentro({ despesasCentavos: [0], consumosCentavos: [] });
    expect(c).toMatchObject({ completo: true, custoDaEntradaCentavos: 0 });
  });
});
