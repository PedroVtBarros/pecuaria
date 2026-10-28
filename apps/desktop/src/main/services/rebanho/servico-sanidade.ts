import type {
  AnimalDoManejoValidado,
  ConsumoEstoque,
  AnimalEmCarencia,
  CarenciaAtiva,
  DadosAgendaValidados,
  DadosManejoValidados,
  DadosProdutoSanitarioValidados,
  EventoSanitarioAnimal,
  FiltrosManejoValidados,
  ItemAgenda,
  ManejoDetalhe,
  PaginaManejos,
  ProdutoSanitario,
  ProximaAplicacaoValidada,
  ResumoSanidade,
  SanidadeDoAnimal,
} from '@pecuaria/shared-types';
import {
  CARENCIA_MAXIMA_DIAS,
  fimCarencia,
  diasEntre,
  emCarencia,
  normalizarNome,
  situacaoAgenda,
  somarDias,
} from '@pecuaria/domain';
import type { AgendaBase, EventoDoAnimalBase, ManejoBase } from '@pecuaria/database';
import {
  dataBr,
  duplicado,
  houveMudanca,
  invalido,
  naoEncontrado,
  operacaoInvalida,
  type ContextoRebanho,
} from './contexto';
import type { ServicoPesagens } from './servico-pesagens';
import type { ServicoEstoque } from '../estoque/servico-estoque';

function retratoProduto(p: DadosProdutoSanitarioValidados | ProdutoSanitario) {
  return {
    nome: p.nome,
    tipo: p.tipo,
    fabricante: p.fabricante,
    principioAtivo: p.principioAtivo,
    unidadeDose: p.unidadeDose,
    carenciaCarneDias: p.carenciaCarneDias,
    carenciaLeiteDias: p.carenciaLeiteDias,
    observacoes: p.observacoes,
  };
}

function retratoManejo(m: ManejoBase): Record<string, unknown> {
  return {
    tipo: m.tipo,
    data: m.data,
    produto: m.produto?.nome ?? null,
    descricao: m.descricao,
    dose: m.dose,
    unidadeDose: m.unidadeDose,
    via: m.via,
    carenciaCarneDias: m.carenciaCarneDias,
    carenciaLeiteDias: m.carenciaLeiteDias,
    responsavel: m.responsavel,
    diagnostico: m.diagnostico,
    custoTotalCentavos: m.custoTotalCentavos,
    observacoes: m.observacoes,
  };
}

function retratoAgenda(a: AgendaBase): Record<string, unknown> {
  return {
    dataPrevista: a.dataPrevista,
    tipo: a.tipo,
    produto: a.produto?.nome ?? null,
    descricao: a.descricao,
    lote: a.lote?.nome ?? null,
    animal: a.animal?.identificacao ?? null,
    observacoes: a.observacoes,
  };
}

/** Evento sanitário do animal com o fim do prazo de carência calculado. */
export function paraEventoAnimal(e: EventoDoAnimalBase): EventoSanitarioAnimal {
  const { registradoEm: _registradoEm, ...resto } = e;
  return {
    ...resto,
    fimCarenciaCarne: fimCarencia(e.data, e.carenciaCarneDias),
    fimCarenciaLeite: fimCarencia(e.data, e.carenciaLeiteDias),
  };
}

/**
 * Sanidade: produtos, registros (individuais e coletivos), agenda e carências.
 * O sistema registra o que o usuário informa. Não sugere produto, dose,
 * protocolo nem calendário (sem prescrição automática).
 */
export class ServicoSanidade {
  constructor(
    private readonly ctx: ContextoRebanho,
    private readonly pesagens: ServicoPesagens,
    private readonly estoque: ServicoEstoque,
  ) {}

  // -------------------------------------------------------------------------
  // Produtos
  // -------------------------------------------------------------------------

  listarProdutos(): ProdutoSanitario[] {
    return this.ctx.sanidade.listarProdutos();
  }

  private produto(id: string): ProdutoSanitario {
    const p = this.ctx.sanidade.obterProduto(id);
    if (!p) throw naoEncontrado('Produto não encontrado.');
    return p;
  }

  criarProduto(dados: DadosProdutoSanitarioValidados): ProdutoSanitario {
    const normalizado = normalizarNome(dados.nome);
    if (this.ctx.sanidade.nomeProdutoEmUso(normalizado, null)) {
      throw duplicado(`Já existe um produto chamado "${dados.nome}".`);
    }
    const id = this.ctx.gerarId();
    return this.ctx.transacao(() => {
      this.ctx.sanidade.inserirProduto(id, dados, normalizado, this.ctx.agora());
      this.ctx.registrarHistorico('produto_sanitario', id, 'criacao', null, retratoProduto(dados));
      return this.produto(id);
    });
  }

  atualizarProduto(id: string, dados: DadosProdutoSanitarioValidados): ProdutoSanitario {
    const atual = this.produto(id);
    const normalizado = normalizarNome(dados.nome);
    if (this.ctx.sanidade.nomeProdutoEmUso(normalizado, id)) {
      throw duplicado(`Já existe um produto chamado "${dados.nome}".`);
    }
    return this.ctx.transacao(() => {
      this.ctx.sanidade.atualizarProduto(id, dados, normalizado, this.ctx.agora());
      const novo = this.produto(id);
      if (houveMudanca(retratoProduto(atual), retratoProduto(novo))) {
        this.ctx.registrarHistorico(
          'produto_sanitario',
          id,
          'alteracao',
          retratoProduto(atual),
          retratoProduto(novo),
        );
      }
      return novo;
    });
  }

  excluirProduto(id: string): null {
    const atual = this.produto(id);
    if (this.ctx.estoque.usaProduto(id))
      throw operacaoInvalida(
        'O produto está vinculado a um item de estoque e não pode ser excluído.',
      );
    const usos = this.ctx.sanidade.usosDoProduto(id);
    if (usos > 0) {
      throw operacaoInvalida(
        `O produto "${atual.nome}" está em ${usos} registro(s) ou agendamento(s) e não pode ser excluído.`,
      );
    }
    this.ctx.transacao(() => {
      this.ctx.sanidade.excluirProdutoLogico(id, this.ctx.agora());
      this.ctx.registrarHistorico('produto_sanitario', id, 'exclusao', retratoProduto(atual), null);
    });
    return null;
  }

  // -------------------------------------------------------------------------
  // Registros sanitários
  // -------------------------------------------------------------------------

  private manejoBase(id: string): ManejoBase {
    const m = this.ctx.sanidade.obterManejo(id);
    if (!m) throw naoEncontrado('Registro sanitário não encontrado.');
    return m;
  }

  private paraItemAgenda(a: AgendaBase): ItemAgenda {
    return {
      ...a,
      situacao:
        a.status === 'pendente'
          ? situacaoAgenda(a.dataPrevista, this.ctx.hoje(), this.ctx.antecedenciaAgenda())
          : null,
    };
  }

  obterManejo(id: string): ManejoDetalhe {
    const base = this.manejoBase(id);
    const agenda = this.ctx.sanidade.agendaGeradaPor(id);
    return {
      ...base,
      animais: this.ctx.sanidade.listarAnimaisDoManejo(id),
      consumosEstoque: this.estoque.consumosDoManejo(id),
      fimCarenciaCarne: fimCarencia(base.data, base.carenciaCarneDias),
      fimCarenciaLeite: fimCarencia(base.data, base.carenciaLeiteDias),
      proximaAgendada: agenda ? this.paraItemAgenda(agenda) : null,
    };
  }

  listarManejos(propriedadeId: string, filtros: FiltrosManejoValidados): PaginaManejos {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const pagina = filtros.pagina ?? 1;
    const tamanhoPagina = filtros.tamanhoPagina ?? 50;
    const { itens, total } = this.ctx.sanidade.listarManejos({
      propriedadeId,
      ...filtros,
      pagina,
      tamanhoPagina,
    });
    return { itens, total, pagina, tamanhoPagina };
  }

  /** Regras comuns ao registro e à correção. */
  private validarDados(dados: DadosManejoValidados, erros: string[]): void {
    if (diasEntre(this.ctx.hoje(), dados.data) > 0) {
      erros.push(
        'A data da aplicação não pode ser no futuro. Para eventos futuros, use a agenda sanitária.',
      );
    }
    if (dados.produtoId && !this.ctx.sanidade.obterProduto(dados.produtoId)) {
      erros.push('Produto não encontrado.');
    }
  }

  /** O animal precisava estar no rebanho na data da aplicação. */
  private errosDoAnimalNaData(
    animal: { id: string; identificacao: string; dataEntrada: string; dataSaida: string | null },
    data: string,
  ): string[] {
    const erros: string[] = [];
    const fora = this.ctx.animais.ausenciaNaData(animal.id, data);
    if (fora)
      erros.push(
        `${animal.identificacao}: o animal esteve fora do rebanho entre ${dataBr(fora.de)} e o retorno em ${dataBr(fora.ate)}.`,
      );
    if (diasEntre(animal.dataEntrada, data) < 0) {
      erros.push(
        `${animal.identificacao}: a aplicação é anterior à entrada do animal (${dataBr(animal.dataEntrada)}).`,
      );
    }
    if (animal.dataSaida && diasEntre(animal.dataSaida, data) > 0) {
      erros.push(
        `${animal.identificacao}: a aplicação é posterior à saída do animal (${dataBr(animal.dataSaida)}).`,
      );
    }
    return erros;
  }

  /**
   * Registra uma aplicação, exame ou tratamento. Com vários animais (ou um
   * lote), é coletiva: cada animal recebe seu evento, para o histórico
   * individual ficar completo. Tudo ou nada.
   */
  registrarManejo(
    propriedadeId: string,
    dados: DadosManejoValidados,
    animaisInformados: readonly AnimalDoManejoValidado[],
    loteId: string | null,
    agendaId: string | null,
    proxima: ProximaAplicacaoValidada | null,
    consumos: readonly ConsumoEstoque[] = [],
  ): ManejoDetalhe {
    const repetidoId = this.estoque.manejoRepetido(consumos, dados.data);
    if (repetidoId) {
      const anterior = this.obterManejo(repetidoId);
      const valores = { ...anterior, produtoId: anterior.produto?.id ?? null };
      const mesmosDados = Object.entries(dados).every(
        ([chave, valor]) => (valores as unknown as Record<string, unknown>)[chave] === valor,
      );
      const animaisAntes = anterior.animais
        .map((a) => [a.animalId, a.dose])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      const animaisDepois = animaisInformados
        .map((a) => [a.animalId, a.dose])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (
        anterior.propriedadeId !== propriedadeId ||
        !mesmosDados ||
        (anterior.lote?.id ?? null) !== loteId ||
        JSON.stringify(animaisAntes) !== JSON.stringify(animaisDepois) ||
        (anterior.proximaAgendada?.dataPrevista ?? null) !== (proxima?.data ?? null) ||
        (anterior.proximaAgendada?.observacoes ?? null) !== (proxima?.observacoes ?? null)
      ) {
        throw operacaoInvalida('Os identificadores já pertencem a outro conteúdo sanitário.');
      }
      if (agendaId && this.ctx.sanidade.obterAgenda(agendaId)?.manejoRealizadoId !== repetidoId)
        throw operacaoInvalida('Os identificadores já pertencem a outra agenda.');
      return anterior;
    }
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const erros: string[] = [];
    this.validarDados(dados, erros);

    if (loteId) {
      const lote = this.ctx.lotes.obter(loteId);
      if (!lote || lote.propriedadeId !== propriedadeId) erros.push('Lote não encontrado.');
    }

    const ids = animaisInformados.map((a) => a.animalId);
    if (new Set(ids).size !== ids.length) erros.push('Há animais repetidos na lista.');
    const animais = this.ctx.animais.listarBasicos({ propriedadeId, ids: [...new Set(ids)] });
    if (animais.length !== new Set(ids).size) {
      erros.push('Um ou mais animais não foram encontrados nesta propriedade.');
    }
    for (const animal of animais) erros.push(...this.errosDoAnimalNaData(animal, dados.data));
    if (animaisInformados.some((a) => a.dose !== null) && dados.unidadeDose === null) {
      erros.push('Informe a unidade da dose.');
    }

    let agenda: AgendaBase | null = null;
    if (agendaId) {
      agenda = this.ctx.sanidade.obterAgenda(agendaId);
      if (!agenda || agenda.propriedadeId !== propriedadeId) {
        erros.push('Evento da agenda não encontrado.');
      } else if (agenda.status !== 'pendente') {
        erros.push('Este evento da agenda já foi concluído ou cancelado.');
      }
    }
    if (proxima && diasEntre(dados.data, proxima.data) <= 0) {
      erros.push('A próxima aplicação deve ser depois da data desta aplicação.');
    }
    if (erros.length) throw invalido(erros);

    const id = this.ctx.gerarId();
    const abrangencia = animaisInformados.length > 1 || loteId ? 'coletiva' : 'individual';
    return this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      this.ctx.sanidade.inserirManejo(id, propriedadeId, dados, abrangencia, loteId, agora);
      for (const a of animaisInformados) {
        this.ctx.sanidade.inserirEvento(this.ctx.gerarId(), id, a.animalId, a.dose, agora);
      }
      this.estoque.registrarConsumos(propriedadeId, dados.produtoId, id, dados.data, consumos);
      const criado = this.manejoBase(id);
      this.ctx.registrarHistorico('manejo_sanitario', id, 'criacao', null, {
        ...retratoManejo(criado),
        animais: animais.map((a) => a.identificacao),
      });

      if (agenda) {
        this.ctx.sanidade.concluirAgenda(agenda.id, id, dados.data, agora);
        this.ctx.registrarHistorico('agenda_sanitaria', agenda.id, 'conclusao', null, {
          manejoId: id,
          data: dados.data,
        });
      }
      if (proxima) {
        const agendaId = this.ctx.gerarId();
        const unicoAnimal = animaisInformados.length === 1 && !loteId ? ids[0]! : null;
        this.ctx.sanidade.inserirAgenda(
          agendaId,
          propriedadeId,
          {
            dataPrevista: proxima.data,
            tipo: dados.tipo,
            produtoId: dados.produtoId,
            descricao: dados.descricao,
            loteId,
            animalId: unicoAnimal,
            observacoes: proxima.observacoes,
          },
          id,
          agora,
        );
        const criada = this.ctx.sanidade.obterAgenda(agendaId)!;
        this.ctx.registrarHistorico(
          'agenda_sanitaria',
          agendaId,
          'criacao',
          null,
          retratoAgenda(criada),
        );
      }
      return this.obterManejo(id);
    });
  }

  /** Correção dos dados comuns de um registro. Exige motivo. */
  atualizarManejo(
    id: string,
    dados: DadosManejoValidados,
    motivo: string,
    consumos: readonly ConsumoEstoque[] | undefined = undefined,
    confirmarConsumoMantido = false,
  ): ManejoDetalhe {
    const atual = this.manejoBase(id);
    const erros: string[] = [];
    this.validarDados(dados, erros);
    const baixas = this.estoque.consumosDoManejo(id);
    if (baixas.length > 0 && consumos === undefined && !confirmarConsumoMantido)
      throw operacaoInvalida(
        'Confirme explicitamente o consumo mantido ou reconcilie as quantidades de estoque.',
      );
    if (
      baixas.length > 0 &&
      consumos === undefined &&
      (dados.data !== atual.data || dados.produtoId !== (atual.produto?.id ?? null))
    )
      throw operacaoInvalida('Alteração de data ou produto exige reconciliar o estoque.');
    const doManejo = this.ctx.sanidade.listarAnimaisDoManejo(id);
    const animais = this.ctx.animais.listarBasicos({
      propriedadeId: atual.propriedadeId,
      ids: doManejo.map((a) => a.animalId),
    });
    for (const animal of animais) erros.push(...this.errosDoAnimalNaData(animal, dados.data));
    if (doManejo.some((a) => a.dose !== null) && dados.unidadeDose === null) {
      erros.push('Há doses individuais neste registro: informe a unidade da dose.');
    }
    if (erros.length) throw invalido(erros);
    return this.ctx.transacao(() => {
      if (consumos !== undefined)
        this.estoque.reconciliar(
          id,
          atual.propriedadeId,
          dados.produtoId,
          dados.data,
          consumos,
          motivo,
        );
      this.ctx.sanidade.atualizarManejo(id, dados, this.ctx.agora());
      const novo = this.manejoBase(id);
      if (houveMudanca(retratoManejo(atual), retratoManejo(novo))) {
        this.ctx.registrarHistorico(
          'manejo_sanitario',
          id,
          'alteracao',
          retratoManejo(atual),
          retratoManejo(novo),
          motivo,
        );
      }
      return this.obterManejo(id);
    });
  }

  /** Tira um animal de um registro feito por engano para ele. */
  removerAnimal(
    manejoId: string,
    animalId: string,
    motivo: string,
    confirmarConsumoMantido = false,
  ): ManejoDetalhe {
    if (this.estoque.consumosDoManejo(manejoId).length > 0 && !confirmarConsumoMantido)
      throw operacaoInvalida(
        'Confirme que a quantidade consumida permanece a mesma. Não há estorno proporcional automático.',
      );
    const manejo = this.manejoBase(manejoId);
    const animais = this.ctx.sanidade.listarAnimaisDoManejo(manejoId);
    const alvo = animais.find((a) => a.animalId === animalId);
    if (!alvo) throw naoEncontrado('O animal não está neste registro.');
    if (animais.length === 1) {
      throw operacaoInvalida(
        'Este é o único animal do registro. Para desfazer, exclua o registro inteiro.',
      );
    }
    return this.ctx.transacao(() => {
      this.ctx.sanidade.removerEventoLogico(manejoId, animalId, this.ctx.agora());
      this.ctx.registrarHistorico(
        'manejo_sanitario',
        manejoId,
        'remocao_animal',
        { animalId, animal: alvo.identificacao, data: manejo.data },
        null,
        motivo,
      );
      return this.obterManejo(manejoId);
    });
  }

  /**
   * Exclusão lógica do registro e dos eventos dos animais. Eventos da agenda
   * que ele tinha realizado voltam a ficar pendentes.
   */
  excluirManejo(id: string, motivo: string, estornarEstoque = false): null {
    const atual = this.manejoBase(id);
    const baixas = this.estoque.consumosDoManejo(id);
    if (baixas.length > 0 && !estornarEstoque)
      throw operacaoInvalida(
        'Confirme explicitamente o estorno das baixas ao excluir o registro feito por engano.',
      );
    this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      for (const baixa of baixas) this.estoque.cancelar(baixa.id, motivo, true);
      this.ctx.sanidade.excluirManejoLogico(id, agora);
      for (const agendaId of this.ctx.sanidade.reabrirAgendaDoManejo(id, agora)) {
        this.ctx.registrarHistorico(
          'agenda_sanitaria',
          agendaId,
          'reabertura',
          { manejoId: id },
          null,
          'Registro sanitário excluído',
        );
      }
      this.ctx.registrarHistorico(
        'manejo_sanitario',
        id,
        'exclusao',
        retratoManejo(atual),
        null,
        motivo,
      );
    });
    return null;
  }

  // -------------------------------------------------------------------------
  // Animal
  // -------------------------------------------------------------------------

  /** Carência em curso com o fim de prazo mais distante, ou null. */
  private carenciaAtiva(
    registros: readonly { fimPrazo: string | null; manejoId: string; produto: string }[],
  ): CarenciaAtiva | null {
    const hoje = this.ctx.hoje();
    let maior: CarenciaAtiva | null = null;
    for (const r of registros) {
      if (!r.fimPrazo || !emCarencia(r.fimPrazo, hoje)) continue;
      if (!maior || r.fimPrazo > maior.fimPrazo) {
        maior = { fimPrazo: r.fimPrazo, manejoId: r.manejoId, produto: r.produto };
      }
    }
    return maior;
  }

  doAnimal(animalId: string): SanidadeDoAnimal {
    const animal = this.ctx.animais.obter(animalId);
    if (!animal) throw naoEncontrado('Animal não encontrado.');
    const eventos = this.ctx.sanidade.listarEventosDoAnimal(animalId).map(paraEventoAnimal);
    const nome = (e: EventoSanitarioAnimal) => e.produto?.nome ?? e.descricao ?? '—';
    return {
      eventos,
      carenciaCarne: this.carenciaAtiva(
        eventos.map((e) => ({
          fimPrazo: e.fimCarenciaCarne,
          manejoId: e.manejoId,
          produto: nome(e),
        })),
      ),
      carenciaLeite: this.carenciaAtiva(
        eventos.map((e) => ({
          fimPrazo: e.fimCarenciaLeite,
          manejoId: e.manejoId,
          produto: nome(e),
        })),
      ),
      agenda: this.ctx.sanidade
        .agendaPendenteDoAnimal(animalId, animal.lote?.id ?? null)
        .map((a) => this.paraItemAgenda(a)),
    };
  }

  // -------------------------------------------------------------------------
  // Agenda
  // -------------------------------------------------------------------------

  private agenda(id: string): AgendaBase {
    const a = this.ctx.sanidade.obterAgenda(id);
    if (!a) throw naoEncontrado('Evento da agenda não encontrado.');
    return a;
  }

  listarAgenda(propriedadeId: string, incluirConcluidos: boolean): ItemAgenda[] {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    return this.ctx.sanidade
      .listarAgenda(propriedadeId, incluirConcluidos)
      .map((a) => this.paraItemAgenda(a));
  }

  private validarAgenda(propriedadeId: string, dados: DadosAgendaValidados): void {
    const erros: string[] = [];
    if (dados.produtoId && !this.ctx.sanidade.obterProduto(dados.produtoId)) {
      erros.push('Produto não encontrado.');
    }
    if (dados.loteId) {
      const lote = this.ctx.lotes.obter(dados.loteId);
      if (!lote || lote.propriedadeId !== propriedadeId) erros.push('Lote não encontrado.');
      else if (!lote.ativo) erros.push(`O lote "${lote.nome}" está encerrado.`);
    }
    if (dados.animalId) {
      const animal = this.ctx.animais.obter(dados.animalId);
      if (!animal || animal.propriedadeId !== propriedadeId) erros.push('Animal não encontrado.');
      else if (animal.status !== 'ativo') erros.push('O animal não está ativo no rebanho.');
    }
    if (erros.length) throw invalido(erros);
  }

  criarAgenda(propriedadeId: string, dados: DadosAgendaValidados): ItemAgenda {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    this.validarAgenda(propriedadeId, dados);
    const id = this.ctx.gerarId();
    return this.ctx.transacao(() => {
      this.ctx.sanidade.inserirAgenda(id, propriedadeId, dados, null, this.ctx.agora());
      const criada = this.agenda(id);
      this.ctx.registrarHistorico('agenda_sanitaria', id, 'criacao', null, retratoAgenda(criada));
      return this.paraItemAgenda(criada);
    });
  }

  atualizarAgenda(id: string, dados: DadosAgendaValidados, motivo: string | null): ItemAgenda {
    const atual = this.agenda(id);
    if (atual.status !== 'pendente') {
      throw operacaoInvalida('Só eventos pendentes podem ser alterados.');
    }
    this.validarAgenda(atual.propriedadeId, dados);
    return this.ctx.transacao(() => {
      this.ctx.sanidade.atualizarAgenda(id, dados, this.ctx.agora());
      const nova = this.agenda(id);
      if (houveMudanca(retratoAgenda(atual), retratoAgenda(nova))) {
        this.ctx.registrarHistorico(
          'agenda_sanitaria',
          id,
          'alteracao',
          retratoAgenda(atual),
          retratoAgenda(nova),
          motivo,
        );
      }
      return this.paraItemAgenda(nova);
    });
  }

  cancelarAgenda(id: string, motivo: string): ItemAgenda {
    const atual = this.agenda(id);
    if (atual.status !== 'pendente') {
      throw operacaoInvalida('Este evento já foi concluído ou cancelado.');
    }
    return this.ctx.transacao(() => {
      this.ctx.sanidade.cancelarAgenda(id, motivo, this.ctx.hoje(), this.ctx.agora());
      this.ctx.registrarHistorico(
        'agenda_sanitaria',
        id,
        'cancelamento',
        retratoAgenda(atual),
        null,
        motivo,
      );
      return this.paraItemAgenda(this.agenda(id));
    });
  }

  // -------------------------------------------------------------------------
  // Resumo para o painel e a agenda
  // -------------------------------------------------------------------------

  resumo(propriedadeId: string): ResumoSanidade {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const hoje = this.ctx.hoje();
    const agenda = this.listarAgenda(propriedadeId, false);
    const registros = this.ctx.sanidade.listarCarencias(
      propriedadeId,
      somarDias(hoje, -CARENCIA_MAXIMA_DIAS),
    );
    const porAnimal = new Map<string, typeof registros>();
    for (const r of registros) {
      const lista = porAnimal.get(r.animalId) ?? [];
      lista.push(r);
      porAnimal.set(r.animalId, lista);
    }
    const emCarenciaLista: AnimalEmCarencia[] = [];
    for (const lista of porAnimal.values()) {
      const carne = this.carenciaAtiva(
        lista.map((r) => ({
          fimPrazo: fimCarencia(r.data, r.carenciaCarneDias),
          manejoId: r.manejoId,
          produto: r.produto,
        })),
      );
      const leite = this.carenciaAtiva(
        lista.map((r) => ({
          fimPrazo: fimCarencia(r.data, r.carenciaLeiteDias),
          manejoId: r.manejoId,
          produto: r.produto,
        })),
      );
      if (carne || leite) {
        const r = lista[0]!;
        emCarenciaLista.push({
          animalId: r.animalId,
          identificacao: r.identificacao,
          nome: r.nome,
          lote: r.lote,
          carne,
          leite,
        });
      }
    }
    return {
      antecedenciaDias: this.ctx.antecedenciaAgenda(),
      agendaAtrasada: agenda.filter((a) => a.situacao === 'atrasado').length,
      agendaProxima: agenda.filter((a) => a.situacao === 'hoje' || a.situacao === 'proximo').length,
      emCarencia: emCarenciaLista,
      alertasPesagemPendentes: this.pesagens.contarAlertasPendentes(propriedadeId),
    };
  }
}
