import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria, montarAmbiente, type Ambiente } from './apoio';

let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
let ambiente: Ambiente | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  ambiente?.gerenciador.fechar();
  ambiente = undefined;
  pasta?.limpar();
});
const agora = '2026-10-16T12:00:00.000Z';
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
/** A 0009 é testada até a sua versão: migrations posteriores têm testes próprios. */
const ATE_9 = MIGRACOES_DO_PROJETO.slice(0, 9);

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'producao.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}
const CATEGORIA_RESULTADO = '01929c10-0000-7000-8000-000000000008';

function popular(b: Conexao) {
  for (const [id, nome] of [
    ['p', 'Fazenda'],
    ['p2', 'Outra'],
  ] as const)
    b.prepare(
      "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES(?,?,?,'misto',?,?)",
    ).run(id, nome, nome.toLowerCase(), agora, agora);
  for (const [id, prop] of [
    ['silagem', 'p'],
    ['adubo', 'p'],
    ['x', 'p2'],
  ] as const)
    b.prepare(
      "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES(?,?,?,?,'outro','kg','mn',0,?,?)",
    ).run(id, prop, id, id, agora, agora);
}
let ordem = 0;
function movimento(
  b: Conexao,
  id: string,
  item: string,
  extra: { tipo?: string; custo?: number | null; doc?: string | null; quantidade?: number } = {},
) {
  ordem += 1;
  const tipo = extra.tipo ?? 'saida_consumo';
  const entrada = tipo.startsWith('entrada');
  b.prepare(
    `INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_entrada_centavos,destino,documento_origem_id,requisicao_id,created_at,updated_at)
     VALUES(?,?,'2026-09-30',?,?,?,'kg',?,?,?,?,?,?)`,
  ).run(
    id,
    item,
    ordem,
    tipo,
    extra.quantidade ?? 1000,
    entrada ? (extra.custo === undefined ? 5000 : extra.custo) : null,
    entrada ? null : 'propriedade',
    extra.doc ?? null,
    `r-${id}`,
    agora,
    agora,
  );
}
function lancamento(b: Conexao, id: string) {
  b.prepare(
    `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,condicao_pagamento,comportamento_custo,requisicao_id,created_at,updated_at)
     VALUES(?,'p',?,'despesa','2026-09-10',5000,'Diesel','nao_definida','propriedade','nao_informada','nao_classificado',?,?,?)`,
  ).run(id, CATEGORIA_RESULTADO, `req-${id}`, agora, agora);
}
function centro(b: Conexao, id: string, item = 'silagem', prop = 'p') {
  b.prepare(
    `INSERT INTO centro_producao(id,propriedade_id,nome,nome_normalizado,tipo,data_inicio,estoque_item_id,requisicao_id,created_at,updated_at)
     VALUES(?,?,?,?,'volumoso','2026-09-01',?,?,?,?)`,
  ).run(id, prop, `Centro ${id}`, `centro ${id}`, item, `rc-${id}`, agora, agora);
}
const encerrarSql = (
  b: Conexao,
  id: string,
  mov: string,
  total: number | null,
  desconhecidos = 0,
) =>
  b
    .prepare(
      `UPDATE centro_producao SET status='encerrado', data_fim='2026-09-30', quantidade_produzida_milesimos=1000,
         movimentacao_estoque_id=?, custo_conhecido_centavos=?, componentes_desconhecidos=?, custo_total_centavos=? WHERE id=?`,
    )
    .run(mov, total ?? 5000, desconhecidos, total, id);
async function pronto() {
  const b = await abrir(9);
  popular(b);
  return b;
}

describe('migration 0009: produção própria', () => {
  it('aplica do zero e reaplica sem efeito', async () => {
    const b = await abrir(9);
    expect(b.pragma('user_version', { simple: true })).toBe(9);
    expect((await aplicarMigracoes(b, ATE_9)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    for (const t of ['centro_producao', 'centro_producao_consumo', 'centro_producao_lancamento'])
      expect(linhas(b, t)).toEqual([]);
  });

  it('migra a versão 8 com dados preservando tudo, na ordem, e mantém o rateio funcionando', async () => {
    const b = await abrir(8);
    popular(b);
    lancamento(b, 'l1');
    movimento(b, 'm1', 'adubo');
    b.prepare(
      `INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,motivo,requisicao_id,created_at,updated_at)
       VALUES('r1','p','lancamento','l1','cabecas','2026-10-10','m','q1',?,?)`,
    ).run(agora, agora);
    const tabelas = [
      'propriedade',
      'estoque_item',
      'movimentacao_estoque',
      'lancamento_financeiro',
      'rateio_custo',
    ];
    const antes = tabelas.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_9)).aplicadas.map((m) => m.nome)).toEqual([
      'producao_propria',
    ]);
    expect(tabelas.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(b.pragma('foreign_key_check')).toEqual([]);
    // O gatilho de elegibilidade do rateio foi recriado e continua recusando duplicidade.
    expect(() =>
      b
        .prepare(
          `INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,motivo,requisicao_id,created_at,updated_at)
           VALUES('r2','p','lancamento','l1','cabecas','2026-10-10','m','q2',?,?)`,
        )
        .run(agora, agora),
    ).toThrow(/UNIQUE/);
  });

  it('a falha no passo final desfaz a migration inteira, inclusive o gatilho do rateio', async () => {
    const b = await abrir(8);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 8),
      {
        ...MIGRACOES_DO_PROJETO[8]!,
        sql: `${MIGRACOES_DO_PROJETO[8]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(8);
    expect(
      b.prepare("SELECT name FROM sqlite_master WHERE name = 'centro_producao'").get(),
    ).toBeUndefined();
    const gatilho = b
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'tg_rateio_origem'")
      .get() as { sql: string };
    expect(gatilho.sql).not.toMatch(/centro_producao/);
  });

  it('backup pré-migração da versão 8 é feito antes da 0009 e restaura sem perda', async () => {
    pasta = criarPastaTemporaria();
    const antigo = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 8));
    ambiente = antigo;
    await antigo.gerenciador.abrir();
    popular(antigo.gerenciador.conexao);
    const itens = linhas(antigo.gerenciador.conexao, 'estoque_item');
    const manual = await antigo.backup.criar('manual');
    antigo.gerenciador.fechar();
    const atual = montarAmbiente(pasta.caminho, ATE_9);
    ambiente = atual;
    expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([9]);
    expect(
      (await atual.backup.listar()).some((x) => x.tipo === 'pre_migracao' && x.versaoSchema === 8),
    ).toBe(true);
    const r = await atual.backup.restaurar(manual.id);
    expect(r.migracoesAplicadas).toBe(1);
    expect(linhas(atual.gerenciador.conexao, 'estoque_item')).toEqual(itens);
  });
});

describe('migration 0009: proteções do banco', () => {
  it('centro: item da mesma propriedade; encerrar só com a entrada correspondente', async () => {
    const b = await pronto();
    expect(() => centro(b, 'c-outra', 'x')).toThrow(/incompatível/);
    centro(b, 'c1');
    movimento(b, 'e-errada', 'silagem', { tipo: 'entrada_producao', doc: 'c1', custo: 4000 });
    expect(() => encerrarSql(b, 'c1', 'e-errada', 5000)).toThrow(/sem a entrada de produção/);
    movimento(b, 'e-sem-doc', 'silagem', { tipo: 'entrada_producao', custo: 5000 });
    expect(() => encerrarSql(b, 'c1', 'e-sem-doc', 5000)).toThrow(/sem a entrada de produção/);
    movimento(b, 'e1', 'silagem', { tipo: 'entrada_producao', doc: 'c1', custo: 5000 });
    expect(() => encerrarSql(b, 'c1', 'e1', null, 0)).toThrow(/CHECK|sem a entrada de produção/); // total nulo sem desconhecidos
    encerrarSql(b, 'c1', 'e1', 5000);
    // Encerrado não muda; a entrada e os custos ficam travados.
    expect(() => b.prepare("UPDATE centro_producao SET nome='Outro' WHERE id='c1'").run()).toThrow(
      /reabra/,
    );
    expect(() =>
      b.prepare("UPDATE movimentacao_estoque SET deleted_at='x' WHERE id='e1'").run(),
    ).toThrow(/centro de produção encerrado/);
  });

  it('entrada com custo desconhecido exige o registro dos desconhecidos', async () => {
    const b = await pronto();
    centro(b, 'c1');
    movimento(b, 'e1', 'silagem', { tipo: 'entrada_producao', doc: 'c1', custo: null });
    expect(() => encerrarSql(b, 'c1', 'e1', 5000, 1)).toThrow(/CHECK|sem a entrada de produção/);
    b.prepare(
      `UPDATE centro_producao SET status='encerrado', data_fim='2026-09-30', quantidade_produzida_milesimos=1000,
         movimentacao_estoque_id='e1', custo_conhecido_centavos=3000, componentes_desconhecidos=1, custo_total_centavos=NULL WHERE id='c1'`,
    ).run();
  });

  it('vínculos: um só centro por custo, só com o centro aberto, nunca com rateio ativo', async () => {
    const b = await pronto();
    centro(b, 'c1');
    centro(b, 'c2');
    lancamento(b, 'l1');
    lancamento(b, 'l-rateado');
    movimento(b, 'm1', 'adubo');
    movimento(b, 'm-produto', 'silagem');
    b.prepare(
      `INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,motivo,requisicao_id,created_at,updated_at)
       VALUES('r1','p','lancamento','l-rateado','cabecas','2026-10-10','m','q1',?,?)`,
    ).run(agora, agora);
    const vl = (id: string, c: string, l: string) =>
      b
        .prepare(
          'INSERT INTO centro_producao_lancamento(id,centro_id,lancamento_id,created_at,updated_at) VALUES(?,?,?,?,?)',
        )
        .run(id, c, l, agora, agora);
    const vc = (id: string, c: string, m: string) =>
      b
        .prepare(
          'INSERT INTO centro_producao_consumo(id,centro_id,movimentacao_estoque_id,created_at,updated_at) VALUES(?,?,?,?,?)',
        )
        .run(id, c, m, agora, agora);
    expect(() => vl('v0', 'c1', 'l-rateado')).toThrow(/não vinculável/);
    expect(() => vc('v0', 'c1', 'm-produto')).toThrow(/não vinculável/);
    vl('v1', 'c1', 'l1');
    vc('v2', 'c1', 'm1');
    expect(() => vl('v3', 'c2', 'l1')).toThrow(/UNIQUE/);
    expect(() => vc('v4', 'c2', 'm1')).toThrow(/UNIQUE/);
    // O rateio não aceita custo do centro.
    expect(() =>
      b
        .prepare(
          `INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,motivo,requisicao_id,created_at,updated_at)
           VALUES('r2','p','lancamento','l1','cabecas','2026-10-10','m','q2',?,?)`,
        )
        .run(agora, agora),
    ).toThrow(/fora de centro de produção/);
    // Com o centro encerrado, vínculo não se desfaz e o lançamento não é cancelado.
    movimento(b, 'e1', 'silagem', { tipo: 'entrada_producao', doc: 'c1', custo: 5000 });
    encerrarSql(b, 'c1', 'e1', 5000);
    expect(() =>
      b.prepare("UPDATE centro_producao_lancamento SET deleted_at='x' WHERE id='v1'").run(),
    ).toThrow(/com o centro aberto/);
    expect(() =>
      b
        .prepare(
          "UPDATE lancamento_financeiro SET deleted_at='x', motivo_cancelamento='x' WHERE id='l1'",
        )
        .run(),
    ).toThrow(/centro de produção encerrado/);
    expect(() =>
      b.prepare("UPDATE movimentacao_estoque SET deleted_at='x' WHERE id='m1'").run(),
    ).toThrow(/centro de produção encerrado/);
    expect(() => vl('v5', 'c1', 'l1')).toThrow();
  });

  it('cancelar centro só aberto e sem vínculos; exclusão física proibida', async () => {
    const b = await pronto();
    centro(b, 'c1');
    lancamento(b, 'l1');
    b.prepare(
      "INSERT INTO centro_producao_lancamento(id,centro_id,lancamento_id,created_at,updated_at) VALUES('v1','c1','l1',?,?)",
    ).run(agora, agora);
    expect(() =>
      b
        .prepare("UPDATE centro_producao SET deleted_at='x', motivo_cancelamento='m' WHERE id='c1'")
        .run(),
    ).toThrow(/sem custos vinculados/);
    b.prepare("UPDATE centro_producao_lancamento SET deleted_at='x' WHERE id='v1'").run();
    b.prepare(
      "UPDATE centro_producao SET deleted_at='x', motivo_cancelamento='m' WHERE id='c1'",
    ).run();
    expect(() => b.prepare("UPDATE centro_producao SET nome='y' WHERE id='c1'").run()).toThrow(
      /cancelado/,
    );
    for (const t of ['centro_producao', 'centro_producao_lancamento'])
      expect(() => b.prepare(`DELETE FROM ${t}`).run()).toThrow(/Exclusão física proibida/);
  });

  it('o vínculo de consumo só acompanha a correção do próprio movimento', async () => {
    const b = await pronto();
    centro(b, 'c1');
    movimento(b, 'm1', 'adubo');
    movimento(b, 'm-outro', 'adubo');
    b.prepare(
      "INSERT INTO centro_producao_consumo(id,centro_id,movimentacao_estoque_id,created_at,updated_at) VALUES('v1','c1','m1',?,?)",
    ).run(agora, agora);
    expect(() =>
      b
        .prepare(
          "UPDATE centro_producao_consumo SET movimentacao_estoque_id='m-outro' WHERE id='v1'",
        )
        .run(),
    ).toThrow(/acompanha a correção/);
    b.prepare("UPDATE movimentacao_estoque SET deleted_at='x' WHERE id='m1'").run();
    ordem += 1;
    b.prepare(
      `INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,destino,substitui_id,requisicao_id,created_at,updated_at)
       VALUES('m2','adubo','2026-09-30',?,'saida_consumo',2000,'kg','propriedade','m1','r-m2',?,?)`,
    ).run(ordem, agora, agora);
    b.prepare(
      "UPDATE centro_producao_consumo SET movimentacao_estoque_id='m2' WHERE id='v1'",
    ).run();
  });
});
