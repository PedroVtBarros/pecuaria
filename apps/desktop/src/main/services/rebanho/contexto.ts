import {
  ErroAplicacao,
  esquemaParametrosAlertasPesagem,
  esquemaPreferenciasSanidade,
} from '@pecuaria/shared-types';
import {
  ANTECEDENCIA_AGENDA_INICIAL_DIAS,
  formatarCentavos,
  dataLocalIso,
  gerarUuidV7,
  PARAMETROS_ALERTAS_PESAGEM_INICIAIS,
  type ParametrosAlertasPesagem,
} from '@pecuaria/domain';
import {
  ehErroDeUnicidade,
  RepositorioAnimais,
  RepositorioConfiguracao,
  RepositorioHistorico,
  RepositorioLotes,
  RepositorioPesagens,
  RepositorioPropriedades,
  RepositorioRacas,
  RepositorioSanidade,
  RepositorioEstoque,
  RepositorioFinanceiro,
  RepositorioNegociacao,
  RepositorioDevolucao,
  RepositorioRateio,
  RepositorioApropriacao,
  RepositorioProducao,
  RepositorioInsumos,
  RepositorioResultado,
  type AcaoHistorico,
  type ConsumosForaDaJanela,
  type LancamentosForaDaJanela,
  type EntidadeHistorico,
  type GerenciadorBanco,
} from '@pecuaria/database';

/**
 * Dependências comuns dos serviços do rebanho. O relógio e o gerador de IDs
 * são injetáveis para os testes controlarem datas.
 */
export class ContextoRebanho {
  readonly propriedades: RepositorioPropriedades;
  readonly racas: RepositorioRacas;
  readonly lotes: RepositorioLotes;
  readonly animais: RepositorioAnimais;
  readonly pesagens: RepositorioPesagens;
  readonly historico: RepositorioHistorico;
  readonly sanidade: RepositorioSanidade;
  readonly configuracao: RepositorioConfiguracao;
  readonly estoque: RepositorioEstoque;
  readonly financeiro: RepositorioFinanceiro;
  readonly negociacao: RepositorioNegociacao;
  readonly devolucao: RepositorioDevolucao;
  readonly rateio: RepositorioRateio;
  readonly apropriacao: RepositorioApropriacao;
  readonly producao: RepositorioProducao;
  readonly insumos: RepositorioInsumos;
  readonly resultado: RepositorioResultado;

  constructor(
    readonly gerenciador: GerenciadorBanco,
    private readonly relogio: () => Date = () => new Date(),
    readonly gerarId: () => string = () => gerarUuidV7(),
  ) {
    const db = () => gerenciador.conexao;
    this.propriedades = new RepositorioPropriedades(db);
    this.racas = new RepositorioRacas(db);
    this.lotes = new RepositorioLotes(db);
    this.animais = new RepositorioAnimais(db);
    this.pesagens = new RepositorioPesagens(db);
    this.historico = new RepositorioHistorico(db);
    this.sanidade = new RepositorioSanidade(db);
    this.estoque = new RepositorioEstoque(db);
    this.financeiro = new RepositorioFinanceiro(db);
    this.negociacao = new RepositorioNegociacao(db);
    this.devolucao = new RepositorioDevolucao(db);
    this.rateio = new RepositorioRateio(db);
    this.apropriacao = new RepositorioApropriacao(db);
    this.producao = new RepositorioProducao(db);
    this.insumos = new RepositorioInsumos(db);
    this.resultado = new RepositorioResultado(db);
    this.configuracao = new RepositorioConfiguracao(db);
  }

  /** Limites de conferência de pesagem definidos pelo usuário, ou os iniciais. */
  parametrosAlertas(): ParametrosAlertasPesagem {
    const r = esquemaParametrosAlertasPesagem.safeParse(this.configuracao.obter('alertas.pesagem'));
    return r.success ? r.data : PARAMETROS_ALERTAS_PESAGEM_INICIAIS;
  }

  /** Antecedência dos avisos da agenda sanitária, em dias. */
  antecedenciaAgenda(): number {
    const r = esquemaPreferenciasSanidade.safeParse(this.configuracao.obter('alertas.sanidade'));
    return r.success ? r.data.antecedenciaDias : ANTECEDENCIA_AGENDA_INICIAL_DIAS;
  }

  /** Instante atual em ISO 8601 UTC, para created_at/updated_at. */
  agora(): string {
    return this.relogio().toISOString();
  }

  /** Data de hoje no fuso local, para validar datas de eventos. */
  hoje(): string {
    return dataLocalIso(this.relogio());
  }

  /**
   * Executa a operação numa transação. Índice único violado vira DUPLICADO,
   * cobrindo o caso raro de duas gravações simultâneas passarem pela checagem.
   */
  transacao<T>(operacao: () => T): T {
    try {
      return this.gerenciador.transacao(() => operacao());
    } catch (erro) {
      if (ehErroDeUnicidade(erro)) {
        throw new ErroAplicacao('DUPLICADO', 'Já existe um registro com esses dados.');
      }
      throw erro;
    }
  }

  registrarHistorico(
    entidade: EntidadeHistorico,
    entidadeId: string,
    acao: AcaoHistorico,
    antes: Record<string, unknown> | null,
    depois: Record<string, unknown> | null,
    motivo: string | null = null,
  ): void {
    this.historico.registrar({
      id: this.gerarId(),
      entidade,
      entidadeId,
      acao,
      dadosAnteriores: antes,
      dadosNovos: depois,
      motivo,
      ocorridoEm: this.agora(),
    });
  }
}

export function naoEncontrado(mensagem: string): ErroAplicacao {
  return new ErroAplicacao('NAO_ENCONTRADO', mensagem);
}

export function invalido(erros: readonly string[]): ErroAplicacao {
  return new ErroAplicacao(
    'ENTRADA_INVALIDA',
    erros.length === 1 ? erros[0]! : 'Há problemas nos dados informados.',
    [...erros],
  );
}

export function duplicado(mensagem: string): ErroAplicacao {
  return new ErroAplicacao('DUPLICADO', mensagem);
}

export function operacaoInvalida(mensagem: string, detalhes?: string[]): ErroAplicacao {
  return new ErroAplicacao('OPERACAO_INVALIDA', mensagem, detalhes);
}

/** Campos que mudaram entre dois instantâneos (para a trilha de alterações). */
export function houveMudanca(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): boolean {
  return JSON.stringify(antes) !== JSON.stringify(depois);
}

/** Data AAAA-MM-DD no formato brasileiro, para mensagens. */
export function dataBr(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Texto para recusar uma mudança de data que deixaria consumos de estoque fora do período em que
 * o animal ou o lote existia. Lista os primeiros movimentos e orienta a corrigir o estoque; o
 * sistema nunca altera nem cancela o consumo por conta própria.
 */
export function descreverConsumosConflitantes(
  consumos: ConsumosForaDaJanela,
  contexto: string,
): string {
  const lista = consumos.amostra
    .map(
      (c) =>
        `${dataBr(c.data)}: ${c.itemNome}, ${c.quantidade.toLocaleString('pt-BR')} ${c.unidadeBase}`,
    )
    .join('; ');
  const restantes = consumos.total - consumos.amostra.length;
  const mais = restantes > 0 ? ` e mais ${restantes}` : '';
  return `${contexto} (${lista}${mais}). Corrija ou cancele esses movimentos na tela de Estoque, ou informe uma data compatível. O consumo registrado não é alterado automaticamente.`;
}

/**
 * Texto para recusar uma mudança de data que deixaria lançamentos financeiros ativos fora do
 * período em que o animal ou o lote existia. O sistema orienta a corrigir o financeiro e nunca
 * altera nem cancela lançamentos por conta própria.
 */
export function descreverLancamentosConflitantes(
  lancamentos: LancamentosForaDaJanela,
  contexto: string,
): string {
  const lista = lancamentos.amostra
    .map((l) => `${dataBr(l.data)}: ${l.descricao}, ${formatarCentavos(l.valorTotalCentavos)}`)
    .join('; ');
  const restantes = lancamentos.total - lancamentos.amostra.length;
  const mais = restantes > 0 ? ` e mais ${restantes}` : '';
  return `${contexto} (${lista}${mais}). Corrija a data de competência ou cancele esses lançamentos no módulo Financeiro, ou informe uma data compatível. Os lançamentos não são alterados automaticamente.`;
}
