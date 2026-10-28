import type { ClasseSexual, Coeficiente, GrupoGenetico } from '../../nucleo/tipos';

/*
 * Coeficientes das relações de peso do BR-CORTE 2023, como impressos, com a página
 * (INVENTARIO_BR_CORTE.md, seções 3.1 e 12). Transcritos da imagem das páginas; não editar sem
 * nova conferência. Equações: forma a × X^b.
 */
const k = (impresso: string, capitulo: number, pagina: number, local: string): Coeficiente => ({
  valor: Number(impresso.replace(',', '.')),
  impresso,
  referencia: { capitulo, pagina, local },
});

export interface PotenciaPublicada {
  a: Coeficiente;
  b: Coeficiente;
}

/** PCJ = a × PC^b. Eq. 1.3 (zebuínos e cruzados de corte; todos a pasto) e Eq. 1.4 (cruzados de leite). */
export const PCJ_EQ_1_3: PotenciaPublicada = {
  a: k('0,8915', 1, 8, 'Eq. 1.3'),
  b: k('1,0151', 1, 8, 'Eq. 1.3'),
};
export const PCJ_EQ_1_4: PotenciaPublicada = {
  a: k('0,9247', 1, 8, 'Eq. 1.4'),
  b: k('1,0085', 1, 8, 'Eq. 1.4'),
};

/** PCVZ = a × PCJ^b a pasto (Eq. 1.5). */
export const PCVZ_PASTO_EQ_1_5: PotenciaPublicada = {
  a: k('0,8507', 1, 8, 'Eq. 1.5'),
  b: k('1,0002', 1, 8, 'Eq. 1.5'),
};

/** PCVZ = a × PCJ^b em confinamento (Tabela 1.6, Eq. 1.6 a 1.11). "Cruzados de corte e de leite". */
export const PCVZ_CONFINAMENTO: Readonly<
  Record<'zebuino' | 'cruzado', Readonly<Record<ClasseSexual, PotenciaPublicada>>>
> = {
  zebuino: {
    macho_nao_castrado: { a: k('0,8126', 1, 9, 'Eq. 1.6'), b: k('1,0134', 1, 9, 'Eq. 1.6') },
    macho_castrado: { a: k('0,6241', 1, 9, 'Eq. 1.7'), b: k('1,0608', 1, 9, 'Eq. 1.7') },
    femea: { a: k('0,6110', 1, 9, 'Eq. 1.8'), b: k('1,0667', 1, 9, 'Eq. 1.8') },
  },
  cruzado: {
    macho_nao_castrado: { a: k('0,7248', 1, 9, 'Eq. 1.9'), b: k('1,0314', 1, 9, 'Eq. 1.9') },
    macho_castrado: { a: k('0,6586', 1, 9, 'Eq. 1.10'), b: k('1,0499', 1, 9, 'Eq. 1.10') },
    femea: { a: k('0,6314', 1, 9, 'Eq. 1.11'), b: k('1,0602', 1, 9, 'Eq. 1.11') },
  },
};

/** GPCVZ = a × GMD^b (Eq. 1.12). */
export const GPCVZ_EQ_1_12: PotenciaPublicada = {
  a: k('0,9630', 1, 10, 'Eq. 1.12'),
  b: k('1,0151', 1, 10, 'Eq. 1.12'),
};

/** PCVZ de referência na equivalência: 517 kg, o PCVZ à maturidade de zebuínos machos não castrados (p. 190). */
export const PCVZ_REFERENCIA = k('517', 8, 190, 'texto e Tabela 8.5');

/** PCVZ à maturidade (Tabela 8.5, p. 190; divisores iguais na Tabela 9.13, p. 226). */
export const PCVZ_MATURIDADE: Readonly<
  Record<GrupoGenetico, Readonly<Record<ClasseSexual, Coeficiente>>>
> = {
  zebuino: {
    macho_nao_castrado: k('517', 8, 190, 'Tabela 8.5'),
    macho_castrado: k('433', 8, 190, 'Tabela 8.5'),
    femea: k('402', 8, 190, 'Tabela 8.5'),
  },
  cruzado_corte: {
    macho_nao_castrado: k('560', 8, 190, 'Tabela 8.5'),
    macho_castrado: k('482', 8, 190, 'Tabela 8.5'),
    femea: k('417', 8, 190, 'Tabela 8.5'),
  },
  cruzado_leite: {
    macho_nao_castrado: k('616', 8, 190, 'Tabela 8.5'),
    macho_castrado: k('532', 8, 190, 'Tabela 8.5'),
    femea: k('493', 8, 190, 'Tabela 8.5'),
  },
};
