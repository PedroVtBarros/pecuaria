import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';

/* Migration 0016 (ajustes da aprovação da 5C). Nomes, textos e números fictícios (regra 1). */
let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  pasta?.limpar();
});
const agora = '2026-10-21T12:00:00.000Z';
const ATE_16 = MIGRACOES_DO_PROJETO.slice(0, 16);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'base.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}
function inserir(b: Conexao, tabela: string, campos: Record<string, unknown>) {
  const cols = Object.keys(campos);
  b.prepare(
    `INSERT INTO ${tabela}(${cols.join(',')},created_at,updated_at) VALUES(${cols.map(() => '?').join(',')},?,?)`,
  ).run(...Object.values(campos), agora, agora);
}
function popular(b: Conexao) {
  inserir(b, 'fonte', {
    id: 'fe',
    origem: 'estudo_individual',
    codigo: 'E_TESTE',
    codigo_normalizado: 'E_TESTE',
    titulo: 'Fonte fictícia de teste',
    autores: 'Autor fictício',
    ano: 2020,
  });
  inserir(b, 'alimento', {
    id: 'a',
    nome: 'Alimento de teste',
    nome_normalizado: 'alimento de teste',
    forma_conservacao: 'outro',
    classe: 'outro',
    comercial: 0,
  });
  inserir(b, 'nutriente', {
    id: 'nt',
    codigo: 'TESTE_A',
    codigo_normalizado: 'TESTE_A',
    nome: 'Nutriente de teste',
    grupo: 'outro',
    unidade_referencia: 'pct',
    base_referencia: 'ms',
    situacao_fundamentacao: 'pendente',
    direcao_conservadora: 'nao_definida',
    origem_definicao: 'usuario',
  });
  inserir(b, 'registro_composicao', {
    id: 'r1',
    alimento_id: 'a',
    fonte_id: 'fe',
    referencia_local: 'Tabela fictícia',
    separador_decimal: 'virgula',
    status: 'rascunho',
  });
}
function valor(b: Conexao, id: string, extra: Record<string, unknown> = {}) {
  inserir(b, 'valor_nutricional', {
    id,
    registro_id: 'r1',
    nutriente_id: 'nt',
    valor_publicado: '10,5',
    valor: 10.5,
    unidade: 'pct',
    base: 'ms',
    tipo_valor: 'media',
    ...extra,
  });
}

describe('migration 0016: base interpretada', () => {
  it('aplica do zero e reaplica sem efeito; arquivo sem INSERT', async () => {
    const b = await abrir(16);
    expect(b.pragma('user_version', { simple: true })).toBe(16);
    expect((await aplicarMigracoes(b, ATE_16)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '0016_base_interpretada.sql'),
      'utf8',
    );
    expect([...sql.matchAll(/INSERT\s+INTO/gi)]).toEqual([]);
  });

  it('migra a versão 15 com dados: valores antigos ficam com a base declarada, nada mais muda', async () => {
    const b = await abrir(15);
    popular(b);
    valor(b, 'v');
    const tabelas = (
      b
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_migracoes','valor_nutricional') ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((t) => t.name);
    const antes = tabelas.map((t) => hash(linhas(b, t)));
    const valorAntes = linhas(b, 'valor_nutricional');
    expect((await aplicarMigracoes(b, ATE_16)).aplicadas.map((m) => m.nome)).toEqual([
      'base_interpretada',
    ]);
    expect(tabelas.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(linhas(b, 'valor_nutricional')).toEqual(
      (valorAntes as Record<string, unknown>[]).map((v) => ({ ...v, interpretacao_base: null })),
    );
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('interpretação vazia ou longa demais é recusada', async () => {
    const b = await abrir(16);
    popular(b);
    valor(b, 'v1', { interpretacao_base: 'Justificativa fictícia da base.' });
    expect(() => valor(b, 'v2', { interpretacao_base: '   ' })).toThrow(/CHECK/);
    expect(() => valor(b, 'v3', { interpretacao_base: 'x'.repeat(501) })).toThrow(/CHECK/);
    expect(() =>
      b.prepare("UPDATE valor_nutricional SET interpretacao_base = '' WHERE id = 'v1'").run(),
    ).toThrow(/CHECK/);
  });
});
