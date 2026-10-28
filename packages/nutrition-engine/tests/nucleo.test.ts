import { describe, expect, it } from 'vitest';
import {
  aplicar,
  formatarLimite,
  formatarValor,
  calcularGrafo,
  confereImpresso,
  ErroGrafo,
  ErroRegistro,
  ErroUnidade,
  lerImpresso,
  ordenar,
  q,
  RegistroEquacoes,
  type Categoria,
  type EquacaoRegistrada,
  type NoCalculo,
} from '../src';

/*
 * 6A-1: estrutura do motor. Equações FICTÍCIAS (CLAUDE.md, regra 1): nomes e coeficientes sem
 * relação com o BR-CORTE, só para provar unidades, escopo, domínio, registro e grafo.
 */
const CAT: Categoria = { grupo: 'zebuino', sexo: 'macho_nao_castrado', sistema: 'confinamento' };
const CONFERIDA = {
  transcritoPor: 'Teste',
  conferencias: [{ por: 'Teste', data: '2026-10-22', metodo: 'fictício', paginas: [1] }],
  aprovacaoUsuario: null,
};
function eq(extra: Partial<EquacaoRegistrada> = {}): EquacaoRegistrada {
  return {
    id: 'FICT-01',
    descricao: 'Equação fictícia: dobro de x',
    referencias: [{ capitulo: 0, pagina: 0, local: 'fictício' }],
    entradas: { x: 'kg' },
    saida: 'kg',
    escopo: (c) => (c.sistema === 'pasto' ? 'Fictícia só em confinamento.' : null),
    dominio: () => ({ x: { minimo: 10, maximo: 100, fonte: 'faixa fictícia' } }),
    coeficientes: () => ({ a: 2 }),
    calcular: (e, k) => k['a']! * e['x']!,
    conferencia: CONFERIDA,
    casosDeTeste: ['caso fictício'],
    ...extra,
  };
}

describe('6A-1: aplicar uma equação', () => {
  it('dentro do domínio: válido, com entradas, unidade e coeficientes guardados', () => {
    expect(aplicar(eq(), CAT, { x: q(50, 'kg') })).toEqual({
      equacaoId: 'FICT-01',
      situacao: 'valido',
      valor: 100,
      unidade: 'kg',
      usoOperacional: true,
      motivos: [],
      avisos: [],
      notas: [],
      coeficientes: { a: 2 },
      entradas: { x: { valor: 50, unidade: 'kg' } },
    });
  });

  it('domínio provisório: válido, com aviso; fora dele, o motivo diz que o limite é provisório', () => {
    const prov = eq({
      dominio: () => ({ x: { minimo: 10, maximo: 100, fonte: 'fictícia', provisorio: true } }),
    });
    expect(aplicar(prov, CAT, { x: q(50, 'kg') })).toMatchObject({
      situacao: 'valido',
      avisos: ['Domínio de x provisório (10 a 100 kg; fictícia).'],
    });
    expect(aplicar(prov, CAT, { x: q(150, 'kg') }).motivos[0]).toMatch(
      /\(10 a 100 kg, limite provisório; fictícia\)/,
    );
  });

  it('fora do domínio: calcula, mas sem uso operacional e com o motivo (C10)', () => {
    const r = aplicar(eq(), CAT, { x: q(150, 'kg') });
    expect(r).toMatchObject({ situacao: 'fora_do_dominio', valor: 300, usoOperacional: false });
    expect(r.motivos[0]).toMatch(
      /x = 150 kg fora do domínio validado \(10 a 100 kg; faixa fictícia\)/,
    );
  });

  it('domínio da saída (6A-5): resultado fora da faixa perde o uso operacional, com o motivo', () => {
    const comSaida = eq({
      dominioSaida: () => ({ minimo: 30, maximo: 150, fonte: 'saída fictícia' }),
    });
    expect(aplicar(comSaida, CAT, { x: q(50, 'kg') }).situacao).toBe('valido');
    const r = aplicar(comSaida, CAT, { x: q(12, 'kg') });
    expect(r).toMatchObject({ situacao: 'fora_do_dominio', valor: 24, usoOperacional: false });
    expect(r.motivos).toEqual([
      'Resultado = 24 kg fora do domínio validado (30 a 150 kg; saída fictícia).',
    ]);
  });

  it('inconsistência do resultado: calculado como está, sem uso operacional, com o motivo', () => {
    const negativo = eq({
      calcular: (e) => e['x']! - 60,
      consistenciaSaida: (v) => (v < 0 ? 'resultado negativo.' : null),
    });
    expect(aplicar(negativo, CAT, { x: q(80, 'kg') }).situacao).toBe('valido');
    expect(aplicar(negativo, CAT, { x: q(50, 'kg') })).toMatchObject({
      situacao: 'fora_do_dominio',
      valor: -10,
      usoOperacional: false,
      motivos: ['Inconsistência: resultado negativo.'],
    });
  });

  it('mensagens legíveis: vírgula decimal, milhar, unidade e casas pela grandeza; valor integral intacto', () => {
    const r = aplicar(eq(), CAT, { x: q(452.16789581616905, 'kg') });
    expect(r.motivos[0]).toBe(
      'x = 452,2 kg fora do domínio validado (10 a 100 kg; faixa fictícia).',
    );
    expect(r.valor).toBe(904.3357916323381);
    expect(r.entradas['x']!.valor).toBe(452.16789581616905);
    expect(formatarValor(100.04, [100])).toBe('100,04');
    expect(formatarValor(0.123456)).toBe('0,123');
    expect(formatarValor(4390)).toBe('4.390');
    expect(formatarLimite(0.00005)).toBe('0,00005');
  });

  it('notas fixas são informativas e ficam separadas dos avisos', () => {
    const r = aplicar(eq({ notasFixas: ['Nota informativa.'], avisosFixos: ['Limitação.'] }), CAT, {
      x: q(50, 'kg'),
    });
    expect(r).toMatchObject({ notas: ['Nota informativa.'], avisos: ['Limitação.'] });
  });

  it('fora do escopo da categoria ou das entradas: não calcula', () => {
    expect(aplicar(eq(), { ...CAT, sistema: 'pasto' }, { x: q(50, 'kg') })).toMatchObject({
      situacao: 'fora_do_escopo',
      valor: null,
      motivos: ['Fictícia só em confinamento.'],
    });
    const negativo = eq({
      escopoEntradas: (e) => (e['x']! < 0 ? 'Negativo fora do escopo.' : null),
    });
    expect(aplicar(negativo, CAT, { x: q(-1, 'kg') }).situacao).toBe('fora_do_escopo');
  });

  it('indefinida para as entradas (ex.: potência de negativo): não calcula, nunca devolve NaN', () => {
    const potencia = eq({ calcular: (e) => e['x']! ** 0.5, dominio: () => ({}) });
    expect(aplicar(potencia, CAT, { x: q(-4, 'kg') })).toMatchObject({
      situacao: 'fora_do_escopo',
      valor: null,
    });
  });

  it('unidade errada é recusada; entrada ausente fica indeterminada, nunca zero', () => {
    expect(() => aplicar(eq(), CAT, { x: q(50, 'kg/dia') })).toThrow(ErroUnidade);
    expect(() => aplicar(eq(), CAT, { x: q(Number.NaN, 'kg') })).toThrow(ErroUnidade);
    expect(aplicar(eq(), CAT, { x: null })).toMatchObject({
      situacao: 'indeterminado',
      valor: null,
      motivos: ['Falta x.'],
    });
  });
});

describe('6A-1: registro de equações (A2)', () => {
  it('só registra equação transcrita, conferida, com caso de teste e referência; sem repetição', () => {
    const r = new RegistroEquacoes();
    r.registrar(eq());
    expect(r.obter('FICT-01').descricao).toMatch(/fictícia/);
    expect(() => r.registrar(eq())).toThrow(/repetida/);
    expect(() =>
      r.registrar(eq({ id: 'B', conferencia: { ...CONFERIDA, conferencias: [] } })),
    ).toThrow(ErroRegistro);
    expect(() => r.registrar(eq({ id: 'C', casosDeTeste: [] }))).toThrow(ErroRegistro);
    expect(() => r.registrar(eq({ id: 'D', referencias: [] }))).toThrow(/referência/);
    expect(() => r.obter('X')).toThrow(/não registrada/);
  });
});

describe('6A-1: grafo de dependências e bloqueio parcial', () => {
  const dobro = eq();
  const soma = eq({
    id: 'FICT-02',
    entradas: { a: 'kg', b: 'kg' },
    dominio: () => ({}),
    calcular: (e) => e['a']! + e['b']!,
  });
  const nos: NoCalculo[] = [
    { id: 'soma', equacao: soma, origens: { a: 'dobro', b: 'entrada:y' } },
    { id: 'dobro', equacao: dobro, origens: { x: 'entrada:x' } },
  ];

  it('calcula em ordem de dependência', () => {
    expect(ordenar(nos).map((n) => n.id)).toEqual(['dobro', 'soma']);
    const r = calcularGrafo(nos, CAT, { x: q(20, 'kg'), y: q(5, 'kg') });
    expect(r.get('soma')).toMatchObject({ valor: 45, situacao: 'valido' });
  });

  it('o que depende de indeterminado fica indeterminado; o resto segue', () => {
    const r = calcularGrafo(nos, CAT, { x: null, y: q(5, 'kg') });
    expect(r.get('dobro')!.situacao).toBe('indeterminado');
    expect(r.get('soma')).toMatchObject({ situacao: 'indeterminado', valor: null });
    expect(r.get('soma')!.motivos[0]).toMatch(/Depende de dobro/);
  });

  it('fora do domínio propaga a perda do uso operacional', () => {
    const r = calcularGrafo(nos, CAT, { x: q(200, 'kg'), y: q(5, 'kg') });
    expect(r.get('soma')).toMatchObject({ valor: 405, usoOperacional: false });
    expect(r.get('soma')!.motivos.join(' ')).toMatch(/Depende de dobro, sem uso operacional/);
  });

  it('ciclo, nó repetido e origem inexistente são recusados', () => {
    const ciclo: NoCalculo[] = [
      { id: 'a', equacao: dobro, origens: { x: 'b' } },
      { id: 'b', equacao: dobro, origens: { x: 'a' } },
    ];
    expect(() => ordenar(ciclo)).toThrow(ErroGrafo);
    expect(() => ordenar([nos[1]!, nos[1]!])).toThrow(/repetido/);
    expect(() => ordenar([{ id: 'a', equacao: dobro, origens: { x: 'z' } }])).toThrow(/não existe/);
  });
});

describe('6A-1: comparação com o valor impresso (C8)', () => {
  it('meia unidade do último algarismo impresso', () => {
    expect(lerImpresso('144,2')).toEqual({ valor: 144.2, tolerancia: 0.05 });
    expect(lerImpresso('509')).toEqual({ valor: 509, tolerancia: 0.5 });
    expect(confereImpresso(144.249, '144,2')).toBe(true);
    expect(confereImpresso(144.26, '144,2')).toBe(false);
    expect(confereImpresso(0.9625, '0,963')).toBe(true);
    expect(() => lerImpresso('1.234,5')).toThrow(/inválido/);
  });
});
