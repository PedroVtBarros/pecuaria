import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';

/*
 * Migration 0013 (Fase 5B-1). Nomes, textos e números fictícios: provam regras de armazenamento,
 * não representam composição nem legenda de fonte nenhuma (CLAUDE.md, regra 1).
 */
let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  pasta?.limpar();
});
const agora = '2026-10-21T12:00:00.000Z';
const ATE_13 = MIGRACOES_DO_PROJETO.slice(0, 13);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'vnq.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}

function tabelas(b: Conexao): string[] {
  return (
    b
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migracoes' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((t) => t.name);
}

const ins = (b: Conexao, sql: string, ...p: unknown[]) => b.prepare(sql).run(...p, agora, agora);
function inserir(b: Conexao, tabela: string, campos: Record<string, unknown>) {
  const cols = Object.keys(campos);
  b.prepare(
    `INSERT INTO ${tabela}(${cols.join(',')},created_at,updated_at) VALUES(${cols.map(() => '?').join(',')},?,?)`,
  ).run(...Object.values(campos), agora, agora);
}

/** Banco com uma propriedade, fontes de cada origem, um alimento, uma definição e registros. */
function popular(b: Conexao) {
  ins(
    b,
    "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Fazenda','fazenda','misto',?,?)",
  );
  ins(
    b,
    "INSERT INTO fonte(id,origem,codigo,codigo_normalizado,titulo,autores,ano,created_at,updated_at) VALUES('fe','estudo_individual','E_TESTE','E_TESTE','Fonte fictícia de teste','Autor fictício',2020,?,?)",
  );
  ins(
    b,
    "INSERT INTO fonte(id,origem,titulo,laboratorio,propriedade_id,created_at,updated_at) VALUES('fl','laboratorial','Fonte fictícia de teste','Laboratório fictício','p',?,?)",
  );
  ins(
    b,
    "INSERT INTO fonte(id,origem,titulo,fabricante,created_at,updated_at) VALUES('fr','rotulo_comercial','Fonte fictícia de teste','Fabricante fictício',?,?)",
  );
  ins(
    b,
    "INSERT INTO alimento(id,nome,nome_normalizado,forma_conservacao,classe,comercial,created_at,updated_at) VALUES('a','Alimento de teste','alimento de teste','outro','outro',0,?,?)",
  );
  ins(
    b,
    "INSERT INTO nutriente(id,codigo,codigo_normalizado,nome,grupo,unidade_referencia,base_referencia,situacao_fundamentacao,direcao_conservadora,origem_definicao,created_at,updated_at) VALUES('nt','TESTE_A','TESTE_A','Nutriente de teste','outro','pct','ms','pendente','nao_definida','usuario',?,?)",
  );
  const registro = (id: string, fonteId: string, extra: Record<string, unknown>) =>
    inserir(b, 'registro_composicao', {
      id,
      alimento_id: 'a',
      fonte_id: fonteId,
      separador_decimal: 'virgula',
      status: 'rascunho',
      ...extra,
    });
  registro('re', 'fe', { referencia_local: 'Tabela fictícia 1' });
  registro('rl', 'fl', { data_amostra: '2026-10-01' });
  registro('rr', 'fr', {});
}

function naoQuantificado(b: Conexao, id: string, extra: Record<string, unknown> = {}) {
  inserir(b, 'valor_nao_quantificado', {
    id,
    registro_id: 're',
    nutriente_id: 'nt',
    texto_publicado: 'ND',
    natureza: 'nao_detectado',
    significado_fonte: 'Legenda fictícia: ND = não detectado.',
    unidade: 'pct',
    base: 'ms',
    tipo_valor: 'media',
    ...extra,
  });
}
function numerico(b: Conexao, id: string, extra: Record<string, unknown> = {}) {
  inserir(b, 'valor_nutricional', {
    id,
    registro_id: 're',
    nutriente_id: 'nt',
    valor_publicado: '10,5',
    valor: 10.5,
    unidade: 'pct',
    base: 'ms',
    tipo_valor: 'media',
    ...extra,
  });
}

describe('migration 0013: valores não quantificados', () => {
  it('aplica do zero e reaplica sem efeito; a tabela não tem coluna numérica', async () => {
    const b = await abrir(13);
    expect(b.pragma('user_version', { simple: true })).toBe(13);
    expect((await aplicarMigracoes(b, ATE_13)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    const colunas = (b.pragma('table_info(valor_nao_quantificado)') as { type: string }[]).map(
      (c) => c.type,
    );
    expect(colunas.every((t) => t === 'TEXT' || t === 'INTEGER')).toBe(true);
    expect(colunas).not.toContain('REAL');
    expect(linhas(b, 'valor_nao_quantificado')).toEqual([]);
  });

  it('o arquivo não insere nada', () => {
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '0013_valores_nao_quantificados.sql'),
      'utf8',
    );
    expect([...sql.matchAll(/INSERT\s+INTO/gi)]).toEqual([]);
  });

  it('migra a versão 12 com dados sem tocar nas tabelas anteriores', async () => {
    const b = await abrir(12);
    popular(b);
    numerico(b, 'v');
    const anteriores = tabelas(b);
    const antes = anteriores.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_13)).aplicadas.map((m) => m.nome)).toEqual([
      'valores_nao_quantificados',
    ]);
    expect(anteriores.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(tabelas(b)).toEqual([...anteriores, 'valor_nao_quantificado'].sort());
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('a falha no passo final desfaz a migration, inclusive os gatilhos substituídos', async () => {
    const b = await abrir(12);
    popular(b);
    const gatilhos = () =>
      b.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all();
    const antes = gatilhos();
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 12),
      {
        ...MIGRACOES_DO_PROJETO[12]!,
        sql: `${MIGRACOES_DO_PROJETO[12]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(12);
    expect(gatilhos()).toEqual(antes);
    expect(
      b.prepare("SELECT name FROM sqlite_master WHERE name = 'valor_nao_quantificado'").get(),
    ).toBeUndefined();
  });

  it('texto, natureza e significado obrigatórios; símbolo do limite conferido', async () => {
    const b = await abrir(13);
    popular(b);
    naoQuantificado(b, 'q1');
    naoQuantificado(b, 'q2', {
      texto_publicado: '<0,01',
      natureza: 'abaixo_do_limite',
      base: 'mn',
    });
    naoQuantificado(b, 'q3', {
      texto_publicado: '≥ 5',
      natureza: 'acima_do_limite',
      tipo_valor: 'mediana',
    });
    for (const [extra, erro] of [
      [{ texto_publicado: '' }, /CHECK/],
      [{ texto_publicado: ' ND' }, /CHECK/],
      [{ significado_fonte: '  ' }, /CHECK/],
      [{ natureza: 'zero' }, /CHECK/],
      [{ natureza: 'abaixo_do_limite' }, /CHECK/],
      [{ texto_publicado: '>1', natureza: 'abaixo_do_limite' }, /CHECK/],
      [{ texto_publicado: '<1', natureza: 'nao_detectado' }, /CHECK/],
      [{ tipo_valor: 'minimo_garantido' }, /CHECK/],
      [{ unidade: 'mcal_kg' }, /incompatível/],
    ] as const)
      expect(
        () => naoQuantificado(b, 'x', { tipo_valor: 'valor_unico', ...extra }),
        JSON.stringify(extra),
      ).toThrow(erro);
    // Mesmo nutriente, tipo e base: um só, e nunca junto com um número.
    expect(() => naoQuantificado(b, 'x')).toThrow(/UNIQUE/);
    expect(() => numerico(b, 'x')).toThrow(/não quantificado/);
    numerico(b, 'v', { tipo_valor: 'valor_unico' });
    expect(() => naoQuantificado(b, 'x', { tipo_valor: 'valor_unico' })).toThrow(/numérico/);
    expect(() =>
      b
        .prepare("UPDATE valor_nao_quantificado SET tipo_valor = 'valor_unico' WHERE id = 'q1'")
        .run(),
    ).toThrow(/numérico/);
    // Exclusão lógica libera a chave para o outro tipo.
    b.prepare("UPDATE valor_nao_quantificado SET deleted_at = ? WHERE id = 'q1'").run(agora);
    numerico(b, 'v2');
    expect(() => b.prepare('DELETE FROM valor_nao_quantificado').run()).toThrow(/Exclusão física/);
  });

  it('origem: tabela, estudo e laudo; laudo sem mediana; rótulo recusado', async () => {
    const b = await abrir(13);
    popular(b);
    naoQuantificado(b, 'ql', { registro_id: 'rl', tipo_valor: 'valor_unico' });
    expect(() => naoQuantificado(b, 'x', { registro_id: 'rl', tipo_valor: 'mediana' })).toThrow(
      /incompatível/,
    );
    expect(() => naoQuantificado(b, 'x', { registro_id: 'rr' })).toThrow(/incompatível/);
  });

  it('só em rascunho; conta para transcrever; congela a definição', async () => {
    const b = await abrir(13);
    popular(b);
    naoQuantificado(b, 'q');
    // Um registro só com valor não quantificado pode ser transcrito.
    b.prepare(
      "UPDATE registro_composicao SET status = 'transcrito', transcrito_por = 'Pessoa Teste', transcrito_em = ? WHERE id = 're'",
    ).run(agora);
    expect(() =>
      b
        .prepare("UPDATE valor_nao_quantificado SET significado_fonte = 'Outro' WHERE id = 'q'")
        .run(),
    ).toThrow(/só mudam em registro em rascunho/);
    expect(() => naoQuantificado(b, 'x', { tipo_valor: 'valor_unico' })).toThrow(
      /só entram em registro em rascunho/,
    );
    // Registro sem valor de nenhum tipo continua não transcrito.
    expect(() =>
      b
        .prepare(
          "UPDATE registro_composicao SET status = 'transcrito', transcrito_por = 'P', transcrito_em = ? WHERE id = 'rl'",
        )
        .run(agora),
    ).toThrow(/sem valores/);
    expect(() =>
      b.prepare("UPDATE nutriente SET unidade_referencia = 'g_kg' WHERE id = 'nt'").run(),
    ).toThrow(/cadastre a variante/);
    b.prepare("UPDATE nutriente SET nome = 'Nome corrigido' WHERE id = 'nt'").run();
  });
});
