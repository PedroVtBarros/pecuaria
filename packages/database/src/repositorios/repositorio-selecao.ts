import type { PerfilMontado, TipoAvaliacao } from '@pecuaria/domain';
import type {
  AvaliacaoCientificaApi,
  PerfilDetalhe,
  ResumoPerfil,
  ValorPerfilApi,
} from '@pecuaria/shared-types';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;
const texto = (v: unknown) => (v === null || v === undefined ? null : (v as string));
const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function avaliacao(l: Linha): AvaliacaoCientificaApi {
  return {
    id: l['id'] as string,
    registroId: l['registro_id'] as string,
    valorId: texto(l['valor_id']),
    tipo: l['tipo'] as TipoAvaliacao,
    motivo: l['motivo'] as string,
    avaliadoPor: l['avaliado_por'] as string,
    avaliadoEm: l['avaliado_em'] as string,
    retiradoPor: texto(l['retirado_por']),
    retiradoEm: texto(l['retirado_em']),
    motivoRetirada: texto(l['motivo_retirada']),
  };
}

function resumoPerfil(l: Linha): ResumoPerfil {
  return {
    id: l['id'] as string,
    alimentoId: l['alimento_id'] as string,
    alimentoNome: l['alimento_nome'] as string,
    nome: l['nome'] as string,
    tipo: l['tipo'] as ResumoPerfil['tipo'],
    cenario: l['cenario'] as ResumoPerfil['cenario'],
    nivel: l['nivel'] as ResumoPerfil['nivel'],
    idadeCorteBuscaDias: numero(l['idade_corte_busca_dias']),
    nutrienteReferencia: l['nutriente_referencia_id']
      ? {
          id: l['nutriente_referencia_id'] as string,
          codigo: l['nutriente_referencia_codigo'] as string,
        }
      : null,
    regraCodigo: l['regra_codigo'] as string,
    regraVersao: Number(l['regra_versao']),
    nValores: Number(l['n_valores']),
    criadoPor: l['criado_por'] as string,
    criadoEm: l['criado_em'] as string,
  };
}

const SELECT_PERFIL = `SELECT p.*, a.nome AS alimento_nome, n.codigo AS nutriente_referencia_codigo,
  (SELECT count(*) FROM perfil_valor v WHERE v.perfil_id = p.id) AS n_valores
  FROM perfil_composicao p JOIN alimento a ON a.id = p.alimento_id
  LEFT JOIN nutriente n ON n.id = p.nutriente_referencia_id`;

export interface DadosPerfilGravar {
  alimentoId: string;
  nome: string;
  idadeCorteBuscaDias: number | null;
  regraCodigo: string;
  regraVersao: number;
  selecao: Record<string, unknown>;
  criadoPor: string;
}

/**
 * SQL da Fase 5D (migration 0017): avaliação científica, aprovação de regra e perfis imutáveis.
 * Regras no domínio e no serviço.
 */
export class RepositorioSelecao {
  constructor(private readonly db: ObterConexao) {}

  // ----- Avaliação científica

  avaliacoesDe(registroIds: readonly string[]): AvaliacaoCientificaApi[] {
    if (!registroIds.length) return [];
    const marcas = registroIds.map(() => '?').join(', ');
    return (
      this.db()
        .prepare(
          `SELECT * FROM avaliacao_cientifica WHERE registro_id IN (${marcas}) ORDER BY rowid`,
        )
        .all(...registroIds) as Linha[]
    ).map(avaliacao);
  }

  obterAvaliacao(id: string): AvaliacaoCientificaApi | null {
    const l = this.db().prepare('SELECT * FROM avaliacao_cientifica WHERE id = ?').get(id) as
      Linha | undefined;
    return l ? avaliacao(l) : null;
  }

  inserirAvaliacao(
    id: string,
    d: {
      registroId: string;
      valorId: string | null;
      tipo: TipoAvaliacao;
      motivo: string;
      responsavel: string;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO avaliacao_cientifica(id, registro_id, valor_id, tipo, motivo, avaliado_por, avaliado_em, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, d.registroId, d.valorId, d.tipo, d.motivo, d.responsavel, agora, agora, agora);
  }

  retirarAvaliacao(id: string, responsavel: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        `UPDATE avaliacao_cientifica SET retirado_por = ?, retirado_em = ?, motivo_retirada = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(responsavel, agora, motivo, agora, id);
  }

  // ----- Aprovação de regra

  aprovacao(
    codigo: string,
    versao: number,
  ): {
    id: string;
    hash: string;
    aprovadoPor: string;
    aprovadoEm: string;
    observacao: string | null;
  } | null {
    const l = this.db()
      .prepare('SELECT * FROM aprovacao_regra_selecao WHERE regra_codigo = ? AND regra_versao = ?')
      .get(codigo, versao) as Linha | undefined;
    return l
      ? {
          id: l['id'] as string,
          hash: l['conteudo_hash'] as string,
          aprovadoPor: l['aprovado_por'] as string,
          aprovadoEm: l['aprovado_em'] as string,
          observacao: texto(l['observacao']),
        }
      : null;
  }

  inserirAprovacao(
    id: string,
    d: {
      codigo: string;
      versao: number;
      hash: string;
      responsavel: string;
      observacao: string | null;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO aprovacao_regra_selecao(id, regra_codigo, regra_versao, conteudo_hash, aprovado_por, aprovado_em,
           observacao, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, d.codigo, d.versao, d.hash, d.responsavel, agora, d.observacao, agora, agora);
  }

  // ----- Perfis

  inserirPerfil(
    id: string,
    d: DadosPerfilGravar,
    p: PerfilMontado,
    gerarId: () => string,
    agora: string,
  ): void {
    const db = this.db();
    db.prepare(
      `INSERT INTO perfil_composicao(id, alimento_id, nome, tipo, cenario, nivel, idade_corte_busca_dias,
         nutriente_referencia_id, registro_base_id, regra_codigo, regra_versao, diferencas_json, limitacoes_json,
         nao_quantificados_json, selecao_json, criado_por, criado_em, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      d.alimentoId,
      d.nome,
      p.tipo,
      p.cenario,
      p.nivel,
      d.idadeCorteBuscaDias,
      p.nutrienteReferenciaId,
      p.registroBaseId,
      d.regraCodigo,
      d.regraVersao,
      JSON.stringify(p.diferencas),
      JSON.stringify(p.limitacoes),
      JSON.stringify(p.naoQuantificados),
      JSON.stringify(d.selecao),
      d.criadoPor,
      agora,
      agora,
      agora,
    );
    const valor = db.prepare(
      `INSERT INTO perfil_valor(id, perfil_id, nutriente_id, valor, valor_publicado, unidade, base, tipo_valor,
         forma_obtencao, metodo_analitico_fonte, interpretacao_base, n_origens, mediana, minimo, maximo, cobertura,
         created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const origem = db.prepare(
      `INSERT INTO perfil_valor_origem(id, perfil_valor_id, valor_nutricional_id, registro_id, valor_usado,
         created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const v of p.valores) {
      const vid = gerarId();
      valor.run(
        vid,
        id,
        v.nutrienteId,
        v.valor,
        v.valorPublicado,
        v.unidade,
        v.base,
        v.tipoValor,
        v.formaObtencao,
        v.metodo,
        v.interpretacaoBase,
        v.nOrigens,
        v.mediana,
        v.minimo,
        v.maximo,
        v.cobertura,
        agora,
        agora,
      );
      for (const o of v.origens)
        origem.run(gerarId(), vid, o.valorId, o.registroId, o.valor, agora, agora);
    }
  }

  listarPerfis(alimentoId: string | null): ResumoPerfil[] {
    return (
      this.db()
        .prepare(
          `${SELECT_PERFIL} WHERE (? IS NULL OR p.alimento_id = ?) ORDER BY p.criado_em DESC, p.rowid DESC`,
        )
        .all(alimentoId, alimentoId) as Linha[]
    ).map(resumoPerfil);
  }

  obterPerfil(id: string): PerfilDetalhe | null {
    const l = this.db().prepare(`${SELECT_PERFIL} WHERE p.id = ?`).get(id) as Linha | undefined;
    if (!l) return null;
    const valores = (
      this.db()
        .prepare(
          `SELECT v.*, n.codigo AS n_codigo, n.nome AS n_nome FROM perfil_valor v JOIN nutriente n ON n.id = v.nutriente_id
           WHERE v.perfil_id = ? ORDER BY v.rowid`,
        )
        .all(id) as Linha[]
    ).map((v): ValorPerfilApi => ({
      id: v['id'] as string,
      nutriente: {
        id: v['nutriente_id'] as string,
        codigo: v['n_codigo'] as string,
        nome: v['n_nome'] as string,
      },
      valor: Number(v['valor']),
      valorPublicado: texto(v['valor_publicado']),
      unidade: v['unidade'] as ValorPerfilApi['unidade'],
      base: v['base'] as ValorPerfilApi['base'],
      tipoValor: v['tipo_valor'] as ValorPerfilApi['tipoValor'],
      formaObtencao: v['forma_obtencao'] as ValorPerfilApi['formaObtencao'],
      metodoAnaliticoFonte: texto(v['metodo_analitico_fonte']),
      interpretacaoBase: texto(v['interpretacao_base']),
      nOrigens: Number(v['n_origens']),
      mediana: numero(v['mediana']),
      minimo: numero(v['minimo']),
      maximo: numero(v['maximo']),
      cobertura: texto(v['cobertura']),
      origens: (
        this.db()
          .prepare('SELECT * FROM perfil_valor_origem WHERE perfil_valor_id = ? ORDER BY rowid')
          .all(v['id']) as Linha[]
      ).map((o) => ({
        valorNutricionalId: o['valor_nutricional_id'] as string,
        registroId: o['registro_id'] as string,
        valorUsado: Number(o['valor_usado']),
      })),
    }));
    return {
      perfil: resumoPerfil(l),
      registroBaseId: texto(l['registro_base_id']),
      diferencas: JSON.parse(l['diferencas_json'] as string) as string[],
      limitacoes: JSON.parse(l['limitacoes_json'] as string) as string[],
      naoQuantificados: JSON.parse(
        l['nao_quantificados_json'] as string,
      ) as PerfilDetalhe['naoQuantificados'],
      selecao: JSON.parse(l['selecao_json'] as string) as Record<string, unknown>,
      valores,
    };
  }
}
