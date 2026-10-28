import { z } from 'zod';
import { entradasEstoque, esquemaPreferenciasEstoque } from './estoque/esquemas';
import type {
  ResumoItemEstoque,
  DetalheItemEstoque,
  LoteEstoque,
  MovimentoEstoque,
  AlertasEstoque,
  PreviaEstoque,
  PaginaMovimentosEstoque,
} from './estoque/tipos';
import { entradasFinanceiro } from './financeiro/esquemas';
import { entradasCaixa } from './financeiro/esquemas-caixa';
import { entradasNegociacao } from './financeiro/esquemas-negociacao';
import { entradasInsumos } from './financeiro/esquemas-insumos';
import { entradasRateio } from './financeiro/esquemas-rateio';
import { entradasProducao } from './financeiro/esquemas-producao';
import { entradasResultado } from './financeiro/esquemas-resultado';
import { entradasRelatorio, type Relatorio } from './financeiro/relatorio';
import { entradasDevolucao } from './financeiro/esquemas-devolucao';
import { entradasAlimentos } from './alimentos/esquemas';
import { entradasComposicao } from './alimentos/esquemas-composicao';
import { entradasAtalhosAlimentos } from './alimentos/esquemas-atalhos';
import { entradasCuradoria } from './alimentos/esquemas-curadoria';
import { entradasSelecao } from './alimentos/esquemas-selecao';
import { entradasNutricao } from './nutricao/esquemas';
import type {
  AvaliacaoDietaCalculada,
  AvaliacaoNutricionalGravada,
  ExigenciasCalculadas,
  PerfilParaDieta,
  ResumoAvaliacaoNutricional,
} from './nutricao/tipos';
import type {
  ExecucaoSelecao,
  PerfilDetalhe,
  RegraSelecaoApi,
  ResumoPerfil,
} from './alimentos/tipos-selecao';
import type {
  ResultadoAtualizacaoCuradoria,
  ResultadoImportacaoCuradoria,
  ResumoPacoteCuradoria,
} from './alimentos/tipos-curadoria';
import type { RegistroDetalhe, ResumoRegistro } from './alimentos/tipos-composicao';
import type {
  AlimentoDetalhe,
  Fonte,
  FonteDetalhe,
  Nutriente,
  ResumoAlimento,
  VinculoAlimentoItem,
} from './alimentos/tipos';
import type { DevolucaoDetalhe, PrevisaoDevolucao } from './financeiro/tipos-devolucao';
import type {
  Conciliacao,
  IndicadoresDoPeriodo,
  PontoDeEquilibrioApi,
  ProjecaoApi,
  RealizadoDoPeriodo,
  ResultadoDoPeriodo,
} from './financeiro/tipos-resultado';
import type {
  CandidatosDoCentro,
  CentroProducaoDetalhe,
  CentroProducaoResumo,
} from './financeiro/tipos-producao';
import type {
  ExplicacaoDeCusto,
  ExplicacaoDoLote,
  PaginaCustosAnimais,
  PendentesDeRateio,
  PreviaDeRateio,
  RateioDetalhe,
  ResumoDeCustos,
  ResumoDeRateio,
} from './financeiro/tipos-rateio';
import type {
  ClassificacaoDeOrigem,
  CompraInsumosDetalhe,
  CustoSanitarioRegistro,
  PaginaCompras,
  PaginaConsumos,
  PendenciasEstoqueFinanceiro,
  ResumoConsumos,
} from './financeiro/tipos-insumos';
import type {
  CustoAnterior,
  CustoDoAnimal,
  NegociacaoDetalhe,
  PaginaNegociacoes,
} from './financeiro/tipos-negociacao';
import type {
  FluxoDeCaixa,
  PaginaContas,
  PainelFinanceiro,
  PreviaClassificacao,
  ResultadoClassificacaoEmLote,
  ResumoClassificacao,
} from './financeiro/tipos-caixa';
import type {
  CategoriaFinanceira,
  LancamentoDetalhe,
  PaginaLancamentos,
  PessoaComercial,
} from './financeiro/tipos';
import './idioma';
import type { CanalApi } from './canais';
import type { Resultado } from './resultado';
import { entradasRebanho, esquemaId, esquemaParametrosAlertasPesagem } from './rebanho/esquemas';
import { entradasSanidade, esquemaPreferenciasSanidade } from './sanidade/esquemas';
import type {
  ItemAgenda,
  ManejoDetalhe,
  PaginaManejos,
  ProdutoSanitario,
  ResumoSanidade,
  SanidadeDoAnimal,
} from './sanidade/tipos';
import type {
  AlertasPesagem,
  AnimalDetalhe,
  Area,
  EvolucaoLote,
  HistoricoAnimal,
  Lote,
  LoteDetalhe,
  PaginaAnimais,
  PesagensDoAnimal,
  Pesagem,
  Propriedade,
  Raca,
  ResultadoImportacao,
  ResultadoPesagemLote,
  ResultadoTransferencia,
} from './rebanho/tipos';

// ---------------------------------------------------------------------------
// Esquemas de entrada. São validados no renderer (experiência do usuário) e
// novamente no main (segurança), porque o renderer não é confiável.
// ---------------------------------------------------------------------------

const semEntrada = z.object({}).strict();

/** Chaves de configuração: minúsculas, segmentos separados por ponto. */
export const esquemaChaveConfiguracao = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/, 'Chave de configuração inválida');

const LIMITE_VALOR_CONFIGURACAO_BYTES = 16 * 1024;

export const esquemaValorConfiguracao = z
  .json()
  .refine(
    (valor) => JSON.stringify(valor).length <= LIMITE_VALOR_CONFIGURACAO_BYTES,
    'Valor de configuração excede o tamanho máximo',
  );

/**
 * Identificador de backup é o nome do arquivo, sem diretório. O padrão
 * impede caminhos relativos como "../".
 */
export const esquemaIdBackup = z
  .string()
  .max(128)
  .regex(
    /^pecuaria_[0-9]{8}-[0-9]{6}-[0-9]{3}_[a-z_]+(-[0-9]+)?\.db$/,
    'Identificador de backup inválido',
  );

export const TEMAS_INTERFACE = ['claro', 'escuro', 'sistema'] as const;
export type TemaInterface = (typeof TEMAS_INTERFACE)[number];

/**
 * Chaves de configuração com formato conhecido. O serviço do main valida o
 * valor dessas chaves. Chaves não listadas aceitam qualquer JSON válido.
 */
export const esquemasConfiguracaoConhecida = {
  'interface.tema': z.enum(TEMAS_INTERFACE),
  'interface.propriedadeAtual': esquemaId,
  'alertas.pesagem': esquemaParametrosAlertasPesagem,
  'alertas.sanidade': esquemaPreferenciasSanidade,
  'alertas.estoque': esquemaPreferenciasEstoque,
} as const;

export const PASTAS_ABRIVEIS = ['dados', 'backups', 'logs'] as const;
export type PastaAbrivel = (typeof PASTAS_ABRIVEIS)[number];

export const NIVEIS_LOG = ['erro', 'aviso', 'info'] as const;
export type NivelLogRenderer = (typeof NIVEIS_LOG)[number];

/** Converte {canal: esquema} em {canal: {entrada: esquema}}, mantendo os tipos. */
function comoContrato<T extends Record<string, z.ZodType>>(
  entradas: T,
): { [K in keyof T]: { entrada: T[K] } } {
  return Object.fromEntries(
    Object.entries(entradas).map(([canal, entrada]) => [canal, { entrada }]),
  ) as { [K in keyof T]: { entrada: T[K] } };
}

export const contratoApi = {
  'sistema:obterInfo': { entrada: semEntrada },
  'sistema:abrirPasta': { entrada: z.object({ pasta: z.enum(PASTAS_ABRIVEIS) }).strict() },
  'configuracao:obter': { entrada: z.object({ chave: esquemaChaveConfiguracao }).strict() },
  'configuracao:definir': {
    entrada: z
      .object({ chave: esquemaChaveConfiguracao, valor: esquemaValorConfiguracao })
      .strict(),
  },
  'backup:listar': { entrada: semEntrada },
  'backup:criar': {
    entrada: z.object({ observacao: z.string().trim().max(200).optional() }).strict(),
  },
  'backup:restaurar': { entrada: z.object({ id: esquemaIdBackup }).strict() },
  'backup:exportar': { entrada: z.object({ id: esquemaIdBackup }).strict() },
  'backup:importarERestaurar': { entrada: semEntrada },
  'log:registrar': {
    entrada: z
      .object({
        nivel: z.enum(NIVEIS_LOG),
        mensagem: z.string().max(2000),
        pilha: z.string().max(8000).optional(),
        origem: z.string().max(200).optional(),
      })
      .strict(),
  },
  ...comoContrato(entradasRebanho),
  ...comoContrato(entradasSanidade),
  ...comoContrato(entradasEstoque),
  ...comoContrato(entradasFinanceiro),
  ...comoContrato(entradasCaixa),
  ...comoContrato(entradasNegociacao),
  ...comoContrato(entradasInsumos),
  ...comoContrato(entradasRateio),
  ...comoContrato(entradasProducao),
  ...comoContrato(entradasResultado),
  ...comoContrato(entradasRelatorio),
  ...comoContrato(entradasDevolucao),
  ...comoContrato(entradasAlimentos),
  ...comoContrato(entradasComposicao),
  ...comoContrato(entradasAtalhosAlimentos),
  ...comoContrato(entradasCuradoria),
  ...comoContrato(entradasSelecao),
  ...comoContrato(entradasNutricao),
} as const satisfies Record<CanalApi, { entrada: z.ZodType }>;

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------

export type ValorJson =
  string | number | boolean | null | ValorJson[] | { [chave: string]: ValorJson };

export type TipoBackup = 'automatico' | 'manual' | 'pre_migracao' | 'pre_restauracao' | 'importado';

export interface InfoBackup {
  id: string;
  tipo: TipoBackup;
  criadoEm: string;
  tamanhoBytes: number;
  hashSha256: string;
  versaoSchema: number;
  versaoApp: string;
  observacao: string | null;
}

export interface MigracaoAplicada {
  versao: number;
  nome: string;
  aplicadaEm: string;
}

export interface InfoSistema {
  versaoApp: string;
  versaoElectron: string;
  versaoChrome: string;
  versaoNode: string;
  versaoSqlite: string;
  versaoSchema: number;
  versaoSchemaSuportada: number;
  migracoesAplicadas: MigracaoAplicada[];
  caminhos: { dados: string; banco: string; backups: string; logs: string };
  empacotado: boolean;
}

export interface ResultadoRestauracao {
  restauradoDe: InfoBackup;
  backupSeguranca: InfoBackup;
  migracoesAplicadas: number;
}

export type ResultadoComCancelamento<T> = { cancelado: true } | { cancelado: false; dados: T };

export interface SaidasApi {
  'estoque:listar': ResumoItemEstoque[];
  'estoque:obter': DetalheItemEstoque;
  'estoque:criarItem': ResumoItemEstoque;
  'estoque:atualizarItem': ResumoItemEstoque;
  'estoque:criarLote': LoteEstoque;
  'estoque:atualizarLote': LoteEstoque;
  'estoque:registrar': MovimentoEstoque;
  'estoque:corrigir': MovimentoEstoque;
  'estoque:cancelar': null;
  'estoque:prever': PreviaEstoque;
  'estoque:alertas': AlertasEstoque;
  'estoque:extrato': PaginaMovimentosEstoque;
  'pessoaComercial:listar': PessoaComercial[];
  'pessoaComercial:criar': PessoaComercial;
  'pessoaComercial:atualizar': PessoaComercial;
  'categoriaFinanceira:listar': CategoriaFinanceira[];
  'categoriaFinanceira:criar': CategoriaFinanceira;
  'categoriaFinanceira:atualizar': CategoriaFinanceira;
  'lancamento:listar': PaginaLancamentos;
  'lancamento:obter': LancamentoDetalhe;
  'lancamento:criar': LancamentoDetalhe;
  'lancamento:atualizar': LancamentoDetalhe;
  'lancamento:cancelar': LancamentoDetalhe;
  'lancamento:definirPagamento': LancamentoDetalhe;
  'lancamento:renegociar': LancamentoDetalhe;
  'pagamento:registrar': LancamentoDetalhe;
  'pagamento:estornar': LancamentoDetalhe;
  'fluxo:obter': FluxoDeCaixa;
  'conta:listar': PaginaContas;
  'painel:obter': PainelFinanceiro;
  'classificacao:resumo': ResumoClassificacao;
  'classificacao:previa': PreviaClassificacao;
  'classificacao:aplicarCategoria': ResultadoClassificacaoEmLote;
  'classificacao:definirLancamento': LancamentoDetalhe;
  'negociacao:listar': PaginaNegociacoes;
  'negociacao:obter': NegociacaoDetalhe;
  'negociacao:registrarCompra': NegociacaoDetalhe;
  'negociacao:registrarVenda': NegociacaoDetalhe;
  'negociacao:cancelar': NegociacaoDetalhe;
  'animal:desfazerSaida': AnimalDetalhe;
  'custoAnterior:listar': CustoAnterior[];
  'custoAnterior:registrar': CustoAnterior;
  'custoAnterior:cancelar': CustoAnterior;
  'custoAnimal:obter': CustoDoAnimal;
  'compraInsumo:listar': PaginaCompras;
  'compraInsumo:obter': CompraInsumosDetalhe;
  'compraInsumo:registrar': CompraInsumosDetalhe;
  'compraInsumo:corrigirItem': CompraInsumosDetalhe;
  'compraInsumo:cancelar': CompraInsumosDetalhe;
  'compraInsumo:vincularEntrada': CompraInsumosDetalhe;
  'compraInsumo:criarDaEntrada': CompraInsumosDetalhe;
  'auditoria:pendencias': PendenciasEstoqueFinanceiro;
  'consumo:listar': PaginaConsumos;
  'consumo:resumo': ResumoConsumos;
  'custoSanitario:obter': CustoSanitarioRegistro;
  'custoSanitario:lancarServico': CustoSanitarioRegistro;
  'classificacaoOrigem:listar': ClassificacaoDeOrigem[];
  'classificacaoOrigem:definir': ClassificacaoDeOrigem[];
  'rateio:pendentes': PendentesDeRateio;
  'rateio:previa': PreviaDeRateio;
  'rateio:criar': RateioDetalhe;
  'rateio:revisar': RateioDetalhe;
  'rateio:cancelar': RateioDetalhe;
  'rateio:listar': ResumoDeRateio[];
  'rateio:obter': RateioDetalhe;
  'custo:resumo': ResumoDeCustos;
  'custo:lote': ExplicacaoDoLote;
  'custo:animais': PaginaCustosAnimais;
  'custo:animal': ExplicacaoDeCusto;
  'producao:listar': CentroProducaoResumo[];
  'producao:obter': CentroProducaoDetalhe;
  'producao:criar': CentroProducaoDetalhe;
  'producao:atualizar': CentroProducaoDetalhe;
  'producao:cancelar': CentroProducaoDetalhe;
  'producao:candidatos': CandidatosDoCentro;
  'producao:vincular': CentroProducaoDetalhe;
  'producao:desvincular': CentroProducaoDetalhe;
  'producao:encerrar': CentroProducaoDetalhe;
  'producao:reabrir': CentroProducaoDetalhe;
  'resultado:periodo': ResultadoDoPeriodo;
  'resultado:realizado': RealizadoDoPeriodo;
  'resultado:indicadores': IndicadoresDoPeriodo;
  'resultado:conciliacao': Conciliacao;
  'resultado:pontoEquilibrio': PontoDeEquilibrioApi;
  'projecao:calcular': ProjecaoApi;
  'relatorio:montar': Relatorio;
  'relatorio:exportar': ResultadoComCancelamento<{ caminho: string; bytes: number }>;
  'devolucao:prever': PrevisaoDevolucao;
  'devolucao:registrar': DevolucaoDetalhe;
  'devolucao:obter': DevolucaoDetalhe;
  'devolucao:cancelar': DevolucaoDetalhe;
  'fonte:listar': Fonte[];
  'fonte:obter': FonteDetalhe;
  'fonte:criar': Fonte;
  'fonte:atualizar': Fonte;
  'fonte:excluir': Fonte;
  'nutriente:listar': Nutriente[];
  'nutriente:criar': Nutriente;
  'nutriente:atualizar': Nutriente;
  'alimento:listar': ResumoAlimento[];
  'alimento:obter': AlimentoDetalhe;
  'alimento:criar': ResumoAlimento;
  'alimento:atualizar': ResumoAlimento;
  'alimento:excluir': ResumoAlimento;
  'vinculoAlimento:obter': VinculoAlimentoItem;
  'vinculoAlimento:definir': VinculoAlimentoItem;
  'composicao:listar': ResumoRegistro[];
  'composicao:obter': RegistroDetalhe;
  'composicao:criar': RegistroDetalhe;
  'composicao:atualizar': RegistroDetalhe;
  'composicao:salvarValor': RegistroDetalhe;
  'composicao:removerValor': RegistroDetalhe;
  'composicao:salvarNaoQuantificado': RegistroDetalhe;
  'composicao:removerNaoQuantificado': RegistroDetalhe;
  'composicao:transcrever': RegistroDetalhe;
  'composicao:devolver': RegistroDetalhe;
  'composicao:conferir': RegistroDetalhe;
  'composicao:rejeitar': RegistroDetalhe;
  'composicao:reabrir': RegistroDetalhe;
  'composicao:novaVersao': RegistroDetalhe;
  'composicao:descartar': RegistroDetalhe;
  'vinculoOrigem:decidir': RegistroDetalhe;
  'rotulo:registrar': RegistroDetalhe;
  'laudo:registrar': RegistroDetalhe;
  'medicaoMs:registrar': RegistroDetalhe;
  'curadoria:listar': ResumoPacoteCuradoria[];
  'curadoria:importar': ResultadoImportacaoCuradoria;
  'curadoria:atualizar': ResultadoAtualizacaoCuradoria;
  'selecao:regras': RegraSelecaoApi[];
  'selecao:aprovarRegra': RegraSelecaoApi;
  'selecao:executar': ExecucaoSelecao;
  'nutricao:calcularExigencias': ExigenciasCalculadas;
  'nutricao:avaliarDieta': AvaliacaoDietaCalculada;
  'nutricao:perfisParaDieta': PerfilParaDieta[];
  'nutricao:registrarAvaliacao': AvaliacaoNutricionalGravada;
  'nutricao:listarAvaliacoes': ResumoAvaliacaoNutricional[];
  'nutricao:obterAvaliacao': AvaliacaoNutricionalGravada;
  'nutricao:anularAvaliacao': AvaliacaoNutricionalGravada;
  'perfil:gravar': PerfilDetalhe;
  'perfil:listar': ResumoPerfil[];
  'perfil:obter': PerfilDetalhe;
  'avaliacao:marcar': RegistroDetalhe;
  'avaliacao:retirar': RegistroDetalhe;
  'sistema:obterInfo': InfoSistema;
  'sistema:abrirPasta': null;
  'configuracao:obter': { valor: ValorJson | null };
  'configuracao:definir': null;
  'backup:listar': InfoBackup[];
  'backup:criar': InfoBackup;
  'backup:restaurar': ResultadoRestauracao;
  'backup:exportar': ResultadoComCancelamento<{ caminho: string }>;
  'backup:importarERestaurar': ResultadoComCancelamento<ResultadoRestauracao>;
  'log:registrar': null;

  'propriedade:listar': Propriedade[];
  'propriedade:criar': Propriedade;
  'propriedade:atualizar': Propriedade;
  'propriedade:excluir': null;
  'area:listar': Area[];
  'area:criar': Area;
  'area:atualizar': Area;
  'area:excluir': null;
  'raca:listar': Raca[];
  'raca:criar': Raca;
  'raca:atualizar': Raca;
  'raca:excluir': null;
  'lote:listar': Lote[];
  'lote:obter': LoteDetalhe;
  'lote:criar': Lote;
  'lote:atualizar': Lote;
  'lote:moverArea': Lote;
  'lote:encerrar': Lote;
  'lote:reabrir': Lote;
  'animal:listar': PaginaAnimais;
  'animal:obter': AnimalDetalhe;
  'animal:criar': AnimalDetalhe;
  'animal:atualizar': AnimalDetalhe;
  'animal:transferir': ResultadoTransferencia;
  'animal:registrarSaida': AnimalDetalhe;
  'animal:excluir': null;
  'animal:historico': HistoricoAnimal;
  'animal:importarCsv': ResultadoImportacao;
  'animal:salvarModeloCsv': ResultadoComCancelamento<{ caminho: string }>;
  'pesagem:listar': PesagensDoAnimal;
  'pesagem:registrar': Pesagem;
  'pesagem:atualizar': Pesagem;
  'pesagem:excluir': null;
  'pesagem:conferir': Pesagem;
  'pesagem:registrarLote': ResultadoPesagemLote;
  'pesagem:alertas': AlertasPesagem;
  'lote:evolucao': EvolucaoLote;

  'produtoSanitario:listar': ProdutoSanitario[];
  'produtoSanitario:criar': ProdutoSanitario;
  'produtoSanitario:atualizar': ProdutoSanitario;
  'produtoSanitario:excluir': null;
  'manejoSanitario:listar': PaginaManejos;
  'manejoSanitario:obter': ManejoDetalhe;
  'manejoSanitario:registrar': ManejoDetalhe;
  'manejoSanitario:atualizar': ManejoDetalhe;
  'manejoSanitario:removerAnimal': ManejoDetalhe;
  'manejoSanitario:excluir': null;
  'sanidade:doAnimal': SanidadeDoAnimal;
  'sanidade:resumo': ResumoSanidade;
  'agendaSanitaria:listar': ItemAgenda[];
  'agendaSanitaria:criar': ItemAgenda;
  'agendaSanitaria:atualizar': ItemAgenda;
  'agendaSanitaria:cancelar': ItemAgenda;
}

// Garante, em tempo de compilação, que todo canal tem tipo de saída.
type ChavesIguais<A, B> = [Exclude<A, B>, Exclude<B, A>] extends [never, never] ? true : false;
const _saidasCompletas: ChavesIguais<keyof SaidasApi, CanalApi> = true;
void _saidasCompletas;

export type EntradaApi<C extends CanalApi> = z.input<(typeof contratoApi)[C]['entrada']>;
export type EntradaValidadaApi<C extends CanalApi> = z.output<(typeof contratoApi)[C]['entrada']>;
export type SaidaApi<C extends CanalApi> = SaidasApi[C];

/** Superfície exposta pelo preload em `window.api`. Nada além disso. */
export interface ApiPreload {
  invocar<C extends CanalApi>(canal: C, entrada: EntradaApi<C>): Promise<Resultado<SaidaApi<C>>>;
}
