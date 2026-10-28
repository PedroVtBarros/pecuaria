import {
  conferirDevolucao,
  formatarCentavos,
  gerarUuidV7,
  planejarCompensacao,
  type ParcelaPlanejada,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type DadosDevolucaoValidados,
  type DadosLancamentoValidados,
  type DevolucaoDetalhe,
  type PrevisaoDevolucao,
  type PrevisaoDevolucaoValidada,
} from '@pecuaria/shared-types';
import type { LinhaDevolucao, LinhaItemNegociacao, LinhaNegociacao } from '@pecuaria/database';
import {
  dataBr,
  invalido,
  naoEncontrado,
  operacaoInvalida,
  type ContextoRebanho,
} from '../rebanho/contexto';
import type { ServicoAnimais } from '../rebanho/servico-animais';
import type { ServicoFinanceiro } from './servico-financeiro';

/** Categorias das devoluções, criadas pela migration 0011 (achadas pelo id, não pelo nome). */
export const CATEGORIA_DEVOLUCAO_VENDA = '01929c10-0000-7000-8000-000000000010';
export const CATEGORIA_DEVOLUCAO_COMPRA = '01929c10-0000-7000-8000-000000000011';

type Preparada = {
  n: LinhaNegociacao;
  itens: { item: LinhaItemNegociacao; valorCentavos: number }[];
  previsao: PrevisaoDevolucao;
  parcelasCompensadas: { parcelaId: string; valorCentavos: number }[];
};

/**
 * Devolução de animais (revisão final da Fase 4), operação própria vinculada à negociação
 * original, que fica preservada:
 * - venda devolvida pelo comprador: os animais voltam ao rebanho na data da devolução (nova
 *   entrada; a saída da venda continua no histórico e nada é refeito para trás);
 * - compra devolvida ao fornecedor: os animais saem do rebanho na data, pelo fluxo de saída.
 * O valor acordado (informado por animal) vira um lançamento do tipo "devolucao" ligado ao
 * original. O que ainda estava em aberto na negociação original é liquidado por compensação, sem
 * caixa; só o restante fica a pagar (reembolso) ou a receber (valor a recuperar). Nenhum pagamento
 * é criado sem o usuário: à vista só tem pagamento se ele informar.
 */
export class ServicoDevolucao {
  constructor(
    private readonly ctx: ContextoRebanho,
    private readonly animais: ServicoAnimais,
    private readonly financeiro: ServicoFinanceiro,
  ) {}

  // ---- Consulta ----------------------------------------------------------------------------
  detalhe(d: LinhaDevolucao): DevolucaoDetalhe {
    const itens = this.ctx.devolucao.itens(d.id);
    const compensacoes = this.ctx.devolucao.compensacoes(d.id);
    const original = this.ctx.negociacao.obterNegociacao(d.negociacaoId);
    const parcelasOriginais = original
      ? (this.financeiro.repo
          .parcelasDosLancamentos([original.lancamentoId], true)
          .get(original.lancamentoId) ?? [])
      : [];
    const numero = new Map(parcelasOriginais.map((p) => [p.id, p.numero]));
    const lanc = this.financeiro.resumosDosLancamentos([d.lancamentoId]).get(d.lancamentoId);
    const compensado = compensacoes
      .filter((k) => !k.cancelada)
      .reduce((s, k) => s + k.valorCentavos, 0);
    const conf = conferirDevolucao(
      itens.map((i) => ({
        valorOriginalCentavos: i.valorOriginalCentavos,
        valorDevolvidoCentavos: i.valorCentavos,
      })),
    );
    return {
      id: d.id,
      tipo: d.tipo,
      negociacaoId: d.negociacaoId,
      data: d.data,
      lancamentoId: d.lancamentoId,
      valorTotalCentavos: d.valorTotalCentavos,
      compensadoCentavos: compensado,
      restanteCentavos: d.valorTotalCentavos - compensado,
      liquidadoEmCaixaCentavos: lanc?.pagoCentavos ?? 0,
      restanteEmAbertoCentavos: lanc ? lanc.saldoEmAbertoCentavos : null,
      situacaoFinanceira: lanc?.situacao ?? 'cancelado',
      diferencaDoOriginalCentavos: conf.diferencaCentavos,
      itens: itens.map((i) => ({
        id: i.id,
        negociacaoItemId: i.negociacaoItemId,
        animalId: i.animalId,
        animalIdentificacao: i.animalIdentificacao,
        valorOriginalCentavos: i.valorOriginalCentavos,
        valorCentavos: i.valorCentavos,
        cancelado: i.cancelado,
      })),
      compensacoes: compensacoes.map((k) => ({
        id: k.id,
        parcelaOrigemNumero: numero.get(k.parcelaOrigemId) ?? 0,
        data: k.data,
        valorCentavos: k.valorCentavos,
        cancelada: k.cancelada,
      })),
      observacoes: d.observacoes,
      cancelada: d.cancelada,
      motivoCancelamento: d.motivoCancelamento,
      criadoEm: d.criadoEm,
    };
  }

  obter(id: string): DevolucaoDetalhe {
    const d = this.ctx.devolucao.obter(id);
    if (!d) throw naoEncontrado('Devolução não encontrada.');
    return this.detalhe(d);
  }

  daNegociacao(negociacaoId: string): DevolucaoDetalhe[] {
    return this.ctx.devolucao.daNegociacao(negociacaoId).map((d) => this.detalhe(d));
  }

  // ---- Validação e prévia ------------------------------------------------------------------
  private preparar(d: PrevisaoDevolucaoValidada): Preparada {
    const n = this.ctx.negociacao.obterNegociacao(d.negociacaoId);
    if (!n) throw naoEncontrado('Negociação não encontrada.');
    if (n.cancelada) throw operacaoInvalida('A negociação está cancelada.');
    const erros: string[] = [];
    if (d.data < n.data)
      erros.push(`A devolução não pode ser anterior à ${n.tipo} (${dataBr(n.data)}).`);
    if (d.data > this.ctx.hoje()) erros.push('A devolução não pode ter data futura.');
    const itensDaNegociacao = new Map(
      this.ctx.negociacao.itensDaNegociacao(n.id).map((i) => [i.id, i]),
    );
    const itens: Preparada['itens'] = [];
    for (const x of d.itens) {
      const item = itensDaNegociacao.get(x.negociacaoItemId);
      if (!item || item.cancelado) {
        erros.push('Animal não encontrado nesta negociação.');
        continue;
      }
      const rotulo = item.animalIdentificacao;
      if (this.ctx.devolucao.itemAtivoDoItemDeNegociacao(item.id)) {
        erros.push(`${rotulo}: o animal já foi devolvido nesta negociação.`);
        continue;
      }
      const animal = this.ctx.animais.obter(item.animalId);
      if (!animal) {
        erros.push(`${rotulo}: animal não encontrado.`);
        continue;
      }
      if (n.tipo === 'venda') {
        const saida = this.ctx.animais.obterMovimentacaoDeSaida(item.animalId);
        if (animal.status === 'ativo' || saida?.id !== item.movimentacaoId)
          erros.push(
            `${rotulo}: o animal não está mais fora do rebanho por esta venda (voltou ou teve outra movimentação).`,
          );
      } else if (animal.status !== 'ativo')
        erros.push(
          `${rotulo}: o animal não está no rebanho; não pode ser devolvido ao fornecedor.`,
        );
      itens.push({ item, valorCentavos: x.valorCentavos });
    }
    if (erros.length) throw invalido(erros);

    const original = this.financeiro.obter(n.lancamentoId);
    if (original.condicaoPagamento === 'nao_informada')
      throw operacaoInvalida(
        `Defina antes a condição de pagamento da ${n.tipo} original: sem ela não se sabe o que está em aberto para compensar.`,
      );
    const abertas = original.parcelas
      .filter((p) => !p.cancelada && p.saldoCentavos > 0)
      .map((p) => ({
        id: p.id,
        numero: p.numero,
        vencimento: p.vencimento,
        saldoCentavos: p.saldoCentavos,
      }));
    const total = itens.reduce((s, i) => s + i.valorCentavos, 0);
    if (!Number.isSafeInteger(total)) throw invalido(['Valor total acima do limite.']);
    const plano = planejarCompensacao(total, abertas);
    const conf = conferirDevolucao(
      itens.map((i) => ({
        valorOriginalCentavos: i.item.valorAlocadoCentavos,
        valorDevolvidoCentavos: i.valorCentavos,
      })),
    );
    const emAberto = abertas.reduce((s, p) => s + p.saldoCentavos, 0);
    const avisos: string[] = [];
    if (conf.diferencaCentavos !== 0)
      avisos.push(
        `O valor acordado (${formatarCentavos(total)}) difere do valor original dos animais (${formatarCentavos(conf.originalCentavos)}) em ${formatarCentavos(Math.abs(conf.diferencaCentavos))}.`,
      );
    if (plano.compensadoCentavos > 0)
      avisos.push(
        `${formatarCentavos(plano.compensadoCentavos)} em aberto na ${n.tipo} original serão liquidados por compensação, sem caixa.`,
      );
    if (plano.restanteCentavos > 0)
      avisos.push(
        n.tipo === 'venda'
          ? `${formatarCentavos(plano.restanteCentavos)} ficam a reembolsar ao comprador; a saída de caixa só existe quando o reembolso for pago.`
          : `${formatarCentavos(plano.restanteCentavos)} ficam a recuperar do fornecedor; a entrada de caixa só existe quando for recebido.`,
      );
    if (plano.restanteCentavos > original.pagoCentavos)
      avisos.push(
        n.tipo === 'venda'
          ? `O reembolso supera o que foi recebido do comprador (${formatarCentavos(original.pagoCentavos)}).`
          : `O valor a recuperar supera o que foi pago ao fornecedor (${formatarCentavos(original.pagoCentavos)}).`,
      );
    return {
      n,
      itens,
      parcelasCompensadas: plano.compensacoes,
      previsao: {
        tipo: n.tipo,
        itens: itens.map((i) => ({
          negociacaoItemId: i.item.id,
          animalIdentificacao: i.item.animalIdentificacao,
          valorOriginalCentavos: i.item.valorAlocadoCentavos,
          valorCentavos: i.valorCentavos,
        })),
        valorTotalCentavos: total,
        originalCentavos: conf.originalCentavos,
        diferencaDoOriginalCentavos: conf.diferencaCentavos,
        emAbertoNaOriginalCentavos: emAberto,
        liquidadoNaOriginalCentavos: original.pagoCentavos,
        compensadoCentavos: plano.compensadoCentavos,
        restanteCentavos: plano.restanteCentavos,
        avisos,
      },
    };
  }

  prever(d: PrevisaoDevolucaoValidada): PrevisaoDevolucao {
    return this.preparar(d).previsao;
  }

  /** Condição do lançamento da devolução: a parcela compensada (se houver) + o restante. */
  private condicao(
    d: DadosDevolucaoValidados,
    compensado: number,
    restante: number,
  ): {
    condicao: DadosLancamentoValidados['condicao'];
    pagamentoDoRestante: { data: string; forma: string | null } | null;
  } {
    const c = d.condicaoRestante;
    if (compensado === 0) return { condicao: c, pagamentoDoRestante: null };
    if (restante === 0)
      return {
        condicao: { tipo: 'a_vista', vencimento: d.data, pagamento: null },
        pagamentoDoRestante: null,
      };
    if (c.tipo === 'nao_informada')
      throw invalido([
        'Informe a condição do restante (à vista ou parcelado): parte do valor já é compensada e o restante precisa de parcela.',
      ]);
    const compensada: ParcelaPlanejada = { vencimento: d.data, valorCentavos: compensado };
    if (c.tipo === 'a_vista')
      return {
        condicao: {
          tipo: 'parcelado',
          parcelas: [compensada, { vencimento: c.vencimento ?? d.data, valorCentavos: restante }],
        },
        pagamentoDoRestante: c.pagamento,
      };
    return {
      condicao: { tipo: 'parcelado', parcelas: [compensada, ...c.parcelas] },
      pagamentoDoRestante: null,
    };
  }

  // ---- Registro ----------------------------------------------------------------------------
  registrar(d: DadosDevolucaoValidados): DevolucaoDetalhe {
    return this.ctx.transacao(() => {
      const existente = this.ctx.devolucao.porRequisicao(d.requisicaoId);
      if (existente) {
        const itens = this.ctx.devolucao.itens(existente.id);
        const mesmo =
          !existente.cancelada &&
          existente.negociacaoId === d.negociacaoId &&
          existente.data === d.data &&
          itens.length === d.itens.length &&
          d.itens.every((x) =>
            itens.some(
              (i) =>
                i.negociacaoItemId === x.negociacaoItemId && i.valorCentavos === x.valorCentavos,
            ),
          );
        if (!mesmo)
          throw invalido([
            'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita a devolução.',
          ]);
        return this.detalhe(existente);
      }
      const p = this.preparar(d);
      const { n } = p;
      const { compensadoCentavos: compensado, restanteCentavos: restante } = p.previsao;
      const { condicao, pagamentoDoRestante } = this.condicao(d, compensado, restante);
      const contraparte = n.pessoaNome;
      const devolucaoId = this.ctx.gerarId();
      const quantos = p.itens.length;

      // Rebanho: retorno (venda devolvida) ou saída (compra devolvida), pelo fluxo do rebanho.
      const movimentacoes = new Map<string, string>();
      for (const { item } of p.itens) {
        const rotulo = item.animalIdentificacao;
        try {
          if (n.tipo === 'venda') {
            movimentacoes.set(
              item.id,
              this.animais.registrarRetorno(
                item.animalId,
                d.data,
                d.loteRetornoId,
                `Retorno por devolução da venda de ${dataBr(n.data)}${contraparte ? ` (${contraparte})` : ''}`,
              ),
            );
          } else {
            this.animais.registrarSaida(
              item.animalId,
              'vendido',
              d.data,
              `Devolução ao fornecedor${contraparte ? ` ${contraparte}` : ''} (compra de ${dataBr(n.data)})`,
            );
            movimentacoes.set(
              item.id,
              this.ctx.animais.obterMovimentacaoDeSaida(item.animalId)!.id,
            );
          }
        } catch (e) {
          if (e instanceof ErroAplicacao)
            throw new ErroAplicacao(
              e.codigo,
              `${rotulo}: ${e.message}`,
              e.detalhes?.map((x) => `${rotulo}: ${x}`),
            );
          throw e;
        }
      }

      // Financeiro: lançamento de devolução ligado ao original; compensação do que estava em aberto.
      const atividade = this.financeiro.obter(n.lancamentoId).atividade;
      const lancamento = this.financeiro.criarParaOrigem(
        gerarUuidV7(),
        {
          propriedadeId: n.propriedadeId,
          categoriaId: n.tipo === 'venda' ? CATEGORIA_DEVOLUCAO_VENDA : CATEGORIA_DEVOLUCAO_COMPRA,
          pessoaId: n.pessoaId,
          dataCompetencia: d.data,
          valorTotalCentavos: p.previsao.valorTotalCentavos,
          descricao:
            n.tipo === 'venda'
              ? `Devolução de ${quantos} animal(is) da venda de ${dataBr(n.data)}${contraparte ? ` a ${contraparte}` : ''}`
              : `Devolução de ${quantos} animal(is) ao fornecedor${contraparte ? ` ${contraparte}` : ''} (compra de ${dataBr(n.data)})`,
          documentoNumero: null,
          atividade,
          destino: { tipo: 'nenhum' },
          quantidade: { valor: quantos, unidade: 'cabeca' },
          comportamentoCusto: null,
          observacoes: d.observacoes,
          condicao,
        },
        { tipo: 'negociacao_animal', id: devolucaoId },
        n.lancamentoId,
      );
      const agora = this.ctx.agora();
      this.ctx.devolucao.inserirDevolucao(
        {
          id: devolucaoId,
          propriedadeId: n.propriedadeId,
          tipo: n.tipo,
          negociacaoId: n.id,
          data: d.data,
          lancamentoId: lancamento.id,
          valorTotalCentavos: p.previsao.valorTotalCentavos,
          observacoes: d.observacoes,
          requisicaoId: d.requisicaoId,
        },
        agora,
      );
      for (const { item, valorCentavos } of p.itens)
        this.ctx.devolucao.inserirItem(
          {
            id: this.ctx.gerarId(),
            devolucaoId,
            negociacaoItemId: item.id,
            animalId: item.animalId,
            movimentacaoId: movimentacoes.get(item.id)!,
            valorCentavos,
          },
          agora,
        );
      const parcelas = lancamento.parcelas.filter((x) => !x.cancelada);
      if (compensado > 0) {
        const parcelaCompensada = parcelas.find((x) => x.numero === 1)!;
        for (const k of p.parcelasCompensadas)
          this.ctx.devolucao.inserirCompensacao(
            {
              id: this.ctx.gerarId(),
              devolucaoId,
              parcelaOrigemId: k.parcelaId,
              parcelaDevolucaoId: parcelaCompensada.id,
              data: d.data,
              valorCentavos: k.valorCentavos,
            },
            agora,
          );
        if (pagamentoDoRestante) {
          const doRestante = parcelas.find((x) => x.numero === 2)!;
          this.financeiro.registrarPagamento(doRestante.id, gerarUuidV7(), {
            data: pagamentoDoRestante.data,
            valorCentavos: restante,
            forma: pagamentoDoRestante.forma,
            observacao: null,
          });
        }
      }
      this.ctx.registrarHistorico('devolucao_animal', devolucaoId, 'criacao', null, {
        tipo: n.tipo,
        negociacaoId: n.id,
        data: d.data,
        valorTotalCentavos: p.previsao.valorTotalCentavos,
        compensadoCentavos: compensado,
        restanteCentavos: restante,
        animais: p.itens.map((i) => ({
          identificacao: i.item.animalIdentificacao,
          valorOriginalCentavos: i.item.valorAlocadoCentavos,
          valorCentavos: i.valorCentavos,
        })),
      });
      return this.obter(devolucaoId);
    });
  }

  // ---- Cancelamento ------------------------------------------------------------------------
  /**
   * Cancela a devolução (correção): exige os pagamentos do reembolso (ou recebimentos do valor
   * recuperado) estornados antes e nenhum fato do animal que dependa da devolução. Desfaz o
   * retorno (venda) ou a saída (compra), as compensações e o lançamento; nada é apagado.
   */
  cancelar(id: string, motivo: string): DevolucaoDetalhe {
    return this.ctx.transacao(() => {
      const d = this.ctx.devolucao.obter(id);
      if (!d) throw naoEncontrado('Devolução não encontrada.');
      if (d.cancelada) throw operacaoInvalida('A devolução já está cancelada.');
      const lanc = this.financeiro.obter(d.lancamentoId);
      const pagos = lanc.pagamentos.filter((g) => !g.estornado);
      if (pagos.length > 0)
        throw operacaoInvalida(
          `Há ${pagos.length} ${d.tipo === 'venda' ? 'pagamento(s) de reembolso' : 'recebimento(s)'} registrado(s) (${formatarCentavos(lanc.pagoCentavos)}). Estorne-os no lançamento antes de cancelar a devolução.`,
        );
      const itens = this.ctx.devolucao.itens(id).filter((i) => !i.cancelado);
      for (const i of itens) {
        try {
          if (d.tipo === 'venda')
            this.animais.desfazerRetorno(
              i.animalId,
              i.movimentacaoId,
              `Cancelamento da devolução: ${motivo}`,
            );
          else
            this.animais.desfazerSaida(
              i.animalId,
              `Cancelamento da devolução ao fornecedor: ${motivo}`,
              { tipo: 'origem' },
              true,
            );
        } catch (e) {
          if (e instanceof ErroAplicacao)
            throw new ErroAplicacao(
              e.codigo,
              `${i.animalIdentificacao}: ${e.message}`,
              e.detalhes?.map((x) => `${i.animalIdentificacao}: ${x}`),
            );
          throw e;
        }
      }
      const agora = this.ctx.agora();
      this.ctx.devolucao.cancelarCompensacoes(id, `Cancelamento da devolução: ${motivo}`, agora);
      this.financeiro.cancelarDeOrigem(d.lancamentoId, `Cancelamento da devolução: ${motivo}`);
      this.ctx.devolucao.cancelar(id, motivo, agora);
      this.ctx.devolucao.cancelarItens(id, agora);
      this.ctx.registrarHistorico(
        'devolucao_animal',
        id,
        'cancelamento',
        { tipo: d.tipo, valorTotalCentavos: d.valorTotalCentavos, animais: itens.length },
        { cancelada: true },
        motivo,
      );
      return this.obter(id);
    });
  }
}
