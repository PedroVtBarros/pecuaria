import {
  dataLocalIso,
  diasEntre,
  montarFluxoPrevisto,
  montarFluxoRealizado,
  normalizarNome,
  semAcentos,
  situacaoDaParcela,
  somarCentavos,
  somarDias,
  type NaturezaFinanceira,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type BlocoCompetencia,
  type ContaEmAberto,
  type FiltrosContasValidados,
  type FiltrosFluxoValidados,
  type FiltrosPainelValidados,
  type FluxoDeCaixa,
  type PaginaContas,
  type PainelFinanceiro,
  type PendentesDeDefinicao,
  type ResumoContas,
  type ResumoPainelContas,
  type TotalPorCategoria,
} from '@pecuaria/shared-types';
import {
  RepositorioFinanceiro,
  RepositorioPropriedades,
  type FiltrosCaixa,
  type GerenciadorBanco,
} from '@pecuaria/database';

const SEM_LIMITE_INFERIOR = '1900-01-01';
const SEM_LIMITE_SUPERIOR = '2999-12-31';

/**
 * Consultas de caixa (entrega 4B): fluxo realizado e previsto, contas a pagar e receber e painel.
 * Somente leitura. Realizado (pagamentos), previsto (parcelas em aberto) e competência
 * (lançamentos) são visões distintas e nunca são somadas entre si; saldo desconhecido
 * (condição de pagamento não informada) fica de fora das somas e é sinalizado à parte.
 */
export class ServicoCaixa {
  private readonly repo: RepositorioFinanceiro;
  private readonly propriedades: RepositorioPropriedades;
  private readonly relogio: () => Date;

  constructor(banco: GerenciadorBanco, opcoes: { relogio?: () => Date } = {}) {
    const db = () => banco.conexao;
    this.repo = new RepositorioFinanceiro(db);
    this.propriedades = new RepositorioPropriedades(db);
    this.relogio = opcoes.relogio ?? (() => new Date());
  }

  private hoje() {
    return dataLocalIso(this.relogio());
  }
  private exigirPropriedade(id: string) {
    if (!this.propriedades.obter(id))
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Propriedade não encontrada.');
  }
  private nomesDasCategorias() {
    return new Map(this.repo.listarCategorias(true).map((c) => [c.id, c]));
  }
  private somaPendentes(f: FiltrosCaixa): PendentesDeDefinicao {
    const linhas = this.repo.pendentesDeDefinicao(f);
    const de = (n: NaturezaFinanceira) => linhas.find((l) => l.natureza === n);
    return {
      quantidade: linhas.reduce((s, l) => s + l.quantidade, 0),
      valorOperacaoReceitaCentavos: de('receita')?.valorCentavos ?? 0,
      valorOperacaoDespesaCentavos: de('despesa')?.valorCentavos ?? 0,
    };
  }

  // ---- Fluxo de caixa -----------------------------------------------------------------------
  fluxo(f: FiltrosFluxoValidados): FluxoDeCaixa {
    this.exigirPropriedade(f.propriedadeId);
    const filtro: FiltrosCaixa = {
      propriedadeId: f.propriedadeId,
      natureza: f.natureza,
      categoriaId: f.categoriaId,
      atividade: f.atividade,
      loteId: f.loteId,
      pessoaId: f.pessoaId,
    };
    const hoje = this.hoje();
    const categorias = this.nomesDasCategorias();
    let realizado;
    let previsto;
    const pagamentos = this.repo.pagamentosAgregados(filtro, f.dataInicial, f.dataFinal);
    const abertos = this.repo.saldosAbertosAgregados(filtro, f.dataInicial, f.dataFinal);
    try {
      realizado = montarFluxoRealizado(
        pagamentos.map((p) => ({
          data: p.data,
          natureza: p.natureza,
          valorCentavos: p.totalCentavos,
          quantidade: p.quantidade,
        })),
        f.dataInicial,
        f.dataFinal,
        f.granularidade,
      );
      previsto = montarFluxoPrevisto(
        abertos.map((p) => ({
          vencimento: p.vencimento,
          natureza: p.natureza,
          saldoCentavos: p.saldoCentavos,
          quantidade: p.quantidade,
        })),
        hoje,
        f.dataInicial,
        f.dataFinal,
        f.granularidade,
      );
    } catch (e) {
      throw new ErroAplicacao(
        'OPERACAO_INVALIDA',
        e instanceof Error ? e.message : 'Período inválido.',
      );
    }
    const porCategoria = (
      itens: readonly {
        categoriaId: string;
        natureza: NaturezaFinanceira;
        valor: number;
        quantidade: number;
      }[],
    ): TotalPorCategoria[] => {
      const mapa = new Map<
        string,
        { natureza: NaturezaFinanceira; valores: number[]; n: number }
      >();
      for (const i of itens) {
        const a = mapa.get(i.categoriaId) ?? { natureza: i.natureza, valores: [], n: 0 };
        a.valores.push(i.valor);
        a.n += i.quantidade;
        mapa.set(i.categoriaId, a);
      }
      return [...mapa.entries()]
        .map(([categoriaId, a]) => {
          const c = categorias.get(categoriaId);
          return {
            categoriaId,
            categoriaNome: c?.nome ?? 'Categoria removida',
            grupo: c?.grupo ?? 'outros',
            tratamento: c?.tratamento ?? 'resultado',
            natureza: a.natureza,
            totalCentavos: somarCentavos(a.valores),
            quantidade: a.n,
          } satisfies TotalPorCategoria;
        })
        .sort(
          (x, y) =>
            x.natureza.localeCompare(y.natureza) ||
            y.totalCentavos - x.totalCentavos ||
            x.categoriaNome.localeCompare(y.categoriaNome, 'pt-BR'),
        );
    };
    return {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      granularidade: f.granularidade,
      hoje,
      realizado: {
        linhas: realizado.linhas,
        entradasCentavos: realizado.entradasCentavos,
        saidasCentavos: realizado.saidasCentavos,
        saldoCentavos: realizado.saldoCentavos,
        movimentos: realizado.movimentos,
        porCategoria: porCategoria(
          pagamentos.map((p) => ({
            categoriaId: p.categoriaId,
            natureza: p.natureza,
            valor: p.totalCentavos,
            quantidade: p.quantidade,
          })),
        ),
      },
      previsto: {
        linhas: previsto.linhas,
        aReceberCentavos: previsto.aReceberCentavos,
        aPagarCentavos: previsto.aPagarCentavos,
        emAtrasoReceberCentavos: previsto.emAtrasoReceberCentavos,
        emAtrasoPagarCentavos: previsto.emAtrasoPagarCentavos,
        saldoPrevistoCentavos: previsto.saldoPrevistoCentavos,
        parcelas: previsto.parcelas,
        porCategoria: porCategoria(
          abertos.map((p) => ({
            categoriaId: p.categoriaId,
            natureza: p.natureza,
            valor: p.saldoCentavos,
            quantidade: p.quantidade,
          })),
        ),
      },
      pendentesDeDefinicao: this.somaPendentes(filtro),
    };
  }

  // ---- Contas a pagar e a receber ------------------------------------------------------------
  contas(f: FiltrosContasValidados): PaginaContas {
    this.exigirPropriedade(f.propriedadeId);
    const hoje = this.hoje();
    const filtro: FiltrosCaixa = {
      propriedadeId: f.propriedadeId,
      natureza: f.natureza,
      categoriaId: f.categoriaId,
      atividade: f.atividade,
      pessoaId: f.pessoaId,
    };
    const chave = (t: string) => semAcentos(normalizarNome(t));
    const busca = chave(f.busca ?? '');
    const linhas = this.repo.contasEmAberto(filtro, { de: f.dataInicial, ate: f.dataFinal });
    let itens: ContaEmAberto[] = linhas.map((l) => {
      const situacao = situacaoDaParcela({
        valorCentavos: l.valorCentavos,
        pagoCentavos: l.pagoCentavos,
        compensadoCentavos: l.compensadoCentavos,
        vencimento: l.vencimento,
        hoje,
      });
      return {
        parcelaId: l.parcelaId,
        lancamentoId: l.lancamentoId,
        numero: l.numero,
        totalParcelas: l.totalParcelas,
        vencimento: l.vencimento,
        valorCentavos: l.valorCentavos,
        pagoCentavos: l.pagoCentavos,
        compensadoCentavos: l.compensadoCentavos,
        saldoCentavos: l.saldoCentavos,
        situacao,
        diasEmAtraso: situacao === 'atrasada' ? diasEntre(l.vencimento, hoje) : null,
        natureza: l.natureza,
        descricao: l.descricao,
        documentoNumero: l.documentoNumero,
        categoria: { id: l.categoriaId, nome: l.categoriaNome },
        pessoa: l.pessoaId && l.pessoaNome ? { id: l.pessoaId, nome: l.pessoaNome } : null,
        dataCompetencia: l.dataCompetencia,
        atividade: l.atividade,
        destinoDescricao:
          l.destinoTipo === 'lote'
            ? `Lote ${l.loteNome ?? ''}`.trim()
            : l.destinoTipo === 'animal'
              ? `Animal ${l.animalIdentificacao ?? ''}`.trim()
              : l.destinoTipo === 'propriedade'
                ? 'Propriedade'
                : null,
      };
    });
    if (f.situacao === 'atrasada') itens = itens.filter((i) => i.situacao === 'atrasada');
    if (f.situacao === 'a_vencer') itens = itens.filter((i) => i.situacao !== 'atrasada');
    if (busca !== '')
      itens = itens.filter((i) =>
        [i.descricao, i.documentoNumero, i.categoria.nome, i.pessoa?.nome]
          .filter((t): t is string => Boolean(t))
          .some((t) => chave(t).includes(busca)),
      );
    const atrasadas = itens.filter((i) => i.situacao === 'atrasada');
    const aVencer = itens.filter((i) => i.situacao !== 'atrasada');
    const soma = (xs: readonly ContaEmAberto[]) => somarCentavos(xs.map((x) => x.saldoCentavos));
    const resumo: ResumoContas = {
      quantidade: itens.length,
      saldoTotalCentavos: soma(itens),
      emAtrasoQuantidade: atrasadas.length,
      emAtrasoCentavos: soma(atrasadas),
      aVencerQuantidade: aVencer.length,
      aVencerCentavos: soma(aVencer),
    };
    const pendentes = this.somaPendentes(filtro);
    return {
      natureza: f.natureza,
      hoje,
      itens: itens.slice((f.pagina - 1) * f.tamanhoPagina, f.pagina * f.tamanhoPagina),
      total: itens.length,
      pagina: f.pagina,
      tamanhoPagina: f.tamanhoPagina,
      resumo,
      pendentesDeDefinicao: {
        quantidade: this.repo
          .pendentesDeDefinicao(filtro)
          .filter((p) => p.natureza === f.natureza)
          .reduce((s, p) => s + p.quantidade, 0),
        valorOperacaoCentavos:
          f.natureza === 'receita'
            ? pendentes.valorOperacaoReceitaCentavos
            : pendentes.valorOperacaoDespesaCentavos,
      },
    };
  }

  // ---- Painel -------------------------------------------------------------------------------
  painel(f: FiltrosPainelValidados): PainelFinanceiro {
    this.exigirPropriedade(f.propriedadeId);
    const hoje = this.hoje();
    const filtro: FiltrosCaixa = { propriedadeId: f.propriedadeId };
    const pagamentos = this.repo.pagamentosAgregados(filtro, f.dataInicial, f.dataFinal);
    const por = (n: NaturezaFinanceira) =>
      somarCentavos(pagamentos.filter((p) => p.natureza === n).map((p) => p.totalCentavos));
    const entradas = por('receita');
    const saidas = por('despesa');

    const abertos = this.repo.saldosAbertosAgregados(
      filtro,
      SEM_LIMITE_INFERIOR,
      SEM_LIMITE_SUPERIOR,
    );
    const em30 = somarDias(hoje, 30);
    const resumoContas = (n: NaturezaFinanceira): ResumoPainelContas => {
      const doTipo = abertos.filter((a) => a.natureza === n);
      const atrasadas = doTipo.filter((a) => a.vencimento < hoje);
      const proximas = doTipo.filter((a) => a.vencimento >= hoje && a.vencimento <= em30);
      const s = (xs: typeof doTipo) => somarCentavos(xs.map((x) => x.saldoCentavos));
      const q = (xs: typeof doTipo) => xs.reduce((n2, x) => n2 + x.quantidade, 0);
      return {
        saldoTotalCentavos: s(doTipo),
        emAtrasoCentavos: s(atrasadas),
        emAtrasoQuantidade: q(atrasadas),
        proximos30DiasCentavos: s(proximas),
        proximos30DiasQuantidade: q(proximas),
      };
    };
    const competencia: BlocoCompetencia[] = this.repo
      .competenciaPorTratamento(f.propriedadeId, f.dataInicial, f.dataFinal)
      .map((c) => ({ ...c }));
    const naoClassificadas = this.repo
      .coberturaPorCategoria(f.propriedadeId)
      .filter((c) => c.comportamento === 'nao_classificado');
    return {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      hoje,
      caixa: {
        entradasCentavos: entradas,
        saidasCentavos: saidas,
        saldoCentavos: entradas - saidas,
        movimentos: pagamentos.reduce((n, p) => n + p.quantidade, 0),
      },
      contas: { aReceber: resumoContas('receita'), aPagar: resumoContas('despesa') },
      competencia,
      pendencias: {
        pendentesDeDefinicao: this.somaPendentes(filtro),
        despesasNaoClassificadas: {
          quantidade: naoClassificadas.reduce((n, c) => n + c.quantidade, 0),
          valorCentavos: somarCentavos(naoClassificadas.map((c) => c.totalCentavos)),
        },
      },
    };
  }
}
