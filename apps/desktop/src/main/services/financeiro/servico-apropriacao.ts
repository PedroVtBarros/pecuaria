import {
  CATEGORIAS_CUSTO,
  apurarComponentes,
  apurarCustoSanitario,
  apuracaoDe,
  apuracaoDeContagens,
  conferirApropriacao,
  dividirLinha,
  formatarCentavos,
  reconstruirPermanencias,
  semAcentos,
  somarApuracoes,
  apropriar,
  type Acumulado,
  type Apuracao,
  type CategoriaCusto,
  type Classificacao,
  type DetalheDeCusto,
  type ItemDeRateio,
  type LinhaDeCusto,
  type PermanenciaNoLote,
  type ResultadoApropriacao,
} from '@pecuaria/domain';
import type {
  CustoDoAnimalNoPeriodo,
  CustoDoLote,
  CustoPorCategoria,
  ExplicacaoDeCusto,
  ExplicacaoDoLote,
  FiltrosCustoAnimaisValidados,
  LinhaDeOrigem,
  PaginaCustosAnimais,
  ResumoDeCustos,
} from '@pecuaria/shared-types';
import type { ConsumoParaCusto, LancamentoParaCusto } from '@pecuaria/database';
import { dataBr, naoEncontrado, type ContextoRebanho } from '../rebanho/contexto';

const CATEGORIA_POR_TIPO_ITEM: Record<string, CategoriaCusto> = {
  racao: 'alimentacao',
  silagem: 'alimentacao',
  volumoso: 'alimentacao',
  suplemento: 'alimentacao',
  mineral: 'alimentacao',
  medicamento: 'sanidade',
  vacina: 'sanidade',
  semen: 'outros',
  outro: 'outros',
};
/** Um só formatador: `toLocaleString` cria um a cada chamada e pesa em dezenas de milhares de linhas. */
const QUANTIDADE = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const ROTULOS_CRITERIO: Record<string, string> = {
  cabecas: 'cabeças',
  animal_dias: 'animal-dias',
  peso: 'peso',
  manual: 'pesos manuais',
};

function categoriaDoConsumo(c: ConsumoParaCusto): CategoriaCusto {
  if (c.tipo === 'saida_venda') return 'mercadoria_vendida';
  return CATEGORIA_POR_TIPO_ITEM[c.itemTipo] ?? 'outros';
}
function categoriaDoLancamento(l: LancamentoParaCusto): CategoriaCusto {
  if (l.categoriaTratamento === 'ativo_animal') return 'aquisicao';
  if (l.categoriaGrupo === 'alimentacao') return 'alimentacao';
  if (l.categoriaGrupo === 'sanidade') return 'sanidade';
  return 'outros';
}

/** Animal e suas passagens por lotes, reconstruídas do histórico de movimentações. */
export interface AnimalNaPresenca {
  id: string;
  rotulo: string;
  status: string;
  loteAtualId: string | null;
  loteAtualNome: string | null;
}

/**
 * Quem estava em cada lote ao fim de cada dia (presente em `d` se `inicio <= d < fim`). Animal cujo
 * histórico de movimentação é inconsistente fica de fora e vira aviso: o sistema não adivinha.
 */
export class PresencaNosLotes {
  readonly animais: AnimalNaPresenca[] = [];
  readonly avisos: string[] = [];
  private readonly porLote = new Map<
    string,
    { animalId: string; rotulo: string; permanencias: PermanenciaNoLote[] }[]
  >();
  private readonly cache = new Map<string, readonly string[]>();

  constructor(ctx: ContextoRebanho, propriedadeId: string) {
    const basicos = ctx.animais.listarBasicos({ propriedadeId });
    const movimentos = ctx.animais.listarMovimentacoesDeAnimais(basicos.map((a) => a.id));
    for (const a of basicos) {
      this.animais.push({
        id: a.id,
        rotulo: a.identificacao,
        status: a.status,
        loteAtualId: a.lote?.id ?? null,
        loteAtualNome: a.lote?.nome ?? null,
      });
      const movs = movimentos.get(a.id) ?? [];
      if (movs.length === 0) {
        this.avisos.push(`${a.identificacao}: não há movimentações registradas.`);
        continue;
      }
      const lotes = new Set<string>();
      for (const m of movs) {
        if (m.loteDestinoId) lotes.add(m.loteDestinoId);
        if (m.loteOrigemId) lotes.add(m.loteOrigemId);
      }
      const achados: [string, PermanenciaNoLote[]][] = [];
      let problema: string | null = null;
      for (const loteId of lotes) {
        const rec = reconstruirPermanencias(movs, loteId, a.lote?.id ?? null);
        if (rec.situacao === 'inconsistente') {
          problema = rec.motivo;
          break;
        }
        if (rec.permanencias.length > 0) achados.push([loteId, rec.permanencias]);
      }
      if (problema) {
        this.avisos.push(`${a.identificacao}: ${problema}`);
        continue;
      }
      for (const [loteId, permanencias] of achados) {
        const lista = this.porLote.get(loteId) ?? [];
        lista.push({ animalId: a.id, rotulo: a.identificacao, permanencias });
        this.porLote.set(loteId, lista);
      }
    }
  }

  /** Animais que estavam no lote ao fim do dia, em ordem estável. */
  presenca = (loteId: string, data: string): readonly string[] => {
    const chave = `${loteId}|${data}`;
    const guardado = this.cache.get(chave);
    if (guardado) return guardado;
    const ids = (this.porLote.get(loteId) ?? [])
      .filter((x) =>
        x.permanencias.some((p) => p.inicio <= data && (p.fim === null || data < p.fim)),
      )
      .map((x) => x.animalId)
      .sort();
    this.cache.set(chave, ids);
    return ids;
  };

  animaisDoLote(loteId: string) {
    return this.porLote.get(loteId) ?? [];
  }
}

/** Linhas de custo de uma propriedade (todas as datas), presença nos lotes e bases de custo. */
export interface LinhasDaPropriedade {
  readonly linhas: readonly LinhaDeCusto[];
  readonly presenca: PresencaNosLotes;
  readonly criterios: Map<string, string>;
  readonly comBase: Set<string>;
}

export interface PropriedadeApropriada {
  linhas: LinhaDeCusto[];
  resultado: ResultadoApropriacao;
  presenca: PresencaNosLotes;
  /** Critério de cada rateio ativo, por id, para explicar a origem do valor. */
  criterios: Map<string, string>;
  /** Animais com base de custo conhecida (compra registrada ou custo anterior informado). */
  comBase: Set<string>;
}

/**
 * Apropriação de custos por lote e por animal (entrega 4E). Monta as linhas de custo a partir das
 * fontes (consumos de estoque, lançamentos, compras de animais, custos anteriores e registros
 * sanitários) e delega a divisão ao domínio puro. Nada é gravado aqui: o resultado é sempre
 * recalculado dos fatos, por isso correções retroativas continuam fechando.
 */
export class ServicoApropriacao {
  private memoria: {
    conexao: unknown;
    versao: number;
    porPropriedade: Map<string, LinhasDaPropriedade>;
  } | null = null;

  constructor(private readonly ctx: ContextoRebanho) {}

  private exigirPropriedade(id: string) {
    if (!this.ctx.propriedades.obter(id)) throw naoEncontrado('Propriedade não encontrada.');
  }

  /** Itens de rateio ativos por origem (lançamento ou movimento vigente do estoque). */
  private rateiosAtivos(propriedadeId: string) {
    const porLancamento = new Map<string, { id: string; itens: ItemDeRateio[] }>();
    const porMovimento = new Map<string, { id: string; itens: ItemDeRateio[] }>();
    const criterios = new Map<string, string>();
    // Itens e movimentos vigentes de todos os rateios em consultas únicas (não uma por rateio).
    const todosItens = this.ctx.rateio.itensDosRateiosAtivos(propriedadeId);
    const vigentes = this.ctx.rateio.vigentesDosRateiosAtivos(propriedadeId);
    for (const r of this.ctx.rateio.listarRateios(propriedadeId, false)) {
      const itens: ItemDeRateio[] = (todosItens.get(r.id) ?? []).map((i) => ({
        alvo: i.loteId
          ? { tipo: 'lote' as const, id: i.loteId }
          : { tipo: 'animal' as const, id: i.animalId as string },
        peso: i.pesoRelativo,
      }));
      criterios.set(r.id, r.criterio);
      if (r.origemTipo === 'lancamento') porLancamento.set(r.origemId, { id: r.id, itens });
      else {
        const vigente = vigentes.get(r.id);
        if (vigente) porMovimento.set(vigente.id, { id: r.id, itens });
      }
    }
    return { porLancamento, porMovimento, criterios };
  }

  /** Classificação de fixo ou variável dos custos que não são lançamentos (D-E). */
  private classificacoes(propriedadeId: string) {
    const mapa = new Map(
      this.ctx.insumos
        .listarClassificacoes(propriedadeId)
        .map((c) => [`${c.escopo}:${c.referenciaId ?? ''}`, c.comportamento]),
    );
    const de = (chave: string): Classificacao => mapa.get(chave) ?? 'nao_classificado';
    return {
      item: (itemId: string) => de(`estoque_item:${itemId}`),
      aquisicao: () => de('aquisicao_animal:'),
      custoAnterior: () => de('custo_anterior:'),
    };
  }

  /**
   * Todas as linhas de custo da propriedade (sem filtro de data), cada uma com as partes
   * classificadas, e a presença dos animais nos lotes. Base da apropriação (4E) e do resultado (4G).
   */
  linhasDeCusto(propriedadeId: string): LinhasDaPropriedade {
    this.exigirPropriedade(propriedadeId);
    // Memorização segura: a chave é a conexão aberta e o contador de escritas dela
    // (`total_changes()`); qualquer escrita, restauração ou reabertura do banco descarta o valor.
    const conexao = this.ctx.gerenciador.conexao;
    const versao = Number(
      (conexao.prepare('SELECT total_changes() AS n').get() as { n: number }).n,
    );
    if (this.memoria?.conexao !== conexao || this.memoria.versao !== versao)
      this.memoria = { conexao, versao, porPropriedade: new Map() };
    const guardado = this.memoria.porPropriedade.get(propriedadeId);
    if (guardado) return guardado;
    const valor = this.montarLinhasDeCusto(propriedadeId);
    this.memoria.porPropriedade.set(propriedadeId, valor);
    return valor;
  }

  private montarLinhasDeCusto(propriedadeId: string): LinhasDaPropriedade {
    const presenca = new PresencaNosLotes(this.ctx, propriedadeId);
    const classe = this.classificacoes(propriedadeId);
    const classeDoLancamento = (l: LancamentoParaCusto): Classificacao =>
      l.comportamento === 'fixo' || l.comportamento === 'variavel'
        ? l.comportamento
        : 'nao_classificado';
    const { porLancamento, porMovimento, criterios } = this.rateiosAtivos(propriedadeId);
    const linhas: LinhaDeCusto[] = [];
    const comBase = new Set<string>();

    const consumos = this.ctx.apropriacao.consumos(propriedadeId);
    const lancamentos = this.ctx.apropriacao.lancamentos(propriedadeId);
    const manejos = this.ctx.apropriacao.manejos(propriedadeId);
    const manejoPorId = new Map(manejos.map((m) => [m.id, m]));
    const animaisDosManejos = this.ctx.apropriacao.animaisDosManejos(manejos.map((m) => m.id));

    const consumosDoManejo = new Map<string, ConsumoParaCusto[]>();
    const servicosDoManejo = new Map<string, LancamentoParaCusto[]>();

    for (const c of consumos) {
      if (c.manejoId) {
        const lista = consumosDoManejo.get(c.manejoId) ?? [];
        lista.push(c);
        consumosDoManejo.set(c.manejoId, lista);
        continue;
      }
      const base = {
        id: `consumo:${c.id}`,
        origemTipo: 'consumo' as const,
        origemId: c.id,
        data: c.data,
        categoria: categoriaDoConsumo(c),
        descricao: `${c.itemNome}: ${QUANTIDADE.format(c.quantidadeMilesimos / 1000)} ${c.unidadeBase}`,
        valorCentavos: c.custoCentavos,
        partes: [
          {
            classificacao: classe.item(c.itemId),
            grupo: 'insumos' as const,
            valorCentavos: c.custoCentavos,
          },
        ],
      };
      if (c.destino === 'animal' && c.animalId)
        linhas.push({ ...base, destino: { tipo: 'animal', id: c.animalId }, rateio: null });
      else if (c.destino === 'lote' && c.loteId)
        linhas.push({ ...base, destino: { tipo: 'lote', id: c.loteId }, rateio: null });
      else
        linhas.push({
          ...base,
          destino: { tipo: 'propriedade' },
          rateio: porMovimento.get(c.id) ?? null,
        });
    }

    for (const l of lancamentos) {
      if (l.origemTipo === 'sanitario' && l.origemId) {
        const lista = servicosDoManejo.get(l.origemId) ?? [];
        lista.push(l);
        servicosDoManejo.set(l.origemId, lista);
        continue;
      }
      const base = {
        id: `lancamento:${l.id}`,
        origemTipo: 'lancamento' as const,
        origemId: l.id,
        data: l.data,
        categoria: categoriaDoLancamento(l),
        descricao: l.descricao,
        valorCentavos: l.valorCentavos,
        partes: [
          {
            classificacao: classeDoLancamento(l),
            grupo:
              l.categoriaTratamento === 'ativo_animal'
                ? ('animais' as const)
                : ('despesas' as const),
            valorCentavos: l.valorCentavos,
          },
        ],
      };
      if (l.destinoTipo === 'animal' && l.animalId)
        linhas.push({ ...base, destino: { tipo: 'animal', id: l.animalId }, rateio: null });
      else if (l.destinoTipo === 'lote' && l.loteId)
        linhas.push({ ...base, destino: { tipo: 'lote', id: l.loteId }, rateio: null });
      else
        linhas.push({
          ...base,
          destino: { tipo: 'propriedade' },
          rateio: porLancamento.get(l.id) ?? null,
        });
    }

    // Registro sanitário: uma fonte por componente (estoque, serviços, valor informado só se não
    // houver os outros), dividido por igual entre os animais tratados. A parte conhecida vira uma
    // linha e cada baixa de custo desconhecido vira uma linha sem valor.
    const manejosVistos = new Set<string>([
      ...manejoPorId.keys(),
      ...consumosDoManejo.keys(),
      ...servicosDoManejo.keys(),
    ]);
    for (const manejoId of [...manejosVistos].sort()) {
      const m = manejoPorId.get(manejoId);
      const cons = consumosDoManejo.get(manejoId) ?? [];
      const serv = servicosDoManejo.get(manejoId) ?? [];
      const custo = apurarCustoSanitario({
        consumosEstoque: cons.map((c) => c.custoCentavos),
        servicos: serv.map((s) => s.valorCentavos),
        informadoCentavos: m?.custoInformadoCentavos ?? null,
      });
      const data = m?.data ?? cons[0]?.data ?? serv[0]?.data ?? '';
      const destino = {
        tipo: 'animais_tratados' as const,
        animaisIds: animaisDosManejos.get(manejoId) ?? [],
      };
      const base = {
        origemTipo: 'manejo_sanitario' as const,
        origemId: manejoId,
        data,
        categoria: 'sanidade' as const,
        descricao: `Registro sanitário de ${dataBr(data)}`,
        destino,
        rateio: null,
      };
      if (custo.apuracao.componentesConhecidos > 0)
        linhas.push({
          ...base,
          id: `manejo:${manejoId}`,
          valorCentavos: custo.apuracao.valorConhecidoCentavos,
          partes: [
            ...cons
              .filter((c) => c.custoCentavos !== null)
              .map((c) => ({
                classificacao: classe.item(c.itemId),
                grupo: 'insumos' as const,
                valorCentavos: c.custoCentavos,
              })),
            ...serv.map((s) => ({
              classificacao: classeDoLancamento(s),
              grupo: 'despesas' as const,
              valorCentavos: s.valorCentavos,
            })),
            ...(custo.informadoContado &&
            m?.custoInformadoCentavos !== null &&
            m?.custoInformadoCentavos !== undefined
              ? [
                  {
                    classificacao: 'nao_classificado' as const,
                    grupo: 'despesas' as const,
                    valorCentavos: m.custoInformadoCentavos,
                  },
                ]
              : []),
          ],
        });
      cons
        .filter((c) => c.custoCentavos === null)
        .forEach((c, k) =>
          linhas.push({
            ...base,
            id: `manejo:${manejoId}:desconhecido:${k}`,
            valorCentavos: null,
            partes: [
              {
                classificacao: classe.item(c.itemId),
                grupo: 'insumos' as const,
                valorCentavos: null,
              },
            ],
          }),
        );
    }

    for (const a of this.ctx.apropriacao.aquisicoes(propriedadeId)) {
      comBase.add(a.animalId);
      linhas.push({
        id: `aquisicao:${a.itemId}`,
        origemTipo: 'aquisicao',
        origemId: a.negociacaoId,
        data: a.data,
        categoria: 'aquisicao',
        descricao: 'Aquisição do animal',
        valorCentavos: a.valorCentavos,
        partes: [
          { classificacao: classe.aquisicao(), grupo: 'animais', valorCentavos: a.valorCentavos },
        ],
        destino: { tipo: 'animal', id: a.animalId },
        rateio: null,
      });
    }
    for (const c of this.ctx.apropriacao.custosAnteriores(propriedadeId)) {
      comBase.add(c.animalId);
      linhas.push({
        id: `custo_anterior:${c.itemId}`,
        origemTipo: 'custo_anterior',
        origemId: c.custoAnteriorId,
        data: c.data,
        categoria: 'custo_anterior',
        descricao: c.descricao,
        valorCentavos: c.valorCentavos,
        partes: [
          {
            classificacao: classe.custoAnterior(),
            grupo: 'animais',
            valorCentavos: c.valorCentavos,
          },
        ],
        destino: { tipo: 'animal', id: c.animalId },
        rateio: null,
      });
    }

    return { linhas, presenca, criterios, comBase };
  }

  montar(propriedadeId: string, dataInicial?: string, dataFinal?: string, coletar?: string) {
    const { linhas, presenca, criterios, comBase } = this.linhasDeCusto(propriedadeId);
    const filtradas = linhas.filter(
      (l) => (!dataInicial || l.data >= dataInicial) && (!dataFinal || l.data <= dataFinal),
    );
    const resultado = apropriar(filtradas, presenca.presenca, coletar);
    return {
      linhas: filtradas,
      resultado,
      presenca,
      criterios,
      comBase,
    } satisfies PropriedadeApropriada;
  }

  // ---- Leituras agregadas -------------------------------------------------------------------
  private categorias(porCategoria: Partial<Record<CategoriaCusto, number>>): CustoPorCategoria[] {
    return CATEGORIAS_CUSTO.filter((c) => (porCategoria[c] ?? 0) > 0).map((categoria) => ({
      categoria,
      valorCentavos: porCategoria[categoria] as number,
    }));
  }
  /** Apuração do animal: sem custo algum é "não apurada"; sem base de aquisição, é parcial. */
  apuracaoDoAnimal(acc: Acumulado | undefined, temBase: boolean): Apuracao {
    const partes: Apuracao[] = [];
    if (acc) partes.push(apuracaoDe(acc));
    if (!temBase) partes.push(apurarComponentes([{ tipo: 'nao_apurado' }]));
    if (partes.length === 0) return apurarComponentes([{ tipo: 'nao_apurado' }]);
    return somarApuracoes(partes);
  }

  resumo(f: {
    propriedadeId: string;
    dataInicial?: string | undefined;
    dataFinal?: string | undefined;
  }): ResumoDeCustos {
    const {
      resultado: r,
      presenca,
      comBase,
    } = this.montar(f.propriedadeId, f.dataInicial, f.dataFinal);
    const lotes: CustoDoLote[] = [];
    const nomes = new Map(this.ctx.lotes.listar(f.propriedadeId, true).map((l) => [l.id, l.nome]));
    const ids = new Set([...r.porLote.keys(), ...r.loteSemAnimais.keys()]);
    for (const loteId of [...ids].sort((a, b) =>
      (nomes.get(a) ?? a).localeCompare(nomes.get(b) ?? b, 'pt-BR'),
    )) {
      const v = r.porLote.get(loteId);
      const total = (v?.diretoCentavos ?? 0) + (v?.rateadoCentavos ?? 0);
      lotes.push({
        loteId,
        loteNome: nomes.get(loteId) ?? 'Lote removido',
        diretoCentavos: v?.diretoCentavos ?? 0,
        rateadoCentavos: v?.rateadoCentavos ?? 0,
        totalCentavos: total,
        desconhecidos: v?.desconhecidos ?? 0,
        porCategoria: this.categorias(v?.porCategoria ?? {}),
        apuracao: apuracaoDeContagens({
          conhecidoCentavos: total,
          conhecidos: v?.conhecidos ?? 0,
          desconhecidos: v?.desconhecidos ?? 0,
        }),
        semAnimaisCentavos: r.loteSemAnimais.get(loteId)?.conhecidoCentavos ?? 0,
      });
    }
    const apuracoesAnimais = [...r.porAnimal.entries()].map(([id, acc]) =>
      this.apuracaoDoAnimal(acc, comBase.has(id)),
    );
    return {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial ?? null,
      dataFinal: f.dataFinal ?? null,
      lotes,
      naoAlocado: {
        apuracao:
          r.naoAlocado.conhecidos + r.naoAlocado.desconhecidos === 0
            ? apurarComponentes([])
            : apuracaoDe(r.naoAlocado),
        porCategoria: this.categorias(r.naoAlocado.porCategoria),
      },
      animais: {
        quantidade: r.porAnimal.size,
        apuracao: somarApuracoes(apuracoesAnimais),
      },
      emProducao: this.emProducao(f.propriedadeId, f.dataInicial, f.dataFinal),
      totalDeOrigemCentavos: r.origem.conhecidoCentavos,
      desconhecidosDeOrigem: r.origem.desconhecidos,
      conferido: conferirApropriacao(r).length === 0,
      avisos: presenca.avisos,
    };
  }

  /** Custo em centros de produção: não é de animal nem de lote até o item produzido ser consumido. */
  private emProducao(propriedadeId: string, dataInicial?: string, dataFinal?: string): Apuracao {
    const itens = this.ctx.producao
      .custosEmCentros(propriedadeId)
      .filter(
        (c) => (!dataInicial || c.data >= dataInicial) && (!dataFinal || c.data <= dataFinal),
      );
    const conhecidos = itens.filter((c) => c.valorCentavos !== null);
    return apuracaoDeContagens({
      conhecidoCentavos: conhecidos.reduce((s, c) => s + (c.valorCentavos as number), 0),
      conhecidos: conhecidos.length,
      desconhecidos: itens.length - conhecidos.length,
    });
  }

  animais(f: FiltrosCustoAnimaisValidados): PaginaCustosAnimais {
    const {
      resultado: r,
      presenca,
      comBase,
    } = this.montar(f.propriedadeId, f.dataInicial, f.dataFinal);
    const busca = f.busca ? semAcentos(f.busca).toLowerCase() : null;
    const filtrados = presenca.animais.filter(
      (a) =>
        (!f.loteId || a.loteAtualId === f.loteId) &&
        (!busca || semAcentos(a.rotulo).toLowerCase().includes(busca)),
    );
    const inicio = (f.pagina - 1) * f.tamanhoPagina;
    const itens: CustoDoAnimalNoPeriodo[] = filtrados
      .slice(inicio, inicio + f.tamanhoPagina)
      .map((a) => {
        const acc = r.porAnimal.get(a.id);
        return {
          animalId: a.id,
          identificacao: a.rotulo,
          loteId: a.loteAtualId,
          loteNome: a.loteAtualNome,
          status: a.status,
          apuracao: this.apuracaoDoAnimal(acc, comBase.has(a.id)),
          porCategoria: this.categorias(acc?.porCategoria ?? {}),
        };
      });
    return { itens, total: filtrados.length, pagina: f.pagina, tamanhoPagina: f.tamanhoPagina };
  }

  // ---- "De onde veio este número?" ----------------------------------------------------------
  private origemDaLinha(l: LinhaDeCusto): LinhaDeOrigem['origem'] {
    return { tipo: l.origemTipo, id: l.origemId };
  }

  animal(f: {
    animalId: string;
    dataInicial?: string | undefined;
    dataFinal?: string | undefined;
  }): ExplicacaoDeCusto {
    const animal = this.ctx.animais.obter(f.animalId);
    if (!animal) throw naoEncontrado('Animal não encontrado.');
    const {
      resultado: r,
      linhas,
      presenca,
      criterios,
      comBase,
    } = this.montar(animal.propriedadeId, f.dataInicial, f.dataFinal, f.animalId);
    const porId = new Map(linhas.map((l) => [l.id, l]));
    const nomesLotes = new Map(
      this.ctx.lotes.listar(animal.propriedadeId, true).map((l) => [l.id, l.nome]),
    );
    const acc = r.porAnimal.get(f.animalId);
    const explicar = (d: DetalheDeCusto): LinhaDeOrigem => {
      const primeira = porId.get(d.linhaIds[0] ?? '');
      const unica = d.linhaIds.length === 1 ? primeira : undefined;
      let explicacao: string;
      let descricao = unica?.descricao ?? primeira?.descricao ?? '';
      if (d.via === 'direto') explicacao = 'Lançado diretamente a este animal.';
      else if (d.via === 'animais_tratados')
        explicacao = 'Registro sanitário dividido por igual entre os animais tratados.';
      else if (d.via === 'rateio') {
        const crit = d.rateioId ? (criterios.get(d.rateioId) ?? '') : '';
        explicacao = `Parte de um custo da propriedade distribuído por rateio (${ROTULOS_CRITERIO[crit] ?? crit}).`;
      } else {
        const lote = d.lote!;
        const nome = nomesLotes.get(lote.id) ?? 'lote';
        descricao =
          d.linhaIds.length === 1
            ? descricao
            : `${d.linhaIds.length} custos do lote ${nome} no dia`;
        const rateados = [
          ...new Set(
            d.linhaIds
              .map((id) => porId.get(id)?.rateio?.id)
              .filter((x): x is string => x !== undefined)
              .map((x) => ROTULOS_CRITERIO[criterios.get(x) ?? ''] ?? ''),
          ),
        ];
        explicacao = `Custo do lote ${nome} (${formatarCentavos(lote.totalDoGrupoCentavos)} em ${dataBr(d.data)}) dividido por igual entre ${lote.animaisNoGrupo} animal(is) presente(s) no lote nesse dia.`;
        if (rateados.length > 0)
          explicacao += ` Inclui parte de custo da propriedade distribuído por rateio (${rateados.join(', ')}).`;
      }
      return {
        via: d.via,
        categoria: d.categoria,
        data: d.data,
        valorCentavos: d.valorCentavos,
        descricao,
        origem: unica ? this.origemDaLinha(unica) : null,
        explicacao,
      };
    };
    const avisos = presenca.avisos.filter((a) => a.startsWith(`${animal.identificacao}:`));
    const apuracao = this.apuracaoDoAnimal(acc, comBase.has(f.animalId));
    if (!comBase.has(f.animalId))
      avisos.push(
        animal.origem === 'comprado'
          ? 'Sem custo de aquisição registrado no sistema nem custo anterior informado.'
          : 'O custo de formação anterior ao sistema não foi informado.',
      );
    return {
      animalId: f.animalId,
      identificacao: animal.identificacao,
      apuracao,
      porCategoria: this.categorias(acc?.porCategoria ?? {}),
      linhas: r.detalhes
        .map(explicar)
        .sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao)),
      avisos,
    };
  }

  lote(f: {
    loteId: string;
    dataInicial?: string | undefined;
    dataFinal?: string | undefined;
  }): ExplicacaoDoLote {
    const lote = this.ctx.lotes.obter(f.loteId);
    if (!lote) throw naoEncontrado('Lote não encontrado.');
    const { linhas, resultado: r } = this.montar(lote.propriedadeId, f.dataInicial, f.dataFinal);
    const saida: ExplicacaoDoLote['linhas'] = [];
    for (const l of linhas) {
      for (const p of dividirLinha(l)) {
        if (p.alvo.tipo !== 'lote' || p.alvo.id !== f.loteId) continue;
        saida.push({
          via: p.via === 'rateio' ? 'rateio' : 'direto',
          categoria: l.categoria,
          data: l.data,
          valorCentavos: p.valorCentavos,
          descricao: l.descricao,
          // Custo de aquisição e custo anterior sempre têm animal como destino, nunca lote.
          origem: {
            tipo: l.origemTipo as 'lancamento' | 'consumo' | 'manejo_sanitario',
            id: l.origemId,
          },
        });
      }
    }
    const v = r.porLote.get(f.loteId);
    return {
      loteId: f.loteId,
      loteNome: lote.nome,
      apuracao: apuracaoDeContagens({
        conhecidoCentavos: (v?.diretoCentavos ?? 0) + (v?.rateadoCentavos ?? 0),
        conhecidos: v?.conhecidos ?? 0,
        desconhecidos: v?.desconhecidos ?? 0,
      }),
      linhas: saida.sort((a, b) => a.data.localeCompare(b.data)),
    };
  }
}
