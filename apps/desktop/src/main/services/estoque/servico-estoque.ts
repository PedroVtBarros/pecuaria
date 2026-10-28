import {
  abaixoDoMinimo,
  calcularEstoque,
  dataLocalIso,
  gerarUuidV7,
  normalizarNome,
  quantidadeEmMilesimos,
  somarDias,
  type AnaliseEstoque,
  type MovimentoParaEstoque,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  esquemaPreferenciasEstoque,
  type ConsultaExtratoEstoque,
  type AlertasEstoque,
  type ConsumoEstoque,
  type DadosItemEstoqueValidados,
  type DadosLoteEstoque,
  type DetalheItemEstoque,
  type ItemEstoque,
  type LoteEstoque,
  type MovimentoEstoque,
  type MovimentoEstoqueValidado,
  type ResumoItemEstoque,
} from '@pecuaria/shared-types';
import {
  ehErroDeUnicidade,
  RepositorioAnimais,
  RepositorioConfiguracao,
  RepositorioEstoque,
  RepositorioHistorico,
  RepositorioInsumos,
  RepositorioProducao,
  RepositorioLotes,
  RepositorioPropriedades,
  RepositorioSanidade,
  type GerenciadorBanco,
  type EntidadeHistorico,
} from '@pecuaria/database';

function invalido(mensagem: string): never {
  throw new ErroAplicacao('OPERACAO_INVALIDA', mensagem);
}
const MENSAGEM_ENTRADA_VINCULADA =
  'Esta entrada pertence a uma compra de insumos registrada no Financeiro. Corrija ou cancele pela compra: ela repassa a mudança ao estoque pela correção auditada.';
export function dadosDoMovimento(m: MovimentoEstoque): MovimentoEstoqueValidado {
  return {
    data: m.data,
    tipo: m.tipo,
    quantidade: m.quantidade,
    unidadeBase: m.unidadeBase,
    loteEstoqueId: m.loteEstoqueId,
    custoEntradaCentavos: m.custoEntradaCentavos,
    destino: m.destino,
    loteAnimalId: m.loteAnimalId,
    animalId: m.animalId,
    documentoOrigemId: m.documentoOrigemId,
    motivo: m.motivo,
    observacao: m.observacao,
  };
}
/**
 * Campos comparados na repetição idempotente. O tipo `Record<keyof ...>` faz o compilador acusar
 * qualquer campo novo do movimento que não seja listado aqui.
 */
const CAMPOS_DO_MOVIMENTO: Record<keyof MovimentoEstoqueValidado, true> = {
  data: true,
  tipo: true,
  quantidade: true,
  unidadeBase: true,
  loteEstoqueId: true,
  custoEntradaCentavos: true,
  destino: true,
  loteAnimalId: true,
  animalId: true,
  documentoOrigemId: true,
  motivo: true,
  observacao: true,
};
/** Igualdade campo a campo, sem depender da ordem das propriedades. */
export function mesmosDadosDoMovimento(
  a: MovimentoEstoqueValidado,
  b: MovimentoEstoqueValidado,
): boolean {
  return (Object.keys(CAMPOS_DO_MOVIMENTO) as (keyof MovimentoEstoqueValidado)[]).every(
    (campo) => a[campo] === b[campo],
  );
}
/** Orquestra regras puras, SQL e trilha na mesma conexão/transação da sanidade. */
export class ServicoEstoque {
  readonly repo: RepositorioEstoque;
  private readonly propriedades: RepositorioPropriedades;
  private readonly animais: RepositorioAnimais;
  private readonly lotesAnimais: RepositorioLotes;
  private readonly sanidade: RepositorioSanidade;
  private readonly historico: RepositorioHistorico;
  private readonly insumos: RepositorioInsumos;
  private readonly producao: RepositorioProducao;
  private readonly config: RepositorioConfiguracao;
  private readonly relogio: () => Date;
  private readonly gerarId: () => string;
  constructor(
    private readonly banco: GerenciadorBanco,
    opcoes: { relogio?: () => Date; gerarId?: () => string } = {},
  ) {
    const db = () => banco.conexao;
    this.repo = new RepositorioEstoque(db);
    this.propriedades = new RepositorioPropriedades(db);
    this.animais = new RepositorioAnimais(db);
    this.lotesAnimais = new RepositorioLotes(db);
    this.sanidade = new RepositorioSanidade(db);
    this.historico = new RepositorioHistorico(db);
    this.insumos = new RepositorioInsumos(db);
    this.producao = new RepositorioProducao(db);
    this.config = new RepositorioConfiguracao(db);
    this.relogio = opcoes.relogio ?? (() => new Date());
    this.gerarId = opcoes.gerarId ?? gerarUuidV7;
  }
  private agora() {
    return this.relogio().toISOString();
  }
  private hoje() {
    return dataLocalIso(this.relogio());
  }
  private transacao<T>(fn: () => T): T {
    try {
      return this.banco.transacao(fn);
    } catch (e) {
      if (e instanceof ErroAplicacao) throw e;
      if (ehErroDeUnicidade(e))
        throw new ErroAplicacao(
          'DUPLICADO',
          'Nome, vínculo ou identificador de operação já utilizado.',
        );
      throw e;
    }
  }
  private auditar(
    entidade: EntidadeHistorico,
    id: string,
    acao: 'criacao' | 'alteracao' | 'cancelamento',
    antes: Record<string, unknown> | null,
    depois: Record<string, unknown> | null,
    motivo: string | null = null,
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
  private item(id: string): ItemEstoque {
    const r = this.repo.obter(id);
    if (!r) throw new ErroAplicacao('NAO_ENCONTRADO', 'Item de estoque não encontrado.');
    if (!this.propriedades.obter(r.propriedadeId)) invalido('Propriedade do item indisponível.');
    return r;
  }
  /** Item de estoque sem cálculo de saldo, para outros módulos conferirem propriedade e unidade. */
  itemBasico(id: string): ItemEstoque {
    return this.item(id);
  }
  private analisar(movimentos: readonly MovimentoParaEstoque[]): AnaliseEstoque {
    try {
      return calcularEstoque(movimentos);
    } catch (e) {
      return invalido(e instanceof Error ? e.message : 'Não foi possível calcular o estoque.');
    }
  }
  private resumo(
    item: ItemEstoque,
    analise = this.analisar(this.repo.paraCalculo(item.id)),
  ): ResumoItemEstoque {
    return {
      ...item,
      saldo: analise.saldoMilesimos / 1000,
      valorSaldoCentavos: analise.valorSaldoCentavos,
      valoracaoCompleta: analise.valoracaoCompleta,
      abaixoMinimo: abaixoDoMinimo(
        analise.saldoMilesimos,
        item.estoqueMinimo === null ? null : Math.round(item.estoqueMinimo * 1000),
      ),
    };
  }
  listar(propriedadeId: string, incluirInativos = false): ResumoItemEstoque[] {
    if (!this.propriedades.obter(propriedadeId))
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Propriedade não encontrada.');
    return this.repo.listar(propriedadeId, incluirInativos).map((i) => this.resumo(i));
  }
  extrato(filtros: ConsultaExtratoEstoque) {
    this.item(filtros.itemId);
    return this.repo.extrato(filtros);
  }
  obter(id: string): DetalheItemEstoque {
    const item = this.item(id);
    const ativos = this.repo.paraCalculo(id);
    const analise = this.analisar(ativos);
    const saldos = new Map(analise.lotes.map((l) => [l.loteEstoqueId, l.saldoMilesimos / 1000]));
    return {
      item: this.resumo(item, analise),
      lotes: this.repo.lotes(id).map((l) => ({ ...l, saldo: saldos.get(l.id) ?? 0 })),
      movimentos: this.repo.extrato({
        itemId: id,
        incluirCancelados: true,
        pagina: 1,
        tamanhoPagina: 200,
      }).itens,
      historico: this.repo.historico(id),
    };
  }
  private validarItem(propriedadeId: string, d: DadosItemEstoqueValidados) {
    if (!this.propriedades.obter(propriedadeId)) invalido('Propriedade não encontrada.');
    if (d.produtoSanitarioId && !this.sanidade.obterProduto(d.produtoSanitarioId))
      invalido('Produto sanitário não encontrado.');
    if (d.estoqueMinimo !== null && d.estoqueMinimo > 0) {
      try {
        quantidadeEmMilesimos(d.estoqueMinimo, d.unidadeBase);
      } catch (e) {
        invalido(e instanceof Error ? e.message : 'Mínimo inválido.');
      }
    }
  }
  private gravarItem(
    id: string,
    propriedadeId: string,
    d: DadosItemEstoqueValidados,
    novo: boolean,
  ) {
    const alimento = ['racao', 'silagem', 'volumoso', 'suplemento', 'mineral'].includes(d.tipo);
    this.repo.salvarItem(
      id,
      propriedadeId,
      d,
      normalizarNome(d.nome),
      alimento ? 'mn' : 'nao_aplicavel',
      d.estoqueMinimo === null ? null : Math.round(d.estoqueMinimo * 1000),
      this.agora(),
      novo,
    );
  }
  criarItem(propriedadeId: string, d: DadosItemEstoqueValidados): ResumoItemEstoque {
    this.validarItem(propriedadeId, d);
    const id = this.gerarId();
    return this.transacao(() => {
      this.gravarItem(id, propriedadeId, d, true);
      const novo = this.item(id);
      this.auditar('estoque_item', id, 'criacao', null, { ...novo });
      return this.resumo(novo);
    });
  }
  atualizarItem(id: string, d: DadosItemEstoqueValidados, motivo: string): ResumoItemEstoque {
    const atual = this.item(id);
    this.validarItem(atual.propriedadeId, d);
    if (
      this.repo.temMovimentos(id) &&
      (atual.unidadeBase !== d.unidadeBase ||
        atual.controleLote !== d.controleLote ||
        atual.tipo !== d.tipo ||
        atual.produtoSanitarioId !== d.produtoSanitarioId)
    )
      invalido(
        'Unidade, tipo, vínculo sanitário e controle de lote não podem mudar após movimentações. Crie outro item.',
      );
    if (!d.ativo && this.resumo(atual).saldo !== 0)
      invalido('O item precisa estar sem saldo para ser inativado.');
    return this.transacao(() => {
      this.gravarItem(id, atual.propriedadeId, d, false);
      const novo = this.item(id);
      this.auditar('estoque_item', id, 'alteracao', { ...atual }, { ...novo }, motivo);
      return this.resumo(novo);
    });
  }
  criarLote(itemId: string, d: DadosLoteEstoque): LoteEstoque {
    this.item(itemId);
    const id = this.gerarId();
    return this.transacao(() => {
      this.repo.salvarLote(id, itemId, d, normalizarNome(d.codigo), this.agora(), true);
      const lote = this.repo.obterLote(id)!;
      this.auditar('estoque_lote', id, 'criacao', null, { ...lote });
      return lote;
    });
  }
  atualizarLote(id: string, d: DadosLoteEstoque, motivo: string): LoteEstoque {
    const atual = this.repo.obterLote(id);
    if (!atual) throw new ErroAplicacao('NAO_ENCONTRADO', 'Lote físico não encontrado.');
    this.item(atual.itemId);
    return this.transacao(() => {
      this.repo.salvarLote(id, atual.itemId, d, normalizarNome(d.codigo), this.agora(), false);
      const novo = this.repo.obterLote(id)!;
      this.auditar('estoque_lote', id, 'alteracao', { ...atual }, { ...novo }, motivo);
      return novo;
    });
  }
  private validarMovimento(item: ItemEstoque, d: MovimentoEstoqueValidado) {
    if (!item.ativo) invalido('O item está inativo.');
    if (d.unidadeBase !== item.unidadeBase)
      invalido('Use exatamente a unidade do estoque; nenhuma conversão é presumida.');
    let quantidade: number;
    try {
      quantidade = quantidadeEmMilesimos(d.quantidade, item.unidadeBase);
    } catch (e) {
      return invalido(e instanceof Error ? e.message : 'Quantidade inválida.');
    }
    if (d.data > this.hoje()) invalido('Movimentos efetivos não podem ter data futura.');
    if (item.controleLote && !d.loteEstoqueId) invalido('Escolha o lote físico deste item.');
    if (d.loteEstoqueId && this.repo.obterLote(d.loteEstoqueId)?.itemId !== item.id)
      invalido('O lote físico não pertence a este item.');
    if (d.loteAnimalId) {
      const lote = this.lotesAnimais.obter(d.loteAnimalId);
      if (!lote || lote.propriedadeId !== item.propriedadeId)
        invalido('Lote de animais não encontrado nesta propriedade.');
      if (d.data < lote.dataFormacao || (lote.dataEncerramento && d.data > lote.dataEncerramento))
        invalido('O lote de animais não estava disponível na data informada.');
    }
    if (d.animalId) {
      const a = this.animais.obter(d.animalId);
      if (!a || a.propriedadeId !== item.propriedadeId)
        invalido('Animal não encontrado nesta propriedade.');
      if (
        d.data < a.dataEntrada ||
        (a.dataSaida && d.data > a.dataSaida) ||
        this.animais.ausenciaNaData(a.id, d.data)
      )
        invalido('O animal não estava no rebanho na data informada.');
    }
    return quantidade;
  }
  /** Entrada gerada por centro encerrado, ou consumo vinculado a ele: só mudam depois de reabrir o centro. */
  private exigirForaDeCentroEncerrado(id: string) {
    const entrada = this.producao.centroDaEntrada(id);
    if (entrada)
      invalido(
        `Esta entrada foi gerada pelo centro de produção "${entrada.nome}", que está encerrado. Reabra o centro (Financeiro > Produção própria) para corrigir ou cancelar.`,
      );
    const consumo = this.producao.centroDoConsumo(id);
    if (consumo?.status === 'encerrado')
      invalido(
        `Este consumo está no custo do centro de produção "${consumo.nome}", que está encerrado. Reabra o centro antes de corrigir ou cancelar.`,
      );
  }
  private recalcular(itemId: string, motivo: string) {
    const movimentos = this.repo.paraCalculo(itemId);
    const analise = this.analisar(movimentos);
    const porId = new Map(movimentos.map((m) => [m.id, m]));
    for (const valor of analise.movimentos) {
      const anterior = porId.get(valor.id)!;
      if (anterior.custoApropriadoCentavos === valor.custoApropriadoCentavos) continue;
      this.repo.atualizarCusto(valor.id, valor.custoApropriadoCentavos, this.agora());
      this.auditar(
        'movimentacao_estoque',
        valor.id,
        'alteracao',
        { custoApropriadoCentavos: anterior.custoApropriadoCentavos },
        { custoApropriadoCentavos: valor.custoApropriadoCentavos },
        motivo,
      );
    }
    return analise;
  }
  private repetir(
    existente: MovimentoEstoque,
    itemId: string,
    dados: MovimentoEstoqueValidado,
  ): MovimentoEstoque {
    if (
      existente.canceladoEm ||
      existente.itemId !== itemId ||
      !mesmosDadosDoMovimento(dadosDoMovimento(existente), dados)
    )
      invalido(
        'O identificador da operação já foi usado com outro conteúdo ou foi cancelado. Não repita a baixa.',
      );
    return existente;
  }
  registrar(
    itemId: string,
    requisicaoId: string,
    d: MovimentoEstoqueValidado,
    manejoId: string | null = null,
    ordemPreservada: number | null = null,
    substituiId: string | null = null,
  ): MovimentoEstoque {
    return this.transacao(() => {
      const repetida = this.repo.porRequisicao(requisicaoId);
      if (repetida) {
        if (repetida.manejoSanitarioId !== manejoId)
          invalido('Identificador pertence a outra operação.');
        return this.repetir(repetida, itemId, d);
      }
      const item = this.item(itemId);
      const q = this.validarMovimento(item, d);
      const id = this.gerarId();
      this.repo.inserirMovimento(
        id,
        itemId,
        d,
        q,
        requisicaoId,
        ordemPreservada ?? this.repo.proximaOrdem(),
        this.agora(),
        manejoId,
        substituiId,
      );
      this.recalcular(itemId, 'Recálculo por novo movimento de estoque');
      const novo = this.repo.obterMovimento(id)!;
      this.auditar('movimentacao_estoque', id, 'criacao', null, { ...novo });
      return novo;
    });
  }
  corrigir(
    id: string,
    requisicaoId: string,
    d: MovimentoEstoqueValidado,
    motivo: string,
    /** Só a compra de insumos corrige a entrada que ela mesma criou. */
    interno = false,
  ): MovimentoEstoque {
    return this.transacao(() => {
      const atual = this.repo.obterMovimento(id);
      if (!atual) throw new ErroAplicacao('NAO_ENCONTRADO', 'Movimento não encontrado.');
      if (!interno && this.insumos.itemAtivoDaEntrada(id)) invalido(MENSAGEM_ENTRADA_VINCULADA);
      if (!interno) this.exigirForaDeCentroEncerrado(id);
      const repetida = this.repo.porRequisicao(requisicaoId);
      if (repetida) {
        if (repetida.substituiId !== id) invalido('Identificador pertence a outra correção.');
        return this.repetir(repetida, atual.itemId, { ...d, motivo });
      }
      if (atual.canceladoEm) invalido('O movimento já foi cancelado ou substituído.');
      if (atual.manejoSanitarioId)
        invalido('Reconcile este consumo pela correção do registro sanitário.');
      const centro = this.producao.centroDoConsumo(id);
      if (
        centro &&
        (d.destino !== 'propriedade' ||
          !['saida_consumo', 'saida_perda', 'ajuste_saida'].includes(d.tipo))
      )
        invalido(
          `Este consumo está vinculado ao centro de produção "${centro.nome}" e precisa continuar sendo consumo da propriedade. Desvincule-o do centro antes de mudar o destino.`,
        );
      const q = this.validarMovimento(this.item(atual.itemId), d);
      const novoId = this.gerarId();
      this.repo.cancelar(id, this.agora());
      this.repo.inserirMovimento(
        novoId,
        atual.itemId,
        { ...d, motivo },
        q,
        requisicaoId,
        atual.ordem,
        this.agora(),
        null,
        id,
      );
      // O consumo corrigido continua no centro de produção, agora com o movimento novo.
      this.producao.transferirConsumo(id, novoId, this.agora());
      this.recalcular(atual.itemId, motivo);
      const novo = this.repo.obterMovimento(novoId)!;
      this.auditar(
        'movimentacao_estoque',
        id,
        'cancelamento',
        { ...atual },
        { substituidoPorId: novoId },
        motivo,
      );
      this.auditar('movimentacao_estoque', novoId, 'criacao', null, { ...novo }, motivo);
      return novo;
    });
  }
  cancelar(id: string, motivo: string, interno = false): null {
    return this.transacao(() => {
      const atual = this.repo.obterMovimento(id);
      if (!atual) throw new ErroAplicacao('NAO_ENCONTRADO', 'Movimento não encontrado.');
      if (atual.canceladoEm) return null;
      if (!interno && this.insumos.itemAtivoDaEntrada(id)) invalido(MENSAGEM_ENTRADA_VINCULADA);
      if (atual.manejoSanitarioId && !interno)
        invalido('Estorne este consumo pelo registro sanitário, com confirmação explícita.');
      if (!interno) this.exigirForaDeCentroEncerrado(id);
      this.repo.cancelar(id, this.agora());
      // Consumo cancelado deixa de ser custo do centro de produção aberto.
      this.producao.desvincularConsumo(id, this.agora());
      this.recalcular(atual.itemId, motivo);
      this.auditar('movimentacao_estoque', id, 'cancelamento', { ...atual }, null, motivo);
      return null;
    });
  }
  prever(itemId: string, d: MovimentoEstoqueValidado, substituiId: string | null) {
    const item = this.item(itemId);
    const quantidadeMilesimos = this.validarMovimento(item, d);
    const movimentos = this.repo.paraCalculo(itemId);
    const atual = substituiId ? movimentos.find((m) => m.id === substituiId) : null;
    if (substituiId && !atual) invalido('Movimento de correção não encontrado.');
    const novo: MovimentoEstoque = {
      ...d,
      id: 'previa',
      itemId,
      ordem: atual?.ordem ?? this.repo.proximaOrdem(),
      custoApropriadoCentavos: null,
      manejoSanitarioId: null,
      requisicaoId: 'previa',
      substituiId,
      canceladoEm: null,
    };
    const a = this.analisar([
      ...movimentos.filter((m) => m.id !== substituiId),
      { ...novo, quantidadeMilesimos },
    ]);
    const porId = new Map(movimentos.map((m) => [m.id, m]));
    return {
      saldo: a.saldoMilesimos / 1000,
      valorSaldoCentavos: a.valorSaldoCentavos,
      valoracaoCompleta: a.valoracaoCompleta,
      custoMovimentoCentavos: a.movimentos.find((m) => m.id === 'previa')!.custoApropriadoCentavos,
      movimentosRecalculados: a.movimentos.filter((v) => {
        const m = porId.get(v.id);
        return m && m.custoApropriadoCentavos !== v.custoApropriadoCentavos;
      }).length,
    };
  }
  alertas(propriedadeId: string): AlertasEstoque {
    const config = esquemaPreferenciasEstoque.safeParse(this.config.obter('alertas.estoque'));
    const dias = config.success ? config.data.antecedenciaValidadeDias : 7;
    if (!this.propriedades.obter(propriedadeId)) invalido('Propriedade não encontrada.');
    const itens = this.repo.listar(propriedadeId);
    const minimo: ResumoItemEstoque[] = [];
    const validade: AlertasEstoque['validade'] = [];
    for (const item of itens) {
      const analise = this.analisar(this.repo.paraCalculo(item.id));
      const resumo = this.resumo(item, analise);
      if (resumo.abaixoMinimo) minimo.push(resumo);
      const saldos = new Map(analise.lotes.map((l) => [l.loteEstoqueId, l.saldoMilesimos / 1000]));
      for (const original of this.repo.lotes(item.id)) {
        const lote = { ...original, saldo: saldos.get(original.id) ?? 0 };
        if (lote.saldo <= 0 || !lote.validade || lote.validade > somarDias(this.hoje(), dias))
          continue;
        validade.push({
          itemId: item.id,
          itemNome: item.nome,
          unidadeBase: item.unidadeBase,
          lote,
          situacao:
            lote.validade < this.hoje()
              ? 'vencido'
              : lote.validade === this.hoje()
                ? 'hoje'
                : 'proximo',
        });
      }
    }
    return { antecedenciaValidadeDias: dias, minimo, validade };
  }
  consumosDoManejo(manejoId: string) {
    return this.repo.doManejo(manejoId);
  }
  manejoRepetido(consumos: readonly ConsumoEstoque[], data: string): string | null {
    const existentes = consumos.map((c) => this.repo.porRequisicao(c.requisicaoId));
    if (existentes.every((m) => !m)) return null;
    const id = existentes[0]?.manejoSanitarioId;
    if (!id || this.repo.doManejo(id).length !== consumos.length)
      invalido('Identificador de consumo já utilizado em outra operação.');
    for (const [i, c] of consumos.entries()) {
      const m = existentes[i];
      if (
        !m ||
        m.canceladoEm ||
        m.manejoSanitarioId !== id ||
        m.itemId !== c.itemId ||
        m.loteEstoqueId !== c.loteEstoqueId ||
        m.quantidade !== c.quantidade ||
        m.unidadeBase !== c.unidadeBase ||
        m.data !== data
      )
        invalido('Não repita identificadores de consumo com conteúdo diferente ou cancelado.');
    }
    return id;
  }
  validarConsumos(
    propriedadeId: string,
    produtoId: string | null,
    consumos: readonly ConsumoEstoque[],
  ) {
    for (const c of consumos) {
      const item = this.item(c.itemId);
      if (
        item.propriedadeId !== propriedadeId ||
        !produtoId ||
        item.produtoSanitarioId !== produtoId
      )
        invalido('O consumo deve usar um item vinculado ao produto sanitário nesta propriedade.');
      if (item.unidadeBase !== c.unidadeBase)
        invalido('A unidade do consumo deve ser a unidade do estoque.');
    }
  }
  registrarConsumos(
    propriedadeId: string,
    produtoId: string | null,
    manejoId: string,
    data: string,
    consumos: readonly ConsumoEstoque[],
    antigos: readonly MovimentoEstoque[] = [],
  ) {
    this.validarConsumos(propriedadeId, produtoId, consumos);
    for (const [i, c] of consumos.entries())
      this.registrar(
        c.itemId,
        c.requisicaoId,
        {
          data,
          tipo: 'saida_consumo',
          quantidade: c.quantidade,
          unidadeBase: c.unidadeBase,
          loteEstoqueId: c.loteEstoqueId,
          custoEntradaCentavos: null,
          destino: 'propriedade',
          loteAnimalId: null,
          animalId: null,
          documentoOrigemId: null,
          motivo: null,
          observacao: 'Consumo explícito do registro sanitário',
        },
        manejoId,
        antigos[i]?.ordem ?? null,
        antigos[i]?.id ?? null,
      );
  }
  reconciliar(
    manejoId: string,
    propriedadeId: string,
    produtoId: string | null,
    data: string,
    consumos: readonly ConsumoEstoque[],
    motivo: string,
  ) {
    this.validarConsumos(propriedadeId, produtoId, consumos);
    const antigos = this.repo.doManejo(manejoId);
    for (const antigo of antigos) this.cancelar(antigo.id, motivo, true);
    this.registrarConsumos(propriedadeId, produtoId, manejoId, data, consumos, antigos);
  }
}
