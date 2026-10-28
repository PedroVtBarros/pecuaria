import { createHash } from 'node:crypto';
import {
  conteudoDaRegra,
  executarSelecao,
  normalizarNome,
  perfilCenario,
  perfilCentral,
  perfilReferenciaIndividual,
  REGRAS_SELECAO,
  type ArestaDependencia,
  type IdentidadeAlimento,
  type PerfilMontado,
  type RegistroCandidato,
  type RegraSelecao,
  type SentidoCenario,
  type TipoAvaliacao,
  type TipoPerfil,
} from '@pecuaria/domain';
import {
  ErroAplicacao,
  type Alimento,
  type ExecucaoSelecao,
  type PerfilDetalhe,
  type RegistroDetalhe,
  type RegraSelecaoApi,
  type ResumoPerfil,
} from '@pecuaria/shared-types';
import { RepositorioSelecao, type GerenciadorBanco } from '@pecuaria/database';
import {
  BaseServicoAlimentos,
  invalido,
  type OpcoesServicoAlimentos,
  type ServicoAlimentos,
} from './servico-alimentos';
import type { ServicoComposicao } from './servico-composicao';

export interface DadosGravarPerfil {
  alimentoId: string;
  idadeCorteDias: number | null;
  escolhas: { origemId: string; registroId: string }[];
  tipo: TipoPerfil;
  registroId: string | null;
  nutrienteId: string | null;
  sentido: SentidoCenario | null;
  nome: string;
  responsavel: string;
}

const identidade = (a: Alimento): IdentidadeAlimento => ({
  id: a.id,
  nome: a.nome,
  especie: a.especie,
  cultivar: a.cultivar,
  partePlanta: a.partePlanta,
  formaConservacao: a.formaConservacao,
  processamento: a.processamento,
});

const ROTULO_RELACAO: Record<string, string> = {
  mesmos_valores: 'mesmos valores',
  outro_inclui_este: 'um inclui o outro',
  outro_pode_incluir_este: 'um pode incluir o outro',
  mesmo_experimento_provavel: 'provável mesmo experimento',
};

/**
 * Seleção de composição (Fase 5D; PLANO_FASE_5.md, seção 13). Lê os registros do banco, aplica a
 * regra vigente (domínio, selecao.ts) e grava perfis imutáveis só por ação do usuário e só com a
 * regra aprovada por ele. Também guarda a avaliação científica ("uso com cautela" e base
 * validada), separada da conferência. Nada aqui altera registro de composição.
 */
export class ServicoSelecao extends BaseServicoAlimentos {
  private readonly sel: RepositorioSelecao;

  constructor(
    banco: GerenciadorBanco,
    private readonly alimentos: ServicoAlimentos,
    private readonly composicao: ServicoComposicao,
    private readonly regrasDisponiveis: readonly RegraSelecao[] = REGRAS_SELECAO,
    opcoes: OpcoesServicoAlimentos = {},
  ) {
    super(banco, opcoes);
    this.sel = new RepositorioSelecao(() => banco.conexao);
  }

  // ----- Regra

  private regraApi(r: RegraSelecao): RegraSelecaoApi {
    const hash = createHash('sha256').update(conteudoDaRegra(r)).digest('hex');
    const a = this.sel.aprovacao(r.codigo, r.versao);
    // Aprovação de conteúdo diferente (versão editada sem mudar o número) não vale.
    return {
      regra: r,
      hash,
      aprovacao:
        a && a.hash === hash
          ? { aprovadoPor: a.aprovadoPor, aprovadoEm: a.aprovadoEm, observacao: a.observacao }
          : null,
    };
  }

  /** Versão mais nova da regra: é a usada na seleção. */
  private vigente(): RegraSelecao {
    const r = [...this.regrasDisponiveis].sort((a, b) => b.versao - a.versao)[0];
    if (!r) throw new ErroAplicacao('NAO_ENCONTRADO', 'Nenhuma regra de seleção disponível.');
    return r;
  }

  regras(): RegraSelecaoApi[] {
    return this.regrasDisponiveis.map((r) => this.regraApi(r));
  }

  aprovarRegra(
    codigo: string,
    versao: number,
    responsavel: string,
    observacao: string | null,
  ): RegraSelecaoApi {
    const r = this.regrasDisponiveis.find((x) => x.codigo === codigo && x.versao === versao);
    if (!r) throw new ErroAplicacao('NAO_ENCONTRADO', 'Regra de seleção não encontrada.');
    // Versões anteriores ficam só para compatibilidade histórica (perfis antigos).
    const vigente = this.vigente();
    if (r.codigo !== vigente.codigo || r.versao !== vigente.versao)
      invalido(
        `A versão ${r.versao} da regra é só histórica: aprove a versão vigente (${vigente.versao}).`,
      );
    return this.transacao(() => {
      if (this.sel.aprovacao(codigo, versao)) invalido('Esta versão da regra já foi aprovada.');
      const id = this.gerarId();
      const { hash } = this.regraApi(r);
      this.sel.inserirAprovacao(
        id,
        { codigo, versao, hash, responsavel, observacao },
        this.agora(),
      );
      this.auditar('aprovacao_regra_selecao', id, 'aprovacao', null, {
        codigo,
        versao,
        hash,
        responsavel,
        observacao,
        regra: r,
      });
      return this.regraApi(r);
    });
  }

  // ----- Seleção

  executar(
    alimentoId: string,
    idadeCorteDias: number | null,
    escolhas: { origemId: string; registroId: string }[],
  ): ExecucaoSelecao {
    const alvo = this.alimento(alimentoId);
    if (alvo.excluidoEm) invalido('O alimento está excluído.');
    const regra = this.vigente();
    const especie = alvo.especie ? normalizarNome(alvo.especie) : null;
    const alimentos = this.repo
      .listarAlimentos({ busca: '', formaConservacao: null, classe: null, incluirExcluidos: false })
      .filter(
        (a) =>
          a.id === alvo.id ||
          (especie !== null && a.especie !== null && normalizarNome(a.especie) === especie),
      );
    const registros: RegistroCandidato[] = [];
    const fontes = new Map<string, { experimentoOrigem: string | null }>();
    for (const a of alimentos)
      for (const resumo of this.composicao.listar({
        alimentoId: a.id,
        fonteId: null,
        status: null,
        origem: null,
        propriedadeId: null,
        somenteDaPropriedade: false,
      })) {
        // Versões substituídas e descartes são histórico, não candidatos.
        if (resumo.status === 'substituido' || resumo.descartadoEm) continue;
        registros.push(this.candidato(this.composicao.obter(resumo.id), identidade(a), fontes));
      }
    const arestas: ArestaDependencia[] = this.composicao.vinculos
      .todos()
      .filter((v) => v.situacao !== 'descartado' && v.relacionadoId !== null)
      .map((v) => ({
        a: v.registroId,
        b: v.relacionadoId!,
        motivo: `Vínculo de possível mesma origem (${ROTULO_RELACAO[v.relacao] ?? v.relacao}, ${
          v.situacao === 'confirmado' ? 'confirmado' : 'a confirmar'
        }).`,
      }));
    const catalogo = this.repo.listarNutrientes(false).map((n) => ({
      id: n.id,
      codigo: n.codigo,
      nome: n.nome,
      unidadeReferencia: n.unidadeReferencia,
      direcaoConservadora: n.direcaoConservadora,
    }));
    const resultado = executarSelecao(
      { alimento: identidade(alvo), idadeCorteDias },
      registros,
      arestas,
      catalogo,
      regra,
      new Map(escolhas.map((e) => [e.origemId, e.registroId])),
    );
    return { alimento: identidade(alvo), regra: this.regraApi(regra), resultado };
  }

  private candidato(
    d: RegistroDetalhe,
    alimento: IdentidadeAlimento,
    fontes: Map<string, { experimentoOrigem: string | null }>,
  ): RegistroCandidato {
    const r = d.registro;
    let f = fontes.get(r.fonte.id);
    if (!f) {
      f = { experimentoOrigem: this.fonte(r.fonte.id).experimentoOrigem };
      fontes.set(r.fonte.id, f);
    }
    const ativas = d.avaliacoes.filter((a) => a.retiradoEm === null);
    const cautela = (valorId: string | null) =>
      ativas.find((a) => a.tipo === 'uso_com_cautela' && a.valorId === valorId)?.motivo ?? null;
    return {
      id: r.id,
      cadeiaId: d.versoes[0]?.id ?? r.id,
      alimento,
      fonteId: r.fonte.id,
      fonteDescricao: r.fonte.codigo ?? r.fonte.titulo,
      fonteOrigem: r.fonte.origem,
      experimentoOrigem: f.experimentoOrigem,
      referenciaLocal: r.referenciaLocal,
      idadeCorteDias: r.idadeCorteDias,
      classeIdadeFonte: r.classeIdadeFonte,
      status: r.status,
      vigente: r.descartadoEm === null && r.status !== 'substituido',
      cautela: cautela(null),
      valores: d.valores.map((v) => ({
        id: v.id,
        nutrienteId: v.nutriente.id,
        valor: v.valor,
        valorPublicado: v.valorPublicado,
        unidade: v.unidade,
        base: v.base,
        tipoValor: v.tipoValor,
        nObservacoes: v.nObservacoes,
        metodoAnaliticoFonte: v.metodoAnaliticoFonte,
        formaObtencao: v.formaObtencao,
        interpretacaoBase: v.interpretacaoBase,
        baseValidada: ativas.some((a) => a.tipo === 'base_validada' && a.valorId === v.id),
        cautela: cautela(v.id),
      })),
      naoQuantificados: d.valoresNaoQuantificados.map((q) => ({
        nutrienteId: q.nutriente.id,
        textoPublicado: q.textoPublicado,
        natureza: q.natureza,
      })),
    };
  }

  // ----- Perfis

  gravarPerfil(d: DadosGravarPerfil): PerfilDetalhe {
    const id = this.gerarId();
    this.transacao(() => {
      const exec = this.executar(d.alimentoId, d.idadeCorteDias, d.escolhas);
      if (!exec.regra.aprovacao)
        invalido(
          `A regra ${exec.regra.regra.codigo} versão ${exec.regra.regra.versao} ainda não foi aprovada: aprove-a antes de gravar perfis.`,
        );
      let p: PerfilMontado;
      try {
        p =
          d.tipo === 'referencia_individual'
            ? perfilReferenciaIndividual(exec.resultado, d.registroId!)
            : d.tipo === 'agregado_central'
              ? perfilCentral(exec.resultado)
              : perfilCenario(exec.resultado, d.nutrienteId!, d.sentido!, d.registroId!);
      } catch (e) {
        invalido(e instanceof Error ? e.message : String(e));
      }
      this.sel.inserirPerfil(
        id,
        {
          alimentoId: d.alimentoId,
          nome: d.nome,
          idadeCorteBuscaDias: d.idadeCorteDias,
          regraCodigo: exec.regra.regra.codigo,
          regraVersao: exec.regra.regra.versao,
          criadoPor: d.responsavel,
          selecao: {
            origens: exec.resultado.origens,
            escolhas: d.escolhas,
            regraHash: exec.regra.hash,
          },
        },
        p,
        this.gerarId,
        this.agora(),
      );
      this.auditar('perfil_composicao', id, 'criacao', null, this.sel.obterPerfil(id));
    });
    return this.obterPerfil(id);
  }

  listarPerfis(alimentoId: string | null): ResumoPerfil[] {
    return this.sel.listarPerfis(alimentoId);
  }

  obterPerfil(id: string): PerfilDetalhe {
    const p = this.sel.obterPerfil(id);
    if (!p) throw new ErroAplicacao('NAO_ENCONTRADO', 'Perfil de composição não encontrado.');
    return p;
  }

  // ----- Avaliação científica

  marcarAvaliacao(
    registroId: string,
    valorId: string | null,
    tipo: TipoAvaliacao,
    motivo: string,
    responsavel: string,
  ): RegistroDetalhe {
    this.transacao(() => {
      const d = this.composicao.obter(registroId);
      if (d.registro.descartadoEm) invalido('Registro descartado não recebe avaliação.');
      const v = valorId === null ? null : d.valores.find((x) => x.id === valorId);
      if (valorId !== null && !v) invalido('O valor não pertence a este registro.');
      if (tipo === 'base_validada' && (!v || v.interpretacaoBase === null))
        invalido('Só valor com base inferida pode ter a base validada.');
      if (
        d.avaliacoes.some((a) => a.retiradoEm === null && a.tipo === tipo && a.valorId === valorId)
      )
        invalido('Esta avaliação já está ativa.');
      const id = this.gerarId();
      this.sel.inserirAvaliacao(
        id,
        { registroId, valorId, tipo, motivo, responsavel },
        this.agora(),
      );
      this.auditar('avaliacao_cientifica', id, 'avaliacao', null, this.sel.obterAvaliacao(id));
    });
    return this.composicao.obter(registroId);
  }

  retirarAvaliacao(
    registroId: string,
    avaliacaoId: string,
    motivo: string,
    responsavel: string,
  ): RegistroDetalhe {
    this.transacao(() => {
      const a = this.sel.obterAvaliacao(avaliacaoId);
      if (!a || a.registroId !== registroId)
        throw new ErroAplicacao('NAO_ENCONTRADO', 'Avaliação não encontrada neste registro.');
      if (a.retiradoEm) invalido('Esta avaliação já foi retirada.');
      this.sel.retirarAvaliacao(avaliacaoId, responsavel, motivo, this.agora());
      this.auditar(
        'avaliacao_cientifica',
        avaliacaoId,
        'retirada',
        a,
        this.sel.obterAvaliacao(avaliacaoId),
        motivo,
      );
    });
    return this.composicao.obter(registroId);
  }
}
