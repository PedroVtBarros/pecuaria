import {
  DEFINICOES_UNIDADE,
  type BaseNutricional,
  type ClasseAlimento,
  type DirecaoConservadora,
  type FormaConservacao,
  type FormaObtencao,
  type GrupoNutriente,
  type NaturezaNaoQuantificado,
  type OrigemFonte,
  type RelacaoVinculo,
  type SeparadorDecimal,
  type SituacaoFundamentacao,
  type SituacaoVinculo,
  type StatusRegistro,
  type TipoValor,
  type UnidadeNutricional,
} from '@pecuaria/domain';
import type { SituacaoAtualizacao, ValorNutricionalApi } from '@pecuaria/shared-types';
import type {
  CenarioPerfil,
  NivelCorrespondencia,
  SituacaoNutriente,
  TipoAvaliacao,
  TipoPerfil,
} from '@pecuaria/domain';

/** Textos do banco de alimentos (Fase 5A). Nenhum valor de composição aqui. */
export const origensFonte: Record<OrigemFonte, string> = {
  tabela_compilada: 'Tabela compilada',
  estudo_individual: 'Estudo individual',
  laboratorial: 'Laudo laboratorial',
  rotulo_comercial: 'Rótulo comercial',
  medicao_propria: 'Medição própria',
  sistema_exigencias: 'Sistema de exigências (Fase 6)',
};

/** Publicação científica × dado da propriedade × garantia de fabricante. */
export const naturezaDaOrigem: Record<OrigemFonte, string> = {
  tabela_compilada: 'Dado científico publicado',
  estudo_individual: 'Dado científico publicado',
  laboratorial: 'Análise de amostra da propriedade',
  rotulo_comercial: 'Garantia do fabricante',
  medicao_propria: 'Medição da propriedade',
  sistema_exigencias: 'Reservado',
};

export const formasConservacao: Record<FormaConservacao, string> = {
  fresco: 'Fresco',
  pastejo: 'Pastejo',
  ensilado: 'Ensilado',
  pre_secado: 'Pré-secado',
  feno: 'Feno',
  grao: 'Grão',
  farelo: 'Farelo',
  mistura_comercial: 'Mistura comercial',
  mineral: 'Mineral',
  outro: 'Outro',
};

export const classesAlimento: Record<ClasseAlimento, string> = {
  volumoso: 'Volumoso',
  pastagem: 'Pastagem',
  concentrado_energetico: 'Concentrado energético',
  concentrado_proteico: 'Concentrado proteico',
  suplemento_mineral: 'Suplemento mineral',
  suplemento_proteico: 'Suplemento proteico',
  suplemento_proteico_energetico: 'Suplemento proteico-energético',
  aditivo: 'Aditivo',
  subproduto: 'Subproduto',
  outro: 'Outro',
};

export const gruposNutriente: Record<GrupoNutriente, string> = {
  fracao_seca: 'Fração seca',
  proteina: 'Proteína',
  fibra: 'Fibra',
  energia: 'Energia',
  mineral_macro: 'Macromineral',
  mineral_micro: 'Micromineral',
  digestibilidade: 'Digestibilidade',
  outro: 'Outro',
};

export const basesNutricionais: Record<BaseNutricional, string> = {
  ms: 'MS',
  mn: 'MN',
};
export const basesPorExtenso: Record<BaseNutricional, string> = {
  ms: 'Matéria seca (MS)',
  mn: 'Matéria natural (MN)',
};

export const unidadesNutricionais = Object.fromEntries(
  Object.entries(DEFINICOES_UNIDADE).map(([u, d]) => [u, d.simbolo]),
) as Record<UnidadeNutricional, string>;

export const tiposValor: Record<TipoValor, string> = {
  valor_unico: 'Valor único',
  media: 'Média',
  mediana: 'Mediana',
  minimo_garantido: 'Mínimo garantido',
  maximo_garantido: 'Máximo garantido',
};

/** Como o número foi obtido, segundo a fonte. Nunca presumido "medido". */
export const formasObtencao: Record<FormaObtencao, string> = {
  medido: 'Medido',
  calculado: 'Calculado',
  estimado_equacao: 'Estimado por equação',
  estimado_nir: 'Estimado por NIR',
  nao_informado: 'Não informada pela fonte',
};

/** Relação do vínculo lida a partir de "este" registro (lado) ou do outro. */
export function descreverRelacao(relacao: RelacaoVinculo, lado: 'este' | 'outro'): string {
  switch (relacao) {
    case 'mesmos_valores':
      return 'Mesmos valores do outro registro: provavelmente os mesmos dados experimentais';
    case 'mesmo_experimento_provavel':
      return 'Provavelmente do mesmo experimento que o outro registro (material diferente)';
    case 'outro_inclui_este':
      return lado === 'este'
        ? 'O outro registro é uma média ou compilação que inclui os dados deste'
        : 'Este registro é uma média ou compilação que inclui os dados do outro';
    case 'outro_pode_incluir_este':
      return lado === 'este'
        ? 'O outro registro pode incluir os dados deste (sem prova numérica)'
        : 'Este registro pode incluir os dados do outro (sem prova numérica)';
  }
}

export const situacoesVinculo: Record<SituacaoVinculo, string> = {
  a_confirmar: 'A confirmar',
  confirmado: 'Confirmado',
  descartado: 'Descartado',
};

/** Seleção de composição (5D). */
export const niveisCorrespondencia: Record<NivelCorrespondencia, string> = {
  especifico: 'Específico',
  comparavel: 'Comparável',
  geral: 'Geral',
};

export const tiposPerfil: Record<TipoPerfil, string> = {
  referencia_individual: 'Referência individual',
  agregado_central: 'Agregado central',
  cenario_real: 'Cenário por perfil real',
};

export const cenariosPerfil: Record<CenarioPerfil, string> = {
  unico: 'Único',
  central: 'Central',
  conservador: 'Conservador',
  favoravel: 'Favorável',
};

export const situacoesNutriente: Record<SituacaoNutriente, string> = {
  agregado: 'Agregado',
  insuficiente: 'Evidência limitada: origens insuficientes',
  classes_distintas: 'Formas ou métodos distintos, não combinados',
  sem_dados: 'Sem valor elegível',
};

/** Avaliação científica (5D), separada da conferência. */
export const tiposAvaliacao: Record<TipoAvaliacao, string> = {
  uso_com_cautela: 'Uso com cautela',
  base_validada: 'Base validada',
};

/** O que a atualização de um pacote fez com cada registro (SITUACOES_ATUALIZACAO). */
export const situacoesAtualizacao: Record<SituacaoAtualizacao, string> = {
  atualizado: 'Corrigido e transcrito de novo',
  nova_versao: 'Nova versão, a conferir',
  novo: 'Registro novo',
  sem_mudanca: 'Sem mudança',
  mantido_em_edicao: 'Não alterado: em edição por você',
  mantido_rejeitado: 'Não alterado: rejeitado por você',
  mantido_descartado: 'Não alterado: descartado',
  bloqueado_ja_importado: 'Não alterado: bloqueado na versão nova',
  fora_da_versao: 'Não alterado: fora da versão nova',
};

/** O que o texto significa NA FONTE (escolhido pela legenda, nunca pelo símbolo). */
export const naturezasNaoQuantificado: Record<NaturezaNaoQuantificado, string> = {
  abaixo_do_limite: 'Abaixo do limite',
  acima_do_limite: 'Acima do limite',
  nao_detectado: 'Não detectado',
  tracos: 'Traços',
  nao_determinado: 'Não determinado',
  simbolo_sem_definicao: 'Símbolo sem definição na fonte',
};

export const direcoes: Record<DirecaoConservadora, string> = {
  menor: 'Menor valor',
  maior: 'Maior valor',
  nao_definida: 'Não definida',
};

export const situacoesFundamentacao: Record<SituacaoFundamentacao, string> = {
  pendente: 'Método pendente de fundamentação',
  fundamentada: 'Fundamentada',
};

export const separadores: Record<SeparadorDecimal, string> = {
  virgula: 'Vírgula (12,5)',
  ponto: 'Ponto (12.5)',
};

export const statusRegistro: Record<StatusRegistro, string> = {
  rascunho: 'Rascunho',
  transcrito: 'Transcrito, aguardando conferência',
  conferido: 'Conferido',
  rejeitado: 'Rejeitado',
  substituido: 'Substituído por versão nova',
};
export const tomStatus: Record<StatusRegistro, 'neutro' | 'alerta' | 'sucesso' | 'perigo'> = {
  rascunho: 'neutro',
  transcrito: 'alerta',
  conferido: 'sucesso',
  rejeitado: 'perigo',
  substituido: 'neutro',
};

export const avisosAlimentos = {
  semValorDeReferencia:
    'Nenhuma tabela de referência vem preenchida. Os valores entram só a partir de fonte cadastrada, com página ou tabela, e passam por conferência.',
  ausente: 'Não informado pela fonte',
  ausenteExplicacao:
    'Nutriente que a fonte não traz fica sem linha. O sistema nunca grava zero no lugar de dado ausente.',
  rotulo:
    'Rótulo comercial: os valores são níveis de garantia (mínimo ou máximo garantido) por kg de produto, na matéria natural. Não são composição típica; o teor real pode diferir.',
  medicao:
    'Método não validado pelo sistema. O valor foi medido na propriedade com o método e as limitações descritos abaixo; o sistema não corrige nem prescreve método.',
  laudo:
    'Laudo de uma amostra desta propriedade. Não substitui nem se mistura com tabela compilada.',
  pendente:
    'Método analítico pendente de fundamentação científica: a definição não foi validada contra publicação. Variantes de método (ex.: FDN corrigida) são definições diferentes e nunca equivalentes automaticamente.',
  conferenciaObrigatoria:
    'Só registros conferidos poderão ser usados em cálculos (Fase 6). Transcrever e conferir são etapas separadas.',
  mesmaPessoa:
    'A mesma pessoa transcreveu e conferiu este registro. É permitido, mas a conferência por outra pessoa é mais segura.',
  conferidoImutavel:
    'Registro conferido não muda. Para corrigir, crie uma nova versão: a atual continua valendo até a nova ser conferida.',
  curadoria:
    'Valores transcritos de fontes publicadas, com página ou relatório e data de consulta, só para os alimentos e nutrientes selecionados. Nada entra no banco sem você mandar importar.',
  curadoriaConferencia:
    'Nada é conferido automaticamente: cada registro só vale para cálculo depois que você conferir os valores contra a fonte, na aba Conferência. Registros que não conferirem podem ser rejeitados com motivo.',
  selecao:
    'A seleção só lê os registros: nada é alterado nem importado. Só registros conferidos são usados. Agregação exige origens independentes suficientes, mesma forma de obtenção e mesmo método; com menos, use uma referência individual. Perfis só são gravados por você, com a regra aprovada, e não mudam depois.',
  avaliacaoCientifica:
    'A conferência atesta que a transcrição é fiel à fonte. A avaliação científica diz se o dado é adequado para uso: "uso com cautela" tira o registro ou o valor da agregação automática; "base validada" deixa entrar na agregação um valor com base inferida. Nenhuma das duas altera o registro.',
  curadoriaAtualizacao:
    'A versão nova não duplica registros. Os ainda transcritos pelo pacote são corrigidos; os já conferidos ganham uma versão nova, transcrita, que você confere e que então substitui a anterior. O que você está editando, rejeitou ou descartou não é alterado: as mudanças ficam listadas para você decidir. Tudo fica no histórico.',
  naoQuantificado:
    'Valor não quantificado: o texto da fonte ("<0,01", "ND", "traços") e o que ele significa segundo a fonte. Não é número e nunca entra em cálculo como valor, nem como zero, nem pelo limite.',
  naturezaPelaFonte:
    'Escolha pela legenda ou pelo texto da fonte, não pelo símbolo: "ND" pode ser "não detectado" ou "não determinado".',
  vinculosOrigem:
    'Registros vinculados podem compartilhar a mesma origem experimental: não são independentes e não entram juntos numa média enquanto o vínculo não for descartado. A decisão é sua e fica no histórico.',
  numeroComoPublicado:
    'Digite o número exatamente como aparece na fonte, com o separador decimal do registro. Valores como "<0,01", "ND" ou "traços" não são números: use "Valor não quantificado".',
};

/** "12,50 % (MS)": número como publicado, unidade e base sempre juntos. */
export function valorComUnidade(
  v: Pick<ValorNutricionalApi, 'valorPublicado' | 'unidade' | 'base'>,
): string {
  return `${v.valorPublicado} ${unidadesNutricionais[v.unidade]} (${basesNutricionais[v.base]})`;
}

export function descreverFonte(f: { codigo: string | null; titulo: string }): string {
  return f.codigo ? `${f.codigo} · ${f.titulo}` : f.titulo;
}

const ACOES_HISTORICO: Record<string, string> = {
  criacao: 'Criação',
  alteracao: 'Alteração',
  exclusao: 'Exclusão ou descarte',
  transcricao: 'Transcrição',
  retorno_rascunho: 'Volta a rascunho',
  conferencia: 'Conferência',
  rejeicao: 'Rejeição',
  reabertura_rascunho: 'Reabertura para correção',
  nova_versao: 'Nova versão',
  substituicao: 'Substituído pela versão nova',
  vinculacao: 'Vínculo com item de estoque',
  desvinculacao: 'Vínculo desfeito',
};
export function rotuloAcaoHistorico(acao: string): string {
  return ACOES_HISTORICO[acao] ?? acao.replaceAll('_', ' ');
}
