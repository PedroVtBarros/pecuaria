import type { GerenciadorBanco } from '@pecuaria/database';
import { MODELO_CSV, PACOTES_CURADORIA, type PacoteCuradoria } from '@pecuaria/domain';
import { ContextoRebanho } from './contexto';
import { ServicoAnimais } from './servico-animais';
import { ServicoImportacao } from './servico-importacao';
import { ServicoLotes } from './servico-lotes';
import { ServicoPesagens } from './servico-pesagens';
import { ServicoPropriedades, ServicoRacas } from './servico-propriedades';
import { ServicoSanidade } from './servico-sanidade';
import { ServicoEstoque } from '../estoque/servico-estoque';
import { ServicoApropriacao } from '../financeiro/servico-apropriacao';
import { ServicoProducao } from '../financeiro/servico-producao';
import { ServicoResultado } from '../financeiro/servico-resultado';
import { ServicoDevolucao } from '../financeiro/servico-devolucao';
import { ServicoRelatorios } from '../financeiro/servico-relatorios';
import { ServicoRateio } from '../financeiro/servico-rateio';
import { ServicoCaixa } from '../financeiro/servico-caixa';
import { ServicoClassificacao } from '../financeiro/servico-classificacao';
import { ServicoCompraInsumos } from '../financeiro/servico-compra-insumos';
import { ServicoCustoAnimal } from '../financeiro/servico-custo-animal';
import { ServicoCustosEstoque } from '../financeiro/servico-custos-estoque';
import { ServicoFinanceiro } from '../financeiro/servico-financeiro';
import { ServicoNegociacao } from '../financeiro/servico-negociacao';
import { ServicoAlimentos } from '../alimentos/servico-alimentos';
import { ServicoComposicao } from '../alimentos/servico-composicao';
import { ServicoAtalhosAlimentos } from '../alimentos/servico-atalhos-alimentos';
import { ServicoCuradoria } from '../alimentos/servico-curadoria';
import { ServicoSelecao } from '../alimentos/servico-selecao';
import { ServicoExigencias } from '../nutricao/servico-exigencias';
import { ServicoAvaliacaoDieta } from '../nutricao/servico-avaliacao-dieta';
import { ServicoRegistroAvaliacao } from '../nutricao/servico-registro-avaliacao';

export function criarServicosRebanho(
  gerenciador: GerenciadorBanco,
  opcoes: {
    relogio?: () => Date;
    gerarId?: () => string;
    /** Pacotes de curadoria embutidos; os testes passam pacotes fictícios. */
    pacotesCuradoria?: readonly PacoteCuradoria[];
  } = {},
) {
  const ctx = new ContextoRebanho(gerenciador, opcoes.relogio, opcoes.gerarId);
  const animais = new ServicoAnimais(ctx);
  const pesagens = new ServicoPesagens(ctx);
  const estoque = new ServicoEstoque(gerenciador, opcoes);
  const alimentos = new ServicoAlimentos(gerenciador, opcoes);
  const composicao = new ServicoComposicao(gerenciador, opcoes);
  const financeiro = new ServicoFinanceiro(gerenciador, opcoes);
  const apropriacao = new ServicoApropriacao(ctx);
  const caixa = new ServicoCaixa(gerenciador, opcoes);
  const compraInsumos = new ServicoCompraInsumos(gerenciador, estoque, financeiro, opcoes);
  const producao = new ServicoProducao(ctx, estoque);
  const resultado = new ServicoResultado(ctx, apropriacao);
  const devolucao = new ServicoDevolucao(ctx, animais, financeiro);
  const selecao = new ServicoSelecao(gerenciador, alimentos, composicao, undefined, opcoes);
  const exigencias = new ServicoExigencias();
  const avaliacaoDieta = new ServicoAvaliacaoDieta(selecao, composicao, alimentos, exigencias);
  return {
    alimentos,
    composicao,
    atalhosAlimentos: new ServicoAtalhosAlimentos(gerenciador, alimentos, composicao, opcoes),
    curadoria: new ServicoCuradoria(
      gerenciador,
      alimentos,
      composicao,
      opcoes.pacotesCuradoria ?? PACOTES_CURADORIA,
      opcoes,
    ),
    selecao,
    exigencias,
    avaliacaoDieta,
    registroAvaliacao: new ServicoRegistroAvaliacao(gerenciador, avaliacaoDieta, opcoes),
    estoque,
    financeiro,
    caixa,
    negociacao: new ServicoNegociacao(ctx, animais, financeiro, devolucao),
    devolucao,
    compraInsumos,
    custosEstoque: new ServicoCustosEstoque(gerenciador, estoque, financeiro, opcoes),
    custoAnimal: new ServicoCustoAnimal(ctx),
    apropriacao,
    rateio: new ServicoRateio(ctx, apropriacao),
    producao,
    resultado,
    relatorios: new ServicoRelatorios(ctx, {
      resultado,
      apropriacao,
      financeiro,
      caixa,
      compraInsumos,
      producao,
    }),
    classificacao: new ServicoClassificacao(gerenciador, financeiro, opcoes),
    propriedades: new ServicoPropriedades(ctx),
    racas: new ServicoRacas(ctx),
    lotes: new ServicoLotes(ctx),
    animais,
    pesagens,
    sanidade: new ServicoSanidade(ctx, pesagens, estoque),
    importacao: new ServicoImportacao(ctx, animais),
    /** Com BOM e quebras CRLF, para o Excel no Windows abrir os acentos corretamente. */
    modeloCsv: `\uFEFF${MODELO_CSV.replace(/\n/g, '\r\n')}`,
  };
}
