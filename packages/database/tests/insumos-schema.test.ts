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
/** A 0007 é testada até a sua versão: migrations posteriores têm testes próprios. */
const ATE_7 = MIGRACOES_DO_PROJETO.slice(0, 7);

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'insumos.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}

const CATEGORIA_ESTOQUE = '01929c10-0000-7000-8000-000000000003'; // despesa, tratamento "estoque"
const CATEGORIA_RESULTADO = '01929c10-0000-7000-8000-000000000008'; // despesa, tratamento "resultado"

function popular(b: Conexao) {
  for (const [id, nome] of [
    ['p', 'Fazenda'],
    ['p2', 'Outra'],
  ] as const)
    b.prepare(
      "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES(?,?,?,'misto',?,?)",
    ).run(id, nome, nome.toLowerCase(), agora, agora);
  for (const [id, prop] of [
    ['i1', 'p'],
    ['i2', 'p'],
    ['x1', 'p2'],
  ] as const)
    b.prepare(
      "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES(?,?,?,?,'racao','kg','mn',0,?,?)",
    ).run(id, prop, id, id, agora, agora);
}
let ordem = 0;
function entrada(
  b: Conexao,
  id: string,
  itemId: string,
  extra: {
    custo?: number | null;
    quantidade?: number;
    tipo?: string;
    substitui?: string | null;
  } = {},
) {
  ordem += 1;
  b.prepare(
    `INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_entrada_centavos,requisicao_id,substitui_id,created_at,updated_at)
     VALUES(?,?,'2026-10-01',?,?,?,'kg',?,?,?,?,?)`,
  ).run(
    id,
    itemId,
    ordem,
    extra.tipo ?? 'entrada_compra',
    extra.quantidade ?? 100000,
    extra.custo === undefined ? 20000 : extra.custo,
    `r-${id}`,
    extra.substitui ?? null,
    agora,
    agora,
  );
}
function lancamento(b: Conexao, id: string, categoria = CATEGORIA_ESTOQUE, propriedade = 'p') {
  b.prepare(
    `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,condicao_pagamento,comportamento_custo,requisicao_id,created_at,updated_at)
     VALUES(?,?,?,'despesa','2026-10-01',20000,'Compra','nao_definida','propriedade','nao_informada','nao_classificado',?,?,?)`,
  ).run(id, propriedade, categoria, `req-${id}`, agora, agora);
}
function item(
  b: Conexao,
  id: string,
  lancamentoId: string,
  estoqueItemId: string,
  movimentacaoId: string,
  valor = 20000,
  quantidade = 100000,
) {
  b.prepare(
    "INSERT INTO lancamento_item(id,lancamento_id,estoque_item_id,quantidade_milesimos,unidade_base,valor_centavos,movimentacao_estoque_id,created_at,updated_at) VALUES(?,?,?,?,'kg',?,?,?,?)",
  ).run(id, lancamentoId, estoqueItemId, quantidade, valor, movimentacaoId, agora, agora);
}
async function pronto() {
  const b = await abrir(7);
  popular(b);
  return b;
}

describe('migration 0007: compra de insumos e classificação por origem', () => {
  it('aplica do zero e reaplica sem efeito', async () => {
    const b = await abrir(7);
    expect(b.pragma('user_version', { simple: true })).toBe(7);
    expect((await aplicarMigracoes(b, ATE_7)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    expect(linhas(b, 'lancamento_item')).toEqual([]);
    expect(linhas(b, 'classificacao_custo_origem')).toEqual([]);
  });

  it('migra a versão 6 com dados preservando tudo, na ordem', async () => {
    const b = await abrir(6);
    popular(b);
    entrada(b, 'm1', 'i1');
    lancamento(b, 'l1');
    const tabelas = [
      'propriedade',
      'estoque_item',
      'movimentacao_estoque',
      'lancamento_financeiro',
      'historico_alteracao',
    ];
    const antes = tabelas.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_7)).aplicadas.map((m) => m.nome)).toEqual([
      'insumos_e_classificacao',
    ]);
    expect(tabelas.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('a falha no passo final desfaz a migration inteira', async () => {
    const b = await abrir(6);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 6),
      {
        ...MIGRACOES_DO_PROJETO[6]!,
        sql: `${MIGRACOES_DO_PROJETO[6]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(6);
    expect(
      b.prepare("SELECT name FROM sqlite_master WHERE name = 'lancamento_item'").get(),
    ).toBeUndefined();
  });

  it('backup pré-migração da versão 6 é feito antes da 0007 e restaura sem perda', async () => {
    pasta = criarPastaTemporaria();
    const antigo = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 6));
    ambiente = antigo;
    await antigo.gerenciador.abrir();
    popular(antigo.gerenciador.conexao);
    const itens = linhas(antigo.gerenciador.conexao, 'estoque_item');
    const manual = await antigo.backup.criar('manual');
    antigo.gerenciador.fechar();
    const atual = montarAmbiente(pasta.caminho, ATE_7);
    ambiente = atual;
    expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([7]);
    expect(
      (await atual.backup.listar()).some((x) => x.tipo === 'pre_migracao' && x.versaoSchema === 6),
    ).toBe(true);
    const r = await atual.backup.restaurar(manual.id);
    expect(r.migracoesAplicadas).toBe(1);
    expect(atual.gerenciador.conexao.pragma('user_version', { simple: true })).toBe(7);
    expect(linhas(atual.gerenciador.conexao, 'estoque_item')).toEqual(itens);
  });
});

describe('migration 0007: proteções do banco', () => {
  it('item exige lançamento de compra para estoque, entrada de compra do mesmo item, quantidade e custo conhecido', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    lancamento(b, 'lr', CATEGORIA_RESULTADO);
    lancamento(b, 'lx', CATEGORIA_ESTOQUE, 'p2');
    entrada(b, 'm1', 'i1');
    entrada(b, 'm-sem-custo', 'i1', { custo: null });
    entrada(b, 'm-inicial', 'i1', { tipo: 'entrada_inicial' });
    entrada(b, 'm-outro-item', 'i2');
    expect(() => item(b, 'a', 'lr', 'i1', 'm1')).toThrow(/Item incompatível/); // categoria de resultado
    expect(() => item(b, 'a', 'lx', 'i1', 'm1')).toThrow(/Item incompatível/); // outra propriedade
    expect(() => item(b, 'a', 'l1', 'i1', 'm-sem-custo')).toThrow(/Item incompatível/); // custo desconhecido
    expect(() => item(b, 'a', 'l1', 'i1', 'm-inicial')).toThrow(/Item incompatível/); // não é compra
    expect(() => item(b, 'a', 'l1', 'i1', 'm-outro-item')).toThrow(/Item incompatível/); // outro item
    expect(() => item(b, 'a', 'l1', 'i1', 'm1', 19999)).toThrow(/Item incompatível/); // valor difere
    expect(() => item(b, 'a', 'l1', 'i1', 'm1', 20000, 99000)).toThrow(/Item incompatível/); // quantidade difere
    item(b, 'a', 'l1', 'i1', 'm1');
    expect(() => item(b, 'b', 'l1', 'i1', 'm1')).toThrow(); // entrada ligada uma única vez
  });

  it('lançamento com itens ativos só é cancelado depois dos itens e das entradas', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    entrada(b, 'm1', 'i1');
    item(b, 'a', 'l1', 'i1', 'm1');
    const cancelarLancamento = () =>
      b
        .prepare(
          "UPDATE lancamento_financeiro SET deleted_at='2026-10-16', motivo_cancelamento='x' WHERE id='l1'",
        )
        .run();
    expect(cancelarLancamento).toThrow(/Cancele pela compra de insumos/);
    expect(() =>
      b.prepare("UPDATE lancamento_item SET deleted_at='2026-10-16' WHERE id='a'").run(),
    ).toThrow(/Cancele a entrada/);
    b.prepare("UPDATE movimentacao_estoque SET deleted_at='2026-10-16' WHERE id='m1'").run();
    b.prepare("UPDATE lancamento_item SET deleted_at='2026-10-16' WHERE id='a'").run();
    cancelarLancamento();
    expect(() =>
      b.prepare("UPDATE lancamento_item SET valor_centavos=1 WHERE id='a'").run(),
    ).toThrow(/só muda por cancelamento/);
  });

  it('item é imutável, exceto na correção que o aponta para o movimento substituto com os novos valores', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    entrada(b, 'm1', 'i1');
    item(b, 'a', 'l1', 'i1', 'm1');
    expect(() =>
      b.prepare("UPDATE lancamento_item SET valor_centavos=30000 WHERE id='a'").run(),
    ).toThrow(/só muda por cancelamento/);
    expect(() =>
      b.prepare("UPDATE lancamento_item SET estoque_item_id='i2' WHERE id='a'").run(),
    ).toThrow();
    // Correção: o movimento antigo é cancelado e o novo o substitui, com outro valor e quantidade.
    b.prepare("UPDATE movimentacao_estoque SET deleted_at='2026-10-16' WHERE id='m1'").run();
    entrada(b, 'm2', 'i1', { custo: 30000, quantidade: 90000, substitui: 'm1' });
    entrada(b, 'm3', 'i1', { custo: 30000, quantidade: 90000 }); // não substitui m1
    expect(() =>
      b
        .prepare(
          "UPDATE lancamento_item SET movimentacao_estoque_id='m3', valor_centavos=30000, quantidade_milesimos=90000 WHERE id='a'",
        )
        .run(),
    ).toThrow(/só muda por cancelamento/);
    expect(() =>
      b
        .prepare(
          "UPDATE lancamento_item SET movimentacao_estoque_id='m2', valor_centavos=31000, quantidade_milesimos=90000 WHERE id='a'",
        )
        .run(),
    ).toThrow(/só muda por cancelamento/); // valor diferente do novo movimento
    b.prepare(
      "UPDATE lancamento_item SET movimentacao_estoque_id='m2', valor_centavos=30000, quantidade_milesimos=90000 WHERE id='a'",
    ).run();
    expect(b.prepare("SELECT valor_centavos AS v FROM lancamento_item WHERE id='a'").get()).toEqual(
      { v: 30000 },
    );
  });

  it('exclusão física proibida e classificação por origem com unicidade', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    entrada(b, 'm1', 'i1');
    item(b, 'a', 'l1', 'i1', 'm1');
    expect(() => b.prepare('DELETE FROM lancamento_item').run()).toThrow(
      /Exclusão física proibida/,
    );
    const inserir = (id: string, escopo: string, ref: string | null, comp = 'fixo') =>
      b
        .prepare(
          'INSERT INTO classificacao_custo_origem(id,propriedade_id,escopo,referencia_id,comportamento_custo,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(id, 'p', escopo, ref, comp, agora, agora);
    inserir('c1', 'estoque_item', 'i1');
    expect(() => inserir('c2', 'estoque_item', 'i1', 'variavel')).toThrow(/UNIQUE/);
    expect(() => inserir('c3', 'estoque_item', null)).toThrow(); // item exige referência
    expect(() => inserir('c4', 'aquisicao_animal', 'i1')).toThrow(); // escopo global não tem referência
    expect(() => inserir('c5', 'estoque_item', 'i2', 'outro')).toThrow();
    inserir('c6', 'aquisicao_animal', null);
    expect(() => inserir('c7', 'aquisicao_animal', null, 'variavel')).toThrow(/UNIQUE/);
    expect(() => b.prepare('DELETE FROM classificacao_custo_origem').run()).toThrow(
      /Exclusão física proibida/,
    );
  });
});
