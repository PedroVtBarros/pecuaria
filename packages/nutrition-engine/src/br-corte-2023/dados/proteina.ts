import type { Coeficiente } from '../../nucleo/tipos';

/*
 * Coeficientes de proteína do BR-CORTE 2023, como impressos, com a página (INVENTARIO_BR_CORTE.md,
 * seções 3.4, 10 e 16). Conferidos na imagem da Tabela 9.14 (p. 227) e do corpo do capítulo 9
 * (p. 214, 216, 218 e 219) e da equação de PBmic do capítulo 3 (p. 60). Não editar sem nova
 * conferência.
 */
const k = (impresso: string, capitulo: number, pagina: number, local: string): Coeficiente => ({
  valor: Number(impresso.replace(',', '.')),
  impresso,
  referencia: { capitulo, pagina, local },
});

/** PMm = a × PCJ^0,75, em g/dia: 3,6 confinamento e 3,9 pasto (Tabela 9.14; texto da p. 214). */
export const PMM = {
  confinamento: k('3,6', 9, 227, 'Tabela 9.14; p. 214'),
  pasto: k('3,9', 9, 227, 'Tabela 9.14; p. 214'),
  expoente: k('0,75', 9, 227, 'Tabela 9.14'),
} as const;

/** PLg = 176,01 × GPCVZ – 0,381 × PCVZeq^0,75 × GPCVZ^1,035, em g/dia (p. 216; Tabela 9.14). */
export const PLG = {
  b1: k('176,01', 9, 216, 'Costa e Silva et al. (2020); Tabela 9.14, p. 227'),
  b2: k('0,381', 9, 216, 'Costa e Silva et al. (2020); Tabela 9.14, p. 227'),
  expoentePCVZeq: k('0,75', 9, 216, 'Tabela 9.14, p. 227'),
  expoenteGPCVZ: k('1,035', 9, 216, 'Tabela 9.14, p. 227'),
} as const;

/**
 * k (%): 84,665 – 0,1179 × PCVZeq para PCJ < 340 kg; 47,4 a partir de PCJ 340 kg (texto da
 * p. 218, P-02). A Tabela 9.14 (p. 227) imprime "PCJ < 340" e "PCJ > 340".
 */
export const K_PROTEINA = {
  a: k('84,665', 9, 218, 'texto; Tabela 9.14, p. 227'),
  b: k('0,1179', 9, 218, 'texto; Tabela 9.14, p. 227'),
  limitePCJ: k('340', 9, 218, 'texto ("até o PCJ igual a 340 kg")'),
  constante: k('47,4', 9, 218, 'texto ("constante e igual a 47,4%")'),
} as const;

/**
 * PBmic = –53,07 + 304,9 × CPB + 90,8 × CNDT – 3,13 × CNDT², em g/dia, com CPB e CNDT em kg/dia
 * (Tabela 9.14, p. 227; p. 219; equação do capítulo 3, p. 60).
 */
export const PBMIC = {
  a: k('-53,07', 9, 227, 'Tabela 9.14; p. 219; cap. 3, p. 60'),
  bCPB: k('304,9', 9, 227, 'Tabela 9.14; p. 219; cap. 3, p. 60'),
  bCNDT: k('90,8', 9, 227, 'Tabela 9.14; p. 219; cap. 3, p. 60'),
  bCNDT2: k('-3,13', 9, 227, 'Tabela 9.14; p. 219; cap. 3, p. 60'),
} as const;

/** PNDR = (PMt – (PBmic × 0,64)) / 0,80 (Tabela 9.14, p. 227; p. 219). */
export const PNDR = {
  fatorPBmic: k('0,64', 9, 227, 'Tabela 9.14; p. 219'),
  digestibilidade: k('0,80', 9, 227, 'Tabela 9.14; p. 219'),
} as const;
