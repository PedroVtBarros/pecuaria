import type {
  Area,
  DadosAreaValidados as DadosArea,
  DadosPropriedadeValidados as DadosPropriedade,
  DadosRacaValidados as DadosRaca,
  Propriedade,
  Raca,
} from '@pecuaria/shared-types';
import { normalizarNome } from '@pecuaria/domain';
import {
  duplicado,
  houveMudanca,
  naoEncontrado,
  operacaoInvalida,
  type ContextoRebanho,
} from './contexto';

function retratoPropriedade(p: Propriedade): Record<string, unknown> {
  return {
    nome: p.nome,
    municipio: p.municipio,
    uf: p.uf,
    areaTotalHa: p.areaTotalHa,
    tipoExploracao: p.tipoExploracao,
    observacoes: p.observacoes,
  };
}

function retratoArea(a: Area): Record<string, unknown> {
  return { nome: a.nome, tipo: a.tipo, areaHa: a.areaHa, observacoes: a.observacoes };
}

function retratoRaca(r: Raca): Record<string, unknown> {
  return { nome: r.nome, aptidao: r.aptidao, grupoGenetico: r.grupoGenetico };
}

/** Propriedades e suas áreas (piquetes, currais, baias). */
export class ServicoPropriedades {
  constructor(private readonly ctx: ContextoRebanho) {}

  listar(): Propriedade[] {
    return this.ctx.propriedades.listar();
  }

  obter(id: string): Propriedade {
    const propriedade = this.ctx.propriedades.obter(id);
    if (!propriedade) throw naoEncontrado('Propriedade não encontrada.');
    return propriedade;
  }

  criar(dados: DadosPropriedade): Propriedade {
    const nomeNormalizado = normalizarNome(dados.nome);
    if (this.ctx.propriedades.nomeEmUso(nomeNormalizado, null)) {
      throw duplicado(`Já existe uma propriedade chamada "${dados.nome}".`);
    }
    const id = this.ctx.gerarId();
    return this.ctx.transacao(() => {
      this.ctx.propriedades.inserir(id, { ...dados, nomeNormalizado }, this.ctx.agora());
      const criada = this.obter(id);
      this.ctx.registrarHistorico('propriedade', id, 'criacao', null, retratoPropriedade(criada));
      return criada;
    });
  }

  atualizar(id: string, dados: DadosPropriedade): Propriedade {
    const atual = this.obter(id);
    const nomeNormalizado = normalizarNome(dados.nome);
    if (this.ctx.propriedades.nomeEmUso(nomeNormalizado, id)) {
      throw duplicado(`Já existe uma propriedade chamada "${dados.nome}".`);
    }
    return this.ctx.transacao(() => {
      this.ctx.propriedades.atualizar(id, { ...dados, nomeNormalizado }, this.ctx.agora());
      const nova = this.obter(id);
      const antes = retratoPropriedade(atual);
      const depois = retratoPropriedade(nova);
      if (houveMudanca(antes, depois)) {
        this.ctx.registrarHistorico('propriedade', id, 'alteracao', antes, depois);
      }
      return nova;
    });
  }

  excluir(id: string): null {
    const atual = this.obter(id);
    if (this.ctx.estoque.temEstoqueNaPropriedade(id))
      throw operacaoInvalida('A propriedade tem itens de estoque e não pode ser excluída.');
    if (this.ctx.financeiro.temLancamentoNaPropriedade(id))
      throw operacaoInvalida('A propriedade tem lançamentos financeiros e não pode ser excluída.');
    const vinculos = this.ctx.propriedades.contarVinculos(id);
    if (vinculos.animais + vinculos.lotes + vinculos.areas > 0) {
      throw operacaoInvalida(
        'A propriedade tem animais, lotes ou áreas cadastrados e não pode ser excluída.',
        [`Animais: ${vinculos.animais}`, `Lotes: ${vinculos.lotes}`, `Áreas: ${vinculos.areas}`],
      );
    }
    this.ctx.transacao(() => {
      this.ctx.propriedades.excluirLogico(id, this.ctx.agora());
      this.ctx.registrarHistorico('propriedade', id, 'exclusao', retratoPropriedade(atual), null);
    });
    return null;
  }

  // -------------------------------------------------------------------------
  // Áreas
  // -------------------------------------------------------------------------

  listarAreas(propriedadeId: string): Area[] {
    this.obter(propriedadeId);
    return this.ctx.propriedades.listarAreas(propriedadeId);
  }

  obterArea(id: string): Area {
    const area = this.ctx.propriedades.obterArea(id);
    if (!area) throw naoEncontrado('Área não encontrada.');
    return area;
  }

  criarArea(propriedadeId: string, dados: DadosArea): Area {
    this.obter(propriedadeId);
    const nomeNormalizado = normalizarNome(dados.nome);
    if (this.ctx.propriedades.nomeDeAreaEmUso(propriedadeId, nomeNormalizado, null)) {
      throw duplicado(`Já existe uma área chamada "${dados.nome}" nesta propriedade.`);
    }
    const id = this.ctx.gerarId();
    return this.ctx.transacao(() => {
      this.ctx.propriedades.inserirArea(
        id,
        propriedadeId,
        { ...dados, nomeNormalizado },
        this.ctx.agora(),
      );
      const criada = this.obterArea(id);
      this.ctx.registrarHistorico('area', id, 'criacao', null, retratoArea(criada));
      return criada;
    });
  }

  atualizarArea(id: string, dados: DadosArea): Area {
    const atual = this.obterArea(id);
    const nomeNormalizado = normalizarNome(dados.nome);
    if (this.ctx.propriedades.nomeDeAreaEmUso(atual.propriedadeId, nomeNormalizado, id)) {
      throw duplicado(`Já existe uma área chamada "${dados.nome}" nesta propriedade.`);
    }
    return this.ctx.transacao(() => {
      this.ctx.propriedades.atualizarArea(id, { ...dados, nomeNormalizado }, this.ctx.agora());
      const nova = this.obterArea(id);
      if (houveMudanca(retratoArea(atual), retratoArea(nova))) {
        this.ctx.registrarHistorico('area', id, 'alteracao', retratoArea(atual), retratoArea(nova));
      }
      return nova;
    });
  }

  excluirArea(id: string): null {
    const atual = this.obterArea(id);
    if (atual.lotesAtivos > 0) {
      throw operacaoInvalida(
        `A área tem ${atual.lotesAtivos} lote(s) ativo(s). Mova os lotes antes de excluir a área.`,
      );
    }
    this.ctx.transacao(() => {
      this.ctx.propriedades.excluirAreaLogico(id, this.ctx.agora());
      this.ctx.registrarHistorico('area', id, 'exclusao', retratoArea(atual), null);
    });
    return null;
  }
}

/** Catálogo de raças, editável pelo usuário. */
export class ServicoRacas {
  constructor(private readonly ctx: ContextoRebanho) {}

  listar(): Raca[] {
    return this.ctx.racas.listar();
  }

  obter(id: string): Raca {
    const raca = this.ctx.racas.obter(id);
    if (!raca) throw naoEncontrado('Raça não encontrada.');
    return raca;
  }

  criar(dados: DadosRaca): Raca {
    const nomeNormalizado = normalizarNome(dados.nome);
    if (this.ctx.racas.nomeEmUso(nomeNormalizado, null)) {
      throw duplicado(`A raça "${dados.nome}" já está cadastrada.`);
    }
    const id = this.ctx.gerarId();
    return this.ctx.transacao(() => {
      this.ctx.racas.inserir(id, { ...dados, nomeNormalizado }, this.ctx.agora());
      const criada = this.obter(id);
      this.ctx.registrarHistorico('raca', id, 'criacao', null, retratoRaca(criada));
      return criada;
    });
  }

  atualizar(id: string, dados: DadosRaca): Raca {
    const atual = this.obter(id);
    const nomeNormalizado = normalizarNome(dados.nome);
    if (this.ctx.racas.nomeEmUso(nomeNormalizado, id)) {
      throw duplicado(`A raça "${dados.nome}" já está cadastrada.`);
    }
    return this.ctx.transacao(() => {
      this.ctx.racas.atualizar(id, { ...dados, nomeNormalizado }, this.ctx.agora());
      const nova = this.obter(id);
      if (houveMudanca(retratoRaca(atual), retratoRaca(nova))) {
        this.ctx.registrarHistorico('raca', id, 'alteracao', retratoRaca(atual), retratoRaca(nova));
      }
      return nova;
    });
  }

  excluir(id: string): null {
    const atual = this.obter(id);
    if (atual.animaisVinculados > 0) {
      throw operacaoInvalida(
        `A raça está em uso por ${atual.animaisVinculados} animal(is) e não pode ser excluída.`,
      );
    }
    this.ctx.transacao(() => {
      this.ctx.racas.excluirLogico(id, this.ctx.agora());
      this.ctx.registrarHistorico('raca', id, 'exclusao', retratoRaca(atual), null);
    });
    return null;
  }
}
