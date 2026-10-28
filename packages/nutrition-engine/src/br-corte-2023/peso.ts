import type { Categoria, Resultado } from '../nucleo/tipos';
import type { EquacaoRegistrada, FaixaDominio } from '../nucleo/registro';
import { RegistroEquacoes } from '../nucleo/registro';
import { calcularGrafo, type NoCalculo } from '../nucleo/grafo';
import type { Quantidade } from '../nucleo/unidades';
import { APROVACAO_PESO, conferidaNaImagem } from './fonte';
import {
  GPCVZ_EQ_1_12,
  PCJ_EQ_1_3,
  PCJ_EQ_1_4,
  PCVZ_CONFINAMENTO,
  PCVZ_MATURIDADE,
  PCVZ_PASTO_EQ_1_5,
  PCVZ_REFERENCIA,
  type PotenciaPublicada,
} from './dados/peso';
import {
  DOMINIO_RELACOES_PESO,
  dominioDaCategoria,
  escopoDaCategoria,
  intersecao,
} from './dados/dominios';

/*
 * Grupo peso (entrega 6A-2; INVENTARIO_BR_CORTE.md, seções 3.1 e 12). Bovinos em crescimento e
 * terminação "em fase de crescimento positivo" (p. 11). Categorias: as nove em confinamento e,
 * a pasto, só zebuínos machos (P-03). GMD negativo fora do escopo (P-01).
 */

const escopoCategoria = escopoDaCategoria;

const potencia = (p: PotenciaPublicada) => ({ a: p.a.valor, b: p.b.valor });
const aXb = (x: number, k: Readonly<Record<string, number>>) => k['a']! * x ** k['b']!;

/** Domínio de uma entrada: Tabela 1.2 e a faixa da categoria, o mais estreito. */
function faixa(c: Categoria, campo: 'PCJ' | 'PCVZ' | 'GMD', geral: FaixaDominio): FaixaDominio {
  const d = dominioDaCategoria(c);
  return d ? intersecao(geral, d[campo]) : geral;
}

export const PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO: EquacaoRegistrada = {
  id: 'BRC23-P-01',
  descricao: 'PCJ = 0,8915 × PC^1,0151 (zebuínos e cruzados de corte; todos a pasto)',
  referencias: [
    { capitulo: 1, pagina: 8, local: 'Eq. 1.3' },
    { capitulo: 1, pagina: 11, local: 'Eq. 1.3' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
    { capitulo: 9, pagina: 226, local: 'Tabela 9.13' },
  ],
  entradas: { PC: 'kg' },
  saida: 'kg',
  escopo: (c) =>
    escopoCategoria(c) ??
    (c.sistema === 'confinamento' && c.grupo === 'cruzado_leite'
      ? 'Cruzado de leite em confinamento usa a Eq. 1.4.'
      : null),
  dominio: () => ({ PC: DOMINIO_RELACOES_PESO.PC }),
  coeficientes: () => potencia(PCJ_EQ_1_3),
  calcular: (e, k) => aXb(e['PC']!, k),
  conferencia: conferidaNaImagem([8, 11, 199, 226], APROVACAO_PESO),
  casosDeTeste: ['T-07 (Tabela 1.5, p. 8)', 'T-01 (p. 199)', 'T-03 (p. 264)', 'T-12 (planilha)'],
};

export const PCJ_CRUZADO_LEITE: EquacaoRegistrada = {
  id: 'BRC23-P-02',
  descricao: 'PCJ = 0,9247 × PC^1,0085 (cruzados de leite em confinamento)',
  referencias: [
    { capitulo: 1, pagina: 8, local: 'Eq. 1.4' },
    { capitulo: 1, pagina: 11, local: 'Eq. 1.4' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { PC: 'kg' },
  saida: 'kg',
  escopo: (c) =>
    escopoCategoria(c) ??
    (c.sistema === 'confinamento' && c.grupo === 'cruzado_leite'
      ? null
      : 'A Eq. 1.4 é só de cruzados de leite em confinamento (a pasto, Eq. 1.3; p. 8).'),
  dominio: () => ({ PC: DOMINIO_RELACOES_PESO.PC }),
  coeficientes: () => potencia(PCJ_EQ_1_4),
  calcular: (e, k) => aXb(e['PC']!, k),
  conferencia: conferidaNaImagem([8, 11, 199], APROVACAO_PESO),
  casosDeTeste: ['T-07 (Tabela 1.5, p. 8)'],
};

/** PCVZ em confinamento (Eq. 1.6 a 1.11): coeficientes por grupo ("cruzados de corte e de leite") e sexo. */
export const PCVZ_CONFINAMENTO_EQ: EquacaoRegistrada = {
  id: 'BRC23-P-03-08',
  descricao:
    'PCVZ = a × PCJ^b em confinamento, por grupo genético e classe sexual (Eq. 1.6 a 1.11)',
  referencias: [
    { capitulo: 1, pagina: 9, local: 'Tabela 1.6' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
    { capitulo: 9, pagina: 226, local: 'Tabela 9.13' },
  ],
  entradas: { PCJ: 'kg' },
  saida: 'kg',
  escopo: (c) =>
    escopoCategoria(c) ?? (c.sistema === 'confinamento' ? null : 'A pasto, PCVZ pela Eq. 1.5.'),
  dominio: (c) => ({ PCJ: faixa(c, 'PCJ', DOMINIO_RELACOES_PESO.PCJ) }),
  coeficientes: (c) =>
    potencia(PCVZ_CONFINAMENTO[c.grupo === 'zebuino' ? 'zebuino' : 'cruzado'][c.sexo]),
  calcular: (e, k) => aXb(e['PCJ']!, k),
  conferencia: conferidaNaImagem([9, 199, 226], APROVACAO_PESO),
  casosDeTeste: [
    'T-08 (Tabela 1.7, p. 9)',
    'T-09 (Tabela 1.8, p. 10)',
    'T-01 (p. 199)',
    'T-12 (planilha)',
  ],
};

export const PCVZ_PASTO: EquacaoRegistrada = {
  id: 'BRC23-P-09',
  descricao: 'PCVZ = 0,8507 × PCJ^1,0002 a pasto (Eq. 1.5)',
  referencias: [
    { capitulo: 1, pagina: 8, local: 'Eq. 1.5' },
    { capitulo: 8, pagina: 198, local: 'Tabela 8.9' },
    { capitulo: 9, pagina: 226, local: 'Tabela 9.13' },
  ],
  entradas: { PCJ: 'kg' },
  saida: 'kg',
  escopo: (c) =>
    escopoCategoria(c) ?? (c.sistema === 'pasto' ? null : 'Em confinamento, Eq. 1.6 a 1.11.'),
  dominio: (c) => ({ PCJ: faixa(c, 'PCJ', DOMINIO_RELACOES_PESO.PCJ) }),
  coeficientes: () => potencia(PCVZ_PASTO_EQ_1_5),
  calcular: (e, k) => aXb(e['PCJ']!, k),
  conferencia: conferidaNaImagem([8, 198, 226], APROVACAO_PESO),
  casosDeTeste: ['T-08 (Tabela 1.7, p. 9)'],
};

export const GPCVZ: EquacaoRegistrada = {
  id: 'BRC23-P-10',
  descricao: 'GPCVZ = 0,9630 × GMD^1,0151 (Eq. 1.12)',
  referencias: [
    { capitulo: 1, pagina: 10, local: 'Eq. 1.12' },
    { capitulo: 8, pagina: 192, local: 'Eq. 8.24' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
  ],
  entradas: { GMD: 'kg/dia' },
  saida: 'kg/dia',
  escopo: escopoCategoria,
  escopoEntradas: (e) => (e['GMD']! < 0 ? 'GMD negativo fora do escopo (P-01).' : null),
  dominio: (c) => ({ GMD: faixa(c, 'GMD', DOMINIO_RELACOES_PESO.GMD) }),
  coeficientes: () => potencia(GPCVZ_EQ_1_12),
  calcular: (e, k) => aXb(e['GMD']!, k),
  conferencia: conferidaNaImagem([10, 192, 199], APROVACAO_PESO),
  casosDeTeste: ['T-10 (Tabela 1.9, p. 11)', 'T-01 (p. 199)', 'T-04 (p. 432)', 'T-12 (planilha)'],
};

export const PCVZ_EQUIVALENTE: EquacaoRegistrada = {
  id: 'BRC23-P-11',
  descricao: 'PCVZeq = (PCVZ / PCVZmat) × 517 (Tabela 8.5 e Tabela 9.13)',
  referencias: [
    { capitulo: 8, pagina: 190, local: 'Tabela 8.5' },
    { capitulo: 8, pagina: 199, local: 'Tabela 8.10' },
    { capitulo: 9, pagina: 226, local: 'Tabela 9.13' },
  ],
  entradas: { PCVZ: 'kg' },
  saida: 'kg',
  escopo: escopoCategoria,
  dominio: (c) => ({ PCVZ: faixa(c, 'PCVZ', DOMINIO_RELACOES_PESO.PCVZ) }),
  coeficientes: (c) => ({
    PCVZmat: PCVZ_MATURIDADE[c.grupo][c.sexo].valor,
    referencia: PCVZ_REFERENCIA.valor,
  }),
  calcular: (e, k) => (e['PCVZ']! / k['PCVZmat']!) * k['referencia']!,
  conferencia: conferidaNaImagem([190, 199, 226], APROVACAO_PESO),
  casosDeTeste: ['T-11 (p. 192)', 'T-01 (p. 199)', 'T-12 (planilha)'],
};

export const EQUACOES_PESO: readonly EquacaoRegistrada[] = [
  PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO,
  PCJ_CRUZADO_LEITE,
  PCVZ_CONFINAMENTO_EQ,
  PCVZ_PASTO,
  GPCVZ,
  PCVZ_EQUIVALENTE,
];

/** Registro das equações de peso; recusa equação sem conferência ou caso de teste. */
export function registroPeso(): RegistroEquacoes {
  const r = new RegistroEquacoes();
  for (const e of EQUACOES_PESO) r.registrar(e);
  return r;
}

/** Escolhe a equação de PCJ e de PCVZ da categoria, como o livro indica. */
export function nosPeso(c: Categoria): NoCalculo[] {
  const pcj =
    c.sistema === 'confinamento' && c.grupo === 'cruzado_leite'
      ? PCJ_CRUZADO_LEITE
      : PCJ_ZEBUINO_CRUZADO_CORTE_E_PASTO;
  const pcvz = c.sistema === 'pasto' ? PCVZ_PASTO : PCVZ_CONFINAMENTO_EQ;
  return [
    { id: 'PCJ', equacao: pcj, origens: { PC: 'entrada:PC' } },
    { id: 'PCVZ', equacao: pcvz, origens: { PCJ: 'PCJ' } },
    { id: 'PCVZeq', equacao: PCVZ_EQUIVALENTE, origens: { PCVZ: 'PCVZ' } },
    { id: 'GPCVZ', equacao: GPCVZ, origens: { GMD: 'entrada:GMD' } },
  ];
}

export interface ResultadoPeso {
  PCJ: Resultado;
  PCVZ: Resultado;
  PCVZeq: Resultado;
  GPCVZ: Resultado;
}

/** Cadeia de peso de um animal: PC (kg) e GMD (kg/dia) → PCJ, PCVZ, PCVZeq e GPCVZ. */
export function calcularPeso(
  c: Categoria,
  entradas: { PC: Quantidade | null; GMD: Quantidade | null },
): ResultadoPeso {
  const r = calcularGrafo(nosPeso(c), c, entradas);
  return {
    PCJ: r.get('PCJ')!,
    PCVZ: r.get('PCVZ')!,
    PCVZeq: r.get('PCVZeq')!,
    GPCVZ: r.get('GPCVZ')!,
  };
}
