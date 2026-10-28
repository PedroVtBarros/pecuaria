import { mesmaPessoa, type StatusRegistro } from '@pecuaria/domain';
import type {
  DadosRegistroValidados,
  FiltrosRegistros,
  FonteResumida,
  RegistroComposicao,
  ResumoRegistro,
  ValorNaoQuantificadoApi,
  ValorNutricionalApi,
} from '@pecuaria/shared-types';
import type { ObterConexao } from './comum';

type Linha = Record<string, unknown>;
const texto = (v: unknown) => (v === null || v === undefined ? null : (v as string));
const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Valor pronto para gravar: texto publicado e número já derivado pelo domínio. */
export interface ValorParaGravar {
  nutrienteId: string;
  valorPublicado: string;
  valor: number;
  unidade: string;
  base: string;
  tipoValor: string;
  desvioPadraoPublicado: string | null;
  desvioPadrao: number | null;
  minimoPublicado: string | null;
  minimo: number | null;
  maximoPublicado: string | null;
  maximo: number | null;
  nObservacoes: number | null;
  metodoAnaliticoFonte: string | null;
  formaObtencao: string;
  descricaoObtencao: string | null;
  interpretacaoBase: string | null;
  referenciaLocal: string | null;
  observacao: string | null;
}

/** Valor não quantificado pronto para gravar: só texto, nunca número. */
export interface NaoQuantificadoParaGravar {
  nutrienteId: string;
  textoPublicado: string;
  natureza: string;
  significadoFonte: string;
  unidade: string;
  base: string;
  tipoValor: string;
  metodoAnaliticoFonte: string | null;
  referenciaLocal: string | null;
  observacao: string | null;
}

/** Campos de status gravados juntos em cada passo do fluxo. */
export interface MudancaStatus {
  status: StatusRegistro;
  transcritoPor: string | null;
  transcritoEm: string | null;
  conferidoPor: string | null;
  conferidoEm: string | null;
  rejeitadoPor: string | null;
  rejeitadoEm: string | null;
  motivoRejeicao: string | null;
}

function fonteResumida(l: Linha): FonteResumida {
  return {
    id: l['fonte_id'] as string,
    origem: l['fonte_origem'] as FonteResumida['origem'],
    codigo: texto(l['fonte_codigo']),
    titulo: l['fonte_titulo'] as string,
    propriedadeId: texto(l['fonte_propriedade_id']),
    propriedadeNome: texto(l['fonte_propriedade_nome']),
  };
}

function resumo(l: Linha): ResumoRegistro {
  return {
    id: l['id'] as string,
    alimentoId: l['alimento_id'] as string,
    alimentoNome: l['alimento_nome'] as string,
    fonte: fonteResumida(l),
    referenciaLocal: texto(l['referencia_local']),
    idadeCorteDias: numero(l['idade_corte_dias']),
    dataAmostra: texto(l['data_amostra']),
    status: l['status'] as StatusRegistro,
    nValores: Number(l['n_valores'] ?? 0),
    transcritoPor: texto(l['transcrito_por']),
    transcritoEm: texto(l['transcrito_em']),
    conferidoPor: texto(l['conferido_por']),
    conferidoEm: texto(l['conferido_em']),
    substituiId: texto(l['substitui_id']),
    sucessorId: texto(l['sucessor_id']),
    mesmaPessoa: mesmaPessoa(texto(l['transcrito_por']), texto(l['conferido_por'])),
    descartadoEm: texto(l['deleted_at']),
  };
}

function registro(l: Linha): RegistroComposicao {
  const outras = texto(l['outras_condicoes_json']);
  return {
    ...resumo(l),
    classeIdadeFonte: texto(l['classe_idade_fonte']),
    aditivoEnsilagem: texto(l['aditivo_ensilagem']),
    regiao: texto(l['regiao']),
    estacao: texto(l['estacao']),
    adubacao: texto(l['adubacao']),
    outrasCondicoes: outras ? (JSON.parse(outras) as Record<string, string>) : null,
    nObservacoes: numero(l['n_observacoes']),
    separadorDecimal: l['separador_decimal'] as RegistroComposicao['separadorDecimal'],
    identificacaoAmostra: texto(l['identificacao_amostra']),
    observacoes: texto(l['observacoes']),
    rejeitadoPor: texto(l['rejeitado_por']),
    rejeitadoEm: texto(l['rejeitado_em']),
    motivoRejeicao: texto(l['motivo_rejeicao']),
    motivoVersao: texto(l['motivo_versao']),
    substituidoEm: texto(l['substituido_em']),
    motivoDescarte: texto(l['motivo_descarte']),
  };
}

function nutrienteDoValor(l: Linha): ValorNutricionalApi['nutriente'] {
  return {
    id: l['nutriente_id'] as string,
    codigo: l['nutriente_codigo'] as string,
    nome: l['nutriente_nome'] as string,
    grupo: l['nutriente_grupo'] as ValorNutricionalApi['nutriente']['grupo'],
    unidadeReferencia: l[
      'nutriente_unidade'
    ] as ValorNutricionalApi['nutriente']['unidadeReferencia'],
    baseReferencia: l['nutriente_base'] as ValorNutricionalApi['nutriente']['baseReferencia'],
    situacaoFundamentacao: l[
      'nutriente_situacao'
    ] as ValorNutricionalApi['nutriente']['situacaoFundamentacao'],
  };
}

function valor(l: Linha, casasDecimais: (texto: string) => number): ValorNutricionalApi {
  return {
    id: l['id'] as string,
    nutriente: nutrienteDoValor(l),
    valorPublicado: l['valor_publicado'] as string,
    valor: Number(l['valor']),
    casasDecimais: casasDecimais(l['valor_publicado'] as string),
    unidade: l['unidade'] as ValorNutricionalApi['unidade'],
    base: l['base'] as ValorNutricionalApi['base'],
    tipoValor: l['tipo_valor'] as ValorNutricionalApi['tipoValor'],
    desvioPadraoPublicado: texto(l['desvio_padrao_publicado']),
    desvioPadrao: numero(l['desvio_padrao']),
    minimoPublicado: texto(l['minimo_publicado']),
    minimo: numero(l['minimo']),
    maximoPublicado: texto(l['maximo_publicado']),
    maximo: numero(l['maximo']),
    nObservacoes: numero(l['n_observacoes']),
    metodoAnaliticoFonte: texto(l['metodo_analitico_fonte']),
    formaObtencao: l['forma_obtencao'] as ValorNutricionalApi['formaObtencao'],
    descricaoObtencao: texto(l['descricao_obtencao']),
    interpretacaoBase: texto(l['interpretacao_base']),
    referenciaLocal: texto(l['referencia_local']),
    observacao: texto(l['observacao']),
  };
}

function naoQuantificado(l: Linha): ValorNaoQuantificadoApi {
  return {
    id: l['id'] as string,
    nutriente: nutrienteDoValor(l),
    textoPublicado: l['texto_publicado'] as string,
    natureza: l['natureza'] as ValorNaoQuantificadoApi['natureza'],
    significadoFonte: l['significado_fonte'] as string,
    unidade: l['unidade'] as ValorNaoQuantificadoApi['unidade'],
    base: l['base'] as ValorNaoQuantificadoApi['base'],
    tipoValor: l['tipo_valor'] as ValorNaoQuantificadoApi['tipoValor'],
    metodoAnaliticoFonte: texto(l['metodo_analitico_fonte']),
    referenciaLocal: texto(l['referencia_local']),
    observacao: texto(l['observacao']),
  };
}

const SELECT_REGISTRO = `SELECT r.*, a.nome AS alimento_nome,
  f.origem AS fonte_origem, f.codigo AS fonte_codigo, f.titulo AS fonte_titulo,
  f.propriedade_id AS fonte_propriedade_id, p.nome AS fonte_propriedade_nome,
  (SELECT count(*) FROM valor_nutricional v WHERE v.registro_id = r.id AND v.deleted_at IS NULL)
    + (SELECT count(*) FROM valor_nao_quantificado q WHERE q.registro_id = r.id AND q.deleted_at IS NULL) AS n_valores,
  (SELECT s.id FROM registro_composicao s WHERE s.substitui_id = r.id AND s.deleted_at IS NULL) AS sucessor_id
  FROM registro_composicao r
  JOIN alimento a ON a.id = r.alimento_id
  JOIN fonte f ON f.id = r.fonte_id
  LEFT JOIN propriedade p ON p.id = f.propriedade_id`;

const COLUNAS_NUTRIENTE = `n.codigo AS nutriente_codigo, n.nome AS nutriente_nome, n.grupo AS nutriente_grupo,
  n.unidade_referencia AS nutriente_unidade, n.base_referencia AS nutriente_base,
  n.situacao_fundamentacao AS nutriente_situacao`;
const SELECT_VALOR = `SELECT v.*, ${COLUNAS_NUTRIENTE}
  FROM valor_nutricional v JOIN nutriente n ON n.id = v.nutriente_id`;
const SELECT_NAO_QUANTIFICADO = `SELECT q.*, ${COLUNAS_NUTRIENTE}
  FROM valor_nao_quantificado q JOIN nutriente n ON n.id = q.nutriente_id`;

/** SQL e mapeamento dos registros de composição e valores; regras no domínio e no serviço. */
export class RepositorioComposicao {
  constructor(private readonly db: ObterConexao) {}

  listar(filtros: FiltrosRegistros): ResumoRegistro[] {
    const condicoes = ['r.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filtros.alimentoId) {
      condicoes.push('r.alimento_id = ?');
      params.push(filtros.alimentoId);
    }
    if (filtros.fonteId) {
      condicoes.push('r.fonte_id = ?');
      params.push(filtros.fonteId);
    }
    if (filtros.status) {
      condicoes.push('r.status = ?');
      params.push(filtros.status);
    }
    if (filtros.origem) {
      condicoes.push('f.origem = ?');
      params.push(filtros.origem);
    }
    if (filtros.somenteDaPropriedade) {
      condicoes.push('f.propriedade_id = ?');
      params.push(filtros.propriedadeId);
    } else if (filtros.propriedadeId) {
      condicoes.push('(f.propriedade_id IS NULL OR f.propriedade_id = ?)');
      params.push(filtros.propriedadeId);
    } else condicoes.push('f.propriedade_id IS NULL');
    return (
      this.db()
        .prepare(
          `${SELECT_REGISTRO} WHERE ${condicoes.join(' AND ')}
           ORDER BY f.origem, coalesce(r.data_amostra, ''), r.created_at, r.rowid`,
        )
        .all(...params) as Linha[]
    ).map(resumo);
  }

  obter(id: string): RegistroComposicao | null {
    const l = this.db().prepare(`${SELECT_REGISTRO} WHERE r.id = ?`).get(id) as Linha | undefined;
    return l ? registro(l) : null;
  }

  inserir(
    id: string,
    d: DadosRegistroValidados,
    agora: string,
    versao: { substituiId: string; motivo: string } | null = null,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO registro_composicao(id, alimento_id, fonte_id, referencia_local, idade_corte_dias, classe_idade_fonte,
           aditivo_ensilagem, regiao, estacao, adubacao, outras_condicoes_json, n_observacoes, separador_decimal,
           data_amostra, identificacao_amostra, observacoes, status, substitui_id, motivo_versao, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?, ?, ?)`,
      )
      .run(
        id,
        d.alimentoId,
        d.fonteId,
        ...this.cabecalho(d),
        versao?.substituiId ?? null,
        versao?.motivo ?? null,
        agora,
        agora,
      );
  }

  atualizar(id: string, d: DadosRegistroValidados, agora: string): void {
    this.db()
      .prepare(
        `UPDATE registro_composicao SET referencia_local = ?, idade_corte_dias = ?, classe_idade_fonte = ?,
           aditivo_ensilagem = ?, regiao = ?, estacao = ?, adubacao = ?, outras_condicoes_json = ?, n_observacoes = ?,
           separador_decimal = ?, data_amostra = ?, identificacao_amostra = ?, observacoes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(...this.cabecalho(d), agora, id);
  }

  private cabecalho(d: DadosRegistroValidados): unknown[] {
    return [
      d.referenciaLocal,
      d.idadeCorteDias,
      d.classeIdadeFonte,
      d.aditivoEnsilagem,
      d.regiao,
      d.estacao,
      d.adubacao,
      d.outrasCondicoes === null ? null : JSON.stringify(d.outrasCondicoes),
      d.nObservacoes,
      d.separadorDecimal,
      d.dataAmostra,
      d.identificacaoAmostra,
      d.observacoes,
    ];
  }

  mudarStatus(id: string, m: MudancaStatus, agora: string): void {
    this.db()
      .prepare(
        `UPDATE registro_composicao SET status = ?, transcrito_por = ?, transcrito_em = ?, conferido_por = ?,
           conferido_em = ?, rejeitado_por = ?, rejeitado_em = ?, motivo_rejeicao = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        m.status,
        m.transcritoPor,
        m.transcritoEm,
        m.conferidoPor,
        m.conferidoEm,
        m.rejeitadoPor,
        m.rejeitadoEm,
        m.motivoRejeicao,
        agora,
        id,
      );
  }

  substituir(id: string, agora: string): void {
    this.db()
      .prepare(
        "UPDATE registro_composicao SET status = 'substituido', substituido_em = ?, updated_at = ? WHERE id = ?",
      )
      .run(agora, agora, id);
  }

  descartar(id: string, motivo: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE registro_composicao SET deleted_at = ?, motivo_descarte = ?, updated_at = ? WHERE id = ?',
      )
      .run(agora, motivo, agora, id);
  }

  valores(registroId: string, casasDecimais: (texto: string) => number): ValorNutricionalApi[] {
    return (
      this.db()
        .prepare(
          `${SELECT_VALOR} WHERE v.registro_id = ? AND v.deleted_at IS NULL
           ORDER BY n.rowid, v.rowid`,
        )
        .all(registroId) as Linha[]
    ).map((l) => valor(l, casasDecimais));
  }

  obterValor(id: string): { id: string; registroId: string; deletedAt: string | null } | null {
    const l = this.db()
      .prepare('SELECT id, registro_id, deleted_at FROM valor_nutricional WHERE id = ?')
      .get(id) as Linha | undefined;
    return l
      ? {
          id: l['id'] as string,
          registroId: l['registro_id'] as string,
          deletedAt: texto(l['deleted_at']),
        }
      : null;
  }

  inserirValor(id: string, registroId: string, v: ValorParaGravar, agora: string): void {
    this.db()
      .prepare(
        `INSERT INTO valor_nutricional(id, registro_id, nutriente_id, valor_publicado, valor, unidade, base, tipo_valor,
           desvio_padrao_publicado, desvio_padrao, minimo_publicado, minimo, maximo_publicado, maximo, n_observacoes,
           metodo_analitico_fonte, forma_obtencao, descricao_obtencao, interpretacao_base, referencia_local, observacao, created_at,
           updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, registroId, ...this.camposValor(v), agora, agora);
  }

  atualizarValor(id: string, v: ValorParaGravar, agora: string): void {
    this.db()
      .prepare(
        `UPDATE valor_nutricional SET nutriente_id = ?, valor_publicado = ?, valor = ?, unidade = ?, base = ?,
           tipo_valor = ?, desvio_padrao_publicado = ?, desvio_padrao = ?, minimo_publicado = ?, minimo = ?,
           maximo_publicado = ?, maximo = ?, n_observacoes = ?, metodo_analitico_fonte = ?, forma_obtencao = ?,
           descricao_obtencao = ?, interpretacao_base = ?, referencia_local = ?, observacao = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(...this.camposValor(v), agora, id);
  }

  private camposValor(v: ValorParaGravar): unknown[] {
    return [
      v.nutrienteId,
      v.valorPublicado,
      v.valor,
      v.unidade,
      v.base,
      v.tipoValor,
      v.desvioPadraoPublicado,
      v.desvioPadrao,
      v.minimoPublicado,
      v.minimo,
      v.maximoPublicado,
      v.maximo,
      v.nObservacoes,
      v.metodoAnaliticoFonte,
      v.formaObtencao,
      v.descricaoObtencao,
      v.interpretacaoBase,
      v.referenciaLocal,
      v.observacao,
    ];
  }

  removerValor(id: string, agora: string): void {
    this.db()
      .prepare('UPDATE valor_nutricional SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(agora, agora, id);
  }

  /** Atualiza só o número derivado (quando o separador decimal do registro muda). */
  rederivarValor(
    id: string,
    numeros: {
      valor: number;
      desvioPadrao: number | null;
      minimo: number | null;
      maximo: number | null;
    },
    agora: string,
  ): void {
    this.db()
      .prepare(
        'UPDATE valor_nutricional SET valor = ?, desvio_padrao = ?, minimo = ?, maximo = ?, updated_at = ? WHERE id = ?',
      )
      .run(numeros.valor, numeros.desvioPadrao, numeros.minimo, numeros.maximo, agora, id);
  }

  naoQuantificados(registroId: string): ValorNaoQuantificadoApi[] {
    return (
      this.db()
        .prepare(
          `${SELECT_NAO_QUANTIFICADO} WHERE q.registro_id = ? AND q.deleted_at IS NULL
           ORDER BY n.rowid, q.rowid`,
        )
        .all(registroId) as Linha[]
    ).map(naoQuantificado);
  }

  obterNaoQuantificado(
    id: string,
  ): { id: string; registroId: string; deletedAt: string | null } | null {
    const l = this.db()
      .prepare('SELECT id, registro_id, deleted_at FROM valor_nao_quantificado WHERE id = ?')
      .get(id) as Linha | undefined;
    return l
      ? {
          id: l['id'] as string,
          registroId: l['registro_id'] as string,
          deletedAt: texto(l['deleted_at']),
        }
      : null;
  }

  inserirNaoQuantificado(
    id: string,
    registroId: string,
    v: NaoQuantificadoParaGravar,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO valor_nao_quantificado(id, registro_id, nutriente_id, texto_publicado, natureza, significado_fonte,
           unidade, base, tipo_valor, metodo_analitico_fonte, referencia_local, observacao, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, registroId, ...this.camposNaoQuantificado(v), agora, agora);
  }

  atualizarNaoQuantificado(id: string, v: NaoQuantificadoParaGravar, agora: string): void {
    this.db()
      .prepare(
        `UPDATE valor_nao_quantificado SET nutriente_id = ?, texto_publicado = ?, natureza = ?, significado_fonte = ?,
           unidade = ?, base = ?, tipo_valor = ?, metodo_analitico_fonte = ?, referencia_local = ?, observacao = ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .run(...this.camposNaoQuantificado(v), agora, id);
  }

  private camposNaoQuantificado(v: NaoQuantificadoParaGravar): unknown[] {
    return [
      v.nutrienteId,
      v.textoPublicado,
      v.natureza,
      v.significadoFonte,
      v.unidade,
      v.base,
      v.tipoValor,
      v.metodoAnaliticoFonte,
      v.referenciaLocal,
      v.observacao,
    ];
  }

  removerNaoQuantificado(id: string, agora: string): void {
    this.db()
      .prepare('UPDATE valor_nao_quantificado SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(agora, agora, id);
  }

  /** Copia os valores não quantificados ativos para a versão nova, como estão. */
  copiarNaoQuantificados(
    deRegistroId: string,
    paraRegistroId: string,
    gerarId: () => string,
    agora: string,
  ): number {
    const origem = this.naoQuantificados(deRegistroId);
    for (const q of origem)
      this.inserirNaoQuantificado(
        gerarId(),
        paraRegistroId,
        {
          nutrienteId: q.nutriente.id,
          textoPublicado: q.textoPublicado,
          natureza: q.natureza,
          significadoFonte: q.significadoFonte,
          unidade: q.unidade,
          base: q.base,
          tipoValor: q.tipoValor,
          metodoAnaliticoFonte: q.metodoAnaliticoFonte,
          referenciaLocal: q.referenciaLocal,
          observacao: q.observacao,
        },
        agora,
      );
    return origem.length;
  }

  /** Copia os valores ativos de um registro para outro (versão nova), sem conversão. */
  copiarValores(
    deRegistroId: string,
    paraRegistroId: string,
    gerarId: () => string,
    agora: string,
  ): number {
    const origem = this.db()
      .prepare(
        'SELECT * FROM valor_nutricional WHERE registro_id = ? AND deleted_at IS NULL ORDER BY rowid',
      )
      .all(deRegistroId) as Linha[];
    for (const l of origem)
      this.inserirValor(
        gerarId(),
        paraRegistroId,
        {
          nutrienteId: l['nutriente_id'] as string,
          valorPublicado: l['valor_publicado'] as string,
          valor: Number(l['valor']),
          unidade: l['unidade'] as string,
          base: l['base'] as string,
          tipoValor: l['tipo_valor'] as string,
          desvioPadraoPublicado: texto(l['desvio_padrao_publicado']),
          desvioPadrao: numero(l['desvio_padrao']),
          minimoPublicado: texto(l['minimo_publicado']),
          minimo: numero(l['minimo']),
          maximoPublicado: texto(l['maximo_publicado']),
          maximo: numero(l['maximo']),
          nObservacoes: numero(l['n_observacoes']),
          metodoAnaliticoFonte: texto(l['metodo_analitico_fonte']),
          formaObtencao: l['forma_obtencao'] as string,
          descricaoObtencao: texto(l['descricao_obtencao']),
          interpretacaoBase: texto(l['interpretacao_base']),
          referenciaLocal: texto(l['referencia_local']),
          observacao: texto(l['observacao']),
        },
        agora,
      );
    return origem.length;
  }
}
