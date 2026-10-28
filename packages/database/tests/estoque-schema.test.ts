import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';
// A 0004 é testada como a última migration: as seguintes têm testes próprios.
const ATE_4 = MIGRACOES_DO_PROJETO.slice(0, 4);
let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  pasta?.limpar();
});
async function abrir(versao: number) {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'estoque.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}
const agora = '2026-10-16T12:00:00.000Z';
function base(b: Conexao) {
  b.prepare(
    "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Teste','teste','corte',?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES('i','p','Silagem','silagem','silagem','kg','mn',0,?,?)",
  ).run(agora, agora);
}
describe('migration 0004: estoque', () => {
  it('aplica do zero, reaplica sem efeito e mantém integridade', async () => {
    const b = await abrir(4);
    base(b);
    expect(b.pragma('user_version', { simple: true })).toBe(4);
    expect((await aplicarMigracoes(b, ATE_4)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });
  it('migra versão 3 preservando propriedade, produto sanitário e trilha', async () => {
    const b = await abrir(3);
    b.prepare(
      "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Existente','existente','corte',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO produto_sanitario(id,nome,nome_normalizado,tipo,created_at,updated_at) VALUES('s','Produto','produto','outro',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO historico_alteracao(id,entidade,entidade_id,acao,dados_novos_json,ocorrido_em) VALUES('h','produto_sanitario','s','criacao','{\"nome\":\"Produto\"}',?)",
    ).run(agora);
    b.prepare(
      "INSERT INTO lote(id,propriedade_id,nome,nome_normalizado,finalidade,data_formacao,created_at,updated_at) VALUES('l','p','Recria','recria','recria','2026-01-01',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO animal(id,propriedade_id,lote_id,identificacao,identificacao_normalizada,sexo,condicao_sexual,categoria,aptidao,origem,data_entrada,created_at,updated_at) VALUES('a','p','l','A-1','a-1','M','castrado','garrote','corte','comprado','2026-01-01',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO pesagem(id,animal_id,data,peso_vivo_kg,metodo,escore_corporal,escala_ecc,created_at,updated_at) VALUES('ps','a','2026-09-01',300,'balanca',3,'1_5',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO manejo_sanitario(id,propriedade_id,tipo,data,produto_id,abrangencia,created_at,updated_at) VALUES('ms','p','tratamento','2026-10-01','s','individual',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO evento_sanitario(id,manejo_id,animal_id,created_at,updated_at) VALUES('es','ms','a',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO agenda_sanitaria(id,propriedade_id,data_prevista,tipo,produto_id,manejo_origem_id,created_at,updated_at) VALUES('ag','p','2026-10-20','tratamento','s','ms',?,?)",
    ).run(agora, agora);
    const tabelas = [
      'propriedade',
      'lote',
      'animal',
      'pesagem',
      'produto_sanitario',
      'manejo_sanitario',
      'evento_sanitario',
      'agenda_sanitaria',
      'historico_alteracao',
    ];
    const snapshots = tabelas.map((t) => b.prepare('SELECT * FROM ' + t).all());
    const antes = b.prepare('SELECT * FROM historico_alteracao').all();
    expect((await aplicarMigracoes(b, ATE_4)).aplicadas.map((x) => x.nome)).toEqual(['estoque']);
    expect(b.prepare('SELECT * FROM historico_alteracao').all()).toEqual(antes);
    for (const [i, t] of tabelas.entries())
      expect(b.prepare('SELECT * FROM ' + t).all()).toEqual(snapshots[i]);
    expect(b.prepare('SELECT * FROM movimentacao_estoque').all()).toEqual([]);
    expect(b.prepare('SELECT COUNT(*) AS n FROM produto_sanitario').get()).toEqual({ n: 1 });
    expect(() => b.prepare("UPDATE historico_alteracao SET motivo = 'x'").run()).toThrow(
      /não pode/,
    );
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });
  it('protege unidades, quantidades, moeda, vínculos e exclusão física', async () => {
    const b = await abrir(4);
    base(b);
    const sql =
      "INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_entrada_centavos,requisicao_id,created_at,updated_at) VALUES(?,'i','2026-10-01',?,'entrada_producao',?,?,?, ?,?,?)";
    expect(() => b.prepare(sql).run('m0', 1, 0, 'kg', null, 'r0', agora, agora)).toThrow();
    expect(() => b.prepare(sql).run('m1', 1, 1000, 'l', null, 'r1', agora, agora)).toThrow(
      /incompatível/,
    );
    expect(() => b.prepare(sql).run('m2', 1, 1000, 'kg', 1.5, 'r2', agora, agora)).toThrow();
    b.prepare(sql).run('m3', 1, 1000, 'kg', null, 'r3', agora, agora);
    expect(() =>
      b.prepare('UPDATE movimentacao_estoque SET quantidade_milesimos = 2000').run(),
    ).toThrow(/substituição/);
    for (const t of ['estoque_item', 'estoque_lote', 'movimentacao_estoque']) {
      if (t === 'estoque_lote')
        b.prepare(
          "INSERT INTO estoque_lote(id,estoque_item_id,codigo,codigo_normalizado,created_at,updated_at) VALUES('l','i','L','l',?,?)",
        ).run(agora, agora);
      expect(() => b.prepare(`DELETE FROM ${t}`).run()).toThrow(/física proibida/);
    }
  });
});
