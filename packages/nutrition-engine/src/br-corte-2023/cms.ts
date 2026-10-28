import type { Categoria } from '../nucleo/tipos';
import type { EquacaoRegistrada } from '../nucleo/registro';
import { RegistroEquacoes } from '../nucleo/registro';
import { APROVACAO_CMS, conferidaNaImagem } from './fonte';
import { CMS_CONCENTRADO, CMS_CONFINAMENTO, CMS_PASTO } from './dados/cms';
import {
  DOMINIO_CMS_CONCENTRADO,
  DOMINIO_CMS_CONFINAMENTO,
  DOMINIO_CMS_PASTO,
  escopoDaCategoria,
} from './dados/dominios';

/*
 * Grupo CMS (entrega 6A-4; INVENTARIO_BR_CORTE.md, seções 3.3 e 15): consumo de matéria seca
 * previsto, em kg/dia, de bovinos em crescimento e terminação. PC é o peso corporal médio do
 * período (p. 31 e 35; a planilha oficial usa o PC médio). Mesmo escopo de categorias dos grupos
 * peso e energia; GMD negativo fora do escopo (P-01); GMD zero calculado (Tabela 2.14, p. 37).
 * A Eq. 2.7 (cruzados de leite a pasto) fica fora do escopo (P-03). Equações aprovadas pelo
 * usuário (APROVACAO_CMS), com as decisões D-CMS-01 a 05 (INVENTARIO_BR_CORTE.md, seção 15.1).
 */

const conferidaCms = (paginas: number[]) =>
  conferidaNaImagem([...paginas, 38], APROVACAO_CMS, '2026-10-23');

const gmdNegativo = (e: Readonly<Record<string, number>>) =>
  e['GMD']! < 0 ? 'GMD negativo fora do escopo (P-01).' : null;

const SO_CONFINAMENTO = (c: Categoria) =>
  c.sistema === 'confinamento'
    ? null
    : 'Equação de confinamento. A pasto, a Eq. 2.1 só pela opção explícita de terminação intensiva a pasto (BRC23-C-01-TIP; p. 37, D-CMS-01).';

/** Termos em PC^0,75 e GMD, comuns às Eq. 2.1 a 2.6. */
const pcGmd = (e: Readonly<Record<string, number>>, k: Readonly<Record<string, number>>) =>
  k['b0']! +
  k['bPC']! * e['PC']! ** k['expoentePC']! +
  k['bGMD']! * e['GMD']! +
  k['bGMD2']! * e['GMD']! ** 2;

const valores = <T extends Record<string, { valor: number }>>(p: T) =>
  Object.fromEntries(Object.entries(p).map(([n, c]) => [n, c.valor]));

export const CMS_CONFINAMENTO_EQ: EquacaoRegistrada = {
  id: 'BRC23-C-01-03',
  descricao:
    'CMS = b0 + bPC × PC^0,75 + bGMD × GMD + bGMD2 × GMD² (Eq. 2.1 zebuínos; 2.2 cruzados de corte; 2.3 cruzados de leite)',
  referencias: [
    { capitulo: 2, pagina: 25, local: 'Eq. 2.1 a 2.3; Tabela 2.1' },
    { capitulo: 2, pagina: 28, local: 'Tabela 2.4' },
    { capitulo: 2, pagina: 38, local: 'Considerações finais' },
  ],
  entradas: { PC: 'kg', GMD: 'kg/dia' },
  saida: 'kg/dia',
  escopo: (c) => SO_CONFINAMENTO(c) ?? escopoDaCategoria(c),
  escopoEntradas: gmdNegativo,
  dominio: (c) => DOMINIO_CMS_CONFINAMENTO[c.grupo],
  coeficientes: (c) => valores(CMS_CONFINAMENTO[c.grupo]),
  calcular: pcGmd,
  conferencia: conferidaCms([25, 28]),
  casosDeTeste: [
    'Tabela 2.4 (p. 28)',
    'T-04 (p. 432)',
    'T-06 (Tabelas 17.3a a 17.12a)',
    'T-12 (planilha oficial)',
  ],
};

export const CMS_CONCENTRADO_EQ: EquacaoRegistrada = {
  id: 'BRC23-C-04-05',
  descricao:
    'CMS = b0 + bNC × NC + bNC2 × NC² + bPC × PC^0,75 + bGMD × GMD + bGMD2 × GMD² (Eq. 2.4 zebuínos; 2.5 cruzados de corte)',
  referencias: [
    { capitulo: 2, pagina: 30, local: 'Eq. 2.4' },
    { capitulo: 2, pagina: 31, local: 'Eq. 2.5; Tabela 2.7' },
    { capitulo: 2, pagina: 33, local: 'Tabela 2.10' },
    { capitulo: 2, pagina: 38, local: 'Considerações finais' },
  ],
  entradas: { PC: 'kg', GMD: 'kg/dia', NC: '% MS' },
  saida: 'kg/dia',
  escopo: (c) =>
    SO_CONFINAMENTO(c) ??
    (CMS_CONCENTRADO[c.grupo as keyof typeof CMS_CONCENTRADO]
      ? escopoDaCategoria(c)
      : 'Sem equação de CMS com teor de concentrado para cruzados de leite (p. 30, 31 e 38).'),
  escopoEntradas: (e) =>
    gmdNegativo(e) ??
    (e['NC']! < 0 || e['NC']! > 100 ? 'NC deve estar entre 0 e 100 % da MS.' : null),
  dominio: (c) => DOMINIO_CMS_CONCENTRADO[c.grupo] ?? {},
  coeficientes: (c) => valores(CMS_CONCENTRADO[c.grupo as keyof typeof CMS_CONCENTRADO]),
  calcular: (e, k) => pcGmd(e, k) + k['bNC']! * e['NC']! + k['bNC2']! * e['NC']! ** 2,
  conferencia: conferidaCms([30, 31, 33]),
  casosDeTeste: ['Tabela 2.10 (p. 33)'],
};

export const CMS_PASTO_EQ: EquacaoRegistrada = {
  id: 'BRC23-C-06',
  descricao:
    'CMS = –0,4684 + 0,7732 × CMSs + 0,0742 × PC^0,75 + 0,7953 × GMD – 0,9047 × GMD² (Eq. 2.6)',
  referencias: [
    { capitulo: 2, pagina: 35, local: 'Eq. 2.6; Tabela 2.11; limites de uso' },
    { capitulo: 2, pagina: 37, local: 'Tabela 2.14' },
    { capitulo: 2, pagina: 38, local: 'Considerações finais' },
  ],
  entradas: { PC: 'kg', GMD: 'kg/dia', CMSs: 'kg/dia' },
  saida: 'kg/dia',
  escopo: (c) =>
    c.sistema !== 'pasto'
      ? 'Equação de bovinos a pasto.'
      : c.grupo !== 'zebuino'
        ? 'A pasto, CMS só de zebuínos (Eq. 2.6); a Eq. 2.7 (cruzados de leite) fica fora do escopo (P-03).'
        : escopoDaCategoria(c),
  escopoEntradas: (e) =>
    gmdNegativo(e) ?? (e['CMSs']! < 0 ? 'Consumo de suplemento negativo.' : null),
  dominio: (c) => DOMINIO_CMS_PASTO[c.grupo] ?? {},
  coeficientes: () => valores(CMS_PASTO.zebuino),
  calcular: (e, k) => pcGmd(e, k) + k['bCMSs']! * e['CMSs']!,
  avisosFixos: [
    'Eq. 2.6: indicada para recria ou suplementação com concentrado moderada; grande parte dos dados é do período seco (p. 35).',
  ],
  conferencia: conferidaCms([35, 37]),
  casosDeTeste: ['Tabela 2.14 (p. 37)'],
};

/**
 * Terminação intensiva a pasto (TIP; D-CMS-01): "em que o animal consome no pasto a mesma
 * quantidade de concentrado que é fornecida quando está confinado, o BR-CORTE sugere usar a
 * equação 2.1 para predição de CMS" (p. 37). Só zebuínos machos a pasto (P-03, D-CMS-03). Muda
 * apenas a equação do CMS: peso, energia e proteína continuam com as equações de pasto.
 */
export const CMS_TIP_EQ: EquacaoRegistrada = {
  id: 'BRC23-C-01-TIP',
  descricao:
    'CMS = –2,1948 + 0,08338 × PC^0,75 + 3,9328 × GMD – 0,9030 × GMD² (Eq. 2.1, terminação intensiva a pasto)',
  referencias: [
    { capitulo: 2, pagina: 25, local: 'Eq. 2.1; Tabela 2.1' },
    { capitulo: 2, pagina: 37, local: 'terminação intensiva a pasto (texto)' },
    { capitulo: 2, pagina: 38, local: 'Considerações finais' },
  ],
  entradas: { PC: 'kg', GMD: 'kg/dia' },
  saida: 'kg/dia',
  escopo: (c) =>
    c.sistema !== 'pasto'
      ? 'Opção de terminação intensiva a pasto; em confinamento, use a Eq. 2.1 a 2.3.'
      : c.grupo !== 'zebuino'
        ? 'Terminação intensiva a pasto só para zebuínos machos (D-CMS-01).'
        : escopoDaCategoria(c),
  escopoEntradas: gmdNegativo,
  dominio: () => DOMINIO_CMS_CONFINAMENTO.zebuino,
  coeficientes: () => valores(CMS_CONFINAMENTO.zebuino),
  calcular: pcGmd,
  avisosFixos: [
    'CMS da Eq. 2.1 (zebuínos confinados) aplicada à terminação intensiva a pasto, como sugere a p. 37: vale quando o animal recebe no pasto a mesma quantidade de concentrado que receberia confinado. Domínio dos dados de confinamento (Tabela 2.1, p. 25).',
  ],
  conferencia: conferidaCms([25, 37]),
  casosDeTeste: ['T-06 (Tabela 17.12a, p. 468)'],
};

export const EQUACOES_CMS: readonly EquacaoRegistrada[] = [
  CMS_CONFINAMENTO_EQ,
  CMS_CONCENTRADO_EQ,
  CMS_PASTO_EQ,
  CMS_TIP_EQ,
];

export function registroCms(): RegistroEquacoes {
  const r = new RegistroEquacoes();
  for (const e of EQUACOES_CMS) r.registrar(e);
  return r;
}

/**
 * CMS informado pelo usuário: nó identidade, fora do registro de equações (não é equação do
 * livro). Entra na mesma cadeia para que ED, NDT e NDT % digam qual CMS usaram.
 */
export const CMS_INFORMADO_NO: EquacaoRegistrada = {
  id: 'CMS-INFORMADO',
  descricao: 'CMS informado pelo usuário (não previsto pelo motor)',
  referencias: [],
  entradas: { CMS: 'kg/dia' },
  saida: 'kg/dia',
  escopo: escopoDaCategoria,
  escopoEntradas: (e) => (e['CMS']! > 0 ? null : 'CMS deve ser maior que zero.'),
  dominio: () => ({}),
  coeficientes: () => ({}),
  calcular: (e) => e['CMS']!,
  notasFixas: ['CMS informado pelo usuário, não previsto pelo motor.'],
  conferencia: { transcritoPor: '', conferencias: [], aprovacaoUsuario: null },
  casosDeTeste: [],
};
