import type { Categoria, Resultado } from '../nucleo/tipos';
import type { EquacaoRegistrada } from '../nucleo/registro';
import { RegistroEquacoes } from '../nucleo/registro';
import { calcularGrafo, type NoCalculo } from '../nucleo/grafo';
import type { Quantidade } from '../nucleo/unidades';
import { APROVACAO_ENERGIA, conferidaNaImagem } from './fonte';
import { dominioDaCategoria, escopoDaCategoria } from './dados/dominios';
import { ED_EM, ELG, ELM, ERPROT, KG, KM, NDT_ED } from './dados/energia';
import { nosPeso } from './peso';
import {
  CMS_CONCENTRADO_EQ,
  CMS_CONFINAMENTO_EQ,
  CMS_INFORMADO_NO,
  CMS_PASTO_EQ,
  CMS_TIP_EQ,
} from './cms';

/*
 * Grupo energia (entrega 6A-3; INVENTARIO_BR_CORTE.md, seção 3.2): exigências de energia de
 * bovinos em crescimento e terminação. Mesmas categorias e escopo do grupo peso. ED, NDT e
 * NDT % usam o CMS previsto (6A-4) ou o informado, à escolha de quem chama, e o resultado diz qual
 * foi usado. Ganho a partir da energia (E-16) não é implementado (P-09). Equações aprovadas pelo
 * usuário (APROVACAO_ENERGIA).
 */

/** Faixa de GPCVZ ou PCVZ da categoria (Tabelas 8.1 a 8.4), quando coberta. */
const faixaCategoria = (c: Categoria, campo: 'GPCVZ' | 'PCVZ') => {
  const d = dominioDaCategoria(c);
  return d ? { [campo]: d[campo] } : {};
};
const PAGINAS_RESUMO = [198, 199, 432, 433];
const conferidaEnergia = (paginas: number[]) =>
  conferidaNaImagem([...paginas, ...PAGINAS_RESUMO], APROVACAO_ENERGIA);

export const ELM_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-01',
  descricao: 'ELm = 0,075 × PCVZ^0,75',
  referencias: [
    { capitulo: 8, pagina: 184, local: '75 kcal/PCVZ^0,75/dia (texto)' },
    { capitulo: 8, pagina: 185, local: 'mesmo valor a pasto (texto)' },
    { capitulo: 8, pagina: 198, local: 'Tabela 8.9' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { PCVZ: 'kg' },
  saida: 'Mcal/dia',
  escopo: escopoDaCategoria,
  dominio: (c) => faixaCategoria(c, 'PCVZ'),
  coeficientes: () => ({ a: ELM.a.valor, expoente: ELM.expoente.valor }),
  calcular: (e, k) => k['a']! * e['PCVZ']! ** k['expoente']!,
  conferencia: conferidaEnergia([184, 185]),
  casosDeTeste: ['T-01 (p. 199)', 'T-04 (p. 433)', 'T-06 (Tabelas 17.3a a 17.12a)'],
};

export const ELG_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-02-03',
  descricao: 'ELg = β0 × PCVZeq^0,75 × GPCVZ^β1 (Eq. 8.20 confinamento; Eq. 8.21 pasto)',
  referencias: [
    { capitulo: 8, pagina: 191, local: 'Eq. 8.20 e 8.21' },
    { capitulo: 8, pagina: 198, local: 'Tabela 8.9' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { PCVZeq: 'kg', GPCVZ: 'kg/dia' },
  saida: 'Mcal/dia',
  escopo: escopoDaCategoria,
  dominio: (c) => faixaCategoria(c, 'GPCVZ'),
  coeficientes: (c) => {
    const p = ELG[c.sistema];
    return { b0: p.b0.valor, expoentePCVZeq: p.expoentePCVZeq.valor, b1: p.b1.valor };
  },
  calcular: (e, k) => k['b0']! * e['PCVZeq']! ** k['expoentePCVZeq']! * e['GPCVZ']! ** k['b1']!,
  conferencia: conferidaEnergia([191]),
  casosDeTeste: ['T-01 (p. 199)', 'T-04 (p. 432)', 'T-06 (Tabelas 17.3a a 17.12a)'],
};

export const ERPROT_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-04',
  descricao: 'ERprot = 1,140 × (ER / GPCVZ)^-1,137 (Eq. 8.31)',
  referencias: [
    { capitulo: 8, pagina: 197, local: 'Eq. 8.31' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { ER: 'Mcal/dia', GPCVZ: 'kg/dia' },
  saida: 'adimensional',
  escopo: escopoDaCategoria,
  // P-01: com GPCVZ = 0, ER = 0 e ER / GPCVZ é 0/0: a equação não é definida.
  escopoEntradas: (e) =>
    e['GPCVZ']! > 0
      ? null
      : 'ERprot não é definida com ganho zero (ER / GPCVZ = 0/0); P-01, pendência D-EN-04.',
  dominio: (c) => faixaCategoria(c, 'GPCVZ'),
  coeficientes: () => ({ a: ERPROT.a.valor, b: ERPROT.b.valor }),
  calcular: (e, k) => k['a']! * (e['ER']! / e['GPCVZ']!) ** k['b']!,
  conferencia: conferidaEnergia([197]),
  casosDeTeste: ['T-01 (p. 199)', 'T-04 (p. 433)'],
};

export const KG_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-05',
  descricao: 'kg = 0,327 / (0,539 + ERprot) (Eq. 8.28)',
  referencias: [
    { capitulo: 8, pagina: 197, local: 'Eq. 8.28' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { ERprot: 'adimensional' },
  saida: 'fração',
  escopo: escopoDaCategoria,
  dominio: () => ({}),
  coeficientes: () => ({ numerador: KG.numerador.valor, constante: KG.constante.valor }),
  calcular: (e, k) => k['numerador']! / (k['constante']! + e['ERprot']!),
  conferencia: conferidaEnergia([197]),
  casosDeTeste: ['T-01 (p. 199)', 'T-04 (p. 433)'],
};

export const KM_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-06-09',
  descricao:
    'km = [0,513 + (0,173 × kg) + (β2 × GPCVZ)] × θ (Eq. 8.12 confinamento; Eq. 8.16 pasto)',
  referencias: [
    { capitulo: 8, pagina: 186, local: 'Eq. 8.12' },
    { capitulo: 8, pagina: 187, local: 'Eq. 8.16' },
    { capitulo: 8, pagina: 198, local: 'Tabela 8.9' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { kg: 'fração', GPCVZ: 'kg/dia' },
  saida: 'fração',
  escopo: escopoDaCategoria,
  dominio: (c) => faixaCategoria(c, 'GPCVZ'),
  coeficientes: (c) => ({
    b0: KM.b0.valor,
    b1: KM.b1.valor,
    b2: c.sistema === 'pasto' ? KM.b2Pasto.valor : KM.b2Confinamento[c.grupo].valor,
    theta: c.sistema === 'pasto' ? KM.thetaPasto.valor : KM.thetaConfinamento.valor,
  }),
  calcular: (e, k) => (k['b0']! + k['b1']! * e['kg']! + k['b2']! * e['GPCVZ']!) * k['theta']!,
  conferencia: conferidaEnergia([186, 187]),
  casosDeTeste: ['T-01 (p. 199)', 'T-04 (p. 433)', 'T-06 (Tabelas 17.3a a 17.12a)'],
};

const razao = (
  id: string,
  descricao: string,
  num: string,
  den: string,
  local: string,
): EquacaoRegistrada => ({
  id,
  descricao,
  referencias: [
    { capitulo: 8, pagina: 198, local: `Tabela 8.9, ${local}` },
    { capitulo: 8, pagina: 199, local: `Tabela 8.10, ${local}` },
  ],
  entradas: { [num]: 'Mcal/dia', [den]: 'fração' },
  saida: 'Mcal/dia',
  escopo: escopoDaCategoria,
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => e[num]! / e[den]!,
  conferencia: conferidaEnergia([]),
  casosDeTeste: ['T-01 (p. 199)', 'T-04 (p. 433)'],
});

export const EMM_EQ = razao('BRC23-E-10', 'EMm = ELm / km', 'ELm', 'km', 'EMm');
export const EMG_EQ = razao('BRC23-E-11', 'EMg = ELg / kg', 'ELg', 'kg', 'EMg');

export const EMTOTAL_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-12',
  descricao: 'EMtotal = EMm + EMg',
  referencias: [
    { capitulo: 8, pagina: 198, local: 'Tabela 8.9' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { EMm: 'Mcal/dia', EMg: 'Mcal/dia' },
  saida: 'Mcal/dia',
  escopo: escopoDaCategoria,
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => e['EMm']! + e['EMg']!,
  conferencia: conferidaEnergia([]),
  casosDeTeste: ['T-04 (p. 433)', 'T-06 (Tabelas 17.3a a 17.12a)'],
};

export const ED_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-13',
  descricao: 'ED = {[(EMtotal / CMS) + 0,3032] / 0,9455} × CMS',
  referencias: [
    { capitulo: 7, pagina: 174, local: 'Figura 7.5: EM = 0,9455 × ED – 0,3032 (Mcal/kg MS)' },
    { capitulo: 8, pagina: 198, local: 'Tabela 8.9' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { EMtotal: 'Mcal/dia', CMS: 'kg/dia' },
  saida: 'Mcal/dia',
  escopo: escopoDaCategoria,
  escopoEntradas: (e) => (e['CMS']! > 0 ? null : 'CMS deve ser maior que zero.'),
  dominio: () => ({}),
  coeficientes: () => ({
    inclinacao: ED_EM.inclinacao.valor,
    intercepto: ED_EM.intercepto.valor,
  }),
  calcular: (e, k) =>
    ((e['EMtotal']! / e['CMS']! + k['intercepto']!) / k['inclinacao']!) * e['CMS']!,
  avisosFixos: ['Faixa de validade da relação ED–EM não tabelada no livro (Figura 7.5, p. 174).'],
  conferencia: conferidaEnergia([174]),
  casosDeTeste: ['T-01 (p. 200)', 'T-04 (p. 433)'],
};

export const NDT_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-14',
  descricao: 'NDT = ED / 4,4',
  referencias: [
    { capitulo: 8, pagina: 198, local: 'Tabela 8.9' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { ED: 'Mcal/dia' },
  saida: 'kg/dia',
  escopo: escopoDaCategoria,
  dominio: () => ({}),
  coeficientes: () => ({ divisor: NDT_ED.divisor.valor }),
  calcular: (e, k) => e['ED']! / k['divisor']!,
  conferencia: conferidaEnergia([]),
  casosDeTeste: ['T-01 (p. 200)', 'T-04 (p. 433)'],
};

export const NDT_PCT_EQ: EquacaoRegistrada = {
  id: 'BRC23-E-15',
  descricao: 'NDT (%) = NDT × 100 / CMS',
  referencias: [{ capitulo: 17, pagina: 433, local: 'Passo 7' }],
  entradas: { NDT: 'kg/dia', CMS: 'kg/dia' },
  saida: '% MS',
  escopo: escopoDaCategoria,
  escopoEntradas: (e) => (e['CMS']! > 0 ? null : 'CMS deve ser maior que zero.'),
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => (e['NDT']! * 100) / e['CMS']!,
  conferencia: conferidaEnergia([]),
  casosDeTeste: ['T-04 (p. 433)'],
};

export const EQUACOES_ENERGIA: readonly EquacaoRegistrada[] = [
  ELM_EQ,
  ELG_EQ,
  ERPROT_EQ,
  KG_EQ,
  KM_EQ,
  EMM_EQ,
  EMG_EQ,
  EMTOTAL_EQ,
  ED_EQ,
  NDT_EQ,
  NDT_PCT_EQ,
];

export function registroEnergia(): RegistroEquacoes {
  const r = new RegistroEquacoes();
  for (const e of EQUACOES_ENERGIA) r.registrar(e);
  return r;
}

/**
 * De onde vem o CMS usado em ED, NDT e NDT % (A-08, P-07):
 * - informado: valor dado pelo usuário, em kg/dia;
 * - previsto, confinamento: Eq. 2.1 a 2.3, por grupo genético;
 * - previsto, concentrado: Eq. 2.4 e 2.5, com o teor de concentrado da dieta (NC, % da MS);
 * - previsto, pasto: Eq. 2.6 (zebuínos), com o consumo de suplemento (CMSs, kg/dia);
 * - previsto, terminação intensiva a pasto: Eq. 2.1 em zebuínos machos a pasto (p. 37; D-CMS-01).
 *   Só o CMS muda; o sistema do animal continua pasto no peso e na energia.
 * A equação não é escolhida pelo motor; equação incompatível com a categoria fica fora do escopo.
 */
export type FonteCms =
  | { origem: 'informado'; CMS: Quantidade | null }
  | { origem: 'previsto'; equacao: 'confinamento' }
  | { origem: 'previsto'; equacao: 'concentrado'; NC: Quantidade | null }
  | { origem: 'previsto'; equacao: 'pasto'; CMSs: Quantidade | null }
  | { origem: 'previsto'; equacao: 'terminacao_intensiva_pasto' };

function noCms(f: FonteCms): NoCalculo {
  if (f.origem === 'informado')
    return { id: 'CMS', equacao: CMS_INFORMADO_NO, origens: { CMS: 'entrada:CMS' } };
  const base = { PC: 'entrada:PC', GMD: 'entrada:GMD' };
  if (f.equacao === 'confinamento')
    return { id: 'CMS', equacao: CMS_CONFINAMENTO_EQ, origens: base };
  if (f.equacao === 'terminacao_intensiva_pasto')
    return { id: 'CMS', equacao: CMS_TIP_EQ, origens: base };
  if (f.equacao === 'concentrado')
    return { id: 'CMS', equacao: CMS_CONCENTRADO_EQ, origens: { ...base, NC: 'entrada:NC' } };
  return { id: 'CMS', equacao: CMS_PASTO_EQ, origens: { ...base, CMSs: 'entrada:CMSs' } };
}

export function nosEnergia(c: Categoria, f: FonteCms): NoCalculo[] {
  return [
    noCms(f),
    ...nosPeso(c),
    { id: 'ELm', equacao: ELM_EQ, origens: { PCVZ: 'PCVZ' } },
    { id: 'ELg', equacao: ELG_EQ, origens: { PCVZeq: 'PCVZeq', GPCVZ: 'GPCVZ' } },
    { id: 'ERprot', equacao: ERPROT_EQ, origens: { ER: 'ELg', GPCVZ: 'GPCVZ' } },
    { id: 'kg', equacao: KG_EQ, origens: { ERprot: 'ERprot' } },
    { id: 'km', equacao: KM_EQ, origens: { kg: 'kg', GPCVZ: 'GPCVZ' } },
    { id: 'EMm', equacao: EMM_EQ, origens: { ELm: 'ELm', km: 'km' } },
    { id: 'EMg', equacao: EMG_EQ, origens: { ELg: 'ELg', kg: 'kg' } },
    { id: 'EMtotal', equacao: EMTOTAL_EQ, origens: { EMm: 'EMm', EMg: 'EMg' } },
    { id: 'ED', equacao: ED_EQ, origens: { EMtotal: 'EMtotal', CMS: 'CMS' } },
    { id: 'NDT', equacao: NDT_EQ, origens: { ED: 'ED' } },
    { id: 'NDTpct', equacao: NDT_PCT_EQ, origens: { NDT: 'NDT', CMS: 'CMS' } },
  ];
}

export const RESULTADOS_ENERGIA = [
  'PCJ',
  'PCVZ',
  'PCVZeq',
  'GPCVZ',
  'ELm',
  'ELg',
  'ERprot',
  'kg',
  'km',
  'EMm',
  'EMg',
  'EMtotal',
  'CMS',
  'ED',
  'NDT',
  'NDTpct',
] as const;
export type ResultadoEnergia = Record<(typeof RESULTADOS_ENERGIA)[number], Resultado>;

/** Entradas do animal comuns às cadeias de energia e proteína. */
export interface EntradasAnimal {
  PC: Quantidade | null;
  GMD: Quantidade | null;
  cms: FonteCms;
}

/** Entradas do grafo a partir das entradas do animal e da fonte do CMS. */
export function entradasDoGrafo(entradas: EntradasAnimal): Record<string, Quantidade | null> {
  const f = entradas.cms;
  return {
    PC: entradas.PC,
    GMD: entradas.GMD,
    CMS: f.origem === 'informado' ? f.CMS : null,
    NC: f.origem === 'previsto' && f.equacao === 'concentrado' ? f.NC : null,
    CMSs: f.origem === 'previsto' && f.equacao === 'pasto' ? f.CMSs : null,
  };
}

/** Registra nos resultados que dependem do CMS qual CMS foi usado. */
export function identificarCms(
  r: Map<string, Resultado>,
  f: FonteCms,
  ids: readonly string[],
): void {
  const usado =
    f.origem === 'informado'
      ? 'CMS usado: informado pelo usuário.'
      : `CMS usado: previsto pelo motor (${r.get('CMS')!.equacaoId}).`;
  for (const id of ids) r.get(id)!.notas.push(usado);
}

/**
 * Exigências de energia: PC médio do período (kg), GMD (kg/dia) e a fonte do CMS (FonteCms).
 * Precisão integral em todas as etapas. O resultado CMS traz a equação usada (equacaoId:
 * "CMS-INFORMADO" ou a do livro); ED, NDT e NDT % levam o mesmo registro nos avisos.
 */
export function calcularEnergia(c: Categoria, entradas: EntradasAnimal): ResultadoEnergia {
  const r = calcularGrafo(nosEnergia(c, entradas.cms), c, entradasDoGrafo(entradas));
  identificarCms(r, entradas.cms, ['ED', 'NDT', 'NDTpct']);
  return Object.fromEntries(RESULTADOS_ENERGIA.map((id) => [id, r.get(id)!])) as ResultadoEnergia;
}
