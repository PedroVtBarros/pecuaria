import { describe, expect, it } from 'vitest';
import {
  CENTAVOS_MAXIMO,
  SEMENTES_PADRAO,
  apropriar,
  apuracaoDe,
  conferirApropriacao,
  criarGeradorDeterministico,
  dividirLinha,
  type GeradorDeterministico,
  type LinhaDeCusto,
} from '../src';

let n = 0;
function linha(
  extra: Partial<LinhaDeCusto> & Pick<LinhaDeCusto, 'destino' | 'valorCentavos'>,
): LinhaDeCusto {
  n += 1;
  return {
    id: `l${n}`,
    origemTipo: 'lancamento',
    origemId: `o${n}`,
    data: '2026-10-05',
    categoria: 'outros',
    descricao: 'Custo',
    rateio: null,
    ...extra,
  };
}
const sempre = (ids: string[]) => () => ids;

describe('divisão de um custo em partes', () => {
  it('animal e lote ficam no destino; propriedade sem rateio fica não alocado', () => {
    expect(
      dividirLinha(linha({ destino: { tipo: 'animal', id: 'a' }, valorCentavos: 100 })),
    ).toMatchObject([{ alvo: { tipo: 'animal', id: 'a' }, valorCentavos: 100, via: 'direto' }]);
    expect(
      dividirLinha(linha({ destino: { tipo: 'lote', id: 'L' }, valorCentavos: 100 }))[0]!.alvo,
    ).toEqual({ tipo: 'lote', id: 'L' });
    expect(
      dividirLinha(linha({ destino: { tipo: 'propriedade' }, valorCentavos: 100 })),
    ).toMatchObject([{ alvo: { tipo: 'nao_alocado' }, via: 'sem_destino' }]);
  });
  it('rateio explícito divide por pesos com soma exata (calculado à mão)', () => {
    // R$ 1.000,00 entre lotes com pesos 3, 2 e 5: 300,00 / 200,00 / 500,00.
    const partes = dividirLinha(
      linha({
        destino: { tipo: 'propriedade' },
        valorCentavos: 100000,
        rateio: {
          id: 'r1',
          itens: [
            { alvo: { tipo: 'lote', id: 'A' }, peso: 3 },
            { alvo: { tipo: 'lote', id: 'B' }, peso: 2 },
            { alvo: { tipo: 'lote', id: 'C' }, peso: 5 },
          ],
        },
      }),
    );
    expect(partes.map((p) => p.valorCentavos)).toEqual([30000, 20000, 50000]);
    expect(partes.every((p) => p.via === 'rateio')).toBe(true);
  });
  it('resto de centavos no rateio vai para um destino e a soma fecha', () => {
    const partes = dividirLinha(
      linha({
        destino: { tipo: 'propriedade' },
        valorCentavos: 100,
        rateio: {
          id: 'r',
          itens: ['A', 'B', 'C'].map((id) => ({ alvo: { tipo: 'lote' as const, id }, peso: 1 })),
        },
      }),
    );
    expect(partes.map((p) => p.valorCentavos).sort()).toEqual([33, 33, 34]);
  });
  it('animais tratados dividem por igual; sem animais, não alocado', () => {
    const partes = dividirLinha(
      linha({
        destino: { tipo: 'animais_tratados', animaisIds: ['a', 'b', 'c'] },
        valorCentavos: 1000,
      }),
    );
    expect(partes.map((p) => p.valorCentavos).sort()).toEqual([333, 333, 334]);
    expect(
      dividirLinha(
        linha({ destino: { tipo: 'animais_tratados', animaisIds: [] }, valorCentavos: 1000 }),
      )[0]!.alvo,
    ).toEqual({ tipo: 'nao_alocado' });
  });
  it('custo desconhecido gera partes desconhecidas, nunca zero', () => {
    const partes = dividirLinha(
      linha({
        destino: { tipo: 'propriedade' },
        valorCentavos: null,
        rateio: {
          id: 'r',
          itens: [
            { alvo: { tipo: 'lote', id: 'A' }, peso: 1 },
            { alvo: { tipo: 'lote', id: 'B' }, peso: 1 },
          ],
        },
      }),
    );
    expect(partes.map((p) => p.valorCentavos)).toEqual([null, null]);
  });
});

describe('apropriação ao animal e ao lote', () => {
  it('custo de lote é dividido entre os animais presentes no dia; calculado à mão', () => {
    // R$ 100,00 de mão de obra do lote L em 05/10, com 3 animais presentes: 33,34 / 33,33 / 33,33.
    const r = apropriar(
      [linha({ destino: { tipo: 'lote', id: 'L' }, valorCentavos: 10000 })],
      sempre(['a', 'b', 'c']),
    );
    expect([...r.porAnimal.values()].map((a) => a.conhecidoCentavos).sort()).toEqual([
      3333, 3333, 3334,
    ]);
    expect(r.porLote.get('L')).toMatchObject({ diretoCentavos: 10000, rateadoCentavos: 0 });
    expect(conferirApropriacao(r)).toEqual([]);
  });
  it('lote sem animais no dia: o custo fica no lote, visível, e fecha', () => {
    const r = apropriar(
      [linha({ destino: { tipo: 'lote', id: 'L' }, valorCentavos: 5000 })],
      sempre([]),
    );
    expect(r.porAnimal.size).toBe(0);
    expect(r.loteSemAnimais.get('L')!.conhecidoCentavos).toBe(5000);
    expect(conferirApropriacao(r)).toEqual([]);
  });
  it('custo da propriedade sem rateio aparece como não alocado e entra no total', () => {
    const r = apropriar(
      [linha({ destino: { tipo: 'propriedade' }, valorCentavos: 7000 })],
      sempre(['a']),
    );
    expect(r.naoAlocado.conhecidoCentavos).toBe(7000);
    expect(r.porAnimal.size).toBe(0);
    expect(conferirApropriacao(r)).toEqual([]);
  });
  it('rateio para lotes chega aos animais de cada lote, por dia', () => {
    const presenca = (lote: string) => (lote === 'A' ? ['a1', 'a2'] : ['b1']);
    const r = apropriar(
      [
        linha({
          destino: { tipo: 'propriedade' },
          valorCentavos: 9000,
          rateio: {
            id: 'r',
            itens: [
              { alvo: { tipo: 'lote', id: 'A' }, peso: 2 },
              { alvo: { tipo: 'lote', id: 'B' }, peso: 1 },
            ],
          },
        }),
      ],
      presenca,
    );
    // Lote A recebe 6.000 (3.000 por animal); lote B recebe 3.000.
    expect(r.porLote.get('A')).toMatchObject({ rateadoCentavos: 6000, diretoCentavos: 0 });
    expect(r.porAnimal.get('a1')!.conhecidoCentavos).toBe(3000);
    expect(r.porAnimal.get('a2')!.conhecidoCentavos).toBe(3000);
    expect(r.porAnimal.get('b1')!.conhecidoCentavos).toBe(3000);
  });
  it('categorias ficam separadas por animal e somam o total do animal', () => {
    const r = apropriar(
      [
        linha({
          destino: { tipo: 'lote', id: 'L' },
          valorCentavos: 1001,
          categoria: 'alimentacao',
        }),
        linha({ destino: { tipo: 'lote', id: 'L' }, valorCentavos: 1001, categoria: 'sanidade' }),
        linha({
          destino: { tipo: 'animal', id: 'a' },
          valorCentavos: 50000,
          categoria: 'aquisicao',
        }),
      ],
      sempre(['a', 'b']),
    );
    const a = r.porAnimal.get('a')!;
    expect(Object.values(a.porCategoria).reduce((s, v) => s + (v ?? 0), 0)).toBe(
      a.conhecidoCentavos,
    );
    expect(a.porCategoria.aquisicao).toBe(50000);
    expect(conferirApropriacao(r)).toEqual([]);
  });
  it('custo desconhecido torna o animal parcial e nunca soma zero', () => {
    const r = apropriar(
      [
        linha({ destino: { tipo: 'lote', id: 'L' }, valorCentavos: 4000 }),
        linha({
          destino: { tipo: 'lote', id: 'L' },
          valorCentavos: null,
          categoria: 'alimentacao',
        }),
      ],
      sempre(['a', 'b']),
    );
    const a = r.porAnimal.get('a')!;
    expect(apuracaoDe(a)).toMatchObject({
      estado: 'parcial',
      valorConhecidoCentavos: 2000,
      componentesDesconhecidos: 1,
    });
    const so = apropriar(
      [linha({ destino: { tipo: 'animal', id: 'x' }, valorCentavos: null })],
      sempre([]),
    );
    expect(apuracaoDe(so.porAnimal.get('x')!).estado).toBe('desconhecida');
    expect(conferirApropriacao(so)).toEqual([]);
  });
  it('detalhes explicam de onde veio o valor do animal', () => {
    const r = apropriar(
      [
        linha({
          destino: { tipo: 'animal', id: 'a' },
          valorCentavos: 1000,
          categoria: 'aquisicao',
        }),
        linha({
          destino: { tipo: 'lote', id: 'L' },
          valorCentavos: 3000,
          categoria: 'alimentacao',
        }),
        linha({
          destino: { tipo: 'animais_tratados', animaisIds: ['a', 'b'] },
          valorCentavos: 400,
          categoria: 'sanidade',
        }),
      ],
      sempre(['a', 'b', 'c']),
      'a',
    );
    expect(r.detalhes.map((d) => [d.via, d.categoria, d.valorCentavos])).toEqual([
      ['direto', 'aquisicao', 1000],
      ['animais_tratados', 'sanidade', 200],
      ['lote', 'alimentacao', 1000],
    ]);
    expect(r.detalhes[2]!.lote).toEqual({ id: 'L', totalDoGrupoCentavos: 3000, animaisNoGrupo: 3 });
  });
});

describe('propriedades da apropriação (gerador determinístico)', () => {
  const CASOS = 1000;
  function gerarCenario(g: GeradorDeterministico) {
    const animais = Array.from({ length: g.inteiro(1, 6) }, (_, i) => `a${i}`);
    const lotes = Array.from({ length: g.inteiro(1, 3) }, (_, i) => `L${i}`);
    // Presença sorteada por (lote, dia), estável dentro do caso.
    const mapa = new Map<string, string[]>();
    const presenca = (lote: string, data: string) => {
      const chave = `${lote}|${data}`;
      if (!mapa.has(chave))
        mapa.set(
          chave,
          animais.filter(() => g.booleano(0.6)),
        );
      return mapa.get(chave)!;
    };
    const dias = ['2026-10-01', '2026-10-02', '2026-10-03'];
    const linhas: LinhaDeCusto[] = Array.from({ length: g.inteiro(0, 25) }, (_, i) => {
      const tipo = g.escolher([
        'animal',
        'lote',
        'propriedade',
        'animais_tratados',
        'rateio',
      ] as const);
      const valor = g.booleano(0.12)
        ? null
        : g.booleano(0.08)
          ? CENTAVOS_MAXIMO / 10
          : g.inteiro(0, 500_000);
      const destino =
        tipo === 'animal'
          ? ({ tipo: 'animal', id: g.escolher(animais) } as const)
          : tipo === 'lote'
            ? ({ tipo: 'lote', id: g.escolher(lotes) } as const)
            : tipo === 'animais_tratados'
              ? ({
                  tipo: 'animais_tratados',
                  animaisIds: animais.filter(() => g.booleano(0.5)),
                } as const)
              : ({ tipo: 'propriedade' } as const);
      const rateio =
        tipo === 'rateio'
          ? {
              id: `r${i}`,
              itens: [
                ...lotes
                  .filter(() => g.booleano(0.6))
                  .map((id) => ({ alvo: { tipo: 'lote' as const, id }, peso: g.inteiro(1, 1000) })),
                ...animais
                  .filter(() => g.booleano(0.2))
                  .map((id) => ({
                    alvo: { tipo: 'animal' as const, id },
                    peso: g.inteiro(1, 1000),
                  })),
              ],
            }
          : null;
      return {
        id: `p${i}`,
        origemTipo: 'lancamento',
        origemId: `o${i}`,
        data: g.escolher(dias),
        categoria: g.escolher(['aquisicao', 'alimentacao', 'sanidade', 'outros'] as const),
        descricao: 'x',
        valorCentavos: valor,
        destino,
        rateio,
      };
    });
    return { linhas, presenca };
  }
  for (const semente of SEMENTES_PADRAO) {
    it(`semente ${semente}: soma apropriada fecha com a soma de origem e a ordem não importa`, () => {
      const g = criarGeradorDeterministico(semente);
      for (let caso = 0; caso < CASOS; caso++) {
        const { linhas, presenca } = gerarCenario(g);
        try {
          const r = apropriar(linhas, presenca);
          expect(conferirApropriacao(r)).toEqual([]);
          // Soma por categoria dos animais não passa do total apropriado.
          for (const a of r.porAnimal.values())
            expect(Object.values(a.porCategoria).reduce((s, v) => s + (v ?? 0), 0)).toBe(
              a.conhecidoCentavos,
            );
          // A ordem das linhas não muda nenhum total.
          const outra = apropriar(g.embaralhar(linhas), presenca);
          expect([...outra.porAnimal].map(([id, a]) => [id, a.conhecidoCentavos]).sort()).toEqual(
            [...r.porAnimal].map(([id, a]) => [id, a.conhecidoCentavos]).sort(),
          );
          expect(outra.naoAlocado.conhecidoCentavos).toBe(r.naoAlocado.conhecidoCentavos);
        } catch (e) {
          throw new Error(`Falha na semente ${semente}, caso ${caso}: ${(e as Error).message}`);
        }
      }
    });
  }
});

describe('custo acumulado até uma data por animal', () => {
  it('conta só as linhas até o limite do animal, sem mudar a conservação', () => {
    const linhas = [
      linha({ destino: { tipo: 'lote', id: 'L' }, valorCentavos: 9000, data: '2026-10-05' }),
      linha({ destino: { tipo: 'animal', id: 'a' }, valorCentavos: 500, data: '2026-10-06' }),
      linha({ destino: { tipo: 'lote', id: 'L' }, valorCentavos: 6000, data: '2026-10-10' }),
    ];
    const r = apropriar(linhas, sempre(['a', 'b', 'c']), undefined, (id) =>
      id === 'a' ? '2026-10-07' : null,
    );
    // Até 07/10, "a" tem 3.000 (um terço do lote em 05/10) + 500 direto; depois disso, mais 2.000.
    expect(r.porAnimalAte.get('a')?.conhecidoCentavos).toBe(3500);
    expect(r.porAnimal.get('a')?.conhecidoCentavos).toBe(5500);
    expect(r.porAnimalAte.has('b')).toBe(false);
    expect(conferirApropriacao(r)).toEqual([]);
  });
});
