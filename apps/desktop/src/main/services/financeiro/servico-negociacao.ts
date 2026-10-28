import {
  alocarPrecoDeAnimais,
  conferirPrecoUnitario,
  formatarCentavos,
  gerarUuidV7,
  kgParaGramas,
  type AnimalParaAlocar,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type AnimalDetalhe,
  type DadosCompraAnimaisValidados,
  type DadosVendaAnimaisValidados,
  type DesfazerSaidaValidado,
  type FiltrosNegociacaoValidados,
  type ItemNegociacao,
  type NegociacaoDetalhe,
  type NegociacaoResumo,
  type PaginaNegociacoes,
} from '@pecuaria/shared-types';
import type { LinhaItemNegociacao, LinhaNegociacao } from '@pecuaria/database';
import {
  dataBr,
  invalido,
  naoEncontrado,
  operacaoInvalida,
  type ContextoRebanho,
} from '../rebanho/contexto';
import type { NovoAnimalPreparado, ServicoAnimais } from '../rebanho/servico-animais';
import type { ServicoDevolucao } from './servico-devolucao';
import type { ServicoFinanceiro } from './servico-financeiro';

const paraKg = (g: number | null) => (g === null ? null : g / 1000);

/**
 * Compra e venda de animais (entrega 4C). A negociação é a dona do fato: guarda os animais e a
 * parte do valor de cada um; o dinheiro (valor da operação, parcelas e pagamentos) mora no
 * lançamento financeiro ligado, criado na mesma transação. Nada financeiro é criado sem ação do
 * usuário, e nenhum pagamento é presumido: à vista só tem pagamento se o usuário o confirmar.
 */
export class ServicoNegociacao {
  constructor(
    private readonly ctx: ContextoRebanho,
    private readonly animais: ServicoAnimais,
    private readonly financeiro: ServicoFinanceiro,
    private readonly devolucoes: ServicoDevolucao,
  ) {}

  // ---- Consultas ----------------------------------------------------------------------------
  private resumo(
    n: LinhaNegociacao,
    quantidade: number,
    lancamentos: ReturnType<ServicoFinanceiro['resumosDosLancamentos']>,
  ): NegociacaoResumo {
    const l = lancamentos.get(n.lancamentoId);
    return {
      id: n.id,
      propriedadeId: n.propriedadeId,
      tipo: n.tipo,
      data: n.data,
      pessoa: n.pessoaId && n.pessoaNome ? { id: n.pessoaId, nome: n.pessoaNome } : null,
      lancamentoId: n.lancamentoId,
      valorTotalCentavos: n.valorTotalCentavos,
      criterio: n.criterio,
      unidadePreco: n.unidadePreco,
      precoUnitarioCentavos: n.precoUnitarioCentavos,
      quantidadeAnimais: quantidade,
      observacoes: n.observacoes,
      cancelada: n.cancelada,
      motivoCancelamento: n.motivoCancelamento,
      criadoEm: n.criadoEm,
      situacaoFinanceira: l?.situacao ?? 'cancelado',
      saldoEmAbertoCentavos: l?.saldoEmAbertoCentavos ?? null,
      pagoCentavos: l?.pagoCentavos ?? 0,
      compensadoCentavos: l?.compensadoCentavos ?? 0,
    };
  }
  private item(i: LinhaItemNegociacao): ItemNegociacao {
    const devolvido = this.ctx.devolucao.itemAtivoDoItemDeNegociacao(i.id);
    const devolucao = devolvido ? this.ctx.devolucao.obter(devolvido.devolucaoId) : null;
    return {
      devolucao:
        devolvido && devolucao
          ? { id: devolucao.id, data: devolucao.data, valorCentavos: devolvido.valorCentavos }
          : null,
      id: i.id,
      animalId: i.animalId,
      animalIdentificacao: i.animalIdentificacao,
      valorAlocadoCentavos: i.valorAlocadoCentavos,
      pesoVivoKg: paraKg(i.pesoVivoG),
      pesoCarcacaKg: paraKg(i.pesoCarcacaG),
      cancelado: i.cancelado,
    };
  }

  listar(f: FiltrosNegociacaoValidados): PaginaNegociacoes {
    if (!this.ctx.propriedades.obter(f.propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const filtro = {
      propriedadeId: f.propriedadeId,
      tipo: f.tipo,
      pessoaId: f.pessoaId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      incluirCanceladas: f.incluirCanceladas,
    };
    const total = this.ctx.negociacao.contarNegociacoes(filtro);
    const linhas = this.ctx.negociacao.listarNegociacoes(filtro, {
      limite: f.tamanhoPagina,
      deslocamento: (f.pagina - 1) * f.tamanhoPagina,
    });
    const contagem = this.ctx.negociacao.contagemDeItens(linhas.map((l) => l.id));
    const lancamentos = this.financeiro.resumosDosLancamentos(linhas.map((l) => l.lancamentoId));
    return {
      itens: linhas.map((l) => this.resumo(l, contagem.get(l.id) ?? 0, lancamentos)),
      total,
      pagina: f.pagina,
      tamanhoPagina: f.tamanhoPagina,
    };
  }

  obter(id: string): NegociacaoDetalhe {
    const n = this.ctx.negociacao.obterNegociacao(id);
    if (!n) throw naoEncontrado('Negociação não encontrada.');
    const itens = this.ctx.negociacao.itensDaNegociacao(id);
    const lancamentos = this.financeiro.resumosDosLancamentos([n.lancamentoId]);
    return {
      ...this.resumo(n, itens.length, lancamentos),
      atividade: lancamentos.get(n.lancamentoId)?.atividade ?? 'nao_definida',
      itens: itens.map((i) => this.item(i)),
      devolucoes: this.devolucoes.daNegociacao(id),
    };
  }

  // ---- Validações comuns ---------------------------------------------------------------------
  private exigirContraparte(pessoaId: string | null): string | null {
    if (!pessoaId) return null;
    const p = this.financeiro.repo.obterPessoa(pessoaId);
    if (!p) throw naoEncontrado('Contraparte não encontrada.');
    if (!p.ativo) throw operacaoInvalida('A contraparte está inativa.');
    return p.nome;
  }

  /** Aloca o valor e confere o preço unitário; devolve o valor de cada animal ou lança o erro. */
  private alocar(
    d: Pick<
      DadosCompraAnimaisValidados,
      'valorTotalCentavos' | 'criterio' | 'unidadePreco' | 'precoUnitarioCentavos'
    >,
    animais: readonly (AnimalParaAlocar & {
      pesoVivoG: number | null;
      pesoCarcacaG: number | null;
    })[],
  ): Map<string, number> {
    const r = alocarPrecoDeAnimais({
      totalCentavos: d.valorTotalCentavos,
      criterio: d.criterio,
      animais,
    });
    if (r.erros.length) throw invalido(r.erros);
    const soma = (campo: 'pesoVivoG' | 'pesoCarcacaG') =>
      animais.every((a) => a[campo] !== null)
        ? animais.reduce((s, a) => s + (a[campo] as number), 0)
        : null;
    const problema = conferirPrecoUnitario({
      totalCentavos: d.valorTotalCentavos,
      unidade: d.unidadePreco,
      precoUnitarioCentavos: d.precoUnitarioCentavos,
      cabecas: animais.length,
      pesoVivoG: soma('pesoVivoG'),
      pesoCarcacaG: soma('pesoCarcacaG'),
    });
    if (problema) throw invalido([problema]);
    return new Map(r.valores.map((v) => [v.id, v.valorCentavos]));
  }

  private gramas(kg: number | null, rotulo: string): number | null {
    if (kg === null) return null;
    try {
      return kgParaGramas(kg);
    } catch (e) {
      throw invalido([`${rotulo}: ${e instanceof Error ? e.message : 'peso inválido.'}`]);
    }
  }

  private repeticao(
    requisicaoId: string,
    tipo: 'compra' | 'venda',
    d: { propriedadeId: string; data: string; valorTotalCentavos: number },
    quantidade: number,
  ): NegociacaoDetalhe | null {
    const existente = this.ctx.negociacao.negociacaoPorRequisicao(requisicaoId);
    if (!existente) return null;
    const itens = this.ctx.negociacao.itensDaNegociacao(existente.id);
    if (
      existente.cancelada ||
      existente.tipo !== tipo ||
      existente.propriedadeId !== d.propriedadeId ||
      existente.data !== d.data ||
      existente.valorTotalCentavos !== d.valorTotalCentavos ||
      itens.length !== quantidade
    )
      throw invalido([
        'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita a negociação.',
      ]);
    return this.obter(existente.id);
  }

  private auditar(
    id: string,
    acao: 'criacao' | 'cancelamento',
    antes: Record<string, unknown> | null,
    depois: Record<string, unknown> | null,
    motivo: string | null = null,
  ) {
    this.ctx.registrarHistorico('negociacao_animal', id, acao, antes, depois, motivo);
  }

  // ---- Compra -------------------------------------------------------------------------------
  /**
   * Compra de animais: uma transação cria o lançamento, a negociação, os animais (pelo mesmo
   * cadastro do rebanho, origem "comprado", entrada na data da compra) e a alocação do valor.
   */
  registrarCompra(d: DadosCompraAnimaisValidados): NegociacaoDetalhe {
    return this.ctx.transacao(() => {
      const repetida = this.repeticao(d.requisicaoId, 'compra', d, d.animais.length);
      if (repetida) return repetida;
      if (!this.ctx.propriedades.obter(d.propriedadeId))
        throw naoEncontrado('Propriedade não encontrada.');
      const fornecedor = this.exigirContraparte(d.pessoaId);
      const categoriaId = this.financeiro.categoriaDaOrigem('negociacao_animal', 'despesa');
      if (!categoriaId)
        throw operacaoInvalida('A categoria "Compra de animais" não foi encontrada.');

      const erros: string[] = [];
      const preparados: {
        rotulo: string;
        preparado: NovoAnimalPreparado;
        cru: (typeof d.animais)[number];
      }[] = [];
      const vistos = new Set<string>();
      for (const a of d.animais) {
        const rotulo = a.dados.identificacao;
        const chave = rotulo.trim().toLowerCase();
        if (vistos.has(chave)) {
          erros.push(`${rotulo}: identificação repetida na compra.`);
          continue;
        }
        vistos.add(chave);
        const r = this.animais.prepararNovo(
          d.propriedadeId,
          { ...a.dados, origem: 'comprado' },
          {
            data: d.data,
            loteId: d.loteId,
            pesoVivoKg: a.pesoVivoKg,
            metodoPesagem: a.metodoPesagem,
          },
        );
        for (const e of r.erros) erros.push(`${rotulo}: ${e}`);
        if (r.preparado) preparados.push({ rotulo, preparado: r.preparado, cru: a });
      }
      if (erros.length) throw invalido(erros);

      const valores = this.alocar(
        d,
        preparados.map(({ rotulo, preparado, cru }) => ({
          id: preparado.id,
          rotulo,
          pesoVivoG: this.gramas(cru.pesoVivoKg, rotulo),
          pesoCarcacaG: this.gramas(cru.pesoCarcacaKg, rotulo),
          valorManualCentavos: cru.valorManualCentavos,
        })),
      );

      const negociacaoId = this.ctx.gerarId();
      const n = preparados.length;
      const lancamento = this.financeiro.criarParaOrigem(
        gerarUuidV7(),
        {
          propriedadeId: d.propriedadeId,
          categoriaId,
          pessoaId: d.pessoaId,
          dataCompetencia: d.data,
          valorTotalCentavos: d.valorTotalCentavos,
          descricao: `Compra de ${n} animal(is)${fornecedor ? ` de ${fornecedor}` : ''}`,
          documentoNumero: null,
          atividade: d.atividade,
          destino: { tipo: 'nenhum' },
          quantidade: { valor: n, unidade: 'cabeca' },
          comportamentoCusto: null,
          observacoes: d.observacoes,
          condicao: d.condicao,
        },
        { tipo: 'negociacao_animal', id: negociacaoId },
      );
      const lancamentoId = lancamento.id;

      const agora = this.ctx.agora();
      this.ctx.negociacao.inserirNegociacao(
        {
          id: negociacaoId,
          propriedadeId: d.propriedadeId,
          tipo: 'compra',
          data: d.data,
          pessoaId: d.pessoaId,
          lancamentoId,
          valorTotalCentavos: d.valorTotalCentavos,
          criterio: d.criterio,
          unidadePreco: d.unidadePreco,
          precoUnitarioCentavos: d.precoUnitarioCentavos,
          observacoes: d.observacoes,
          requisicaoId: d.requisicaoId,
        },
        agora,
      );
      for (const { preparado, cru, rotulo } of preparados) {
        this.animais.gravarNovo(preparado, 'criacao');
        const entrada = this.ctx.animais
          .listarMovimentacoes(preparado.id)
          .find((m) => m.tipo === 'entrada')!;
        this.ctx.negociacao.inserirItem(
          {
            id: this.ctx.gerarId(),
            negociacaoId,
            tipo: 'compra',
            animalId: preparado.id,
            movimentacaoId: entrada.id,
            valorAlocadoCentavos: valores.get(preparado.id)!,
            pesoVivoG: this.gramas(cru.pesoVivoKg, rotulo),
            pesoCarcacaG: this.gramas(cru.pesoCarcacaKg, rotulo),
          },
          agora,
        );
      }
      this.auditar(negociacaoId, 'criacao', null, {
        tipo: 'compra',
        data: d.data,
        valorTotalCentavos: d.valorTotalCentavos,
        criterio: d.criterio,
        unidadePreco: d.unidadePreco,
        animais: preparados.map((p) => ({
          identificacao: p.rotulo,
          valorAlocadoCentavos: valores.get(p.preparado.id),
        })),
      });
      return this.obter(negociacaoId);
    });
  }

  // ---- Venda --------------------------------------------------------------------------------
  /**
   * Venda de animais: uma transação cria o lançamento (receita), dá a saída dos animais pelo mesmo
   * fluxo de saída do rebanho (com todas as conferências) e grava a negociação e a alocação.
   */
  registrarVenda(d: DadosVendaAnimaisValidados): NegociacaoDetalhe {
    return this.ctx.transacao(() => {
      const repetida = this.repeticao(d.requisicaoId, 'venda', d, d.animais.length);
      if (repetida) return repetida;
      if (!this.ctx.propriedades.obter(d.propriedadeId))
        throw naoEncontrado('Propriedade não encontrada.');
      const comprador = this.exigirContraparte(d.pessoaId);
      const categoriaId = this.financeiro.categoriaDaOrigem('negociacao_animal', 'receita');
      if (!categoriaId)
        throw operacaoInvalida('A categoria "Venda de animais" não foi encontrada.');

      const erros: string[] = [];
      const vistos = new Set<string>();
      const detalhes: { animal: AnimalDetalhe; cru: (typeof d.animais)[number] }[] = [];
      for (const a of d.animais) {
        if (vistos.has(a.animalId)) {
          erros.push('Há animal repetido na venda.');
          continue;
        }
        vistos.add(a.animalId);
        const animal = this.ctx.animais.obter(a.animalId);
        if (!animal) {
          erros.push('Animal não encontrado.');
          continue;
        }
        if (animal.propriedadeId !== d.propriedadeId)
          erros.push(`${animal.identificacao}: o animal é de outra propriedade.`);
        else if (animal.status !== 'ativo')
          erros.push(`${animal.identificacao}: o animal não está ativo no rebanho.`);
        else detalhes.push({ animal, cru: a });
      }
      if (erros.length) throw invalido(erros);

      const valores = this.alocar(
        d,
        detalhes.map(({ animal, cru }) => ({
          id: animal.id,
          rotulo: animal.identificacao,
          pesoVivoG: this.gramas(cru.pesoVivoKg, animal.identificacao),
          pesoCarcacaG: this.gramas(cru.pesoCarcacaKg, animal.identificacao),
          valorManualCentavos: cru.valorManualCentavos,
        })),
      );

      // Saída de cada animal pelo fluxo do rebanho: as conferências de data, pesagem, consumo de
      // estoque e lançamentos continuam valendo. Qualquer recusa desfaz a venda inteira.
      const motivoSaida = `Venda${comprador ? ` a ${comprador}` : ''} em ${dataBr(d.data)}`;
      const saidas = new Map<string, string>();
      for (const { animal } of detalhes) {
        try {
          this.animais.registrarSaida(animal.id, 'vendido', d.data, motivoSaida);
        } catch (e) {
          if (e instanceof ErroAplicacao)
            throw new ErroAplicacao(
              e.codigo,
              `${animal.identificacao}: ${e.message}`,
              e.detalhes?.map((x) => `${animal.identificacao}: ${x}`),
            );
          throw e;
        }
        saidas.set(animal.id, this.ctx.animais.obterMovimentacaoDeSaida(animal.id)!.id);
      }

      const negociacaoId = this.ctx.gerarId();
      const n = detalhes.length;
      const lancamento = this.financeiro.criarParaOrigem(
        gerarUuidV7(),
        {
          propriedadeId: d.propriedadeId,
          categoriaId,
          pessoaId: d.pessoaId,
          dataCompetencia: d.data,
          valorTotalCentavos: d.valorTotalCentavos,
          descricao: `Venda de ${n} animal(is)${comprador ? ` a ${comprador}` : ''}`,
          documentoNumero: null,
          atividade: d.atividade,
          destino: { tipo: 'nenhum' },
          quantidade: { valor: n, unidade: 'cabeca' },
          comportamentoCusto: null,
          observacoes: d.observacoes,
          condicao: d.condicao,
        },
        { tipo: 'negociacao_animal', id: negociacaoId },
      );
      const lancamentoId = lancamento.id;
      const agora = this.ctx.agora();
      this.ctx.negociacao.inserirNegociacao(
        {
          id: negociacaoId,
          propriedadeId: d.propriedadeId,
          tipo: 'venda',
          data: d.data,
          pessoaId: d.pessoaId,
          lancamentoId,
          valorTotalCentavos: d.valorTotalCentavos,
          criterio: d.criterio,
          unidadePreco: d.unidadePreco,
          precoUnitarioCentavos: d.precoUnitarioCentavos,
          observacoes: d.observacoes,
          requisicaoId: d.requisicaoId,
        },
        agora,
      );
      for (const { animal, cru } of detalhes) {
        this.ctx.negociacao.inserirItem(
          {
            id: this.ctx.gerarId(),
            negociacaoId,
            tipo: 'venda',
            animalId: animal.id,
            movimentacaoId: saidas.get(animal.id)!,
            valorAlocadoCentavos: valores.get(animal.id)!,
            pesoVivoG: this.gramas(cru.pesoVivoKg, animal.identificacao),
            pesoCarcacaG: this.gramas(cru.pesoCarcacaKg, animal.identificacao),
          },
          agora,
        );
      }
      this.auditar(negociacaoId, 'criacao', null, {
        tipo: 'venda',
        data: d.data,
        valorTotalCentavos: d.valorTotalCentavos,
        criterio: d.criterio,
        unidadePreco: d.unidadePreco,
        animais: detalhes.map(({ animal }) => ({
          identificacao: animal.identificacao,
          valorAlocadoCentavos: valores.get(animal.id),
        })),
      });
      return this.obter(negociacaoId);
    });
  }

  // ---- Cancelamento -------------------------------------------------------------------------
  /**
   * Cancela uma negociação (lógico, com motivo). Exige os pagamentos estornados antes. Venda:
   * desfaz a saída de cada animal (D-H). Compra: só se os animais não têm nenhum fato posterior à
   * entrada; os cadastros ficam logicamente excluídos e nada é apagado.
   */
  cancelar(
    id: string,
    motivo: string,
    destino: DesfazerSaidaValidado['destino'],
  ): NegociacaoDetalhe {
    return this.ctx.transacao(() => {
      const n = this.ctx.negociacao.obterNegociacao(id);
      if (!n) throw naoEncontrado('Negociação não encontrada.');
      if (n.cancelada) throw operacaoInvalida('A negociação já está cancelada.');
      if (this.ctx.devolucao.temDevolucaoAtiva(id))
        throw operacaoInvalida(
          'Há devolução registrada desta negociação. Cancele a devolução antes de cancelar a negociação.',
        );
      const detalheLancamento = this.financeiro.obter(n.lancamentoId);
      const recebidos = detalheLancamento.pagamentos.filter((p) => !p.estornado);
      if (recebidos.length > 0)
        throw operacaoInvalida(
          `Há ${recebidos.length} ${n.tipo === 'venda' ? 'recebimento(s)' : 'pagamento(s)'} registrado(s) (${formatarCentavos(detalheLancamento.pagoCentavos)}). Estorne-os no lançamento antes de cancelar a negociação.`,
        );
      const itens = this.ctx.negociacao.itensDaNegociacao(id).filter((i) => !i.cancelado);

      if (n.tipo === 'compra') {
        const problemas: string[] = [];
        for (const i of itens) problemas.push(...this.impedimentosDeCancelarCompra(i));
        if (problemas.length)
          throw operacaoInvalida(
            'A compra não pode ser cancelada porque há fatos registrados depois dela.',
            problemas,
          );
      }
      for (const i of itens) {
        if (n.tipo === 'venda') {
          try {
            this.animais.desfazerSaida(
              i.animalId,
              `Cancelamento da venda: ${motivo}`,
              destino,
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
        } else {
          const antes = this.ctx.animais.obter(i.animalId);
          this.ctx.animais.excluirLogico(i.animalId, this.ctx.agora());
          this.ctx.registrarHistorico(
            'animal',
            i.animalId,
            'exclusao',
            antes ? { identificacao: antes.identificacao, origem: antes.origem } : null,
            null,
            `Cancelamento da compra: ${motivo}`,
          );
        }
      }
      this.financeiro.cancelarDeOrigem(n.lancamentoId, `Cancelamento da negociação: ${motivo}`);
      const agora = this.ctx.agora();
      this.ctx.negociacao.cancelarNegociacao(id, motivo, agora);
      this.ctx.negociacao.cancelarItens(id, agora);
      this.auditar(
        id,
        'cancelamento',
        { tipo: n.tipo, valorTotalCentavos: n.valorTotalCentavos, animais: itens.length },
        { cancelada: true },
        motivo,
      );
      return this.obter(id);
    });
  }

  /** Fatos que impedem cancelar uma compra: qualquer coisa além da entrada e do peso de entrada. */
  private impedimentosDeCancelarCompra(i: LinhaItemNegociacao): string[] {
    const r: string[] = [];
    const rotulo = i.animalIdentificacao;
    const animal = this.ctx.animais.obter(i.animalId);
    if (!animal || animal.status !== 'ativo') r.push(`${rotulo}: o animal já saiu do rebanho.`);
    const outras = this.ctx.animais
      .listarMovimentacoes(i.animalId)
      .filter((m) => m.tipo !== 'entrada');
    if (outras.length > 0)
      r.push(`${rotulo}: há movimentação posterior à entrada (troca de lote).`);
    const pesagens = this.ctx.pesagens.listar(i.animalId);
    if (pesagens.length > 1)
      r.push(`${rotulo}: há ${pesagens.length - 1} pesagem(ns) além do peso de entrada.`);
    if (this.ctx.estoque.temDestinoAnimal(i.animalId))
      r.push(`${rotulo}: há consumo de estoque registrado para o animal.`);
    if (this.ctx.financeiro.temLancamentoDoAnimal(i.animalId))
      r.push(`${rotulo}: há lançamento financeiro ligado ao animal.`);
    if (this.ctx.sanidade.listarEventosDoAnimal(i.animalId).length > 0)
      r.push(`${rotulo}: há registro sanitário do animal.`);
    if (
      this.ctx.animais.contarFilhos(i.animalId).comoMae +
        this.ctx.animais.contarFilhos(i.animalId).comoPai >
      0
    )
      r.push(`${rotulo}: o animal tem filhos cadastrados.`);
    if (this.ctx.negociacao.animalTemCustoAnterior(i.animalId))
      r.push(`${rotulo}: há custo anterior informado para o animal.`);
    const venda = this.ctx.negociacao.itemAtivoDoAnimal(i.animalId, 'venda');
    if (venda) r.push(`${rotulo}: o animal tem venda registrada.`);
    return r;
  }
}
