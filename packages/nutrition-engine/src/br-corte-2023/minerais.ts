import type { Categoria, Resultado } from '../nucleo/tipos';
import type { EquacaoRegistrada } from '../nucleo/registro';
import { RegistroEquacoes } from '../nucleo/registro';
import { calcularGrafo, type NoCalculo } from '../nucleo/grafo';
import type { Quantidade } from '../nucleo/unidades';
import { APROVACAO_MINERAIS, conferidaNaImagem } from './fonte';
import {
  DOMINIO_GANHO_MACROMINERAL,
  DOMINIO_GANHO_S,
  DOMINIO_MANTENCA_MINERAL,
  escopoDaCategoria,
} from './dados/dominios';
import {
  DADOS_MACROMINERAIS,
  MACROMINERAIS,
  type GrupoMineral,
  type Macromineral,
} from './dados/minerais';
import { nosPeso } from './peso';

/*
 * Grupo macrominerais (entrega 6A-6; INVENTARIO_BR_CORTE.md, seções 3.5 e 17): exigências de Ca,
 * P, Mg, Na, K e S de bovinos em crescimento e terminação (Tabela 10.14, p. 264):
 *   mantença (g/dia)   = coeficiente (mg/kg PC) × PC / 1000
 *   ganho (g/dia)      = GPCVZ × (a × PCVZ^b); Ca e P: zero a partir do PCVZ do plateau
 *   líquida (g/dia)    = mantença + ganho
 *   dietética (g/dia)  = líquida / (retenção / 100)
 * Grupos "Zebuíno" e "Cruzado" (cruzado de corte e de leite juntos, p. 242; A-04); sem efeito de
 * classe sexual nem de sistema nas equações. Mesmo escopo de categorias dos outros grupos.
 * Exigência dietética não é oferta da dieta nem disponibilidade de fonte mineral. Equações aprovadas
 * pelo usuário (APROVACAO_MINERAIS), com as decisões D-MIN-01 a 11 (INVENTARIO_BR_CORTE.md, 17.1).
 */

const conferidaMinerais = (paginas: number[]) =>
  conferidaNaImagem([...paginas, 264], APROVACAO_MINERAIS, '2026-10-24');

/** mg por g: mantença em mg/dia → g/dia. Conversão de unidade, não coeficiente. */
const MG_POR_G = 1000;

const grupoMineral = (c: Categoria): GrupoMineral =>
  c.grupo === 'zebuino' ? 'zebuino' : 'cruzado';

/** Páginas da conferência de cada mineral (Tabela 10.14 e a seção do mineral). */
const PAGINAS: Readonly<Record<Macromineral, number[]>> = {
  Ca: [243, 245, 246],
  P: [243, 248],
  Mg: [243, 250],
  Na: [243, 250, 251],
  K: [243, 252, 253],
  S: [243, 253, 254],
};
const CASOS = ['T-03 (p. 264–265)', 'T-04 (p. 433–434)', 'T-06 (Tabelas 17.3b a 17.12b)'];

function mantenca(m: Macromineral): EquacaoRegistrada {
  const d = DADOS_MACROMINERAIS[m];
  return {
    id: `BRC23-M-${m}-1`,
    descricao: `Mantença de ${m} = ${d.mantenca.impresso} mg/kg PC × PC (g/dia)`,
    referencias: [
      { capitulo: 10, pagina: 264, local: 'Tabela 10.14' },
      { capitulo: 10, pagina: 240, local: 'Tabela 10.3 (banco de dados)' },
    ],
    entradas: { PC: 'kg' },
    saida: 'g/dia',
    escopo: escopoDaCategoria,
    dominio: () => DOMINIO_MANTENCA_MINERAL,
    coeficientes: () => ({ mgPorKgPC: d.mantenca.valor }),
    calcular: (e, k) => (k['mgPorKgPC']! * e['PC']!) / MG_POR_G,
    conferencia: conferidaMinerais([240, ...PAGINAS[m]]),
    casosDeTeste: CASOS,
  };
}

function ganho(m: Macromineral): EquacaoRegistrada {
  const d = DADOS_MACROMINERAIS[m];
  const z = d.ganho.zebuino;
  const plateau = z.plateauPCVZ ? '; zero com PCVZ no plateau' : '';
  return {
    id: `BRC23-M-${m}-2`,
    descricao: `Ganho de ${m} = GPCVZ × (a × PCVZ^b), por grupo (Tabela 10.14)${plateau}`,
    referencias: [
      { capitulo: 10, pagina: 264, local: 'Tabela 10.14' },
      {
        capitulo: 10,
        pagina: 243,
        local: m === 'S' ? 'Tabela 10.6 (banco de dados)' : 'Tabela 10.5 (banco de dados)',
      },
    ],
    entradas: { GPCVZ: 'kg/dia', PCVZ: 'kg' },
    saida: 'g/dia',
    escopo: escopoDaCategoria,
    dominio: (c) =>
      m === 'S'
        ? DOMINIO_GANHO_S
        : (DOMINIO_GANHO_MACROMINERAL[c.sistema][c.grupo]?.[c.sexo] ?? {}),
    // D-MIN-03: zebuíno castrado a pasto está no escopo, mas a Tabela 10.5 não tem linha dele.
    semDominioPublicado: (c) =>
      m !== 'S' && !DOMINIO_GANHO_MACROMINERAL[c.sistema][c.grupo]?.[c.sexo]
        ? 'Sem banco de dados publicado de ganho mineral para esta categoria (Tabela 10.5, p. 243; D-MIN-03).'
        : null,
    coeficientes: (c) => {
      const g = d.ganho[grupoMineral(c)];
      return {
        a: g.a.valor,
        b: g.b.valor,
        ...(g.plateauPCVZ ? { plateauPCVZ: g.plateauPCVZ.valor } : {}),
      };
    },
    calcular: (e, k) =>
      k['plateauPCVZ'] !== undefined && e['PCVZ']! >= k['plateauPCVZ']
        ? 0
        : e['GPCVZ']! * (k['a']! * e['PCVZ']! ** k['b']!),
    conferencia: conferidaMinerais(PAGINAS[m]),
    casosDeTeste: CASOS,
  };
}

function liquida(m: Macromineral): EquacaoRegistrada {
  return {
    id: `BRC23-M-${m}-3`,
    descricao: `Exigência líquida de ${m} = mantença + ganho`,
    referencias: [{ capitulo: 10, pagina: 264, local: 'exemplo, p. 264–265' }],
    entradas: { mantenca: 'g/dia', ganho: 'g/dia' },
    saida: 'g/dia',
    escopo: escopoDaCategoria,
    dominio: () => ({}),
    coeficientes: () => ({}),
    calcular: (e) => e['mantenca']! + e['ganho']!,
    conferencia: conferidaMinerais([265]),
    casosDeTeste: CASOS,
  };
}

function dietetica(m: Macromineral): EquacaoRegistrada {
  const d = DADOS_MACROMINERAIS[m];
  return {
    id: `BRC23-M-${m}-4`,
    descricao: `Exigência dietética de ${m} = líquida / (${d.retencao.impresso} / 100)`,
    referencias: [
      { capitulo: 10, pagina: 264, local: 'Tabela 10.14 (coeficiente de retenção); exemplo' },
    ],
    entradas: { liquida: 'g/dia' },
    saida: 'g/dia',
    escopo: escopoDaCategoria,
    dominio: () => ({}),
    coeficientes: () => ({ retencaoPct: d.retencao.valor }),
    calcular: (e, k) => e['liquida']! / (k['retencaoPct']! / 100),
    notasFixas: [
      'Exigência dietética (líquida ÷ coeficiente de retenção verdadeiro); não é oferta da dieta nem disponibilidade de fonte mineral.',
    ],
    conferencia: conferidaMinerais(PAGINAS[m]),
    casosDeTeste: CASOS,
  };
}

const equacoesDe = (m: Macromineral) => [mantenca(m), ganho(m), liquida(m), dietetica(m)] as const;

/** Mantença, ganho, líquida e dietética de cada mineral (BRC23-M-<mineral>-1 a 4). */
export const EQUACOES_MINERAIS = {
  Ca: equacoesDe('Ca'),
  P: equacoesDe('P'),
  Mg: equacoesDe('Mg'),
  Na: equacoesDe('Na'),
  K: equacoesDe('K'),
  S: equacoesDe('S'),
} satisfies Record<Macromineral, readonly EquacaoRegistrada[]>;

/**
 * Relação Ca/P (D-MIN-09): razão das **exigências dietéticas** de Ca e P, não composição da
 * dieta. Exemplos "Relação Ca/P = 21,67/14,66 = 1,48" (p. 265) e "27,24/10,35 = 2,63" (p. 433);
 * coluna "Ca/P" das Tabelas 17.3b a 17.12b. P dietético zero ou ausente não calcula.
 */
export const RELACAO_CA_P_EQ: EquacaoRegistrada = {
  id: 'BRC23-M-CaP',
  descricao: 'Ca/P = exigência dietética de Ca / exigência dietética de P',
  referencias: [
    { capitulo: 10, pagina: 265, local: 'exemplo (T-03)' },
    { capitulo: 17, pagina: 433, local: 'exemplo (T-04)' },
    { capitulo: 17, pagina: 442, local: 'Tabelas 17.3b a 17.12b, coluna "Ca/P"' },
  ],
  entradas: { Ca: 'g/dia', P: 'g/dia' },
  saida: 'adimensional',
  escopo: escopoDaCategoria,
  escopoEntradas: (e) => (e['P']! > 0 ? null : 'Exigência dietética de P deve ser maior que zero.'),
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => e['Ca']! / e['P']!,
  notasFixas: [
    'Relação entre exigências dietéticas de Ca e P; não é a relação Ca/P da dieta ofertada.',
  ],
  conferencia: conferidaMinerais([265, 433, 442]),
  casosDeTeste: CASOS,
};

export function registroMinerais(): RegistroEquacoes {
  const r = new RegistroEquacoes();
  for (const m of MACROMINERAIS) for (const e of EQUACOES_MINERAIS[m]) r.registrar(e);
  r.registrar(RELACAO_CA_P_EQ);
  return r;
}

/** Resultados de um mineral, em g/dia. */
export interface ResultadoMineral {
  mantenca: Resultado;
  ganho: Resultado;
  liquida: Resultado;
  dietetica: Resultado;
}
export type ResultadoMinerais = Record<Macromineral, ResultadoMineral> & {
  PCVZ: Resultado;
  GPCVZ: Resultado;
  /** Relação entre as exigências dietéticas de Ca e P (adimensional). */
  CaP: Resultado;
};

function nosMinerais(c: Categoria): NoCalculo[] {
  return [
    ...nosPeso(c),
    ...MACROMINERAIS.flatMap((m): NoCalculo[] => {
      const [mt, gn, lq, dt] = EQUACOES_MINERAIS[m];
      return [
        { id: `${m}.mantenca`, equacao: mt, origens: { PC: 'entrada:PC' } },
        { id: `${m}.ganho`, equacao: gn, origens: { GPCVZ: 'GPCVZ', PCVZ: 'PCVZ' } },
        {
          id: `${m}.liquida`,
          equacao: lq,
          origens: { mantenca: `${m}.mantenca`, ganho: `${m}.ganho` },
        },
        { id: `${m}.dietetica`, equacao: dt, origens: { liquida: `${m}.liquida` } },
      ];
    }),
    { id: 'CaP', equacao: RELACAO_CA_P_EQ, origens: { Ca: 'Ca.dietetica', P: 'P.dietetica' } },
  ];
}

/**
 * Exigências de macrominerais: PC médio (kg) e GMD (kg/dia). Mantença pelo PC; ganho pelo PCVZ e
 * GPCVZ da cadeia de peso. Não depende de CMS nem de energia. Precisão integral.
 */
export function calcularMinerais(
  c: Categoria,
  entradas: { PC: Quantidade | null; GMD: Quantidade | null },
): ResultadoMinerais {
  const r = calcularGrafo(nosMinerais(c), c, entradas);
  const porMineral = Object.fromEntries(
    MACROMINERAIS.map((m) => [
      m,
      {
        mantenca: r.get(`${m}.mantenca`)!,
        ganho: r.get(`${m}.ganho`)!,
        liquida: r.get(`${m}.liquida`)!,
        dietetica: r.get(`${m}.dietetica`)!,
      },
    ]),
  ) as Record<Macromineral, ResultadoMineral>;
  return { ...porMineral, PCVZ: r.get('PCVZ')!, GPCVZ: r.get('GPCVZ')!, CaP: r.get('CaP')! };
}
