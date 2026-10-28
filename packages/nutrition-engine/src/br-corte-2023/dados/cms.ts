import type { Coeficiente } from '../../nucleo/tipos';

/*
 * Coeficientes de consumo de matéria seca do BR-CORTE 2023, capítulo 2, como impressos, com a
 * página (INVENTARIO_BR_CORTE.md, seções 3.3 e 15). Conferidos na imagem das equações no corpo
 * do capítulo (p. 25, 30, 31 e 35) e nas "Considerações finais" (p. 38). Não editar sem nova
 * conferência.
 */
const k = (impresso: string, pagina: number, local: string): Coeficiente => ({
  valor: Number(impresso.replace(',', '.')),
  impresso,
  referencia: { capitulo: 2, pagina, local },
});

/** CMS = b0 + bPC × PC^0,75 + bGMD × GMD + bGMD2 × GMD² (confinamento; p. 25 e 38). */
export const CMS_CONFINAMENTO = {
  zebuino: {
    b0: k('-2,1948', 25, 'Eq. 2.1'),
    bPC: k('0,08338', 25, 'Eq. 2.1'),
    expoentePC: k('0,75', 25, 'Eq. 2.1'),
    bGMD: k('3,9328', 25, 'Eq. 2.1'),
    bGMD2: k('-0,9030', 25, 'Eq. 2.1'),
  },
  cruzado_corte: {
    b0: k('-0,6273', 25, 'Eq. 2.2'),
    bPC: k('0,06453', 25, 'Eq. 2.2'),
    expoentePC: k('0,75', 25, 'Eq. 2.2'),
    bGMD: k('3,871', 25, 'Eq. 2.2'),
    bGMD2: k('-0,614', 25, 'Eq. 2.2'),
  },
  cruzado_leite: {
    b0: k('-2,8836', 25, 'Eq. 2.3'),
    bPC: k('0,08435', 25, 'Eq. 2.3'),
    expoentePC: k('0,75', 25, 'Eq. 2.3'),
    bGMD: k('4,5145', 25, 'Eq. 2.3'),
    bGMD2: k('-0,9631', 25, 'Eq. 2.3'),
  },
} as const;

/**
 * CMS = b0 + bNC × NC + bNC2 × NC² + bPC × PC^0,75 + bGMD × GMD + bGMD2 × GMD², com NC em % da
 * MS total da dieta (confinamento com teor de concentrado conhecido; p. 30, 31 e 38). Não há
 * equação para cruzados de leite.
 */
export const CMS_CONCENTRADO = {
  zebuino: {
    b0: k('-1,303', 30, 'Eq. 2.4'),
    bNC: k('0,0029', 30, 'Eq. 2.4'),
    bNC2: k('-0,00005', 30, 'Eq. 2.4'),
    bPC: k('0,0843', 30, 'Eq. 2.4'),
    expoentePC: k('0,75', 30, 'Eq. 2.4'),
    bGMD: k('2,243', 30, 'Eq. 2.4'),
    bGMD2: k('-0,271', 30, 'Eq. 2.4'),
  },
  cruzado_corte: {
    b0: k('-4,8196', 31, 'Eq. 2.5'),
    bNC: k('0,0081', 31, 'Eq. 2.5'),
    bNC2: k('-0,00011', 31, 'Eq. 2.5'),
    bPC: k('0,1239', 31, 'Eq. 2.5'),
    expoentePC: k('0,75', 31, 'Eq. 2.5'),
    bGMD: k('2,8189', 31, 'Eq. 2.5'),
    bGMD2: k('-0,775', 31, 'Eq. 2.5'),
  },
} as const;

/**
 * Zebuínos suplementados a pasto: CMS = b0 + bCMSs × CMSs + bPC × PC^0,75 + bGMD × GMD + bGMD2 ×
 * GMD², com CMSs (consumo de suplemento) em kg/dia (Eq. 2.6, p. 35 e 38). A Eq. 2.7 (cruzados de
 * leite a pasto) fica fora do escopo (P-03) e não é transcrita aqui.
 */
export const CMS_PASTO = {
  zebuino: {
    b0: k('-0,4684', 35, 'Eq. 2.6'),
    bCMSs: k('0,7732', 35, 'Eq. 2.6'),
    bPC: k('0,0742', 35, 'Eq. 2.6'),
    expoentePC: k('0,75', 35, 'Eq. 2.6'),
    bGMD: k('0,7953', 35, 'Eq. 2.6'),
    bGMD2: k('-0,9047', 35, 'Eq. 2.6'),
  },
} as const;
