import type { Conferencia } from '../nucleo/tipos';

/** Edição única do motor (decisão C1). */
export const BR_CORTE_2023 = {
  obra: 'Exigências Nutricionais de Zebuínos Puros e Cruzados – BR-CORTE',
  edicao: '4ª edição',
  ano: 2023,
  doi: '10.26626/978-85-8179-192-0',
} as const;

/** Aprovação das equações de peso pelo usuário (6A-2; commits 8f98cc5 e 884f227). */
export const APROVACAO_PESO = { por: 'Usuário', data: '2026-10-22' } as const;

/** Aprovação das equações de energia E-01 a E-15 pelo usuário (6A-3; commit cdf43e7). */
export const APROVACAO_ENERGIA = { por: 'Usuário', data: '2026-10-23' } as const;

/** Aprovação das equações de CMS C-01 a C-06 pelo usuário (6A-4; commit b2bee4a) e da TIP (D-CMS-01). */
export const APROVACAO_CMS = { por: 'Usuário', data: '2026-10-23' } as const;

/** Aprovação das equações de proteína R-01 a R-10 pelo usuário (6A-5; commit 4d2e941) e R-11 a R-13. */
export const APROVACAO_PROTEINA = { por: 'Usuário', data: '2026-10-24' } as const;

/** Aprovação das 24 equações de macrominerais pelo usuário (6A-6; commit b5ef394) e da Ca/P. */
export const APROVACAO_MINERAIS = { por: 'Usuário', data: '2026-10-24' } as const;

/** Conferência das equações transcritas na entrega 6.0 (INVENTARIO_BR_CORTE.md, seção 1). */
export function conferidaNaImagem(
  paginas: number[],
  aprovacaoUsuario: Conferencia['aprovacaoUsuario'] = null,
  data = '2026-10-22',
): Conferencia {
  return {
    transcritoPor: 'Claude (assistente de IA), entrega 6.0',
    conferencias: [
      {
        por: 'Claude (assistente de IA)',
        data,
        metodo: 'imagem da página renderizada (pdf.js) e exemplo numérico do livro',
        paginas,
      },
    ],
    aprovacaoUsuario,
  };
}
