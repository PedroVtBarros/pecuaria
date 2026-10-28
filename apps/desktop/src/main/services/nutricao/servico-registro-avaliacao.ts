import {
  RepositorioAvaliacaoNutricional,
  type GerenciadorBanco,
  type LinhaAnulacao,
  type LinhaAvaliacaoNutricional,
} from '@pecuaria/database';
import {
  ErroAplicacao,
  type AvaliacaoDietaCalculada,
  type AvaliacaoNutricionalGravada,
  type EntradaAvaliacaoDieta,
  type ResumoAvaliacaoNutricional,
} from '@pecuaria/shared-types';
import {
  BaseServicoAlimentos,
  invalido,
  type OpcoesServicoAlimentos,
} from '../alimentos/servico-alimentos';
import { hashDoRetrato, partesDoRetrato, situacaoDoCalculo } from './retrato-avaliacao';
import type { ServicoAvaliacaoDieta } from './servico-avaliacao-dieta';

/*
 * Fase 6B-4: avaliação nutricional imutável (migrations 0019 e 0020). Só por ação do usuário, o
 * main recalcula a avaliação (nunca aceita resultado vindo do renderer), compara o retrato com o
 * exibido (D-6B4-02) e grava o retrato inteiro: entrada, hipóteses, perfis com os valores
 * efetivamente usados, fontes, versões e resultados. Ao ler, nada é recalculado: devolve o retrato
 * como gravado e confere o SHA-256. Anulação em registro separado (D-6B4-03).
 */

export { FORMATO_AVALIACAO, jsonFiel } from './retrato-avaliacao';

export interface DadosRegistrarAvaliacao {
  entrada: EntradaAvaliacaoDieta;
  conteudoSha256Exibido: string;
  rotulo: string;
  observacao: string | null;
  responsavel: string;
}

type Resultado = Pick<
  AvaliacaoDietaCalculada,
  'cmsPrevisto' | 'exigencias' | 'oferta' | 'balanco'
> & { situacao?: AvaliacaoDietaCalculada['situacao'] };

export class ServicoRegistroAvaliacao extends BaseServicoAlimentos {
  private readonly av: RepositorioAvaliacaoNutricional;

  constructor(
    banco: GerenciadorBanco,
    private readonly avaliacao: ServicoAvaliacaoDieta,
    opcoes: OpcoesServicoAlimentos = {},
  ) {
    super(banco, opcoes);
    this.av = new RepositorioAvaliacaoNutricional(() => banco.conexao);
  }

  registrar(d: DadosRegistrarAvaliacao): AvaliacaoNutricionalGravada {
    const id = this.gerarId();
    this.transacao(() => {
      // Cálculo e gravação na mesma transação: os perfis lidos são os gravados.
      const c = this.avaliacao.avaliar(d.entrada);
      if (c.conteudoSha256 === null)
        invalido(`A avaliação não pode ser gravada sem perda: ${c.naoGravavel ?? ''}`);
      // D-6B4-02: o retrato recalculado tem de ser o exibido (SHA-256 do retrato completo).
      if (c.conteudoSha256 !== d.conteudoSha256Exibido)
        throw new ErroAplicacao(
          'DADOS_DESATUALIZADOS',
          'Os dados mudaram desde a avaliação exibida (perfis, registros, regra ou motor). Avalie de novo antes de gravar.',
        );
      const partes = partesDoRetrato(c);
      this.av.inserir(
        {
          id,
          rotulo: d.rotulo,
          observacao: d.observacao,
          ...partes,
          conteudoSha256: c.conteudoSha256,
          registradoPor: d.responsavel,
        },
        c.perfis.map((p, k) => ({
          id: this.gerarId(),
          perfilId: p.perfilId,
          ordem: k + 1,
          elegivel: p.elegivel,
        })),
        this.agora(),
      );
      // Trilha com o resumo; o retrato fica só na tabela da avaliação (sem cópia dupla).
      this.auditar('avaliacao_nutricional', id, 'criacao', null, {
        rotulo: d.rotulo,
        versaoMotor: c.versaoMotor,
        tipoQuantidade: c.entrada.dieta.tipo,
        perfis: c.perfis.map((p) => p.perfilId),
        conteudoSha256: c.conteudoSha256,
      });
    });
    return this.obter(id);
  }

  /** D-6B4-03: registro separado com motivo, quem e quando; o retrato não muda. */
  anular(id: string, motivo: string, responsavel: string): AvaliacaoNutricionalGravada {
    this.transacao(() => {
      const atual = this.obter(id);
      if (atual.anulacao) invalido('Esta avaliação já foi anulada.');
      const a: LinhaAnulacao = {
        avaliacaoId: id,
        motivo,
        anuladoPor: responsavel,
        anuladoEm: this.agora(),
      };
      this.av.inserirAnulacao(this.gerarId(), a, a.anuladoEm);
      this.auditar(
        'avaliacao_nutricional',
        id,
        'anulacao',
        { anulacao: null },
        { anulacao: { motivo, anuladoPor: responsavel, anuladoEm: a.anuladoEm } },
        motivo,
      );
    });
    return this.obter(id);
  }

  obter(id: string): AvaliacaoNutricionalGravada {
    const l = this.av.obter(id);
    if (!l) throw new ErroAplicacao('NAO_ENCONTRADO', 'Avaliação nutricional não encontrada.');
    return this.montar(l, this.av.anulacoes([id])[0] ?? null);
  }

  listar(): ResumoAvaliacaoNutricional[] {
    const linhas = this.av.listar();
    const ids = linhas.map((l) => l.id);
    const perfis = this.av.perfis(ids);
    const anulacoes = new Map(this.av.anulacoes(ids).map((a) => [a.avaliacaoId, a]));
    return linhas.map((l) => {
      const g = this.montar(l, anulacoes.get(l.id) ?? null);
      return {
        id: l.id,
        rotulo: l.rotulo,
        observacao: l.observacao,
        registradoPor: l.registradoPor,
        registradoEm: l.registradoEm,
        versaoMotor: l.versaoMotor,
        tipoQuantidade: l.tipoQuantidade as ResumoAvaliacaoNutricional['tipoQuantidade'],
        parcial: g.avaliacao.situacao.parcial,
        anulada: g.anulacao !== null,
        integridade: g.integridade,
        usoOperacional: g.usoOperacional,
        perfis: perfis
          .filter((p) => p.avaliacaoId === l.id)
          .map((p) => ({
            perfilId: p.perfilId,
            nome: p.perfilNome,
            alimentoNome: p.alimentoNome,
            elegivel: p.elegivel,
          })),
      };
    });
  }

  private montar(
    l: LinhaAvaliacaoNutricional,
    anulacao: LinhaAnulacao | null,
  ): AvaliacaoNutricionalGravada {
    const resultado = JSON.parse(l.resultadoJson) as Resultado;
    const perfis = JSON.parse(l.perfisJson) as AvaliacaoDietaCalculada['perfis'];
    const integridade = hashDoRetrato(l) === l.conteudoSha256 ? 'conferida' : 'divergente';
    // Formato 1 (6B-4) não gravava a situação: recalculada do próprio retrato, identificada.
    const situacao = resultado.situacao ?? situacaoDoCalculo(perfis, resultado.balanco);
    const bloqueios = [...situacao.bloqueios];
    if (integridade === 'divergente')
      bloqueios.push(
        'Integridade divergente: o conteúdo gravado não confere com o SHA-256. Só para investigação, sem uso operacional (D-6B4-04).',
      );
    if (anulacao) bloqueios.push(`Anulada por ${anulacao.anuladoPor} — motivo: ${anulacao.motivo}`);
    return {
      id: l.id,
      rotulo: l.rotulo,
      observacao: l.observacao,
      registradoPor: l.registradoPor,
      registradoEm: l.registradoEm,
      formatoVersao: l.formatoVersao,
      conteudoSha256: l.conteudoSha256,
      integridade,
      anulacao: anulacao
        ? {
            motivo: anulacao.motivo,
            anuladoPor: anulacao.anuladoPor,
            anuladoEm: anulacao.anuladoEm,
          }
        : null,
      usoOperacional: bloqueios.length === 0,
      bloqueios,
      situacaoCalculadaNaLeitura: resultado.situacao === undefined,
      avaliacao: {
        fonte: JSON.parse(l.fonteJson) as AvaliacaoDietaCalculada['fonte'],
        versaoMotor: l.versaoMotor,
        entrada: JSON.parse(l.entradaJson) as EntradaAvaliacaoDieta,
        hipoteses: JSON.parse(l.hipotesesJson) as AvaliacaoDietaCalculada['hipoteses'],
        cmsPrevisto: resultado.cmsPrevisto,
        exigencias: resultado.exigencias,
        perfis,
        oferta: resultado.oferta,
        balanco: resultado.balanco,
        situacao,
        conteudoSha256: l.conteudoSha256,
        naoGravavel: null,
      },
    };
  }
}
