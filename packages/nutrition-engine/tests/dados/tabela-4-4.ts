/*
 * Tabela 4.4 do BR-CORTE 2023 (p. 102, "Exemplo de aplicação"): composição química dos alimentos
 * e da dieta total, em % da MS (MS em % da MN), transcrita da imagem da página (PDF 194) e
 * conferida (INVENTARIO_BR_CORTE.md, seção 18.3). **Só para testes da aritmética da oferta**:
 * nunca popula o banco (C-6B-19).
 *
 * Convenções: "–" (traço impresso) = valor publicado sem número; null = célula em branco
 * (ausência de informação). Nenhum dos dois vira zero. O "0" da MO da mistura mineral é zero
 * impresso. A PB da ureia:sulfato de amônia (260) é PB equivalente de NNP, não proteína
 * verdadeira. A linha "PBu" (PB da ureia; conferida na imagem da p. 102 em 2026-10-26) é a parcela
 * de PB equivalente de NNP contida na PB total: entra nos testes com natureza
 * "equivalente_proteico_nnp" (migration 0018), nunca somada à PB. A linha "Ur" não entra.
 *
 * Dieta: volumoso:concentrado 50:50 na MS; concentrado com milho grão (86,43 % da MS), farelo de
 * soja (10,07 %), U:SA (1,5 %) e mistura mineral (2,0 %).
 */
export const NUTRIENTES_4_4 = [
  'MS',
  'MO',
  'PB',
  'PBu',
  'EE',
  'FDNcp',
  'FDA',
  'LIG',
  'CNF',
  'PIDN',
  'PIDA',
] as const;
export type Nutriente44 = (typeof NUTRIENTES_4_4)[number];
type Celula = string | '–' | null;

export const ALIMENTOS_4_4: Readonly<Record<string, Readonly<Record<Nutriente44, Celula>>>> = {
  Silagem: {
    MS: '30,92',
    MO: '94,74',
    PB: '7,26',
    PBu: '–',
    EE: '3,16',
    FDNcp: '51,77',
    FDA: '23,79',
    LIG: '4,97',
    CNF: '32,55',
    PIDN: '1,14',
    PIDA: '0,57',
  },
  Fubá: {
    MS: '87,64',
    MO: '97,60',
    PB: '9,11',
    PBu: '–',
    EE: '4,07',
    FDNcp: '10,19',
    FDA: '4,18',
    LIG: '1,16',
    CNF: '74,23',
    PIDN: '0,87',
    PIDA: '0,35',
  },
  'F. Soja': {
    MS: '88,61',
    MO: '92,85',
    PB: '48,78',
    PBu: '–',
    EE: '1,71',
    FDNcp: '10,72',
    FDA: '3,75',
    LIG: '1,33',
    CNF: '31,64',
    PIDN: '2,38',
    PIDA: '1,34',
  },
  'U:SA': {
    MS: '100',
    MO: '100',
    PB: '260',
    PBu: '260',
    EE: '–',
    FDNcp: '–',
    FDA: null,
    LIG: '–',
    CNF: '–',
    PIDN: '–',
    PIDA: '–',
  },
  MM: {
    MS: '100',
    MO: '0',
    PB: '–',
    PBu: '–',
    EE: '–',
    FDNcp: '–',
    FDA: null,
    LIG: '–',
    CNF: '–',
    PIDN: '–',
    PIDA: '–',
  },
  /** Coluna "Concentrado" como impressa (para o teste por etapas). */
  Concentrado: {
    MS: '88,11',
    MO: '95,20',
    PB: '16,70',
    PBu: '3,90',
    EE: '3,69',
    FDNcp: '9,89',
    FDA: '3,99',
    LIG: '1,14',
    CNF: '67,34',
    PIDN: '0,99',
    PIDA: '0,44',
  },
};

/** Coluna "Dieta" como impressa. */
export const DIETA_4_4: Readonly<Record<Nutriente44, string>> = {
  MS: '45,80',
  MO: '94,97',
  PB: '12,00',
  PBu: '1,95',
  EE: '3,43',
  FDNcp: '30,83',
  FDA: '13,89',
  LIG: '3,06',
  CNF: '49,95',
  PIDN: '1,06',
  PIDA: '0,51',
};

/** Proporções na MS do concentrado (texto da p. 102). */
export const CONCENTRADO_4_4 = {
  Fubá: 0.8643,
  'F. Soja': 0.1007,
  'U:SA': 0.015,
  MM: 0.02,
} as const;
