import {
  dataLocalIso,
  formatarCentavos,
  gerarUuidV7,
  normalizarNome,
  quantidadeEmMilesimos,
  resumirLancamento,
  saldoDaParcela,
  semAcentos,
  situacaoDaParcela,
  somarCentavos,
  validarParcelas,
  type ComportamentoLancamento,
  type OrigemLancamento,
  type ParcelaPlanejada,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type CategoriaFinanceira,
  type CondicaoDefinidaValidada,
  type DadosCategoriaFinanceiraValidados,
  type DadosLancamentoValidados,
  type DadosPagamentoValidados,
  type DadosPessoaComercialValidados,
  type EdicaoLancamentoValidada,
  type FiltrosLancamentoValidados,
  type LancamentoDetalhe,
  type LancamentoResumo,
  type PagamentoFinanceiro,
  type PaginaLancamentos,
  type ParcelaFinanceira,
  type ParcelaPlanejadaValidada,
  type PessoaComercial,
} from '@pecuaria/shared-types';
import {
  ehErroDeUnicidade,
  RepositorioAnimais,
  RepositorioFinanceiro,
  RepositorioHistorico,
  RepositorioInsumos,
  RepositorioLotes,
  RepositorioPropriedades,
  RepositorioRateio,
  RepositorioProducao,
  type EntidadeHistorico,
  type AcaoHistorico,
  type GerenciadorBanco,
  type LinhaLancamento,
  type LinhaPagamento,
  type LinhaParcela,
} from '@pecuaria/database';

function invalido(mensagem: string): never {
  throw new ErroAplicacao('OPERACAO_INVALIDA', mensagem);
}
function naoEncontrado(mensagem: string): never {
  throw new ErroAplicacao('NAO_ENCONTRADO', mensagem);
}
/** Campos primitivos que mudaram entre dois retratos planos. */
function camposAlterados(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): string[] {
  return [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(
    (k) => antes[k] !== depois[k],
  );
}

interface CamposValidados {
  categoriaId: string;
  pessoaId: string | null;
  dataCompetencia: string;
  descricao: string;
  documentoNumero: string | null;
  atividade: LinhaLancamento['atividade'];
  destinoTipo: LinhaLancamento['destinoTipo'];
  loteId: string | null;
  animalId: string | null;
  quantidadeMilesimos: number | null;
  unidadeQuantidade: LinhaLancamento['unidadeQuantidade'];
  comportamentoCusto: ComportamentoLancamento;
  observacoes: string | null;
}

/**
 * Orquestra regras puras, SQL e trilha do módulo financeiro (entrega 4A).
 *
 * Princípios: dinheiro em centavos inteiros; competência (lançamento), caixa (pagamento) e custo
 * apropriado são coisas distintas; nada financeiro é criado sem ação do usuário; condição de
 * pagamento não informada deixa o lançamento pendente de definição, não "sem obrigação".
 */
export class ServicoFinanceiro {
  readonly repo: RepositorioFinanceiro;
  private readonly propriedades: RepositorioPropriedades;
  private readonly lotes: RepositorioLotes;
  private readonly animais: RepositorioAnimais;
  private readonly historico: RepositorioHistorico;
  private readonly insumos: RepositorioInsumos;
  private readonly rateios: RepositorioRateio;
  private readonly producao: RepositorioProducao;
  private readonly relogio: () => Date;
  private readonly gerarId: () => string;

  constructor(
    private readonly banco: GerenciadorBanco,
    opcoes: { relogio?: () => Date; gerarId?: () => string } = {},
  ) {
    const db = () => banco.conexao;
    this.repo = new RepositorioFinanceiro(db);
    this.propriedades = new RepositorioPropriedades(db);
    this.lotes = new RepositorioLotes(db);
    this.animais = new RepositorioAnimais(db);
    this.historico = new RepositorioHistorico(db);
    this.insumos = new RepositorioInsumos(db);
    this.rateios = new RepositorioRateio(db);
    this.producao = new RepositorioProducao(db);
    this.relogio = opcoes.relogio ?? (() => new Date());
    this.gerarId = opcoes.gerarId ?? gerarUuidV7;
  }

  private agora() {
    return this.relogio().toISOString();
  }
  private hoje() {
    return dataLocalIso(this.relogio());
  }
  private transacao<T>(fn: () => T): T {
    try {
      return this.banco.transacao(fn);
    } catch (e) {
      if (e instanceof ErroAplicacao) throw e;
      if (ehErroDeUnicidade(e))
        throw new ErroAplicacao('DUPLICADO', 'Nome ou identificador de operação já utilizado.');
      throw e;
    }
  }
  private auditar(
    entidade: EntidadeHistorico,
    id: string,
    acao: AcaoHistorico,
    antes: Record<string, unknown> | null,
    depois: Record<string, unknown> | null,
    motivo: string | null = null,
  ) {
    this.historico.registrar({
      id: this.gerarId(),
      entidade,
      entidadeId: id,
      acao,
      dadosAnteriores: antes,
      dadosNovos: depois,
      motivo,
      ocorridoEm: this.agora(),
    });
  }

  // ---- Contrapartes --------------------------------------------------------------------------
  listarPessoas(incluirInativas: boolean): PessoaComercial[] {
    return this.repo.listarPessoas(incluirInativas);
  }
  criarPessoa(d: DadosPessoaComercialValidados): PessoaComercial {
    const id = this.gerarId();
    return this.transacao(() => {
      this.repo.salvarPessoa(id, d, normalizarNome(d.nome), this.agora(), true);
      const nova = this.repo.obterPessoa(id)!;
      this.auditar('pessoa_comercial', id, 'criacao', null, { ...nova });
      return nova;
    });
  }
  atualizarPessoa(
    id: string,
    d: DadosPessoaComercialValidados,
    motivo: string | null,
  ): PessoaComercial {
    const atual = this.repo.obterPessoa(id);
    if (!atual) return naoEncontrado('Contraparte não encontrada.');
    return this.transacao(() => {
      this.repo.salvarPessoa(id, d, normalizarNome(d.nome), this.agora(), false);
      const nova = this.repo.obterPessoa(id)!;
      this.auditar('pessoa_comercial', id, 'alteracao', { ...atual }, { ...nova }, motivo);
      return nova;
    });
  }

  // ---- Categorias ----------------------------------------------------------------------------
  listarCategorias(incluirInativas: boolean): CategoriaFinanceira[] {
    return this.repo.listarCategorias(incluirInativas);
  }
  private comportamentoDaCategoria(
    natureza: 'receita' | 'despesa',
    informado: ComportamentoLancamento,
  ): ComportamentoLancamento {
    if (natureza === 'receita') return 'nao_se_aplica';
    if (informado === 'nao_se_aplica') return 'nao_classificado';
    return informado;
  }
  criarCategoria(d: DadosCategoriaFinanceiraValidados): CategoriaFinanceira {
    const id = this.gerarId();
    const dados = {
      ...d,
      comportamentoCusto: this.comportamentoDaCategoria(d.natureza, d.comportamentoCusto),
    };
    return this.transacao(() => {
      this.repo.salvarCategoria(id, dados, normalizarNome(d.nome), this.agora(), true);
      const nova = this.repo.obterCategoria(id)!;
      this.auditar('categoria_financeira', id, 'criacao', null, { ...nova });
      return nova;
    });
  }
  atualizarCategoria(
    id: string,
    d: DadosCategoriaFinanceiraValidados,
    motivo: string | null,
  ): CategoriaFinanceira {
    const atual = this.repo.obterCategoria(id);
    if (!atual) return naoEncontrado('Categoria não encontrada.');
    const mudouEstrutura =
      atual.natureza !== d.natureza || atual.tratamento !== d.tratamento || atual.grupo !== d.grupo;
    if (mudouEstrutura && (atual.origemExigida !== null || this.repo.categoriaTemLancamentos(id)))
      invalido(
        'Natureza, grupo e tratamento não podem mudar numa categoria que já tem lançamentos ou que pertence a outro módulo. Crie outra categoria.',
      );
    const dados = {
      ...d,
      comportamentoCusto: this.comportamentoDaCategoria(d.natureza, d.comportamentoCusto),
    };
    return this.transacao(() => {
      this.repo.salvarCategoria(id, dados, normalizarNome(d.nome), this.agora(), false);
      const nova = this.repo.obterCategoria(id)!;
      this.auditar('categoria_financeira', id, 'alteracao', { ...atual }, { ...nova }, motivo);
      return nova;
    });
  }

  // ---- Montagem de resultados derivados -----------------------------------------------------
  private montarResumos(linhas: readonly LinhaLancamento[]): LancamentoResumo[] {
    const hoje = this.hoje();
    const parcelas = this.repo.parcelasDosLancamentos(
      linhas.map((l) => l.id),
      false,
    );
    return linhas.map((l) => this.resumo(l, parcelas.get(l.id) ?? [], hoje));
  }
  private resumo(
    l: LinhaLancamento,
    parcelas: readonly LinhaParcela[],
    hoje: string,
  ): LancamentoResumo {
    const r = resumirLancamento({
      valorOperacaoCentavos: l.valorTotalCentavos,
      condicao: l.condicaoPagamento,
      cancelado: l.cancelado,
      parcelas: parcelas.filter((p) => !p.cancelada),
      hoje,
    });
    return {
      id: l.id,
      propriedadeId: l.propriedadeId,
      categoria: {
        id: l.categoriaId,
        nome: l.categoriaNome,
        tratamento: l.categoriaTratamento,
        grupo: l.categoriaGrupo,
      },
      pessoa: l.pessoaId && l.pessoaNome ? { id: l.pessoaId, nome: l.pessoaNome } : null,
      natureza: l.natureza,
      tipo: l.tipo,
      lancamentoOrigemId: l.lancamentoOrigemId,
      dataCompetencia: l.dataCompetencia,
      descricao: l.descricao,
      documentoNumero: l.documentoNumero,
      atividade: l.atividade,
      destino: {
        tipo: l.destinoTipo,
        loteId: l.loteId,
        loteNome: l.loteNome,
        animalId: l.animalId,
        animalIdentificacao: l.animalIdentificacao,
      },
      quantidade: l.quantidadeMilesimos === null ? null : l.quantidadeMilesimos / 1000,
      unidadeQuantidade: l.unidadeQuantidade,
      condicaoPagamento: l.condicaoPagamento,
      comportamentoCusto: l.comportamentoCusto,
      origemTipo: l.origemTipo,
      origemId: l.origemId,
      observacoes: l.observacoes,
      situacao: r.situacao,
      valorOperacaoCentavos: r.valorOperacaoCentavos,
      saldoEmAbertoCentavos: r.saldoEmAbertoCentavos,
      pagoCentavos: r.pagoCentavos,
      compensadoCentavos: r.compensadoCentavos,
      proximoVencimento: r.proximoVencimento,
      cancelado: l.cancelado,
      motivoCancelamento: l.motivoCancelamento,
      criadoEm: l.criadoEm,
    };
  }
  private detalhe(id: string): LancamentoDetalhe {
    const linha = this.repo.obterLancamento(id);
    if (!linha) return naoEncontrado('Lançamento não encontrado.');
    const hoje = this.hoje();
    const parcelas = this.repo.parcelasDosLancamentos([id], true).get(id) ?? [];
    const pagamentos = this.repo.pagamentosDoLancamento(id);
    const parcelasApi: ParcelaFinanceira[] = parcelas.map((p) => ({
      id: p.id,
      numero: p.numero,
      vencimento: p.vencimento,
      valorCentavos: p.valorCentavos,
      pagoCentavos: p.pagoCentavos,
      compensadoCentavos: p.compensadoCentavos,
      saldoCentavos: p.cancelada
        ? 0
        : saldoDaParcela(p.valorCentavos, p.pagoCentavos, p.compensadoCentavos),
      situacao: p.cancelada
        ? null
        : situacaoDaParcela({
            valorCentavos: p.valorCentavos,
            pagoCentavos: p.pagoCentavos,
            compensadoCentavos: p.compensadoCentavos,
            vencimento: p.vencimento,
            hoje,
          }),
      cancelada: p.cancelada,
      motivoCancelamento: p.motivoCancelamento,
    }));
    const pagamentosApi: PagamentoFinanceiro[] = pagamentos.map((g) => ({
      id: g.id,
      parcelaId: g.parcelaId,
      parcelaNumero: g.parcelaNumero,
      data: g.data,
      valorCentavos: g.valorCentavos,
      forma: g.forma,
      observacao: g.observacao,
      estornado: g.estornado,
      motivoEstorno: g.motivoEstorno,
      registradoEm: g.criadoEm,
    }));
    return {
      ...this.resumo(linha, parcelas, hoje),
      parcelas: parcelasApi,
      pagamentos: pagamentosApi,
      historico: this.repo.historicoDoLancamento(id),
    };
  }
  private retrato(l: LinhaLancamento): Record<string, unknown> {
    return {
      categoriaId: l.categoriaId,
      categoria: l.categoriaNome,
      pessoaId: l.pessoaId,
      natureza: l.natureza,
      dataCompetencia: l.dataCompetencia,
      valorTotalCentavos: l.valorTotalCentavos,
      descricao: l.descricao,
      documentoNumero: l.documentoNumero,
      atividade: l.atividade,
      destinoTipo: l.destinoTipo,
      loteId: l.loteId,
      animalId: l.animalId,
      quantidadeMilesimos: l.quantidadeMilesimos,
      unidadeQuantidade: l.unidadeQuantidade,
      condicaoPagamento: l.condicaoPagamento,
      comportamentoCusto: l.comportamentoCusto,
      observacoes: l.observacoes,
    };
  }

  // ---- Consultas ----------------------------------------------------------------------------
  obter(id: string): LancamentoDetalhe {
    return this.detalhe(id);
  }
  /** Resumos (com situação derivada) de vários lançamentos, para telas de outros módulos. */
  resumosDosLancamentos(ids: readonly string[]): Map<string, LancamentoResumo> {
    const linhas = ids
      .map((id) => this.repo.obterLancamento(id))
      .filter((l): l is LinhaLancamento => l !== null);
    return new Map(this.montarResumos(linhas).map((r) => [r.id, r]));
  }
  listar(f: FiltrosLancamentoValidados): PaginaLancamentos {
    if (!this.propriedades.obter(f.propriedadeId)) naoEncontrado('Propriedade não encontrada.');
    const base = {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      natureza: f.natureza,
      categoriaId: f.categoriaId,
      atividade: f.atividade,
      loteId: f.loteId,
      animalId: f.animalId,
      pessoaId: f.pessoaId,
      comportamentoCusto: f.comportamentoCusto,
      tratamento: f.tratamento,
      incluirCancelados: f.incluirCancelados || f.situacao === 'cancelado',
    };
    const chave = (t: string) => semAcentos(normalizarNome(t));
    const busca = chave(f.busca ?? '');
    // Situação é derivada e busca ignora acentos: nesses casos o filtro roda sobre o conjunto
    // já filtrado pelo SQL, antes de paginar.
    if (f.situacao === undefined && busca === '') {
      const total = this.repo.contarLancamentos(base);
      const linhas = this.repo.listarLancamentos(base, {
        limite: f.tamanhoPagina,
        deslocamento: (f.pagina - 1) * f.tamanhoPagina,
      });
      return {
        itens: this.montarResumos(linhas),
        total,
        pagina: f.pagina,
        tamanhoPagina: f.tamanhoPagina,
      };
    }
    let itens = this.montarResumos(this.repo.listarLancamentos(base));
    if (f.situacao !== undefined) itens = itens.filter((i) => i.situacao === f.situacao);
    if (busca !== '')
      itens = itens.filter((i) =>
        [i.descricao, i.documentoNumero, i.categoria.nome, i.pessoa?.nome, i.observacoes]
          .filter((t): t is string => Boolean(t))
          .some((t) => chave(t).includes(busca)),
      );
    return {
      itens: itens.slice((f.pagina - 1) * f.tamanhoPagina, f.pagina * f.tamanhoPagina),
      total: itens.length,
      pagina: f.pagina,
      tamanhoPagina: f.tamanhoPagina,
    };
  }

  // ---- Validação de campos de um lançamento -------------------------------------------------
  private validarCampos(
    propriedadeId: string,
    d: EdicaoLancamentoValidada,
    natureza: 'receita' | 'despesa' | null,
    anterior: LinhaLancamento | null,
    origemPermitida: OrigemLancamento | null = null,
  ): CamposValidados & { natureza: 'receita' | 'despesa' } {
    const categoria = this.repo.obterCategoria(d.categoriaId);
    if (!categoria) return naoEncontrado('Categoria não encontrada.');
    if (natureza && categoria.natureza !== natureza)
      invalido('A categoria deve ter a mesma natureza (receita ou despesa) do lançamento.');
    const mudouCategoria = anterior?.categoriaId !== d.categoriaId;
    if (mudouCategoria && !categoria.ativa) invalido('A categoria está inativa.');
    if (mudouCategoria && categoria.origemExigida && categoria.origemExigida !== origemPermitida)
      invalido(
        'Esta categoria só recebe lançamentos criados pelo módulo correspondente (compra e venda de animais pela tela de Compras e vendas de animais; estoque, sanidade e produção própria em entregas futuras).',
      );
    if (d.pessoaId) {
      const pessoa = this.repo.obterPessoa(d.pessoaId);
      if (!pessoa) naoEncontrado('Contraparte não encontrada.');
      else if (anterior?.pessoaId !== d.pessoaId && !pessoa.ativo)
        invalido('A contraparte está inativa.');
    }
    if (d.dataCompetencia > this.hoje())
      invalido('A data de competência não pode ser futura: ela marca quando o fato ocorreu.');

    let loteId: string | null = null;
    let animalId: string | null = null;
    if (d.destino.tipo === 'lote') {
      const lote = this.lotes.obter(d.destino.loteId);
      if (!lote || lote.propriedadeId !== propriedadeId)
        invalido('Lote não encontrado nesta propriedade.');
      else if (
        d.dataCompetencia < lote.dataFormacao ||
        (lote.dataEncerramento && d.dataCompetencia > lote.dataEncerramento)
      )
        invalido('O lote não existia ou já estava encerrado na data de competência.');
      loteId = d.destino.loteId;
    } else if (d.destino.tipo === 'animal') {
      const animal = this.animais.obter(d.destino.animalId);
      if (!animal || animal.propriedadeId !== propriedadeId)
        invalido('Animal não encontrado nesta propriedade.');
      else if (
        d.dataCompetencia < animal.dataEntrada ||
        (animal.dataSaida && d.dataCompetencia > animal.dataSaida) ||
        this.animais.ausenciaNaData(animal.id, d.dataCompetencia)
      )
        invalido('O animal não estava no rebanho na data de competência.');
      animalId = d.destino.animalId;
    }

    let quantidadeMilesimos: number | null = null;
    if (d.quantidade) {
      try {
        quantidadeMilesimos = quantidadeEmMilesimos(
          d.quantidade.valor,
          d.quantidade.unidade === 'cabeca' ? 'un' : undefined,
        );
      } catch (e) {
        invalido(e instanceof Error ? e.message : 'Quantidade inválida.');
      }
    }

    let comportamento: ComportamentoLancamento;
    if (categoria.natureza === 'receita') {
      if (d.comportamentoCusto && d.comportamentoCusto !== 'nao_classificado')
        invalido('Receita não tem classificação de custo (fixo ou variável).');
      comportamento = 'nao_se_aplica';
    } else {
      comportamento =
        d.comportamentoCusto ?? anterior?.comportamentoCusto ?? categoria.comportamentoCusto;
      if (comportamento === 'nao_se_aplica') comportamento = 'nao_classificado';
    }

    return {
      natureza: categoria.natureza,
      categoriaId: d.categoriaId,
      pessoaId: d.pessoaId,
      dataCompetencia: d.dataCompetencia,
      descricao: d.descricao,
      documentoNumero: d.documentoNumero,
      atividade: d.atividade,
      destinoTipo: d.destino.tipo,
      loteId,
      animalId,
      quantidadeMilesimos,
      unidadeQuantidade: d.quantidade?.unidade ?? null,
      comportamentoCusto: comportamento,
      observacoes: d.observacoes,
    };
  }

  private validarPagamentoImediato(data: string): void {
    if (data > this.hoje())
      invalido('Não é possível registrar como realizado um pagamento com data futura.');
  }

  /** Cria as parcelas da condição escolhida. Devolve as parcelas ativas criadas. */
  private criarParcelasDaCondicao(
    lancamentoId: string,
    totalCentavos: number,
    dataCompetencia: string,
    condicao: CondicaoDefinidaValidada,
  ): { id: string; numero: number }[] {
    let planejadas: ParcelaPlanejada[];
    if (condicao.tipo === 'a_vista') {
      planejadas = [
        { vencimento: condicao.vencimento ?? dataCompetencia, valorCentavos: totalCentavos },
      ];
    } else {
      const erros = validarParcelas(condicao.parcelas, totalCentavos);
      if (erros.length)
        throw new ErroAplicacao('ENTRADA_INVALIDA', 'Há problemas nas parcelas.', erros);
      planejadas = condicao.parcelas;
    }
    return planejadas.map((p, i) => {
      const id = this.gerarId();
      this.repo.inserirParcela(
        id,
        lancamentoId,
        i + 1,
        p.vencimento,
        p.valorCentavos,
        this.agora(),
      );
      return { id, numero: i + 1 };
    });
  }

  private gravarPagamento(
    parcelaId: string,
    d: { data: string; valorCentavos: number; forma: string | null; observacao: string | null },
    requisicaoId: string,
  ): string {
    const id = this.gerarId();
    this.repo.inserirPagamento(id, parcelaId, d, requisicaoId, this.agora());
    const g = this.repo.obterPagamento(id)!;
    this.auditar('pagamento_financeiro', id, 'criacao', null, {
      parcelaId,
      parcelaNumero: g.parcelaNumero,
      data: g.data,
      valorCentavos: g.valorCentavos,
      forma: g.forma,
      observacao: g.observacao,
    });
    return id;
  }

  // ---- Lançamentos --------------------------------------------------------------------------
  private mesmoConteudo(l: LinhaLancamento, d: DadosLancamentoValidados): boolean {
    const destino = d.destino;
    return (
      l.propriedadeId === d.propriedadeId &&
      l.categoriaId === d.categoriaId &&
      l.pessoaId === d.pessoaId &&
      l.dataCompetencia === d.dataCompetencia &&
      l.valorTotalCentavos === d.valorTotalCentavos &&
      l.descricao === d.descricao &&
      l.documentoNumero === d.documentoNumero &&
      l.atividade === d.atividade &&
      l.destinoTipo === destino.tipo &&
      l.loteId === (destino.tipo === 'lote' ? destino.loteId : null) &&
      l.animalId === (destino.tipo === 'animal' ? destino.animalId : null) &&
      l.observacoes === d.observacoes &&
      (d.comportamentoCusto === null || l.comportamentoCusto === d.comportamentoCusto)
    );
  }

  criar(requisicaoId: string, d: DadosLancamentoValidados): LancamentoDetalhe {
    return this.criarComOrigem(requisicaoId, d, null);
  }

  /**
   * Cria o lançamento de um fato que pertence a outro módulo (ex.: compra e venda de animais).
   * O lançamento nasce com a origem e só pode ser alterado ou cancelado por ela. Chamado dentro
   * da transação do módulo dono do fato.
   */
  criarParaOrigem(
    requisicaoId: string,
    d: DadosLancamentoValidados,
    origem: { tipo: OrigemLancamento; id: string },
    lancamentoOrigemId: string | null = null,
  ): LancamentoDetalhe {
    return this.criarComOrigem(requisicaoId, d, origem, lancamentoOrigemId);
  }

  /** Categoria que só aceita lançamentos de uma origem (ex.: "Compra de animais"). */
  categoriaDaOrigem(origem: OrigemLancamento, natureza: 'receita' | 'despesa'): string | null {
    return this.repo.categoriaDaOrigem(origem, natureza);
  }

  private criarComOrigem(
    requisicaoId: string,
    d: DadosLancamentoValidados,
    origem: { tipo: OrigemLancamento; id: string } | null,
    lancamentoOrigemId: string | null = null,
  ): LancamentoDetalhe {
    return this.transacao(() => {
      const existente = this.repo.lancamentoPorRequisicao(requisicaoId);
      if (existente) {
        if (existente.cancelado || !this.mesmoConteudo(existente, d))
          invalido(
            'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita o lançamento.',
          );
        return this.detalhe(existente.id);
      }
      if (!this.propriedades.obter(d.propriedadeId)) naoEncontrado('Propriedade não encontrada.');
      const { natureza, ...campos } = this.validarCampos(
        d.propriedadeId,
        d,
        null,
        null,
        origem?.tipo ?? null,
      );
      if (d.condicao.tipo === 'a_vista' && d.condicao.pagamento)
        this.validarPagamentoImediato(d.condicao.pagamento.data);
      const id = this.gerarId();
      this.repo.inserirLancamento(
        {
          id,
          propriedadeId: d.propriedadeId,
          natureza,
          valorTotalCentavos: d.valorTotalCentavos,
          condicaoPagamento: d.condicao.tipo,
          requisicaoId,
          origemTipo: origem?.tipo ?? 'manual',
          origemId: origem?.id ?? null,
          lancamentoOrigemId,
          ...campos,
        },
        this.agora(),
      );
      const parcelas =
        d.condicao.tipo === 'nao_informada'
          ? []
          : this.criarParcelasDaCondicao(id, d.valorTotalCentavos, d.dataCompetencia, d.condicao);
      if (d.condicao.tipo === 'a_vista' && d.condicao.pagamento && parcelas[0])
        this.gravarPagamento(
          parcelas[0].id,
          {
            data: d.condicao.pagamento.data,
            valorCentavos: d.valorTotalCentavos,
            forma: d.condicao.pagamento.forma,
            observacao: null,
          },
          this.gerarId(),
        );
      const criado = this.repo.obterLancamento(id)!;
      this.auditar('lancamento_financeiro', id, 'criacao', null, {
        ...this.retrato(criado),
        parcelas: this.repo
          .parcelasDosLancamentos([id], false)
          .get(id)
          ?.map((p) => ({
            numero: p.numero,
            vencimento: p.vencimento,
            valorCentavos: p.valorCentavos,
          })),
      });
      return this.detalhe(id);
    });
  }

  private lancamentoEditavel(id: string): LinhaLancamento {
    const l = this.repo.obterLancamento(id);
    if (!l) return naoEncontrado('Lançamento não encontrado.');
    if (l.cancelado) invalido('O lançamento está cancelado.');
    return l;
  }

  atualizar(id: string, d: EdicaoLancamentoValidada, motivo: string): LancamentoDetalhe {
    return this.transacao(() => {
      const atual = this.lancamentoEditavel(id);
      if (atual.origemTipo !== 'manual')
        invalido('Este lançamento é gerenciado pelo módulo de origem e não pode ser editado aqui.');
      const campos = this.validarCampos(atual.propriedadeId, d, atual.natureza, atual);
      const centro = this.producao.centroDoLancamento(id);
      if (centro) {
        const nova = this.repo.obterCategoria(d.categoriaId);
        if (centro.status === 'encerrado')
          invalido(
            `Esta despesa está no custo do centro de produção "${centro.nome}", que está encerrado. Reabra o centro antes de alterá-la.`,
          );
        if (
          (campos.destinoTipo !== 'propriedade' && campos.destinoTipo !== 'nenhum') ||
          nova?.tratamento !== 'resultado'
        )
          invalido(
            `Esta despesa está vinculada ao centro de produção "${centro.nome}": desvincule-a antes de dar outro destino ou categoria.`,
          );
      }
      if (this.rateios.temRateioAtivoDoLancamento(id)) {
        const nova = this.repo.obterCategoria(d.categoriaId);
        if (
          (campos.destinoTipo !== 'propriedade' && campos.destinoTipo !== 'nenhum') ||
          (nova?.tratamento !== 'resultado' && nova?.tratamento !== 'ativo_animal')
        )
          invalido(
            'Este lançamento está rateado entre lotes ou animais: cancele o rateio antes de dar a ele outro destino ou categoria.',
          );
      }
      if (this.insumos.itensDoLancamento(id).length > 0) {
        const nova = this.repo.obterCategoria(d.categoriaId);
        if (nova?.tratamento !== 'estoque')
          invalido(
            'Este lançamento tem entradas de estoque ligadas: a categoria precisa continuar sendo de compra para estoque.',
          );
      }
      this.repo.atualizarLancamento(id, campos, this.agora());
      const novo = this.repo.obterLancamento(id)!;
      const antes = this.retrato(atual);
      const depois = this.retrato(novo);
      const mudou = camposAlterados(antes, depois);
      if (mudou.length > 0)
        this.auditar('lancamento_financeiro', id, 'alteracao', antes, depois, motivo);
      return this.detalhe(id);
    });
  }

  cancelar(id: string, motivo: string): LancamentoDetalhe {
    return this.cancelarInterno(id, motivo, true);
  }

  /** Cancelamento pelo módulo dono do fato (ex.: cancelamento de uma venda de animais). */
  cancelarDeOrigem(id: string, motivo: string): LancamentoDetalhe {
    return this.cancelarInterno(id, motivo, false);
  }

  private cancelarInterno(id: string, motivo: string, exigirManual: boolean): LancamentoDetalhe {
    return this.transacao(() => {
      const atual = this.lancamentoEditavel(id);
      if (exigirManual && atual.origemTipo !== 'manual' && atual.origemTipo !== 'sanitario')
        invalido(
          'Este lançamento é gerenciado pelo módulo de origem e deve ser cancelado por ele.',
        );
      if (exigirManual && this.insumos.itensDoLancamento(id).length > 0)
        invalido(
          'Este lançamento tem entradas de estoque ligadas: cancele pela compra de insumos, que cancela as entradas junto.',
        );
      const pagamentos = this.repo.pagamentosDoLancamento(id).filter((g) => !g.estornado);
      if (pagamentos.length > 0) invalido('Estorne os pagamentos antes de cancelar o lançamento.');
      const centro = this.producao.centroDoLancamento(id);
      if (centro?.status === 'encerrado')
        invalido(
          `Esta despesa está no custo do centro de produção "${centro.nome}", que está encerrado. Reabra o centro antes de cancelá-la.`,
        );
      this.repo.cancelarLancamento(id, motivo, this.agora());
      // Despesa cancelada deixa de ser custo do centro de produção aberto.
      this.producao.desvincularLancamento(id, this.agora());
      this.auditar(
        'lancamento_financeiro',
        id,
        'cancelamento',
        this.retrato(atual),
        { cancelado: true },
        motivo,
      );
      return this.detalhe(id);
    });
  }

  definirPagamento(id: string, condicao: CondicaoDefinidaValidada): LancamentoDetalhe {
    return this.transacao(() => {
      const atual = this.lancamentoEditavel(id);
      if (atual.condicaoPagamento !== 'nao_informada')
        invalido('A condição de pagamento deste lançamento já foi definida. Use a renegociação.');
      if (condicao.tipo === 'a_vista' && condicao.pagamento)
        this.validarPagamentoImediato(condicao.pagamento.data);
      this.repo.definirTotalECondicao(id, atual.valorTotalCentavos, condicao.tipo, this.agora());
      const parcelas = this.criarParcelasDaCondicao(
        id,
        atual.valorTotalCentavos,
        atual.dataCompetencia,
        condicao,
      );
      if (condicao.tipo === 'a_vista' && condicao.pagamento && parcelas[0])
        this.gravarPagamento(
          parcelas[0].id,
          {
            data: condicao.pagamento.data,
            valorCentavos: atual.valorTotalCentavos,
            forma: condicao.pagamento.forma,
            observacao: null,
          },
          this.gerarId(),
        );
      this.auditar(
        'lancamento_financeiro',
        id,
        'definicao_condicao',
        { condicaoPagamento: 'nao_informada' },
        {
          condicaoPagamento: condicao.tipo,
          parcelas: this.repo
            .parcelasDosLancamentos([id], false)
            .get(id)
            ?.map((p) => ({
              numero: p.numero,
              vencimento: p.vencimento,
              valorCentavos: p.valorCentavos,
            })),
        },
      );
      return this.detalhe(id);
    });
  }

  /**
   * Renegocia o que ainda está em aberto: parcelas sem pagamento são substituídas; parcela
   * parcialmente paga é reduzida ao valor já pago (fica quitada) e o saldo vai para as novas.
   * O total só muda se `novoTotalCentavos` for informado. Pagamentos nunca são alterados.
   */
  renegociar(
    id: string,
    novas: readonly ParcelaPlanejadaValidada[],
    novoTotalCentavos: number | null,
    motivo: string,
  ): LancamentoDetalhe {
    return this.renegociarComo(id, novas, novoTotalCentavos, motivo, false);
  }

  /**
   * Ajuste do total de um lançamento pelo módulo dono do fato (ex.: correção de um item da compra
   * de insumos), com as parcelas novas do que ainda está em aberto. Sem condição de pagamento
   * definida, só o total muda (não há parcelas a recriar).
   */
  ajustarTotalDeOrigem(
    id: string,
    novoTotalCentavos: number,
    novas: readonly ParcelaPlanejadaValidada[],
    motivo: string,
  ): LancamentoDetalhe {
    return this.transacao(() => {
      const atual = this.lancamentoEditavel(id);
      if (atual.valorTotalCentavos === novoTotalCentavos && novas.length === 0)
        return this.detalhe(id);
      if (atual.condicaoPagamento === 'nao_informada') {
        if (novas.length > 0)
          invalido(
            'Este lançamento ainda não tem condição de pagamento: não há parcelas a recriar.',
          );
        this.repo.definirTotalECondicao(id, novoTotalCentavos, 'nao_informada', this.agora());
        this.auditar(
          'lancamento_financeiro',
          id,
          'alteracao',
          { valorTotalCentavos: atual.valorTotalCentavos },
          { valorTotalCentavos: novoTotalCentavos },
          motivo,
        );
        return this.detalhe(id);
      }
      return this.renegociarComo(id, novas, novoTotalCentavos, motivo, true);
    });
  }

  private renegociarComo(
    id: string,
    novas: readonly ParcelaPlanejadaValidada[],
    novoTotalCentavos: number | null,
    motivo: string,
    pelaOrigem: boolean,
  ): LancamentoDetalhe {
    return this.transacao(() => {
      const atual = this.lancamentoEditavel(id);
      // Negociação de animais e compra de insumos: as parcelas podem ser renegociadas, mas o total
      // é o do fato de origem (só ele o muda).
      const origemRenegociavel =
        (atual.origemTipo === 'negociacao_animal' || atual.origemTipo === 'compra_estoque') &&
        novoTotalCentavos === null;
      if (atual.origemTipo !== 'manual' && !origemRenegociavel && !pelaOrigem)
        invalido(
          'Este lançamento é gerenciado pelo módulo de origem: só as parcelas podem ser renegociadas, sem mudar o total.',
        );
      if (atual.condicaoPagamento === 'nao_informada')
        invalido('Defina a condição de pagamento antes de renegociar.');
      const ativas = (this.repo.parcelasDosLancamentos([id], false).get(id) ?? []).filter(
        (p) => !p.cancelada,
      );
      // Compensação de devolução liquida como pagamento para a renegociação (não é caixa).
      const liquidado = (p: { pagoCentavos: number; compensadoCentavos: number }) =>
        p.pagoCentavos + p.compensadoCentavos;
      const pagoTotal = somarCentavos(ativas.map(liquidado));
      const alvoTotal = novoTotalCentavos ?? atual.valorTotalCentavos;
      if (alvoTotal < pagoTotal)
        invalido('O novo total não pode ser menor do que o valor já pago ou recebido.');
      const aParcelar = alvoTotal - pagoTotal;
      const erros = validarParcelas(novas, aParcelar);
      if (erros.length)
        throw new ErroAplicacao('ENTRADA_INVALIDA', 'Há problemas nas parcelas.', erros);
      if (aParcelar === 0 && novas.length > 0)
        invalido('Não há saldo a parcelar: o total já está pago ou recebido.');

      const antes = {
        valorTotalCentavos: atual.valorTotalCentavos,
        condicaoPagamento: atual.condicaoPagamento,
        parcelas: ativas.map((p) => ({
          numero: p.numero,
          vencimento: p.vencimento,
          valorCentavos: p.valorCentavos,
          pagoCentavos: p.pagoCentavos,
        })),
      };
      const agora = this.agora();
      let mantidas = 0;
      for (const p of ativas) {
        if (liquidado(p) === 0) {
          this.repo.cancelarParcela(p.id, `Renegociação: ${motivo}`, agora);
        } else {
          if (liquidado(p) < p.valorCentavos) this.repo.reduzirParcela(p.id, liquidado(p), agora);
          mantidas += 1;
        }
      }
      let numero = this.repo.maiorNumeroDeParcela(id);
      for (const p of novas) {
        numero += 1;
        this.repo.inserirParcela(this.gerarId(), id, numero, p.vencimento, p.valorCentavos, agora);
      }
      const condicao = mantidas + novas.length >= 2 ? 'parcelado' : atual.condicaoPagamento;
      this.repo.definirTotalECondicao(id, alvoTotal, condicao, agora);
      const depoisParcelas = this.repo.parcelasDosLancamentos([id], false).get(id) ?? [];
      this.auditar(
        'lancamento_financeiro',
        id,
        'renegociacao',
        antes,
        {
          valorTotalCentavos: alvoTotal,
          condicaoPagamento: condicao,
          parcelas: depoisParcelas.map((p) => ({
            numero: p.numero,
            vencimento: p.vencimento,
            valorCentavos: p.valorCentavos,
            pagoCentavos: p.pagoCentavos,
          })),
        },
        motivo,
      );
      return this.detalhe(id);
    });
  }

  // ---- Pagamentos ---------------------------------------------------------------------------
  private mesmoPagamento(
    g: LinhaPagamento,
    parcelaId: string,
    d: DadosPagamentoValidados,
  ): boolean {
    return (
      !g.estornado &&
      g.parcelaId === parcelaId &&
      g.data === d.data &&
      g.valorCentavos === d.valorCentavos &&
      g.forma === d.forma &&
      g.observacao === d.observacao
    );
  }
  registrarPagamento(
    parcelaId: string,
    requisicaoId: string,
    d: DadosPagamentoValidados,
  ): LancamentoDetalhe {
    return this.transacao(() => {
      const repetido = this.repo.pagamentoPorRequisicao(requisicaoId);
      if (repetido) {
        if (!this.mesmoPagamento(repetido, parcelaId, d))
          invalido(
            'O identificador da operação já foi usado com outro conteúdo ou foi estornado. Não repita o pagamento.',
          );
        return this.detalhe(repetido.lancamentoId);
      }
      const parcela = this.repo.obterParcela(parcelaId);
      if (!parcela || parcela.cancelada) return naoEncontrado('Parcela não encontrada.');
      const lancamento = this.lancamentoEditavel(parcela.lancamentoId);
      if (d.data > this.hoje())
        invalido(
          'Não é possível registrar como realizado um pagamento com data futura. Para o futuro, use o vencimento da parcela.',
        );
      const saldo = saldoDaParcela(
        parcela.valorCentavos,
        parcela.pagoCentavos,
        parcela.compensadoCentavos,
      );
      if (d.valorCentavos > saldo)
        invalido(`O valor excede o saldo da parcela (${formatarCentavos(saldo)}).`);
      this.gravarPagamento(parcelaId, d, requisicaoId);
      return this.detalhe(lancamento.id);
    });
  }
  estornarPagamento(id: string, motivo: string): LancamentoDetalhe {
    return this.transacao(() => {
      const g = this.repo.obterPagamento(id);
      if (!g) return naoEncontrado('Pagamento não encontrado.');
      if (g.estornado) invalido('O pagamento já foi estornado.');
      this.lancamentoEditavel(g.lancamentoId);
      this.repo.estornarPagamento(id, motivo, this.agora());
      this.auditar(
        'pagamento_financeiro',
        id,
        'estorno',
        {
          parcelaNumero: g.parcelaNumero,
          data: g.data,
          valorCentavos: g.valorCentavos,
          forma: g.forma,
        },
        { estornado: true },
        motivo,
      );
      return this.detalhe(g.lancamentoId);
    });
  }
}
