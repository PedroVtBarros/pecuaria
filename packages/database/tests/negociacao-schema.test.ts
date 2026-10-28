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
/** A 0006 é testada até a sua versão: migrations posteriores têm testes próprios. */
const ATE_6 = MIGRACOES_DO_PROJETO.slice(0, 6);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'negociacao.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}

/** Dados das fases anteriores (rebanho, financeiro 4A): devem sobreviver à migration. */
function popular(b: Conexao) {
  for (const [id, nome] of [
    ['p', 'Fazenda'],
    ['p2', 'Outra'],
  ] as const)
    b.prepare(
      "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES(?,?,?,'misto',?,?)",
    ).run(id, nome, nome.toLowerCase(), agora, agora);
  b.prepare(
    "INSERT INTO lote(id,propriedade_id,nome,nome_normalizado,finalidade,data_formacao,created_at,updated_at) VALUES('l','p','Recria','recria','recria','2026-01-01',?,?)",
  ).run(agora, agora);
  for (const [id, prop] of [
    ['a1', 'p'],
    ['a2', 'p'],
    ['a3', 'p'],
    ['x1', 'p2'],
  ] as const)
    b.prepare(
      "INSERT INTO animal(id,propriedade_id,identificacao,identificacao_normalizada,sexo,condicao_sexual,categoria,aptidao,origem,data_entrada,created_at,updated_at) VALUES(?,?,?,?,'M','castrado','garrote','corte','comprado','2026-01-01',?,?)",
    ).run(id, prop, id.toUpperCase(), id, agora, agora);
  for (const [id, animal, tipo] of [
    ['m1', 'a1', 'entrada'],
    ['m2', 'a2', 'entrada'],
    ['m3', 'a3', 'entrada'],
    ['m4', 'a1', 'saida'],
    ['mx', 'x1', 'entrada'],
  ] as const)
    b.prepare(
      'INSERT INTO movimentacao_animal(id,animal_id,tipo,data,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    ).run(id, animal, tipo, '2026-10-01', agora, agora);
}
const categoria = (b: Conexao, natureza: 'despesa' | 'receita') =>
  (
    b
      .prepare(
        'SELECT id FROM categoria_financeira WHERE natureza = ? AND origem_exigida = ? ORDER BY id',
      )
      .get(natureza, 'negociacao_animal') as { id: string }
  ).id;
function lancamento(b: Conexao, id: string, extra: Record<string, unknown> = {}) {
  const natureza = (extra['natureza'] as 'despesa' | 'receita' | undefined) ?? 'despesa';
  const v = {
    propriedade_id: 'p',
    categoria_id: categoria(b, natureza),
    natureza,
    valor_total_centavos: 10000,
    origem_tipo: 'negociacao_animal',
    origem_id: `n-${id}`,
    comportamento_custo: natureza === 'despesa' ? 'nao_classificado' : 'nao_se_aplica',
    ...extra,
  };
  b.prepare(
    `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,condicao_pagamento,comportamento_custo,origem_tipo,origem_id,requisicao_id,created_at,updated_at)
     VALUES(@id,@propriedade_id,@categoria_id,@natureza,'2026-10-01',@valor_total_centavos,'Teste','nao_definida','nenhum','nao_informada',@comportamento_custo,@origem_tipo,@origem_id,@req,@agora,@agora)`,
  ).run({ id, req: `req-${id}`, agora, ...v });
}
function negociacao(
  b: Conexao,
  id: string,
  lancamentoId: string,
  tipo: 'compra' | 'venda' = 'compra',
  extra: Record<string, unknown> = {},
) {
  const v = { propriedade_id: 'p', valor: 10000, ...extra };
  b.prepare(
    `INSERT INTO negociacao_animal(id,propriedade_id,tipo,data,lancamento_id,valor_total_centavos,criterio_alocacao,unidade_preco,requisicao_id,created_at,updated_at)
     VALUES(@id,@propriedade_id,@tipo,'2026-10-01',@lancamento_id,@valor,'igual','total',@req,@agora,@agora)`,
  ).run({ id, tipo, lancamento_id: lancamentoId, req: `rn-${id}`, agora, ...v });
}
function item(
  b: Conexao,
  id: string,
  negociacaoId: string,
  animal: string,
  mov: string,
  valor = 5000,
  tipo: 'compra' | 'venda' = 'compra',
) {
  b.prepare(
    'INSERT INTO negociacao_animal_item(id,negociacao_id,tipo,animal_id,movimentacao_animal_id,valor_alocado_centavos,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
  ).run(id, negociacaoId, tipo, animal, mov, valor, agora, agora);
}
async function pronto(): Promise<Conexao> {
  const b = await abrir(6);
  popular(b);
  return b;
}

describe('migration 0006: compra e venda de animais', () => {
  it('aplica do zero, reaplica sem efeito e mantém a integridade', async () => {
    const b = await abrir(6);
    expect(b.pragma('user_version', { simple: true })).toBe(6);
    expect((await aplicarMigracoes(b, ATE_6)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    for (const t of [
      'negociacao_animal',
      'negociacao_animal_item',
      'custo_anterior',
      'custo_anterior_item',
    ])
      expect(linhas(b, t)).toEqual([]);
  });

  it('migra a versão 5 com dados preservando tudo, na ordem', async () => {
    const b = await abrir(5);
    popular(b);
    lancamento(b, 'lx', {
      origem_tipo: 'manual',
      origem_id: null,
      categoria_id: (
        b
          .prepare(
            "SELECT id FROM categoria_financeira WHERE origem_exigida IS NULL AND natureza='despesa'",
          )
          .get() as { id: string }
      ).id,
    });
    const tabelas = [
      'propriedade',
      'lote',
      'animal',
      'movimentacao_animal',
      'lancamento_financeiro',
      'categoria_financeira',
      'historico_alteracao',
    ];
    const antes = tabelas.map((t) => hash(linhas(b, t)));
    const r = await aplicarMigracoes(b, ATE_6);
    expect(r.aplicadas.map((x) => x.nome)).toEqual(['compra_venda_animais']);
    expect(tabelas.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('a falha no passo final desfaz a migration inteira', async () => {
    const b = await abrir(5);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 5),
      {
        ...MIGRACOES_DO_PROJETO[5]!,
        sql: `${MIGRACOES_DO_PROJETO[5]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(5);
    expect(
      b.prepare("SELECT name FROM sqlite_master WHERE name = 'negociacao_animal'").get(),
    ).toBeUndefined();
  });

  it('backup pré-migração da versão 5 é feito antes da 0006 e restaura sem perda', async () => {
    pasta = criarPastaTemporaria();
    const antigo = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 5));
    ambiente = antigo;
    await antigo.gerenciador.abrir();
    popular(antigo.gerenciador.conexao);
    const animais = linhas(antigo.gerenciador.conexao, 'animal');
    const manual = await antigo.backup.criar('manual');
    antigo.gerenciador.fechar();
    const atual = montarAmbiente(pasta.caminho, ATE_6);
    ambiente = atual;
    expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([6]);
    expect(
      (await atual.backup.listar()).some((x) => x.tipo === 'pre_migracao' && x.versaoSchema === 5),
    ).toBe(true);
    expect(linhas(atual.gerenciador.conexao, 'animal')).toEqual(animais);
    const r = await atual.backup.restaurar(manual.id);
    expect(r.migracoesAplicadas).toBe(1);
    expect(atual.gerenciador.conexao.pragma('user_version', { simple: true })).toBe(6);
    expect(linhas(atual.gerenciador.conexao, 'animal')).toEqual(animais);
  });
});

describe('migration 0006: proteções do banco', () => {
  it('negociação exige lançamento próprio, da natureza, da propriedade e do valor certos', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    expect(() => negociacao(b, 'n-l1', 'l1', 'venda')).toThrow(/não pertence a esta negociação/); // natureza
    expect(() => negociacao(b, 'n-l1', 'l1', 'compra', { valor: 9999 })).toThrow(/não pertence/); // valor
    expect(() => negociacao(b, 'n-l1', 'l1', 'compra', { propriedade_id: 'p2' })).toThrow(
      /não pertence/,
    );
    lancamento(b, 'l2', {
      origem_tipo: 'manual',
      origem_id: null,
      categoria_id: (
        b
          .prepare(
            "SELECT id FROM categoria_financeira WHERE origem_exigida IS NULL AND natureza='despesa'",
          )
          .get() as { id: string }
      ).id,
    });
    expect(() => negociacao(b, 'n-l2', 'l2')).toThrow(/não pertence/); // origem manual
    negociacao(b, 'n-l1', 'l1');
    expect(() => negociacao(b, 'n-l1b', 'l1')).toThrow(); // lançamento único
  });

  it('o valor do lançamento de uma negociação não muda', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    negociacao(b, 'n-l1', 'l1');
    expect(() =>
      b
        .prepare("UPDATE lancamento_financeiro SET valor_total_centavos = 9000 WHERE id = 'l1'")
        .run(),
    ).toThrow(/não pode ser alterado/);
  });

  it('item: mesmo tipo e propriedade, um ativo por animal e tipo, movimentação única', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    negociacao(b, 'n-l1', 'l1');
    expect(() => item(b, 'i0', 'n-l1', 'a1', 'm1', 5000, 'venda')).toThrow(/Item incompatível/);
    expect(() => item(b, 'i0', 'n-l1', 'x1', 'mx')).toThrow(/Item incompatível/); // outra propriedade
    item(b, 'i1', 'n-l1', 'a1', 'm1');
    item(b, 'i2', 'n-l1', 'a2', 'm2');
    expect(() => item(b, 'i3', 'n-l1', 'a1', 'm3')).toThrow(); // animal repetido na negociação
    expect(() => item(b, 'i3', 'n-l1', 'a3', 'm2')).toThrow(); // movimentação repetida
    lancamento(b, 'l9');
    negociacao(b, 'n-l9', 'l9');
    expect(() => item(b, 'i4', 'n-l9', 'a1', 'm4')).toThrow(/UNIQUE/); // compra ativa duplicada do mesmo animal
  });

  it('só cancela na ordem lançamento, negociação, itens; nada é apagado ou alterado', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    negociacao(b, 'n-l1', 'l1');
    item(b, 'i1', 'n-l1', 'a1', 'm1');
    item(b, 'i2', 'n-l1', 'a2', 'm2');
    expect(() =>
      b
        .prepare(
          "UPDATE negociacao_animal SET deleted_at='2026-10-16', motivo_cancelamento='x' WHERE id='n-l1'",
        )
        .run(),
    ).toThrow(/Cancele o lançamento/);
    expect(() =>
      b.prepare("UPDATE negociacao_animal_item SET deleted_at='2026-10-16' WHERE id='i1'").run(),
    ).toThrow(/Cancele a negociação inteira/);
    b.prepare(
      "UPDATE lancamento_financeiro SET deleted_at='2026-10-16', motivo_cancelamento='x' WHERE id='l1'",
    ).run();
    b.prepare(
      "UPDATE negociacao_animal SET deleted_at='2026-10-16', motivo_cancelamento='x' WHERE id='n-l1'",
    ).run();
    b.prepare(
      "UPDATE negociacao_animal_item SET deleted_at='2026-10-16' WHERE negociacao_id='n-l1'",
    ).run();
    // Congeladas depois de canceladas e imutáveis antes.
    expect(() =>
      b.prepare("UPDATE negociacao_animal SET observacoes='y' WHERE id='n-l1'").run(),
    ).toThrow(/imutáveis/);
    expect(() =>
      b.prepare("UPDATE negociacao_animal_item SET valor_alocado_centavos=1 WHERE id='i1'").run(),
    ).toThrow(/só pode ser cancelado/);
    // Item cancelado libera o animal para uma nova compra ativa.
    lancamento(b, 'l3');
    negociacao(b, 'n-l3', 'l3');
    item(b, 'i5', 'n-l3', 'a1', 'm4');
    for (const t of ['negociacao_animal', 'negociacao_animal_item'])
      expect(() => b.prepare(`DELETE FROM ${t}`).run()).toThrow(/Exclusão física proibida/);
  });

  it('item de negociação cancelada não pode ser inserido', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    negociacao(b, 'n-l1', 'l1');
    b.prepare(
      "UPDATE lancamento_financeiro SET deleted_at='2026-10-16', motivo_cancelamento='x' WHERE id='l1'",
    ).run();
    b.prepare(
      "UPDATE negociacao_animal SET deleted_at='2026-10-16', motivo_cancelamento='x' WHERE id='n-l1'",
    ).run();
    expect(() => item(b, 'i1', 'n-l1', 'a1', 'm1')).toThrow(/negociação cancelada/);
  });

  it('custo anterior: destino exclusivo, mesma propriedade, só cancelamento, nunca exclusão', async () => {
    const b = await pronto();
    const ins = (id: string, extra: Record<string, unknown> = {}) =>
      b
        .prepare(
          `INSERT INTO custo_anterior(id,propriedade_id,destino,animal_id,lote_id,valor_centavos,data_referencia,descricao,origem_informacao,justificativa,requisicao_id,created_at,updated_at)
           VALUES(@id,@propriedade_id,@destino,@animal_id,@lote_id,@valor,'2026-09-01','d','o','j',@req,@agora,@agora)`,
        )
        .run({
          id,
          propriedade_id: 'p',
          destino: 'animal',
          animal_id: 'a1',
          lote_id: null,
          valor: 1000,
          req: `rc-${id}`,
          agora,
          ...extra,
        });
    expect(() => ins('c0', { animal_id: null })).toThrow(); // animal sem animal_id
    expect(() => ins('c0', { lote_id: 'l' })).toThrow(); // animal e lote juntos
    expect(() => ins('c0', { animal_id: 'x1' })).toThrow(/outra propriedade/);
    expect(() => ins('c0', { valor: 0 })).toThrow();
    ins('c1');
    b.prepare(
      "INSERT INTO custo_anterior_item(id,custo_anterior_id,animal_id,valor_centavos,peso_relativo,created_at,updated_at) VALUES('ci1','c1','a1',1000,1,?,?)",
    ).run(agora, agora);
    expect(() =>
      b
        .prepare(
          "INSERT INTO custo_anterior_item(id,custo_anterior_id,animal_id,valor_centavos,peso_relativo,created_at,updated_at) VALUES('ci2','c1','x1',0,1,?,?)",
        )
        .run(agora, agora),
    ).toThrow(/outra propriedade/);
    expect(() =>
      b.prepare("UPDATE custo_anterior SET valor_centavos=5 WHERE id='c1'").run(),
    ).toThrow(/só pode ser cancelado/);
    expect(() =>
      b.prepare("UPDATE custo_anterior_item SET valor_centavos=5 WHERE id='ci1'").run(),
    ).toThrow(/não pode ser alterada/);
    b.prepare(
      "UPDATE custo_anterior SET deleted_at='2026-10-16', motivo_cancelamento='erro' WHERE id='c1'",
    ).run();
    expect(() =>
      b.prepare("UPDATE custo_anterior SET motivo_cancelamento='outro' WHERE id='c1'").run(),
    ).toThrow();
    expect(() =>
      b
        .prepare(
          "INSERT INTO custo_anterior_item(id,custo_anterior_id,animal_id,valor_centavos,peso_relativo,created_at,updated_at) VALUES('ci3','c1','a2',1,1,?,?)",
        )
        .run(agora, agora),
    ).toThrow(/cancelado/);
    for (const t of ['custo_anterior', 'custo_anterior_item'])
      expect(() => b.prepare(`DELETE FROM ${t}`).run()).toThrow(/Exclusão física proibida/);
  });
});
