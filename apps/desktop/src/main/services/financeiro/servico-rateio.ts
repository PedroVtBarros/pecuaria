import {
  apuracaoDeContagens,
  diasEntre,
  dividirProporcional,
  pesosPorAnimalDias,
  pesosPorCabecas,
  pesosPorPeso,
  validarPesosManuais,
  type CriterioRateio,
} from '@pecuaria/domain';
import type {
  CustoCompartilhado,
  DadosRateioValidados,
  DestinoDoRateio,
  PendentesDeRateio,
  PreviaDeRateio,
  PreviaRateioValidada,
  RateioDetalhe,
  RevisaoRateioValidada,
  ResumoDeRateio,
} from '@pecuaria/shared-types';
import type { LinhaRateio } from '@pecuaria/database';
import {
  invalido,
  naoEncontrado,
  operacaoInvalida,
  type ContextoRebanho,
} from '../rebanho/contexto';
import { PresencaNosLotes, type ServicoApropriacao } from './servico-apropriacao';

const LIMITE_PENDENTES = 200;
const TIPOS_CONSUMO_RATEAVEL = ['saida_consumo', 'saida_perda', 'ajuste_saida'];

type OrigemTipo = 'lancamento' | 'movimentacao_estoque';

interface Parametros {
  propriedadeId: string;
  origemTipo: OrigemTipo;
  origemId: string;
  criterio: CriterioRateio;
  dataBase: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  idadeMaximaPesagemDias: number | null;
  manual: readonly { tipo: 'lote' | 'animal'; id: string; peso: number }[];
}

interface OrigemResolvida {
  propriedadeId: string;
  data: string;
  descricao: string;
  /** `null`: custo desconhecido (valoração incompleta do estoque). */
  valorCentavos: number | null;
  ativa: boolean;
  /** Por que a origem não aceita rateio hoje; `null` quando aceita. */
  motivoInelegivel: string | null;
  /** Id gravado no rateio: o lançamento, ou o movimento vigente da cadeia de correções. */
  idVigente: string;
}

interface DestinoCalculado {
  tipo: 'lote' | 'animal';
  id: string;
  rotulo: string;
  peso: number;
  base: string;
}

const chave = (d: { tipo: string; id: string }) => `${d.tipo}:${d.id}`;

/**
 * Rateio de custos compartilhados entre lotes e animais (entrega 4E). O rateio é uma decisão
 * explícita do usuário e grava só os PESOS dos destinos; o valor de cada um é calculado a cada
 * leitura, por divisão proporcional exata, a partir do valor atual da origem. Revisar cria uma
 * versão nova e cancela a anterior com motivo; nada é apagado. Um custo nunca tem dois rateios
 * ativos.
 */
export class ServicoRateio {
  constructor(
    private readonly ctx: ContextoRebanho,
    private readonly apropriacao: ServicoApropriacao,
  ) {}

  private exigirPropriedade(id: string) {
    if (!this.ctx.propriedades.obter(id)) throw naoEncontrado('Propriedade não encontrada.');
  }

  // ---- Origem -------------------------------------------------------------------------------
  private resolverOrigem(tipo: OrigemTipo, origemId: string): OrigemResolvida | null {
    if (tipo === 'lancamento') {
      const o = this.ctx.apropriacao.origemLancamento(origemId);
      if (!o) return null;
      let motivo: string | null = null;
      if (!o.ativo) motivo = 'O lançamento está cancelado.';
      else if (o.natureza !== 'despesa') motivo = 'Só despesas podem ser rateadas.';
      else if (o.origemTipo !== 'manual')
        motivo = 'Este lançamento é gerenciado por outro módulo e já tem destino próprio.';
      else if (o.destinoTipo !== 'propriedade' && o.destinoTipo !== 'nenhum')
        motivo =
          'O lançamento já tem lote ou animal como destino; rateio só vale para custo da propriedade.';
      else if (o.tratamento !== 'resultado' && o.tratamento !== 'ativo_animal')
        motivo = 'Compras para estoque viram custo no consumo; rateie o consumo, não a compra.';
      else {
        const centro = this.ctx.producao.centroDoLancamento(origemId);
        if (centro)
          motivo = `O custo está no centro de produção "${centro.nome}": chega aos animais pelo consumo do item produzido.`;
      }
      return {
        propriedadeId: o.propriedadeId,
        data: o.data,
        descricao: o.descricao,
        valorCentavos: o.valorCentavos,
        ativa: o.ativo,
        motivoInelegivel: motivo,
        idVigente: origemId,
      };
    }
    const vigente = this.ctx.rateio.movimentoVigente(origemId);
    if (!vigente) return null;
    const o = this.ctx.apropriacao.origemConsumo(vigente.id);
    if (!o) return null;
    let motivo: string | null = null;
    if (!o.ativo) motivo = 'O consumo está cancelado.';
    else if (!TIPOS_CONSUMO_RATEAVEL.includes(o.tipo))
      motivo = 'Este tipo de movimento não é consumo.';
    else if (o.manejoId)
      motivo =
        'O consumo pertence a um registro sanitário e já é dividido entre os animais tratados.';
    else if (o.destino !== 'propriedade')
      motivo =
        'O consumo já tem lote ou animal como destino; rateio só vale para consumo da propriedade.';
    else {
      const centro = this.ctx.producao.centroDoConsumo(vigente.id);
      if (centro)
        motivo = `O custo está no centro de produção "${centro.nome}": chega aos animais pelo consumo do item produzido.`;
    }
    return {
      propriedadeId: o.propriedadeId,
      data: o.data,
      descricao: o.descricao,
      valorCentavos: o.custoCentavos,
      ativa: o.ativo,
      motivoInelegivel: motivo,
      idVigente: vigente.id,
    };
  }

  /** Rateio ativo que já distribui esta origem (considera a cadeia de correções do estoque). */
  private rateioAtivoDa(
    propriedadeId: string,
    tipo: OrigemTipo,
    idVigente: string,
  ): LinhaRateio | null {
    for (const r of this.ctx.rateio.listarRateios(propriedadeId, false)) {
      if (r.origemTipo !== tipo) continue;
      if (tipo === 'lancamento' ? r.origemId === idVigente : this.vigenteDe(r) === idVigente)
        return r;
    }
    return null;
  }
  private vigenteDe(r: LinhaRateio): string | null {
    if (r.origemTipo === 'lancamento') return r.origemId;
    return this.ctx.rateio.movimentoVigente(r.origemId)?.id ?? null;
  }

  // ---- Pesos --------------------------------------------------------------------------------
  private calcularPesos(
    p: Parametros,
    presenca: PresencaNosLotes,
  ): { destinos: DestinoCalculado[]; erros: string[] } {
    const hoje = this.ctx.hoje();
    const erros: string[] = [];
    if (p.dataBase > hoje) erros.push('A data-base não pode ser futura.');
    if (p.periodoFim && p.periodoFim > hoje) erros.push('O período não pode terminar no futuro.');
    if (erros.length > 0) return { destinos: [], erros };

    const lotes = this.ctx.lotes.listar(p.propriedadeId, true);
    const nomes = new Map(lotes.map((l) => [l.id, l.nome]));
    const doLote = (pesos: { id: string; peso: number; base: string }[]): DestinoCalculado[] =>
      pesos.map((x) => ({
        tipo: 'lote',
        id: x.id,
        rotulo: nomes.get(x.id) ?? 'Lote',
        peso: x.peso,
        base: x.base,
      }));

    let destinos: DestinoCalculado[] = [];
    if (p.criterio === 'cabecas') {
      destinos = doLote(
        pesosPorCabecas(
          lotes.map((l) => ({ id: l.id, animais: presenca.presenca(l.id, p.dataBase).length })),
        ),
      );
    } else if (p.criterio === 'animal_dias') {
      if (!p.periodoInicio || !p.periodoFim) return { destinos: [], erros: ['Informe o período.'] };
      destinos = doLote(
        pesosPorAnimalDias(
          lotes.map((l) => ({
            id: l.id,
            animais: presenca.animaisDoLote(l.id).map((a) => a.permanencias),
          })),
          p.periodoInicio,
          p.periodoFim,
        ),
      );
    } else if (p.criterio === 'peso') {
      const rotulos = new Map(presenca.animais.map((a) => [a.id, a.rotulo]));
      const r = pesosPorPeso(
        lotes.map((l) => ({
          id: l.id,
          animais: presenca.presenca(l.id, p.dataBase).map((animalId) => {
            const pes = this.ctx.apropriacao.ultimaPesagemAte(animalId, p.dataBase);
            return {
              id: animalId,
              rotulo: rotulos.get(animalId) ?? animalId,
              pesoG: pes?.pesoG ?? null,
              idadeDias: pes ? diasEntre(pes.data, p.dataBase) : null,
            };
          }),
        })),
        p.idadeMaximaPesagemDias ?? -1,
      );
      if (r.erros.length > 0) return { destinos: [], erros: r.erros };
      destinos = doLote(r.pesos);
    } else {
      const problemas = validarPesosManuais(p.manual);
      if (problemas.length > 0) return { destinos: [], erros: problemas };
      for (const m of p.manual) {
        if (m.tipo === 'lote') {
          const lote = this.ctx.lotes.obter(m.id);
          if (!lote || lote.propriedadeId !== p.propriedadeId)
            return { destinos: [], erros: ['Lote não encontrado nesta propriedade.'] };
          destinos.push({
            tipo: 'lote',
            id: m.id,
            rotulo: lote.nome,
            peso: m.peso,
            base: 'peso informado',
          });
        } else {
          const animal = this.ctx.animais.obterBasico(m.id);
          if (!animal || animal.excluido || animal.propriedadeId !== p.propriedadeId)
            return { destinos: [], erros: ['Animal não encontrado nesta propriedade.'] };
          const rotulo = presenca.animais.find((a) => a.id === m.id)?.rotulo ?? m.id;
          destinos.push({ tipo: 'animal', id: m.id, rotulo, peso: m.peso, base: 'peso informado' });
        }
      }
    }
    if (destinos.length === 0)
      return {
        destinos: [],
        erros: [
          p.criterio === 'animal_dias'
            ? 'Nenhum animal esteve em lote no período informado.'
            : 'Nenhum lote tinha animais na data-base.',
        ],
      };
    return { destinos, erros: [] };
  }

  private valores(
    valorCentavos: number | null,
    destinos: readonly { tipo: string; id: string; peso: number }[],
  ): Map<string, number | null> {
    if (destinos.length === 0) return new Map();
    if (valorCentavos === null) return new Map(destinos.map((d) => [chave(d), null]));
    return new Map(
      dividirProporcional(
        valorCentavos,
        destinos.map((d) => ({ id: chave(d), peso: d.peso })),
      ).map((x) => [x.id, x.valorCentavos]),
    );
  }
  private comValores(
    valorCentavos: number | null,
    destinos: readonly DestinoCalculado[],
  ): DestinoDoRateio[] {
    const v = this.valores(valorCentavos, destinos);
    return destinos.map((d) => ({ ...d, valorCentavos: v.get(chave(d)) ?? null }));
  }
  private soma(destinos: readonly DestinoDoRateio[]): number | null {
    if (destinos.some((d) => d.valorCentavos === null)) return null;
    return destinos.reduce((s, d) => s + (d.valorCentavos as number), 0);
  }

  // ---- Consultas ----------------------------------------------------------------------------
  pendentes(propriedadeId: string): PendentesDeRateio {
    this.exigirPropriedade(propriedadeId);
    const ativos = this.ctx.rateio.listarRateios(propriedadeId, false);
    const lancamentosRateados = new Set(
      ativos.filter((r) => r.origemTipo === 'lancamento').map((r) => r.origemId),
    );
    const movimentosRateados = new Set(
      ativos
        .filter((r) => r.origemTipo === 'movimentacao_estoque')
        .map((r) => this.vigenteDe(r))
        .filter((x): x is string => x !== null),
    );
    const todos: CustoCompartilhado[] = [
      ...this.ctx.apropriacao
        .lancamentosRateaveis(propriedadeId)
        .filter((l) => !lancamentosRateados.has(l.id))
        .map((l) => ({
          origemTipo: 'lancamento' as const,
          origemId: l.id,
          data: l.data,
          descricao: l.descricao,
          valorCentavos: l.valorCentavos as number | null,
        })),
      ...this.ctx.apropriacao
        .consumosRateaveis(propriedadeId)
        .filter((c) => !movimentosRateados.has(c.id))
        .map((c) => ({
          origemTipo: 'movimentacao_estoque' as const,
          origemId: c.id,
          data: c.data,
          descricao: c.descricao,
          valorCentavos: c.custoCentavos,
        })),
    ].sort((a, b) => b.data.localeCompare(a.data) || a.origemId.localeCompare(b.origemId));
    const conhecidos = todos.filter((c) => c.valorCentavos !== null);
    return {
      propriedadeId,
      itens: todos.slice(0, LIMITE_PENDENTES),
      total: apuracaoDeContagens({
        conhecidoCentavos: conhecidos.reduce((s, c) => s + (c.valorCentavos as number), 0),
        conhecidos: conhecidos.length,
        desconhecidos: todos.length - conhecidos.length,
      }),
      truncado: todos.length > LIMITE_PENDENTES,
    };
  }

  private paraParametros(d: PreviaRateioValidada): Parametros {
    return {
      propriedadeId: d.propriedadeId,
      origemTipo: d.origemTipo,
      origemId: d.origemId,
      criterio: d.criterio,
      dataBase: d.dataBase,
      periodoInicio: d.periodoInicio,
      periodoFim: d.periodoFim,
      idadeMaximaPesagemDias: d.idadeMaximaPesagemDias,
      manual: d.manual,
    };
  }

  private calcular(
    p: Parametros,
    conferirDuplicado: boolean,
  ): { previa: PreviaDeRateio; origem: OrigemResolvida } {
    this.exigirPropriedade(p.propriedadeId);
    const origem = this.resolverOrigem(p.origemTipo, p.origemId);
    if (!origem) throw naoEncontrado('Custo de origem não encontrado.');
    if (origem.propriedadeId !== p.propriedadeId)
      throw naoEncontrado('O custo pertence a outra propriedade.');
    const erros: string[] = [];
    if (origem.motivoInelegivel) erros.push(origem.motivoInelegivel);
    const jaTem = conferirDuplicado
      ? this.rateioAtivoDa(p.propriedadeId, p.origemTipo, origem.idVigente)
      : null;
    if (jaTem)
      erros.push('Este custo já tem rateio ativo. Revise o rateio existente ou cancele-o antes.');
    const presenca = new PresencaNosLotes(this.ctx, p.propriedadeId);
    const calculo = this.calcularPesos(p, presenca);
    erros.push(...calculo.erros);
    const destinos = this.comValores(origem.valorCentavos, calculo.destinos);
    return {
      origem,
      previa: {
        origem: {
          data: origem.data,
          descricao: origem.descricao,
          valorCentavos: origem.valorCentavos,
          ativa: origem.ativa,
        },
        destinos,
        erros,
        somaCentavos: destinos.length > 0 ? this.soma(destinos) : null,
      },
    };
  }

  previa(d: PreviaRateioValidada): PreviaDeRateio {
    return this.calcular(this.paraParametros(d), false).previa;
  }

  // ---- Gravação -----------------------------------------------------------------------------
  private gravar(
    p: Parametros,
    origem: OrigemResolvida,
    destinos: readonly DestinoCalculado[],
    requisicaoId: string,
    motivo: string,
    substituiId: string | null,
  ): string {
    const id = this.ctx.gerarId();
    const agora = this.ctx.agora();
    this.ctx.rateio.inserirRateio(
      {
        id,
        propriedadeId: p.propriedadeId,
        origemTipo: p.origemTipo,
        origemId: origem.idVigente,
        criterio: p.criterio,
        dataBase: p.dataBase,
        periodoInicio: p.criterio === 'animal_dias' ? p.periodoInicio : null,
        periodoFim: p.criterio === 'animal_dias' ? p.periodoFim : null,
        idadeMaximaPesagemDias: p.criterio === 'peso' ? p.idadeMaximaPesagemDias : null,
        motivo,
        substituiId,
        requisicaoId,
      },
      agora,
    );
    for (const d of destinos)
      this.ctx.rateio.inserirItem(
        {
          id: this.ctx.gerarId(),
          rateioId: id,
          loteId: d.tipo === 'lote' ? d.id : null,
          animalId: d.tipo === 'animal' ? d.id : null,
          pesoRelativo: d.peso,
          baseDescricao: d.base,
        },
        agora,
      );
    this.ctx.registrarHistorico(
      'rateio_custo',
      id,
      'criacao',
      null,
      {
        origemTipo: p.origemTipo,
        origemId: origem.idVigente,
        criterio: p.criterio,
        dataBase: p.dataBase,
        periodoInicio: p.periodoInicio,
        periodoFim: p.periodoFim,
        idadeMaximaPesagemDias: p.idadeMaximaPesagemDias,
        valorNoMomentoCentavos: origem.valorCentavos,
        substituiId,
        destinos: destinos.map((d) => ({ tipo: d.tipo, id: d.id, peso: d.peso, base: d.base })),
      },
      motivo,
    );
    return id;
  }

  private mesmoConteudo(r: LinhaRateio, p: Parametros): boolean {
    return (
      r.propriedadeId === p.propriedadeId &&
      r.criterio === p.criterio &&
      r.dataBase === p.dataBase &&
      r.periodoInicio === (p.criterio === 'animal_dias' ? p.periodoInicio : null) &&
      r.periodoFim === (p.criterio === 'animal_dias' ? p.periodoFim : null) &&
      r.idadeMaximaPesagemDias === (p.criterio === 'peso' ? p.idadeMaximaPesagemDias : null)
    );
  }

  criar(d: DadosRateioValidados): RateioDetalhe {
    return this.ctx.transacao(() => {
      const p = this.paraParametros(d);
      const existente = this.ctx.rateio.rateioPorRequisicao(d.requisicaoId);
      if (existente) {
        const origemIgual =
          existente.origemTipo === p.origemTipo &&
          (p.origemTipo === 'lancamento'
            ? existente.origemId === p.origemId
            : this.vigenteDe(existente) === this.ctx.rateio.movimentoVigente(p.origemId)?.id);
        if (existente.cancelado || !origemIgual || !this.mesmoConteudo(existente, p))
          throw invalido([
            'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita o rateio.',
          ]);
        return this.detalhe(existente.id, false);
      }
      const { previa, origem } = this.calcular(p, true);
      if (previa.erros.length > 0) throw invalido(previa.erros);
      const id = this.gravar(p, origem, previa.destinos, d.requisicaoId, d.motivo, null);
      return this.detalhe(id, false);
    });
  }

  revisar(d: RevisaoRateioValidada): RateioDetalhe {
    return this.ctx.transacao(() => {
      const antigo = this.ctx.rateio.obterRateio(d.id);
      if (!antigo) throw naoEncontrado('Rateio não encontrado.');
      const p: Parametros = {
        propriedadeId: antigo.propriedadeId,
        origemTipo: antigo.origemTipo,
        origemId: antigo.origemId,
        criterio: d.criterio,
        dataBase: d.dataBase,
        periodoInicio: d.periodoInicio,
        periodoFim: d.periodoFim,
        idadeMaximaPesagemDias: d.idadeMaximaPesagemDias,
        manual: d.manual,
      };
      const existente = this.ctx.rateio.rateioPorRequisicao(d.requisicaoId);
      if (existente) {
        if (
          existente.substituiId !== d.id ||
          existente.cancelado ||
          !this.mesmoConteudo(existente, p)
        )
          throw invalido([
            'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita a revisão.',
          ]);
        return this.detalhe(existente.id, false);
      }
      if (antigo.cancelado) throw operacaoInvalida('Só um rateio ativo pode ser revisado.');
      const origem = this.resolverOrigem(antigo.origemTipo, antigo.origemId);
      if (!origem) throw naoEncontrado('Custo de origem não encontrado.');
      // A versão antiga é cancelada antes de calcular: ela deixa de contar como "rateio ativo".
      const presenca = new PresencaNosLotes(this.ctx, p.propriedadeId);
      const calculo = this.calcularPesos(p, presenca);
      const erros = [
        ...(origem.motivoInelegivel
          ? [`${origem.motivoInelegivel} Cancele este rateio em vez de revisá-lo.`]
          : []),
        ...calculo.erros,
      ];
      if (erros.length > 0) throw invalido(erros);
      this.ctx.rateio.cancelarRateio(
        antigo.id,
        `Substituído por revisão: ${d.motivo}`,
        this.ctx.agora(),
      );
      this.ctx.registrarHistorico(
        'rateio_custo',
        antigo.id,
        'cancelamento',
        { criterio: antigo.criterio, dataBase: antigo.dataBase },
        { cancelado: true, motivo: 'revisao' },
        d.motivo,
      );
      const id = this.gravar(p, origem, calculo.destinos, d.requisicaoId, d.motivo, antigo.id);
      return this.detalhe(id, false);
    });
  }

  cancelar(id: string, motivo: string): RateioDetalhe {
    return this.ctx.transacao(() => {
      const r = this.ctx.rateio.obterRateio(id);
      if (!r) throw naoEncontrado('Rateio não encontrado.');
      if (r.cancelado) throw operacaoInvalida('O rateio já está cancelado.');
      this.ctx.rateio.cancelarRateio(id, motivo, this.ctx.agora());
      this.ctx.registrarHistorico(
        'rateio_custo',
        id,
        'cancelamento',
        { criterio: r.criterio, dataBase: r.dataBase },
        { cancelado: true },
        motivo,
      );
      return this.detalhe(id, false);
    });
  }

  listar(f: { propriedadeId: string; incluirCancelados: boolean }): ResumoDeRateio[] {
    this.exigirPropriedade(f.propriedadeId);
    return this.ctx.rateio.listarRateios(f.propriedadeId, f.incluirCancelados).map((r) => {
      const origem = this.resolverOrigem(r.origemTipo, r.origemId);
      return {
        id: r.id,
        origemTipo: r.origemTipo,
        criterio: r.criterio,
        descricao: origem?.descricao ?? 'Custo removido',
        data: origem?.data ?? r.dataBase,
        valorCentavos: origem?.valorCentavos ?? null,
        destinos: this.ctx.rateio.itensDoRateio(r.id).length,
        cancelado: r.cancelado,
        origemCancelada: origem ? !origem.ativa : true,
        criadoEm: r.criadoEm,
      };
    });
  }

  /** Detalhe completo, com a conferência de que a base ainda é a de hoje (consulta isolada). */
  obter(id: string): RateioDetalhe {
    return this.detalhe(id, true);
  }

  /**
   * `conferirBase = false` (logo após gravar): a base acabou de ser calculada, então "mudou" é
   * falso para critério automático, sem recalcular a presença nos lotes.
   */
  private detalhe(id: string, conferirBase: boolean): RateioDetalhe {
    const r = this.ctx.rateio.obterRateio(id);
    if (!r) throw naoEncontrado('Rateio não encontrado.');
    const origem = this.resolverOrigem(r.origemTipo, r.origemId);
    const itens = this.ctx.rateio.itensDoRateio(id);
    const gravados: DestinoCalculado[] = itens.map((i) => ({
      tipo: i.loteId ? 'lote' : 'animal',
      id: (i.loteId ?? i.animalId) as string,
      rotulo: (i.loteId ? i.loteNome : i.animalIdentificacao) ?? '',
      peso: i.pesoRelativo,
      base: i.baseDescricao,
    }));
    const destinos = this.comValores(origem?.valorCentavos ?? null, gravados);
    let baseMudou: boolean | null = null;
    if (!r.cancelado && r.criterio !== 'manual' && !conferirBase) baseMudou = false;
    else if (!r.cancelado && r.criterio !== 'manual') {
      const hoje = this.calcularPesos(
        {
          propriedadeId: r.propriedadeId,
          origemTipo: r.origemTipo,
          origemId: r.origemId,
          criterio: r.criterio,
          dataBase: r.dataBase,
          periodoInicio: r.periodoInicio,
          periodoFim: r.periodoFim,
          idadeMaximaPesagemDias: r.idadeMaximaPesagemDias,
          manual: [],
        },
        new PresencaNosLotes(this.ctx, r.propriedadeId),
      );
      const atual = new Map(hoje.destinos.map((x) => [chave(x), x.peso]));
      baseMudou =
        hoje.erros.length > 0 ||
        atual.size !== gravados.length ||
        gravados.some((g) => atual.get(chave(g)) !== g.peso);
    }
    return {
      id: r.id,
      propriedadeId: r.propriedadeId,
      origemTipo: r.origemTipo,
      origemId: r.origemId,
      criterio: r.criterio,
      dataBase: r.dataBase,
      periodoInicio: r.periodoInicio,
      periodoFim: r.periodoFim,
      idadeMaximaPesagemDias: r.idadeMaximaPesagemDias,
      motivo: r.motivo,
      cancelado: r.cancelado,
      motivoCancelamento: r.motivoCancelamento,
      criadoEm: r.criadoEm,
      origem: {
        data: origem?.data ?? r.dataBase,
        descricao: origem?.descricao ?? 'Custo removido',
        valorCentavos: origem?.valorCentavos ?? null,
        ativa: origem?.ativa ?? false,
      },
      destinos,
      somaCentavos: destinos.length > 0 ? this.soma(destinos) : null,
      origemCancelada: origem ? !origem.ativa : true,
      baseMudou,
      versoes: this.ctx.rateio.versoes(id).map((v) => ({
        id: v.id,
        criadoEm: v.criadoEm,
        criterio: v.criterio,
        cancelado: v.cancelado,
        motivo: v.motivo,
      })),
    };
  }
}
