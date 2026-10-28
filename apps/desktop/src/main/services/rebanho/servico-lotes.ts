import type {
  DadosLoteValidados,
  EdicaoLoteValidada,
  Lote,
  LoteDetalhe,
} from '@pecuaria/shared-types';
import { diasEntre, normalizarNome } from '@pecuaria/domain';
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

function retratoLote(l: Lote): Record<string, unknown> {
  return {
    nome: l.nome,
    finalidade: l.finalidade,
    dataFormacao: l.dataFormacao,
    area: l.area?.nome ?? null,
    observacoes: l.observacoes,
  };
}

/** Lotes (grupos de manejo) e seus locais ao longo do tempo. */
export class ServicoLotes {
  constructor(private readonly ctx: ContextoRebanho) {}

  listar(propriedadeId: string, incluirEncerrados = false): Lote[] {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    return this.ctx.lotes.listar(propriedadeId, incluirEncerrados);
  }

  obter(id: string): Lote {
    const lote = this.ctx.lotes.obter(id);
    if (!lote) throw naoEncontrado('Lote não encontrado.');
    return lote;
  }

  obterDetalhe(id: string): LoteDetalhe {
    return { ...this.obter(id), movimentacoesArea: this.ctx.lotes.listarMudancasDeArea(id) };
  }

  private validarArea(areaId: string | null, propriedadeId: string): void {
    if (!areaId) return;
    const area = this.ctx.propriedades.obterArea(areaId);
    if (!area) throw naoEncontrado('Área não encontrada.');
    if (area.propriedadeId !== propriedadeId) {
      throw operacaoInvalida('A área escolhida pertence a outra propriedade.');
    }
  }

  criar(propriedadeId: string, dados: DadosLoteValidados): Lote {
    if (!this.ctx.propriedades.obter(propriedadeId))
      throw naoEncontrado('Propriedade não encontrada.');
    if (diasEntre(this.ctx.hoje(), dados.dataFormacao) > 0) {
      throw invalido(['A data de formação não pode ser no futuro.']);
    }
    this.validarArea(dados.areaId, propriedadeId);
    const nomeNormalizado = normalizarNome(dados.nome);
    if (this.ctx.lotes.nomeEmUso(propriedadeId, nomeNormalizado, null)) {
      throw duplicado(`Já existe um lote ativo chamado "${dados.nome}" nesta propriedade.`);
    }
    const id = this.ctx.gerarId();
    return this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      this.ctx.lotes.inserir(id, propriedadeId, dados.areaId, { ...dados, nomeNormalizado }, agora);
      if (dados.areaId) {
        this.ctx.lotes.registrarMudancaDeArea(
          this.ctx.gerarId(),
          id,
          dados.dataFormacao,
          null,
          dados.areaId,
          'Local na formação do lote',
          agora,
        );
      }
      const criado = this.obter(id);
      this.ctx.registrarHistorico('lote', id, 'criacao', null, retratoLote(criado));
      return criado;
    });
  }

  atualizar(id: string, dados: EdicaoLoteValidada): Lote {
    const atual = this.obter(id);
    if (diasEntre(this.ctx.hoje(), dados.dataFormacao) > 0) {
      throw invalido(['A data de formação não pode ser no futuro.']);
    }
    if (dados.dataFormacao !== atual.dataFormacao) {
      const consumos = this.ctx.estoque.consumosDoLoteAnimalAntes(id, dados.dataFormacao);
      if (consumos.total > 0) {
        throw invalido([
          descreverConsumosConflitantes(
            consumos,
            'O lote tem consumo de estoque registrado antes da nova data de formação',
          ),
        ]);
      }
      const lancamentos = this.ctx.financeiro.lancamentosDoLoteAntes(id, dados.dataFormacao);
      if (lancamentos.total > 0) {
        throw invalido([
          descreverLancamentosConflitantes(
            lancamentos,
            'O lote tem lançamento financeiro com competência antes da nova data de formação',
          ),
        ]);
      }
    }
    const nomeNormalizado = normalizarNome(dados.nome);
    if (atual.ativo && this.ctx.lotes.nomeEmUso(atual.propriedadeId, nomeNormalizado, id)) {
      throw duplicado(`Já existe um lote ativo chamado "${dados.nome}" nesta propriedade.`);
    }
    return this.ctx.transacao(() => {
      this.ctx.lotes.atualizar(id, { ...dados, nomeNormalizado }, this.ctx.agora());
      const novo = this.obter(id);
      if (houveMudanca(retratoLote(atual), retratoLote(novo))) {
        this.ctx.registrarHistorico('lote', id, 'alteracao', retratoLote(atual), retratoLote(novo));
      }
      return novo;
    });
  }

  moverArea(id: string, areaId: string | null, data: string, observacao: string | null): Lote {
    const atual = this.obter(id);
    if (!atual.ativo) throw operacaoInvalida('O lote está encerrado.');
    this.validarArea(areaId, atual.propriedadeId);
    if ((atual.area?.id ?? null) === areaId) {
      throw operacaoInvalida('O lote já está nesse local.');
    }
    const erros: string[] = [];
    if (diasEntre(this.ctx.hoje(), data) > 0) erros.push('A data não pode ser no futuro.');
    if (diasEntre(atual.dataFormacao, data) < 0) {
      erros.push(
        `A data não pode ser anterior à formação do lote (${dataBr(atual.dataFormacao)}).`,
      );
    }
    const ultima = this.ctx.lotes.ultimaMudancaDeArea(id);
    if (ultima && diasEntre(ultima, data) < 0) {
      erros.push(`A data não pode ser anterior à última mudança de local (${dataBr(ultima)}).`);
    }
    if (erros.length) throw invalido(erros);

    return this.ctx.transacao(() => {
      const agora = this.ctx.agora();
      this.ctx.lotes.registrarMudancaDeArea(
        this.ctx.gerarId(),
        id,
        data,
        atual.area?.id ?? null,
        areaId,
        observacao,
        agora,
      );
      this.ctx.lotes.definirArea(id, areaId, agora);
      const novo = this.obter(id);
      this.ctx.registrarHistorico(
        'lote',
        id,
        'mudanca_area',
        { area: atual.area?.nome ?? null },
        { area: novo.area?.nome ?? null, data },
        observacao,
      );
      return novo;
    });
  }

  encerrar(id: string, data: string): Lote {
    const atual = this.obter(id);
    if (!atual.ativo) throw operacaoInvalida('O lote já está encerrado.');
    if (atual.animaisAtivos > 0) {
      throw operacaoInvalida(
        `O lote ainda tem ${atual.animaisAtivos} animal(is) ativo(s). Transfira-os antes de encerrar.`,
      );
    }
    const erros: string[] = [];
    if (diasEntre(this.ctx.hoje(), data) > 0)
      erros.push('A data de encerramento não pode ser no futuro.');
    if (diasEntre(atual.dataFormacao, data) < 0) {
      erros.push('A data de encerramento não pode ser anterior à formação do lote.');
    }
    const consumos = this.ctx.estoque.consumosDoLoteAnimalApos(id, data);
    if (consumos.total > 0) {
      erros.push(
        descreverConsumosConflitantes(
          consumos,
          'O lote tem consumo de estoque registrado depois da data de encerramento informada',
        ),
      );
    }
    const lancamentos = this.ctx.financeiro.lancamentosDoLoteApos(id, data);
    if (lancamentos.total > 0) {
      erros.push(
        descreverLancamentosConflitantes(
          lancamentos,
          'O lote tem lançamento financeiro com competência depois da data de encerramento informada',
        ),
      );
    }
    if (erros.length) throw invalido(erros);
    return this.ctx.transacao(() => {
      this.ctx.lotes.encerrar(id, data, this.ctx.agora());
      this.ctx.registrarHistorico(
        'lote',
        id,
        'encerramento',
        { ativo: true },
        { ativo: false, data },
      );
      return this.obter(id);
    });
  }

  reabrir(id: string): Lote {
    const atual = this.obter(id);
    if (atual.ativo) throw operacaoInvalida('O lote já está ativo.');
    if (this.ctx.lotes.nomeEmUso(atual.propriedadeId, normalizarNome(atual.nome), id)) {
      throw duplicado(
        `Já existe outro lote ativo chamado "${atual.nome}". Renomeie um deles antes.`,
      );
    }
    return this.ctx.transacao(() => {
      this.ctx.lotes.reabrir(id, this.ctx.agora());
      this.ctx.registrarHistorico(
        'lote',
        id,
        'reabertura',
        { ativo: false, dataEncerramento: atual.dataEncerramento },
        { ativo: true },
      );
      return this.obter(id);
    });
  }
}
