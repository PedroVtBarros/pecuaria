/**
 * Origem de cada número e dos registros (Fase 5C, decisões do usuário em 2026-10-21).
 *
 * 1. Forma de obtenção do valor: medido, calculado, estimado por equação ou estimado por NIR são
 *    coisas diferentes e nunca se confundem. Quando a fonte não diz, é "não informado", nunca
 *    presumido "medido".
 * 2. Vínculo entre registros que podem compartilhar a mesma origem experimental (ex.: uma tabela
 *    compilada que inclui os dados de um estudo também cadastrado). Registros vinculados não são
 *    independentes e não entram juntos numa média enquanto o vínculo não for descartado pelo
 *    usuário.
 */
export const FORMAS_OBTENCAO = [
  'medido',
  'calculado',
  'estimado_equacao',
  'estimado_nir',
  'nao_informado',
] as const;
export type FormaObtencao = (typeof FORMAS_OBTENCAO)[number];

export const TAMANHO_MAXIMO_DESCRICAO_OBTENCAO = 500;

/** Cálculo e equação só são rastreáveis com a descrição (fórmula e referência, como na fonte). */
export function exigeDescricaoObtencao(forma: FormaObtencao): boolean {
  return forma === 'calculado' || forma === 'estimado_equacao';
}

export function problemasDaObtencao(forma: FormaObtencao, descricao: string | null): string[] {
  const texto = descricao?.trim() ?? '';
  if (exigeDescricaoObtencao(forma) && !texto)
    return [
      forma === 'calculado'
        ? 'Valor calculado: descreva o cálculo como a fonte informa.'
        : 'Valor estimado por equação: transcreva a equação e a referência como a fonte informa.',
    ];
  if (texto.length > TAMANHO_MAXIMO_DESCRICAO_OBTENCAO)
    return ['Descrição da forma de obtenção longa demais.'];
  return [];
}

/**
 * Relação declarada entre um registro ("este") e outro ("outro"):
 * - mesmos_valores: os valores coincidem; provavelmente os mesmos dados experimentais;
 * - outro_inclui_este: o outro é uma média ou compilação que contém os dados deste;
 * - outro_pode_incluir_este: indício de que o outro contém os dados deste, sem prova numérica;
 * - mesmo_experimento_provavel: materiais diferentes (ex.: forragem e silagem) do mesmo ensaio.
 */
export const RELACOES_VINCULO = [
  'mesmos_valores',
  'outro_inclui_este',
  'outro_pode_incluir_este',
  'mesmo_experimento_provavel',
] as const;
export type RelacaoVinculo = (typeof RELACOES_VINCULO)[number];

export const SITUACOES_VINCULO = ['a_confirmar', 'confirmado', 'descartado'] as const;
export type SituacaoVinculo = (typeof SITUACOES_VINCULO)[number];

export interface VinculoParaIndependencia {
  registroId: string;
  relacionadoId: string | null;
  situacao: SituacaoVinculo;
}

/**
 * Dois registros só são independentes se nenhum vínculo entre eles estiver a confirmar ou
 * confirmado. Só o descarte, decidido pelo usuário, devolve a independência. Para uso da 5D.
 */
export function registrosIndependentes(
  a: string,
  b: string,
  vinculos: readonly VinculoParaIndependencia[],
): boolean {
  if (a === b) return false;
  return !vinculos.some(
    (v) =>
      v.situacao !== 'descartado' &&
      ((v.registroId === a && v.relacionadoId === b) ||
        (v.registroId === b && v.relacionadoId === a)),
  );
}
