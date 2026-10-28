import type { Categoria, Resultado } from '../nucleo/tipos';
import type { EquacaoRegistrada, FaixaDominio } from '../nucleo/registro';
import { RegistroEquacoes } from '../nucleo/registro';
import { calcularGrafo, type NoCalculo } from '../nucleo/grafo';
import { APROVACAO_PROTEINA, conferidaNaImagem } from './fonte';
import { DOMINIO_PBMIC, dominioProteina, escopoDaCategoria } from './dados/dominios';
import { K_PROTEINA, PBMIC, PLG, PMM, PNDR } from './dados/proteina';
import {
  entradasDoGrafo,
  identificarCms,
  nosEnergia,
  RESULTADOS_ENERGIA,
  type EntradasAnimal,
} from './energia';

/*
 * Grupo proteína (entrega 6A-5; INVENTARIO_BR_CORTE.md, seções 3.4, 10 e 16): **exigências**
 * de proteína metabolizável, degradável e não degradável no rúmen e bruta, de bovinos em
 * crescimento e terminação. Mesmo escopo de categorias dos outros grupos.
 *
 * Exigência não é oferta: na PBmic, CPB é a PB exigida (o próprio resultado, resolvido em forma
 * fechada; P-06) e CNDT é o NDT exigido pela cadeia de energia (A-07). Nenhum dado de alimento
 * entra aqui: PDR = PBmic é a exigência de proteína degradável, não a degradação de um alimento.
 * Equações aprovadas pelo usuário (APROVACAO_PROTEINA), com as decisões D-PROT-01 a 09
 * (INVENTARIO_BR_CORTE.md, seção 16.1).
 */

const conferidaProteina = (paginas: number[]) =>
  conferidaNaImagem([...paginas, 227], APROVACAO_PROTEINA, '2026-10-23');

/** g por kg: CPB (kg/dia) = PB (g/dia) / 1000. Conversão de unidade, não coeficiente. */
const G_POR_KG = 1000;

/** Faixa da categoria nas Tabelas 9.2 a 9.5, quando coberta. */
function faixaProteina(c: Categoria, campo: 'PCJ' | 'GPCVZ', provisorio?: string) {
  const d = dominioProteina(c);
  if (!d) return {};
  const faixa: FaixaDominio = provisorio
    ? { ...d[campo], fonte: `${d[campo].fonte} (${provisorio})`, provisorio: true }
    : d[campo];
  return { [campo]: faixa };
}

export const PMM_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-01-02',
  descricao: 'PMm = 3,6 × PCJ^0,75 (confinamento) ou 3,9 × PCJ^0,75 (pasto)',
  referencias: [
    { capitulo: 9, pagina: 214, local: '3,6 e 3,9 g/PCJ^0,75 (texto)' },
    { capitulo: 9, pagina: 227, local: 'Tabela 9.14' },
  ],
  entradas: { PCJ: 'kg' },
  saida: 'g/dia',
  escopo: escopoDaCategoria,
  dominio: (c) => faixaProteina(c, 'PCJ'),
  coeficientes: (c) => ({ a: PMM[c.sistema].valor, expoente: PMM.expoente.valor }),
  calcular: (e, k) => k['a']! * e['PCJ']! ** k['expoente']!,
  conferencia: conferidaProteina([214]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)', 'T-12 (planilha oficial)'],
};

export const PLG_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-03',
  descricao: 'PLg = 176,01 × GPCVZ – 0,381 × PCVZeq^0,75 × GPCVZ^1,035',
  referencias: [
    { capitulo: 9, pagina: 216, local: 'Costa e Silva et al. (2020)' },
    { capitulo: 9, pagina: 227, local: 'Tabela 9.14' },
  ],
  entradas: { GPCVZ: 'kg/dia', PCVZeq: 'kg' },
  saida: 'g/dia',
  escopo: escopoDaCategoria,
  // Ajustada no banco de Costa e Silva et al. (2020; p. 215–216), cuja estatística descritiva o
  // livro não traz: faixa das Tabelas 9.2 a 9.5 como provisória (D-PROT-01).
  dominio: (c) =>
    faixaProteina(c, 'GPCVZ', 'banco de Costa e Silva et al. (2020) não descrito; provisório'),
  coeficientes: () => ({
    b1: PLG.b1.valor,
    b2: PLG.b2.valor,
    expoentePCVZeq: PLG.expoentePCVZeq.valor,
    expoenteGPCVZ: PLG.expoenteGPCVZ.valor,
  }),
  calcular: (e, k) =>
    k['b1']! * e['GPCVZ']! -
    k['b2']! * e['PCVZeq']! ** k['expoentePCVZeq']! * e['GPCVZ']! ** k['expoenteGPCVZ']!,
  conferencia: conferidaProteina([215, 216]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)', 'T-12 (planilha oficial)'],
};

export const K_PROTEINA_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-04',
  descricao: 'k = 84,665 – 0,1179 × PCVZeq, se PCJ < 340 kg; k = 47,4, se PCJ ≥ 340 kg',
  referencias: [
    { capitulo: 9, pagina: 218, local: 'equação e limite de PCJ (texto)' },
    { capitulo: 9, pagina: 227, local: 'Tabela 9.14' },
  ],
  entradas: { PCJ: 'kg', PCVZeq: 'kg' },
  saida: '%',
  escopo: escopoDaCategoria,
  // Equação do banco do BR-CORTE 2010 (p. 218), também não descrito no livro (D-PROT-01).
  dominio: (c) => faixaProteina(c, 'PCJ', 'equação do banco do BR-CORTE 2010; provisório'),
  coeficientes: () => ({
    a: K_PROTEINA.a.valor,
    b: K_PROTEINA.b.valor,
    limitePCJ: K_PROTEINA.limitePCJ.valor,
    constante: K_PROTEINA.constante.valor,
  }),
  calcular: (e, k) =>
    e['PCJ']! >= k['limitePCJ']! ? k['constante']! : k['a']! - k['b']! * e['PCVZeq']!,
  conferencia: conferidaProteina([218]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)', 'T-06 (Tabelas 17.3a a 17.12a)'],
};

export const PMG_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-05',
  descricao: 'PMg = PLg / k (k em %)',
  referencias: [{ capitulo: 9, pagina: 227, local: 'Tabela 9.14; exemplo' }],
  entradas: { PLg: 'g/dia', k: '%' },
  saida: 'g/dia',
  escopo: escopoDaCategoria,
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => e['PLg']! / (e['k']! / 100),
  conferencia: conferidaProteina([]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)'],
};

export const PMT_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-06',
  descricao: 'PMt = PMm + PMg',
  referencias: [{ capitulo: 9, pagina: 227, local: 'Tabela 9.14' }],
  entradas: { PMm: 'g/dia', PMg: 'g/dia' },
  saida: 'g/dia',
  escopo: escopoDaCategoria,
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => e['PMm']! + e['PMg']!,
  conferencia: conferidaProteina([]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)'],
};

const coeficientesPBmic = () => ({
  a: PBMIC.a.valor,
  bCPB: PBMIC.bCPB.valor,
  bCNDT: PBMIC.bCNDT.valor,
  bCNDT2: PBMIC.bCNDT2.valor,
});
const AVISO_EXIGENCIA =
  'Exigência: CPB = PB exigida e CNDT = NDT exigido pela cadeia de energia; não é a proteína nem o NDT ofertados pela dieta.';
const AVISO_EE =
  'Equação de PBmic ajustada com dietas de extrato etéreo médio de 2,83 % (± 1,03); para EE alto o livro traz outra equação, não implementada (p. 60).';
const PNDR_NEGATIVA =
  'PNDR exigida negativa (0,64 × PBmic > PMt): a síntese microbiana supera a PM exigida; não corrigida para zero (D-PROT-09).';
/** CPB da Tabela 3.7 em g/dia de PB, para o domínio de quem recebe ou devolve a PB. */
const FAIXA_PB_G: FaixaDominio = {
  minimo: DOMINIO_PBMIC.CPB.minimo * G_POR_KG,
  maximo: DOMINIO_PBMIC.CPB.maximo * G_POR_KG,
  fonte: `${DOMINIO_PBMIC.CPB.fonte}: CPB 0,59 a 4,39 kg/dia, em g/dia`,
};

/**
 * PB = PDR + PNDR, com PDR = PBmic(CPB = PB / 1000) e PNDR = (PMt – 0,64 × PBmic) / 0,80, é
 * linear em PB: PB = [(1 – f/d) × a' + PMt/d] / [1 – (1 – f/d) × bCPB / 1000], com a' = a +
 * bCNDT × CNDT + bCNDT2 × CNDT², f = 0,64 e d = 0,80 (INVENTARIO_BR_CORTE.md, seção 10; P-06).
 * Solução única, sem iteração.
 */
export const PB_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-10',
  descricao:
    'PB = PDR + PNDR, resolvida em forma fechada: PB = (0,2 × a + 1,25 × PMt) / (1 – 0,2 × 0,3049)',
  referencias: [
    { capitulo: 9, pagina: 219, local: 'PBmic, PDR, PNDR e PB (texto)' },
    { capitulo: 9, pagina: 227, local: 'Tabela 9.14' },
  ],
  entradas: { PMt: 'g/dia', CNDT: 'kg/dia' },
  saida: 'g/dia',
  escopo: escopoDaCategoria,
  escopoEntradas: (e) => (e['CNDT']! > 0 ? null : 'CNDT deve ser maior que zero.'),
  dominio: () => ({ CNDT: DOMINIO_PBMIC.CNDT }),
  dominioSaida: () => FAIXA_PB_G,
  coeficientes: () => ({
    ...coeficientesPBmic(),
    fatorPBmic: PNDR.fatorPBmic.valor,
    digestibilidade: PNDR.digestibilidade.valor,
  }),
  calcular: (e, k) => {
    const cndt = e['CNDT']!;
    const a = k['a']! + k['bCNDT']! * cndt + k['bCNDT2']! * cndt ** 2;
    const r = 1 - k['fatorPBmic']! / k['digestibilidade']!;
    return (r * a + e['PMt']! / k['digestibilidade']!) / (1 - (r * k['bCPB']!) / G_POR_KG);
  },
  // D-PROT-09: PB abaixo da PBmic implica PNDR negativa; sinalizada, nunca corrigida.
  consistenciaSaida: (pb, e, k) => {
    const pbmic =
      k['a']! +
      (k['bCPB']! * pb) / G_POR_KG +
      k['bCNDT']! * e['CNDT']! +
      k['bCNDT2']! * e['CNDT']! ** 2;
    return pb - pbmic < 0 ? PNDR_NEGATIVA : null;
  },
  notasFixas: [
    AVISO_EXIGENCIA,
    'Circularidade CPB = PB resolvida em forma fechada, sem iteração (P-06).',
  ],
  conferencia: conferidaProteina([60, 219]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)', 'T-06 (Tabelas 17.3a a 17.12a)'],
};

export const PBMIC_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-07',
  descricao: 'PBmic = –53,07 + 304,9 × CPB + 90,8 × CNDT – 3,13 × CNDT² (CPB = PB / 1000)',
  referencias: [
    { capitulo: 3, pagina: 60, local: 'equação e Tabela 3.7' },
    { capitulo: 9, pagina: 219, local: 'texto' },
    { capitulo: 9, pagina: 227, local: 'Tabela 9.14' },
  ],
  entradas: { PB: 'g/dia', CNDT: 'kg/dia' },
  saida: 'g/dia',
  escopo: escopoDaCategoria,
  dominio: () => ({ PB: FAIXA_PB_G, CNDT: DOMINIO_PBMIC.CNDT }),
  coeficientes: coeficientesPBmic,
  calcular: (e, k) =>
    k['a']! +
    k['bCPB']! * (e['PB']! / G_POR_KG) +
    k['bCNDT']! * e['CNDT']! +
    k['bCNDT2']! * e['CNDT']! ** 2,
  avisosFixos: [AVISO_EE],
  notasFixas: [AVISO_EXIGENCIA],
  conferencia: conferidaProteina([60, 219]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)'],
};

export const PDR_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-08',
  descricao: 'PDR = PBmic',
  referencias: [
    { capitulo: 9, pagina: 219, local: 'texto' },
    { capitulo: 9, pagina: 227, local: 'Tabela 9.14' },
  ],
  entradas: { PBmic: 'g/dia' },
  saida: 'g/dia',
  escopo: escopoDaCategoria,
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => e['PBmic']!,
  avisosFixos: [
    'Exigência de PDR igual à síntese de PBmic; reciclagem de N não considerada (p. 219). Não usa dado de degradação ruminal de alimento.',
  ],
  conferencia: conferidaProteina([219]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)', 'T-06 (Tabelas 17.3a a 17.12a)'],
};

export const PNDR_EQ: EquacaoRegistrada = {
  id: 'BRC23-R-09',
  descricao: 'PNDR = (PMt – (PBmic × 0,64)) / 0,80',
  referencias: [
    { capitulo: 9, pagina: 219, local: 'texto' },
    { capitulo: 9, pagina: 227, local: 'Tabela 9.14' },
  ],
  entradas: { PMt: 'g/dia', PBmic: 'g/dia' },
  saida: 'g/dia',
  escopo: escopoDaCategoria,
  dominio: () => ({}),
  coeficientes: () => ({
    fatorPBmic: PNDR.fatorPBmic.valor,
    digestibilidade: PNDR.digestibilidade.valor,
  }),
  calcular: (e, k) => (e['PMt']! - e['PBmic']! * k['fatorPBmic']!) / k['digestibilidade']!,
  consistenciaSaida: (v) => (v < 0 ? PNDR_NEGATIVA : null),
  conferencia: conferidaProteina([219]),
  casosDeTeste: ['T-02 (p. 227)', 'T-04 (p. 433)', 'T-06 (Tabelas 17.3a a 17.12a)'],
};

/**
 * Indicadores derivados (R-11 a R-13; D-PROT-08): colunas "PB, %", "PDR, % PB" e "PNDR, % PB"
 * das Tabelas 17.3a a 17.12a (p. 441–468) e células Q34, Q30 e Q32 da planilha oficial. Razões
 * das exigências, não composição de dieta; denominador zero ou ausente não calcula.
 */
const indicador = (
  id: string,
  descricao: string,
  num: string,
  den: string,
  saida: '% MS' | '% PB',
  fator: number,
  coluna: string,
): EquacaoRegistrada => ({
  id,
  descricao,
  referencias: [{ capitulo: 17, pagina: 441, local: `Tabelas 17.3a a 17.12a, coluna "${coluna}"` }],
  entradas: { [num]: 'g/dia', [den]: saida === '% MS' ? 'kg/dia' : 'g/dia' },
  saida,
  escopo: escopoDaCategoria,
  escopoEntradas: (e) => (e[den]! > 0 ? null : `${den} deve ser maior que zero.`),
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => ((e[num]! / fator) * 100) / e[den]!,
  conferencia: conferidaProteina([441, 468]),
  casosDeTeste: ['T-06 (Tabelas 17.3a a 17.12a)'],
});

/** PB (% da MS) = (PB / 1000) / CMS × 100 (planilha, Q34). */
export const PB_PCT_MS_EQ = indicador(
  'BRC23-R-11',
  'PB (% da MS) = (PB / 1000) / CMS × 100',
  'PB',
  'CMS',
  '% MS',
  G_POR_KG,
  'PB, %',
);
/** PDR (% da PB) = PDR / PB × 100 (planilha, Q30). */
export const PDR_PCT_PB_EQ = indicador(
  'BRC23-R-12',
  'PDR (% da PB) = PDR / PB × 100',
  'PDR',
  'PB',
  '% PB',
  1,
  'PDR, % PB',
);
/** PNDR (% da PB) = PNDR / PB × 100 (planilha, Q32). */
export const PNDR_PCT_PB_EQ = indicador(
  'BRC23-R-13',
  'PNDR (% da PB) = PNDR / PB × 100',
  'PNDR',
  'PB',
  '% PB',
  1,
  'PNDR, % PB',
);

export const EQUACOES_PROTEINA: readonly EquacaoRegistrada[] = [
  PMM_EQ,
  PLG_EQ,
  K_PROTEINA_EQ,
  PMG_EQ,
  PMT_EQ,
  PBMIC_EQ,
  PDR_EQ,
  PNDR_EQ,
  PB_EQ,
  PB_PCT_MS_EQ,
  PDR_PCT_PB_EQ,
  PNDR_PCT_PB_EQ,
];

export function registroProteina(): RegistroEquacoes {
  const r = new RegistroEquacoes();
  for (const e of EQUACOES_PROTEINA) r.registrar(e);
  return r;
}

const NOS_PROTEINA: readonly NoCalculo[] = [
  { id: 'PMm', equacao: PMM_EQ, origens: { PCJ: 'PCJ' } },
  { id: 'PLg', equacao: PLG_EQ, origens: { GPCVZ: 'GPCVZ', PCVZeq: 'PCVZeq' } },
  { id: 'kProteina', equacao: K_PROTEINA_EQ, origens: { PCJ: 'PCJ', PCVZeq: 'PCVZeq' } },
  { id: 'PMg', equacao: PMG_EQ, origens: { PLg: 'PLg', k: 'kProteina' } },
  { id: 'PMt', equacao: PMT_EQ, origens: { PMm: 'PMm', PMg: 'PMg' } },
  { id: 'PB', equacao: PB_EQ, origens: { PMt: 'PMt', CNDT: 'NDT' } },
  { id: 'PBmic', equacao: PBMIC_EQ, origens: { PB: 'PB', CNDT: 'NDT' } },
  { id: 'PDR', equacao: PDR_EQ, origens: { PBmic: 'PBmic' } },
  { id: 'PNDR', equacao: PNDR_EQ, origens: { PMt: 'PMt', PBmic: 'PBmic' } },
  { id: 'PBpctMS', equacao: PB_PCT_MS_EQ, origens: { PB: 'PB', CMS: 'CMS' } },
  { id: 'PDRpctPB', equacao: PDR_PCT_PB_EQ, origens: { PDR: 'PDR', PB: 'PB' } },
  { id: 'PNDRpctPB', equacao: PNDR_PCT_PB_EQ, origens: { PNDR: 'PNDR', PB: 'PB' } },
];

export const RESULTADOS_PROTEINA = [
  ...RESULTADOS_ENERGIA,
  'PMm',
  'PLg',
  'kProteina',
  'PMg',
  'PMt',
  'PB',
  'PBmic',
  'PDR',
  'PNDR',
  'PBpctMS',
  'PDRpctPB',
  'PNDRpctPB',
] as const;
export type ResultadoProteina = Record<(typeof RESULTADOS_PROTEINA)[number], Resultado>;

/**
 * Exigências de proteína (com peso, energia e CMS, de que dependem): PC médio (kg), GMD (kg/dia)
 * e fonte do CMS. PB, PBmic, PDR e PNDR dependem do NDT exigido e, por ele, do CMS; o CMS usado
 * fica registrado nos avisos. Precisão integral em todas as etapas.
 */
export function calcularProteina(c: Categoria, entradas: EntradasAnimal): ResultadoProteina {
  const r = calcularGrafo(
    [...nosEnergia(c, entradas.cms), ...NOS_PROTEINA],
    c,
    entradasDoGrafo(entradas),
  );
  identificarCms(r, entradas.cms, [
    'ED',
    'NDT',
    'NDTpct',
    'PB',
    'PBmic',
    'PDR',
    'PNDR',
    'PBpctMS',
    'PDRpctPB',
    'PNDRpctPB',
  ]);
  return Object.fromEntries(RESULTADOS_PROTEINA.map((id) => [id, r.get(id)!])) as ResultadoProteina;
}
