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
const agora = '2026-10-18T12:00:00.000Z';
/** A 0011 é testada até a sua versão: migrations posteriores têm testes próprios. */
const ATE_11 = MIGRACOES_DO_PROJETO.slice(0, 11);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
const TABELAS_ANTIGAS = [
  'propriedade',
  'animal',
  'movimentacao_animal',
  'categoria_financeira',
  'lancamento_financeiro',
  'parcela_financeira',
  'negociacao_animal',
  'negociacao_animal_item',
];

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'devolucao.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}

/** Venda de a1 (versão 10), com lançamento, parcela e item; mais uma categoria do usuário. */
function popular(b: Conexao, comCategoriaDoUsuario = true) {
  b.prepare(
    "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Fazenda','fazenda','misto',?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO animal(id,propriedade_id,identificacao,identificacao_normalizada,sexo,condicao_sexual,categoria,aptidao,origem,data_entrada,status,data_saida,created_at,updated_at) VALUES('a1','p','A1','a1','M','castrado','garrote','corte','comprado','2026-01-01','vendido','2026-10-01',?,?)",
  ).run(agora, agora);
  for (const [id, tipo] of [
    ['m1', 'entrada'],
    ['m2', 'saida'],
  ] as const)
    b.prepare(
      "INSERT INTO movimentacao_animal(id,animal_id,tipo,data,created_at,updated_at) VALUES(?,'a1',?,?,?,?)",
    ).run(id, tipo, tipo === 'entrada' ? '2026-01-01' : '2026-10-01', agora, agora);
  // Categoria do usuário com o mesmo nome da categoria que a 0011 cria.
  if (comCategoriaDoUsuario)
    b.prepare(
      "INSERT INTO categoria_financeira(id,nome,nome_normalizado,natureza,grupo,tratamento,comportamento_custo,origem,ativa,created_at,updated_at) VALUES('cu','Devolução de venda de animais','devolucao de venda de animais','despesa','outros','resultado','nao_classificado','usuario',1,?,?)",
    ).run(agora, agora);
  const receita = (
    b
      .prepare(
        "SELECT id FROM categoria_financeira WHERE natureza = 'receita' AND origem_exigida = 'negociacao_animal' ORDER BY id",
      )
      .get() as { id: string }
  ).id;
  b.prepare(
    `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,condicao_pagamento,comportamento_custo,origem_tipo,origem_id,requisicao_id,created_at,updated_at)
     VALUES('lv','p',?,'receita','2026-10-01',150000,'Venda','corte','nenhum','a_vista','nao_se_aplica','negociacao_animal','nv','rq-lv',?,?)`,
  ).run(receita, agora, agora);
  b.prepare(
    "INSERT INTO parcela_financeira(id,lancamento_id,numero,vencimento,valor_centavos,created_at,updated_at) VALUES('pv','lv',1,'2026-10-20',150000,?,?)",
  ).run(agora, agora);
  b.prepare(
    `INSERT INTO negociacao_animal(id,propriedade_id,tipo,data,lancamento_id,valor_total_centavos,criterio_alocacao,unidade_preco,requisicao_id,created_at,updated_at)
     VALUES('nv','p','venda','2026-10-01','lv',150000,'igual','total','rq-nv',?,?)`,
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO negociacao_animal_item(id,negociacao_id,tipo,animal_id,movimentacao_animal_id,valor_alocado_centavos,created_at,updated_at) VALUES('iv','nv','venda','a1','m2',150000,?,?)",
  ).run(agora, agora);
}

/** Devolução de a1 (retorno m3), com lançamento de devolução e compensação total. */
function devolver(b: Conexao) {
  b.prepare(
    "INSERT INTO movimentacao_animal(id,animal_id,tipo,data,created_at,updated_at) VALUES('m3','a1','entrada','2026-10-05',?,?)",
  ).run(agora, agora);
  b.prepare(
    `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,tipo,lancamento_origem_id,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,condicao_pagamento,comportamento_custo,origem_tipo,origem_id,requisicao_id,created_at,updated_at)
     VALUES('ld','p','01929c10-0000-7000-8000-000000000010','despesa','devolucao','lv','2026-10-05',150000,'Devolução','corte','nenhum','a_vista','nao_classificado','negociacao_animal','dv','rq-ld',?,?)`,
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO parcela_financeira(id,lancamento_id,numero,vencimento,valor_centavos,created_at,updated_at) VALUES('pd','ld',1,'2026-10-05',150000,?,?)",
  ).run(agora, agora);
  b.prepare(
    `INSERT INTO devolucao_animal(id,propriedade_id,tipo,negociacao_id,data,lancamento_id,valor_total_centavos,requisicao_id,created_at,updated_at)
     VALUES('dv','p','venda','nv','2026-10-05','ld',150000,'rq-dv',?,?)`,
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO devolucao_animal_item(id,devolucao_id,negociacao_item_id,animal_id,movimentacao_animal_id,valor_centavos,created_at,updated_at) VALUES('di','dv','iv','a1','m3',150000,?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO compensacao_financeira(id,devolucao_id,parcela_origem_id,parcela_devolucao_id,data,valor_centavos,created_at,updated_at) VALUES('k','dv','pv','pd','2026-10-05',150000,?,?)",
  ).run(agora, agora);
}

describe('migration 0011: devolução de animais', () => {
  it('aplica do zero, reaplica sem efeito e mantém a integridade', async () => {
    const b = await abrir(11);
    expect(b.pragma('user_version', { simple: true })).toBe(11);
    expect((await aplicarMigracoes(b, ATE_11)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    for (const t of ['devolucao_animal', 'devolucao_animal_item', 'compensacao_financeira'])
      expect(linhas(b, t)).toEqual([]);
    const nomes = b
      .prepare(
        "SELECT nome FROM categoria_financeira WHERE id IN ('01929c10-0000-7000-8000-000000000010','01929c10-0000-7000-8000-000000000011') ORDER BY id",
      )
      .all() as { nome: string }[];
    expect(nomes.map((n) => n.nome)).toEqual([
      'Devolução de venda de animais',
      'Devolução de compra de animais',
    ]);
  });

  it('migra a versão 10 com dados sem tocar em nada; categoria de mesmo nome do usuário não trava', async () => {
    const b = await abrir(10);
    popular(b);
    const antes = TABELAS_ANTIGAS.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_11)).aplicadas.map((m) => m.nome)).toEqual([
      'devolucao_animais',
    ]);
    // As tabelas antigas ficam iguais, exceto pelas duas categorias novas no fim.
    const categorias = linhas(b, 'categoria_financeira');
    expect(hash(categorias.slice(0, -2))).toBe(antes[3]);
    TABELAS_ANTIGAS.forEach((t, i) => {
      if (t !== 'categoria_financeira') expect(hash(linhas(b, t))).toBe(antes[i]);
    });
    const nova = b
      .prepare(
        "SELECT nome FROM categoria_financeira WHERE id = '01929c10-0000-7000-8000-000000000010'",
      )
      .get() as { nome: string };
    expect(nova.nome).toBe('Devolução de venda de animais (sistema)');
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('a falha no passo final desfaz a migration', async () => {
    const b = await abrir(10);
    popular(b);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 10),
      {
        ...MIGRACOES_DO_PROJETO[10]!,
        sql: `${MIGRACOES_DO_PROJETO[10]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(10);
    expect(
      b.prepare("SELECT name FROM sqlite_master WHERE name = 'devolucao_animal'").get(),
    ).toBeUndefined();
    // O índice único da 0006 continua lá.
    expect(
      b.prepare("SELECT name FROM sqlite_master WHERE name = 'ux_negociacao_item_ativo'").get(),
    ).toBeDefined();
  });

  it('gatilhos: um item vigente por animal e tipo, devolução única, nada apagado, original protegida', async () => {
    const b = await abrir(11);
    popular(b, false);
    const segundaVenda = () =>
      b
        .prepare(
          `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,condicao_pagamento,comportamento_custo,origem_tipo,origem_id,requisicao_id,created_at,updated_at)
           SELECT 'lv2','p',categoria_id,'receita','2026-10-12',170000,'Venda 2','corte','nenhum','a_vista','nao_se_aplica','negociacao_animal','nv2','rq-lv2',?,? FROM lancamento_financeiro WHERE id = 'lv'`,
        )
        .run(agora, agora);
    segundaVenda();
    b.prepare(
      "INSERT INTO movimentacao_animal(id,animal_id,tipo,data,created_at,updated_at) VALUES('m4','a1','saida','2026-10-12',?,?)",
    ).run(agora, agora);
    b.prepare(
      `INSERT INTO negociacao_animal(id,propriedade_id,tipo,data,lancamento_id,valor_total_centavos,criterio_alocacao,unidade_preco,requisicao_id,created_at,updated_at)
       VALUES('nv2','p','venda','2026-10-12','lv2',170000,'igual','total','rq-nv2',?,?)`,
    ).run(agora, agora);
    const item2 = () =>
      b
        .prepare(
          "INSERT INTO negociacao_animal_item(id,negociacao_id,tipo,animal_id,movimentacao_animal_id,valor_alocado_centavos,created_at,updated_at) VALUES('iv2','nv2','venda','a1','m4',170000,?,?)",
        )
        .run(agora, agora);
    // Sem devolução da primeira venda, a segunda venda vigente do mesmo animal é recusada.
    expect(item2).toThrow(/negociação ativa deste tipo/);
    devolver(b);
    expect(item2).not.toThrow();
    // O mesmo item não é devolvido duas vezes.
    expect(() =>
      b
        .prepare(
          "INSERT INTO devolucao_animal_item(id,devolucao_id,negociacao_item_id,animal_id,movimentacao_animal_id,valor_centavos,created_at,updated_at) VALUES('di2','dv','iv','a1','m1',1,?,?)",
        )
        .run(agora, agora),
    ).toThrow();
    // Nada é apagado; a original não é cancelada com devolução ativa; parcela compensada também não.
    for (const t of ['devolucao_animal', 'devolucao_animal_item', 'compensacao_financeira'])
      expect(() => b.prepare(`DELETE FROM ${t}`).run()).toThrow(/Exclusão física proibida/);
    expect(() =>
      b
        .prepare(
          "UPDATE negociacao_animal SET deleted_at = ?, motivo_cancelamento = 'x' WHERE id = 'nv'",
        )
        .run(agora),
    ).toThrow(/devoluções/);
    expect(() =>
      b
        .prepare(
          "UPDATE parcela_financeira SET deleted_at = ?, motivo_cancelamento = 'x' WHERE id = 'pv'",
        )
        .run(agora),
    ).toThrow(/compensação ativa/);
    expect(() =>
      b.prepare("UPDATE devolucao_animal SET valor_total_centavos = 1 WHERE id = 'dv'").run(),
    ).toThrow(/imutáveis/);
    // Desfazer a devolução com outra venda vigente do animal depois dela é recusado pelo banco.
    b.prepare("UPDATE compensacao_financeira SET deleted_at = ?, motivo_cancelamento = 'x'").run(
      agora,
    );
    b.prepare(
      "UPDATE lancamento_financeiro SET deleted_at = ?, motivo_cancelamento = 'x' WHERE id = 'ld'",
    ).run(agora);
    b.prepare(
      "UPDATE devolucao_animal SET deleted_at = ?, motivo_cancelamento = 'x' WHERE id = 'dv'",
    ).run(agora);
    expect(() =>
      b.prepare("UPDATE devolucao_animal_item SET deleted_at = ? WHERE id = 'di'").run(agora),
    ).toThrow(/outra negociação ativa/);
  });
});
