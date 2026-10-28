import type {
  AnimalDoManejo,
  DadosAgendaValidados,
  DadosManejoValidados,
  DadosProdutoSanitarioValidados,
  ManejoResumo,
  ProdutoSanitario,
} from '@pecuaria/shared-types';
import type {
  AbrangenciaManejo,
  StatusAgendaSanitaria,
  TipoManejoSanitario,
  TipoProdutoSanitario,
  UnidadeDose,
  ViaAplicacao,
} from '@pecuaria/domain';
import { referencia, type ObterConexao } from './comum';

// ---------------------------------------------------------------------------
// Tipos de leitura (sem regras: datas de liberação e situação da agenda são
// calculadas nos serviços)
// ---------------------------------------------------------------------------

export interface ManejoBase extends ManejoResumo {
  via: ViaAplicacao | null;
  diagnostico: string | null;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface EventoDoAnimalBase {
  eventoId: string;
  manejoId: string;
  tipo: TipoManejoSanitario;
  data: string;
  produto: { id: string; nome: string } | null;
  descricao: string | null;
  dose: number | null;
  unidadeDose: UnidadeDose | null;
  via: ViaAplicacao | null;
  abrangencia: AbrangenciaManejo;
  lote: { id: string; nome: string } | null;
  carenciaCarneDias: number | null;
  carenciaLeiteDias: number | null;
  responsavel: string | null;
  diagnostico: string | null;
  observacao: string | null;
  registradoEm: string;
}

export interface CarenciaRegistrada {
  animalId: string;
  identificacao: string;
  nome: string | null;
  lote: { id: string; nome: string } | null;
  manejoId: string;
  data: string;
  produto: string;
  carenciaCarneDias: number | null;
  carenciaLeiteDias: number | null;
}

export interface AgendaBase {
  id: string;
  propriedadeId: string;
  dataPrevista: string;
  tipo: TipoManejoSanitario;
  produto: { id: string; nome: string } | null;
  descricao: string | null;
  lote: { id: string; nome: string } | null;
  animal: { id: string; identificacao: string } | null;
  status: StatusAgendaSanitaria;
  manejoOrigemId: string | null;
  manejoRealizadoId: string | null;
  dataConclusao: string | null;
  motivoCancelamento: string | null;
  observacoes: string | null;
}

export interface ConsultaManejos {
  propriedadeId: string;
  tipo?: TipoManejoSanitario | undefined;
  loteId?: string | undefined;
  animalId?: string | undefined;
  produtoId?: string | undefined;
  dataInicial?: string | undefined;
  dataFinal?: string | undefined;
  pagina: number;
  tamanhoPagina: number;
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

interface LinhaProduto {
  id: string;
  nome: string;
  tipo: TipoProdutoSanitario;
  fabricante: string | null;
  principio_ativo: string | null;
  unidade_dose: UnidadeDose | null;
  carencia_carne_dias: number | null;
  carencia_leite_dias: number | null;
  observacoes: string | null;
  usos: number;
}

interface LinhaManejo {
  id: string;
  propriedade_id: string;
  tipo: TipoManejoSanitario;
  data: string;
  produto_id: string | null;
  produto_nome: string | null;
  descricao: string | null;
  dose: number | null;
  unidade_dose: UnidadeDose | null;
  via: ViaAplicacao | null;
  abrangencia: AbrangenciaManejo;
  lote_id: string | null;
  lote_nome: string | null;
  carencia_carne_dias: number | null;
  carencia_leite_dias: number | null;
  responsavel: string | null;
  diagnostico: string | null;
  custo_total_centavos: number | null;
  observacoes: string | null;
  quantidade_animais: number;
  created_at: string;
  updated_at: string;
}

interface LinhaAgenda {
  id: string;
  propriedade_id: string;
  data_prevista: string;
  tipo: TipoManejoSanitario;
  produto_id: string | null;
  produto_nome: string | null;
  descricao: string | null;
  lote_id: string | null;
  lote_nome: string | null;
  animal_id: string | null;
  animal_identificacao: string | null;
  status: StatusAgendaSanitaria;
  manejo_origem_id: string | null;
  manejo_realizado_id: string | null;
  data_conclusao: string | null;
  motivo_cancelamento: string | null;
  observacoes: string | null;
}

const SELECT_MANEJO = `
  SELECT m.*, p.nome AS produto_nome, l.nome AS lote_nome,
    (SELECT count(*) FROM evento_sanitario e WHERE e.manejo_id = m.id AND e.deleted_at IS NULL)
      AS quantidade_animais
  FROM manejo_sanitario m
  LEFT JOIN produto_sanitario p ON p.id = m.produto_id
  LEFT JOIN lote l ON l.id = m.lote_id`;

const SELECT_AGENDA = `
  SELECT g.*, p.nome AS produto_nome, l.nome AS lote_nome, a.identificacao AS animal_identificacao
  FROM agenda_sanitaria g
  LEFT JOIN produto_sanitario p ON p.id = g.produto_id
  LEFT JOIN lote l ON l.id = g.lote_id
  LEFT JOIN animal a ON a.id = g.animal_id`;

function paraManejo(l: LinhaManejo): ManejoBase {
  return {
    id: l.id,
    propriedadeId: l.propriedade_id,
    tipo: l.tipo,
    data: l.data,
    produto: referencia(l.produto_id, l.produto_nome),
    descricao: l.descricao,
    dose: l.dose,
    unidadeDose: l.unidade_dose,
    abrangencia: l.abrangencia,
    lote: referencia(l.lote_id, l.lote_nome),
    quantidadeAnimais: l.quantidade_animais,
    carenciaCarneDias: l.carencia_carne_dias,
    carenciaLeiteDias: l.carencia_leite_dias,
    custoTotalCentavos: l.custo_total_centavos,
    responsavel: l.responsavel,
    via: l.via,
    diagnostico: l.diagnostico,
    observacoes: l.observacoes,
    criadoEm: l.created_at,
    atualizadoEm: l.updated_at,
  };
}

function paraAgenda(l: LinhaAgenda): AgendaBase {
  return {
    id: l.id,
    propriedadeId: l.propriedade_id,
    dataPrevista: l.data_prevista,
    tipo: l.tipo,
    produto: referencia(l.produto_id, l.produto_nome),
    descricao: l.descricao,
    lote: referencia(l.lote_id, l.lote_nome),
    animal:
      l.animal_id && l.animal_identificacao
        ? { id: l.animal_id, identificacao: l.animal_identificacao }
        : null,
    status: l.status,
    manejoOrigemId: l.manejo_origem_id,
    manejoRealizadoId: l.manejo_realizado_id,
    dataConclusao: l.data_conclusao,
    motivoCancelamento: l.motivo_cancelamento,
    observacoes: l.observacoes,
  };
}

export class RepositorioSanidade {
  constructor(private readonly db: ObterConexao) {}

  // -------------------------------------------------------------------------
  // Produtos
  // -------------------------------------------------------------------------

  listarProdutos(): ProdutoSanitario[] {
    const linhas = this.db()
      .prepare(
        `SELECT p.*, (SELECT count(*) FROM manejo_sanitario m
             WHERE m.produto_id = p.id AND m.deleted_at IS NULL) AS usos
         FROM produto_sanitario p WHERE p.deleted_at IS NULL ORDER BY p.nome COLLATE NOCASE`,
      )
      .all() as LinhaProduto[];
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      tipo: l.tipo,
      fabricante: l.fabricante,
      principioAtivo: l.principio_ativo,
      unidadeDose: l.unidade_dose,
      carenciaCarneDias: l.carencia_carne_dias,
      carenciaLeiteDias: l.carencia_leite_dias,
      observacoes: l.observacoes,
      usos: l.usos,
    }));
  }

  obterProduto(id: string): ProdutoSanitario | null {
    return this.listarProdutos().find((p) => p.id === id) ?? null;
  }

  nomeProdutoEmUso(nomeNormalizado: string, excetoId: string | null): boolean {
    return (
      this.db()
        .prepare(
          `SELECT 1 FROM produto_sanitario WHERE nome_normalizado = ? AND deleted_at IS NULL AND id IS NOT ?`,
        )
        .get(nomeNormalizado, excetoId) !== undefined
    );
  }

  /** Registros e agendamentos pendentes que usam o produto. */
  usosDoProduto(id: string): number {
    return (
      this.db()
        .prepare(
          `SELECT
             (SELECT count(*) FROM manejo_sanitario WHERE produto_id = ? AND deleted_at IS NULL) +
             (SELECT count(*) FROM agenda_sanitaria WHERE produto_id = ? AND deleted_at IS NULL
                AND status = 'pendente') AS total`,
        )
        .get(id, id) as { total: number }
    ).total;
  }

  inserirProduto(
    id: string,
    dados: DadosProdutoSanitarioValidados,
    nomeNormalizado: string,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO produto_sanitario (id, nome, nome_normalizado, tipo, fabricante, principio_ativo, unidade_dose,
           carencia_carne_dias, carencia_leite_dias, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        dados.nome,
        nomeNormalizado,
        dados.tipo,
        dados.fabricante,
        dados.principioAtivo,
        dados.unidadeDose,
        dados.carenciaCarneDias,
        dados.carenciaLeiteDias,
        dados.observacoes,
        agora,
        agora,
      );
  }

  atualizarProduto(
    id: string,
    dados: DadosProdutoSanitarioValidados,
    nomeNormalizado: string,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `UPDATE produto_sanitario SET nome = ?, nome_normalizado = ?, tipo = ?, fabricante = ?, principio_ativo = ?,
           unidade_dose = ?, carencia_carne_dias = ?, carencia_leite_dias = ?, observacoes = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        dados.nome,
        nomeNormalizado,
        dados.tipo,
        dados.fabricante,
        dados.principioAtivo,
        dados.unidadeDose,
        dados.carenciaCarneDias,
        dados.carenciaLeiteDias,
        dados.observacoes,
        agora,
        id,
      );
  }

  excluirProdutoLogico(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE produto_sanitario SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
  }

  // -------------------------------------------------------------------------
  // Registros sanitários
  // -------------------------------------------------------------------------

  inserirManejo(
    id: string,
    propriedadeId: string,
    dados: DadosManejoValidados,
    abrangencia: AbrangenciaManejo,
    loteId: string | null,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO manejo_sanitario (id, propriedade_id, tipo, data, produto_id, descricao, dose, unidade_dose, via,
           abrangencia, lote_id, carencia_carne_dias, carencia_leite_dias, responsavel, diagnostico,
           custo_total_centavos, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        propriedadeId,
        dados.tipo,
        dados.data,
        dados.produtoId,
        dados.descricao,
        dados.dose,
        dados.unidadeDose,
        dados.via,
        abrangencia,
        loteId,
        dados.carenciaCarneDias,
        dados.carenciaLeiteDias,
        dados.responsavel,
        dados.diagnostico,
        dados.custoTotalCentavos,
        dados.observacoes,
        agora,
        agora,
      );
  }

  atualizarManejo(id: string, dados: DadosManejoValidados, agora: string): void {
    this.db()
      .prepare(
        `UPDATE manejo_sanitario SET tipo = ?, data = ?, produto_id = ?, descricao = ?, dose = ?, unidade_dose = ?,
           via = ?, carencia_carne_dias = ?, carencia_leite_dias = ?, responsavel = ?, diagnostico = ?,
           custo_total_centavos = ?, observacoes = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        dados.tipo,
        dados.data,
        dados.produtoId,
        dados.descricao,
        dados.dose,
        dados.unidadeDose,
        dados.via,
        dados.carenciaCarneDias,
        dados.carenciaLeiteDias,
        dados.responsavel,
        dados.diagnostico,
        dados.custoTotalCentavos,
        dados.observacoes,
        agora,
        id,
      );
  }

  /** Exclui o registro e os eventos dos animais (exclusão lógica). */
  excluirManejoLogico(id: string, agora: string): void {
    this.db()
      .prepare(
        'UPDATE evento_sanitario SET deleted_at = ?, updated_at = ? WHERE manejo_id = ? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
    this.db()
      .prepare(
        'UPDATE manejo_sanitario SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      )
      .run(agora, agora, id);
  }

  obterManejo(id: string): ManejoBase | null {
    const l = this.db()
      .prepare(`${SELECT_MANEJO} WHERE m.id = ? AND m.deleted_at IS NULL`)
      .get(id) as LinhaManejo | undefined;
    return l ? paraManejo(l) : null;
  }

  listarManejos(c: ConsultaManejos): { itens: ManejoBase[]; total: number } {
    const condicoes = ['m.propriedade_id = ?', 'm.deleted_at IS NULL'];
    const parametros: unknown[] = [c.propriedadeId];
    if (c.tipo) {
      condicoes.push('m.tipo = ?');
      parametros.push(c.tipo);
    }
    if (c.produtoId) {
      condicoes.push('m.produto_id = ?');
      parametros.push(c.produtoId);
    }
    if (c.dataInicial) {
      condicoes.push('m.data >= ?');
      parametros.push(c.dataInicial);
    }
    if (c.dataFinal) {
      condicoes.push('m.data <= ?');
      parametros.push(c.dataFinal);
    }
    if (c.loteId) {
      // Registros feitos para o lote ou que incluem animais que estão nele hoje.
      condicoes.push(
        `(m.lote_id = ? OR EXISTS (SELECT 1 FROM evento_sanitario e JOIN animal a ON a.id = e.animal_id
           WHERE e.manejo_id = m.id AND e.deleted_at IS NULL AND a.lote_id = ?))`,
      );
      parametros.push(c.loteId, c.loteId);
    }
    if (c.animalId) {
      condicoes.push(
        'EXISTS (SELECT 1 FROM evento_sanitario e WHERE e.manejo_id = m.id AND e.deleted_at IS NULL AND e.animal_id = ?)',
      );
      parametros.push(c.animalId);
    }
    const onde = condicoes.join(' AND ');
    const total = (
      this.db()
        .prepare(`SELECT count(*) AS total FROM manejo_sanitario m WHERE ${onde}`)
        .get(...parametros) as { total: number }
    ).total;
    const linhas = this.db()
      .prepare(
        `${SELECT_MANEJO} WHERE ${onde} ORDER BY m.data DESC, m.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...parametros, c.tamanhoPagina, (c.pagina - 1) * c.tamanhoPagina) as LinhaManejo[];
    return { itens: linhas.map(paraManejo), total };
  }

  inserirEvento(
    id: string,
    manejoId: string,
    animalId: string,
    dose: number | null,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO evento_sanitario (id, manejo_id, animal_id, dose, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, manejoId, animalId, dose, agora, agora);
  }

  removerEventoLogico(manejoId: string, animalId: string, agora: string): void {
    this.db()
      .prepare(
        `UPDATE evento_sanitario SET deleted_at = ?, updated_at = ?
         WHERE manejo_id = ? AND animal_id = ? AND deleted_at IS NULL`,
      )
      .run(agora, agora, manejoId, animalId);
  }

  listarAnimaisDoManejo(manejoId: string): AnimalDoManejo[] {
    const linhas = this.db()
      .prepare(
        `SELECT e.id, e.animal_id, a.identificacao, a.nome, e.dose, e.observacao
         FROM evento_sanitario e JOIN animal a ON a.id = e.animal_id
         WHERE e.manejo_id = ? AND e.deleted_at IS NULL
         ORDER BY a.identificacao_normalizada`,
      )
      .all(manejoId) as {
      id: string;
      animal_id: string;
      identificacao: string;
      nome: string | null;
      dose: number | null;
      observacao: string | null;
    }[];
    return linhas.map((l) => ({
      eventoId: l.id,
      animalId: l.animal_id,
      identificacao: l.identificacao,
      nome: l.nome,
      dose: l.dose,
      observacao: l.observacao,
    }));
  }

  /** Registros sanitários em que o animal aparece ou apareceu (inclui removidos e excluídos). */
  manejosDoAnimal(animalId: string): string[] {
    return (
      this.db()
        .prepare('SELECT DISTINCT manejo_id FROM evento_sanitario WHERE animal_id = ?')
        .all(animalId) as { manejo_id: string }[]
    ).map((l) => l.manejo_id);
  }

  /** Eventos sanitários não excluídos de um animal, do mais recente ao mais antigo. */
  listarEventosDoAnimal(animalId: string): EventoDoAnimalBase[] {
    const linhas = this.db()
      .prepare(
        `SELECT e.id AS evento_id, e.dose AS dose_individual, e.observacao AS observacao_evento, m.*,
           p.nome AS produto_nome, l.nome AS lote_nome
         FROM evento_sanitario e
         JOIN manejo_sanitario m ON m.id = e.manejo_id
         LEFT JOIN produto_sanitario p ON p.id = m.produto_id
         LEFT JOIN lote l ON l.id = m.lote_id
         WHERE e.animal_id = ? AND e.deleted_at IS NULL AND m.deleted_at IS NULL
         ORDER BY m.data DESC, m.created_at DESC`,
      )
      .all(animalId) as (LinhaManejo & {
      evento_id: string;
      dose_individual: number | null;
      observacao_evento: string | null;
    })[];
    return linhas.map((l) => ({
      eventoId: l.evento_id,
      manejoId: l.id,
      tipo: l.tipo,
      data: l.data,
      produto: referencia(l.produto_id, l.produto_nome),
      descricao: l.descricao,
      dose: l.dose_individual ?? l.dose,
      unidadeDose: l.unidade_dose,
      via: l.via,
      abrangencia: l.abrangencia,
      lote: referencia(l.lote_id, l.lote_nome),
      carenciaCarneDias: l.carencia_carne_dias,
      carenciaLeiteDias: l.carencia_leite_dias,
      responsavel: l.responsavel,
      diagnostico: l.diagnostico,
      observacao: l.observacao_evento,
      registradoEm: l.created_at,
    }));
  }

  /**
   * Aplicações com carência informada em animais ativos da propriedade, a
   * partir de `desde`. O serviço decide quais ainda estão em curso.
   */
  listarCarencias(propriedadeId: string, desde: string): CarenciaRegistrada[] {
    const linhas = this.db()
      .prepare(
        `SELECT a.id AS animal_id, a.identificacao, a.nome, a.lote_id, la.nome AS lote_nome,
           m.id AS manejo_id, m.data, coalesce(p.nome, m.descricao) AS produto,
           m.carencia_carne_dias, m.carencia_leite_dias
         FROM evento_sanitario e
         JOIN manejo_sanitario m ON m.id = e.manejo_id
         JOIN animal a ON a.id = e.animal_id
         LEFT JOIN lote la ON la.id = a.lote_id
         LEFT JOIN produto_sanitario p ON p.id = m.produto_id
         WHERE m.propriedade_id = ? AND e.deleted_at IS NULL AND m.deleted_at IS NULL
           AND a.deleted_at IS NULL AND a.status = 'ativo' AND m.data >= ?
           AND (coalesce(m.carencia_carne_dias, 0) > 0 OR coalesce(m.carencia_leite_dias, 0) > 0)
         ORDER BY a.identificacao_normalizada, m.data`,
      )
      .all(propriedadeId, desde) as {
      animal_id: string;
      identificacao: string;
      nome: string | null;
      lote_id: string | null;
      lote_nome: string | null;
      manejo_id: string;
      data: string;
      produto: string;
      carencia_carne_dias: number | null;
      carencia_leite_dias: number | null;
    }[];
    return linhas.map((l) => ({
      animalId: l.animal_id,
      identificacao: l.identificacao,
      nome: l.nome,
      lote: referencia(l.lote_id, l.lote_nome),
      manejoId: l.manejo_id,
      data: l.data,
      produto: l.produto,
      carenciaCarneDias: l.carencia_carne_dias,
      carenciaLeiteDias: l.carencia_leite_dias,
    }));
  }

  // -------------------------------------------------------------------------
  // Agenda
  // -------------------------------------------------------------------------

  inserirAgenda(
    id: string,
    propriedadeId: string,
    dados: DadosAgendaValidados,
    manejoOrigemId: string | null,
    agora: string,
  ): void {
    this.db()
      .prepare(
        `INSERT INTO agenda_sanitaria (id, propriedade_id, data_prevista, tipo, produto_id, descricao, lote_id,
           animal_id, manejo_origem_id, status, observacoes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`,
      )
      .run(
        id,
        propriedadeId,
        dados.dataPrevista,
        dados.tipo,
        dados.produtoId,
        dados.descricao,
        dados.loteId,
        dados.animalId,
        manejoOrigemId,
        dados.observacoes,
        agora,
        agora,
      );
  }

  atualizarAgenda(id: string, dados: DadosAgendaValidados, agora: string): void {
    this.db()
      .prepare(
        `UPDATE agenda_sanitaria SET data_prevista = ?, tipo = ?, produto_id = ?, descricao = ?, lote_id = ?,
           animal_id = ?, observacoes = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(
        dados.dataPrevista,
        dados.tipo,
        dados.produtoId,
        dados.descricao,
        dados.loteId,
        dados.animalId,
        dados.observacoes,
        agora,
        id,
      );
  }

  concluirAgenda(id: string, manejoId: string, data: string, agora: string): void {
    this.db()
      .prepare(
        `UPDATE agenda_sanitaria SET status = 'realizado', manejo_realizado_id = ?, data_conclusao = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(manejoId, data, agora, id);
  }

  cancelarAgenda(id: string, motivo: string, data: string, agora: string): void {
    this.db()
      .prepare(
        `UPDATE agenda_sanitaria SET status = 'cancelado', motivo_cancelamento = ?, data_conclusao = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(motivo, data, agora, id);
  }

  /** Volta a pendente: o registro que realizou o evento foi excluído. */
  reabrirAgendaDoManejo(manejoId: string, agora: string): string[] {
    const ids = (
      this.db()
        .prepare(
          `SELECT id FROM agenda_sanitaria WHERE manejo_realizado_id = ? AND deleted_at IS NULL AND status = 'realizado'`,
        )
        .all(manejoId) as { id: string }[]
    ).map((l) => l.id);
    this.db()
      .prepare(
        `UPDATE agenda_sanitaria SET status = 'pendente', manejo_realizado_id = NULL, data_conclusao = NULL,
           updated_at = ? WHERE manejo_realizado_id = ? AND deleted_at IS NULL AND status = 'realizado'`,
      )
      .run(agora, manejoId);
    return ids;
  }

  obterAgenda(id: string): AgendaBase | null {
    const l = this.db()
      .prepare(`${SELECT_AGENDA} WHERE g.id = ? AND g.deleted_at IS NULL`)
      .get(id) as LinhaAgenda | undefined;
    return l ? paraAgenda(l) : null;
  }

  listarAgenda(propriedadeId: string, incluirConcluidos: boolean): AgendaBase[] {
    const linhas = this.db()
      .prepare(
        `${SELECT_AGENDA} WHERE g.propriedade_id = ? AND g.deleted_at IS NULL
           ${incluirConcluidos ? '' : "AND g.status = 'pendente'"}
         ORDER BY g.status = 'pendente' DESC, g.data_prevista, g.created_at`,
      )
      .all(propriedadeId) as LinhaAgenda[];
    return linhas.map(paraAgenda);
  }

  /** Agendamento pendente criado a partir de um registro ("próxima aplicação"). */
  agendaGeradaPor(manejoId: string): AgendaBase | null {
    const l = this.db()
      .prepare(
        `${SELECT_AGENDA} WHERE g.manejo_origem_id = ? AND g.deleted_at IS NULL ORDER BY g.created_at DESC LIMIT 1`,
      )
      .get(manejoId) as LinhaAgenda | undefined;
    return l ? paraAgenda(l) : null;
  }

  /** Pendências para o animal ou para o lote em que ele está. */
  agendaPendenteDoAnimal(animalId: string, loteId: string | null): AgendaBase[] {
    const linhas = this.db()
      .prepare(
        `${SELECT_AGENDA} WHERE g.deleted_at IS NULL AND g.status = 'pendente'
           AND (g.animal_id = ? OR (g.lote_id IS NOT NULL AND g.lote_id = ?))
         ORDER BY g.data_prevista`,
      )
      .all(animalId, loteId) as LinhaAgenda[];
    return linhas.map(paraAgenda);
  }
}
