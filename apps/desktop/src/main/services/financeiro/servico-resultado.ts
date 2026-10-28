import {
  CATEGORIAS_CUSTO,
  GRAMAS_POR_ARROBA,
  apropriar,
  apurarComponentes,
  apurarCustoPorKgGanho,
  apurarMargemBruta,
  apurarPontoDeEquilibrio,
  apurarResultado,
  apuracaoDe,
  dividirArredondado,
  projetarResultado,
  somarApuracoes,
  totalizarPorClassificacao,
  valorPorArroba,
  type AnimalComGanho,
  type Apuracao,
  type BaseDeUnidade,
  type CategoriaCusto,
  type LinhaDeCusto,
  type ParteClassificada,
  type ParteClassificadaDaLinha,
  type Resultado,
} from '@pecuaria/domain';
import type {
  ChaveConciliacao,
  CompletudeResultado,
  Conciliacao,
  CustoPorKgGanhoApi,
  CustoSemClassificacao,
  IndicadorPorArroba,
  IndicadoresDoPeriodo,
  LinhaConciliacao,
  PeriodoValidado,
  PontoDeEquilibrioApi,
  ProjecaoApi,
  ProjecaoValidada,
  RealizadoDoPeriodo,
  ResultadoAgrupado,
  ResultadoDoAnimal,
  ResultadoDoPeriodo,
} from '@pecuaria/shared-types';
import type { SaidaParaResultado, VendaParaResultado } from '@pecuaria/database';
import { invalido, naoEncontrado, type ContextoRebanho } from '../rebanho/contexto';
import type { ServicoApropriacao } from './servico-apropriacao';

const LIMITE_SEM_CLASSIFICACAO = 50;
export const ROTULO_PROJECAO =
  'Projeção por premissas suas, não é dado apurado. Nada é gravado e o valor não entra em nenhum total.';

const ROTULOS_CONCILIACAO: Record<ChaveConciliacao, { rotulo: string; explicacao: string }> = {
  venda_animais: {
    rotulo: 'Venda de animais',
    explicacao:
      'Competência: vendas com data no período. Caixa: recebimentos no período, inclusive de vendas anteriores; vendas a receber ficam fora do caixa.',
  },
  outras_receitas: {
    rotulo: 'Leite e outras receitas',
    explicacao:
      'Receitas lançadas com competência no período contra o que foi recebido no período.',
  },
  despesas: {
    rotulo: 'Despesas e serviços',
    explicacao:
      'Competência: despesas do período (inclusive as não alocadas e os serviços sanitários). Caixa: pagamentos no período, inclusive de despesas de outros períodos.',
  },
  insumos: {
    rotulo: 'Insumos e estoque',
    explicacao:
      'Competência: custo do que foi consumido do estoque no período (pelo custo médio). Caixa: pagamentos de compras para estoque. A diferença é o que ficou (ou saiu) do estoque e o que ainda não foi pago; estoque inicial e produção própria não têm pagamento.',
  },
  animais: {
    rotulo: 'Aquisição de animais',
    explicacao:
      'Competência: aquisição e custo anterior dos animais que saíram do rebanho no período. Caixa: pagamentos de compras de animais e acessórios. Animal comprado e ainda no rebanho é ativo, não custo; custo anterior informado nunca teve pagamento.',
  },
  producao: {
    rotulo: 'Produção própria',
    explicacao:
      'Despesas pagas que estão em centros de produção: o custo volta como consumo do item produzido (linha de insumos).',
  },
  fora_resultado: {
    rotulo: 'Fora do resultado',
    explicacao:
      'Transferências, empréstimos e outros movimentos de caixa que não são receita nem custo.',
  },
};

type Periodo = { dataInicial: string; dataFinal: string };
const dentro = (data: string, p: Periodo) => data >= p.dataInicial && data <= p.dataFinal;
const capitalizavel = (l: LinhaDeCusto) =>
  (l.categoria === 'aquisicao' || l.categoria === 'custo_anterior') && l.destino.tipo === 'animal';
const partesDa = (l: LinhaDeCusto): readonly ParteClassificadaDaLinha[] =>
  l.partes ?? [
    { classificacao: 'nao_classificado', grupo: 'despesas', valorCentavos: l.valorCentavos },
  ];
const naoApurado = (): Apuracao => apurarComponentes([{ tipo: 'nao_apurado' }]);
const estadoDe = (a: Apuracao): 'completo' | 'parcial' =>
  a.estado === 'completa' ? 'completo' : 'parcial';
const completude = (r: Resultado): CompletudeResultado => ({
  valorConhecidoCentavos: r.valorConhecidoCentavos,
  resultadoCentavos: r.resultadoCentavos,
  receitasDesconhecidas: r.receitasDesconhecidas,
  estado: r.estado,
  limite: r.limite,
});
/**
 * Tipo de cada saída: devolução ao fornecedor e venda negociada pela própria movimentação; sem
 * elas, morte e descarte como registrados no animal; o resto é venda sem negociação.
 */
const tipoDaSaida = (s: SaidaParaResultado): ResultadoDoAnimal['saida'] => {
  if (s.devolucaoCompraCentavos !== null) return 'devolvido_fornecedor';
  if (s.venda) return 'vendido';
  return s.status === 'morto' || s.status === 'descartado' ? s.status : 'vendido';
};
/**
 * Receita de uma saída (regra única): venda negociada = valor alocado, conhecido mesmo se ainda não
 * recebido; devolução ao fornecedor = valor recuperado (não é venda); morte sem venda = zero
 * conhecido (perda); venda ou descarte sem negociação = desconhecida.
 */
const receitaDaSaida = (s: SaidaParaResultado): number | null =>
  s.devolucaoCompraCentavos ??
  s.venda?.valorAlocadoCentavos ??
  (tipoDaSaida(s) === 'morto' ? 0 : null);
type EventoDeCusto = { chave: string; animalId: string; data: string };

/**
 * Resultado, indicadores, conciliação e projeção (entrega 4G). Tudo é derivado das mesmas linhas de
 * custo da apropriação (4E/4F) e dos lançamentos, pagamentos e vendas; nada é gravado. Caixa,
 * custo apropriado e resultado ficam em visões separadas e nunca são somados entre si.
 */
export class ServicoResultado {
  constructor(
    private readonly ctx: ContextoRebanho,
    private readonly apropriacao: ServicoApropriacao,
  ) {}

  private exigirPropriedade(id: string) {
    if (!this.ctx.propriedades.obter(id)) throw naoEncontrado('Propriedade não encontrada.');
  }

  /**
   * Linhas de custo do período: as do período (sem as capitalizadas) + as capitalizadas (aquisição,
   * custo anterior) de cada saída do período, até a data da saída. Cada animal devolvido pelo
   * comprador no período estorna o que foi baixado na saída da venda (volta a ser ativo).
   */
  private contexto(f: PeriodoValidado) {
    this.exigirPropriedade(f.propriedadeId);
    const base = this.apropriacao.linhasDeCusto(f.propriedadeId);
    const saidas = this.ctx.resultado.saidas(f.propriedadeId);
    const saidasNoPeriodo = saidas.filter((s) => dentro(s.data, f));
    const saidaPorMovimentacao = new Map(saidas.map((s) => [s.movimentacaoId, s]));
    const devolucoes = this.ctx.devolucao.paraResultado(f.propriedadeId);
    const retornosNoPeriodo = devolucoes.filter((d) => d.tipo === 'venda' && dentro(d.data, f));
    const capitalizaveis = new Map<string, LinhaDeCusto[]>();
    for (const l of base.linhas)
      if (capitalizavel(l)) {
        const id = (l.destino as { id: string }).id;
        capitalizaveis.set(id, [...(capitalizaveis.get(id) ?? []), l]);
      }
    const doPeriodo = base.linhas.filter((l) => !capitalizavel(l) && dentro(l.data, f));
    for (const sd of saidasNoPeriodo)
      for (const l of capitalizaveis.get(sd.animalId) ?? [])
        if (l.data <= sd.data) doPeriodo.push(l);
    let estorno = 0;
    for (const r of retornosNoPeriodo) {
      const limite = saidaPorMovimentacao.get(r.saidaOriginalId ?? '')?.data ?? r.dataNegociacao;
      for (const l of capitalizaveis.get(r.animalId) ?? [])
        if (l.data <= limite && l.valorCentavos !== null) estorno += l.valorCentavos;
    }
    const semBase = saidasNoPeriodo.filter((sd) => !base.comBase.has(sd.animalId)).length;
    const semReceita = saidasNoPeriodo.filter((sd) => receitaDaSaida(sd) === null).length;
    return {
      ...base,
      saidas,
      saidasNoPeriodo,
      saidaPorMovimentacao,
      retornosNoPeriodo,
      doPeriodo,
      estorno,
      semBase,
      semReceita,
    };
  }

  private custoDasLinhas(linhas: readonly LinhaDeCusto[], semBase: number): Apuracao {
    return somarApuracoes([
      apurarComponentes(
        linhas.map((l) =>
          l.valorCentavos === null
            ? ({ tipo: 'desconhecido' } as const)
            : ({ tipo: 'conhecido', valorCentavos: l.valorCentavos } as const),
        ),
      ),
      ...Array.from({ length: semBase }, naoApurado),
    ]);
  }

  private receitas(propriedadeId: string, p: Periodo) {
    const r = {
      vendaAnimaisCentavos: 0,
      devolucoesVendaCentavos: 0,
      leiteCentavos: 0,
      outrasCentavos: 0,
      recuperadoDevolucaoCompraCentavos: 0,
      totalCentavos: 0,
      quantidade: 0,
    };
    for (const x of this.ctx.resultado.receitas(propriedadeId)) {
      if (!dentro(x.data, p)) continue;
      // Devolução de venda deduz a receita (nunca é receita positiva); devolução de compra é o valor
      // recuperado do fornecedor, separado da venda de animais.
      if (x.tipo === 'devolucao') {
        if (x.natureza === 'despesa') r.devolucoesVendaCentavos += x.valorCentavos;
        else r.recuperadoDevolucaoCompraCentavos += x.valorCentavos;
      } else if (x.origemTipo === 'negociacao_animal' || x.grupo === 'animais')
        r.vendaAnimaisCentavos += x.valorCentavos;
      else if (x.grupo === 'leite') r.leiteCentavos += x.valorCentavos;
      else r.outrasCentavos += x.valorCentavos;
      r.quantidade += 1;
    }
    r.totalCentavos =
      r.vendaAnimaisCentavos -
      r.devolucoesVendaCentavos +
      r.leiteCentavos +
      r.outrasCentavos +
      r.recuperadoDevolucaoCompraCentavos;
    return r;
  }

  private partesDoPeriodo(linhas: readonly LinhaDeCusto[]): ParteClassificada[] {
    return linhas.flatMap((l) =>
      partesDa(l).map((p) => ({ classificacao: p.classificacao, valorCentavos: p.valorCentavos })),
    );
  }

  // ---- Resultado do período (competência e caixa lado a lado) -------------------------------
  periodo(f: PeriodoValidado): ResultadoDoPeriodo {
    const c = this.contexto(f);
    const custo = this.custoDasLinhas(c.doPeriodo, c.semBase);
    const porCategoria: Partial<Record<CategoriaCusto, number>> = {};
    let baixa = 0;
    for (const l of c.doPeriodo) {
      if (l.valorCentavos === null) continue;
      porCategoria[l.categoria] = (porCategoria[l.categoria] ?? 0) + l.valorCentavos;
      if (capitalizavel(l)) baixa += l.valorCentavos;
    }
    const naoAlocado = apropriar(c.doPeriodo, c.presenca.presenca).naoAlocado.conhecidoCentavos;
    const { quantidade, ...receitas } = this.receitas(f.propriedadeId, f);
    const resultado = apurarResultado(
      {
        conhecidaCentavos: receitas.totalCentavos,
        conhecidas: quantidade,
        desconhecidas: c.semReceita,
      },
      custo,
      c.estorno,
    );
    let entradas = 0;
    let saidasCaixa = 0;
    for (const g of this.ctx.resultado.pagamentos(f.propriedadeId, f.dataInicial, f.dataFinal)) {
      if (g.natureza === 'receita') entradas += g.valorCentavos;
      else saidasCaixa += g.valorCentavos;
    }
    // Margem bruta: depende da classificação (D-E); os custos sem classificação são listados.
    const partes = this.partesDoPeriodo(c.doPeriodo);
    const mb = apurarMargemBruta(receitas.totalCentavos, partes);
    const totais = totalizarPorClassificacao(partes);
    const semClassificacao: CustoSemClassificacao[] = [];
    for (const l of c.doPeriodo) {
      const nc = partesDa(l).filter((p) => p.classificacao === 'nao_classificado');
      if (nc.length === 0) continue;
      semClassificacao.push({
        data: l.data,
        descricao: l.descricao,
        valorCentavos: nc.some((p) => p.valorCentavos === null)
          ? null
          : nc.reduce((s, p) => s + (p.valorCentavos as number), 0),
        origem: { tipo: l.origemTipo, id: l.origemId },
      });
    }
    semClassificacao.sort((a, b) => b.data.localeCompare(a.data));
    const motivos = [...mb.motivos];
    if (c.semReceita > 0)
      motivos.push(`${c.semReceita} venda(s) ou descarte(s) do período sem receita registrada.`);
    if (c.semBase > 0)
      motivos.push(
        `${c.semBase} animal(is) saíram sem custo de aquisição ou custo anterior informado.`,
      );
    return {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      competencia: {
        receitas,
        custo,
        porCategoria: CATEGORIAS_CUSTO.filter((k) => (porCategoria[k] ?? 0) > 0).map(
          (categoria) => ({
            categoria,
            valorCentavos: porCategoria[categoria] as number,
          }),
        ),
        baixaDeAnimaisCentavos: baixa,
        estornoDeBaixaCentavos: c.estorno,
        naoAlocadoCentavos: naoAlocado,
        animaisSemBase: c.semBase,
        ...completude(resultado),
      },
      caixa: {
        entradasCentavos: entradas,
        saidasCentavos: saidasCaixa,
        saldoCentavos: entradas - saidasCaixa,
      },
      margemBruta: {
        receitaCentavos: mb.receitaCentavos,
        variaveisCentavos: mb.variaveisCentavos,
        fixosCentavos: totais.fixoCentavos,
        margemCentavos: mb.margemCentavos,
        estado: motivos.length === 0 ? 'calculada' : 'parcial',
        coberturaCentavos: mb.coberturaCentavos,
        motivos,
        semClassificacao: semClassificacao.slice(0, LIMITE_SEM_CLASSIFICACAO),
        semClassificacaoTruncada: semClassificacao.length > LIMITE_SEM_CLASSIFICACAO,
      },
    };
  }

  // ---- Resultado realizado por animal e por lote ---------------------------------------------
  /** Custo acumulado de cada animal até a data indicada (inclusive). */
  private custosAte(
    c: ReturnType<ServicoResultado['contexto']>,
    limites: Map<string, string>,
  ): Map<string, Apuracao> {
    const r = apropriar(c.linhas, c.presenca.presenca, undefined, (id) => limites.get(id) ?? null);
    const saida = new Map<string, Apuracao>();
    for (const [id] of limites)
      saida.set(id, this.apropriacao.apuracaoDoAnimal(r.porAnimalAte.get(id), c.comBase.has(id)));
    return saida;
  }

  /** Custo acumulado por evento (o mesmo animal pode ter mais de um evento no período). */
  private custosAteEventos(
    c: ReturnType<ServicoResultado['contexto']>,
    eventos: readonly EventoDeCusto[],
  ): Map<string, Apuracao> {
    const resultado = new Map<string, Apuracao>();
    let pendentes = [...eventos];
    while (pendentes.length > 0) {
      const rodada = new Map<string, EventoDeCusto>();
      const resto: EventoDeCusto[] = [];
      for (const e of pendentes) {
        if (rodada.has(e.animalId)) resto.push(e);
        else rodada.set(e.animalId, e);
      }
      const porAnimal = this.custosAte(
        c,
        new Map([...rodada.values()].map((e) => [e.animalId, e.data])),
      );
      for (const e of rodada.values())
        resultado.set(e.chave, porAnimal.get(e.animalId) as Apuracao);
      pendentes = resto;
    }
    return resultado;
  }

  private agrupar(
    itens: readonly ResultadoDoAnimal[],
    loteId: string | null,
    loteNome: string,
  ): ResultadoAgrupado {
    const custo =
      itens.length > 0 ? somarApuracoes(itens.map((i) => i.custo)) : apurarComponentes([]);
    const conhecidas = itens.filter((i) => i.receitaCentavos !== null);
    const receita = conhecidas.reduce((s, i) => s + (i.receitaCentavos as number), 0);
    return {
      loteId,
      loteNome,
      animais: itens.length,
      receitaCentavos: receita,
      custo,
      ...completude(
        apurarResultado(
          {
            conhecidaCentavos: receita,
            conhecidas: conhecidas.length,
            desconhecidas: itens.length - conhecidas.length,
          },
          custo,
        ),
      ),
    };
  }

  realizado(f: PeriodoValidado): RealizadoDoPeriodo {
    const c = this.contexto(f);
    const chaveRetorno = (r: { devolucaoId: string; animalId: string }) =>
      `retorno:${r.devolucaoId}:${r.animalId}`;
    const custos = this.custosAteEventos(c, [
      ...c.saidasNoPeriodo.map((sd) => ({
        chave: sd.movimentacaoId,
        animalId: sd.animalId,
        data: sd.data,
      })),
      ...c.retornosNoPeriodo.map((r) => ({
        chave: chaveRetorno(r),
        animalId: r.animalId,
        data: c.saidaPorMovimentacao.get(r.saidaOriginalId ?? '')?.data ?? r.dataNegociacao,
      })),
    ]);
    const animais: ResultadoDoAnimal[] = c.saidasNoPeriodo.map((sd: SaidaParaResultado) => {
      const receita = receitaDaSaida(sd);
      const custo = custos.get(sd.movimentacaoId) as Apuracao;
      return {
        animalId: sd.animalId,
        identificacao: sd.identificacao,
        saida: tipoDaSaida(sd),
        data: sd.data,
        lote:
          sd.loteOrigemId && sd.loteOrigemNome
            ? { id: sd.loteOrigemId, nome: sd.loteOrigemNome }
            : null,
        receitaCentavos: receita,
        custo,
        ...completude(
          apurarResultado(
            {
              conhecidaCentavos: receita ?? 0,
              conhecidas: receita === null ? 0 : 1,
              desconhecidas: receita === null ? 1 : 0,
            },
            custo,
          ),
        ),
      };
    });
    // Devolução ao fornecedor não é venda: fica fora dos totais e dos lotes, em bloco próprio.
    const comuns = animais.filter((a) => a.saida !== 'devolvido_fornecedor');
    const aoFornecedor = animais.filter((a) => a.saida === 'devolvido_fornecedor');
    const grupos = new Map<string, ResultadoDoAnimal[]>();
    for (const a of comuns) {
      const k = a.lote?.id ?? '';
      grupos.set(k, [...(grupos.get(k) ?? []), a]);
    }
    const porLote = [...grupos.entries()]
      .map(([k, itens]) => this.agrupar(itens, k || null, itens[0]?.lote?.nome ?? 'Sem lote'))
      .sort((a, b) => a.loteNome.localeCompare(b.loteNome, 'pt-BR'));
    const mortos = comuns.filter((a) => a.saida === 'morto');
    const custoFornecedor =
      aoFornecedor.length > 0
        ? somarApuracoes(aoFornecedor.map((a) => a.custo))
        : apurarComponentes([]);
    const recuperado = aoFornecedor.reduce((s2, a) => s2 + (a.receitaCentavos ?? 0), 0);
    return {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      animais,
      porLote,
      totais: {
        ...this.agrupar(comuns, null, 'Total'),
        vendidos: comuns.filter((a) => a.saida === 'vendido').length,
        perdas: mortos.length,
        perdasCentavos: mortos.reduce((s2, a) => s2 + a.custo.valorConhecidoCentavos, 0),
      },
      devolucoesVenda: c.retornosNoPeriodo.map((r) => {
        const custoQueVolta = custos.get(chaveRetorno(r)) as Apuracao;
        return {
          animalId: r.animalId,
          identificacao: r.identificacao,
          data: r.data,
          dataVenda: r.dataNegociacao,
          receitaOriginalCentavos: r.valorOriginalCentavos,
          valorDevolvidoCentavos: r.valorCentavos,
          custoQueVolta,
          efeitoCentavos: custoQueVolta.valorConhecidoCentavos - r.valorCentavos,
        };
      }),
      devolucoesCompra: {
        animais: aoFornecedor.length,
        recuperadoCentavos: recuperado,
        custo: custoFornecedor,
        diferencaCentavos: recuperado - custoFornecedor.valorConhecidoCentavos,
      },
    };
  }

  /** Vendas negociadas cujas saídas são do período (uma por saída, mesmo se depois devolvida). */
  private vendasDoPeriodo(c: ReturnType<ServicoResultado['contexto']>): VendaParaResultado[] {
    return c.saidasNoPeriodo.flatMap((sd) =>
      sd.venda && sd.devolucaoCompraCentavos === null
        ? [{ ...sd.venda, animalId: sd.animalId, movimentacaoId: sd.movimentacaoId, data: sd.data }]
        : [],
    );
  }

  // ---- Indicadores ---------------------------------------------------------------------------
  indicadores(f: PeriodoValidado): IndicadoresDoPeriodo {
    const c = this.contexto(f);
    // Custo de produção do período (sem aquisição nem custo anterior), por animal.
    const producao = c.linhas.filter(
      (l) => dentro(l.data, f) && l.categoria !== 'aquisicao' && l.categoria !== 'custo_anterior',
    );
    const r = apropriar(producao, c.presenca.presenca);
    const pesagens = this.ctx.resultado.pesagens(f.propriedadeId, f.dataInicial, f.dataFinal);
    const porAnimal = new Map<string, typeof pesagens>();
    for (const p of pesagens) porAnimal.set(p.animalId, [...(porAnimal.get(p.animalId) ?? []), p]);
    const medidos: { animalId: string; ganho: AnimalComGanho; metodos: string[] }[] = [];
    for (const [animalId, lista] of porAnimal) {
      if (lista.length < 2) continue;
      const primeira = lista[0]!;
      const ultima = lista[lista.length - 1]!;
      const acc = r.porAnimal.get(animalId);
      medidos.push({
        animalId,
        ganho: {
          custo: acc ? apuracaoDe(acc) : naoApurado(),
          ganhoGramas: ultima.pesoGramas - primeira.pesoGramas,
        },
        metodos: [primeira.metodo, ultima.metodo],
      });
    }
    const medidosIds = new Set(medidos.map((m) => m.animalId));
    const indicador = (lista: typeof medidos, semPesagens: number): CustoPorKgGanhoApi => {
      const metodos: Record<string, number> = {};
      for (const m of lista) for (const x of m.metodos) metodos[x] = (metodos[x] ?? 0) + 1;
      return {
        ...apurarCustoPorKgGanho(lista.map((m) => m.ganho)),
        semPesagens,
        pesagensPorMetodo: metodos,
      };
    };
    const semPesagens = [...r.porAnimal.keys()].filter((id) => !medidosIds.has(id)).length;
    const loteAtual = new Map(c.presenca.animais.map((a) => [a.id, a]));
    const porLoteMap = new Map<string, typeof medidos>();
    for (const m of medidos) {
      const lote = loteAtual.get(m.animalId)?.loteAtualId;
      if (lote) porLoteMap.set(lote, [...(porLoteMap.get(lote) ?? []), m]);
    }
    const nomes = new Map(this.ctx.lotes.listar(f.propriedadeId, true).map((l) => [l.id, l.nome]));

    // Indicadores das vendas do período, por @ de carcaça e de peso vivo (bases nunca convertidas).
    const vendas = this.vendasDoPeriodo(c);
    const custos = this.custosAteEventos(
      c,
      vendas.map((v) => ({ chave: v.movimentacaoId, animalId: v.animalId, data: v.data })),
    );
    const porArroba = (peso: (v: VendaParaResultado) => number | null): IndicadorPorArroba => {
      const com = vendas.filter((v) => peso(v) !== null);
      const gramas = com.reduce((s, v) => s + (peso(v) as number), 0);
      const receita = com.reduce((s, v) => s + v.valorAlocadoCentavos, 0);
      const custo =
        com.length > 0
          ? somarApuracoes(com.map((v) => custos.get(v.movimentacaoId) as Apuracao))
          : apurarComponentes([]);
      const rpa = valorPorArroba(receita, gramas);
      const cpa = valorPorArroba(custo.valorConhecidoCentavos, gramas);
      return {
        animais: com.length,
        gramas,
        receitaCentavos: receita,
        custo,
        receitaPorArrobaCentavos: rpa,
        custoPorArrobaCentavos: cpa,
        margemPorArrobaCentavos: rpa !== null && cpa !== null ? rpa - cpa : null,
        semPeso: vendas.length - com.length,
        estado: com.length === 0 ? 'indisponivel' : estadoDe(custo),
      };
    };

    // Leite: preço médio do litro vendido, só das receitas com litros informados.
    let litros = 0;
    let receitaLeite = 0;
    let semLitros = 0;
    for (const x of this.ctx.resultado.receitas(f.propriedadeId)) {
      if (!dentro(x.data, f) || x.grupo !== 'leite') continue;
      if (x.unidadeQuantidade === 'litro' && x.quantidadeMilesimos) {
        litros += x.quantidadeMilesimos;
        receitaLeite += x.valorCentavos;
      } else semLitros += 1;
    }
    return {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      custoPorKgGanho: indicador(medidos, semPesagens),
      porLote: [...porLoteMap.entries()]
        .map(([loteId, lista]) => ({
          loteId,
          loteNome: nomes.get(loteId) ?? 'Lote',
          ...indicador(lista, 0),
        }))
        .sort((a, b) => a.loteNome.localeCompare(b.loteNome, 'pt-BR')),
      carcaca: porArroba((v) => v.pesoCarcacaGramas),
      vivo: porArroba((v) => v.pesoVivoGramas),
      devolucoesVendaNoPeriodo: c.retornosNoPeriodo.length,
      leite: {
        litrosMilesimos: litros,
        receitaCentavos: receitaLeite,
        precoPorLitroCentavos:
          litros > 0
            ? Number(dividirArredondado(BigInt(receitaLeite) * 1000n, BigInt(litros)))
            : null,
        receitasSemLitros: semLitros,
      },
    };
  }

  pontoDeEquilibrio(f: PeriodoValidado & { base: BaseDeUnidade }): PontoDeEquilibrioApi {
    const c = this.contexto(f);
    const partes = this.partesDoPeriodo(c.doPeriodo);
    const vendas = this.vendasDoPeriodo(c);
    const unidades = (v: VendaParaResultado): number | null => {
      if (f.base === 'cabeca') return 1000;
      if (f.base === 'kg_vivo') return v.pesoVivoGramas;
      const g = f.base === 'arroba_vivo' ? v.pesoVivoGramas : v.pesoCarcacaGramas;
      return g === null
        ? null
        : Number(dividirArredondado(BigInt(g) * 1000n, BigInt(GRAMAS_POR_ARROBA)));
    };
    const com = vendas.filter((v) => unidades(v) !== null);
    const u = com.reduce((s, v) => s + (unidades(v) as number), 0);
    const receita = com.reduce((s, v) => s + v.valorAlocadoCentavos, 0);
    const pe = apurarPontoDeEquilibrio({
      partes,
      receitaDasUnidadesCentavos: receita,
      unidadesMilesimos: u,
    });
    const extras: string[] = [];
    if (vendas.length > com.length)
      extras.push(
        `${vendas.length - com.length} venda(s) do período sem o peso desta base: escolha outra base ou informe o peso.`,
      );
    if (c.semBase > 0)
      extras.push(
        `${c.semBase} animal(is) saíram sem custo de aquisição ou custo anterior informado.`,
      );
    if (c.semReceita > 0)
      extras.push(
        `${c.semReceita} venda(s) ou descarte(s) do período sem receita registrada: registre a venda pela negociação.`,
      );
    if (c.retornosNoPeriodo.length > 0)
      extras.push(
        `${c.retornosNoPeriodo.length} animal(is) devolvido(s) pelo comprador no período: o equilíbrio por unidade vendida não considera devoluções.`,
      );
    const t = totalizarPorClassificacao(partes);
    const motivos = [...pe.motivos, ...extras];
    return {
      base: f.base,
      estado: motivos.length === 0 ? pe.estado : 'indisponivel',
      unidadesMilesimos: motivos.length === 0 ? pe.unidadesMilesimos : null,
      precoMedioCentavos: pe.precoMedioCentavos,
      custoVariavelPorUnidadeCentavos: pe.custoVariavelPorUnidadeCentavos,
      unidadesVendidasMilesimos: u,
      vendasIncluidas: com.length,
      vendasSemPeso: vendas.length - com.length,
      receitaDasUnidadesCentavos: receita,
      fixosCentavos: t.fixoCentavos,
      variaveisCentavos: t.variavelCentavos,
      motivos,
    };
  }

  // ---- Conciliação ---------------------------------------------------------------------------
  conciliacao(f: PeriodoValidado): Conciliacao {
    const c = this.contexto(f);
    const linhas = new Map<ChaveConciliacao, LinhaConciliacao>(
      (Object.keys(ROTULOS_CONCILIACAO) as ChaveConciliacao[]).map((chave) => [
        chave,
        {
          chave,
          ...ROTULOS_CONCILIACAO[chave],
          competencia: {
            receitaCentavos: 0,
            custoCentavos: 0,
            desconhecidos: 0,
            receitasDesconhecidas: 0,
          },
          caixa: { entradasCentavos: 0, saidasCentavos: 0 },
          diferencaCentavos: 0,
        },
      ]),
    );
    const linha = (k: ChaveConciliacao) => linhas.get(k) as LinhaConciliacao;
    linha('venda_animais').competencia.receitasDesconhecidas = c.semReceita;
    let receitasConhecidas = 0;
    let receitaTotal = 0;
    for (const x of this.ctx.resultado.receitas(f.propriedadeId)) {
      if (!dentro(x.data, f)) continue;
      // Devolução de venda deduz a venda de animais; o recuperado em devolução de compra fica na
      // linha da aquisição de animais (não é venda).
      const sinal = x.tipo === 'devolucao' && x.natureza === 'despesa' ? -1 : 1;
      const k: ChaveConciliacao =
        x.tipo === 'devolucao'
          ? x.natureza === 'despesa'
            ? 'venda_animais'
            : 'animais'
          : x.origemTipo === 'negociacao_animal' || x.grupo === 'animais'
            ? 'venda_animais'
            : 'outras_receitas';
      linha(k).competencia.receitaCentavos += sinal * x.valorCentavos;
      receitasConhecidas += 1;
      receitaTotal += sinal * x.valorCentavos;
    }
    let desconhecidos = 0;
    for (const l of c.doPeriodo)
      for (const p of partesDa(l)) {
        const alvo = linha(p.grupo);
        if (p.valorCentavos === null) {
          alvo.competencia.desconhecidos += 1;
          desconhecidos += 1;
        } else alvo.competencia.custoCentavos += p.valorCentavos;
      }
    for (const g of this.ctx.resultado.pagamentos(f.propriedadeId, f.dataInicial, f.dataFinal)) {
      let k: ChaveConciliacao;
      if (g.tipo === 'devolucao') k = g.natureza === 'despesa' ? 'venda_animais' : 'animais';
      else if (g.tratamento === 'fora_resultado') k = 'fora_resultado';
      else if (g.natureza === 'receita')
        k = g.origemTipo === 'negociacao_animal' ? 'venda_animais' : 'outras_receitas';
      else if (g.tratamento === 'estoque') k = 'insumos';
      else if (g.tratamento === 'ativo_animal') k = 'animais';
      else if (g.emCentro) k = 'producao';
      else k = 'despesas';
      if (g.natureza === 'receita') linha(k).caixa.entradasCentavos += g.valorCentavos;
      else linha(k).caixa.saidasCentavos += g.valorCentavos;
    }
    // Aquisição dos animais devolvidos pelo comprador volta a ser ativo: sai do custo do período.
    linha('animais').competencia.custoCentavos -= c.estorno;
    let competencia = 0;
    let caixa = 0;
    for (const l of linhas.values()) {
      const liquidoCompetencia = l.competencia.receitaCentavos - l.competencia.custoCentavos;
      const liquidoCaixa = l.caixa.entradasCentavos - l.caixa.saidasCentavos;
      l.diferencaCentavos = liquidoCompetencia - liquidoCaixa;
      competencia += liquidoCompetencia;
      caixa += liquidoCaixa;
    }
    return {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      linhas: [...linhas.values()],
      totais: {
        resultadoCompetenciaCentavos: competencia,
        caixaLiquidoCentavos: caixa,
        diferencaCentavos: competencia - caixa,
      },
      custoDesconhecido: desconhecidos,
      competencia: completude(
        apurarResultado(
          {
            conhecidaCentavos: receitaTotal,
            conhecidas: receitasConhecidas,
            desconhecidas: c.semReceita,
          },
          this.custoDasLinhas(c.doPeriodo, c.semBase),
          c.estorno,
        ),
      ),
    };
  }

  // ---- Projeção por premissas ----------------------------------------------------------------
  projecao(d: ProjecaoValidada): ProjecaoApi {
    if (d.data < this.ctx.hoje()) throw invalido(['A data da projeção deve ser hoje ou futura.']);
    let propriedadeId: string;
    let nome: string;
    let ids: string[];
    if (d.alvo.tipo === 'animal') {
      const a = this.ctx.animais.obter(d.alvo.id);
      if (!a) throw naoEncontrado('Animal não encontrado.');
      if (a.status !== 'ativo')
        throw invalido([
          'O animal já saiu do rebanho: veja o resultado realizado, não a projeção.',
        ]);
      propriedadeId = a.propriedadeId;
      nome = a.identificacao;
      ids = [a.id];
    } else {
      const lote = this.ctx.lotes.obter(d.alvo.id);
      if (!lote) throw naoEncontrado('Lote não encontrado.');
      propriedadeId = lote.propriedadeId;
      nome = lote.nome;
      ids = this.ctx.animais
        .listarBasicos({ propriedadeId, loteId: lote.id, somenteAtivos: true })
        .map((a) => a.id);
    }
    const { resultado: r, comBase } = this.apropriacao.montar(propriedadeId);
    const custo =
      ids.length > 0
        ? somarApuracoes(
            ids.map((id) =>
              this.apropriacao.apuracaoDoAnimal(r.porAnimal.get(id), comBase.has(id)),
            ),
          )
        : naoApurado();
    const gramas = (kg: number | null) => (kg === null ? null : Math.round(kg * 1000));
    const p = projetarResultado(
      {
        data: d.data,
        unidadePreco: d.unidadePreco,
        precoUnitarioCentavos: d.precoUnitarioCentavos,
        quantidadeAnimais: ids.length,
        pesoVivoGramasPorAnimal: gramas(d.pesoVivoKgPorAnimal),
        pesoCarcacaGramasPorAnimal: gramas(d.pesoCarcacaKgPorAnimal),
        custosFuturosCentavos: d.custosFuturosCentavos,
      },
      custo,
    );
    return {
      rotulo: ROTULO_PROJECAO,
      alvo: { tipo: d.alvo.tipo, id: d.alvo.id, nome },
      animais: ids.length,
      data: d.data,
      unidadePreco: d.unidadePreco,
      ...p,
    };
  }
}
