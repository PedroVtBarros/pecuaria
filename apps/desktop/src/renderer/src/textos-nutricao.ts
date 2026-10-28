import type {
  FonteCmsExigencia,
  GrupoExigencia,
  GrupoResultadoExigencia,
  SexoExigencia,
  SistemaExigencia,
  SituacaoExigencia,
  TipoQuantidadeDieta,
} from '@pecuaria/shared-types';
import type {
  SituacaoBalanco,
  SituacaoContribuicao,
  SituacaoOferta,
} from '@pecuaria/nutrition-engine';

/*
 * Textos da nutrição de corte (Fase 6A-7). Rótulos de códigos e nomes dos resultados; nenhum
 * número científico aqui: valores, equações e páginas vêm do motor pelo main.
 */
export const gruposGeneticos: Record<GrupoExigencia, string> = {
  zebuino: 'Zebuíno (ex.: Nelore)',
  cruzado_corte: 'Cruzado de corte',
  cruzado_leite: 'Cruzado de leite',
};

export const sexos: Record<SexoExigencia, string> = {
  macho_nao_castrado: 'Macho não castrado',
  macho_castrado: 'Macho castrado',
  femea: 'Fêmea',
};

export const sistemas: Record<SistemaExigencia, string> = {
  confinamento: 'Confinamento',
  pasto: 'Pasto',
};

export const fontesCms: Record<FonteCmsExigencia, string> = {
  confinamento: 'Prever pelo BR-CORTE (Eq. 2.1 a 2.3)',
  concentrado: 'Prever pelo teor de concentrado da dieta (Eq. 2.4 e 2.5)',
  pasto: 'Prever para animal suplementado a pasto (Eq. 2.6)',
  terminacao_intensiva_pasto: 'Terminação intensiva a pasto (Eq. 2.1)',
  informado: 'Informar o consumo',
};

/** Equação de CMS usada, pelo id do motor. */
export const equacoesCms: Record<string, string> = {
  'BRC23-C-01-03': 'Eq. 2.1 a 2.3 (confinamento)',
  'BRC23-C-04-05': 'Eq. 2.4 e 2.5 (teor de concentrado)',
  'BRC23-C-06': 'Eq. 2.6 (suplementado a pasto)',
  'BRC23-C-01-TIP': 'Eq. 2.1 (terminação intensiva a pasto)',
};

/** Fontes de CMS oferecidas em cada sistema; o motor ainda confere a categoria. */
export const fontesCmsDoSistema: Record<SistemaExigencia, readonly FonteCmsExigencia[]> = {
  confinamento: ['confinamento', 'concentrado', 'informado'],
  pasto: ['pasto', 'terminacao_intensiva_pasto', 'informado'],
};

export const situacoes: Record<SituacaoExigencia, string> = {
  valido: 'Pode ser usado',
  fora_do_dominio: 'Só para análise',
  fora_do_escopo: 'Fora do escopo',
  indeterminado: 'Não calculado',
};

export const explicacaoSituacao: Record<SituacaoExigencia, string> = {
  valido: 'Calculado dentro dos dados que o BR-CORTE usou para criar a equação.',
  fora_do_dominio:
    'Calculado fora dos dados que validam a equação. Não é recomendação: serve só para análise.',
  fora_do_escopo: 'A equação não se aplica a este caso; nada foi calculado.',
  indeterminado: 'Falta um dado de que o cálculo depende; nada foi calculado (nunca vira zero).',
};

export const tituloGrupos: Record<GrupoResultadoExigencia, string> = {
  peso: 'Peso ajustado',
  cms: 'Consumo de matéria seca',
  energia: 'Energia',
  proteina: 'Proteína',
  minerais: 'Macrominerais',
};

/** Nome de cada resultado e se aparece de saída (os demais ficam em "etapas intermediárias"). */
export const resultados: Record<string, { nome: string; principal: boolean }> = {
  PCJ: { nome: 'Peso corporal em jejum (PCJ)', principal: true },
  PCVZ: { nome: 'Peso de corpo vazio (PCVZ)', principal: true },
  PCVZeq: { nome: 'Peso de corpo vazio equivalente (PCVZeq)', principal: false },
  GPCVZ: { nome: 'Ganho de peso de corpo vazio (GPCVZ)', principal: true },
  CMS: { nome: 'Consumo de matéria seca (CMS)', principal: true },
  ELm: { nome: 'Energia líquida para mantença (ELm)', principal: false },
  ELg: { nome: 'Energia líquida para ganho (ELg)', principal: false },
  ERprot: { nome: 'Fração da energia retida como proteína', principal: false },
  kg: { nome: 'Eficiência de uso da EM para ganho (kg)', principal: false },
  km: { nome: 'Eficiência de uso da EM para mantença (km)', principal: false },
  EMm: { nome: 'Energia metabolizável para mantença', principal: false },
  EMg: { nome: 'Energia metabolizável para ganho', principal: false },
  EMtotal: { nome: 'Energia metabolizável (EM)', principal: true },
  ED: { nome: 'Energia digestível (ED)', principal: false },
  NDT: { nome: 'Nutrientes digestíveis totais (NDT)', principal: true },
  NDTpct: { nome: 'NDT na matéria seca', principal: true },
  PMm: { nome: 'Proteína metabolizável para mantença', principal: false },
  PLg: { nome: 'Proteína líquida para ganho', principal: false },
  kProteina: { nome: 'Eficiência de uso da PM para ganho (k)', principal: false },
  PMg: { nome: 'Proteína metabolizável para ganho', principal: false },
  PMt: { nome: 'Proteína metabolizável (PM)', principal: true },
  PBmic: { nome: 'Proteína microbiana (PBmic)', principal: false },
  PDR: { nome: 'Proteína degradável no rúmen (PDR)', principal: true },
  PNDR: { nome: 'Proteína não degradável no rúmen (PNDR)', principal: true },
  PB: { nome: 'Proteína bruta (PB)', principal: true },
  PBpctMS: { nome: 'PB na matéria seca', principal: true },
  PDRpctPB: { nome: 'PDR na proteína bruta', principal: false },
  PNDRpctPB: { nome: 'PNDR na proteína bruta', principal: false },
  CaP: { nome: 'Relação Ca/P das exigências', principal: true },
};

export const minerais: Record<string, string> = {
  Ca: 'Cálcio (Ca)',
  P: 'Fósforo (P)',
  Mg: 'Magnésio (Mg)',
  Na: 'Sódio (Na)',
  K: 'Potássio (K)',
  S: 'Enxofre (S)',
};

export const etapasMineral: Record<string, string> = {
  mantenca: 'Mantença',
  ganho: 'Ganho',
  liquida: 'Líquida total',
  dietetica: 'Na dieta',
};

/** Unidade como o produtor lê. */
export const unidades: Record<string, string> = {
  kg: 'kg',
  'kg/dia': 'kg/dia',
  'g/dia': 'g/dia',
  'mg/dia': 'mg/dia',
  'Mcal/dia': 'Mcal/dia',
  '% MS': '% da MS',
  '% PB': '% da PB',
  '%': '%',
  fração: '',
  adimensional: '',
};

/** Nomes das variáveis que aparecem em "Como foi calculado?". */
export const variaveis: Record<string, string> = {
  PC: 'Peso corporal médio',
  PCJ: 'Peso corporal em jejum',
  PCVZ: 'Peso de corpo vazio',
  PCVZeq: 'Peso de corpo vazio equivalente',
  GMD: 'Ganho médio diário desejado',
  GPCVZ: 'Ganho de peso de corpo vazio',
  CMS: 'Consumo de matéria seca',
  NC: 'Teor de concentrado',
  CMSs: 'Consumo de suplemento',
  CNDT: 'NDT exigido (consumo de NDT da equação)',
};

// ---------------------------------------------------------------------------
// Avaliação de dietas (6B-5). Só rótulos: números, situações e motivos vêm do main.
// ---------------------------------------------------------------------------

export const tiposQuantidade: Record<TipoQuantidadeDieta, string> = {
  oferecido: 'Oferta (quantidade posta no cocho)',
  consumo_observado: 'Consumo observado (oferecido menos sobras medidas)',
  consumo_assumido_sem_sobras: 'Consumo assumido (simulação, sem sobras)',
};

export const explicacaoTipoQuantidade: Record<TipoQuantidadeDieta, string> = {
  oferecido:
    'O que foi posto no cocho não é o que o animal comeu: o balanço não conclui e as exigências usam o CMS previsto.',
  consumo_observado:
    'Informe as sobras medidas de cada alimento, na mesma base da quantidade. O consumo é estimado por diferença.',
  consumo_assumido_sem_sobras:
    'Simulação: supõe que o animal come tudo o que foi informado. Não é consumo medido.',
};

export const basesQuantidade: Record<'mn' | 'ms', string> = {
  mn: 'Matéria natural (como oferecido)',
  ms: 'Matéria seca',
};

export const situacoesBalanco: Record<SituacaoBalanco, string> = {
  cobertura_teorica: 'Cobertura teórica',
  deficit_estimado: 'Déficit estimado',
  indeterminado: 'Indeterminado',
};

export const explicacaoBalanco: Record<SituacaoBalanco, string> = {
  cobertura_teorica:
    'A oferta calculada alcança a exigência deste nutriente. Não é adequação nutricional completa.',
  deficit_estimado: 'A oferta calculada fica abaixo da exigência deste nutriente.',
  indeterminado: 'Falta dado para comparar; nada é concluído (nunca vira zero).',
};

export const situacoesOferta: Record<SituacaoOferta, string> = {
  completa: 'Completa',
  limite_inferior: 'Limite inferior (garantia mínima)',
  limite_superior: 'Limite superior (garantia máxima)',
  limites_mistos: 'Limites mistos',
  parcial: 'Parcial',
  indeterminada: 'Indeterminada',
};

export const situacoesContribuicao: Record<SituacaoContribuicao, string> = {
  conhecida: 'Conhecida',
  limite_inferior: 'Garantia mínima',
  limite_superior: 'Garantia máxima',
  desconhecida: 'Desconhecida',
};

/** Nome dos nutrientes da oferta e do balanço. */
export const nutrientesDieta: Record<string, string> = {
  NDT: 'Nutrientes digestíveis totais (NDT)',
  PB: 'Proteína bruta (PB)',
  PDR: 'Proteína degradável no rúmen (PDR)',
  PNDR: 'Proteína não degradável no rúmen (PNDR)',
  PM: 'Proteína metabolizável (PM)',
  Ca: 'Cálcio (Ca)',
  P: 'Fósforo (P)',
  Mg: 'Magnésio (Mg)',
  Na: 'Sódio (Na)',
  K: 'Potássio (K)',
  S: 'Enxofre (S)',
};

export const tiposPerfil: Record<string, string> = {
  referencia_individual: 'Referência individual',
  agregado_central: 'Agregado central',
  cenario_real: 'Cenário real',
};

export const cenariosPerfil: Record<string, string> = {
  unico: 'Único',
  central: 'Central',
  conservador: 'Conservador',
  favoravel: 'Favorável',
};
