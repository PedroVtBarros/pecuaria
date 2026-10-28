import type { Coeficiente } from '../../nucleo/tipos';

/*
 * Coeficientes de macrominerais do BR-CORTE 2023, capítulo 10, como impressos, com a página
 * (INVENTARIO_BR_CORTE.md, seções 3.5 e 17). Conferidos na imagem da Tabela 10.14 (p. 264), das
 * Figuras 10.1 a 10.6 e Tabelas 10.8 a 10.12 (p. 245–253) e do texto do S (p. 253–254). Não editar
 * sem nova conferência.
 */
const k = (impresso: string, pagina: number, local: string): Coeficiente => ({
  valor: Number(impresso.replace(',', '.')),
  impresso,
  referencia: { capitulo: 10, pagina, local },
});

export const MACROMINERAIS = ['Ca', 'P', 'Mg', 'Na', 'K', 'S'] as const;
export type Macromineral = (typeof MACROMINERAIS)[number];

/** Grupos da Tabela 10.14: "Zebuíno" e "Cruzado" (cruzados de corte e de leite juntos; p. 242). */
export type GrupoMineral = 'zebuino' | 'cruzado';

/** ExLiG = GPCVZ × (a × PCVZ^b), g/dia; com plateau, zero a partir do PCVZ do plateau (kg). */
export interface GanhoMineral {
  a: Coeficiente;
  b: Coeficiente;
  plateauPCVZ?: Coeficiente;
}

export interface DadosMacromineral {
  /** Exigência líquida de mantença, mg/kg de PC. */
  mantenca: Coeficiente;
  /** Coeficiente de retenção, %. */
  retencao: Coeficiente;
  ganho: Readonly<Record<GrupoMineral, GanhoMineral>>;
}

const T = 'Tabela 10.14';
const igual = (g: GanhoMineral): Record<GrupoMineral, GanhoMineral> => ({ zebuino: g, cruzado: g });

export const DADOS_MACROMINERAIS: Readonly<Record<Macromineral, DadosMacromineral>> = {
  Ca: {
    mantenca: k('11,7', 264, `${T}; Figura 10.1, p. 245`),
    retencao: k('56,8', 264, `${T}; Figura 10.1, p. 245; p. 246`),
    ganho: {
      zebuino: {
        a: k('147', 264, `${T}; Tabela 10.8, p. 246`),
        b: k('-0,50', 264, `${T}; Tabela 10.8, p. 246`),
        plateauPCVZ: k('462', 264, `${T}; Tabela 10.8, p. 246`),
      },
      cruzado: {
        a: k('66,0', 264, `${T}; Tabela 10.8, p. 246`),
        b: k('-0,32', 264, `${T}; Tabela 10.8, p. 246`),
        plateauPCVZ: k('453', 264, `${T}; Tabela 10.8, p. 246`),
      },
    },
  },
  P: {
    mantenca: k('13,5', 264, `${T}; Figura 10.2, p. 248`),
    retencao: k('67,8', 264, `${T}; Figura 10.2 e texto, p. 248`),
    ganho: {
      zebuino: {
        a: k('38,6', 264, `${T}; Tabela 10.9, p. 248`),
        b: k('-0,36', 264, `${T}; Tabela 10.9, p. 248`),
        plateauPCVZ: k('445', 264, `${T}; Tabela 10.9, p. 248`),
      },
      cruzado: {
        a: k('25,4', 264, `${T}; Tabela 10.9, p. 248`),
        b: k('-0,25', 264, `${T}; Tabela 10.9, p. 248`),
        plateauPCVZ: k('479', 264, `${T}; Tabela 10.9, p. 248`),
      },
    },
  },
  Mg: {
    mantenca: k('5,9', 264, `${T}; Figura 10.3 e texto, p. 250`),
    retencao: k('35,5', 264, `${T}; Figura 10.3 e texto, p. 250`),
    ganho: {
      zebuino: {
        a: k('0,3466', 264, `${T}; Tabela 10.10, p. 250`),
        b: k('0,0113', 264, `${T}; Tabela 10.10, p. 250`),
      },
      cruzado: {
        a: k('1,0597', 264, `${T}; Tabela 10.10, p. 250`),
        b: k('-0,2386', 264, `${T}; Tabela 10.10, p. 250`),
      },
    },
  },
  Na: {
    mantenca: k('6,3', 264, `${T}; Figura 10.4, p. 251; texto, p. 250`),
    retencao: k('37,1', 264, `${T}; Figura 10.4 e texto, p. 251`),
    ganho: {
      zebuino: {
        a: k('5,594', 264, `${T}; Tabela 10.11, p. 251`),
        b: k('-0,2998', 264, `${T}; Tabela 10.11, p. 251`),
      },
      cruzado: {
        a: k('1,977', 264, `${T}; Tabela 10.11, p. 251`),
        b: k('-0,058', 264, `${T}; Tabela 10.11, p. 251`),
      },
    },
  },
  K: {
    mantenca: k('23,5', 264, `${T}; Figura 10.5 e texto, p. 252`),
    retencao: k('48,4', 264, `${T}; Figura 10.5, p. 252; texto, p. 253`),
    ganho: {
      zebuino: {
        a: k('0,9463', 264, `${T}; Tabela 10.12, p. 253`),
        b: k('0,1216', 264, `${T}; Tabela 10.12, p. 253`),
      },
      cruzado: {
        a: k('0,3418', 264, `${T}; Tabela 10.12, p. 253`),
        b: k('0,3200', 264, `${T}; Tabela 10.12, p. 253`),
      },
    },
  },
  S: {
    mantenca: k('10,4', 264, `${T}; Figura 10.6 e texto, p. 253`),
    retencao: k('77,3', 264, `${T}; Figura 10.6 e texto, p. 253`),
    ganho: igual({
      a: k('0,03', 264, `${T}; texto, p. 254 (Costa e Silva et al., 2015a)`),
      b: k('0,8900', 264, `${T}; texto, p. 254 ("0,89")`),
    }),
  },
};
