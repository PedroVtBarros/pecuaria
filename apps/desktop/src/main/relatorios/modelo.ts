/**
 * Modelo neutro de um relatório gerencial (entrega 4H): os mesmos dados viram CSV e HTML (PDF).
 * Os tipos ficam no shared-types porque a tela mostra a pré-visualização do mesmo modelo.
 */
export type {
  CelulaRelatorio as Celula,
  ColunaRelatorio as Coluna,
  IndicadorRelatorio as Indicador,
  Relatorio,
  SecaoRelatorio as Secao,
  TipoDeColuna,
  VisaoDoRelatorio,
} from '@pecuaria/shared-types';

export const AVISO_FIXO =
  'Relatório gerencial de uso próprio: não é documento fiscal nem contábil e não calcula impostos.';
