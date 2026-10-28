import type {
  BaseNutricional,
  DirecaoConservadora,
  GrupoNutriente,
  NaturezaValor,
  SituacaoFundamentacao,
} from './enumeracoes';
import { direcaoSugeridaPorGrupo } from './regras-alimentos';
import type { UnidadeNutricional } from './unidades';

/**
 * Catálogo inicial de DEFINIÇÕES de nutrientes (decisão D5-2, modificada pelo usuário em
 * 2026-10-21). Não contém nenhum valor de composição.
 *
 * Cada definição traz só o que é verificável pela nomenclatura usual: código, nome, grupo, unidade
 * e base de referência. A direção conservadora vem da regra do grupo (MODELOS_NUTRICIONAIS.md,
 * seção 5.4). O método analítico fica PENDENTE de fundamentação: nenhuma publicação de métodos foi
 * consultada, e nenhuma referência é citada de memória. Os métodos entram nas etapas 5B e 5C, a
 * partir das publicações efetivamente consultadas, com página.
 *
 * A migration 0012 insere exatamente estas linhas, com estes identificadores; um teste do banco
 * confere a igualdade.
 */
export interface DefinicaoInicialNutriente {
  id: string;
  codigo: string;
  nome: string;
  grupo: GrupoNutriente;
  unidadeReferencia: UnidadeNutricional;
  baseReferencia: BaseNutricional;
  direcaoConservadora: DirecaoConservadora;
  metodoAnalitico: null;
  situacaoFundamentacao: SituacaoFundamentacao;
  /** Migration 0018: o que o número representa. */
  naturezaValor: NaturezaValor;
}

const linha = (
  sufixo: string,
  codigo: string,
  nome: string,
  grupo: GrupoNutriente,
  baseReferencia: BaseNutricional,
  naturezaValor: NaturezaValor = 'fracao_massica',
): DefinicaoInicialNutriente => ({
  id: `01929c20-0000-7000-8000-0000000000${sufixo}`,
  codigo,
  nome,
  grupo,
  unidadeReferencia: 'pct',
  baseReferencia,
  direcaoConservadora: direcaoSugeridaPorGrupo(grupo),
  metodoAnalitico: null,
  situacaoFundamentacao: 'pendente',
  naturezaValor,
});

export const DEFINICOES_INICIAIS_NUTRIENTES: readonly DefinicaoInicialNutriente[] = [
  linha('01', 'MS', 'Matéria seca', 'fracao_seca', 'mn'),
  linha('02', 'MO', 'Matéria orgânica', 'outro', 'ms'),
  linha('03', 'MM', 'Matéria mineral', 'outro', 'ms'),
  // PB é N × 6,25: equivalente proteico, pode passar de 100 % (migration 0018).
  linha('04', 'PB', 'Proteína bruta', 'proteina', 'ms', 'equivalente_proteico'),
  linha('05', 'EE', 'Extrato etéreo', 'outro', 'ms'),
  linha('06', 'FDN', 'Fibra em detergente neutro', 'fibra', 'ms'),
  linha('07', 'FDA', 'Fibra em detergente ácido', 'fibra', 'ms'),
  linha('08', 'LIG', 'Lignina', 'fibra', 'ms'),
  linha('09', 'NDT', 'Nutrientes digestíveis totais', 'energia', 'ms'),
  linha('10', 'Ca', 'Cálcio', 'mineral_macro', 'ms'),
  linha('11', 'P', 'Fósforo', 'mineral_macro', 'ms'),
];

/**
 * Variantes de método trazidas pela curadoria da 5B (migration 0014), como definições próprias
 * (PLANO_FASE_5.md, seção 3.1): nunca equivalentes à definição de origem. Nome, unidade e base
 * conforme a página "Dados cadastrados" do CQBAL 4.0 (www.cqbal.com.br, consultada em
 * 2026-10-21): "FDNcp — FDN Corrigida Para Cinzas e Proteína — %MS". O método analítico continua
 * pendente: a página nomeia a correção, não descreve o procedimento.
 */
export const DEFINICOES_CURADORIA_5B: readonly DefinicaoInicialNutriente[] = [
  linha(
    '12',
    'FDNcp',
    'Fibra em detergente neutro corrigida para cinzas e proteína',
    'fibra',
    'ms',
  ),
];

/**
 * PB equivalente de nitrogênio não proteico (migration 0018; Fase 6B, D-6B1-04): parcela da PB
 * total que vem de NNP, como a linha "PBu" da Tabela 4.4 do BR-CORTE 2023 (p. 102). Está contida
 * na PB total; nunca é somada a ela.
 */
export const DEFINICOES_6B: readonly DefinicaoInicialNutriente[] = [
  linha(
    '13',
    'PBeqNNP',
    'Proteína bruta equivalente de nitrogênio não proteico (N × 6,25)',
    'proteina',
    'ms',
    'equivalente_proteico_nnp',
  ),
];

/** Todas as definições do sistema, na ordem de cadastro. */
export const DEFINICOES_DO_SISTEMA: readonly DefinicaoInicialNutriente[] = [
  ...DEFINICOES_INICIAIS_NUTRIENTES,
  ...DEFINICOES_CURADORIA_5B,
  ...DEFINICOES_6B,
];
