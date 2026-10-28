import type {
  AnimalDetalhe,
  CampoAlterado,
  DadosAnimalValidados,
  EntradaAnimalValidada,
  EventoHistoricoAnimal,
  FiltrosAnimalValidados,
  HistoricoAnimal,
  PaginaAnimais,
  ResultadoTransferencia,
} from '@pecuaria/shared-types';
import {
  dataLocalIso,
  diasEntre,
  normalizarIdentificacao,
  normalizarNome,
  validarConsistenciaAnimal,
  validarDataDeEvento,
  type MetodoPesagem,
  type TipoSaida,
} from '@pecuaria/domain';
import type { GravacaoAnimal } from '@pecuaria/database';
import {
  dataBr,
  descreverConsumosConflitantes,
  descreverLancamentosConflitantes,
  duplicado,
  houveMudanca,
  invalido,
  naoEncontrado,
  operacaoInvalida,
  type ContextoRebanho,
} from './contexto';
import { paraEventoAnimal } from './servico-sanidade';

/** Retrato legível do animal para a trilha de alterações. */
export function retratoAnimal(a: AnimalDetalhe): Record<string, unknown> {
  return {
    identificacao: a.identificacao,
    nome: a.nome,
    sexo: a.sexo,
    condicaoSexual: a.condicaoSexual,
    categoria: a.categoria,
    aptidao: a.aptidao,
    raca: a.raca?.nome ?? null,
    dataNascimento: a.dataNascimento,
    dataNascimentoEstimada: a.dataNascimentoEstimada,
    mae: a.mae?.identificacao ?? null,
    pai: a.pai?.identificacao ?? null,
    origem: a.origem,
    observacoes: a.observacoes,
  };
}

/** Animal novo já validado, pronto para gravar (usado no cadastro e na importação). */
export interface NovoAnimalPreparado {
  id: string;
  propriedadeId: string;
  gravacao: GravacaoAnimal;
  dataEntrada: string;
  loteId: string | null;
  pesagem: { pesoVivoKg: number; metodo: MetodoPesagem; data: string } | null;
}

export class ServicoAnimais {
  constructor(private readonly ctx: ContextoRebanho) {}

  listar(propriedadeId: string, filtros: FiltrosAnimalValidados): PaginaAnimais {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const pagina = filtros.pagina ?? 1;
    const tamanhoPagina = filtros.tamanhoPagina ?? 50;
    const { itens, total } = this.ctx.animais.listar({
      propriedadeId,
      ...filtros,
      pagina,
      tamanhoPagina,
    });
    return { itens, total, pagina, tamanhoPagina };
  }

  obter(id: string): AnimalDetalhe {
    const animal = this.ctx.animais.obter(id);
    if (!animal) throw naoEncontrado('Animal não encontrado.');
    return animal;
  }

  // -------------------------------------------------------------------------
  // Validações compartilhadas por cadastro, edição e importação
  // -------------------------------------------------------------------------

  /** Mãe e pai: mesma propriedade, sexo certo, nascidos antes, sem ciclo. */
  private validarGenealogia(
    animalId: string | null,
    propriedadeId: string,
    dados: Pick<DadosAnimalValidados, 'maeId' | 'paiId' | 'dataNascimento'>,
  ): string[] {
    const erros: string[] = [];
    const conferir = (paiOuMaeId: string | null, sexoEsperado: 'F' | 'M', papel: string) => {
      if (!paiOuMaeId) return;
      if (paiOuMaeId === animalId) {
        erros.push(`O animal não pode ser ${papel} de si mesmo.`);
        return;
      }
      const genitor = this.ctx.animais.obterBasico(paiOuMaeId);
      if (!genitor || genitor.excluido) {
        erros.push(`O animal indicado como ${papel} não foi encontrado.`);
        return;
      }
      if (genitor.propriedadeId !== propriedadeId)
        erros.push(`A ${papel} deve ser da mesma propriedade.`);
      if (genitor.sexo !== sexoEsperado) {
        erros.push(sexoEsperado === 'F' ? 'A mãe precisa ser fêmea.' : 'O pai precisa ser macho.');
      }
      if (
        genitor.dataNascimento &&
        dados.dataNascimento &&
        diasEntre(genitor.dataNascimento, dados.dataNascimento) <= 0
      ) {
        erros.push(`A ${papel} precisa ter nascido antes do animal.`);
      }
      if (animalId && this.ehAncestral(animalId, paiOuMaeId)) {
        erros.push(`O animal indicado como ${papel} é descendente deste animal.`);
      }
    };
    conferir(dados.maeId, 'F', 'mãe');
    conferir(dados.paiId, 'M', 'pai');
    return erros;
  }

  /** `possivelAncestral` aparece subindo a genealogia de `descendente`? */
  private ehAncestral(possivelAncestral: string, descendente: string): boolean {
    const visitados = new Set<string>();
    const fila = [descendente];
    while (fila.length > 0 && visitados.size < 1000) {
      const atual = fila.shift()!;
      if (visitados.has(atual)) continue;
      visitados.add(atual);
      const linha = this.ctx.gerenciador.conexao
        .prepare('SELECT mae_id, pai_id FROM animal WHERE id = ?')
        .get(atual) as { mae_id: string | null; pai_id: string | null } | undefined;
      for (const genitor of [linha?.mae_id, linha?.pai_id]) {
        if (!genitor) continue;
        if (genitor === possivelAncestral) return true;
        fila.push(genitor);
      }
    }
    return false;
  }

  private gravacao(dados: DadosAnimalValidados): GravacaoAnimal {
    return {
      identificacao: dados.identificacao,
      identificacaoNormalizada: normalizarIdentificacao(dados.identificacao),
      nome: dados.nome,
      sexo: dados.sexo,
      condicaoSexual: dados.condicaoSexual,
      categoria: dados.categoria,
      aptidao: dados.aptidao,
      racaId: dados.racaId,
      dataNascimento: dados.dataNascimento,
      dataNascimentoEstimada: dados.dataNascimentoEstimada,
      maeId: dados.maeId,
      paiId: dados.paiId,
      origem: dados.origem,
      observacoes: dados.observacoes,
    };
  }

  /**
   * Valida um animal novo sem gravar. Retorna os erros ou o animal preparado.
   * Erros de identificação repetida vêm com código DUPLICADO no cadastro.
   */
  prepararNovo(
    propriedadeId: string,
    dados: DadosAnimalValidados,
    entrada: EntradaAnimalValidada,
  ): { erros: string[]; duplicado: boolean; preparado: NovoAnimalPreparado | null } {
    const hoje = this.ctx.hoje();
    const erros = validarConsistenciaAnimal({ ...dados, dataEntrada: entrada.data }, hoje);
    const gravacao = this.gravacao(dados);

    const identificacaoRepetida = this.ctx.animais.identificacaoEmUso(
      propriedadeId,
      gravacao.identificacaoNormalizada,
      null,
    );
    if (identificacaoRepetida) {
      erros.push(
        `Já existe um animal com a identificação "${dados.identificacao}" nesta propriedade.`,
      );
    }
    if (dados.racaId && !this.ctx.racas.obter(dados.racaId)) erros.push('Raça não encontrada.');
    erros.push(...this.validarGenealogia(null, propriedadeId, dados));

    if (entrada.loteId) {
      const lote = this.ctx.lotes.obter(entrada.loteId);
      if (!lote) erros.push('Lote não encontrado.');
      else {
        if (lote.propriedadeId !== propriedadeId)
          erros.push('O lote pertence a outra propriedade.');
        if (!lote.ativo) erros.push(`O lote "${lote.nome}" está encerrado.`);
        if (diasEntre(lote.dataFormacao, entrada.data) < 0) {
          erros.push(
            `O lote "${lote.nome}" foi formado em ${dataBr(lote.dataFormacao)}, depois da data de entrada.`,
          );
        }
      }
    }

    const preparado: NovoAnimalPreparado | null =
      erros.length === 0
        ? {
            id: this.ctx.gerarId(),
            propriedadeId,
            gravacao,
            dataEntrada: entrada.data,
            loteId: entrada.loteId,
            pesagem:
              entrada.pesoVivoKg !== null && entrada.metodoPesagem !== null
                ? {
                    pesoVivoKg: entrada.pesoVivoKg,
                    metodo: entrada.metodoPesagem,
                    data: entrada.data,
                  }
                : null,
          }
        : null;
    return { erros, duplicado: identificacaoRepetida, preparado };
  }

  /** Grava um animal preparado. Deve ser chamado dentro de uma transação. */
  gravarNovo(novo: NovoAnimalPreparado, acao: 'criacao' | 'importacao'): void {
    const agora = this.ctx.agora();
    this.ctx.animais.inserir(
      novo.id,
      novo.propriedadeId,
      novo.loteId,
      novo.dataEntrada,
      novo.gravacao,
      agora,
    );
    this.ctx.animais.registrarMovimentacao(
      this.ctx.gerarId(),
      novo.id,
      'entrada',
      novo.dataEntrada,
      null,
      novo.loteId,
      acao === 'importacao' ? 'Importação de planilha' : null,
      agora,
    );
    if (novo.pesagem) {
      this.ctx.pesagens.inserir(
        this.ctx.gerarId(),
        novo.id,
        {
          data: novo.pesagem.data,
          pesoVivoKg: novo.pesagem.pesoVivoKg,
          metodo: novo.pesagem.metodo,
          observacao: 'Peso de entrada',
        },
        agora,
      );
    }
    this.ctx.registrarHistorico('animal', novo.id, acao, null, retratoAnimal(this.obter(novo.id)));
  }

  criar(
    propriedadeId: string,
    dados: DadosAnimalValidados,
    entrada: EntradaAnimalValidada,
  ): AnimalDetalhe {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const {
      erros,
      duplicado: repetido,
      preparado,
    } = this.prepararNovo(propriedadeId, dados, entrada);
    if (repetido && erros.length === 1) throw duplicado(erros[0]!);
    if (!preparado) throw invalido(erros);
    return this.ctx.transacao(() => {
      this.gravarNovo(preparado, 'criacao');
      return this.obter(preparado.id);
    });
  }

  // -------------------------------------------------------------------------
  // Edição
  // -------------------------------------------------------------------------

  atualizar(id: string, dados: DadosAnimalValidados, motivo: string | null): AnimalDetalhe {
    const atual = this.obter(id);
    const hoje = this.ctx.hoje();
    const gravacao = this.gravacao(dados);
    const erros = validarConsistenciaAnimal({ ...dados, dataEntrada: atual.dataEntrada }, hoje);

    if (
      this.ctx.animais.identificacaoEmUso(
        atual.propriedadeId,
        gravacao.identificacaoNormalizada,
        id,
      )
    ) {
      throw duplicado(
        `Já existe um animal com a identificação "${dados.identificacao}" nesta propriedade.`,
      );
    }
    if (dados.racaId && !this.ctx.racas.obter(dados.racaId)) erros.push('Raça não encontrada.');
    erros.push(...this.validarGenealogia(id, atual.propriedadeId, dados));

    const filhos = this.ctx.animais.contarFilhos(id);
    if (dados.sexo === 'M' && filhos.comoMae > 0) {
      erros.push(
        `O animal é mãe de ${filhos.comoMae} animal(is) cadastrado(s) e não pode ser macho.`,
      );
    }
    if (dados.sexo === 'F' && filhos.comoPai > 0) {
      erros.push(
        `O animal é pai de ${filhos.comoPai} animal(is) cadastrado(s) e não pode ser fêmea.`,
      );
    }
    if (dados.dataNascimento) {
      const primeiraPesagem = this.ctx.pesagens.primeiraData(id);
      if (primeiraPesagem && diasEntre(dados.dataNascimento, primeiraPesagem) < 0) {
        erros.push(
          `Há pesagem em ${dataBr(primeiraPesagem)}, antes da data de nascimento informada.`,
        );
      }
      const filhoMaisVelho = this.ctx.animais.nascimentoMaisAntigoDosFilhos(id);
      if (filhoMaisVelho && diasEntre(dados.dataNascimento, filhoMaisVelho) <= 0) {
        erros.push('Há filho cadastrado nascido antes da data de nascimento informada.');
      }
    }
    if (erros.length) throw invalido(erros);

    return this.ctx.transacao(() => {
      this.ctx.animais.atualizar(id, gravacao, this.ctx.agora());
      const novo = this.obter(id);
      const antes = retratoAnimal(atual);
      const depois = retratoAnimal(novo);
      if (houveMudanca(antes, depois)) {
        this.ctx.registrarHistorico('animal', id, 'alteracao', antes, depois, motivo);
      }
      return novo;
    });
  }

  // -------------------------------------------------------------------------
  // Transferência entre lotes
  // -------------------------------------------------------------------------

  /**
   * Transfere um ou vários animais para um lote (ou para "sem lote").
   * Tudo ou nada: se um animal não puder ser transferido, nenhum é.
   */
  transferir(
    animalIds: readonly string[],
    loteDestinoId: string | null,
    data: string,
    motivo: string | null,
  ): ResultadoTransferencia {
    const ids = [...new Set(animalIds)];
    const hoje = this.ctx.hoje();
    const erros: string[] = [];
    const animais = ids.map((id) => this.ctx.animais.obter(id));
    if (animais.some((a) => a === null))
      throw naoEncontrado('Um ou mais animais não foram encontrados.');
    const lista = animais as AnimalDetalhe[];

    const propriedades = new Set(lista.map((a) => a.propriedadeId));
    if (propriedades.size > 1)
      throw operacaoInvalida('Os animais selecionados são de propriedades diferentes.');
    const propriedadeId = lista[0]!.propriedadeId;

    let destinoNome: string | null = null;
    if (loteDestinoId) {
      const destino = this.ctx.lotes.obter(loteDestinoId);
      if (!destino) throw naoEncontrado('Lote de destino não encontrado.');
      if (destino.propriedadeId !== propriedadeId)
        throw operacaoInvalida('O lote de destino é de outra propriedade.');
      if (!destino.ativo) throw operacaoInvalida(`O lote "${destino.nome}" está encerrado.`);
      if (diasEntre(destino.dataFormacao, data) < 0) {
        erros.push(
          `O lote "${destino.nome}" foi formado em ${dataBr(destino.dataFormacao)}, depois da data da transferência.`,
        );
      }
      destinoNome = destino.nome;
    }

    for (const animal of lista) {
      const prefixo = `${animal.identificacao}: `;
      if (animal.status !== 'ativo') {
        erros.push(`${prefixo}o animal não está ativo no rebanho.`);
        continue;
      }
      if ((animal.lote?.id ?? null) === loteDestinoId) {
        erros.push(
          `${prefixo}o animal já está ${destinoNome ? `no lote "${destinoNome}"` : 'sem lote'}.`,
        );
        continue;
      }
      for (const e of validarDataDeEvento(
        data,
        {
          dataEntrada: animal.dataEntrada,
          hoje,
          ultimoEvento: this.ctx.animais.ultimaMovimentacao(animal.id),
        },
        'da transferência',
      )) {
        erros.push(prefixo + e);
      }
    }
    if (erros.length) {
      throw operacaoInvalida(
        erros.length === 1
          ? erros[0]!
          : 'Nenhum animal foi transferido. Corrija os problemas abaixo.',
        erros,
      );
    }

    this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      for (const animal of lista) {
        this.ctx.animais.registrarMovimentacao(
          this.ctx.gerarId(),
          animal.id,
          'troca_lote',
          data,
          animal.lote?.id ?? null,
          loteDestinoId,
          motivo,
          agora,
        );
        this.ctx.animais.definirLote(animal.id, loteDestinoId, agora);
        this.ctx.registrarHistorico(
          'animal',
          animal.id,
          'transferencia',
          { lote: animal.lote?.nome ?? null },
          { lote: destinoNome, data },
          motivo,
        );
      }
    });
    return { transferidos: lista.length };
  }

  // -------------------------------------------------------------------------
  // Saída e exclusão
  // -------------------------------------------------------------------------

  registrarSaida(id: string, tipo: TipoSaida, data: string, motivo: string | null): AnimalDetalhe {
    const animal = this.obter(id);
    if (animal.status !== 'ativo') throw operacaoInvalida('O animal já saiu do rebanho.');
    const erros = validarDataDeEvento(
      data,
      {
        dataEntrada: animal.dataEntrada,
        hoje: this.ctx.hoje(),
        ultimoEvento: this.ctx.animais.ultimaMovimentacao(id),
      },
      'de saída',
    );
    const ultimaPesagem = this.ctx.pesagens.ultimaData(id);
    if (ultimaPesagem && diasEntre(ultimaPesagem, data) < 0) {
      erros.push(`Há pesagem em ${dataBr(ultimaPesagem)}, depois da data de saída informada.`);
    }
    const consumos = this.ctx.estoque.consumosDoAnimalApos(id, data);
    if (consumos.total > 0) {
      erros.push(
        descreverConsumosConflitantes(
          consumos,
          'O animal tem consumo de estoque registrado depois da data de saída informada',
        ),
      );
    }
    const lancamentos = this.ctx.financeiro.lancamentosDoAnimalApos(id, data);
    if (lancamentos.total > 0) {
      erros.push(
        descreverLancamentosConflitantes(
          lancamentos,
          'O animal tem lançamento financeiro com competência depois da data de saída informada',
        ),
      );
    }
    if (erros.length) throw invalido(erros);
    return this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      this.ctx.animais.registrarMovimentacao(
        this.ctx.gerarId(),
        id,
        'saida',
        data,
        animal.lote?.id ?? null,
        null,
        motivo,
        agora,
      );
      this.ctx.animais.registrarSaida(id, tipo, data, motivo, agora);
      this.ctx.registrarHistorico(
        'animal',
        id,
        'saida',
        { status: animal.status, lote: animal.lote?.nome ?? null },
        { status: tipo, dataSaida: data },
        motivo,
      );
      return this.obter(id);
    });
  }

  /**
   * Desfaz a saída de um animal (decisão D-H): reversão auditável, com motivo, na mesma transação.
   * A movimentação de saída não é apagada: é cancelada logicamente, e a trilha guarda o estado
   * anterior e o novo. Se a saída foi uma venda registrada, a reversão é feita pelo cancelamento
   * da venda (`viaCancelamentoDeVenda`), que antes confere os recebimentos. Nada é decidido
   * sozinho: se o lote de origem foi encerrado, o usuário escolhe o destino.
   */
  desfazerSaida(
    id: string,
    motivo: string,
    destino:
      | { tipo: 'origem' }
      | { tipo: 'reabrir_origem' }
      | { tipo: 'lote'; loteId: string }
      | { tipo: 'sem_lote' },
    viaCancelamentoDeVenda = false,
  ): AnimalDetalhe {
    const animal = this.obter(id);
    if (animal.status === 'ativo') throw operacaoInvalida('O animal não saiu do rebanho.');
    const saida = this.ctx.animais.obterMovimentacaoDeSaida(id);
    if (!saida) throw operacaoInvalida('Não há saída registrada para desfazer.');
    if (!viaCancelamentoDeVenda && this.ctx.negociacao.itemAtivoDoAnimal(id, 'venda')) {
      throw operacaoInvalida(
        'A saída deste animal é de uma venda registrada. Cancele a venda no módulo Financeiro (Animais: compras e vendas): o cancelamento confere os recebimentos e desfaz a saída.',
      );
    }
    if (!viaCancelamentoDeVenda && this.ctx.devolucao.itemAtivoPorMovimentacao(saida.id)) {
      throw operacaoInvalida(
        'A saída deste animal é de uma devolução ao fornecedor. Cancele a devolução no módulo Financeiro (na compra do animal): o cancelamento confere os recebimentos e desfaz a saída.',
      );
    }
    const erros: string[] = [];
    const ultimaPesagem = this.ctx.pesagens.ultimaData(id);
    if (ultimaPesagem && diasEntre(saida.data, ultimaPesagem) > 0)
      erros.push(`Há pesagem em ${dataBr(ultimaPesagem)}, depois da data de saída.`);
    const consumos = this.ctx.estoque.consumosDoAnimalApos(id, saida.data);
    if (consumos.total > 0)
      erros.push(
        descreverConsumosConflitantes(
          consumos,
          'O animal tem consumo de estoque registrado depois da data de saída',
        ),
      );
    const lancamentos = this.ctx.financeiro.lancamentosDoAnimalApos(id, saida.data);
    if (lancamentos.total > 0)
      erros.push(
        descreverLancamentosConflitantes(
          lancamentos,
          'O animal tem lançamento financeiro com competência depois da data de saída',
        ),
      );
    const eventosPosteriores = this.ctx.sanidade
      .listarEventosDoAnimal(id)
      .filter((e) => diasEntre(saida.data, e.data) > 0);
    if (eventosPosteriores.length > 0)
      erros.push(
        `Há ${eventosPosteriores.length} registro(s) sanitário(s) depois da data de saída (${dataBr(saida.data)}).`,
      );

    // Destino: nada é decidido sozinho quando o lote de origem não está disponível.
    const origem = saida.loteOrigemId ? this.ctx.lotes.obter(saida.loteOrigemId) : null;
    let loteDestinoId: string | null = null;
    let reabrirOrigem = false;
    if (destino.tipo === 'origem') {
      if (saida.loteOrigemId) {
        if (!origem) erros.push('O lote de origem não foi encontrado. Escolha outro destino.');
        else if (!origem.ativo)
          erros.push(
            `O lote de origem "${origem.nome}" está encerrado. Escolha reabrir esse lote, outro lote ativo ou ficar sem lote.`,
          );
        else loteDestinoId = origem.id;
      }
    } else if (destino.tipo === 'reabrir_origem') {
      if (!origem) erros.push('O animal não saiu de um lote que possa ser reaberto.');
      else {
        loteDestinoId = origem.id;
        reabrirOrigem = !origem.ativo;
        if (
          reabrirOrigem &&
          this.ctx.lotes.nomeEmUso(origem.propriedadeId, normalizarNome(origem.nome), origem.id)
        )
          erros.push(
            `Já existe outro lote ativo chamado "${origem.nome}": não é possível reabrir o lote de origem.`,
          );
      }
    } else if (destino.tipo === 'lote') {
      const lote = this.ctx.lotes.obter(destino.loteId);
      if (!lote || lote.propriedadeId !== animal.propriedadeId)
        erros.push('Lote de destino não encontrado nesta propriedade.');
      else if (!lote.ativo) erros.push(`O lote "${lote.nome}" está encerrado.`);
      else if (diasEntre(lote.dataFormacao, saida.data) < 0)
        erros.push(
          `O lote "${lote.nome}" foi formado em ${dataBr(lote.dataFormacao)}, depois da data de saída.`,
        );
      else loteDestinoId = lote.id;
    }
    if (erros.length) throw invalido(erros);

    return this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      if (reabrirOrigem && origem) {
        this.ctx.lotes.reabrir(origem.id, agora);
        this.ctx.registrarHistorico(
          'lote',
          origem.id,
          'reabertura',
          { ativo: false, dataEncerramento: origem.dataEncerramento },
          { ativo: true },
          `Reabertura para desfazer a saída do animal ${animal.identificacao}: ${motivo}`,
        );
      }
      this.ctx.animais.cancelarMovimentacao(saida.id, agora);
      if (loteDestinoId !== saida.loteOrigemId) {
        // O animal volta a um lote diferente do de origem: registra a troca na data da saída,
        // para a linha do tempo dos lotes continuar coerente.
        this.ctx.animais.registrarMovimentacao(
          this.ctx.gerarId(),
          id,
          'troca_lote',
          saida.data,
          saida.loteOrigemId,
          loteDestinoId,
          `Reversão de saída: ${motivo}`,
          agora,
        );
      }
      this.ctx.animais.reativar(id, loteDestinoId, agora);
      const novo = this.obter(id);
      this.ctx.registrarHistorico(
        'animal',
        id,
        'reversao_saida',
        { status: animal.status, dataSaida: saida.data, lote: animal.lote?.nome ?? null },
        { status: 'ativo', dataSaida: null, lote: novo.lote?.nome ?? null },
        motivo,
      );
      return novo;
    });
  }

  /**
   * Retorno ao rebanho de um animal que saiu (devolução da venda pelo comprador): nova entrada na
   * data do retorno. A saída continua no histórico e nada é reconstruído para trás; o período fora
   * do rebanho não pertence a nenhum lote. Chamado dentro da transação da devolução. Devolve o id
   * da movimentação de retorno.
   */
  registrarRetorno(id: string, data: string, loteId: string | null, motivo: string): string {
    const animal = this.obter(id);
    if (animal.status === 'ativo') throw operacaoInvalida('O animal está no rebanho.');
    const saida = this.ctx.animais.obterMovimentacaoDeSaida(id);
    if (!saida) throw operacaoInvalida('Não há saída registrada para o retorno.');
    const erros: string[] = [];
    if (diasEntre(saida.data, data) < 0)
      erros.push(`O retorno não pode ser anterior à saída (${dataBr(saida.data)}).`);
    if (diasEntre(this.ctx.hoje(), data) > 0) erros.push('O retorno não pode ter data futura.');
    const ultima = this.ctx.animais.ultimaMovimentacao(id);
    if (ultima && diasEntre(ultima, data) < 0)
      erros.push(`Há movimentação do animal em ${dataBr(ultima)}, depois da data do retorno.`);
    if (loteId) {
      const lote = this.ctx.lotes.obter(loteId);
      if (!lote || lote.propriedadeId !== animal.propriedadeId)
        erros.push('Lote de destino não encontrado nesta propriedade.');
      else if (!lote.ativo) erros.push(`O lote "${lote.nome}" está encerrado.`);
      else if (diasEntre(lote.dataFormacao, data) < 0)
        erros.push(
          `O lote "${lote.nome}" foi formado em ${dataBr(lote.dataFormacao)}, depois da data do retorno.`,
        );
    }
    if (erros.length) throw invalido(erros);
    return this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      const movimentacaoId = this.ctx.gerarId();
      this.ctx.animais.registrarMovimentacao(
        movimentacaoId,
        id,
        'entrada',
        data,
        null,
        loteId,
        motivo,
        agora,
      );
      this.ctx.animais.reativar(id, loteId, agora);
      const novo = this.obter(id);
      this.ctx.registrarHistorico(
        'animal',
        id,
        'retorno',
        { status: animal.status, dataSaida: saida.data },
        { status: 'ativo', dataRetorno: data, lote: novo.lote?.nome ?? null },
        motivo,
      );
      return movimentacaoId;
    });
  }

  /**
   * Desfaz um retorno (cancelamento da devolução da venda): o animal volta a constar como vendido
   * desde a saída original. Recusado, com a lista do que impede, se houver qualquer fato do animal
   * depois da saída original (o animal não estaria no rebanho para ele).
   */
  desfazerRetorno(id: string, movimentacaoRetornoId: string, motivo: string): AnimalDetalhe {
    const animal = this.obter(id);
    const movs = this.ctx.animais.listarMovimentacoes(id);
    const retorno = movs.find((m) => m.id === movimentacaoRetornoId && m.tipo === 'entrada');
    if (!retorno) throw operacaoInvalida('O retorno não foi encontrado.');
    const anteriores = movs.filter((m) => m.tipo === 'saida' && m.data <= retorno.data);
    const saida = anteriores.at(-1);
    if (!saida) throw operacaoInvalida('A saída anterior ao retorno não foi encontrada.');
    const erros: string[] = [];
    if (animal.status !== 'ativo')
      erros.push('O animal saiu de novo do rebanho depois do retorno.');
    if (movs.at(-1)?.id !== retorno.id)
      erros.push('Há movimentação do animal depois do retorno (troca de lote ou nova saída).');
    const ultimaPesagem = this.ctx.pesagens.ultimaData(id);
    if (ultimaPesagem && diasEntre(saida.data, ultimaPesagem) > 0)
      erros.push(`Há pesagem em ${dataBr(ultimaPesagem)}, depois da saída original.`);
    const consumos = this.ctx.estoque.consumosDoAnimalApos(id, saida.data);
    if (consumos.total > 0)
      erros.push(
        descreverConsumosConflitantes(
          consumos,
          'O animal tem consumo de estoque registrado depois da saída original',
        ),
      );
    const lancamentos = this.ctx.financeiro.lancamentosDoAnimalApos(id, saida.data);
    if (lancamentos.total > 0)
      erros.push(
        descreverLancamentosConflitantes(
          lancamentos,
          'O animal tem lançamento financeiro com competência depois da saída original',
        ),
      );
    const sanitarios = this.ctx.sanidade
      .listarEventosDoAnimal(id)
      .filter((e) => diasEntre(saida.data, e.data) > 0);
    if (sanitarios.length > 0)
      erros.push(`Há ${sanitarios.length} registro(s) sanitário(s) depois da saída original.`);
    if (erros.length)
      throw operacaoInvalida(
        'A devolução não pode ser desfeita porque há fatos do animal depois dela.',
        erros,
      );
    return this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      this.ctx.animais.cancelarMovimentacao(retorno.id, agora);
      this.ctx.animais.registrarSaida(id, 'vendido', saida.data, saida.motivo, agora);
      this.ctx.registrarHistorico(
        'animal',
        id,
        'reversao_retorno',
        { status: 'ativo', dataRetorno: retorno.data, lote: animal.lote?.nome ?? null },
        { status: 'vendido', dataSaida: saida.data },
        motivo,
      );
      return this.obter(id);
    });
  }

  /**
   * Exclusão lógica, para cadastros feitos por engano. O registro e seu
   * histórico continuam no banco; a identificação fica livre para reuso.
   */
  excluir(id: string, motivo: string): null {
    const animal = this.obter(id);
    if (this.ctx.negociacao.temItemDoAnimal(id) || this.ctx.negociacao.animalTemCustoAnterior(id))
      throw operacaoInvalida(
        'O animal tem compra, venda ou custo anterior registrado. Cancele a negociação pelo módulo Financeiro; o cadastro e o histórico são preservados.',
      );
    if (this.ctx.estoque.temDestinoAnimal(id))
      throw operacaoInvalida(
        'O animal possui consumo de estoque registrado. Preserve o cadastro e seu histórico.',
      );
    if (this.ctx.financeiro.temLancamentoDoAnimal(id))
      throw operacaoInvalida(
        'O animal possui lançamento financeiro vinculado. Preserve o cadastro e seu histórico.',
      );
    this.ctx.transacao(() => {
      this.ctx.animais.excluirLogico(id, this.ctx.agora());
      this.ctx.registrarHistorico('animal', id, 'exclusao', retratoAnimal(animal), null, motivo);
    });
    return null;
  }

  // -------------------------------------------------------------------------
  // Linha do tempo
  // -------------------------------------------------------------------------

  historico(id: string): HistoricoAnimal {
    this.obter(id);
    const eventos: EventoHistoricoAnimal[] = [];
    const registrosMovimentacao = this.ctx.animais.listarMovimentacoes(id);
    for (const movimentacao of registrosMovimentacao) {
      eventos.push({
        tipo: 'movimentacao',
        data: movimentacao.data,
        registradoEm: '',
        movimentacao,
      });
    }
    for (const pesagem of this.ctx.pesagens.listar(id)) {
      eventos.push({
        tipo: 'pesagem',
        data: pesagem.data,
        registradoEm: pesagem.criadoEm,
        pesagem,
      });
    }

    for (const base of this.ctx.sanidade.listarEventosDoAnimal(id)) {
      eventos.push({
        tipo: 'sanidade',
        data: base.data,
        registradoEm: base.registradoEm,
        evento: paraEventoAnimal(base),
      });
    }

    const pesagensTodas = this.ctx.pesagens.listarInclusiveExcluidas(id);
    const dataDaPesagem = new Map(pesagensTodas.map((p) => [p.id, p.data]));
    const alteracoes = [
      ...this.ctx.historico.listar('animal', [id]).filter((h) => h.acao === 'alteracao'),
      ...this.ctx.historico
        .listar(
          'pesagem',
          pesagensTodas.map((p) => p.id),
        )
        .filter((h) => h.acao === 'alteracao' || h.acao === 'exclusao' || h.acao === 'conferencia'),
      ...this.ctx.historico
        .listar('manejo_sanitario', this.ctx.sanidade.manejosDoAnimal(id))
        .filter(
          (h) =>
            h.acao === 'alteracao' ||
            h.acao === 'exclusao' ||
            (h.acao === 'remocao_animal' && h.dadosAnteriores?.['animalId'] === id),
        ),
    ];
    for (const h of alteracoes) {
      const dataReferencia =
        h.entidade === 'pesagem'
          ? String(
              h.dadosAnteriores?.['data'] ??
                h.dadosNovos?.['data'] ??
                dataDaPesagem.get(h.entidadeId) ??
                '',
            ) || null
          : h.entidade === 'manejo_sanitario'
            ? String(h.dadosAnteriores?.['data'] ?? '') || null
            : null;
      const { animalId: _animalId, ...anteriores } = h.dadosAnteriores ?? {};
      eventos.push({
        tipo: 'alteracao',
        data: dataLocalIso(new Date(h.ocorridoEm)),
        registradoEm: h.ocorridoEm,
        acao: h.acao,
        entidade: h.entidade as 'animal' | 'pesagem' | 'manejo_sanitario',
        campos:
          h.acao === 'remocao_animal'
            ? []
            : camposAlterados(h.dadosAnteriores ? anteriores : null, h.dadosNovos),
        dataReferencia,
        motivo: h.motivo,
      });
    }
    eventos.sort(
      (a, b) => b.data.localeCompare(a.data) || b.registradoEm.localeCompare(a.registradoEm),
    );
    return { eventos };
  }
}

export function camposAlterados(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
): CampoAlterado[] {
  const chaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
  const campos: CampoAlterado[] = [];
  for (const campo of chaves) {
    const a = antes?.[campo] ?? null;
    const d = depois?.[campo] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(d)) campos.push({ campo, antes: a, depois: d });
  }
  return campos;
}
