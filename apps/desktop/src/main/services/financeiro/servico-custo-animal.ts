import {
  apurarAquisicaoEFormacao,
  dividirIgual,
  formatarCentavos,
  reconstruirPermanencias,
  somarDias,
} from '@pecuaria/domain';
import {
  type CustoAnterior,
  type CustoAnteriorValidado,
  type CustoDoAnimal,
} from '@pecuaria/shared-types';
import type { LinhaCustoAnterior } from '@pecuaria/database';
import {
  dataBr,
  descreverConsumosConflitantes,
  descreverLancamentosConflitantes,
  invalido,
  naoEncontrado,
  operacaoInvalida,
  type ContextoRebanho,
} from '../rebanho/contexto';

/**
 * Custo anterior ao sistema (D-G) e custo de aquisição e formação do animal (D-F), entrega 4C.
 *
 * O custo anterior é um registro próprio, informado pelo usuário, sem caixa, parcela, pagamento
 * nem lançamento. Para um lote, é dividido igualmente entre os animais que estavam no lote na data
 * de referência, e só com a confirmação explícita do usuário. O sistema nunca estima custo.
 */
export class ServicoCustoAnimal {
  constructor(private readonly ctx: ContextoRebanho) {}

  private paraApi(c: LinhaCustoAnterior): CustoAnterior {
    return {
      id: c.id,
      propriedadeId: c.propriedadeId,
      destino: c.destino,
      animal:
        c.animalId && c.animalIdentificacao
          ? { id: c.animalId, identificacao: c.animalIdentificacao }
          : null,
      lote: c.loteId && c.loteNome ? { id: c.loteId, nome: c.loteNome } : null,
      valorCentavos: c.valorCentavos,
      dataReferencia: c.dataReferencia,
      descricao: c.descricao,
      origemInformacao: c.origemInformacao,
      justificativa: c.justificativa,
      informadoPeloUsuario: true,
      cancelado: c.cancelado,
      motivoCancelamento: c.motivoCancelamento,
      criadoEm: c.criadoEm,
      itens: this.ctx.negociacao.itensDoCustoAnterior(c.id).map((i) => ({
        animalId: i.animalId,
        animalIdentificacao: i.animalIdentificacao,
        valorCentavos: i.valorCentavos,
        pesoRelativo: i.pesoRelativo,
      })),
    };
  }

  obter(id: string): CustoAnterior {
    const c = this.ctx.negociacao.obterCustoAnterior(id);
    if (!c) throw naoEncontrado('Custo anterior não encontrado.');
    return this.paraApi(c);
  }

  listar(f: {
    propriedadeId: string;
    animalId?: string | undefined;
    loteId?: string | undefined;
    incluirCancelados: boolean;
  }): CustoAnterior[] {
    if (!this.ctx.propriedades.obter(f.propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    return this.ctx.negociacao.listarCustosAnteriores(f).map((c) => this.paraApi(c));
  }

  /** Animais que estavam no lote ao fim do dia `data`, pelas permanências reconstruídas. */
  private animaisNoLoteEm(
    loteId: string,
    data: string,
  ): { ids: string[]; inconsistentes: string[] } {
    const candidatos = this.ctx.animais.idsQueEstiveramNoLote(loteId);
    const movimentos = this.ctx.animais.listarMovimentacoesDeAnimais(candidatos);
    const ids: string[] = [];
    const inconsistentes: string[] = [];
    for (const animalId of candidatos) {
      const atual = this.ctx.animais.obter(animalId);
      const rec = reconstruirPermanencias(
        movimentos.get(animalId) ?? [],
        loteId,
        atual?.lote?.id ?? null,
      );
      if (rec.situacao === 'inconsistente') {
        inconsistentes.push(this.ctx.animais.obter(animalId)?.identificacao ?? animalId);
        continue;
      }
      // Fim da permanência é o dia em que saiu: ao fim desse dia o animal já não está no lote.
      if (rec.permanencias.some((p) => p.inicio <= data && (p.fim === null || data < p.fim)))
        ids.push(animalId);
    }
    return { ids, inconsistentes };
  }

  registrar(d: CustoAnteriorValidado): CustoAnterior {
    return this.ctx.transacao(() => {
      const existente = this.ctx.negociacao.custoAnteriorPorRequisicao(d.requisicaoId);
      if (existente) {
        const mesmoDestino =
          d.destino.tipo === 'animal'
            ? existente.animalId === d.destino.animalId
            : existente.loteId === d.destino.loteId;
        if (
          existente.cancelado ||
          !mesmoDestino ||
          existente.valorCentavos !== d.valorCentavos ||
          existente.dataReferencia !== d.dataReferencia
        )
          throw invalido([
            'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita o registro.',
          ]);
        return this.paraApi(existente);
      }
      if (!this.ctx.propriedades.obter(d.propriedadeId))
        throw naoEncontrado('Propriedade não encontrada.');
      if (d.dataReferencia > this.ctx.hoje())
        throw invalido(['A data de referência não pode ser futura.']);

      const erros: string[] = [];
      let alvo: { id: string; rotulo: string }[] = [];
      const conflitos: string[] = [];
      const ate = somarDias(d.dataReferencia, 1);

      if (d.destino.tipo === 'animal') {
        const animal = this.ctx.animais.obter(d.destino.animalId);
        if (!animal || animal.propriedadeId !== d.propriedadeId)
          throw naoEncontrado('Animal não encontrado nesta propriedade.');
        if (animal.dataSaida && d.dataReferencia > animal.dataSaida)
          erros.push('A data de referência é posterior à saída do animal.');
        if (this.ctx.animais.ausenciaNaData(animal.id, d.dataReferencia))
          erros.push(
            'Na data de referência o animal estava fora do rebanho (entre uma saída e o retorno).',
          );
        alvo = [{ id: animal.id, rotulo: animal.identificacao }];
        const consumos = this.ctx.estoque.consumosDoAnimalAntes(animal.id, ate);
        const lancamentos = this.ctx.financeiro.lancamentosDoAnimalAntes(animal.id, ate);
        if (consumos.total > 0)
          conflitos.push(
            descreverConsumosConflitantes(
              consumos,
              'Já há consumo de estoque do animal até a data de referência',
            ),
          );
        if (lancamentos.total > 0)
          conflitos.push(
            descreverLancamentosConflitantes(
              lancamentos,
              'Já há lançamento financeiro do animal até a data de referência',
            ),
          );
      } else {
        const lote = this.ctx.lotes.obter(d.destino.loteId);
        if (!lote || lote.propriedadeId !== d.propriedadeId)
          throw naoEncontrado('Lote não encontrado nesta propriedade.');
        if (!d.destino.confirmarRateioIgual)
          erros.push(
            'Confirme o rateio igualitário: o valor será dividido por igual entre os animais que estavam no lote na data de referência.',
          );
        if (d.dataReferencia < lote.dataFormacao)
          erros.push(
            `O lote foi formado em ${dataBr(lote.dataFormacao)}, depois da data de referência.`,
          );
        const presentes = this.animaisNoLoteEm(lote.id, d.dataReferencia);
        if (presentes.inconsistentes.length > 0)
          erros.push(
            `O histórico de movimentação não permite saber quem estava no lote em ${dataBr(d.dataReferencia)} (${presentes.inconsistentes.join(', ')}). Registre o custo animal a animal.`,
          );
        else if (presentes.ids.length === 0)
          erros.push(`Nenhum animal estava no lote "${lote.nome}" em ${dataBr(d.dataReferencia)}.`);
        alvo = presentes.ids.map((id) => ({
          id,
          rotulo: this.ctx.animais.obter(id)?.identificacao ?? id,
        }));
        const consumos = this.ctx.estoque.consumosDoLoteAnimalAntes(lote.id, ate);
        const lancamentos = this.ctx.financeiro.lancamentosDoLoteAntes(lote.id, ate);
        if (consumos.total > 0)
          conflitos.push(
            descreverConsumosConflitantes(
              consumos,
              'Já há consumo de estoque do lote até a data de referência',
            ),
          );
        if (lancamentos.total > 0)
          conflitos.push(
            descreverLancamentosConflitantes(
              lancamentos,
              'Já há lançamento financeiro do lote até a data de referência',
            ),
          );
      }
      // Animal comprado e registrado no sistema já tem seu custo de aquisição: não se repete.
      for (const a of alvo) {
        if (this.ctx.negociacao.itemAtivoDoAnimal(a.id, 'compra'))
          erros.push(
            `${a.rotulo}: o animal tem compra registrada no sistema; o custo de aquisição já está lá e não pode ser informado de novo.`,
          );
      }
      const jaTem = alvo.filter((a) => this.ctx.negociacao.animalTemCustoAnterior(a.id));
      if (jaTem.length > 0)
        conflitos.push(
          `Já há custo anterior informado para: ${jaTem.map((a) => a.rotulo).join(', ')}`,
        );
      if (erros.length) throw invalido(erros);
      if (conflitos.length > 0 && !d.confirmarSemDuplicidade)
        throw operacaoInvalida(
          'Já existem custos registrados no sistema para este destino até a data de referência. Confira e confirme que o valor informado não os repete.',
          conflitos,
        );
      if (d.valorCentavos < alvo.length)
        throw invalido([
          `O valor (${formatarCentavos(d.valorCentavos)}) é menor que o número de animais (${alvo.length}).`,
        ]);

      const partes = dividirIgual(
        d.valorCentavos,
        alvo.map((a) => a.id),
      );
      const id = this.ctx.gerarId();
      const agora = this.ctx.agora();
      this.ctx.negociacao.inserirCustoAnterior(
        {
          id,
          propriedadeId: d.propriedadeId,
          destino: d.destino.tipo,
          animalId: d.destino.tipo === 'animal' ? d.destino.animalId : null,
          loteId: d.destino.tipo === 'lote' ? d.destino.loteId : null,
          valorCentavos: d.valorCentavos,
          dataReferencia: d.dataReferencia,
          descricao: d.descricao,
          origemInformacao: d.origemInformacao,
          justificativa: d.justificativa,
          requisicaoId: d.requisicaoId,
        },
        agora,
      );
      for (const p of partes)
        this.ctx.negociacao.inserirItemCustoAnterior(
          {
            id: this.ctx.gerarId(),
            custoAnteriorId: id,
            animalId: p.id,
            valorCentavos: p.valorCentavos,
            pesoRelativo: 1,
          },
          agora,
        );
      this.ctx.registrarHistorico(
        'custo_anterior',
        id,
        'criacao',
        null,
        {
          destino: d.destino.tipo,
          valorCentavos: d.valorCentavos,
          dataReferencia: d.dataReferencia,
          descricao: d.descricao,
          origemInformacao: d.origemInformacao,
          animais: alvo.length,
        },
        d.justificativa,
      );
      return this.obter(id);
    });
  }

  cancelar(id: string, motivo: string): CustoAnterior {
    return this.ctx.transacao(() => {
      const c = this.ctx.negociacao.obterCustoAnterior(id);
      if (!c) throw naoEncontrado('Custo anterior não encontrado.');
      if (c.cancelado) throw operacaoInvalida('O custo anterior já está cancelado.');
      this.ctx.negociacao.cancelarCustoAnterior(id, motivo, this.ctx.agora());
      this.ctx.registrarHistorico(
        'custo_anterior',
        id,
        'cancelamento',
        { valorCentavos: c.valorCentavos, dataReferencia: c.dataReferencia },
        { cancelado: true },
        motivo,
      );
      return this.obter(id);
    });
  }

  /** Custo de aquisição e de formação do animal, com o estado de apuração e a composição. */
  custoDoAnimal(animalId: string): CustoDoAnimal {
    const animal = this.ctx.animais.obter(animalId);
    if (!animal) throw naoEncontrado('Animal não encontrado.');
    const compra = this.ctx.negociacao.itemAtivoDoAnimal(animalId, 'compra');
    const venda = this.ctx.negociacao.itemAtivoDoAnimal(animalId, 'venda');
    const acessorios = this.ctx.negociacao.acessoriosDoAnimal(animalId);
    const anteriores = this.ctx.negociacao
      .listarCustosAnteriores({
        propriedadeId: animal.propriedadeId,
        animalId,
        incluirCancelados: false,
      })
      .map((c) => this.paraApi(c));
    const valoresAnteriores = this.ctx.negociacao.custosAnterioresDoAnimal(animalId);
    const custo = apurarAquisicaoEFormacao({
      origem: animal.origem,
      aquisicaoAlocadaCentavos: compra ? compra.valorAlocadoCentavos : null,
      custosAnterioresCentavos: valoresAnteriores,
      acessoriosCentavos: acessorios.map((a) => a.valorCentavos),
    });
    const negociacao = compra ? this.ctx.negociacao.obterNegociacao(compra.negociacaoId) : null;
    const negVenda = venda ? this.ctx.negociacao.obterNegociacao(venda.negociacaoId) : null;
    return {
      animalId,
      identificacao: animal.identificacao,
      origem: animal.origem,
      aquisicao: {
        situacao: custo.aquisicao.situacao,
        valorCentavos: custo.aquisicao.valorCentavos,
        negociacao: negociacao
          ? { id: negociacao.id, data: negociacao.data, fornecedor: negociacao.pessoaNome }
          : null,
      },
      formacao: custo.formacao,
      custosAnteriores: anteriores,
      acessorios: acessorios.map((a) => ({ lancamentoId: a.id, valorCentavos: a.valorCentavos })),
      apuracao: {
        estado: custo.apuracao.estado,
        valorConhecidoCentavos: custo.apuracao.valorConhecidoCentavos,
        componentesConhecidos: custo.apuracao.componentesConhecidos,
        componentesNaoApurados:
          custo.apuracao.componentesNaoApurados + custo.apuracao.componentesDesconhecidos,
      },
      venda:
        venda && negVenda
          ? {
              negociacaoId: negVenda.id,
              data: negVenda.data,
              valorAlocadoCentavos: venda.valorAlocadoCentavos,
            }
          : null,
      observacao:
        'Este valor reúne só a aquisição, o custo anterior informado e os acessórios lançados direto ao animal. Alimentação, sanidade, a parte do animal nos custos de lote e os rateios aparecem no custo completo (Financeiro > Custos por lote e animal), sem duplicar o que está aqui.',
    };
  }
}
