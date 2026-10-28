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
/** A 0008 é testada até a sua versão: migrations posteriores têm testes próprios. */
const ATE_8 = MIGRACOES_DO_PROJETO.slice(0, 8);

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'rateio.db'));
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
    ['lote1', 'p'],
    ['lote2', 'p'],
    ['lote-outra', 'p2'],
  ] as const)
    b.prepare(
      "INSERT INTO lote(id,propriedade_id,nome,nome_normalizado,finalidade,data_formacao,created_at,updated_at) VALUES(?,?,?,?,'recria','2026-01-01',?,?)",
    ).run(id, prop, id, id, agora, agora);
  for (const [id, prop] of [
    ['a1', 'p'],
    ['a-outra', 'p2'],
  ] as const)
    b.prepare(
      "INSERT INTO animal(id,propriedade_id,identificacao,identificacao_normalizada,sexo,condicao_sexual,categoria,aptidao,origem,data_entrada,created_at,updated_at) VALUES(?,?,?,?,'M','castrado','garrote','corte','comprado','2026-01-01',?,?)",
    ).run(id, prop, id.toUpperCase(), id, agora, agora);
  b.prepare(
    "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES('i1','p','Ração','racao','racao','kg','mn',0,?,?)",
  ).run(agora, agora);
}
function lancamento(
  b: Conexao,
  id: string,
  extra: {
    categoria?: string;
    propriedade?: string;
    destino?: 'propriedade' | 'nenhum' | 'lote' | 'animal';
    natureza?: 'despesa' | 'receita';
    origem?: string;
  } = {},
) {
  const destino = extra.destino ?? 'propriedade';
  b.prepare(
    `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,lote_id,animal_id,condicao_pagamento,comportamento_custo,origem_tipo,origem_id,requisicao_id,created_at,updated_at)
     VALUES(?,?,?,?,'2026-10-01',100001,'Despesa','nao_definida',?,?,?,'nao_informada',?,?,?,?,?,?)`,
  ).run(
    id,
    extra.propriedade ?? 'p',
    extra.categoria ?? CATEGORIA_RESULTADO,
    extra.natureza ?? 'despesa',
    destino,
    destino === 'lote' ? 'lote1' : null,
    destino === 'animal' ? 'a1' : null,
    extra.natureza === 'receita' ? 'nao_se_aplica' : 'nao_classificado',
    extra.origem ?? 'manual',
    extra.origem && extra.origem !== 'manual' ? 'x' : null,
    `req-${id}`,
    agora,
    agora,
  );
}
let ordem = 0;
function movimento(
  b: Conexao,
  id: string,
  extra: { tipo?: string; destino?: string | null; lote?: string | null } = {},
) {
  ordem += 1;
  const tipo = extra.tipo ?? 'saida_consumo';
  const destino = extra.destino === undefined ? 'propriedade' : extra.destino;
  b.prepare(
    `INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_entrada_centavos,destino,lote_animal_id,requisicao_id,created_at,updated_at)
     VALUES(?,'i1','2026-10-01',?,?,1000,'kg',?,?,?,?,?,?)`,
  ).run(
    id,
    ordem,
    tipo,
    tipo.startsWith('entrada') ? 1000 : null,
    destino,
    extra.lote ?? null,
    `r-${id}`,
    agora,
    agora,
  );
}
let seq = 0;
function rateio(
  b: Conexao,
  id: string,
  origemId: string,
  extra: {
    tipo?: string;
    criterio?: string;
    propriedade?: string;
    periodo?: [string, string] | null;
    idade?: number | null;
    substitui?: string | null;
  } = {},
) {
  seq += 1;
  const criterio = extra.criterio ?? 'cabecas';
  b.prepare(
    `INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,periodo_inicio,periodo_fim,idade_maxima_pesagem_dias,motivo,substitui_id,requisicao_id,created_at,updated_at)
     VALUES(?,?,?,?,?,'2026-10-10',?,?,?,'Motivo',?,?,?,?)`,
  ).run(
    id,
    extra.propriedade ?? 'p',
    extra.tipo ?? 'lancamento',
    origemId,
    criterio,
    extra.periodo ? extra.periodo[0] : criterio === 'animal_dias' ? '2026-10-01' : null,
    extra.periodo ? extra.periodo[1] : criterio === 'animal_dias' ? '2026-10-10' : null,
    extra.idade === undefined ? (criterio === 'peso' ? 30 : null) : extra.idade,
    extra.substitui ?? null,
    `rq-${seq}`,
    agora,
    agora,
  );
}
function item(
  b: Conexao,
  id: string,
  rateioId: string,
  alvo: { lote?: string; animal?: string },
  peso = 1,
) {
  b.prepare(
    "INSERT INTO rateio_custo_item(id,rateio_id,lote_id,animal_id,peso_relativo,base_descricao,created_at,updated_at) VALUES(?,?,?,?,?,'base',?,?)",
  ).run(id, rateioId, alvo.lote ?? null, alvo.animal ?? null, peso, agora, agora);
}
async function pronto() {
  const b = await abrir(8);
  popular(b);
  return b;
}

describe('migration 0008: rateio de custos', () => {
  it('aplica do zero e reaplica sem efeito', async () => {
    const b = await abrir(8);
    expect(b.pragma('user_version', { simple: true })).toBe(8);
    expect((await aplicarMigracoes(b, ATE_8)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    expect(linhas(b, 'rateio_custo')).toEqual([]);
    expect(linhas(b, 'rateio_custo_item')).toEqual([]);
  });

  it('migra a versão 7 com dados preservando tudo, na ordem', async () => {
    const b = await abrir(7);
    popular(b);
    lancamento(b, 'l1');
    movimento(b, 'm1');
    const tabelas = [
      'propriedade',
      'lote',
      'animal',
      'estoque_item',
      'movimentacao_estoque',
      'lancamento_financeiro',
      'historico_alteracao',
    ];
    const antes = tabelas.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_8)).aplicadas.map((m) => m.nome)).toEqual([
      'rateio_de_custos',
    ]);
    expect(tabelas.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('a falha no passo final desfaz a migration inteira', async () => {
    const b = await abrir(7);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 7),
      {
        ...MIGRACOES_DO_PROJETO[7]!,
        sql: `${MIGRACOES_DO_PROJETO[7]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(7);
    expect(
      b.prepare("SELECT name FROM sqlite_master WHERE name = 'rateio_custo'").get(),
    ).toBeUndefined();
  });

  it('backup pré-migração da versão 7 é feito antes da 0008 e restaura sem perda', async () => {
    pasta = criarPastaTemporaria();
    const antigo = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 7));
    ambiente = antigo;
    await antigo.gerenciador.abrir();
    popular(antigo.gerenciador.conexao);
    lancamento(antigo.gerenciador.conexao, 'l1');
    const lancamentos = linhas(antigo.gerenciador.conexao, 'lancamento_financeiro');
    const manual = await antigo.backup.criar('manual');
    antigo.gerenciador.fechar();
    const atual = montarAmbiente(pasta.caminho, ATE_8);
    ambiente = atual;
    expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([8]);
    expect(
      (await atual.backup.listar()).some((x) => x.tipo === 'pre_migracao' && x.versaoSchema === 7),
    ).toBe(true);
    const r = await atual.backup.restaurar(manual.id);
    expect(r.migracoesAplicadas).toBe(1);
    expect(atual.gerenciador.conexao.pragma('user_version', { simple: true })).toBe(8);
    expect(linhas(atual.gerenciador.conexao, 'lancamento_financeiro')).toEqual(lancamentos);
  });
});

describe('migration 0008: proteções do banco', () => {
  it('só despesa ativa da propriedade, manual e sem destino de lote ou animal aceita rateio', async () => {
    const b = await pronto();
    lancamento(b, 'ok');
    lancamento(b, 'sem-destino', { destino: 'nenhum' });
    lancamento(b, 'a-lote', { destino: 'lote' });
    lancamento(b, 'a-animal', { destino: 'animal' });
    const categoriaReceita = (
      b.prepare("SELECT id FROM categoria_financeira WHERE natureza = 'receita' LIMIT 1").get() as {
        id: string;
      }
    ).id;
    lancamento(b, 'receita', { natureza: 'receita', categoria: categoriaReceita });
    lancamento(b, 'estoque', { categoria: CATEGORIA_ESTOQUE });
    lancamento(b, 'sanitario', { origem: 'sanitario' });
    lancamento(b, 'outra', { propriedade: 'p2' });
    lancamento(b, 'cancelado');
    b.prepare(
      "UPDATE lancamento_financeiro SET deleted_at='2026-10-16', motivo_cancelamento='x' WHERE id='cancelado'",
    ).run();
    for (const id of [
      'a-lote',
      'a-animal',
      'receita',
      'estoque',
      'sanitario',
      'outra',
      'cancelado',
      'inexistente',
    ])
      expect(() => rateio(b, `r-${id}`, id), id).toThrow(/Origem não elegível/);
    rateio(b, 'r-ok', 'ok');
    rateio(b, 'r-nenhum', 'sem-destino');
  });

  it('só consumo ativo da propriedade, fora de registro sanitário, aceita rateio', async () => {
    const b = await pronto();
    movimento(b, 'consumo');
    movimento(b, 'perda', { tipo: 'saida_perda' });
    movimento(b, 'venda', { tipo: 'saida_venda' });
    movimento(b, 'entrada', { tipo: 'entrada_compra', destino: null });
    movimento(b, 'a-lote', { destino: 'lote', lote: 'lote1' });
    movimento(b, 'cancelado');
    b.prepare("UPDATE movimentacao_estoque SET deleted_at='2026-10-16' WHERE id='cancelado'").run();
    for (const id of ['venda', 'entrada', 'a-lote', 'cancelado'])
      expect(() => rateio(b, `r-${id}`, id, { tipo: 'movimentacao_estoque' }), id).toThrow(
        /Origem não elegível/,
      );
    rateio(b, 'r-consumo', 'consumo', { tipo: 'movimentacao_estoque' });
    rateio(b, 'r-perda', 'perda', { tipo: 'movimentacao_estoque' });
  });

  it('um custo tem no máximo um rateio ativo; cancelado, ganha outro', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    rateio(b, 'r1', 'l1');
    expect(() => rateio(b, 'r2', 'l1')).toThrow(/UNIQUE/);
    b.prepare(
      "UPDATE rateio_custo SET deleted_at='2026-10-16', motivo_cancelamento='revisão' WHERE id='r1'",
    ).run();
    rateio(b, 'r2', 'l1', { substitui: 'r1' });
    expect(
      (
        b.prepare('SELECT COUNT(*) AS n FROM rateio_custo WHERE deleted_at IS NULL').get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
  });

  it('coerência do critério: animal-dias exige período, peso exige idade máxima, motivo de cancelamento só com cancelamento', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    lancamento(b, 'l2');
    lancamento(b, 'l3');
    lancamento(b, 'l4');
    expect(() =>
      rateio(b, 'x1', 'l1', { criterio: 'animal_dias', periodo: null, idade: null }),
    ).not.toThrow(); // o helper preenche o período padrão para animal_dias
    expect(() =>
      b
        .prepare(
          "INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,motivo,requisicao_id,created_at,updated_at) VALUES('x2','p','lancamento','l2','animal_dias','2026-10-10','m','q2',?,?)",
        )
        .run(agora, agora),
    ).toThrow(/CHECK/);
    expect(() =>
      b
        .prepare(
          "INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,motivo,requisicao_id,created_at,updated_at) VALUES('x3','p','lancamento','l3','peso','2026-10-10','m','q3',?,?)",
        )
        .run(agora, agora),
    ).toThrow(/CHECK/);
    expect(() =>
      b
        .prepare(
          "INSERT INTO rateio_custo(id,propriedade_id,origem_tipo,origem_id,criterio,data_base,motivo,requisicao_id,created_at,updated_at) VALUES('x4','p','lancamento','l4','cabecas','2026-10-10','','q4',?,?)",
        )
        .run(agora, agora),
    ).toThrow(/CHECK/);
    expect(() =>
      b.prepare("UPDATE rateio_custo SET deleted_at='2026-10-16' WHERE id='x1'").run(),
    ).toThrow(/CHECK/);
  });

  it('destinos: lote ou animal da mesma propriedade, sem repetir, e só com o rateio ativo', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    rateio(b, 'r1', 'l1');
    expect(() => item(b, 'i-nenhum', 'r1', {})).toThrow(/CHECK/);
    expect(() => item(b, 'i-ambos', 'r1', { lote: 'lote1', animal: 'a1' })).toThrow(/CHECK/);
    expect(() => item(b, 'i-peso0', 'r1', { lote: 'lote1' }, 0)).toThrow(/CHECK/);
    expect(() => item(b, 'i-outra', 'r1', { lote: 'lote-outra' })).toThrow(/outra propriedade/);
    expect(() => item(b, 'i-animal-outra', 'r1', { animal: 'a-outra' })).toThrow(
      /outra propriedade/,
    );
    item(b, 'i1', 'r1', { lote: 'lote1' }, 3);
    item(b, 'i2', 'r1', { animal: 'a1' }, 2);
    expect(() => item(b, 'i3', 'r1', { lote: 'lote1' })).toThrow(/UNIQUE/);
    expect(() => item(b, 'i4', 'r1', { animal: 'a1' })).toThrow(/UNIQUE/);
    b.prepare(
      "UPDATE rateio_custo SET deleted_at='2026-10-16', motivo_cancelamento='x' WHERE id='r1'",
    ).run();
    expect(() => item(b, 'i5', 'r1', { lote: 'lote2' })).toThrow(/rateio cancelado/);
  });

  it('rateio e pesos são imutáveis; só o cancelamento é permitido; exclusão física proibida', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    rateio(b, 'r1', 'l1');
    item(b, 'i1', 'r1', { lote: 'lote1' });
    for (const sql of [
      "UPDATE rateio_custo SET criterio='manual' WHERE id='r1'",
      "UPDATE rateio_custo SET data_base='2026-10-11' WHERE id='r1'",
      "UPDATE rateio_custo SET motivo='outro' WHERE id='r1'",
      "UPDATE rateio_custo SET origem_id='l2' WHERE id='r1'",
      "UPDATE rateio_custo SET propriedade_id='p2' WHERE id='r1'",
      "UPDATE rateio_custo_item SET peso_relativo=9 WHERE id='i1'",
      "UPDATE rateio_custo_item SET lote_id='lote2' WHERE id='i1'",
    ])
      expect(() => b.prepare(sql).run(), sql).toThrow(/cancelado|não mudam/);
    expect(() => b.prepare("DELETE FROM rateio_custo WHERE id='r1'").run()).toThrow(
      /Exclusão física proibida/,
    );
    expect(() => b.prepare("DELETE FROM rateio_custo_item WHERE id='i1'").run()).toThrow(
      /Exclusão física proibida/,
    );
    b.prepare(
      "UPDATE rateio_custo SET deleted_at='2026-10-16', motivo_cancelamento='x', updated_at='2026-10-16' WHERE id='r1'",
    ).run();
    // Cancelado, nada mais muda (nem o motivo do cancelamento).
    expect(() =>
      b.prepare("UPDATE rateio_custo SET motivo_cancelamento='y' WHERE id='r1'").run(),
    ).toThrow(/cancelado/);
  });
});
