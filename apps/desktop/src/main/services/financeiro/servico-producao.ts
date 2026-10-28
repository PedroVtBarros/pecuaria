import {
  apurarCustoDoCentro,
  normalizarNome,
  quantidadeEmMilesimos,
  type CustoDoCentro,
} from '@pecuaria/domain';
import type {
  CandidatosDoCentro,
  CentroProducaoDetalhe,
  CentroProducaoResumo,
  DadosCentroValidados,
  EdicaoCentroValidada,
  EncerramentoValidado,
} from '@pecuaria/shared-types';
import type { ConsumoDoCentro, LinhaCentro } from '@pecuaria/database';
import {
  duplicado,
  invalido,
  naoEncontrado,
  operacaoInvalida,
  type ContextoRebanho,
} from '../rebanho/contexto';
import type { ServicoEstoque } from '../estoque/servico-estoque';

const TIPOS_CONSUMO_VINCULAVEL = ['saida_consumo', 'saida_perda', 'ajuste_saida'];
const OBSERVACAO =
  'Os custos vinculados ficam no centro e não aparecem como custo de lote nem de animal. Ao encerrar, o custo total vira o custo de entrada da produção no estoque; ele chega aos animais depois, quando o item produzido é consumido, pelo custo médio do estoque. Custo desconhecido de algum componente deixa a entrada com custo desconhecido, nunca zero.';

/**
 * Produção própria de volumosos e outros itens (entrega 4F). Um centro reúne despesas e insumos do
 * estoque; ao encerrar, gera a entrada de produção no estoque com o custo total apurado. Cada custo
 * tem um só dono: enquanto está no centro, não é custo de lote nem de animal.
 */
export class ServicoProducao {
  constructor(
    private readonly ctx: ContextoRebanho,
    private readonly estoque: ServicoEstoque,
  ) {}

  private exigirPropriedade(id: string) {
    if (!this.ctx.propriedades.obter(id)) throw naoEncontrado('Propriedade não encontrada.');
  }
  private centro(id: string): LinhaCentro {
    const c = this.ctx.producao.obterCentro(id);
    if (!c) throw naoEncontrado('Centro de produção não encontrado.');
    return c;
  }
  private centroAberto(id: string): LinhaCentro {
    const c = this.centro(id);
    if (c.cancelado) throw operacaoInvalida('O centro de produção está cancelado.');
    if (c.status !== 'aberto')
      throw operacaoInvalida(
        'O centro de produção está encerrado: reabra-o para alterar os custos.',
      );
    return c;
  }

  // ---- Leitura ------------------------------------------------------------------------------
  private custoDe(centroId: string): {
    custo: CustoDoCentro;
    despesas: ReturnType<ContextoRebanho['producao']['lancamentosDoCentro']>;
    consumos: ConsumoDoCentro[];
  } {
    const despesas = this.ctx.producao.lancamentosDoCentro(centroId);
    const consumos = this.ctx.producao.consumosDoCentro(centroId);
    return {
      despesas,
      consumos,
      custo: apurarCustoDoCentro({
        despesasCentavos: despesas.filter((d) => !d.cancelado).map((d) => d.valorCentavos),
        consumosCentavos: consumos.map((c) => c.custoCentavos),
      }),
    };
  }
  private resumo(c: LinhaCentro): CentroProducaoResumo {
    const { custo } = this.custoDe(c.id);
    return {
      id: c.id,
      propriedadeId: c.propriedadeId,
      nome: c.nome,
      tipo: c.tipo,
      area: c.areaId && c.areaNome ? { id: c.areaId, nome: c.areaNome } : null,
      dataInicio: c.dataInicio,
      dataFim: c.dataFim,
      item: { id: c.estoqueItemId, nome: c.estoqueItemNome, unidadeBase: c.unidadeBase },
      status: c.status,
      cancelado: c.cancelado,
      apuracao: custo.apuracao,
      componentes: custo.componentes,
    };
  }
  listar(f: { propriedadeId: string; incluirCancelados: boolean }): CentroProducaoResumo[] {
    this.exigirPropriedade(f.propriedadeId);
    return this.ctx.producao
      .listarCentros(f.propriedadeId, f.incluirCancelados)
      .map((c) => this.resumo(c));
  }
  obter(id: string): CentroProducaoDetalhe {
    const c = this.centro(id);
    const { custo, despesas, consumos } = this.custoDe(id);
    return {
      ...this.resumo(c),
      observacoes: c.observacoes,
      motivoCancelamento: c.motivoCancelamento,
      criadoEm: c.criadoEm,
      despesas: despesas.map((d) => ({
        id: d.id,
        data: d.data,
        descricao: d.descricao,
        valorCentavos: d.valorCentavos,
        cancelada: d.cancelado,
      })),
      consumos: consumos.map((m) => ({
        movimentacaoId: m.movimentacaoId,
        data: m.data,
        itemNome: m.itemNome,
        quantidade: m.quantidadeMilesimos / 1000,
        unidadeBase: m.unidadeBase,
        custoCentavos: m.custoCentavos,
      })),
      custo: {
        apuracao: custo.apuracao,
        conhecidoCentavos: custo.conhecidoCentavos,
        desconhecidos: custo.desconhecidos,
        completo: custo.completo,
        podeEncerrar: custo.podeEncerrar,
        custoDaEntradaCentavos: custo.custoDaEntradaCentavos,
      },
      encerramento:
        c.status === 'encerrado' && c.movimentacaoEstoqueId
          ? {
              movimentacaoId: c.movimentacaoEstoqueId,
              quantidade: (c.quantidadeProduzidaMilesimos as number) / 1000,
              custoConhecidoCentavos: c.custoConhecidoCentavos as number,
              componentesDesconhecidos: c.componentesDesconhecidos as number,
              custoTotalCentavos: c.custoTotalCentavos,
            }
          : null,
      observacao: OBSERVACAO,
    };
  }

  // ---- Cadastro -----------------------------------------------------------------------------
  private validarDados(propriedadeId: string, d: DadosCentroValidados, excetoId: string | null) {
    if (d.dataInicio > this.ctx.hoje()) throw invalido(['A data de início não pode ser futura.']);
    if (d.areaId) {
      const area = this.ctx.propriedades.obterArea(d.areaId);
      if (!area || area.propriedadeId !== propriedadeId)
        throw naoEncontrado('Área não encontrada nesta propriedade.');
    }
    if (this.ctx.producao.nomeEmUso(propriedadeId, normalizarNome(d.nome), excetoId))
      throw duplicado('Já existe um centro de produção ativo com este nome.');
  }

  criar(
    requisicaoId: string,
    propriedadeId: string,
    d: DadosCentroValidados,
  ): CentroProducaoDetalhe {
    return this.ctx.transacao(() => {
      const existente = this.ctx.producao.centroPorRequisicao(requisicaoId);
      if (existente) {
        if (
          existente.cancelado ||
          existente.propriedadeId !== propriedadeId ||
          existente.nome !== d.nome ||
          existente.estoqueItemId !== d.estoqueItemId ||
          existente.dataInicio !== d.dataInicio
        )
          throw invalido([
            'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita o cadastro.',
          ]);
        return this.obter(existente.id);
      }
      this.exigirPropriedade(propriedadeId);
      const item = this.estoque.itemBasico(d.estoqueItemId);
      if (item.propriedadeId !== propriedadeId)
        throw naoEncontrado('Item de estoque não encontrado nesta propriedade.');
      if (!item.ativo) throw invalido(['O item produzido está inativo.']);
      this.validarDados(propriedadeId, d, null);
      const id = this.ctx.gerarId();
      this.ctx.producao.inserirCentro(
        {
          id,
          propriedadeId,
          nome: d.nome,
          nomeNormalizado: normalizarNome(d.nome),
          tipo: d.tipo,
          areaId: d.areaId,
          dataInicio: d.dataInicio,
          estoqueItemId: d.estoqueItemId,
          observacoes: d.observacoes,
          requisicaoId,
        },
        this.ctx.agora(),
      );
      this.ctx.registrarHistorico('centro_producao', id, 'criacao', null, {
        nome: d.nome,
        tipo: d.tipo,
        estoqueItemId: d.estoqueItemId,
        dataInicio: d.dataInicio,
        areaId: d.areaId,
      });
      return this.obter(id);
    });
  }

  atualizar(d: EdicaoCentroValidada): CentroProducaoDetalhe {
    return this.ctx.transacao(() => {
      const c = this.centroAberto(d.id);
      this.validarDados(c.propriedadeId, { ...d.dados, estoqueItemId: c.estoqueItemId }, c.id);
      const antes = {
        nome: c.nome,
        tipo: c.tipo,
        areaId: c.areaId,
        dataInicio: c.dataInicio,
        observacoes: c.observacoes,
      };
      this.ctx.producao.atualizarCentro(
        c.id,
        {
          nome: d.dados.nome,
          nomeNormalizado: normalizarNome(d.dados.nome),
          tipo: d.dados.tipo,
          areaId: d.dados.areaId,
          dataInicio: d.dados.dataInicio,
          observacoes: d.dados.observacoes,
        },
        this.ctx.agora(),
      );
      const depois = {
        nome: d.dados.nome,
        tipo: d.dados.tipo,
        areaId: d.dados.areaId,
        dataInicio: d.dados.dataInicio,
        observacoes: d.dados.observacoes,
      };
      if (JSON.stringify(antes) !== JSON.stringify(depois))
        this.ctx.registrarHistorico('centro_producao', c.id, 'alteracao', antes, depois, d.motivo);
      return this.obter(c.id);
    });
  }

  cancelar(id: string, motivo: string): CentroProducaoDetalhe {
    return this.ctx.transacao(() => {
      const c = this.centroAberto(id);
      const { despesas, consumos } = this.custoDe(id);
      if (despesas.length > 0 || consumos.length > 0)
        throw operacaoInvalida(
          'O centro ainda tem custos vinculados. Desvincule-os antes de cancelar o centro.',
        );
      this.ctx.producao.cancelarCentro(id, motivo, this.ctx.agora());
      this.ctx.registrarHistorico(
        'centro_producao',
        id,
        'cancelamento',
        { nome: c.nome },
        { cancelado: true },
        motivo,
      );
      return this.obter(id);
    });
  }

  // ---- Vínculos de custo --------------------------------------------------------------------
  /** Ids dos movimentos vigentes que já têm rateio ativo (a cadeia de correções é seguida). */
  private movimentosRateados(propriedadeId: string): Set<string> {
    const ids = new Set<string>();
    for (const r of this.ctx.rateio.listarRateios(propriedadeId, false)) {
      if (r.origemTipo !== 'movimentacao_estoque') continue;
      const v = this.ctx.rateio.movimentoVigente(r.origemId);
      if (v) ids.add(v.id);
    }
    return ids;
  }

  candidatos(id: string): CandidatosDoCentro {
    const c = this.centroAberto(id);
    const rateados = this.movimentosRateados(c.propriedadeId);
    return {
      despesas: this.ctx.producao.lancamentosVinculaveis(c.propriedadeId).map((d) => ({
        id: d.id,
        data: d.data,
        descricao: d.descricao,
        valorCentavos: d.valorCentavos,
      })),
      consumos: this.ctx.producao
        .consumosVinculaveis(c.propriedadeId, c.estoqueItemId)
        .filter((m) => !rateados.has(m.movimentacaoId))
        .map((m) => ({
          movimentacaoId: m.movimentacaoId,
          data: m.data,
          itemNome: m.itemNome,
          quantidade: m.quantidadeMilesimos / 1000,
          unidadeBase: m.unidadeBase,
          custoCentavos: m.custoCentavos,
        })),
    };
  }

  vincular(id: string, tipo: 'lancamento' | 'consumo', origemId: string): CentroProducaoDetalhe {
    return this.ctx.transacao(() => {
      const c = this.centroAberto(id);
      const agora = this.ctx.agora();
      if (tipo === 'lancamento') {
        const o = this.ctx.apropriacao.origemLancamento(origemId);
        if (!o || o.propriedadeId !== c.propriedadeId)
          throw naoEncontrado('Despesa não encontrada nesta propriedade.');
        if (!o.ativo) throw invalido(['A despesa está cancelada.']);
        if (o.natureza !== 'despesa') throw invalido(['Só despesas entram no custo de produção.']);
        if (o.origemTipo !== 'manual')
          throw invalido(['Esta despesa é gerenciada por outro módulo e já tem destino próprio.']);
        if (o.destinoTipo !== 'propriedade' && o.destinoTipo !== 'nenhum')
          throw invalido(['A despesa já está lançada a um lote ou animal.']);
        if (o.tratamento !== 'resultado')
          throw invalido([
            'Só despesas de resultado entram no centro; compras para estoque viram custo no consumo.',
          ]);
        const outro = this.ctx.producao.centroDoLancamento(origemId);
        if (outro) throw invalido([`A despesa já está no centro "${outro.nome}".`]);
        if (this.ctx.rateio.temRateioAtivoDoLancamento(origemId))
          throw invalido([
            'A despesa tem rateio ativo: cancele o rateio antes de vinculá-la a um centro.',
          ]);
        this.ctx.producao.vincularLancamento(this.ctx.gerarId(), id, origemId, agora);
      } else {
        const mov = this.ctx.estoque.obterMovimento(origemId);
        const o = this.ctx.apropriacao.origemConsumo(origemId);
        if (!mov || !o || o.propriedadeId !== c.propriedadeId)
          throw naoEncontrado('Consumo não encontrado nesta propriedade.');
        if (!o.ativo) throw invalido(['O consumo está cancelado.']);
        if (!TIPOS_CONSUMO_VINCULAVEL.includes(o.tipo))
          throw invalido(['Só consumo, perda ou ajuste de saída entram no custo de produção.']);
        if (o.manejoId) throw invalido(['O consumo pertence a um registro sanitário.']);
        if (o.destino !== 'propriedade')
          throw invalido(['O consumo já está lançado a um lote ou animal.']);
        if (mov.itemId === c.estoqueItemId)
          throw invalido(['O item produzido não pode ser insumo do próprio centro.']);
        const outro = this.ctx.producao.centroDoConsumo(origemId);
        if (outro) throw invalido([`O consumo já está no centro "${outro.nome}".`]);
        if (this.movimentosRateados(c.propriedadeId).has(origemId))
          throw invalido([
            'O consumo tem rateio ativo: cancele o rateio antes de vinculá-lo a um centro.',
          ]);
        this.ctx.producao.vincularConsumo(this.ctx.gerarId(), id, origemId, agora);
      }
      this.ctx.registrarHistorico('centro_producao', id, 'alteracao', null, {
        vinculou: { tipo, origemId },
      });
      return this.obter(id);
    });
  }

  desvincular(id: string, tipo: 'lancamento' | 'consumo', origemId: string): CentroProducaoDetalhe {
    return this.ctx.transacao(() => {
      this.centroAberto(id);
      const atual =
        tipo === 'lancamento'
          ? this.ctx.producao.centroDoLancamento(origemId)
          : this.ctx.producao.centroDoConsumo(origemId);
      if (!atual || atual.centroId !== id)
        throw naoEncontrado('Este custo não está vinculado a este centro.');
      const agora = this.ctx.agora();
      if (tipo === 'lancamento') this.ctx.producao.desvincularLancamento(origemId, agora);
      else this.ctx.producao.desvincularConsumo(origemId, agora);
      this.ctx.registrarHistorico(
        'centro_producao',
        id,
        'alteracao',
        { vinculo: { tipo, origemId } },
        {
          desvinculou: { tipo, origemId },
        },
      );
      return this.obter(id);
    });
  }

  // ---- Encerramento e reabertura ------------------------------------------------------------
  encerrar(d: EncerramentoValidado): CentroProducaoDetalhe {
    return this.ctx.transacao(() => {
      const c = this.centro(d.id);
      if (c.cancelado) throw operacaoInvalida('O centro de produção está cancelado.');
      if (c.status === 'encerrado') {
        const mov = c.movimentacaoEstoqueId
          ? this.ctx.estoque.obterMovimento(c.movimentacaoEstoqueId)
          : null;
        if (mov?.requisicaoId === d.requisicaoId) return this.obter(c.id);
        throw operacaoInvalida('O centro de produção já está encerrado.');
      }
      if (d.dataFim < c.dataInicio)
        throw invalido(['A data de fim é anterior ao início do centro.']);
      if (d.dataFim > this.ctx.hoje()) throw invalido(['A data de fim não pode ser futura.']);
      const item = this.estoque.itemBasico(c.estoqueItemId);
      const { custo } = this.custoDe(c.id);
      if (!custo.podeEncerrar)
        throw invalido([
          'Vincule ao menos uma despesa ou um consumo de estoque ao centro antes de encerrar. Sem custo conhecido nem desconhecido, o custo da produção seria "não apurado" e a entrada não pode levar custo zero.',
        ]);
      let milesimos: number;
      try {
        milesimos = quantidadeEmMilesimos(d.quantidade, item.unidadeBase);
      } catch (e) {
        throw invalido([e instanceof Error ? e.message : 'Quantidade inválida.']);
      }
      const entrada = this.estoque.registrar(c.estoqueItemId, d.requisicaoId, {
        data: d.dataFim,
        tipo: 'entrada_producao',
        quantidade: d.quantidade,
        unidadeBase: item.unidadeBase,
        loteEstoqueId: d.loteEstoqueId,
        custoEntradaCentavos: custo.custoDaEntradaCentavos,
        destino: null,
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: c.id,
        motivo: null,
        observacao: d.observacao,
      });
      this.ctx.producao.encerrar(
        c.id,
        {
          dataFim: d.dataFim,
          quantidadeMilesimos: milesimos,
          movimentacaoEstoqueId: entrada.id,
          conhecidoCentavos: custo.conhecidoCentavos,
          desconhecidos: custo.desconhecidos,
          totalCentavos: custo.custoDaEntradaCentavos,
        },
        this.ctx.agora(),
      );
      this.ctx.registrarHistorico('centro_producao', c.id, 'encerramento', null, {
        movimentacaoId: entrada.id,
        quantidade: d.quantidade,
        dataFim: d.dataFim,
        custoConhecidoCentavos: custo.conhecidoCentavos,
        componentesDesconhecidos: custo.desconhecidos,
        custoTotalCentavos: custo.custoDaEntradaCentavos,
      });
      return this.obter(c.id);
    });
  }

  reabrir(id: string, motivo: string): CentroProducaoDetalhe {
    return this.ctx.transacao(() => {
      const c = this.centro(id);
      if (c.cancelado) throw operacaoInvalida('O centro de produção está cancelado.');
      if (c.status !== 'encerrado' || !c.movimentacaoEstoqueId)
        throw operacaoInvalida('O centro de produção não está encerrado.');
      const entradaId = c.movimentacaoEstoqueId;
      // O centro volta a "aberto" antes; só então a entrada é cancelada. O estoque recusa (e nada
      // muda) se o saldo ficaria negativo porque o produto já foi consumido.
      this.ctx.producao.reabrir(id, this.ctx.agora());
      this.estoque.cancelar(entradaId, `Reabertura do centro de produção: ${motivo}`, true);
      this.ctx.registrarHistorico(
        'centro_producao',
        id,
        'reabertura',
        { movimentacaoId: entradaId, custoTotalCentavos: c.custoTotalCentavos },
        { status: 'aberto' },
        motivo,
      );
      return this.obter(id);
    });
  }
}
