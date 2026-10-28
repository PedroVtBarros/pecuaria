import {
  apuracaoDeContagens,
  apurarCustoSanitario,
  gerarUuidV7,
  ratearCustoEntreAnimais,
  type Apuracao,
  type ComportamentoCusto,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type ClassificacaoDeOrigem,
  type ConsumoApropriado,
  type CustoSanitarioRegistro,
  type FiltrosConsumoPaginadosValidados,
  type FiltrosConsumoValidados,
  type PaginaConsumos,
  type ResumoConsumos,
  type ServicoSanitarioValidado,
  type TotalApropriado,
} from '@pecuaria/shared-types';
import {
  RepositorioHistorico,
  RepositorioInsumos,
  RepositorioPropriedades,
  type GerenciadorBanco,
  type LinhaConsumo,
  type TotalConsumo,
} from '@pecuaria/database';
import type { ServicoEstoque } from '../estoque/servico-estoque';
import type { ServicoFinanceiro } from './servico-financeiro';

function invalido(mensagem: string): never {
  throw new ErroAplicacao('OPERACAO_INVALIDA', mensagem);
}

const ROTULOS_TIPO: Record<string, string> = {
  saida_consumo: 'Consumo',
  saida_perda: 'Perda',
  ajuste_saida: 'Ajuste de saída',
  saida_venda: 'Venda do insumo',
};
const ROTULOS_DESTINO: Record<string, string> = {
  propriedade: 'Propriedade (custo compartilhado, não alocado)',
  centro_producao: 'Centro de produção (o custo vai ao item produzido)',
  lote: 'Lote de animais',
  animal: 'Animal',
};

/**
 * Consumos de estoque como custo apropriado, custo sanitário e classificação de custos que não são
 * lançamentos (entrega 4D). O custo de cada consumo é lido do estoque (custo médio já calculado,
 * recalculado por lá em correções retroativas) e nunca recomputado aqui; consumo sem custo é
 * "desconhecido", jamais zero, e torna o total parcial.
 */
export class ServicoCustosEstoque {
  private readonly insumos: RepositorioInsumos;
  private readonly propriedades: RepositorioPropriedades;
  private readonly historico: RepositorioHistorico;
  private readonly relogio: () => Date;

  constructor(
    private readonly banco: GerenciadorBanco,
    private readonly estoque: ServicoEstoque,
    private readonly financeiro: ServicoFinanceiro,
    opcoes: { relogio?: () => Date } = {},
  ) {
    const db = () => banco.conexao;
    this.insumos = new RepositorioInsumos(db);
    this.propriedades = new RepositorioPropriedades(db);
    this.historico = new RepositorioHistorico(db);
    this.relogio = opcoes.relogio ?? (() => new Date());
  }

  private exigirPropriedade(id: string) {
    if (!this.propriedades.obter(id))
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Propriedade não encontrada.');
  }

  // ---- Consumos apropriados -----------------------------------------------------------------
  private descricaoDoDestino(l: LinhaConsumo): string {
    if (l.destino === 'animal') return `Animal ${l.animalIdentificacao ?? ''}`.trim();
    if (l.destino === 'lote') return `Lote ${l.loteNome ?? ''}`.trim();
    if (l.centroProducaoNome) return `Centro de produção ${l.centroProducaoNome}`;
    return 'Propriedade (não alocado)';
  }

  listar(f: FiltrosConsumoPaginadosValidados): PaginaConsumos {
    this.exigirPropriedade(f.propriedadeId);
    const filtro = {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      destino: f.destino,
      loteId: f.loteId,
      animalId: f.animalId,
      estoqueItemId: f.estoqueItemId,
      tipo: f.tipo,
    };
    const linhas = this.insumos.listarConsumos(filtro, {
      limite: f.tamanhoPagina,
      deslocamento: (f.pagina - 1) * f.tamanhoPagina,
    });
    return {
      total: this.insumos.contarConsumos(filtro),
      pagina: f.pagina,
      tamanhoPagina: f.tamanhoPagina,
      itens: linhas.map((l): ConsumoApropriado => ({
        movimentacaoId: l.movimentacaoId,
        data: l.data,
        tipo: l.tipo,
        estoqueItemId: l.estoqueItemId,
        estoqueItemNome: l.estoqueItemNome,
        quantidade: l.quantidadeMilesimos / 1000,
        unidadeBase: l.unidadeBase as ConsumoApropriado['unidadeBase'],
        destino: l.destino,
        destinoDescricao: this.descricaoDoDestino(l),
        manejoSanitarioId: l.manejoSanitarioId,
        custoApropriadoCentavos: l.custoApropriadoCentavos,
      })),
    };
  }

  private paraTotal(t: TotalConsumo, rotulo: string): TotalApropriado {
    return {
      chave: t.chave,
      rotulo,
      apuracao: apuracaoDeContagens({
        conhecidoCentavos: t.conhecidoCentavos,
        conhecidos: t.conhecidos,
        desconhecidos: t.desconhecidos,
      }),
    };
  }
  private somar(ts: readonly TotalConsumo[]): Apuracao {
    return apuracaoDeContagens({
      conhecidoCentavos: ts.reduce((s, t) => s + t.conhecidoCentavos, 0),
      conhecidos: ts.reduce((s, t) => s + t.conhecidos, 0),
      desconhecidos: ts.reduce((s, t) => s + t.desconhecidos, 0),
    });
  }

  resumo(f: FiltrosConsumoValidados): ResumoConsumos {
    this.exigirPropriedade(f.propriedadeId);
    const filtro = {
      propriedadeId: f.propriedadeId,
      dataInicial: f.dataInicial,
      dataFinal: f.dataFinal,
      destino: f.destino,
      loteId: f.loteId,
      animalId: f.animalId,
      estoqueItemId: f.estoqueItemId,
      tipo: f.tipo,
    };
    const porDestino = this.insumos.totaisDeConsumo(filtro, 'destino');
    const porItem = this.insumos.totaisDeConsumo(filtro, 'item');
    const porTipo = this.insumos.totaisDeConsumo(filtro, 'tipo');
    const nomes = new Map(
      this.estoque.repo.listar(f.propriedadeId, true).map((i) => [i.id, i.nome]),
    );
    const naoAlocado = porDestino.filter((t) => t.chave === 'propriedade');
    return {
      propriedadeId: f.propriedadeId,
      total: this.somar(porDestino),
      porDestino: porDestino.map((t) => this.paraTotal(t, ROTULOS_DESTINO[t.chave] ?? t.chave)),
      porItem: porItem.map((t) => ({
        ...this.paraTotal(t, nomes.get(t.chave) ?? 'Item removido'),
        classificacao:
          this.insumos.obterClassificacao(f.propriedadeId, 'estoque_item', t.chave) ??
          'nao_classificado',
      })),
      porTipo: porTipo.map((t) => this.paraTotal(t, ROTULOS_TIPO[t.chave] ?? t.chave)),
      naoAlocado: this.somar(naoAlocado),
    };
  }

  // ---- Custo sanitário ----------------------------------------------------------------------
  obterCustoSanitario(manejoId: string): CustoSanitarioRegistro {
    const m = this.insumos.dadosDoManejo(manejoId);
    if (!m) throw new ErroAplicacao('NAO_ENCONTRADO', 'Registro sanitário não encontrado.');
    const baixas = this.insumos.consumosDoManejo(manejoId);
    const servicos = this.insumos.servicosDoManejo(manejoId);
    const custo = apurarCustoSanitario({
      consumosEstoque: baixas.map((b) => b.custoApropriadoCentavos),
      servicos: servicos.map((s) => s.valorCentavos),
      informadoCentavos: m.custoInformadoCentavos,
    });
    const partes = ratearCustoEntreAnimais(
      custo.apuracao.valorConhecidoCentavos,
      m.animais.map((a) => a.id),
    );
    const identificacao = new Map(m.animais.map((a) => [a.id, a.identificacao]));
    return {
      manejoId,
      data: m.data,
      apuracao: custo.apuracao,
      estoque: { ...custo.estoque, baixas },
      servicos,
      servicosCentavos: custo.servicosCentavos,
      informadoCentavos: m.custoInformadoCentavos,
      informadoContado: custo.informadoContado,
      informadoNaoContadoCentavos: custo.informadoNaoContadoCentavos,
      porAnimal:
        custo.apuracao.componentesConhecidos > 0
          ? partes.map((p) => ({
              animalId: p.animalId,
              identificacao: identificacao.get(p.animalId) ?? '',
              valorCentavos: p.valorCentavos,
            }))
          : [],
      observacao:
        'O custo do registro vem do consumo de estoque (custo médio), dos serviços lançados e, só se não houver nenhum dos dois, do valor digitado no registro. É dividido por igual entre os animais tratados; não é dose por peso nem critério científico.',
    };
  }

  /** Lança a despesa de um serviço (consulta, exame) ligada ao registro sanitário. */
  lancarServico(d: ServicoSanitarioValidado): CustoSanitarioRegistro {
    return this.banco.transacao(() => {
      const m = this.insumos.dadosDoManejo(d.manejoId);
      if (!m) throw new ErroAplicacao('NAO_ENCONTRADO', 'Registro sanitário não encontrado.');
      const categoria = this.financeiro.repo.obterCategoria(d.categoriaId);
      if (!categoria) throw new ErroAplicacao('NAO_ENCONTRADO', 'Categoria não encontrada.');
      if (categoria.natureza !== 'despesa' || categoria.tratamento !== 'resultado')
        invalido(
          'Use uma categoria de despesa do resultado (serviço sanitário, não compra de produto).',
        );
      this.financeiro.criarParaOrigem(
        d.requisicaoId,
        {
          propriedadeId: m.propriedadeId,
          categoriaId: d.categoriaId,
          pessoaId: d.pessoaId,
          dataCompetencia: d.dataCompetencia,
          valorTotalCentavos: d.valorTotalCentavos,
          descricao: d.descricao,
          documentoNumero: d.documentoNumero,
          atividade: 'nao_definida',
          destino: { tipo: 'nenhum' },
          quantidade: null,
          comportamentoCusto: null,
          observacoes: null,
          condicao: d.condicao,
        },
        { tipo: 'sanitario', id: d.manejoId },
      );
      return this.obterCustoSanitario(d.manejoId);
    });
  }

  // ---- Classificação padrão de custos que não são lançamentos (D-E) -------------------------
  listarClassificacoes(propriedadeId: string): ClassificacaoDeOrigem[] {
    this.exigirPropriedade(propriedadeId);
    return this.insumos.listarClassificacoes(propriedadeId).map((c) => ({
      escopo: c.escopo as ClassificacaoDeOrigem['escopo'],
      referenciaId: c.referenciaId,
      comportamento: c.comportamento,
    }));
  }

  definirClassificacao(
    propriedadeId: string,
    escopo: ClassificacaoDeOrigem['escopo'],
    referenciaId: string | null,
    comportamento: ComportamentoCusto,
  ): ClassificacaoDeOrigem[] {
    this.exigirPropriedade(propriedadeId);
    return this.banco.transacao(() => {
      if (escopo === 'estoque_item') {
        const item = this.estoque.itemBasico(referenciaId!);
        if (item.propriedadeId !== propriedadeId) invalido('O item é de outra propriedade.');
      }
      const antes = this.insumos.obterClassificacao(propriedadeId, escopo, referenciaId);
      if (antes === comportamento || (antes === null && comportamento === 'nao_classificado'))
        return this.listarClassificacoes(propriedadeId);
      this.insumos.gravarClassificacao(
        gerarUuidV7(),
        propriedadeId,
        escopo,
        referenciaId,
        comportamento,
        this.relogio().toISOString(),
      );
      this.historico.registrar({
        id: gerarUuidV7(),
        entidade: 'classificacao_origem',
        entidadeId: referenciaId ?? propriedadeId,
        acao: 'alteracao',
        dadosAnteriores: { escopo, comportamento: antes ?? 'nao_classificado' },
        dadosNovos: { escopo, comportamento },
        motivo: null,
        ocorridoEm: this.relogio().toISOString(),
      });
      return this.listarClassificacoes(propriedadeId);
    });
  }
}
