import {
  gerarUuidV7,
  quantidadeEmMilesimos,
  ratearFretePorValor,
  somarCentavos,
  type OrigemLancamento,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type CompraDaEntradaValidada,
  type CompraInsumosDetalhe,
  type CompraInsumosResumo,
  type CorrecaoItemValidada,
  type DadosCompraInsumosValidados,
  type EntradaSemDocumentoApi,
  type ItemDaCompra,
  type PaginaCompras,
  type PendenciasEstoqueFinanceiro,
} from '@pecuaria/shared-types';
import {
  RepositorioHistorico,
  RepositorioInsumos,
  type GerenciadorBanco,
  type LinhaItemCompra,
} from '@pecuaria/database';
import type { ServicoEstoque } from '../estoque/servico-estoque';
import type { ServicoFinanceiro } from './servico-financeiro';

function invalido(mensagem: string, detalhes?: string[]): never {
  throw new ErroAplicacao('OPERACAO_INVALIDA', mensagem, detalhes);
}
function naoEncontrado(mensagem: string): never {
  throw new ErroAplicacao('NAO_ENCONTRADO', mensagem);
}

/** Texto curto com os nomes dos itens, sem estourar o limite da descrição do lançamento. */
function descricaoDaNota(nomes: readonly string[]): string {
  const unicos = [...new Set(nomes)];
  const base = `Compra de insumos: ${unicos.join(', ')}`;
  return base.length <= 200 ? base : `${base.slice(0, 197)}...`;
}

/**
 * Compra de insumos ligada ao estoque (entrega 4D).
 *
 * Um fato, um dono: a nota é um lançamento financeiro (dono do dinheiro) com itens; cada item
 * está ligado a UMA entrada de compra no estoque (dono da quantidade e do custo médio). A entrada
 * nasce do item e leva o valor dele como custo de entrada; nenhuma despesa de resultado é criada
 * pela entrada nem pelo consumo (a compra só vira custo quando consumida). Correções e
 * cancelamentos passam pela nota, que repassa ao estoque pela correção auditada já existente.
 */
export class ServicoCompraInsumos {
  private readonly insumos: RepositorioInsumos;
  private readonly historico: RepositorioHistorico;
  private readonly relogio: () => Date;
  private readonly gerarId: () => string;

  constructor(
    private readonly banco: GerenciadorBanco,
    private readonly estoque: ServicoEstoque,
    private readonly financeiro: ServicoFinanceiro,
    opcoes: { relogio?: () => Date; gerarId?: () => string } = {},
  ) {
    const db = () => banco.conexao;
    this.insumos = new RepositorioInsumos(db);
    this.historico = new RepositorioHistorico(db);
    this.relogio = opcoes.relogio ?? (() => new Date());
    this.gerarId = opcoes.gerarId ?? gerarUuidV7;
  }

  private agora() {
    return this.relogio().toISOString();
  }
  private transacao<T>(fn: () => T): T {
    return this.banco.transacao(fn);
  }
  private auditar(
    lancamentoId: string,
    acao: 'alteracao' | 'cancelamento',
    antes: Record<string, unknown> | null,
    depois: Record<string, unknown> | null,
    motivo: string | null,
  ) {
    this.historico.registrar({
      id: this.gerarId(),
      entidade: 'lancamento_financeiro',
      entidadeId: lancamentoId,
      acao,
      dadosAnteriores: antes,
      dadosNovos: depois,
      motivo,
      ocorridoEm: this.agora(),
    });
  }

  // ---- Consultas ----------------------------------------------------------------------------
  private itemApi(i: LinhaItemCompra): ItemDaCompra {
    return {
      id: i.id,
      estoqueItemId: i.estoqueItemId,
      estoqueItemNome: i.estoqueItemNome,
      quantidade: i.quantidadeMilesimos / 1000,
      unidadeBase: i.unidadeBase as ItemDaCompra['unidadeBase'],
      valorCentavos: i.valorCentavos,
      movimentacaoId: i.movimentacaoId,
      cancelado: i.cancelado,
    };
  }

  listar(
    propriedadeId: string,
    incluirCanceladas: boolean,
    pagina: number,
    tamanhoPagina: number,
  ): PaginaCompras {
    const r = this.insumos.listarCompras(propriedadeId, incluirCanceladas, {
      limite: tamanhoPagina,
      deslocamento: (pagina - 1) * tamanhoPagina,
    });
    return {
      total: r.total,
      pagina,
      tamanhoPagina,
      itens: r.itens.map((c): CompraInsumosResumo => ({
        lancamentoId: c.lancamentoId,
        data: c.data,
        descricao: c.descricao,
        documentoNumero: c.documentoNumero,
        pessoaNome: c.pessoaNome,
        valorTotalCentavos: c.valorTotalCentavos,
        quantidadeItens: c.quantidadeItens,
        somaItensCentavos: c.somaItensCentavos,
        diferencaCentavos: c.valorTotalCentavos - c.somaItensCentavos,
        origem: c.origemTipo === 'compra_estoque' ? 'compra_estoque' : 'manual',
        cancelada: c.cancelado,
      })),
    };
  }

  obter(lancamentoId: string): CompraInsumosDetalhe {
    const l = this.financeiro.repo.obterLancamento(lancamentoId);
    if (!l) return naoEncontrado('Compra de insumos não encontrada.');
    const todos = this.insumos.itensDoLancamento(lancamentoId, true);
    if (todos.length === 0)
      return naoEncontrado('Este lançamento não tem entradas de estoque ligadas.');
    const ativos = todos.filter((i) => !i.cancelado);
    const resumo = this.financeiro.resumosDosLancamentos([lancamentoId]).get(lancamentoId)!;
    const soma = somarCentavos(ativos.map((i) => i.valorCentavos));
    return {
      lancamentoId,
      data: l.dataCompetencia,
      descricao: l.descricao,
      documentoNumero: l.documentoNumero,
      pessoaNome: l.pessoaNome,
      valorTotalCentavos: l.valorTotalCentavos,
      quantidadeItens: ativos.length,
      somaItensCentavos: soma,
      diferencaCentavos: l.valorTotalCentavos - soma,
      origem: l.origemTipo === 'compra_estoque' ? 'compra_estoque' : 'manual',
      cancelada: l.cancelado,
      itens: (l.cancelado ? todos : ativos).map((i) => this.itemApi(i)),
      situacaoFinanceira: resumo.situacao,
      saldoEmAbertoCentavos: resumo.saldoEmAbertoCentavos,
      pagoCentavos: resumo.pagoCentavos,
      condicaoPagamento: l.condicaoPagamento,
    };
  }

  // ---- Registro da nota ---------------------------------------------------------------------
  registrar(d: DadosCompraInsumosValidados): CompraInsumosDetalhe {
    return this.transacao(() => {
      const existente = this.financeiro.repo.lancamentoPorRequisicao(d.requisicaoId);
      if (existente) {
        const itens = this.insumos.itensDoLancamento(existente.id);
        const base = d.itens.reduce((s, i) => s + i.valorCentavos, 0) + d.freteCentavos;
        if (
          existente.cancelado ||
          existente.origemTipo !== 'compra_estoque' ||
          existente.valorTotalCentavos !== base ||
          itens.length !== d.itens.length
        )
          invalido(
            'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita a compra.',
          );
        return this.obter(existente.id);
      }
      const categoria = this.financeiro.repo.obterCategoria(d.categoriaId);
      if (!categoria) return naoEncontrado('Categoria não encontrada.');
      if (categoria.natureza !== 'despesa' || categoria.tratamento !== 'estoque')
        invalido(
          'Use uma categoria de compra para estoque (despesa que só vira custo quando o insumo é consumido).',
        );

      // Validação dos itens antes de gravar qualquer coisa.
      const erros: string[] = [];
      const itensEstoque = d.itens.map((i) => {
        const item = this.estoque.itemBasico(i.estoqueItemId);
        if (item.propriedadeId !== d.propriedadeId)
          erros.push(`${item.nome}: o item é de outra propriedade.`);
        if (item.controleLote && !i.loteFisico)
          erros.push(`${item.nome}: informe o lote físico (o item controla lote).`);
        if (!item.controleLote && i.loteFisico)
          erros.push(`${item.nome}: o item não controla lote físico.`);
        return item;
      });
      if (erros.length)
        throw new ErroAplicacao('ENTRADA_INVALIDA', 'Há problemas nos itens.', erros);

      const ids = d.itens.map(() => this.gerarId());
      const rateio = ratearFretePorValor(
        d.itens.map((i, k) => ({ id: ids[k]!, valorCentavos: i.valorCentavos })),
        d.freteCentavos,
      );
      if (rateio.erros.length)
        throw new ErroAplicacao('ENTRADA_INVALIDA', rateio.erros[0]!, rateio.erros);
      const valores = d.itens.map((_, k) => rateio.valores.get(ids[k]!)!);
      const total = somarCentavos(valores);
      if (total <= 0) invalido('O valor total da compra deve ser maior que zero.');

      const notaId = this.gerarId();
      const lancamento = this.financeiro.criarParaOrigem(
        d.requisicaoId,
        {
          propriedadeId: d.propriedadeId,
          categoriaId: d.categoriaId,
          pessoaId: d.pessoaId,
          dataCompetencia: d.data,
          valorTotalCentavos: total,
          descricao: descricaoDaNota(itensEstoque.map((i) => i.nome)),
          documentoNumero: d.documentoNumero,
          atividade: d.atividade,
          destino: { tipo: 'propriedade' },
          quantidade: null,
          comportamentoCusto: null,
          observacoes: d.observacoes,
          condicao: d.condicao,
        },
        { tipo: 'compra_estoque' as OrigemLancamento, id: notaId },
      );

      const criados: Record<string, unknown>[] = [];
      for (const [k, i] of d.itens.entries()) {
        let loteEstoqueId: string | null = null;
        if (i.loteFisico?.tipo === 'existente') loteEstoqueId = i.loteFisico.id;
        else if (i.loteFisico?.tipo === 'novo')
          loteEstoqueId = this.estoque.criarLote(i.estoqueItemId, {
            codigo: i.loteFisico.codigo,
            validade: i.loteFisico.validade,
          }).id;
        const itemId = ids[k]!;
        const movimento = this.estoque.registrar(i.estoqueItemId, gerarUuidV7(), {
          data: d.data,
          tipo: 'entrada_compra',
          quantidade: i.quantidade,
          unidadeBase: i.unidadeBase,
          loteEstoqueId,
          custoEntradaCentavos: valores[k]!,
          destino: null,
          loteAnimalId: null,
          animalId: null,
          documentoOrigemId: itemId,
          motivo: null,
          observacao: null,
        });
        this.insumos.inserirItem(
          {
            id: itemId,
            lancamentoId: lancamento.id,
            estoqueItemId: i.estoqueItemId,
            quantidadeMilesimos: quantidadeEmMilesimos(i.quantidade, i.unidadeBase),
            unidadeBase: i.unidadeBase,
            valorCentavos: valores[k]!,
            movimentacaoId: movimento.id,
          },
          this.agora(),
        );
        criados.push({
          item: itensEstoque[k]!.nome,
          quantidade: i.quantidade,
          unidadeBase: i.unidadeBase,
          valorCentavos: valores[k],
        });
      }
      this.auditar(
        lancamento.id,
        'alteracao',
        null,
        { entradasDeEstoque: criados, freteRateadoCentavos: d.freteCentavos },
        'Entradas de estoque criadas pela compra de insumos.',
      );
      return this.obter(lancamento.id);
    });
  }

  // ---- Correção de um item ------------------------------------------------------------------
  /**
   * Corrige quantidade e valor de um item da nota. A correção passa ao estoque pela correção
   * auditada (que recalcula o custo médio e os custos apropriados dos consumos); se o estoque
   * recusar (saldo negativo), nada muda. Se o total da nota muda e há parcelas, o usuário informa
   * as parcelas novas do que ainda está em aberto.
   */
  corrigirItem(d: CorrecaoItemValidada): CompraInsumosDetalhe {
    return this.transacao(() => {
      const item = this.insumos.obterItem(d.itemId);
      if (!item) return naoEncontrado('Item de compra não encontrado.');
      if (item.cancelado) invalido('O item já foi cancelado.');
      const lancamento = this.financeiro.repo.obterLancamento(item.lancamentoId);
      if (!lancamento || lancamento.cancelado) invalido('A compra está cancelada.');
      const movimento = this.estoque.repo.obterMovimento(item.movimentacaoId);
      if (!movimento || movimento.canceladoEm)
        invalido('A entrada de estoque do item não está ativa.');

      const novoTotal = lancamento.valorTotalCentavos + (d.valorCentavos - item.valorCentavos);
      const pago = somarCentavos(
        this.financeiro.repo
          .pagamentosDoLancamento(lancamento.id)
          .filter((g) => !g.estornado)
          .map((g) => g.valorCentavos),
      );
      if (novoTotal <= 0) invalido('O total da compra não pode ficar zerado.');
      if (novoTotal < pago) invalido('O novo total não pode ser menor do que o valor já pago.');
      const totalMudou = novoTotal !== lancamento.valorTotalCentavos;
      if (!totalMudou && d.novasParcelas.length > 0)
        invalido('O total não mudou: não há parcelas novas a informar.');
      if (
        totalMudou &&
        lancamento.condicaoPagamento !== 'nao_informada' &&
        d.novasParcelas.length === 0 &&
        novoTotal > pago
      )
        invalido(
          'O total da compra muda com esta correção: informe as parcelas novas do que ainda está em aberto.',
        );

      const nova = this.estoque.corrigir(
        movimento.id,
        d.requisicaoId,
        {
          data: movimento.data,
          tipo: 'entrada_compra',
          quantidade: d.quantidade,
          unidadeBase: movimento.unidadeBase,
          loteEstoqueId: movimento.loteEstoqueId,
          custoEntradaCentavos: d.valorCentavos,
          destino: null,
          loteAnimalId: null,
          animalId: null,
          documentoOrigemId: movimento.documentoOrigemId,
          motivo: d.motivo,
          observacao: movimento.observacao,
        },
        d.motivo,
        true,
      );
      this.insumos.corrigirItem(
        item.id,
        nova.id,
        quantidadeEmMilesimos(d.quantidade, movimento.unidadeBase),
        d.valorCentavos,
        this.agora(),
      );
      if (totalMudou)
        this.financeiro.ajustarTotalDeOrigem(lancamento.id, novoTotal, d.novasParcelas, d.motivo);
      this.auditar(
        lancamento.id,
        'alteracao',
        {
          item: item.estoqueItemNome,
          quantidade: item.quantidadeMilesimos / 1000,
          valorCentavos: item.valorCentavos,
        },
        {
          item: item.estoqueItemNome,
          quantidade: d.quantidade,
          valorCentavos: d.valorCentavos,
          totalCentavos: novoTotal,
        },
        d.motivo,
      );
      return this.obter(lancamento.id);
    });
  }

  // ---- Cancelamento -------------------------------------------------------------------------
  /**
   * Cancela a compra: cancela as entradas de estoque ligadas (o estoque recalcula o custo médio e
   * recusa se o saldo ficaria negativo) e o lançamento. Exige os pagamentos estornados antes.
   */
  cancelar(lancamentoId: string, motivo: string): CompraInsumosDetalhe {
    return this.transacao(() => {
      const l = this.financeiro.repo.obterLancamento(lancamentoId);
      if (!l) return naoEncontrado('Compra não encontrada.');
      if (l.cancelado) invalido('A compra já está cancelada.');
      const itens = this.insumos.itensDoLancamento(lancamentoId);
      if (itens.length === 0) invalido('Este lançamento não tem entradas de estoque ligadas.');
      const ativos = this.financeiro.repo
        .pagamentosDoLancamento(lancamentoId)
        .filter((g) => !g.estornado);
      if (ativos.length > 0)
        invalido(
          'Há pagamentos registrados nesta compra. Estorne-os no lançamento antes de cancelá-la.',
        );
      for (const i of itens) {
        this.estoque.cancelar(i.movimentacaoId, motivo, true);
        this.insumos.cancelarItem(i.id, this.agora());
      }
      this.financeiro.cancelarDeOrigem(
        lancamentoId,
        `Cancelamento da compra de insumos: ${motivo}`,
      );
      this.auditar(
        lancamentoId,
        'cancelamento',
        { entradasCanceladas: itens.map((i) => i.estoqueItemNome) },
        { cancelada: true },
        motivo,
      );
      return this.obter(lancamentoId);
    });
  }

  // ---- Vínculo retroativo -------------------------------------------------------------------
  private entradaLigavel(movimentacaoId: string) {
    const m = this.estoque.repo.obterMovimento(movimentacaoId);
    if (!m) return naoEncontrado('Entrada de estoque não encontrada.');
    if (m.tipo !== 'entrada_compra' || m.canceladoEm)
      invalido('Só uma entrada de compra ativa pode ser ligada a um lançamento.');
    if (this.insumos.itemAtivoDaEntrada(m.id))
      invalido('Esta entrada já está ligada a uma compra.');
    if (m.custoEntradaCentavos === null)
      invalido(
        'O custo de entrada desta compra é desconhecido: informe o custo pela correção do estoque antes de ligar a um valor.',
      );
    return { m, item: this.estoque.itemBasico(m.itemId) };
  }

  /** Liga uma entrada antiga a um lançamento de compra que já existe (1:1). Nada é alterado no valor. */
  vincularEntrada(movimentacaoId: string, lancamentoId: string): CompraInsumosDetalhe {
    return this.transacao(() => {
      const { m, item } = this.entradaLigavel(movimentacaoId);
      const l = this.financeiro.repo.obterLancamento(lancamentoId);
      if (!l || l.cancelado) return naoEncontrado('Lançamento não encontrado ou cancelado.');
      if (l.propriedadeId !== item.propriedadeId) invalido('O lançamento é de outra propriedade.');
      if (l.natureza !== 'despesa' || l.categoriaTratamento !== 'estoque')
        invalido('O lançamento precisa ser uma despesa de compra para estoque.');
      this.insumos.inserirItem(
        {
          id: this.gerarId(),
          lancamentoId,
          estoqueItemId: m.itemId,
          quantidadeMilesimos: quantidadeEmMilesimos(m.quantidade, m.unidadeBase),
          unidadeBase: m.unidadeBase,
          valorCentavos: m.custoEntradaCentavos!,
          movimentacaoId: m.id,
        },
        this.agora(),
      );
      this.auditar(
        lancamentoId,
        'alteracao',
        null,
        { entradaLigada: item.nome, valorCentavos: m.custoEntradaCentavos, data: m.data },
        'Vínculo retroativo de entrada de estoque.',
      );
      return this.obter(lancamentoId);
    });
  }

  /** Cria o lançamento da compra a partir de uma entrada antiga com custo conhecido. */
  criarDaEntrada(d: CompraDaEntradaValidada): CompraInsumosDetalhe {
    return this.transacao(() => {
      const { m, item } = this.entradaLigavel(d.movimentacaoId);
      const categoria = this.financeiro.repo.obterCategoria(d.categoriaId);
      if (!categoria) return naoEncontrado('Categoria não encontrada.');
      if (categoria.natureza !== 'despesa' || categoria.tratamento !== 'estoque')
        invalido('Use uma categoria de compra para estoque.');
      const valor = m.custoEntradaCentavos!;
      if (valor <= 0) invalido('Entrada sem custo (zero) não gera lançamento financeiro.');
      const notaId = this.gerarId();
      const l = this.financeiro.criarParaOrigem(
        d.requisicaoId,
        {
          propriedadeId: item.propriedadeId,
          categoriaId: d.categoriaId,
          pessoaId: d.pessoaId,
          dataCompetencia: m.data,
          valorTotalCentavos: valor,
          descricao: descricaoDaNota([item.nome]),
          documentoNumero: d.documentoNumero,
          atividade: d.atividade,
          destino: { tipo: 'propriedade' },
          quantidade: null,
          comportamentoCusto: null,
          observacoes: null,
          condicao: d.condicao,
        },
        { tipo: 'compra_estoque' as OrigemLancamento, id: notaId },
      );
      this.insumos.inserirItem(
        {
          id: this.gerarId(),
          lancamentoId: l.id,
          estoqueItemId: m.itemId,
          quantidadeMilesimos: quantidadeEmMilesimos(m.quantidade, m.unidadeBase),
          unidadeBase: m.unidadeBase,
          valorCentavos: valor,
          movimentacaoId: m.id,
        },
        this.agora(),
      );
      this.auditar(
        l.id,
        'alteracao',
        null,
        { entradaLigada: item.nome, valorCentavos: valor, data: m.data },
        'Lançamento criado a partir de entrada de estoque existente.',
      );
      return this.obter(l.id);
    });
  }

  // ---- Auditor de consistência --------------------------------------------------------------
  pendencias(propriedadeId: string): PendenciasEstoqueFinanceiro {
    const entradas = this.insumos.entradasSemDocumento(propriedadeId, 100);
    const totalEntradas = this.insumos.contarEntradasSemDocumento(propriedadeId);
    const itens: EntradaSemDocumentoApi[] = entradas.map((e) => ({
      movimentacaoId: e.movimentacaoId,
      data: e.data,
      estoqueItemId: e.estoqueItemId,
      estoqueItemNome: e.estoqueItemNome,
      quantidade: e.quantidadeMilesimos / 1000,
      unidadeBase: e.unidadeBase as EntradaSemDocumentoApi['unidadeBase'],
      custoEntradaCentavos: e.custoEntradaCentavos,
      documentoOrfao: e.documentoOrigemId !== null,
    }));
    const comprasSemEntrada = this.insumos.lancamentosDeEstoqueSemItens(propriedadeId, 100);
    const diferencas = this.insumos.lancamentosComDiferenca(propriedadeId, 100);
    const semCusto = this.insumos
      .totaisDeConsumo({ propriedadeId }, 'destino')
      .reduce((s, t) => s + t.desconhecidos, 0);
    return {
      propriedadeId,
      entradasSemDocumento: { total: totalEntradas, itens },
      comprasSemEntrada: comprasSemEntrada.map((c) => ({
        id: c.id,
        data: c.data,
        descricao: c.descricao,
        valorCentavos: c.valorCentavos,
      })),
      diferencas: diferencas.map((c) => ({
        id: c.id,
        data: c.data,
        descricao: c.descricao,
        totalCentavos: c.totalCentavos,
        somaItensCentavos: c.somaItensCentavos,
      })),
      consumosSemCusto: semCusto,
      total: totalEntradas + comprasSemEntrada.length + diferencas.length + semCusto,
    };
  }
}
