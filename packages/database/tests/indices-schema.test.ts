import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';

let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  pasta?.limpar();
});
const agora = '2026-10-16T12:00:00.000Z';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
/** A 0010 é testada até a sua versão: migrations posteriores têm testes próprios. */
const ATE_10 = MIGRACOES_DO_PROJETO.slice(0, 10);

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'indices.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}
const indice = (b: Conexao, nome: string) =>
  b.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(nome) as
    { sql: string } | undefined;

describe('migration 0010: índices de desempenho', () => {
  it('aplica do zero, cria os dois índices e reaplica sem efeito', async () => {
    const b = await abrir(10);
    expect(b.pragma('user_version', { simple: true })).toBe(10);
    expect(indice(b, 'ix_estoque_mov_substitui')?.sql).toMatch(/substitui_id IS NOT NULL/);
    expect(indice(b, 'ix_rateio_item_rateio')).toBeDefined();
    expect((await aplicarMigracoes(b, ATE_10)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('migra a versão 9 sem tocar nos dados e a consulta pela cadeia passa a usar o índice', async () => {
    const b = await abrir(9);
    b.prepare(
      "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Fazenda','fazenda','misto',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES('i','p','Ração','racao','racao','kg','mn',0,?,?)",
    ).run(agora, agora);
    const antes = ['propriedade', 'estoque_item', 'movimentacao_estoque'].map((t) =>
      hash(linhas(b, t)),
    );
    expect((await aplicarMigracoes(b, ATE_10)).aplicadas.map((m) => m.nome)).toEqual([
      'indices_desempenho',
    ]);
    expect(
      ['propriedade', 'estoque_item', 'movimentacao_estoque'].map((t) => hash(linhas(b, t))),
    ).toEqual(antes);
    const plano = b
      .prepare('EXPLAIN QUERY PLAN SELECT id FROM movimentacao_estoque WHERE substitui_id = ?')
      .all('x') as { detail: string }[];
    expect(plano.map((p) => p.detail).join(' ')).toMatch(/ix_estoque_mov_substitui/);
  });

  it('a falha no passo final desfaz a migration', async () => {
    const b = await abrir(9);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 9),
      {
        ...MIGRACOES_DO_PROJETO[9]!,
        sql: `${MIGRACOES_DO_PROJETO[9]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(9);
    expect(indice(b, 'ix_estoque_mov_substitui')).toBeUndefined();
  });
});
