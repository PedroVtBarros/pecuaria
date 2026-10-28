import { gerarUuidV7, normalizarNome, origemBibliografica } from '@pecuaria/domain';
import {
  ErroAplicacao,
  type AlimentoDetalhe,
  type DadosAlimentoValidados,
  type DadosFonteValidados,
  type DadosNutrienteValidados,
  type EventoHistoricoAlimentos,
  type FiltrosAlimentos,
  type FiltrosFontes,
  type Fonte,
  type FonteDetalhe,
  type Nutriente,
  type ResumoAlimento,
  type VinculoAlimentoItem,
} from '@pecuaria/shared-types';
import {
  ehErroDeUnicidade,
  RepositorioAlimentos,
  RepositorioComposicao,
  RepositorioHistorico,
  RepositorioPropriedades,
  RepositorioEstoque,
  type AcaoHistorico,
  type EntidadeHistorico,
  type GerenciadorBanco,
} from '@pecuaria/database';

export function invalido(mensagem: string): never {
  throw new ErroAplicacao('OPERACAO_INVALIDA', mensagem);
}

/** Erro levantado por gatilho (RAISE): a mensagem é em português e vai para a tela. */
export function ehErroDeGatilho(erro: unknown): erro is Error {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code: unknown }).code === 'SQLITE_CONSTRAINT_TRIGGER'
  );
}

export interface OpcoesServicoAlimentos {
  relogio?: () => Date;
  gerarId?: () => string;
}

/**
 * Base comum dos serviços do banco de alimentos: transação, trilha e conversão de erros do banco.
 * As regras ficam no domínio; o banco repete as essenciais em CHECK e gatilhos.
 */
export class BaseServicoAlimentos {
  readonly repo: RepositorioAlimentos;
  protected readonly historico: RepositorioHistorico;
  protected readonly propriedades: RepositorioPropriedades;
  protected readonly relogio: () => Date;
  protected readonly gerarId: () => string;

  constructor(
    protected readonly banco: GerenciadorBanco,
    opcoes: OpcoesServicoAlimentos = {},
  ) {
    const db = () => banco.conexao;
    this.repo = new RepositorioAlimentos(db);
    this.historico = new RepositorioHistorico(db);
    this.propriedades = new RepositorioPropriedades(db);
    this.relogio = opcoes.relogio ?? (() => new Date());
    this.gerarId = opcoes.gerarId ?? gerarUuidV7;
  }

  protected agora(): string {
    return this.relogio().toISOString();
  }

  protected transacao<T>(fn: () => T, mensagemDuplicado = 'Código ou nome já utilizado.'): T {
    try {
      return this.banco.transacao(fn);
    } catch (e) {
      if (e instanceof ErroAplicacao) throw e;
      if (ehErroDeUnicidade(e)) throw new ErroAplicacao('DUPLICADO', mensagemDuplicado);
      if (ehErroDeGatilho(e)) throw new ErroAplicacao('OPERACAO_INVALIDA', e.message);
      throw e;
    }
  }

  protected auditar(
    entidade: EntidadeHistorico,
    id: string,
    acao: AcaoHistorico,
    antes: object | null,
    depois: object | null,
    motivo: string | null = null,
  ): void {
    this.historico.registrar({
      id: this.gerarId(),
      entidade,
      entidadeId: id,
      acao,
      dadosAnteriores: antes as Record<string, unknown> | null,
      dadosNovos: depois as Record<string, unknown> | null,
      motivo,
      ocorridoEm: this.agora(),
    });
  }

  protected trilha(
    entidade: EntidadeHistorico,
    ids: readonly string[],
  ): EventoHistoricoAlimentos[] {
    return this.historico.listarEmOrdem(entidade, ids).map((h) => ({ ...h }));
  }

  protected fonte(id: string): Fonte {
    const f = this.repo.obterFonte(id);
    if (!f) throw new ErroAplicacao('NAO_ENCONTRADO', 'Fonte não encontrada.');
    return f;
  }

  protected alimento(id: string): ResumoAlimento {
    const a = this.repo.obterAlimento(id);
    if (!a) throw new ErroAplicacao('NAO_ENCONTRADO', 'Alimento não encontrado.');
    return a;
  }

  protected nutriente(id: string): Nutriente {
    const n = this.repo.obterNutriente(id);
    if (!n) throw new ErroAplicacao('NAO_ENCONTRADO', 'Definição de nutriente não encontrada.');
    return n;
  }
}

/** Fontes, definições de nutrientes e alimentos (Fase 5A-2). */
export class ServicoAlimentos extends BaseServicoAlimentos {
  // ----- Fontes -----

  listarFontes(filtros: FiltrosFontes): Fonte[] {
    if (filtros.propriedadeId && !this.propriedades.obter(filtros.propriedadeId))
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Propriedade não encontrada.');
    return this.repo.listarFontes(filtros);
  }

  obterFonte(id: string): FonteDetalhe {
    return { fonte: this.fonte(id), historico: this.trilha('fonte', [id]) };
  }

  private conferirFonte(d: DadosFonteValidados, excetoId: string | null): void {
    if (d.propriedadeId && !this.propriedades.obter(d.propriedadeId))
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Propriedade não encontrada.');
    if (d.codigo && this.repo.fontePorCodigo(d.codigo, excetoId))
      throw new ErroAplicacao('DUPLICADO', `Já existe uma fonte com o código ${d.codigo}.`);
  }

  criarFonte(d: DadosFonteValidados): Fonte {
    const id = this.gerarId();
    return this.transacao(() => {
      this.conferirFonte(d, null);
      this.repo.salvarFonte(id, d, this.agora(), true);
      const criada = this.fonte(id);
      this.auditar('fonte', id, 'criacao', null, criada);
      return criada;
    }, 'Já existe uma fonte com este código.');
  }

  atualizarFonte(id: string, d: DadosFonteValidados, motivo: string): Fonte {
    return this.transacao(() => {
      const antes = this.fonte(id);
      if (antes.excluidaEm) invalido('Fonte excluída não muda.');
      if (d.origem !== antes.origem || d.propriedadeId !== antes.propriedadeId)
        invalido('A origem e a propriedade da fonte não mudam: cadastre outra fonte.');
      this.conferirFonte(d, id);
      this.repo.salvarFonte(id, d, this.agora(), false);
      const depois = this.fonte(id);
      this.auditar('fonte', id, 'alteracao', antes, depois, motivo);
      return depois;
    }, 'Já existe uma fonte com este código.');
  }

  excluirFonte(id: string, motivo: string): Fonte {
    return this.transacao(() => {
      const antes = this.fonte(id);
      if (antes.excluidaEm) invalido('A fonte já está excluída.');
      if (antes.nRegistros > 0)
        invalido('A fonte tem registros de composição. Descarte os registros antes.');
      if (this.repo.listarNutrientes(true).some((n) => n.fundamentacaoFonte?.id === id))
        invalido('A fonte fundamenta uma definição de nutriente e não pode ser excluída.');
      this.repo.excluirFonte(id, this.agora());
      const depois = this.fonte(id);
      this.auditar('fonte', id, 'exclusao', antes, depois, motivo);
      return depois;
    });
  }

  // ----- Definições de nutrientes -----

  listarNutrientes(incluirInativos: boolean): Nutriente[] {
    return this.repo.listarNutrientes(incluirInativos);
  }

  private conferirFundamentacao(d: DadosNutrienteValidados): void {
    if (!d.fundamentacaoFonteId) return;
    const f = this.fonte(d.fundamentacaoFonteId);
    if (f.excluidaEm || !origemBibliografica(f.origem))
      invalido('A fundamentação exige uma fonte bibliográfica ativa (tabela compilada ou estudo).');
  }

  criarNutriente(d: DadosNutrienteValidados): Nutriente {
    const id = this.gerarId();
    return this.transacao(() => {
      if (this.repo.nutrientePorCodigo(d.codigo))
        throw new ErroAplicacao('DUPLICADO', `Já existe uma definição com o código ${d.codigo}.`);
      this.conferirFundamentacao(d);
      this.repo.inserirNutriente(id, d, this.agora());
      const criado = this.nutriente(id);
      this.auditar('nutriente', id, 'criacao', null, criado);
      return criado;
    }, 'Já existe uma definição com este código.');
  }

  atualizarNutriente(id: string, d: DadosNutrienteValidados, motivo: string): Nutriente {
    return this.transacao(() => {
      const antes = this.nutriente(id);
      if (d.codigo !== antes.codigo) invalido('O código da definição não muda.');
      if (
        antes.origemDefinicao === 'sistema' &&
        (d.nome !== antes.nome ||
          d.grupo !== antes.grupo ||
          d.unidadeReferencia !== antes.unidadeReferencia ||
          d.baseReferencia !== antes.baseReferencia)
      )
        invalido('Nas definições do sistema, nome, grupo, unidade e base não mudam.');
      const mudaSentido =
        d.grupo !== antes.grupo ||
        d.unidadeReferencia !== antes.unidadeReferencia ||
        d.baseReferencia !== antes.baseReferencia ||
        d.metodoAnalitico !== antes.metodoAnalitico ||
        d.situacaoFundamentacao !== antes.situacaoFundamentacao ||
        d.fundamentacaoFonteId !== (antes.fundamentacaoFonte?.id ?? null) ||
        d.fundamentacaoReferencia !== antes.fundamentacaoReferencia;
      if (mudaSentido && antes.nValores > 0)
        invalido(
          'Esta definição já tem valores: grupo, unidade, base, método e fundamentação não mudam. Cadastre a variante como nova definição.',
        );
      if (d.fundamentacaoFonteId !== (antes.fundamentacaoFonte?.id ?? null))
        this.conferirFundamentacao(d);
      this.repo.atualizarNutriente(id, d, this.agora());
      const depois = this.nutriente(id);
      this.auditar('nutriente', id, 'alteracao', antes, depois, motivo);
      return depois;
    });
  }

  // ----- Alimentos -----

  listarAlimentos(filtros: FiltrosAlimentos): ResumoAlimento[] {
    return this.repo.listarAlimentos(filtros);
  }

  obterAlimento(id: string, propriedadeId: string | null = null): AlimentoDetalhe {
    const a = this.alimento(id);
    if (propriedadeId && !this.propriedades.obter(propriedadeId))
      throw new ErroAplicacao('NAO_ENCONTRADO', 'Propriedade não encontrada.');
    const registros = new RepositorioComposicao(() => this.banco.conexao).listar({
      alimentoId: id,
      fonteId: null,
      status: null,
      origem: null,
      propriedadeId,
      somenteDaPropriedade: false,
    });
    return {
      alimento: a,
      registros,
      itensEstoque: this.repo.itensVinculados(id),
      historico: this.trilha('alimento', [id]),
    };
  }

  criarAlimento(d: DadosAlimentoValidados): ResumoAlimento {
    const id = this.gerarId();
    return this.transacao(() => {
      const nome = normalizarNome(d.nome);
      if (this.repo.alimentoPorNome(nome))
        throw new ErroAplicacao('DUPLICADO', 'Já existe um alimento com este nome.');
      this.repo.salvarAlimento(id, d, nome, this.agora(), true);
      const criado = this.alimento(id);
      this.auditar('alimento', id, 'criacao', null, criado);
      return criado;
    }, 'Já existe um alimento com este nome.');
  }

  atualizarAlimento(id: string, d: DadosAlimentoValidados, motivo: string): ResumoAlimento {
    return this.transacao(() => {
      const antes = this.alimento(id);
      if (antes.excluidoEm) invalido('Alimento excluído não muda.');
      const identidadeMuda =
        d.especie !== antes.especie ||
        d.cultivar !== antes.cultivar ||
        d.partePlanta !== antes.partePlanta ||
        d.formaConservacao !== antes.formaConservacao ||
        d.processamento !== antes.processamento ||
        d.classe !== antes.classe ||
        d.comercial !== antes.comercial;
      if (identidadeMuda && antes.nRegistros > 0)
        invalido(
          'Este alimento tem registros de composição: espécie, cultivar, parte, forma de conservação, processamento, classe e comercial não mudam. Cadastre outro alimento.',
        );
      const nome = normalizarNome(d.nome);
      if (this.repo.alimentoPorNome(nome, id))
        throw new ErroAplicacao('DUPLICADO', 'Já existe um alimento com este nome.');
      this.repo.salvarAlimento(id, d, nome, this.agora(), false);
      const depois = this.alimento(id);
      this.auditar('alimento', id, 'alteracao', antes, depois, motivo);
      return depois;
    }, 'Já existe um alimento com este nome.');
  }

  excluirAlimento(id: string, motivo: string): ResumoAlimento {
    return this.transacao(() => {
      const antes = this.alimento(id);
      if (antes.excluidoEm) invalido('O alimento já está excluído.');
      if (antes.nRegistros > 0)
        invalido('O alimento tem registros de composição. Descarte os registros antes.');
      if (this.repo.contarVinculosEstoque(id) > 0)
        invalido('O alimento está vinculado a itens de estoque. Desfaça os vínculos antes.');
      this.repo.excluirAlimento(id, motivo, this.agora());
      const depois = this.alimento(id);
      this.auditar('alimento', id, 'exclusao', antes, depois, motivo);
      return depois;
    });
  }

  // ----- Vínculo com item de estoque -----

  private itemDeAlimentacao(itemId: string) {
    const item = new RepositorioEstoque(() => this.banco.conexao).obter(itemId);
    if (!item) throw new ErroAplicacao('NAO_ENCONTRADO', 'Item de estoque não encontrado.');
    return item;
  }

  obterVinculo(itemId: string): VinculoAlimentoItem {
    this.itemDeAlimentacao(itemId);
    const v = this.repo.vinculoDoItem(itemId);
    return {
      itemId,
      alimento: v ? { id: v.alimentoId, nome: v.alimentoNome } : null,
      historico: this.trilha('estoque_item_alimento', [itemId]),
    };
  }

  /**
   * Aponta o item de estoque para um alimento do banco (ou desfaz, com `null`). Não copia
   * composição e não cria movimento de estoque nem lançamento financeiro.
   */
  definirVinculo(itemId: string, alimentoId: string | null): VinculoAlimentoItem {
    this.transacao(() => {
      const item = this.itemDeAlimentacao(itemId);
      if (['medicamento', 'vacina', 'semen'].includes(item.tipo))
        invalido(
          'Só itens de alimentação (ração, silagem, volumoso, suplemento, mineral ou outro) se vinculam a um alimento.',
        );
      const atual = this.repo.vinculoDoItem(itemId);
      if ((atual?.alimentoId ?? null) === alimentoId) return;
      if (alimentoId) {
        const a = this.alimento(alimentoId);
        if (a.excluidoEm) invalido('O alimento está excluído.');
      }
      const agora = this.agora();
      if (atual) {
        this.repo.desvincular(atual.id, agora);
        this.auditar(
          'estoque_item_alimento',
          itemId,
          'desvinculacao',
          { alimentoId: atual.alimentoId, alimentoNome: atual.alimentoNome },
          null,
        );
      }
      if (alimentoId) {
        this.repo.vincular(this.gerarId(), itemId, alimentoId, agora);
        const novo = this.repo.vinculoDoItem(itemId)!;
        this.auditar('estoque_item_alimento', itemId, 'vinculacao', null, {
          alimentoId,
          alimentoNome: novo.alimentoNome,
        });
      }
    });
    return this.obterVinculo(itemId);
  }
}
