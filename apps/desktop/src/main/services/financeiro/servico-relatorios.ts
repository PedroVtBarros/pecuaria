import type { Apuracao } from '@pecuaria/domain';
import {
  explicarCompletude,
  situacaoResultado,
  type FiltrosFluxoValidados,
  type FiltrosLancamentoValidados,
  type LancamentoResumo,
} from '@pecuaria/shared-types';
import { invalido, naoEncontrado, type ContextoRebanho } from '../rebanho/contexto';
import type { Celula, Relatorio, Secao } from '../../relatorios/modelo';
import {
  CATEGORIAS,
  ESTADOS_INDICADOR,
  SAIDAS,
  SITUACOES_LANCAMENTO,
  SITUACOES_ANIMAL,
  TEXTO_SEM_DOCUMENTO,
  TITULOS,
  VIAS,
} from '../../relatorios/textos-relatorios';
import type { ServicoApropriacao } from './servico-apropriacao';
import type { ServicoCaixa } from './servico-caixa';
import type { ServicoCompraInsumos } from './servico-compra-insumos';
import type { ServicoFinanceiro } from './servico-financeiro';
import type { ServicoProducao } from './servico-producao';
import type { ServicoResultado } from './servico-resultado';

export type TipoDeRelatorio = keyof typeof TITULOS;

export interface FiltrosDoRelatorio {
  propriedadeId: string;
  dataInicial: string | null;
  dataFinal: string | null;
  loteId: string | null;
  animalId: string | null;
  incluirDocumentos: boolean;
}

const ap = (a: Apuracao): Celula => ({ apuracao: a });
/** Nenhum custo, nem conhecido nem desconhecido (zero conhecido não é "nenhum"). */
const semComponentes = (a: Apuracao) =>
  a.componentesConhecidos + a.componentesDesconhecidos + a.componentesNaoApurados === 0;
const dataBr = (d: string) => {
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
};

/**
 * Monta os relatórios gerenciais (entrega 4H) a partir dos mesmos serviços das telas: nenhum
 * número é recalculado de outro jeito. O resultado é um modelo neutro que vira CSV ou HTML/PDF.
 */
export class ServicoRelatorios {
  constructor(
    private readonly ctx: ContextoRebanho,
    private readonly s: {
      resultado: ServicoResultado;
      apropriacao: ServicoApropriacao;
      financeiro: ServicoFinanceiro;
      caixa: ServicoCaixa;
      compraInsumos: ServicoCompraInsumos;
      producao: ServicoProducao;
    },
  ) {}

  private periodoObrigatorio(f: FiltrosDoRelatorio): { dataInicial: string; dataFinal: string } {
    if (!f.dataInicial || !f.dataFinal) throw invalido(['Informe o período do relatório.']);
    if (f.dataInicial > f.dataFinal)
      throw invalido(['A data inicial deve ser anterior ou igual à final.']);
    return { dataInicial: f.dataInicial, dataFinal: f.dataFinal };
  }
  private textoPeriodo(f: { dataInicial: string | null; dataFinal: string | null }): string {
    if (f.dataInicial && f.dataFinal) return `${dataBr(f.dataInicial)} a ${dataBr(f.dataFinal)}`;
    if (f.dataFinal) return `Até ${dataBr(f.dataFinal)}`;
    if (f.dataInicial) return `Desde ${dataBr(f.dataInicial)}`;
    return 'Todo o histórico';
  }
  private nomeArquivo(tipo: TipoDeRelatorio, f: FiltrosDoRelatorio): string {
    const sufixo = f.dataInicial && f.dataFinal ? `-${f.dataInicial}-a-${f.dataFinal}` : '';
    return `${tipo}${sufixo}`;
  }

  montar(tipo: TipoDeRelatorio, f: FiltrosDoRelatorio): Relatorio {
    const p = this.ctx.propriedades.obter(f.propriedadeId);
    if (!p) throw naoEncontrado('Propriedade não encontrada.');
    const base = {
      titulo: TITULOS[tipo] as string,
      propriedade: p.nome,
      periodo: this.textoPeriodo(f),
      geradoEm: new Date(this.ctx.agora()).toLocaleString('pt-BR'),
      nomeArquivo: this.nomeArquivo(tipo, f),
    };
    switch (tipo) {
      case 'resultado':
        return { ...base, ...this.resultado(f) };
      case 'custos':
        return { ...base, ...this.custos(f) };
      case 'animal':
        return { ...base, ...this.animal(f) };
      case 'lote':
        return { ...base, ...this.lote(f) };
      case 'lancamentos':
        return { ...base, ...this.lancamentos(f) };
      case 'fluxo':
        return { ...base, ...this.fluxo(f) };
      case 'conciliacao':
        return { ...base, ...this.conciliacao(f) };
      case 'conferencia':
        return { ...base, ...this.conferencia(f) };
    }
  }

  private resultado(f: FiltrosDoRelatorio): Pick<Relatorio, 'visao' | 'avisos' | 'secoes'> {
    const per = { propriedadeId: f.propriedadeId, ...this.periodoObrigatorio(f) };
    const r = this.s.resultado.periodo(per);
    const rr = this.s.resultado.realizado(per);
    const ind = this.s.resultado.indicadores(per);
    const c = r.competencia;
    const avisos: string[] = [];
    if (c.estado !== 'completo') avisos.push(explicarCompletude(c));
    if (c.animaisSemBase > 0)
      avisos.push(
        `${c.animaisSemBase} animal(is) saíram sem custo de aquisição nem custo anterior informado: o custo da baixa deles não foi apurado.`,
      );
    if (r.margemBruta.estado === 'parcial')
      avisos.push(`Margem bruta parcial: ${r.margemBruta.motivos.join(' ')}`);
    return {
      visao: 'Caixa e resultado',
      avisos,
      secoes: [
        {
          titulo: 'Competência (resultado)',
          descricao: 'Receitas e custos pela data do fato. Não é caixa.',
          indicadores: [
            {
              rotulo: 'Venda de animais (bruta)',
              valor: c.receitas.vendaAnimaisCentavos,
              tipo: 'dinheiro',
            },
            {
              rotulo: 'Devoluções de venda (deduzidas)',
              valor: c.receitas.devolucoesVendaCentavos,
              tipo: 'dinheiro',
            },
            {
              rotulo: 'Venda de animais líquida de devoluções',
              valor: c.receitas.vendaAnimaisCentavos - c.receitas.devolucoesVendaCentavos,
              tipo: 'dinheiro',
            },
            { rotulo: 'Leite', valor: c.receitas.leiteCentavos, tipo: 'dinheiro' },
            { rotulo: 'Outras receitas', valor: c.receitas.outrasCentavos, tipo: 'dinheiro' },
            {
              rotulo: 'Recuperado em devoluções a fornecedor (não é venda)',
              valor: c.receitas.recuperadoDevolucaoCompraCentavos,
              tipo: 'dinheiro',
            },
            { rotulo: 'Receitas (líquidas)', valor: c.receitas.totalCentavos, tipo: 'dinheiro' },
            { rotulo: 'Custos apropriados', valor: ap(c.custo), tipo: 'apuracao' },
            {
              rotulo: 'Resultado (margem líquida)',
              valor: c.resultadoCentavos,
              tipo: 'dinheiro',
              observacao: situacaoResultado(c),
            },
            { rotulo: 'Custo não alocado incluído', valor: c.naoAlocadoCentavos, tipo: 'dinheiro' },
            {
              rotulo: 'Aquisição dos animais que saíram',
              valor: c.baixaDeAnimaisCentavos,
              tipo: 'dinheiro',
            },
            {
              rotulo: 'Aquisição que voltou ao rebanho (animais devolvidos pelo comprador)',
              valor: c.estornoDeBaixaCentavos,
              tipo: 'dinheiro',
            },
          ],
        },
        {
          titulo: 'Caixa',
          descricao:
            'Dinheiro que entrou e saiu no período. Não é lucro e não é somado com a competência.',
          indicadores: [
            { rotulo: 'Entradas', valor: r.caixa.entradasCentavos, tipo: 'dinheiro' },
            { rotulo: 'Saídas', valor: r.caixa.saidasCentavos, tipo: 'dinheiro' },
            { rotulo: 'Saldo do movimento', valor: r.caixa.saldoCentavos, tipo: 'dinheiro' },
          ],
        },
        {
          titulo: 'Composição do custo',
          colunas: [
            { rotulo: 'Categoria', tipo: 'texto' },
            { rotulo: 'Valor conhecido', tipo: 'dinheiro' },
          ],
          linhas: c.porCategoria.map((x) => [CATEGORIAS[x.categoria], x.valorCentavos]),
          vazio: 'Nenhum custo no período.',
        },
        {
          titulo: 'Margem bruta',
          ...(r.margemBruta.semClassificacaoTruncada
            ? {
                descricao:
                  'A lista de custos sem classificação foi limitada; veja a lista completa em Financeiro > Classificações.',
              }
            : {}),
          indicadores: [
            {
              rotulo: 'Margem bruta',
              valor: r.margemBruta.margemCentavos,
              tipo: 'dinheiro',
              observacao: r.margemBruta.estado,
            },
            {
              rotulo: 'Custos variáveis',
              valor: r.margemBruta.variaveisCentavos,
              tipo: 'dinheiro',
            },
            { rotulo: 'Custos fixos', valor: r.margemBruta.fixosCentavos, tipo: 'dinheiro' },
            {
              rotulo: 'Sem classificação',
              valor: r.margemBruta.coberturaCentavos.naoClassificado,
              tipo: 'dinheiro',
            },
          ],
          colunas: [
            { rotulo: 'Data', tipo: 'data' },
            { rotulo: 'Custo sem classificação', tipo: 'texto' },
            { rotulo: 'Valor', tipo: 'dinheiro' },
          ],
          linhas: r.margemBruta.semClassificacao.map((x) => [x.data, x.descricao, x.valorCentavos]),
          vazio: 'Todos os custos estão classificados.',
        },
        {
          titulo: 'Indicadores',
          colunas: [
            { rotulo: 'Indicador', tipo: 'texto' },
            { rotulo: 'Valor', tipo: 'dinheiro' },
            { rotulo: 'Base e o que ficou de fora', tipo: 'texto' },
          ],
          linhas: [
            [
              'Custo por kg de peso vivo ganho',
              ind.custoPorKgGanho.centavosPorKg,
              `${ind.custoPorKgGanho.animais} animal(is) com duas pesagens; ${ind.custoPorKgGanho.semPesagens} sem; situação ${ESTADOS_INDICADOR[ind.custoPorKgGanho.estado]}`,
            ],
            [
              'Custo por @ de carcaça vendida',
              ind.carcaca.custoPorArrobaCentavos,
              `${ind.carcaca.animais} venda(s) com carcaça; ${ind.carcaca.semPeso} sem peso`,
            ],
            [
              'Receita por @ de carcaça',
              ind.carcaca.receitaPorArrobaCentavos,
              '15 kg de carcaça por @',
            ],
            [
              'Custo por @ de peso vivo vendida',
              ind.vivo.custoPorArrobaCentavos,
              `${ind.vivo.animais} venda(s) com peso vivo; ${ind.vivo.semPeso} sem peso`,
            ],
            [
              'Receita por @ de peso vivo',
              ind.vivo.receitaPorArrobaCentavos,
              '15 kg de peso vivo por @',
            ],
            [
              'Preço médio do litro de leite',
              ind.leite.precoPorLitroCentavos,
              `${ind.leite.receitasSemLitros} receita(s) sem litros ficaram de fora`,
            ],
          ],
        },
        {
          titulo: 'Resultado realizado por lote de saída',
          colunas: [
            { rotulo: 'Lote', tipo: 'texto' },
            { rotulo: 'Animais', tipo: 'inteiro' },
            { rotulo: 'Receita', tipo: 'dinheiro' },
            { rotulo: 'Custo da baixa', tipo: 'apuracao' },
            { rotulo: 'Resultado', tipo: 'dinheiro' },
            { rotulo: 'Saídas sem receita registrada', tipo: 'inteiro' },
            { rotulo: 'Situação', tipo: 'texto' },
          ],
          linhas: rr.porLote.map((g) => [
            g.loteNome,
            g.animais,
            g.receitaCentavos,
            ap(g.custo),
            g.resultadoCentavos,
            g.receitasDesconhecidas,
            situacaoResultado(g),
          ]),
          vazio: 'Nenhum animal saiu do rebanho no período.',
        },
        {
          titulo: 'Animais que saíram',
          colunas: [
            { rotulo: 'Animal', tipo: 'texto' },
            { rotulo: 'Saída', tipo: 'texto' },
            { rotulo: 'Data', tipo: 'data' },
            { rotulo: 'Receita', tipo: 'dinheiro' },
            { rotulo: 'Custo acumulado até a saída', tipo: 'apuracao' },
            { rotulo: 'Resultado', tipo: 'dinheiro' },
            { rotulo: 'Situação', tipo: 'texto' },
          ],
          linhas: rr.animais.map((a) => [
            a.identificacao,
            SAIDAS[a.saida] ?? a.saida,
            a.data,
            a.receitaCentavos,
            ap(a.custo),
            a.resultadoCentavos,
            situacaoResultado(a),
          ]),
          vazio: 'Nenhum animal saiu do rebanho no período.',
        },
        {
          titulo: 'Devoluções de venda (o comprador devolveu)',
          descricao:
            'O animal volta ao rebanho com o custo que tinha na saída; a venda original continua no histórico do seu período.',
          colunas: [
            { rotulo: 'Animal', tipo: 'texto' },
            { rotulo: 'Data da devolução', tipo: 'data' },
            { rotulo: 'Data da venda', tipo: 'data' },
            { rotulo: 'Receita original', tipo: 'dinheiro' },
            { rotulo: 'Valor devolvido', tipo: 'dinheiro' },
            { rotulo: 'Custo que volta ao rebanho', tipo: 'apuracao' },
            { rotulo: 'Efeito no resultado', tipo: 'dinheiro' },
          ],
          linhas: rr.devolucoesVenda.map((d) => [
            d.identificacao,
            d.data,
            d.dataVenda,
            d.receitaOriginalCentavos,
            d.valorDevolvidoCentavos,
            ap(d.custoQueVolta),
            d.efeitoCentavos,
          ]),
          vazio: 'Nenhuma devolução de venda no período.',
        },
        {
          titulo: 'Devoluções ao fornecedor',
          descricao:
            'Diferença econômica entre o valor recuperado e o custo acumulado do animal; não é lucro de venda de gado.',
          indicadores: [
            { rotulo: 'Animais', valor: rr.devolucoesCompra.animais, tipo: 'inteiro' },
            {
              rotulo: 'Valor recuperado',
              valor: rr.devolucoesCompra.recuperadoCentavos,
              tipo: 'dinheiro',
            },
            { rotulo: 'Custo acumulado', valor: ap(rr.devolucoesCompra.custo), tipo: 'apuracao' },
            {
              rotulo: 'Diferença econômica',
              valor: rr.devolucoesCompra.diferencaCentavos,
              tipo: 'dinheiro',
            },
          ],
        },
      ],
    };
  }

  private custos(f: FiltrosDoRelatorio): Pick<Relatorio, 'visao' | 'avisos' | 'secoes'> {
    const datas = {
      ...(f.dataInicial ? { dataInicial: f.dataInicial } : {}),
      ...(f.dataFinal ? { dataFinal: f.dataFinal } : {}),
    };
    const r = this.s.apropriacao.resumo({ propriedadeId: f.propriedadeId, ...datas });
    const animais: Celula[][] = [];
    for (let pagina = 1; ; pagina++) {
      const pg = this.s.apropriacao.animais({
        propriedadeId: f.propriedadeId,
        ...datas,
        ...(f.loteId ? { loteId: f.loteId } : {}),
        pagina,
        tamanhoPagina: 200,
      });
      for (const a of pg.itens)
        animais.push([
          a.identificacao,
          a.loteNome ?? 'Sem lote',
          SITUACOES_ANIMAL[a.status] ?? a.status,
          ap(a.apuracao),
        ]);
      if (pagina * 200 >= pg.total) break;
    }
    const avisos = [...r.avisos];
    if (!r.conferido) avisos.push('A soma não fecha: não use estes números e registre o problema.');
    return {
      visao: 'Custo apropriado',
      avisos,
      secoes: [
        {
          titulo: 'Resumo',
          descricao:
            'Custo apropriado (não é caixa nem lucro). Animais + lotes sem animais + não alocado = soma de origem.',
          indicadores: [
            { rotulo: 'Chegou aos animais', valor: ap(r.animais.apuracao), tipo: 'apuracao' },
            {
              rotulo: 'Não alocado (propriedade)',
              valor: ap(r.naoAlocado.apuracao),
              tipo: 'apuracao',
            },
            {
              rotulo: 'Em lote sem animais',
              valor: r.lotes.reduce((s, l) => s + l.semAnimaisCentavos, 0),
              tipo: 'dinheiro',
            },
            { rotulo: 'Em centros de produção abertos', valor: ap(r.emProducao), tipo: 'apuracao' },
            {
              rotulo: 'Soma dos custos de origem',
              valor: r.totalDeOrigemCentavos,
              tipo: 'dinheiro',
              observacao: `${r.desconhecidosDeOrigem} custo(s) desconhecido(s) fora da soma`,
            },
            { rotulo: 'Conferência', valor: r.conferido ? 'Fecha' : 'Não fecha', tipo: 'texto' },
          ],
        },
        {
          titulo: 'Por lote',
          colunas: [
            { rotulo: 'Lote', tipo: 'texto' },
            { rotulo: 'Direto', tipo: 'dinheiro' },
            { rotulo: 'Por rateio', tipo: 'dinheiro' },
            { rotulo: 'Total do lote', tipo: 'apuracao' },
            { rotulo: 'Em dias sem animais', tipo: 'dinheiro' },
          ],
          linhas: r.lotes.map((l) => [
            l.loteNome,
            l.diretoCentavos,
            l.rateadoCentavos,
            ap(l.apuracao),
            l.semAnimaisCentavos,
          ]),
          vazio: 'Nenhum custo lançado a lotes.',
        },
        {
          titulo: 'Por animal',
          colunas: [
            { rotulo: 'Animal', tipo: 'texto' },
            { rotulo: 'Lote atual', tipo: 'texto' },
            { rotulo: 'Situação', tipo: 'texto' },
            { rotulo: 'Custo apropriado', tipo: 'apuracao' },
          ],
          linhas: animais,
          vazio: 'Nenhum animal.',
        },
      ],
    };
  }

  private animal(f: FiltrosDoRelatorio): Pick<Relatorio, 'visao' | 'avisos' | 'secoes'> {
    if (!f.animalId) throw invalido(['Escolha o animal.']);
    const e = this.s.apropriacao.animal({
      animalId: f.animalId,
      ...(f.dataInicial ? { dataInicial: f.dataInicial } : {}),
      ...(f.dataFinal ? { dataFinal: f.dataFinal } : {}),
    });
    return {
      visao: 'Custo apropriado',
      avisos: e.avisos,
      secoes: [
        {
          titulo: `Animal ${e.identificacao}`,
          indicadores: [
            { rotulo: 'Custo apropriado', valor: ap(e.apuracao), tipo: 'apuracao' },
            ...e.porCategoria.map((c) => ({
              rotulo: CATEGORIAS[c.categoria],
              valor: c.valorCentavos,
              tipo: 'dinheiro' as const,
            })),
          ],
        },
        {
          titulo: 'De onde veio cada valor',
          colunas: [
            { rotulo: 'Data', tipo: 'data' },
            { rotulo: 'Categoria', tipo: 'texto' },
            { rotulo: 'Origem', tipo: 'texto' },
            { rotulo: 'Como chegou', tipo: 'texto' },
            { rotulo: 'Valor', tipo: 'dinheiro' },
            { rotulo: 'Explicação', tipo: 'texto' },
          ],
          linhas: e.linhas.map((l) => [
            l.data,
            CATEGORIAS[l.categoria],
            l.descricao,
            VIAS[l.via] ?? l.via,
            l.valorCentavos,
            l.explicacao,
          ]),
          vazio: 'Nenhum custo apropriado a este animal.',
        },
      ],
    };
  }

  private lote(f: FiltrosDoRelatorio): Pick<Relatorio, 'visao' | 'avisos' | 'secoes'> {
    if (!f.loteId) throw invalido(['Escolha o lote.']);
    const e = this.s.apropriacao.lote({
      loteId: f.loteId,
      ...(f.dataInicial ? { dataInicial: f.dataInicial } : {}),
      ...(f.dataFinal ? { dataFinal: f.dataFinal } : {}),
    });
    return {
      visao: 'Custo apropriado',
      avisos: [],
      secoes: [
        {
          titulo: e.loteNome,
          descricao:
            'Custos lançados ao lote ou recebidos por rateio; cada um é dividido por igual, dia a dia, entre os animais presentes.',
          indicadores: [{ rotulo: 'Custo do lote', valor: ap(e.apuracao), tipo: 'apuracao' }],
          colunas: [
            { rotulo: 'Data', tipo: 'data' },
            { rotulo: 'Categoria', tipo: 'texto' },
            { rotulo: 'Custo', tipo: 'texto' },
            { rotulo: 'Via', tipo: 'texto' },
            { rotulo: 'Valor', tipo: 'dinheiro' },
          ],
          linhas: e.linhas.map((l) => [
            l.data,
            CATEGORIAS[l.categoria],
            l.descricao,
            l.via === 'rateio' ? 'Rateio' : 'Lançado ao lote',
            l.valorCentavos,
          ]),
          vazio: 'Nenhum custo neste lote.',
        },
      ],
    };
  }

  private lancamentos(f: FiltrosDoRelatorio): Pick<Relatorio, 'visao' | 'avisos' | 'secoes'> {
    const per = this.periodoObrigatorio(f);
    const itens: LancamentoResumo[] = [];
    for (let pagina = 1; ; pagina++) {
      const pg = this.s.financeiro.listar({
        propriedadeId: f.propriedadeId,
        ...per,
        incluirCancelados: false,
        pagina,
        tamanhoPagina: 200,
      } as FiltrosLancamentoValidados);
      itens.push(...pg.itens);
      if (pagina * 200 >= pg.total) break;
    }
    const documentos = f.incluirDocumentos
      ? new Map(this.s.financeiro.listarPessoas(true).map((x) => [x.id, x.documento]))
      : null;
    const colunas = [
      { rotulo: 'Competência', tipo: 'data' as const },
      { rotulo: 'Descrição', tipo: 'texto' as const },
      { rotulo: 'Categoria', tipo: 'texto' as const },
      { rotulo: 'Natureza', tipo: 'texto' as const },
      { rotulo: 'Contraparte', tipo: 'texto' as const },
      ...(documentos ? [{ rotulo: 'Documento da contraparte', tipo: 'texto' as const }] : []),
      { rotulo: 'Valor da operação', tipo: 'dinheiro' as const },
      { rotulo: 'Pago ou recebido', tipo: 'dinheiro' as const },
      { rotulo: 'Compensado (sem caixa)', tipo: 'dinheiro' as const },
      { rotulo: 'Em aberto', tipo: 'dinheiro' as const },
      { rotulo: 'Situação', tipo: 'texto' as const },
    ];
    return {
      visao: 'Lançamentos',
      avisos: [
        ...(documentos ? [] : [TEXTO_SEM_DOCUMENTO]),
        ...(itens.some((l) => l.saldoEmAbertoCentavos === null)
          ? [
              'Lançamentos pendentes de definição têm o valor em aberto desconhecido ("Sem dado"), não zero.',
            ]
          : []),
      ],
      secoes: [
        {
          titulo: 'Lançamentos',
          descricao:
            'Valor da operação, pago ou recebido, compensado em devoluções (sem caixa) e em aberto são números diferentes: operação = pago + compensado + em aberto.',
          colunas,
          linhas: itens.map((l) => [
            l.dataCompetencia,
            l.descricao,
            l.categoria.nome,
            l.natureza === 'receita' ? 'Receita' : 'Despesa',
            l.pessoa?.nome ?? '',
            ...(documentos ? [(l.pessoa ? documentos.get(l.pessoa.id) : null) ?? ''] : []),
            l.valorOperacaoCentavos,
            l.pagoCentavos,
            l.compensadoCentavos,
            l.saldoEmAbertoCentavos,
            SITUACOES_LANCAMENTO[l.situacao] ?? l.situacao,
          ]),
          vazio: 'Nenhum lançamento no período.',
        },
      ],
    };
  }

  private fluxo(f: FiltrosDoRelatorio): Pick<Relatorio, 'visao' | 'avisos' | 'secoes'> {
    const per = this.periodoObrigatorio(f);
    const fl = this.s.caixa.fluxo({
      propriedadeId: f.propriedadeId,
      ...per,
      granularidade: 'mes',
    } as FiltrosFluxoValidados);
    const secoes: Secao[] = [
      {
        titulo: 'Realizado',
        descricao: 'Pagamentos e recebimentos efetivos, pela data do dinheiro. Não é lucro.',
        indicadores: [
          { rotulo: 'Entradas', valor: fl.realizado.entradasCentavos, tipo: 'dinheiro' },
          { rotulo: 'Saídas', valor: fl.realizado.saidasCentavos, tipo: 'dinheiro' },
          { rotulo: 'Saldo do movimento', valor: fl.realizado.saldoCentavos, tipo: 'dinheiro' },
        ],
        colunas: [
          { rotulo: 'De', tipo: 'data' },
          { rotulo: 'Até', tipo: 'data' },
          { rotulo: 'Entradas', tipo: 'dinheiro' },
          { rotulo: 'Saídas', tipo: 'dinheiro' },
          { rotulo: 'Saldo do período', tipo: 'dinheiro' },
          { rotulo: 'Acumulado', tipo: 'dinheiro' },
        ],
        linhas: fl.realizado.linhas.map((l) => [
          l.inicio,
          l.fim,
          l.entradasCentavos,
          l.saidasCentavos,
          l.saldoDoPeriodoCentavos,
          l.acumuladoCentavos,
        ]),
      },
      {
        titulo: 'Previsto (parcelas em aberto)',
        descricao:
          'Previsão pelo vencimento; nunca somada ao realizado. Lançamentos sem condição definida ficam de fora.',
        indicadores: [
          { rotulo: 'A receber', valor: fl.previsto.aReceberCentavos, tipo: 'dinheiro' },
          { rotulo: 'A pagar', valor: fl.previsto.aPagarCentavos, tipo: 'dinheiro' },
          { rotulo: 'Saldo previsto', valor: fl.previsto.saldoPrevistoCentavos, tipo: 'dinheiro' },
        ],
        colunas: [
          { rotulo: 'De', tipo: 'data' },
          { rotulo: 'Até', tipo: 'data' },
          { rotulo: 'A receber', tipo: 'dinheiro' },
          { rotulo: 'A pagar', tipo: 'dinheiro' },
          { rotulo: 'Saldo previsto', tipo: 'dinheiro' },
        ],
        linhas: fl.previsto.linhas.map((l) => [
          l.inicio,
          l.fim,
          l.aReceberCentavos,
          l.aPagarCentavos,
          l.saldoPrevistoCentavos,
        ]),
      },
    ];
    return { visao: 'Caixa', avisos: [], secoes };
  }

  private conciliacao(f: FiltrosDoRelatorio): Pick<Relatorio, 'visao' | 'avisos' | 'secoes'> {
    const per = { propriedadeId: f.propriedadeId, ...this.periodoObrigatorio(f) };
    const c = this.s.resultado.conciliacao(per);
    return {
      visao: 'Conciliação',
      avisos: [
        ...(c.competencia.estado !== 'completo' ? [explicarCompletude(c.competencia)] : []),
        ...(c.custoDesconhecido > 0
          ? [
              `${c.custoDesconhecido} custo(s) de valor desconhecido ficaram fora das somas da competência.`,
            ]
          : []),
        ...(c.competencia.receitasDesconhecidas > 0
          ? [
              `${c.competencia.receitasDesconhecidas} receita(s) sem valor registrado ficaram fora das somas da competência.`,
            ]
          : []),
      ],
      secoes: [
        {
          titulo: 'Totais',
          indicadores: [
            {
              rotulo: 'Resultado (competência, valores conhecidos)',
              valor: c.totais.resultadoCompetenciaCentavos,
              tipo: 'dinheiro',
              observacao: situacaoResultado(c.competencia),
            },
            { rotulo: 'Caixa líquido', valor: c.totais.caixaLiquidoCentavos, tipo: 'dinheiro' },
            { rotulo: 'Diferença', valor: c.totais.diferencaCentavos, tipo: 'dinheiro' },
          ],
        },
        {
          titulo: 'Linhas',
          colunas: [
            { rotulo: 'Linha', tipo: 'texto' },
            { rotulo: 'Receita (competência)', tipo: 'dinheiro' },
            { rotulo: 'Custo (competência)', tipo: 'dinheiro' },
            { rotulo: 'Custos desconhecidos', tipo: 'inteiro' },
            { rotulo: 'Receitas sem valor', tipo: 'inteiro' },
            { rotulo: 'Entradas (caixa)', tipo: 'dinheiro' },
            { rotulo: 'Saídas (caixa)', tipo: 'dinheiro' },
            { rotulo: 'Diferença', tipo: 'dinheiro' },
            { rotulo: 'Explicação', tipo: 'texto' },
          ],
          linhas: c.linhas.map((l) => [
            l.rotulo,
            l.competencia.receitaCentavos,
            l.competencia.custoCentavos,
            l.competencia.desconhecidos,
            l.competencia.receitasDesconhecidas,
            l.caixa.entradasCentavos,
            l.caixa.saidasCentavos,
            l.diferencaCentavos,
            l.explicacao,
          ]),
        },
      ],
    };
  }

  /** Conferência integral: cada verificação diz se fecha e o que fazer quando não fecha. */
  conferencia(f: FiltrosDoRelatorio): Pick<Relatorio, 'visao' | 'avisos' | 'secoes'> {
    const per = this.periodoObrigatorio(f);
    const resumo = this.s.apropriacao.resumo({ propriedadeId: f.propriedadeId });
    const conc = this.s.resultado.conciliacao({ propriedadeId: f.propriedadeId, ...per });
    const res = this.s.resultado.periodo({ propriedadeId: f.propriedadeId, ...per });
    const fluxo = this.s.caixa.fluxo({
      propriedadeId: f.propriedadeId,
      ...per,
      granularidade: 'mes',
    } as FiltrosFluxoValidados);
    const pend = this.s.compraInsumos.pendencias(f.propriedadeId);
    const painel = this.s.caixa.painel({ propriedadeId: f.propriedadeId, ...per } as Parameters<
      ServicoCaixa['painel']
    >[0]);
    const centros = this.s.producao.listar({
      propriedadeId: f.propriedadeId,
      incluirCancelados: false,
    });
    const somaDif = conc.linhas.reduce((s, l) => s + l.diferencaCentavos, 0);
    const linhas: Celula[][] = [
      [
        'Apropriação de custos',
        resumo.conferido ? 'Fecha' : 'Não fecha',
        'Animais + lotes sem animais + não alocado = soma dos custos de origem (todo o histórico).',
      ],
      [
        'Conciliação',
        somaDif === conc.totais.diferencaCentavos ? 'Fecha' : 'Não fecha',
        'Soma das diferenças por linha = diferença entre competência e caixa.',
      ],
      [
        'Caixa',
        conc.totais.caixaLiquidoCentavos === fluxo.realizado.saldoCentavos ? 'Fecha' : 'Não fecha',
        'Caixa da conciliação = saldo realizado do fluxo de caixa.',
      ],
      [
        'Resultado',
        conc.totais.resultadoCompetenciaCentavos === res.competencia.valorConhecidoCentavos &&
        conc.competencia.estado === res.competencia.estado &&
        conc.competencia.limite === res.competencia.limite
          ? 'Fecha'
          : 'Não fecha',
        'Competência da conciliação = resultado do período (valores conhecidos e completude).',
      ],
      [
        'Completude do resultado',
        situacaoResultado(res.competencia),
        explicarCompletude(res.competencia),
      ],
      [
        'Custo desconhecido',
        resumo.desconhecidosDeOrigem === 0 ? 'Nenhum' : `${resumo.desconhecidosDeOrigem} custo(s)`,
        'Custos de origem com valor desconhecido (todo o histórico): complete o custo no Estoque.',
      ],
      [
        'Custo não alocado',
        semComponentes(resumo.naoAlocado.apuracao) ? 'Nenhum' : 'Há custo sem rateio',
        'Custos da propriedade sem rateio (todo o histórico) entram no resultado, mas não chegam a lotes nem animais.',
      ],
      [
        'Lançamentos sem condição de pagamento',
        painel.pendencias.pendentesDeDefinicao.quantidade === 0
          ? 'Nenhum'
          : `${painel.pendencias.pendentesDeDefinicao.quantidade} lançamento(s)`,
        'O saldo a pagar ou receber deles é desconhecido.',
      ],
      [
        'Entradas de estoque sem documento',
        pend.entradasSemDocumento.total === 0
          ? 'Nenhuma'
          : `${pend.entradasSemDocumento.total} entrada(s)`,
        'Ligue à compra de insumos em Pendências.',
      ],
      [
        'Compras para estoque sem entrada',
        pend.comprasSemEntrada.length === 0
          ? 'Nenhuma'
          : `${pend.comprasSemEntrada.length} compra(s)`,
        'Registre a entrada no estoque ou corrija a categoria.',
      ],
      [
        'Devoluções e compensações',
        this.ctx.devolucao.inconsistencias(f.propriedadeId) === 0 ? 'Fecha' : 'Não fecha',
        'Compensações só entre parcelas ativas da negociação original e da devolução; pago + compensado nunca passa da parcela.',
      ],
      [
        'Notas com total diferente dos itens',
        pend.diferencas.length === 0 ? 'Nenhuma' : `${pend.diferencas.length} nota(s)`,
        'Confira os itens da compra.',
      ],
      [
        'Centros de produção abertos',
        centros.filter((c) => c.status === 'aberto').length === 0
          ? 'Nenhum'
          : `${centros.filter((c) => c.status === 'aberto').length} centro(s)`,
        'O custo deles só vira estoque ao encerrar.',
      ],
    ];
    const falhas = linhas.filter((l) => l[1] === 'Não fecha').length;
    return {
      visao: 'Conferência',
      avisos:
        falhas > 0
          ? [`${falhas} verificação(ões) não fecham: não use os números até corrigir.`]
          : [],
      secoes: [
        {
          titulo: 'Verificações',
          colunas: [
            { rotulo: 'Verificação', tipo: 'texto' },
            { rotulo: 'Situação', tipo: 'texto' },
            { rotulo: 'O que significa', tipo: 'texto' },
          ],
          linhas,
        },
      ],
    };
  }
}
