import type {
  AlertasPesagem,
  AlertaPesagemItem,
  DadosPesagemValidados,
  EvolucaoLote,
  ItemResultadoPesagemLote,
  Pesagem,
  PesagemLoteValidada,
  PesagensDoAnimal,
  ResultadoPesagemLote,
} from '@pecuaria/shared-types';
import {
  alertaConferido,
  analisarEvolucaoGrupo,
  analisarGmd,
  detectarAlertasPesagem,
  diasEntre,
  pesagensDoAlerta,
  pesagensNoLote,
  reconstruirPermanencias,
  type AlertaPesagem,
  type MembroDoLote,
  type ParametrosAlertasPesagem,
} from '@pecuaria/domain';
import type { AnimalBasico, Conferencia, GravacaoPesagem } from '@pecuaria/database';
import {
  dataBr,
  duplicado,
  houveMudanca,
  invalido,
  naoEncontrado,
  type ContextoRebanho,
} from './contexto';

function retratoPesagem(p: Pesagem): Record<string, unknown> {
  return {
    data: p.data,
    pesoVivoKg: p.pesoVivoKg,
    metodo: p.metodo,
    observacao: p.observacao,
    escoreCorporal: p.escoreCorporal,
    escalaEcc: p.escalaEcc,
  };
}

/** Alertas que envolvem a pesagem indicada (como final, inicial ou suspeita de pico). */
function alertasQueEnvolvem(alertas: readonly AlertaPesagem[], pesagemId: string): AlertaPesagem[] {
  return alertas.filter((a) => pesagensDoAlerta(a).includes(pesagemId));
}

/**
 * Pesagens reais (peso vivo em kg), GMD observado, alertas de conferência e
 * evolução de lotes. Nenhuma projeção nutricional entra aqui
 * (MODELOS_NUTRICIONAIS.md, seção 7.4).
 */
export class ServicoPesagens {
  constructor(private readonly ctx: ContextoRebanho) {}

  private animal(animalId: string) {
    const animal = this.ctx.animais.obter(animalId);
    if (!animal) throw naoEncontrado('Animal não encontrado.');
    return animal;
  }

  private obter(id: string): Pesagem {
    const pesagem = this.ctx.pesagens.obter(id);
    if (!pesagem) throw naoEncontrado('Pesagem não encontrada.');
    return pesagem;
  }

  private conferencia(justificativa: string | null | undefined): Conferencia | null {
    return justificativa ? { justificativa, em: this.ctx.agora() } : null;
  }

  listar(animalId: string): PesagensDoAnimal {
    this.animal(animalId);
    const pesagens = this.ctx.pesagens.listar(animalId);
    const parametrosAlertas = this.ctx.parametrosAlertas();
    return {
      pesagens,
      gmd: analisarGmd(pesagens),
      alertas: detectarAlertasPesagem(pesagens, parametrosAlertas),
      parametrosAlertas,
    };
  }

  /** Datas impossíveis são recusadas (não são só avisos). */
  private errosDeData(
    animal: { id: string; dataEntrada: string; dataSaida: string | null },
    data: string,
  ) {
    const erros: string[] = [];
    const fora = this.ctx.animais.ausenciaNaData(animal.id, data);
    if (fora)
      erros.push(
        `O animal esteve fora do rebanho entre ${dataBr(fora.de)} e o retorno em ${dataBr(fora.ate)}: não há pesagem nesse período.`,
      );
    if (diasEntre(this.ctx.hoje(), data) > 0)
      erros.push('A data da pesagem não pode ser no futuro.');
    if (diasEntre(animal.dataEntrada, data) < 0) {
      erros.push(
        `A data da pesagem não pode ser anterior à entrada do animal (${dataBr(animal.dataEntrada)}).`,
      );
    }
    if (animal.dataSaida && diasEntre(animal.dataSaida, data) > 0) {
      erros.push(
        `A data da pesagem não pode ser posterior à saída do animal (${dataBr(animal.dataSaida)}).`,
      );
    }
    return erros;
  }

  private validar(animalId: string, dados: DadosPesagemValidados, excetoId: string | null): void {
    const erros = this.errosDeData(this.animal(animalId), dados.data);
    if (erros.length) throw invalido(erros);
    if (this.ctx.pesagens.dataEmUso(animalId, dados.data, excetoId)) {
      throw duplicado(`Já existe uma pesagem deste animal em ${dataBr(dados.data)}.`);
    }
  }

  registrar(
    animalId: string,
    dados: DadosPesagemValidados,
    justificativa: string | null = null,
  ): Pesagem {
    this.validar(animalId, dados, null);
    const id = this.ctx.gerarId();
    return this.ctx.transacao(() => {
      this.ctx.pesagens.inserir(
        id,
        animalId,
        dados,
        this.ctx.agora(),
        this.conferencia(justificativa),
      );
      const criada = this.obter(id);
      this.ctx.registrarHistorico('pesagem', id, 'criacao', null, retratoPesagem(criada));
      if (justificativa) {
        this.ctx.registrarHistorico('pesagem', id, 'conferencia', null, { justificativa });
      }
      return criada;
    });
  }

  /**
   * Correção de uma pesagem anterior. Exige motivo; o estado anterior e o novo
   * ficam na trilha. A conferência anterior deixa de valer, porque o valor mudou.
   */
  atualizar(
    id: string,
    dados: DadosPesagemValidados,
    motivo: string,
    justificativa: string | null = null,
  ): Pesagem {
    const atual = this.obter(id);
    this.validar(atual.animalId, dados, id);
    return this.ctx.transacao(() => {
      this.ctx.pesagens.atualizar(id, dados, this.ctx.agora(), this.conferencia(justificativa));
      const nova = this.obter(id);
      if (houveMudanca(retratoPesagem(atual), retratoPesagem(nova))) {
        this.ctx.registrarHistorico(
          'pesagem',
          id,
          'alteracao',
          retratoPesagem(atual),
          retratoPesagem(nova),
          motivo,
        );
      }
      if (justificativa) {
        this.ctx.registrarHistorico('pesagem', id, 'conferencia', null, { justificativa });
      }
      return nova;
    });
  }

  /** O usuário conferiu o alerta e confirma que o valor está certo. */
  conferir(id: string, justificativa: string): Pesagem {
    const atual = this.obter(id);
    return this.ctx.transacao(() => {
      this.ctx.pesagens.conferir(id, { justificativa, em: this.ctx.agora() }, this.ctx.agora());
      this.ctx.registrarHistorico(
        'pesagem',
        id,
        'conferencia',
        atual.justificativaConferencia ? { justificativa: atual.justificativaConferencia } : null,
        { justificativa },
      );
      return this.obter(id);
    });
  }

  excluir(id: string, motivo: string): null {
    const atual = this.obter(id);
    this.ctx.transacao(() => {
      this.ctx.pesagens.excluirLogico(id, this.ctx.agora());
      this.ctx.registrarHistorico('pesagem', id, 'exclusao', retratoPesagem(atual), null, motivo);
    });
    return null;
  }

  // -------------------------------------------------------------------------
  // Pesagem em lote
  // -------------------------------------------------------------------------

  /**
   * Pesagem de vários animais de uma vez. Sem `confirmar`, só devolve a prévia
   * com erros e alertas por animal. Com `confirmar`, grava tudo numa transação
   * ou nada, se algum animal tiver erro. Alertas não impedem a gravação.
   */
  registrarLote(
    propriedadeId: string,
    lote: PesagemLoteValidada,
    confirmar: boolean,
  ): ResultadoPesagemLote {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const ids = lote.itens.map((i) => i.animalId);
    const animais = new Map(
      this.ctx.animais
        .listarBasicos({ propriedadeId, ids: [...new Set(ids)] })
        .map((a) => [a.id, a]),
    );
    const pesagensExistentes = this.ctx.pesagens.listarDeAnimais([...animais.keys()]);
    const parametros = this.ctx.parametrosAlertas();
    const vistos = new Set<string>();

    const preparados = lote.itens.map((item) => {
      const data = item.data ?? lote.data;
      const animal = animais.get(item.animalId);
      const novoId = this.ctx.gerarId();
      const erros: string[] = [];
      let alertas: AlertaPesagem[] = [];
      let anterior: ItemResultadoPesagemLote['anterior'] = null;
      if (!animal) {
        erros.push('Animal não encontrado nesta propriedade.');
      } else {
        if (vistos.has(animal.id)) erros.push('Animal repetido nesta pesagem.');
        vistos.add(animal.id);
        if (animal.status !== 'ativo') erros.push('O animal não está ativo no rebanho.');
        erros.push(...this.errosDeData(animal, data));
        const existentes = pesagensExistentes.get(animal.id) ?? [];
        if (existentes.some((p) => p.data === data)) {
          erros.push(`Já existe uma pesagem deste animal em ${dataBr(data)}.`);
        }
        const antes = existentes.filter((p) => p.data < data).at(-1);
        anterior = antes
          ? { data: antes.data, pesoVivoKg: antes.pesoVivoKg, metodo: antes.metodo }
          : null;
        if (erros.length === 0) {
          const comNova = [
            ...existentes,
            { id: novoId, data, pesoVivoKg: item.pesoVivoKg, metodo: lote.metodo },
          ];
          alertas = alertasQueEnvolvem(detectarAlertasPesagem(comNova, parametros), novoId);
        }
      }
      return { item, animal, data, novoId, erros, alertas, anterior };
    });

    const itens: ItemResultadoPesagemLote[] = preparados.map((p) => ({
      animalId: p.item.animalId,
      identificacao: p.animal?.identificacao ?? '—',
      data: p.data,
      pesoVivoKg: p.item.pesoVivoKg,
      erros: p.erros,
      alertas: p.alertas,
      anterior: p.anterior,
    }));
    const comErro = itens.filter((i) => i.erros.length > 0).length;
    const comAlerta = itens.filter((i) => i.alertas.length > 0).length;
    if (!confirmar || comErro > 0) {
      return { confirmado: false, itens, comErro, comAlerta, gravadas: 0 };
    }

    this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      for (const p of preparados) {
        const dados: GravacaoPesagem = {
          data: p.data,
          pesoVivoKg: p.item.pesoVivoKg,
          metodo: lote.metodo,
          observacao: p.item.observacao,
          escoreCorporal: p.item.escoreCorporal,
          escalaEcc: lote.escalaEcc,
        };
        const conferencia = p.item.justificativa
          ? { justificativa: p.item.justificativa, em: agora }
          : null;
        this.ctx.pesagens.inserir(p.novoId, p.item.animalId, dados, agora, conferencia);
        this.ctx.registrarHistorico(
          'pesagem',
          p.novoId,
          'criacao',
          null,
          retratoPesagem(this.obter(p.novoId)),
          'Pesagem em lote',
        );
        if (conferencia) {
          this.ctx.registrarHistorico('pesagem', p.novoId, 'conferencia', null, {
            justificativa: conferencia.justificativa,
          });
        }
      }
    });
    return { confirmado: true, itens, comErro: 0, comAlerta, gravadas: preparados.length };
  }

  // -------------------------------------------------------------------------
  // Alertas da propriedade
  // -------------------------------------------------------------------------

  private alertasDosAnimais(
    animais: readonly AnimalBasico[],
    parametros: ParametrosAlertasPesagem,
  ): AlertaPesagemItem[] {
    const pesagens = this.ctx.pesagens.listarDeAnimais(animais.map((a) => a.id));
    const itens: AlertaPesagemItem[] = [];
    for (const animal of animais) {
      const lista = pesagens.get(animal.id) ?? [];
      const porId = new Map(lista.map((p) => [p.id, p]));
      for (const alerta of detectarAlertasPesagem(lista, parametros)) {
        const pesagem = porId.get(alerta.pesagemId);
        if (!pesagem) continue;
        itens.push({
          alerta,
          animal: {
            id: animal.id,
            identificacao: animal.identificacao,
            nome: animal.nome,
            lote: animal.lote,
          },
          pesagem,
          conferida: alertaConferido(alerta, porId),
        });
      }
    }
    return itens;
  }

  /** Alertas dos animais ativos, do mais recente ao mais antigo. */
  alertas(propriedadeId: string, incluirConferidas: boolean): AlertasPesagem {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    const parametros = this.ctx.parametrosAlertas();
    const animais = this.ctx.animais.listarBasicos({ propriedadeId, somenteAtivos: true });
    const itens = this.alertasDosAnimais(animais, parametros)
      .filter((i) => incluirConferidas || !i.conferida)
      .sort(
        (a, b) =>
          b.alerta.intervalo.dataFinal.localeCompare(a.alerta.intervalo.dataFinal) ||
          a.animal.identificacao.localeCompare(b.animal.identificacao),
      );
    return { itens, parametros };
  }

  contarAlertasPendentes(propriedadeId: string): number {
    const animais = this.ctx.animais.listarBasicos({ propriedadeId, somenteAtivos: true });
    return this.alertasDosAnimais(animais, this.ctx.parametrosAlertas()).filter((i) => !i.conferida)
      .length;
  }

  // -------------------------------------------------------------------------
  // Evolução do lote
  // -------------------------------------------------------------------------

  /**
   * Evolução histórica do lote: todos os animais que passaram por ele, cada um
   * só nas datas em que pertencia ao lote, conforme o histórico de movimentações.
   */
  evolucaoLote(loteId: string): EvolucaoLote {
    const lote = this.ctx.lotes.obter(loteId);
    if (!lote) throw naoEncontrado('Lote não encontrado.');
    const animais = this.ctx.animais.listarBasicos({
      propriedadeId: lote.propriedadeId,
      passaramPeloLoteId: loteId,
    });
    const ids = animais.map((a) => a.id);
    const pesagens = this.ctx.pesagens.listarDeAnimais(ids);
    const movimentacoes = this.ctx.animais.listarMovimentacoesDeAnimais(ids);

    const membros: (MembroDoLote & { animal: AnimalBasico })[] = [];
    const semReconstrucao: EvolucaoLote['semReconstrucao'] = [];
    for (const a of animais) {
      const r = reconstruirPermanencias(movimentacoes.get(a.id) ?? [], loteId, a.lote?.id ?? null);
      if (r.situacao === 'inconsistente') {
        semReconstrucao.push({
          id: a.id,
          identificacao: a.identificacao,
          nome: a.nome,
          motivo: r.motivo,
        });
        continue;
      }
      if (r.permanencias.length === 0) continue;
      membros.push({
        animal: a,
        animalId: a.id,
        permanencias: r.permanencias,
        pesagens: pesagens.get(a.id) ?? [],
      });
    }

    return {
      loteId,
      animais: membros.map((m) => {
        const separadas = pesagensNoLote(m);
        return {
          id: m.animal.id,
          identificacao: m.animal.identificacao,
          nome: m.animal.nome,
          status: m.animal.status,
          noLoteAgora: m.animal.lote?.id === loteId,
          permanencias: [...m.permanencias],
          trechos: separadas.trechos.map((t) =>
            t.map((p) => ({ data: p.data, pesoVivoKg: p.pesoVivoKg, metodo: p.metodo })),
          ),
          pesagensForaDoLote: separadas.foraDoLote,
        };
      }),
      semReconstrucao,
      analise: analisarEvolucaoGrupo(membros),
    };
  }
}
