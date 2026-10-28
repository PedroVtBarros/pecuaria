import type { Coeficiente, GrupoGenetico } from '../../nucleo/tipos';

/*
 * Coeficientes de energia do BR-CORTE 2023, como impressos, com a página (INVENTARIO_BR_CORTE.md,
 * seção 3.2). Conferidos na imagem das Tabelas 8.9 (p. 198) e 8.10 (p. 199), das equações do
 * corpo do capítulo 8 (p. 184–187, 191, 197) e do exemplo do capítulo 17 (p. 432–433). Não editar
 * sem nova conferência.
 */
const k = (impresso: string, capitulo: number, pagina: number, local: string): Coeficiente => ({
  valor: Number(impresso.replace(',', '.')),
  impresso,
  referencia: { capitulo, pagina, local },
});

/** ELm = 0,075 × PCVZ^0,75 (75 kcal/PCVZ^0,75/dia, adotado para confinamento e pasto, p. 184–185). */
export const ELM = {
  a: k('0,075', 8, 199, 'Tabela 8.10'),
  expoente: k('0,75', 8, 199, 'Tabela 8.10'),
};

/** ELg = β0 × PCVZeq^0,75 × GPCVZ^β1 (Eq. 8.20 confinamento, Eq. 8.21 pasto; p. 191). */
export const ELG = {
  confinamento: {
    b0: k('0,061', 8, 191, 'Eq. 8.20'),
    expoentePCVZeq: k('0,75', 8, 191, 'Eq. 8.20'),
    b1: k('1,035', 8, 191, 'Eq. 8.20'),
  },
  pasto: {
    b0: k('0,052', 8, 191, 'Eq. 8.21'),
    expoentePCVZeq: k('0,75', 8, 191, 'Eq. 8.21'),
    b1: k('1,062', 8, 191, 'Eq. 8.21'),
  },
} as const;

/** ERprot = 1,140 × (ER / GPCVZ)^-1,137 (Eq. 8.31, p. 197). */
export const ERPROT = {
  a: k('1,140', 8, 197, 'Eq. 8.31'),
  b: k('-1,137', 8, 197, 'Eq. 8.31'),
};

/** kg = 0,327 / (0,539 + ERprot) (Eq. 8.28, p. 197). */
export const KG = {
  numerador: k('0,327', 8, 197, 'Eq. 8.28'),
  constante: k('0,539', 8, 197, 'Eq. 8.28'),
};

/**
 * km = [0,513 + (0,173 × kg) + (β2 × GPCVZ)] × θ. Confinamento: Eq. 8.12 (p. 186), β2 por grupo e
 * θ = 1. Pasto: Eq. 8.16 (p. 187), β2 = 0,100 e θ = 0,92.
 */
export const KM = {
  b0: k('0,513', 8, 186, 'Eq. 8.12'),
  b1: k('0,173', 8, 186, 'Eq. 8.12'),
  b2Confinamento: {
    zebuino: k('0,100', 8, 186, 'Eq. 8.12'),
    cruzado_corte: k('0,073', 8, 186, 'Eq. 8.12'),
    cruzado_leite: k('0,010', 8, 186, 'Eq. 8.12'),
  } satisfies Record<GrupoGenetico, Coeficiente>,
  thetaConfinamento: k('1', 8, 186, 'Eq. 8.12'),
  b2Pasto: k('0,100', 8, 187, 'Eq. 8.16'),
  thetaPasto: k('0,92', 8, 187, 'Eq. 8.16'),
} as const;

/**
 * ED = {[(EMtotal / CMS) + 0,3032] / 0,9455} × CMS (Tabelas 8.9 e 8.10): a relação EM = 0,9455 ×
 * ED – 0,3032, em Mcal/kg de MS (Figura 7.5, p. 174), aplicada à concentração da dieta.
 */
export const ED_EM = {
  inclinacao: k('0,9455', 8, 199, 'Tabela 8.10; Figura 7.5, p. 174'),
  intercepto: k('0,3032', 8, 199, 'Tabela 8.10; Figura 7.5, p. 174'),
};

/** NDT = ED / 4,4 (Tabelas 8.9 e 8.10). */
export const NDT_ED = { divisor: k('4,4', 8, 199, 'Tabela 8.10') };
