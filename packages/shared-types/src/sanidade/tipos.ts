import type {
  AbrangenciaManejo,
  SituacaoAgenda,
  StatusAgendaSanitaria,
  TipoManejoSanitario,
  TipoProdutoSanitario,
  UnidadeDose,
  ViaAplicacao,
} from '@pecuaria/domain';

import type { MovimentoEstoque } from '../estoque/tipos';

interface Ref {
  id: string;
  nome: string;
}

export interface ProdutoSanitario {
  id: string;
  nome: string;
  tipo: TipoProdutoSanitario;
  fabricante: string | null;
  principioAtivo: string | null;
  unidadeDose: UnidadeDose | null;
  carenciaCarneDias: number | null;
  carenciaLeiteDias: number | null;
  observacoes: string | null;
  /** Registros sanitários que usam o produto. */
  usos: number;
}

export interface ManejoResumo {
  id: string;
  propriedadeId: string;
  tipo: TipoManejoSanitario;
  data: string;
  produto: Ref | null;
  descricao: string | null;
  dose: number | null;
  unidadeDose: UnidadeDose | null;
  abrangencia: AbrangenciaManejo;
  lote: Ref | null;
  quantidadeAnimais: number;
  carenciaCarneDias: number | null;
  carenciaLeiteDias: number | null;
  custoTotalCentavos: number | null;
  responsavel: string | null;
}

export interface AnimalDoManejo {
  eventoId: string;
  animalId: string;
  identificacao: string;
  nome: string | null;
  /** Dose individual, quando diferente da dose comum do registro. */
  dose: number | null;
  observacao: string | null;
}

export interface ManejoDetalhe extends ManejoResumo {
  /** Consumo físico explícito; ausente em fixtures antigas, vazio nos registros sem baixa. */
  consumosEstoque?: MovimentoEstoque[];
  via: ViaAplicacao | null;
  diagnostico: string | null;
  observacoes: string | null;
  animais: AnimalDoManejo[];
  /**
   * Fim do prazo de carência: data da aplicação + dias informados pelo usuário.
   * Não é garantia de liberação: o prazo correto é o da bula e da orientação profissional.
   */
  fimCarenciaCarne: string | null;
  fimCarenciaLeite: string | null;
  /** Próxima aplicação agendada a partir deste registro. */
  proximaAgendada: ItemAgenda | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface PaginaManejos {
  itens: ManejoResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

/** Um registro sanitário do ponto de vista de um animal. */
export interface EventoSanitarioAnimal {
  eventoId: string;
  manejoId: string;
  tipo: TipoManejoSanitario;
  data: string;
  produto: Ref | null;
  descricao: string | null;
  /** Dose aplicada no animal: a individual, ou a comum do registro. */
  dose: number | null;
  unidadeDose: UnidadeDose | null;
  via: ViaAplicacao | null;
  abrangencia: AbrangenciaManejo;
  lote: Ref | null;
  carenciaCarneDias: number | null;
  carenciaLeiteDias: number | null;
  fimCarenciaCarne: string | null;
  fimCarenciaLeite: string | null;
  responsavel: string | null;
  diagnostico: string | null;
  observacao: string | null;
}

/** Carência ainda em curso: o fim de prazo mais distante entre as aplicações. */
export interface CarenciaAtiva {
  fimPrazo: string;
  manejoId: string;
  produto: string;
}

export interface SanidadeDoAnimal {
  eventos: EventoSanitarioAnimal[];
  carenciaCarne: CarenciaAtiva | null;
  carenciaLeite: CarenciaAtiva | null;
  /** Eventos pendentes da agenda para o animal ou para o lote atual dele. */
  agenda: ItemAgenda[];
}

export interface ItemAgenda {
  id: string;
  propriedadeId: string;
  dataPrevista: string;
  tipo: TipoManejoSanitario;
  produto: Ref | null;
  descricao: string | null;
  lote: Ref | null;
  animal: { id: string; identificacao: string } | null;
  status: StatusAgendaSanitaria;
  /** Só para eventos pendentes. */
  situacao: SituacaoAgenda | null;
  manejoOrigemId: string | null;
  manejoRealizadoId: string | null;
  dataConclusao: string | null;
  motivoCancelamento: string | null;
  observacoes: string | null;
}

export interface AnimalEmCarencia {
  animalId: string;
  identificacao: string;
  nome: string | null;
  lote: Ref | null;
  carne: CarenciaAtiva | null;
  leite: CarenciaAtiva | null;
}

export interface ResumoSanidade {
  antecedenciaDias: number;
  agendaAtrasada: number;
  /** Para hoje e dentro da antecedência configurada. */
  agendaProxima: number;
  emCarencia: AnimalEmCarencia[];
  alertasPesagemPendentes: number;
}
