import { gerarUuidV7, somarCentavos, type ComportamentoLancamento } from '@pecuaria/domain';
import {
  ErroAplicacao,
  type ClassificacaoDaCategoria,
  type FaixaClassificacao,
  type LancamentoDetalhe,
  type PreviaClassificacao,
  type ResultadoClassificacaoEmLote,
  type ResumoClassificacao,
} from '@pecuaria/shared-types';
import {
  RepositorioFinanceiro,
  RepositorioHistorico,
  RepositorioPropriedades,
  type AcaoHistorico,
  type EntidadeHistorico,
  type GerenciadorBanco,
} from '@pecuaria/database';
import type { ServicoFinanceiro } from './servico-financeiro';

function invalido(mensagem: string): never {
  throw new ErroAplicacao('OPERACAO_INVALIDA', mensagem);
}

const FAIXA_VAZIA: FaixaClassificacao = { quantidade: 0, valorCentavos: 0 };

/**
 * Classificação de despesas em fixas ou variáveis (decisão D-E, entrega 4B).
 *
 * O padrão da categoria é copiado para cada lançamento novo e mudar o padrão depois NÃO reescreve
 * lançamentos antigos. A única forma de classificar em lote é a ação explícita abaixo: só atinge
 * lançamentos "não classificados", mostra a prévia, confere se nada mudou e deixa trilha.
 * Valor não classificado nunca entra em silêncio em indicador que dependa da classificação.
 */
export class ServicoClassificacao {
  private readonly repo: RepositorioFinanceiro;
  private readonly propriedades: RepositorioPropriedades;
  private readonly historico: RepositorioHistorico;
  private readonly relogio: () => Date;
  private readonly gerarId: () => string;

  constructor(
    private readonly banco: GerenciadorBanco,
    private readonly financeiro: ServicoFinanceiro,
    opcoes: { relogio?: () => Date; gerarId?: () => string } = {},
  ) {
    const db = () => banco.conexao;
    this.repo = new RepositorioFinanceiro(db);
    this.propriedades = new RepositorioPropriedades(db);
    this.historico = new RepositorioHistorico(db);
    this.relogio = opcoes.relogio ?? (() => new Date());
    this.gerarId = opcoes.gerarId ?? gerarUuidV7;
  }

  private agora() {
    return this.relogio().toISOString();
  }
  private exigirPropriedade(id: string) {
    if (!this.propriedades.obter(id))
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Propriedade não encontrada.');
  }
  private auditar(
    entidade: EntidadeHistorico,
    id: string,
    acao: AcaoHistorico,
    antes: Record<string, unknown> | null,
    depois: Record<string, unknown> | null,
    motivo: string | null,
  ) {
    this.historico.registrar({
      id: this.gerarId(),
      entidade,
      entidadeId: id,
      acao,
      dadosAnteriores: antes,
      dadosNovos: depois,
      motivo,
      ocorridoEm: this.agora(),
    });
  }
  private categoriaDeDespesa(id: string) {
    const c = this.repo.obterCategoria(id);
    if (!c) throw new ErroAplicacao('NAO_ENCONTRADO', 'Categoria não encontrada.');
    if (c.natureza !== 'despesa') invalido('Só despesas são classificadas em fixas ou variáveis.');
    return c;
  }

  resumo(f: {
    propriedadeId: string;
    dataInicial?: string | undefined;
    dataFinal?: string | undefined;
  }): ResumoClassificacao {
    this.exigirPropriedade(f.propriedadeId);
    const linhas = this.repo.coberturaPorCategoria(f.propriedadeId, f.dataInicial, f.dataFinal);
    const faixa = (categoriaId: string, c: ComportamentoLancamento): FaixaClassificacao => {
      const l = linhas.find((x) => x.categoriaId === categoriaId && x.comportamento === c);
      return l ? { quantidade: l.quantidade, valorCentavos: l.totalCentavos } : FAIXA_VAZIA;
    };
    const porCategoria: ClassificacaoDaCategoria[] = this.repo
      .listarCategorias(true)
      .filter((c) => c.natureza === 'despesa' && c.tratamento === 'resultado')
      .map((c) => ({
        categoriaId: c.id,
        categoriaNome: c.nome,
        grupo: c.grupo,
        tratamento: c.tratamento,
        ativa: c.ativa,
        padrao: c.comportamentoCusto,
        fixo: faixa(c.id, 'fixo'),
        variavel: faixa(c.id, 'variavel'),
        naoClassificado: faixa(c.id, 'nao_classificado'),
      }))
      .filter(
        (c) =>
          c.ativa || c.fixo.quantidade + c.variavel.quantidade + c.naoClassificado.quantidade > 0,
      );
    const soma = (
      f2: (c: ClassificacaoDaCategoria) => FaixaClassificacao,
      campo: 'valorCentavos' | 'quantidade',
    ) => porCategoria.reduce((s, c) => s + f2(c)[campo], 0);
    const fixo = somarCentavos(porCategoria.map((c) => c.fixo.valorCentavos));
    const variavel = somarCentavos(porCategoria.map((c) => c.variavel.valorCentavos));
    const nao = somarCentavos(porCategoria.map((c) => c.naoClassificado.valorCentavos));
    return {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial ?? null,
      dataFinal: f.dataFinal ?? null,
      cobertura: {
        totalCentavos: fixo + variavel + nao,
        fixoCentavos: fixo,
        variavelCentavos: variavel,
        naoClassificadoCentavos: nao,
        quantidadeTotal:
          soma((c) => c.fixo, 'quantidade') +
          soma((c) => c.variavel, 'quantidade') +
          soma((c) => c.naoClassificado, 'quantidade'),
        quantidadeNaoClassificada: soma((c) => c.naoClassificado, 'quantidade'),
      },
      porCategoria,
    };
  }

  previa(propriedadeId: string, categoriaId: string): PreviaClassificacao {
    this.exigirPropriedade(propriedadeId);
    const c = this.categoriaDeDespesa(categoriaId);
    const lancamentos = this.repo.lancamentosNaoClassificadosDaCategoria(
      propriedadeId,
      categoriaId,
    );
    return {
      categoriaId,
      categoriaNome: c.nome,
      padrao: c.comportamentoCusto,
      quantidade: lancamentos.length,
      valorCentavos: somarCentavos(lancamentos.map((l) => l.valorCentavos)),
      amostra: lancamentos.slice(0, 5).map((l) => ({ ...l })),
    };
  }

  /**
   * Aplica o padrão da categoria aos lançamentos ainda não classificados dela. Recusa se o padrão
   * mudou ou se a quantidade não é a que o usuário viu na prévia: nada acontece sem conferência.
   */
  aplicarCategoria(f: {
    propriedadeId: string;
    categoriaId: string;
    comportamento: 'variavel' | 'fixo';
    quantidadeEsperada: number;
    motivo: string | null;
  }): ResultadoClassificacaoEmLote {
    this.exigirPropriedade(f.propriedadeId);
    return this.banco.transacao(() => {
      const c = this.categoriaDeDespesa(f.categoriaId);
      if (c.comportamentoCusto !== f.comportamento)
        invalido(
          'O padrão da categoria mudou desde a prévia. Confira a classificação e refaça a operação.',
        );
      const alvo = this.repo.lancamentosNaoClassificadosDaCategoria(f.propriedadeId, f.categoriaId);
      if (alvo.length === 0) invalido('Não há lançamentos não classificados nesta categoria.');
      if (alvo.length !== f.quantidadeEsperada)
        invalido(
          `Os lançamentos mudaram desde a prévia (esperado ${f.quantidadeEsperada}, encontrado ${alvo.length}). Refaça a prévia.`,
        );
      const agora = this.agora();
      const motivo =
        f.motivo ?? 'Aplicação do padrão de classificação da categoria aos não classificados.';
      for (const l of alvo) {
        this.repo.definirComportamento(l.id, f.comportamento, agora);
        this.auditar(
          'lancamento_financeiro',
          l.id,
          'alteracao',
          { comportamentoCusto: 'nao_classificado' },
          { comportamentoCusto: f.comportamento },
          motivo,
        );
      }
      const valor = somarCentavos(alvo.map((l) => l.valorCentavos));
      this.auditar(
        'categoria_financeira',
        f.categoriaId,
        'classificacao_lote',
        null,
        {
          propriedadeId: f.propriedadeId,
          comportamentoCusto: f.comportamento,
          quantidade: alvo.length,
          valorCentavos: valor,
        },
        motivo,
      );
      return {
        categoriaId: f.categoriaId,
        comportamento: f.comportamento,
        quantidadeAlterada: alvo.length,
        valorCentavos: valor,
      };
    });
  }

  definirLancamento(
    id: string,
    comportamento: 'variavel' | 'fixo' | 'nao_classificado',
    motivo: string | null,
  ): LancamentoDetalhe {
    return this.banco.transacao(() => {
      const l = this.repo.obterLancamento(id);
      if (!l) throw new ErroAplicacao('NAO_ENCONTRADO', 'Lançamento não encontrado.');
      if (l.cancelado) invalido('O lançamento está cancelado.');
      if (l.natureza !== 'despesa') invalido('Receita não tem classificação de custo.');
      if (l.comportamentoCusto !== comportamento) {
        this.repo.definirComportamento(id, comportamento, this.agora());
        this.auditar(
          'lancamento_financeiro',
          id,
          'alteracao',
          { comportamentoCusto: l.comportamentoCusto },
          { comportamentoCusto: comportamento },
          motivo,
        );
      }
      return this.financeiro.obter(id);
    });
  }
}
