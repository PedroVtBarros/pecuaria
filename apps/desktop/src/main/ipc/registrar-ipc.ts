import { CANAIS_API, type CanalApi } from '@pecuaria/shared-types';
import type { Logger, ServicoBackup } from '@pecuaria/database';
import type { ServicoConfiguracao } from '../services/servico-configuracao';
import type { ServicoSistema } from '../services/servico-sistema';
import type { ServicoAnimais } from '../services/rebanho/servico-animais';
import type { ServicoImportacao } from '../services/rebanho/servico-importacao';
import type { ServicoLotes } from '../services/rebanho/servico-lotes';
import type { ServicoPesagens } from '../services/rebanho/servico-pesagens';
import type { ServicoPropriedades, ServicoRacas } from '../services/rebanho/servico-propriedades';
import type { ServicoSanidade } from '../services/rebanho/servico-sanidade';
import type { ServicoEstoque } from '../services/estoque/servico-estoque';
import type { ServicoCaixa } from '../services/financeiro/servico-caixa';
import type { ServicoApropriacao } from '../services/financeiro/servico-apropriacao';
import type { ServicoProducao } from '../services/financeiro/servico-producao';
import type { ServicoResultado } from '../services/financeiro/servico-resultado';
import type { ServicoRelatorios } from '../services/financeiro/servico-relatorios';
import type { ServicoDevolucao } from '../services/financeiro/servico-devolucao';
import { gerarCsv } from '../relatorios/csv';
import { gerarHtml } from '../relatorios/html';
import type { ServicoRateio } from '../services/financeiro/servico-rateio';
import type { ServicoClassificacao } from '../services/financeiro/servico-classificacao';
import type { ServicoCompraInsumos } from '../services/financeiro/servico-compra-insumos';
import type { ServicoCustoAnimal } from '../services/financeiro/servico-custo-animal';
import type { ServicoCustosEstoque } from '../services/financeiro/servico-custos-estoque';
import type { ServicoFinanceiro } from '../services/financeiro/servico-financeiro';
import type { ServicoNegociacao } from '../services/financeiro/servico-negociacao';
import type { ServicoAlimentos } from '../services/alimentos/servico-alimentos';
import type { ServicoComposicao } from '../services/alimentos/servico-composicao';
import type { ServicoAtalhosAlimentos } from '../services/alimentos/servico-atalhos-alimentos';
import type { ServicoCuradoria } from '../services/alimentos/servico-curadoria';
import type { ServicoSelecao } from '../services/alimentos/servico-selecao';
import type { ServicoExigencias } from '../services/nutricao/servico-exigencias';
import type { ServicoAvaliacaoDieta } from '../services/nutricao/servico-avaliacao-dieta';
import type { ServicoRegistroAvaliacao } from '../services/nutricao/servico-registro-avaliacao';
import type { RemetenteIpc } from '../seguranca';
import { criarManipulador, type Executor } from './criar-manipulador';

/** Diálogos nativos. Interface separada para os testes poderem substituí-los. */
export interface Dialogos {
  escolherDestinoExportacao(nomeSugerido: string): Promise<string | null>;
  escolherArquivoParaImportar(): Promise<string | null>;
  /** Pede onde salvar o modelo de planilha e grava o conteúdo. */
  salvarArquivoDeTexto(nomeSugerido: string, conteudo: string): Promise<string | null>;
  /**
   * Pede onde salvar o relatório e grava: o CSV como texto; o PDF a partir do HTML, impresso numa
   * janela oculta sem rede nem script (ver `relatorios/pdf.ts`).
   */
  salvarRelatorio(
    nomeSugerido: string,
    formato: 'csv' | 'pdf',
    conteudo: string,
  ): Promise<{ caminho: string; bytes: number } | null>;
}

export interface ServicosIpc {
  alimentos: ServicoAlimentos;
  composicao: ServicoComposicao;
  atalhosAlimentos: ServicoAtalhosAlimentos;
  curadoria: ServicoCuradoria;
  selecao: ServicoSelecao;
  exigencias: ServicoExigencias;
  avaliacaoDieta: ServicoAvaliacaoDieta;
  registroAvaliacao: ServicoRegistroAvaliacao;
  estoque: ServicoEstoque;
  financeiro: ServicoFinanceiro;
  caixa: ServicoCaixa;
  negociacao: ServicoNegociacao;
  custoAnimal: ServicoCustoAnimal;
  compraInsumos: ServicoCompraInsumos;
  custosEstoque: ServicoCustosEstoque;
  classificacao: ServicoClassificacao;
  apropriacao: ServicoApropriacao;
  rateio: ServicoRateio;
  producao: ServicoProducao;
  resultado: ServicoResultado;
  relatorios: ServicoRelatorios;
  devolucao: ServicoDevolucao;
  sistema: ServicoSistema;
  configuracao: ServicoConfiguracao;
  backup: ServicoBackup;
  propriedades: ServicoPropriedades;
  racas: ServicoRacas;
  lotes: ServicoLotes;
  animais: ServicoAnimais;
  pesagens: ServicoPesagens;
  sanidade: ServicoSanidade;
  importacao: ServicoImportacao;
  /** Conteúdo do modelo de planilha de animais. */
  modeloCsv: string;
}

export interface RegistradorIpc {
  handle(
    canal: string,
    manipulador: (evento: RemetenteIpc, entrada: unknown) => Promise<unknown>,
  ): void;
}

type Executores = { [C in CanalApi]: Executor<C> };

/** Mapa canal → executor. O tipo obriga a existir executor para todo canal. */
export function criarExecutores(
  servicos: ServicosIpc,
  dialogos: Dialogos,
  logger: Logger,
): Executores {
  const { propriedades, racas, lotes, animais, pesagens, sanidade, importacao } = servicos;
  return {
    'sistema:obterInfo': () => servicos.sistema.obterInfo(),
    'sistema:abrirPasta': ({ pasta }) => servicos.sistema.abrirPasta(pasta),
    'configuracao:obter': ({ chave }) => ({ valor: servicos.configuracao.obter(chave) }),
    'configuracao:definir': ({ chave, valor }) => {
      servicos.configuracao.definir(chave, valor);
      return null;
    },
    'backup:listar': () => servicos.backup.listar(),
    'backup:criar': ({ observacao }) => servicos.backup.criar('manual', observacao),
    'backup:restaurar': ({ id }) => servicos.backup.restaurar(id),
    'backup:exportar': async ({ id }) => {
      const destino = await dialogos.escolherDestinoExportacao(id);
      if (!destino) return { cancelado: true };
      const caminho = await servicos.backup.exportar(id, destino);
      return { cancelado: false, dados: { caminho } };
    },
    'backup:importarERestaurar': async () => {
      const origem = await dialogos.escolherArquivoParaImportar();
      if (!origem) return { cancelado: true };
      return { cancelado: false, dados: await servicos.backup.importarERestaurar(origem) };
    },
    'log:registrar': ({ nivel, mensagem, pilha, origem }) => {
      logger[nivel](`[renderer] ${mensagem}`, { pilha, origem });
      return null;
    },

    'estoque:listar': ({ propriedadeId, incluirInativos }) =>
      servicos.estoque.listar(propriedadeId, incluirInativos),
    'estoque:obter': ({ id }) => servicos.estoque.obter(id),
    'estoque:criarItem': ({ propriedadeId, dados }) =>
      servicos.estoque.criarItem(propriedadeId, dados),
    'estoque:atualizarItem': ({ id, dados, motivo }) =>
      servicos.estoque.atualizarItem(id, dados, motivo),
    'estoque:criarLote': ({ itemId, dados }) => servicos.estoque.criarLote(itemId, dados),
    'estoque:atualizarLote': ({ id, dados, motivo }) =>
      servicos.estoque.atualizarLote(id, dados, motivo),
    'estoque:registrar': ({ itemId, requisicaoId, dados }) =>
      servicos.estoque.registrar(itemId, requisicaoId, dados),
    'estoque:corrigir': ({ id, requisicaoId, dados, motivo }) =>
      servicos.estoque.corrigir(id, requisicaoId, dados, motivo),
    'estoque:cancelar': ({ id, motivo }) => servicos.estoque.cancelar(id, motivo),
    'estoque:prever': ({ itemId, dados, substituiId }) =>
      servicos.estoque.prever(itemId, dados, substituiId),
    'estoque:alertas': ({ propriedadeId }) => servicos.estoque.alertas(propriedadeId),
    'estoque:extrato': (filtros) => servicos.estoque.extrato(filtros),
    'pessoaComercial:listar': ({ incluirInativas }) =>
      servicos.financeiro.listarPessoas(incluirInativas),
    'pessoaComercial:criar': ({ dados }) => servicos.financeiro.criarPessoa(dados),
    'pessoaComercial:atualizar': ({ id, dados, motivo }) =>
      servicos.financeiro.atualizarPessoa(id, dados, motivo),
    'categoriaFinanceira:listar': ({ incluirInativas }) =>
      servicos.financeiro.listarCategorias(incluirInativas),
    'categoriaFinanceira:criar': ({ dados }) => servicos.financeiro.criarCategoria(dados),
    'categoriaFinanceira:atualizar': ({ id, dados, motivo }) =>
      servicos.financeiro.atualizarCategoria(id, dados, motivo),
    'lancamento:listar': (filtros) => servicos.financeiro.listar(filtros),
    'lancamento:obter': ({ id }) => servicos.financeiro.obter(id),
    'lancamento:criar': ({ requisicaoId, dados }) => servicos.financeiro.criar(requisicaoId, dados),
    'lancamento:atualizar': ({ id, dados, motivo }) =>
      servicos.financeiro.atualizar(id, dados, motivo),
    'lancamento:cancelar': ({ id, motivo }) => servicos.financeiro.cancelar(id, motivo),
    'lancamento:definirPagamento': ({ id, condicao }) =>
      servicos.financeiro.definirPagamento(id, condicao),
    'lancamento:renegociar': ({ id, novasParcelas, novoTotalCentavos, motivo }) =>
      servicos.financeiro.renegociar(id, novasParcelas, novoTotalCentavos, motivo),
    'pagamento:registrar': ({ parcelaId, requisicaoId, dados }) =>
      servicos.financeiro.registrarPagamento(parcelaId, requisicaoId, dados),
    'pagamento:estornar': ({ id, motivo }) => servicos.financeiro.estornarPagamento(id, motivo),
    'fluxo:obter': (filtros) => servicos.caixa.fluxo(filtros),
    'conta:listar': (filtros) => servicos.caixa.contas(filtros),
    'painel:obter': (filtros) => servicos.caixa.painel(filtros),
    'classificacao:resumo': (filtros) => servicos.classificacao.resumo(filtros),
    'classificacao:previa': ({ propriedadeId, categoriaId }) =>
      servicos.classificacao.previa(propriedadeId, categoriaId),
    'classificacao:aplicarCategoria': (dados) => servicos.classificacao.aplicarCategoria(dados),
    'classificacao:definirLancamento': ({ id, comportamento, motivo }) =>
      servicos.classificacao.definirLancamento(id, comportamento, motivo),
    'rateio:pendentes': ({ propriedadeId }) => servicos.rateio.pendentes(propriedadeId),
    'rateio:previa': (dados) => servicos.rateio.previa(dados),
    'rateio:criar': (dados) => servicos.rateio.criar(dados),
    'rateio:revisar': (dados) => servicos.rateio.revisar(dados),
    'rateio:cancelar': ({ id, motivo }) => servicos.rateio.cancelar(id, motivo),
    'rateio:listar': (filtros) => servicos.rateio.listar(filtros),
    'rateio:obter': ({ id }) => servicos.rateio.obter(id),
    'custo:resumo': (filtros) => servicos.apropriacao.resumo(filtros),
    'custo:lote': (filtros) => servicos.apropriacao.lote(filtros),
    'custo:animais': (filtros) => servicos.apropriacao.animais(filtros),
    'custo:animal': (filtros) => servicos.apropriacao.animal(filtros),
    'relatorio:montar': ({ tipo, filtros }) => servicos.relatorios.montar(tipo, filtros),
    'devolucao:prever': (d) => servicos.devolucao.prever(d),
    'devolucao:registrar': (d) => servicos.devolucao.registrar(d),
    'devolucao:obter': ({ id }) => servicos.devolucao.obter(id),
    'devolucao:cancelar': ({ id, motivo }) => servicos.devolucao.cancelar(id, motivo),
    'fonte:listar': (filtros) => servicos.alimentos.listarFontes(filtros),
    'fonte:obter': ({ id }) => servicos.alimentos.obterFonte(id),
    'fonte:criar': ({ dados }) => servicos.alimentos.criarFonte(dados),
    'fonte:atualizar': ({ id, dados, motivo }) =>
      servicos.alimentos.atualizarFonte(id, dados, motivo),
    'fonte:excluir': ({ id, motivo }) => servicos.alimentos.excluirFonte(id, motivo),
    'nutriente:listar': ({ incluirInativos }) =>
      servicos.alimentos.listarNutrientes(incluirInativos),
    'nutriente:criar': ({ dados }) => servicos.alimentos.criarNutriente(dados),
    'nutriente:atualizar': ({ id, dados, motivo }) =>
      servicos.alimentos.atualizarNutriente(id, dados, motivo),
    'alimento:listar': (filtros) => servicos.alimentos.listarAlimentos(filtros),
    'alimento:obter': ({ id, propriedadeId }) =>
      servicos.alimentos.obterAlimento(id, propriedadeId),
    'vinculoAlimento:obter': ({ itemId }) => servicos.alimentos.obterVinculo(itemId),
    'vinculoAlimento:definir': ({ itemId, alimentoId }) =>
      servicos.alimentos.definirVinculo(itemId, alimentoId),
    'rotulo:registrar': (d) => servicos.atalhosAlimentos.registrarRotulo(d),
    'laudo:registrar': (d) => servicos.atalhosAlimentos.registrarLaudo(d),
    'medicaoMs:registrar': (d) => servicos.atalhosAlimentos.registrarMedicaoMs(d),
    'composicao:listar': (filtros) => servicos.composicao.listar(filtros),
    'composicao:obter': ({ id }) => servicos.composicao.obter(id),
    'composicao:criar': ({ dados }) => servicos.composicao.criar(dados),
    'composicao:atualizar': ({ id, dados }) => servicos.composicao.atualizar(id, dados),
    'composicao:salvarValor': ({ registroId, valorId, dados }) =>
      servicos.composicao.salvarValor(registroId, valorId, dados),
    'composicao:removerValor': ({ registroId, valorId }) =>
      servicos.composicao.removerValor(registroId, valorId),
    'composicao:salvarNaoQuantificado': ({ registroId, valorId, dados }) =>
      servicos.composicao.salvarNaoQuantificado(registroId, valorId, dados),
    'composicao:removerNaoQuantificado': ({ registroId, valorId }) =>
      servicos.composicao.removerNaoQuantificado(registroId, valorId),
    'composicao:transcrever': ({ id, responsavel }) =>
      servicos.composicao.transcrever(id, responsavel),
    'composicao:devolver': ({ id, motivo }) => servicos.composicao.devolver(id, motivo),
    'composicao:conferir': ({ id, responsavel }) => servicos.composicao.conferir(id, responsavel),
    'composicao:rejeitar': ({ id, responsavel, motivo }) =>
      servicos.composicao.rejeitar(id, responsavel, motivo),
    'composicao:reabrir': ({ id }) => servicos.composicao.reabrir(id),
    'composicao:novaVersao': ({ id, motivo }) => servicos.composicao.novaVersao(id, motivo),
    'composicao:descartar': ({ id, motivo }) => servicos.composicao.descartar(id, motivo),
    'vinculoOrigem:decidir': ({ registroId, vinculoId, decisao, responsavel, motivo }) =>
      servicos.composicao.decidirVinculo(registroId, vinculoId, decisao, responsavel, motivo),
    'curadoria:listar': () => servicos.curadoria.listar(),
    'curadoria:importar': ({ codigo, versao }) => servicos.curadoria.importar(codigo, versao),
    'curadoria:atualizar': ({ codigo, versao }) => servicos.curadoria.atualizar(codigo, versao),
    'nutricao:calcularExigencias': (entrada) => servicos.exigencias.calcular(entrada),
    'nutricao:avaliarDieta': (entrada) => servicos.avaliacaoDieta.avaliar(entrada),
    'nutricao:perfisParaDieta': () => servicos.avaliacaoDieta.perfisParaDieta(),
    'nutricao:registrarAvaliacao': (d) => servicos.registroAvaliacao.registrar(d),
    'nutricao:listarAvaliacoes': () => servicos.registroAvaliacao.listar(),
    'nutricao:obterAvaliacao': ({ id }) => servicos.registroAvaliacao.obter(id),
    'nutricao:anularAvaliacao': ({ id, motivo, responsavel }) =>
      servicos.registroAvaliacao.anular(id, motivo, responsavel),
    'selecao:regras': () => servicos.selecao.regras(),
    'selecao:aprovarRegra': ({ codigo, versao, responsavel, observacao }) =>
      servicos.selecao.aprovarRegra(codigo, versao, responsavel, observacao),
    'selecao:executar': ({ alimentoId, idadeCorteDias, escolhas }) =>
      servicos.selecao.executar(alimentoId, idadeCorteDias, escolhas),
    'perfil:gravar': (d) => servicos.selecao.gravarPerfil(d),
    'perfil:listar': ({ alimentoId }) => servicos.selecao.listarPerfis(alimentoId),
    'perfil:obter': ({ id }) => servicos.selecao.obterPerfil(id),
    'avaliacao:marcar': ({ registroId, valorId, tipo, motivo, responsavel }) =>
      servicos.selecao.marcarAvaliacao(registroId, valorId, tipo, motivo, responsavel),
    'avaliacao:retirar': ({ registroId, avaliacaoId, motivo, responsavel }) =>
      servicos.selecao.retirarAvaliacao(registroId, avaliacaoId, motivo, responsavel),
    'alimento:criar': ({ dados }) => servicos.alimentos.criarAlimento(dados),
    'alimento:atualizar': ({ id, dados, motivo }) =>
      servicos.alimentos.atualizarAlimento(id, dados, motivo),
    'alimento:excluir': ({ id, motivo }) => servicos.alimentos.excluirAlimento(id, motivo),
    'relatorio:exportar': async ({ tipo, formato, filtros }) => {
      const relatorio = servicos.relatorios.montar(tipo, filtros);
      const conteudo = formato === 'csv' ? gerarCsv(relatorio) : gerarHtml(relatorio);
      const salvo = await dialogos.salvarRelatorio(relatorio.nomeArquivo, formato, conteudo);
      return salvo ? { cancelado: false, dados: salvo } : { cancelado: true };
    },
    'resultado:periodo': (f) => servicos.resultado.periodo(f),
    'resultado:realizado': (f) => servicos.resultado.realizado(f),
    'resultado:indicadores': (f) => servicos.resultado.indicadores(f),
    'resultado:conciliacao': (f) => servicos.resultado.conciliacao(f),
    'resultado:pontoEquilibrio': (f) => servicos.resultado.pontoDeEquilibrio(f),
    'projecao:calcular': (d) => servicos.resultado.projecao(d),
    'producao:listar': (filtros) => servicos.producao.listar(filtros),
    'producao:obter': ({ id }) => servicos.producao.obter(id),
    'producao:criar': ({ requisicaoId, propriedadeId, dados }) =>
      servicos.producao.criar(requisicaoId, propriedadeId, dados),
    'producao:atualizar': (dados) => servicos.producao.atualizar(dados),
    'producao:cancelar': ({ id, motivo }) => servicos.producao.cancelar(id, motivo),
    'producao:candidatos': ({ id }) => servicos.producao.candidatos(id),
    'producao:vincular': ({ id, tipo, origemId }) => servicos.producao.vincular(id, tipo, origemId),
    'producao:desvincular': ({ id, tipo, origemId }) =>
      servicos.producao.desvincular(id, tipo, origemId),
    'producao:encerrar': (dados) => servicos.producao.encerrar(dados),
    'producao:reabrir': ({ id, motivo }) => servicos.producao.reabrir(id, motivo),
    'negociacao:listar': (filtros) => servicos.negociacao.listar(filtros),
    'negociacao:obter': ({ id }) => servicos.negociacao.obter(id),
    'negociacao:registrarCompra': (dados) => servicos.negociacao.registrarCompra(dados),
    'negociacao:registrarVenda': (dados) => servicos.negociacao.registrarVenda(dados),
    'negociacao:cancelar': ({ id, motivo, destino }) =>
      servicos.negociacao.cancelar(id, motivo, destino),
    'animal:desfazerSaida': ({ id, motivo, destino }) =>
      servicos.animais.desfazerSaida(id, motivo, destino),
    'custoAnterior:listar': (filtros) => servicos.custoAnimal.listar(filtros),
    'custoAnterior:registrar': (dados) => servicos.custoAnimal.registrar(dados),
    'custoAnterior:cancelar': ({ id, motivo }) => servicos.custoAnimal.cancelar(id, motivo),
    'custoAnimal:obter': ({ animalId }) => servicos.custoAnimal.custoDoAnimal(animalId),
    'compraInsumo:listar': ({ propriedadeId, incluirCanceladas, pagina, tamanhoPagina }) =>
      servicos.compraInsumos.listar(propriedadeId, incluirCanceladas, pagina, tamanhoPagina),
    'compraInsumo:obter': ({ lancamentoId }) => servicos.compraInsumos.obter(lancamentoId),
    'compraInsumo:registrar': (dados) => servicos.compraInsumos.registrar(dados),
    'compraInsumo:corrigirItem': (dados) => servicos.compraInsumos.corrigirItem(dados),
    'compraInsumo:cancelar': ({ lancamentoId, motivo }) =>
      servicos.compraInsumos.cancelar(lancamentoId, motivo),
    'compraInsumo:vincularEntrada': ({ movimentacaoId, lancamentoId }) =>
      servicos.compraInsumos.vincularEntrada(movimentacaoId, lancamentoId),
    'compraInsumo:criarDaEntrada': (dados) => servicos.compraInsumos.criarDaEntrada(dados),
    'auditoria:pendencias': ({ propriedadeId }) => servicos.compraInsumos.pendencias(propriedadeId),
    'consumo:listar': (filtros) => servicos.custosEstoque.listar(filtros),
    'consumo:resumo': (filtros) => servicos.custosEstoque.resumo(filtros),
    'custoSanitario:obter': ({ manejoId }) => servicos.custosEstoque.obterCustoSanitario(manejoId),
    'custoSanitario:lancarServico': (dados) => servicos.custosEstoque.lancarServico(dados),
    'classificacaoOrigem:listar': ({ propriedadeId }) =>
      servicos.custosEstoque.listarClassificacoes(propriedadeId),
    'classificacaoOrigem:definir': ({ propriedadeId, escopo, referenciaId, comportamento }) =>
      servicos.custosEstoque.definirClassificacao(
        propriedadeId,
        escopo,
        referenciaId,
        comportamento,
      ),
    'propriedade:listar': () => propriedades.listar(),
    'propriedade:criar': ({ dados }) => propriedades.criar(dados),
    'propriedade:atualizar': ({ id, dados }) => propriedades.atualizar(id, dados),
    'propriedade:excluir': ({ id }) => propriedades.excluir(id),

    'area:listar': ({ propriedadeId }) => propriedades.listarAreas(propriedadeId),
    'area:criar': ({ propriedadeId, dados }) => propriedades.criarArea(propriedadeId, dados),
    'area:atualizar': ({ id, dados }) => propriedades.atualizarArea(id, dados),
    'area:excluir': ({ id }) => propriedades.excluirArea(id),

    'raca:listar': () => racas.listar(),
    'raca:criar': ({ dados }) => racas.criar(dados),
    'raca:atualizar': ({ id, dados }) => racas.atualizar(id, dados),
    'raca:excluir': ({ id }) => racas.excluir(id),

    'lote:listar': ({ propriedadeId, incluirEncerrados }) =>
      lotes.listar(propriedadeId, incluirEncerrados ?? false),
    'lote:obter': ({ id }) => lotes.obterDetalhe(id),
    'lote:criar': ({ propriedadeId, dados }) => lotes.criar(propriedadeId, dados),
    'lote:atualizar': ({ id, dados }) => lotes.atualizar(id, dados),
    'lote:moverArea': ({ id, areaId, data, observacao }) =>
      lotes.moverArea(id, areaId, data, observacao),
    'lote:encerrar': ({ id, data }) => lotes.encerrar(id, data),
    'lote:reabrir': ({ id }) => lotes.reabrir(id),

    'animal:listar': ({ propriedadeId, filtros }) => animais.listar(propriedadeId, filtros),
    'animal:obter': ({ id }) => animais.obter(id),
    'animal:criar': ({ propriedadeId, dados, entrada }) =>
      animais.criar(propriedadeId, dados, entrada),
    'animal:atualizar': ({ id, dados, motivo }) => animais.atualizar(id, dados, motivo ?? null),
    'animal:transferir': ({ animalIds, loteDestinoId, data, motivo }) =>
      animais.transferir(animalIds, loteDestinoId, data, motivo),
    'animal:registrarSaida': ({ id, tipo, data, motivo }) =>
      animais.registrarSaida(id, tipo, data, motivo),
    'animal:excluir': ({ id, motivo }) => animais.excluir(id, motivo),
    'animal:historico': ({ id }) => animais.historico(id),
    'animal:importarCsv': ({ propriedadeId, conteudo, confirmar }) =>
      importacao.importar(propriedadeId, conteudo, confirmar),
    'animal:salvarModeloCsv': async () => {
      const caminho = await dialogos.salvarArquivoDeTexto(
        'modelo-importacao-animais.csv',
        servicos.modeloCsv,
      );
      return caminho ? { cancelado: false, dados: { caminho } } : { cancelado: true };
    },

    'pesagem:listar': ({ animalId }) => pesagens.listar(animalId),
    'pesagem:registrar': ({ animalId, dados, justificativa }) =>
      pesagens.registrar(animalId, dados, justificativa),
    'pesagem:atualizar': ({ id, dados, motivo, justificativa }) =>
      pesagens.atualizar(id, dados, motivo, justificativa),
    'pesagem:excluir': ({ id, motivo }) => pesagens.excluir(id, motivo),
    'pesagem:conferir': ({ id, justificativa }) => pesagens.conferir(id, justificativa),
    'pesagem:registrarLote': ({ propriedadeId, pesagem, confirmar }) =>
      pesagens.registrarLote(propriedadeId, pesagem, confirmar),
    'pesagem:alertas': ({ propriedadeId, incluirConferidas }) =>
      pesagens.alertas(propriedadeId, incluirConferidas),
    'lote:evolucao': ({ id }) => pesagens.evolucaoLote(id),

    'produtoSanitario:listar': () => sanidade.listarProdutos(),
    'produtoSanitario:criar': ({ dados }) => sanidade.criarProduto(dados),
    'produtoSanitario:atualizar': ({ id, dados }) => sanidade.atualizarProduto(id, dados),
    'produtoSanitario:excluir': ({ id }) => sanidade.excluirProduto(id),
    'manejoSanitario:listar': ({ propriedadeId, filtros }) =>
      sanidade.listarManejos(propriedadeId, filtros),
    'manejoSanitario:obter': ({ id }) => sanidade.obterManejo(id),
    'manejoSanitario:registrar': ({
      propriedadeId,
      dados,
      animais: lista,
      loteId,
      agendaId,
      proximaAplicacao,
      consumosEstoque,
    }) =>
      sanidade.registrarManejo(
        propriedadeId,
        dados,
        lista,
        loteId,
        agendaId,
        proximaAplicacao,
        consumosEstoque,
      ),
    'manejoSanitario:atualizar': ({
      id,
      dados,
      motivo,
      consumosEstoque,
      confirmarConsumoMantido,
    }) => sanidade.atualizarManejo(id, dados, motivo, consumosEstoque, confirmarConsumoMantido),
    'manejoSanitario:removerAnimal': ({ manejoId, animalId, motivo, confirmarConsumoMantido }) =>
      sanidade.removerAnimal(manejoId, animalId, motivo, confirmarConsumoMantido),
    'manejoSanitario:excluir': ({ id, motivo, estornarEstoque }) =>
      sanidade.excluirManejo(id, motivo, estornarEstoque),
    'sanidade:doAnimal': ({ animalId }) => sanidade.doAnimal(animalId),
    'sanidade:resumo': ({ propriedadeId }) => sanidade.resumo(propriedadeId),
    'agendaSanitaria:listar': ({ propriedadeId, incluirConcluidos }) =>
      sanidade.listarAgenda(propriedadeId, incluirConcluidos),
    'agendaSanitaria:criar': ({ propriedadeId, dados }) =>
      sanidade.criarAgenda(propriedadeId, dados),
    'agendaSanitaria:atualizar': ({ id, dados, motivo }) =>
      sanidade.atualizarAgenda(id, dados, motivo),
    'agendaSanitaria:cancelar': ({ id, motivo }) => sanidade.cancelarAgenda(id, motivo),
  };
}

export function registrarIpc(
  registrador: RegistradorIpc,
  executores: Executores,
  deps: { validarRemetente: (evento: RemetenteIpc) => boolean; logger: Logger },
): void {
  for (const canal of CANAIS_API) {
    const executor = executores[canal] as Executor<typeof canal>;
    registrador.handle(canal, criarManipulador(canal, executor, deps));
  }
  deps.logger.debug('Canais IPC registrados', { canais: [...CANAIS_API] });
}
