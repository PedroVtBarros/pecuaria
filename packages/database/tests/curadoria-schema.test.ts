import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFINICOES_CURADORIA_5B,
  DEFINICOES_INICIAIS_NUTRIENTES,
  normalizarCodigo,
} from '@pecuaria/domain';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';

/* Migration 0014 (Fase 5B-2). Nomes e números fictícios (CLAUDE.md, regra 1). */
let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  pasta?.limpar();
});
const agora = '2026-10-21T12:00:00.000Z';
const ATE_14 = MIGRACOES_DO_PROJETO.slice(0, 14);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'curadoria.db'));
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

function fonte(b: Conexao) {
  b.prepare(
    "INSERT INTO fonte(id,origem,codigo,codigo_normalizado,titulo,autores,ano,created_at,updated_at) VALUES('f','tabela_compilada','TESTE_FONTE','TESTE_FONTE','Fonte fictícia de teste','Autoria fictícia',2020,?,?)",
  ).run(agora, agora);
}
function importacao(b: Conexao, id: string, extra: Record<string, unknown> = {}) {
  const campos: Record<string, unknown> = {
    id,
    pacote_codigo: 'TESTE_PACOTE',
    pacote_versao: 1,
    fonte_id: 'f',
    n_alimentos_criados: 1,
    n_registros: 1,
    n_valores: 2,
    resumo_json: '{"registros":["r"]}',
    importado_em: agora,
    ...extra,
  };
  const cols = Object.keys(campos);
  b.prepare(
    `INSERT INTO importacao_curadoria(${cols.join(',')},created_at,updated_at) VALUES(${cols.map(() => '?').join(',')},?,?)`,
  ).run(...Object.values(campos), agora, agora);
}

describe('migration 0014: curadoria', () => {
  it('aplica do zero e reaplica sem efeito; catálogo igual às definições do sistema', async () => {
    const b = await abrir(14);
    expect(b.pragma('user_version', { simple: true })).toBe(14);
    expect((await aplicarMigracoes(b, ATE_14)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(linhas(b, 'importacao_curadoria')).toEqual([]);
    expect(
      b
        .prepare(
          'SELECT id,codigo,codigo_normalizado,nome,grupo,unidade_referencia,base_referencia,metodo_analitico,situacao_fundamentacao,direcao_conservadora,origem_definicao FROM nutriente ORDER BY rowid',
        )
        .all(),
    ).toEqual(
      // Catálogo da versão 14; a 0018 acrescenta a PBeqNNP depois.
      [...DEFINICOES_INICIAIS_NUTRIENTES, ...DEFINICOES_CURADORIA_5B].map((d) => ({
        id: d.id,
        codigo: d.codigo,
        codigo_normalizado: normalizarCodigo(d.codigo),
        nome: d.nome,
        grupo: d.grupo,
        unidade_referencia: d.unidadeReferencia,
        base_referencia: d.baseReferencia,
        metodo_analitico: null,
        situacao_fundamentacao: 'pendente',
        direcao_conservadora: d.direcaoConservadora,
        origem_definicao: 'sistema',
      })),
    );
  });

  it('o arquivo só insere a definição: nenhuma fonte, alimento, registro ou valor', () => {
    const sql = readFileSync(join(__dirname, '..', 'migrations', '0014_curadoria.sql'), 'utf8');
    expect([...sql.matchAll(/INSERT\s+INTO\s+(\w+)/gi)].map((m) => m[1])).toEqual(['nutriente']);
  });

  it('migra a versão 13 com dados sem tocar nas tabelas anteriores, exceto a nova definição', async () => {
    const b = await abrir(13);
    fonte(b);
    const anteriores = tabelas(b);
    const antes = anteriores.map((t) => [t, hash(linhas(b, t))]);
    expect((await aplicarMigracoes(b, ATE_14)).aplicadas.map((m) => m.nome)).toEqual(['curadoria']);
    const depois = anteriores.map((t) => [t, hash(linhas(b, t))]);
    expect(depois.filter(([t]) => t !== 'nutriente')).toEqual(
      antes.filter(([t]) => t !== 'nutriente'),
    );
    expect((linhas(b, 'nutriente') as { codigo: string }[]).at(-1)!.codigo).toBe('FDNcp');
    expect(tabelas(b)).toEqual([...anteriores, 'importacao_curadoria'].sort());
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('a falha no passo final desfaz a migration', async () => {
    const b = await abrir(13);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 13),
      {
        ...MIGRACOES_DO_PROJETO[13]!,
        sql: `${MIGRACOES_DO_PROJETO[13]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(13);
    expect(b.prepare("SELECT 1 FROM nutriente WHERE codigo = 'FDNcp'").get()).toBeUndefined();
    expect(
      b.prepare("SELECT name FROM sqlite_master WHERE name = 'importacao_curadoria'").get(),
    ).toBeUndefined();
  });

  it('importação: uma por pacote e versão, imutável, sem exclusão, resumo em objeto JSON', async () => {
    const b = await abrir(14);
    fonte(b);
    importacao(b, 'i1');
    expect(() => importacao(b, 'i2')).toThrow(/UNIQUE/);
    importacao(b, 'i2', { pacote_versao: 2 });
    for (const [extra, erro] of [
      [{ pacote_codigo: 'com espaço' }, /CHECK/],
      [{ pacote_versao: 0 }, /CHECK/],
      [{ n_registros: 0 }, /CHECK/],
      [{ resumo_json: '[]' }, /CHECK/],
      [{ resumo_json: 'x' }, /CHECK/],
      [{ fonte_id: 'nao-existe' }, /FOREIGN KEY/],
    ] as const)
      expect(
        () => importacao(b, 'x', { pacote_versao: 9, ...extra }),
        JSON.stringify(extra),
      ).toThrow(erro);
    expect(() => b.prepare('UPDATE importacao_curadoria SET n_valores = 3').run()).toThrow(
      /não muda/,
    );
    expect(() => b.prepare('DELETE FROM importacao_curadoria').run()).toThrow(/Exclusão física/);
    // A definição nova é do sistema: nome, unidade e base protegidos.
    expect(() =>
      b.prepare("UPDATE nutriente SET unidade_referencia = 'g_kg' WHERE codigo = 'FDNcp'").run(),
    ).toThrow(/não mudam/);
  });
});
