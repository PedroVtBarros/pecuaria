import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { abrirConexao, lerVersaoSchema, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';

const AGORA = '2026-10-15T12:00:00.000Z';
const ID_PROP = '01a13f6e-0000-7000-8000-000000000001';
const ID_ANIMAL = '01a13f6e-0000-7000-8000-000000000002';
const ID_PESAGEM = '01a13f6e-0000-7000-8000-000000000003';

function inserirDadosDaVersao2(db: Conexao): void {
  db.prepare(
    `INSERT INTO propriedade (id, nome, nome_normalizado, tipo_exploracao, created_at, updated_at)
     VALUES (?, 'Fazenda', 'fazenda', 'corte', ?, ?)`,
  ).run(ID_PROP, AGORA, AGORA);
  db.prepare(
    `INSERT INTO animal (id, propriedade_id, identificacao, identificacao_normalizada, sexo, condicao_sexual,
       categoria, aptidao, origem, data_entrada, created_at, updated_at)
     VALUES (?, ?, 'A1', 'A1', 'F', 'femea', 'vaca', 'corte', 'comprado', '2026-01-01', ?, ?)`,
  ).run(ID_ANIMAL, ID_PROP, AGORA, AGORA);
  db.prepare(
    `INSERT INTO pesagem (id, animal_id, data, peso_vivo_kg, metodo, created_at, updated_at)
     VALUES (?, ?, '2026-01-01', 400, 'balanca', ?, ?)`,
  ).run(ID_PESAGEM, ID_ANIMAL, AGORA, AGORA);
  for (const [id, acao] of [
    ['h1', 'criacao'],
    ['h2', 'alteracao'],
  ] as const) {
    db.prepare(
      `INSERT INTO historico_alteracao (id, entidade, entidade_id, acao, dados_novos_json, motivo, ocorrido_em)
       VALUES (?, 'animal', ?, ?, '{"nome":"x"}', 'teste', ?)`,
    ).run(id, ID_ANIMAL, acao, AGORA);
  }
}

describe('migration 0003 (sanidade e manejo)', () => {
  let pasta: ReturnType<typeof criarPastaTemporaria>;
  let db: Conexao;

  beforeEach(() => {
    pasta = criarPastaTemporaria();
    db = abrirConexao(join(pasta.caminho, 'teste.db'));
  });

  afterEach(() => {
    if (db.open) db.close();
    pasta.limpar();
  });

  it('atualiza um banco da versão 2 sem perder pesagens nem a trilha de alterações', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, 2));
    inserirDadosDaVersao2(db);
    expect(lerVersaoSchema(db)).toBe(2);

    const r = await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, 3));
    expect(r.aplicadas.map((m) => m.nome)).toEqual(['sanidade_e_manejo']);
    expect(lerVersaoSchema(db)).toBe(3);

    expect(db.prepare('SELECT * FROM pesagem').get()).toMatchObject({
      id: ID_PESAGEM,
      peso_vivo_kg: 400,
      escore_corporal: null,
      escala_ecc: null,
      conferida_em: null,
    });
    expect(
      db.prepare('SELECT id, acao, motivo FROM historico_alteracao ORDER BY id').all(),
    ).toEqual([
      { id: 'h1', acao: 'criacao', motivo: 'teste' },
      { id: 'h2', acao: 'alteracao', motivo: 'teste' },
    ]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('a trilha recriada continua só de inserção, aceita as novas entidades e confere o formato (o catálogo é do repositório, D-I)', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    db.prepare(
      `INSERT INTO historico_alteracao (id, entidade, entidade_id, acao, ocorrido_em)
       VALUES ('h1', 'manejo_sanitario', 'x', 'remocao_animal', ?)`,
    ).run(AGORA);
    expect(() => db.prepare("UPDATE historico_alteracao SET motivo = 'x'").run()).toThrow(
      /não pode ser modificada/,
    );
    expect(() => db.prepare('DELETE FROM historico_alteracao').run()).toThrow(
      /não pode ser apagada/,
    );
    expect(() =>
      db
        .prepare(
          `INSERT INTO historico_alteracao (id, entidade, entidade_id, acao, ocorrido_em)
           VALUES ('h2', 'Entidade Inválida', 'x', 'criacao', ?)`,
        )
        .run(AGORA),
    ).toThrow(/CHECK/);
  });

  it('escore corporal precisa da escala e caber nela; conferência precisa de justificativa', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, 2));
    inserirDadosDaVersao2(db);
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    const alterar = (sql: string) => () => db.prepare(sql).run(ID_PESAGEM);
    expect(alterar('UPDATE pesagem SET escore_corporal = 3 WHERE id = ?')).toThrow(/inconsistente/);
    expect(
      alterar("UPDATE pesagem SET escore_corporal = 6, escala_ecc = '1_5' WHERE id = ?"),
    ).toThrow(/inconsistente/);
    expect(
      alterar("UPDATE pesagem SET escore_corporal = 6, escala_ecc = '1_9' WHERE id = ?"),
    ).not.toThrow();
    expect(alterar(`UPDATE pesagem SET conferida_em = '${AGORA}' WHERE id = ?`)).toThrow(
      /inconsistente/,
    );
    expect(
      alterar(
        `UPDATE pesagem SET conferida_em = '${AGORA}', justificativa_conferencia = 'ok' WHERE id = ?`,
      ),
    ).not.toThrow();
  });

  it('registros sanitários: exclusão física proibida e coerência básica no banco', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, 2));
    inserirDadosDaVersao2(db);
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    const inserirManejo = (id: string, produto: string | null, descricao: string | null) =>
      db
        .prepare(
          `INSERT INTO manejo_sanitario (id, propriedade_id, tipo, data, produto_id, descricao, abrangencia,
             created_at, updated_at) VALUES (?, ?, 'exame', '2026-02-01', ?, ?, 'individual', ?, ?)`,
        )
        .run(id, ID_PROP, produto, descricao, AGORA, AGORA);
    expect(() => inserirManejo('m0', null, null)).toThrow(/CHECK/);
    inserirManejo('m1', null, 'Exame de brucelose');
    db.prepare(
      `INSERT INTO evento_sanitario (id, manejo_id, animal_id, created_at, updated_at)
       VALUES ('e1', 'm1', ?, ?, ?)`,
    ).run(ID_ANIMAL, AGORA, AGORA);
    expect(() =>
      db
        .prepare(
          `INSERT INTO evento_sanitario (id, manejo_id, animal_id, created_at, updated_at)
           VALUES ('e2', 'm1', ?, ?, ?)`,
        )
        .run(ID_ANIMAL, AGORA, AGORA),
    ).toThrow(/UNIQUE/);
    db.prepare(
      `INSERT INTO produto_sanitario (id, nome, nome_normalizado, tipo, created_at, updated_at)
       VALUES ('p1', 'Produto', 'produto', 'outro', ?, ?)`,
    ).run(AGORA, AGORA);
    db.prepare(
      `INSERT INTO agenda_sanitaria (id, propriedade_id, data_prevista, tipo, descricao, created_at, updated_at)
       VALUES ('g1', ?, '2026-11-01', 'exame', 'Exame', ?, ?)`,
    ).run(ID_PROP, AGORA, AGORA);
    for (const tabela of [
      'manejo_sanitario',
      'evento_sanitario',
      'produto_sanitario',
      'agenda_sanitaria',
    ]) {
      expect(() => db.prepare(`DELETE FROM ${tabela}`).run()).toThrow(/Exclusão física proibida/);
    }
    // Dose sem unidade é recusada.
    expect(() => db.prepare(`UPDATE manejo_sanitario SET dose = 5 WHERE id = 'm1'`).run()).toThrow(
      /CHECK/,
    );
  });

  it('agenda: status coerente com a conclusão', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, 2));
    inserirDadosDaVersao2(db);
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    db.prepare(
      `INSERT INTO agenda_sanitaria (id, propriedade_id, data_prevista, tipo, descricao, created_at, updated_at)
       VALUES ('g1', ?, '2026-11-01', 'vacinacao', 'Reforço', ?, ?)`,
    ).run(ID_PROP, AGORA, AGORA);
    expect(() =>
      db.prepare("UPDATE agenda_sanitaria SET status = 'realizado' WHERE id = 'g1'").run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          "UPDATE agenda_sanitaria SET status = 'cancelado', data_conclusao = '2026-10-15' WHERE id = 'g1'",
        )
        .run(),
    ).not.toThrow();
  });
});
