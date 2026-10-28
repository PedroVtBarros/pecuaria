/**
 * Motor de nutrição de bovinos de corte (Fase 6; PLANO_FASE_6.md; INVENTARIO_BR_CORTE.md).
 *
 * Fonte única: BR-CORTE 2023, 4ª edição. Nenhuma equação, coeficiente ou tabela entra aqui sem
 * estar no inventário aprovado, transcrita da imagem da página, conferida e com teste do livro.
 * Puro: sem Electron, React, banco ou rede. Ver MODELOS_NUTRICIONAIS.md, seções 1, 7 e 12.
 */
export * from './nucleo/unidades';
export * from './nucleo/tipos';
export * from './nucleo/registro';
export * from './nucleo/grafo';
export * from './nucleo/impresso';
export * from './nucleo/texto';

/** Versão do motor, gravada em cada avaliação (A4). Muda a cada equação nova ou corrigida. */
export const VERSAO_MOTOR = '0.8.2';

// BR-CORTE 2023 (4ª edição): só os grupos autorizados (6A-2: peso; 6A-3: energia; 6A-4: CMS; 6A-5: proteína; 6A-6: macrominerais).
export * from './br-corte-2023/fonte';
export * from './br-corte-2023/dados/peso';
export * from './br-corte-2023/dados/dominios';
export * from './br-corte-2023/peso';
export * from './br-corte-2023/dados/energia';
export * from './br-corte-2023/dados/cms';
export * from './br-corte-2023/cms';
export * from './br-corte-2023/energia';
export * from './br-corte-2023/dados/proteina';
export * from './br-corte-2023/proteina';
export * from './br-corte-2023/dados/minerais';
export * from './br-corte-2023/minerais';

// Avaliação de dietas (6B): aritmética da oferta, sem equação do livro.
export * from './avaliacao/oferta';
export * from './br-corte-2023/dados/toxicidade';
export * from './avaliacao/balanco';
