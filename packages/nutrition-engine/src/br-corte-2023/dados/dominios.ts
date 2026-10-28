import type { Categoria, ClasseSexual, GrupoGenetico } from '../../nucleo/tipos';
import type { FaixaDominio } from '../../nucleo/registro';

/*
 * Domínio dos dados, como publicado (mínimo e máximo), conferido na imagem das páginas
 * (INVENTARIO_BR_CORTE.md, seções 6 e 12). PCJ e PCVZ: menor inicial a maior final.
 */
const f = (minimo: number, maximo: number, fonte: string): FaixaDominio => ({
  minimo,
  maximo,
  fonte,
});

/**
 * Banco de dados das relações de peso do BR-CORTE 2016 (Tabela 1.2, p. 5). As Eq. 1.3 e 1.4 de
 * 2023 foram ajustadas num "banco de dados estendido" (p. 7–8) não descrito: estes limites são
 * **provisórios** e não são atribuídos ao banco de 2023 (P-13).
 */
const PROVISORIO = 'Tabela 1.2, p. 5 (banco de 2016; provisório, P-13)';
const fp = (minimo: number, maximo: number, fonte = PROVISORIO): FaixaDominio => ({
  ...f(minimo, maximo, fonte),
  provisorio: true,
});
export const DOMINIO_RELACOES_PESO = {
  PC: fp(81, 710),
  PCJ: fp(74, 701),
  PCVZ: fp(63, 600),
  /** Eq. 1.12 foi ajustada com o GMDJ (p. 10), faixa do GMDJ. */
  GMD: fp(-0.54, 2.66, 'Tabela 1.2, p. 5, GMDJ (banco de 2016; provisório, P-13)'),
} as const;

interface DominioCategoria {
  PCJ: FaixaDominio;
  PCVZ: FaixaDominio;
  GMD: FaixaDominio;
  GPCVZ: FaixaDominio;
}

const t = (pagina: number, tabela: string) => `${tabela}, p. ${pagina}`;
const cat = (
  pcj: [number, number],
  pcvz: [number, number],
  gmd: [number, number],
  gpcvz: [number, number],
  fonte: string,
): DominioCategoria => ({
  PCJ: f(pcj[0], pcj[1], fonte),
  PCVZ: f(pcvz[0], pcvz[1], fonte),
  GMD: f(gmd[0], gmd[1], fonte),
  GPCVZ: f(gpcvz[0], gpcvz[1], fonte),
});

/** Bancos de dados de energia por categoria (Tabelas 8.1 a 8.4, p. 179–182). */
export const DOMINIO_CATEGORIAS: Readonly<{
  confinamento: Readonly<Record<GrupoGenetico, Readonly<Record<ClasseSexual, DominioCategoria>>>>;
  pasto: Readonly<
    Partial<Record<GrupoGenetico, Readonly<Partial<Record<ClasseSexual, DominioCategoria>>>>>
  >;
}> = {
  confinamento: {
    zebuino: {
      macho_nao_castrado: cat(
        [110, 592],
        [95.2, 549],
        [-0.14, 2.65],
        [-0.13, 2.3],
        t(179, 'Tabela 8.1'),
      ),
      macho_castrado: cat(
        [164, 520],
        [148, 469],
        [-0.22, 1.53],
        [-0.21, 1.63],
        t(179, 'Tabela 8.1'),
      ),
      femea: cat([121, 437], [104, 403], [-0.12, 1.27], [-0.13, 1.25], t(179, 'Tabela 8.1')),
    },
    cruzado_corte: {
      macho_nao_castrado: cat(
        [198, 589],
        [173, 541],
        [-0.07, 2.11],
        [-0.05, 2.04],
        t(180, 'Tabela 8.2'),
      ),
      macho_castrado: cat(
        [189, 581],
        [166, 518],
        [-0.36, 2.35],
        [-0.09, 2.11],
        t(180, 'Tabela 8.2'),
      ),
      femea: cat([187, 494], [150, 443], [-0.31, 1.75], [-0.18, 1.73], t(180, 'Tabela 8.2')),
    },
    cruzado_leite: {
      macho_nao_castrado: cat(
        [191, 661],
        [167, 600],
        [0.45, 2.64],
        [0.45, 2.54],
        t(181, 'Tabela 8.3'),
      ),
      macho_castrado: cat([104, 575], [94.9, 510], [0.15, 2.05], [0.14, 2], t(181, 'Tabela 8.3')),
      femea: cat([150, 399], [115, 375], [0.29, 1.37], [0.3, 1.3], t(181, 'Tabela 8.3')),
    },
  },
  pasto: {
    zebuino: {
      macho_nao_castrado: cat(
        [138, 661],
        [106, 600],
        [-0.54, 1.13],
        [-0.55, 0.81],
        t(182, 'Tabela 8.4'),
      ),
      macho_castrado: cat(
        [104, 581],
        [94.9, 518],
        [-0.15, 0.95],
        [-0.1, 0.9],
        t(182, 'Tabela 8.4'),
      ),
    },
  },
};

/** Categoria coberta? A pasto, só zebuínos machos (P-03). */
export function dominioDaCategoria(c: Categoria): DominioCategoria | null {
  return DOMINIO_CATEGORIAS[c.sistema][c.grupo]?.[c.sexo] ?? null;
}

/** Faixa mais estreita entre duas (INVENTARIO_BR_CORTE.md, seção 12). */
export function intersecao(a: FaixaDominio, b: FaixaDominio): FaixaDominio {
  return {
    minimo: Math.max(a.minimo, b.minimo),
    maximo: Math.min(a.maximo, b.maximo),
    fonte: `${a.fonte}; ${b.fonte}`,
    ...(a.provisorio || b.provisorio ? { provisorio: true } : {}),
  };
}

/** Categoria fora da cobertura (P-03): a pasto, só zebuínos machos. */
export function escopoDaCategoria(c: Categoria): string | null {
  return dominioDaCategoria(c)
    ? null
    : 'Categoria fora do escopo inicial (restrição do projeto, P-03 e D-CMS-03): a pasto, só zebuínos machos não castrados e castrados.';
}

/*
 * Domínio das equações de CMS (capítulo 2), conferido na imagem. PC: menor inicial a maior final
 * (Tabela 2.1) ou faixa do PC médio (Tabelas 2.7 e 2.11). GMD negativo fica fora do escopo
 * (P-01), embora esteja nos dados.
 */
const cms = (pc: [number, number], gmd: [number, number], fonte: string) => ({
  PC: f(pc[0], pc[1], fonte),
  GMD: f(gmd[0], gmd[1], fonte),
});

/** Eq. 2.1 a 2.3, confinamento (Tabela 2.1, p. 25). */
export const DOMINIO_CMS_CONFINAMENTO: Readonly<
  Record<GrupoGenetico, Readonly<Record<'PC' | 'GMD', FaixaDominio>>>
> = {
  zebuino: cms([110, 652], [-0.36, 2], t(25, 'Tabela 2.1')),
  cruzado_corte: cms([215, 607], [-0.19, 2.37], t(25, 'Tabela 2.1')),
  cruzado_leite: cms([139, 661], [-0.13, 2.64], t(25, 'Tabela 2.1')),
};

/** Eq. 2.4 e 2.5, confinamento com NC conhecido (Tabela 2.7, p. 31); NC em % da MS. */
export const DOMINIO_CMS_CONCENTRADO: Readonly<
  Partial<Record<GrupoGenetico, Readonly<Record<'PC' | 'GMD' | 'NC', FaixaDominio>>>>
> = {
  zebuino: {
    ...cms([133, 647], [-0.14, 2.26], t(31, 'Tabela 2.7')),
    NC: f(0, 85, t(31, 'Tabela 2.7')),
  },
  cruzado_corte: {
    ...cms([231, 538], [0.48, 2.44], t(31, 'Tabela 2.7')),
    NC: f(25, 100, t(31, 'Tabela 2.7')),
  },
};

/**
 * Eq. 2.6, zebuínos a pasto: PC médio da Tabela 2.11 (p. 35). GMD e CMSs até o uso indicado no
 * texto da p. 35 ("até 5,32 kg/dia" de concentrado e ganhos "até 1,34 kg/dia"), mais estreito que
 * os dados da Tabela 2.11 (GMD até 1,56; suplemento até 5,92) (D-EN-06).
 */
export const DOMINIO_CMS_PASTO: Readonly<
  Partial<Record<GrupoGenetico, Readonly<Record<'PC' | 'GMD' | 'CMSs', FaixaDominio>>>>
> = {
  zebuino: {
    PC: f(102, 568, t(35, 'Tabela 2.11')),
    GMD: f(-0.39, 1.34, 'Tabela 2.11 (mínimo) e texto (máximo indicado), p. 35'),
    CMSs: f(0, 5.32, 'Tabela 2.11 (mínimo) e texto (máximo indicado), p. 35'),
  },
};

/*
 * Banco de dados de proteína (Tabelas 9.2 a 9.5, p. 208–211, "adaptada do BR-CORTE (2016)"),
 * conferido na imagem. As tabelas trazem a coluna Máximo antes da Mínimo. PCJ e GPCVZ: menor e
 * maior valor entre inicial e final.
 */
const prot = (pcj: [number, number], gpcvz: [number, number], fonte: string) => ({
  PCJ: f(pcj[0], pcj[1], fonte),
  GPCVZ: f(gpcvz[0], gpcvz[1], fonte),
});
type DominioProteina = Readonly<Record<'PCJ' | 'GPCVZ', FaixaDominio>>;
export const DOMINIO_PROTEINA: Readonly<{
  confinamento: Readonly<Record<GrupoGenetico, Readonly<Record<ClasseSexual, DominioProteina>>>>;
  pasto: Readonly<
    Partial<Record<GrupoGenetico, Readonly<Partial<Record<ClasseSexual, DominioProteina>>>>>
  >;
}> = {
  confinamento: {
    zebuino: {
      macho_nao_castrado: prot([151, 592], [-0.01, 1.87], t(208, 'Tabela 9.2')),
      macho_castrado: prot([110, 520], [-0.21, 1.32], t(208, 'Tabela 9.2')),
      femea: prot([129, 437], [-0.13, 1.25], t(208, 'Tabela 9.2')),
    },
    cruzado_corte: {
      macho_nao_castrado: prot([198, 585], [-0.05, 1.98], t(209, 'Tabela 9.3')),
      macho_castrado: prot([260, 552], [-0.09, 1.64], t(209, 'Tabela 9.3')),
      femea: prot([187, 494], [-0.18, 1.73], t(209, 'Tabela 9.3')),
    },
    cruzado_leite: {
      macho_nao_castrado: prot([150, 661], [0.05, 2.74], t(210, 'Tabela 9.4')),
      macho_castrado: prot([216, 575], [0.02, 2], t(210, 'Tabela 9.4')),
      femea: prot([196, 431], [0.05, 1.67], t(210, 'Tabela 9.4')),
    },
  },
  pasto: {
    zebuino: {
      macho_nao_castrado: prot([74, 519], [-0.1, 0.9], t(211, 'Tabela 9.5')),
      macho_castrado: prot([226, 484], [-0.1, 0.9], t(211, 'Tabela 9.5')),
    },
  },
};

export function dominioProteina(c: Categoria): DominioProteina | null {
  return DOMINIO_PROTEINA[c.sistema][c.grupo]?.[c.sexo] ?? null;
}

/** Banco de dados da equação de PBmic (Tabela 3.7, cap. 3, p. 60): CPB e CNDT em kg/dia. */
export const DOMINIO_PBMIC = {
  CPB: f(0.59, 4.39, t(60, 'Tabela 3.7 (capítulo 3)')),
  CNDT: f(0.83, 16.8, t(60, 'Tabela 3.7 (capítulo 3)')),
} as const;

/** Banco de mantença e retenção de macrominerais (Tabela 10.3, p. 240): PC 125 a 557 kg. */
export const DOMINIO_MANTENCA_MINERAL = { PC: f(125, 557, t(240, 'Tabela 10.3')) } as const;

/**
 * Banco de ganho de Ca, P, Mg, Na e K (Tabela 10.5, p. 243), conferido na imagem: PCVZ e GPCVZ
 * por grupo ("Zebuínos" e "Cruzados", confinamento; "Zebuínos (pasto)" só machos não castrados).
 */
const ganho = (pcvz: [number, number], gpcvz: [number, number]) => ({
  PCVZ: f(pcvz[0], pcvz[1], t(243, 'Tabela 10.5')),
  GPCVZ: f(gpcvz[0], gpcvz[1], t(243, 'Tabela 10.5')),
});
type DominioGanhoMineral = Readonly<Record<'PCVZ' | 'GPCVZ', FaixaDominio>>;
const CRUZADOS_GANHO: Readonly<Record<ClasseSexual, DominioGanhoMineral>> = {
  macho_nao_castrado: ganho([167, 600], [0.17, 2.74]),
  macho_castrado: ganho([161, 506], [-0.09, 1.64]),
  femea: ganho([175, 443], [-0.18, 1.73]),
};
export const DOMINIO_GANHO_MACROMINERAL: Readonly<{
  confinamento: Readonly<
    Record<GrupoGenetico, Readonly<Record<ClasseSexual, DominioGanhoMineral>>>
  >;
  pasto: Readonly<
    Partial<Record<GrupoGenetico, Readonly<Partial<Record<ClasseSexual, DominioGanhoMineral>>>>>
  >;
}> = {
  confinamento: {
    zebuino: {
      macho_nao_castrado: ganho([172, 549], [-0.01, 1.87]),
      macho_castrado: ganho([104, 460], [-0.21, 2.3]),
      femea: ganho([108, 368], [-0.13, 1.25]),
    },
    cruzado_corte: CRUZADOS_GANHO,
    cruzado_leite: CRUZADOS_GANHO,
  },
  pasto: { zebuino: { macho_nao_castrado: ganho([80.2, 604], [-0.41, 0.9]) } },
};

/** Banco de ganho de S (Tabela 10.6, p. 243; dados de Costa e Silva et al., 2015a, p. 254). */
export const DOMINIO_GANHO_S = {
  PCVZ: f(104, 549, t(243, 'Tabela 10.6')),
  GPCVZ: f(-0.02, 1.87, t(243, 'Tabela 10.6')),
} as const;
