import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { normalizarNome } from '@pecuaria/domain';
import { abrirConexao, lerVersaoSchema, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { RepositorioConfiguracao } from '../src/repositorios/repositorio-configuracao';
import { criarPastaTemporaria } from './apoio';

const AGORA = '2026-10-15T12:00:00.000Z';
const ID_PROP = '01a13f6e-0000-7000-8000-000000000001';
const ID_ANIMAL = '01a13f6e-0000-7000-8000-000000000002';

function inserirPropriedadeEAnimal(db: Conexao): void {
  db.prepare(
    `INSERT INTO propriedade (id, nome, nome_normalizado, tipo_exploracao, created_at, updated_at)
     VALUES (?, 'Fazenda', 'fazenda', 'corte', ?, ?)`,
  ).run(ID_PROP, AGORA, AGORA);
  db.prepare(
    `INSERT INTO animal (id, propriedade_id, identificacao, identificacao_normalizada, sexo, condicao_sexual,
       categoria, aptidao, origem, data_entrada, created_at, updated_at)
     VALUES (?, ?, 'br 1', 'BR 1', 'F', 'femea', 'vaca', 'corte', 'comprado', '2026-01-01', ?, ?)`,
  ).run(ID_ANIMAL, ID_PROP, AGORA, AGORA);
}

describe('schema do rebanho (migration 0002)', () => {
  let pasta: ReturnType<typeof criarPastaTemporaria>;
  let db: Conexao;

  beforeEach(async () => {
    pasta = criarPastaTemporaria();
    db = abrirConexao(join(pasta.caminho, 'teste.db'));
  });

  afterEach(() => {
    if (db.open) db.close();
    pasta.limpar();
  });

  it('atualiza um banco da versão 1 mantendo as configurações já gravadas', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, 1));
    new RepositorioConfiguracao(() => db).definir('interface.tema', 'escuro');
    expect(lerVersaoSchema(db)).toBe(1);

    const r = await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, 2));
    expect(r.aplicadas.map((m) => m.nome)).toEqual(['rebanho']);
    expect(new RepositorioConfiguracao(() => db).obter('interface.tema')).toBe('escuro');
  });

  it('traz as raças sugeridas com nome normalizado igual ao do núcleo', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    const racas = db.prepare('SELECT nome, nome_normalizado, origem FROM raca').all() as {
      nome: string;
      nome_normalizado: string;
      origem: string;
    }[];
    expect(racas.length).toBeGreaterThan(10);
    for (const r of racas) {
      expect(r.nome_normalizado).toBe(normalizarNome(r.nome));
      expect(r.origem).toBe('sugestao');
    }
  });

  it('proíbe exclusão física de animais e pesagens', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    inserirPropriedadeEAnimal(db);
    expect(() => db.prepare('DELETE FROM animal WHERE id = ?').run(ID_ANIMAL)).toThrow(
      /Exclusão física proibida/,
    );
    expect(() => db.prepare('DELETE FROM propriedade').run()).toThrow(/Exclusão física proibida/);
  });

  it('a trilha de alterações não aceita alteração nem exclusão', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    db.prepare(
      `INSERT INTO historico_alteracao (id, entidade, entidade_id, acao, ocorrido_em)
       VALUES ('h1', 'animal', 'x', 'criacao', ?)`,
    ).run(AGORA);
    expect(() => db.prepare("UPDATE historico_alteracao SET motivo = 'x'").run()).toThrow(
      /não pode ser modificada/,
    );
    expect(() => db.prepare('DELETE FROM historico_alteracao').run()).toThrow(
      /não pode ser apagada/,
    );
  });

  it('identificação é única por propriedade entre animais não excluídos', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    inserirPropriedadeEAnimal(db);
    const inserirDuplicado = () =>
      db
        .prepare(
          `INSERT INTO animal (id, propriedade_id, identificacao, identificacao_normalizada, sexo, condicao_sexual,
             categoria, aptidao, origem, data_entrada, created_at, updated_at)
           VALUES ('01a13f6e-0000-7000-8000-000000000003', ?, 'BR 1', 'BR 1', 'F', 'femea', 'vaca', 'corte',
             'comprado', '2026-01-01', ?, ?)`,
        )
        .run(ID_PROP, AGORA, AGORA);
    expect(inserirDuplicado).toThrow(/UNIQUE/);
    db.prepare('UPDATE animal SET deleted_at = ? WHERE id = ?').run(AGORA, ID_ANIMAL);
    expect(inserirDuplicado).not.toThrow();
  });

  it('uma pesagem por animal por data e peso positivo', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    inserirPropriedadeEAnimal(db);
    const pesar = (id: string, peso: number) =>
      db
        .prepare(
          `INSERT INTO pesagem (id, animal_id, data, peso_vivo_kg, metodo, created_at, updated_at)
           VALUES (?, ?, '2026-02-01', ?, 'balanca', ?, ?)`,
        )
        .run(id, ID_ANIMAL, peso, AGORA, AGORA);
    pesar('p1', 400);
    expect(() => pesar('p2', 401)).toThrow(/UNIQUE/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO pesagem (id, animal_id, data, peso_vivo_kg, metodo, created_at, updated_at)
           VALUES ('p3', ?, '2026-02-02', 0, 'balanca', ?, ?)`,
        )
        .run(ID_ANIMAL, AGORA, AGORA),
    ).toThrow(/CHECK/);
  });

  it('o banco recusa sexo incoerente com a condição sexual', async () => {
    await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
    inserirPropriedadeEAnimal(db);
    expect(() =>
      db.prepare("UPDATE animal SET condicao_sexual = 'castrado' WHERE id = ?").run(ID_ANIMAL),
    ).toThrow(/CHECK/);
  });
});
