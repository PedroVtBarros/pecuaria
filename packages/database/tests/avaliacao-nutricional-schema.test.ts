import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria, montarAmbiente, type Ambiente } from './apoio';

/*
 * Migration 0019 (Fase 6B-4): avaliação nutricional imutável. Nomes, textos e números fictícios
 * (CLAUDE.md, regra 1); os JSON são só estrutura, sem composição real.
 */
let db: Conexao | undefined;
let ambiente: Ambiente | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  ambiente?.gerenciador.fechar();
  ambiente = undefined;
  pasta?.limpar();
  pasta = undefined;
});
const agora = '2026-10-26T12:00:00.000Z';
const ATE_19 = MIGRACOES_DO_PROJETO.slice(0, 19);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) =>
  b.prepare(`SELECT rowid AS _rowid, * FROM ${t} ORDER BY rowid`).all();
const tabelas = (b: Conexao) =>
  (
    b
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migracoes' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((t) => t.name);

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'avaliacao.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}
function inserir(b: Conexao, tabela: string, campos: Record<string, unknown>) {
  const cols = Object.keys(campos);
  b.prepare(
    `INSERT INTO ${tabela}(${cols.join(',')},created_at,updated_at) VALUES(${cols.map(() => '?').join(',')},?,?)`,
  ).run(...Object.values(campos), agora, agora);
}

/** Alimento, regra aprovada e perfil fictícios (versão 17 em diante). */
function popularPerfil(b: Conexao) {
  inserir(b, 'alimento', {
    id: 'a',
    nome: 'Alimento de teste',
    nome_normalizado: 'alimento de teste',
    forma_conservacao: 'outro',
    classe: 'outro',
    comercial: 0,
  });
  inserir(b, 'aprovacao_regra_selecao', {
    id: 'ap',
    regra_codigo: 'REGRA_TESTE',
    regra_versao: 1,
    conteudo_hash: 'a'.repeat(64),
    aprovado_por: 'Pessoa fictícia',
    aprovado_em: agora,
  });
  for (const id of ['p1', 'p2'])
    inserir(b, 'perfil_composicao', {
      id,
      alimento_id: 'a',
      nome: `Perfil fictício ${id}`,
      tipo: 'agregado_central',
      cenario: 'central',
      nivel: 'especifico',
      regra_codigo: 'REGRA_TESTE',
      regra_versao: 1,
      diferencas_json: '[]',
      limitacoes_json: '[]',
      nao_quantificados_json: '[]',
      selecao_json: '{}',
      criado_por: 'Pessoa fictícia',
      criado_em: agora,
    });
}
const PERFIS = JSON.stringify([
  { perfilId: 'p1', nome: 'Perfil fictício p1', alimentoNome: 'Alimento de teste', elegivel: true },
  {
    perfilId: 'p2',
    nome: 'Perfil fictício p2',
    alimentoNome: 'Alimento de teste',
    elegivel: false,
  },
]);
const avaliacao = (b: Conexao, id: string, extra: Record<string, unknown> = {}) =>
  inserir(b, 'avaliacao_nutricional', {
    id,
    rotulo: 'Avaliação fictícia',
    observacao: null,
    formato_versao: 1,
    versao_motor: '0.0.0-teste',
    tipo_quantidade: 'consumo_assumido_sem_sobras',
    fonte_json: '{"obra":"fictícia"}',
    entrada_json: '{}',
    hipoteses_json: '{"textos":[]}',
    perfis_json: PERFIS,
    resultado_json: '{}',
    conteudo_sha256: 'b'.repeat(64),
    registrado_por: 'Pessoa fictícia',
    registrado_em: agora,
    ...extra,
  });
const perfilDa = (b: Conexao, id: string, perfil: string, ordem: number, elegivel: number) =>
  inserir(b, 'avaliacao_nutricional_perfil', {
    id,
    avaliacao_id: 'av',
    perfil_id: perfil,
    ordem,
    elegivel,
  });

describe('migration 0019: avaliação nutricional imutável', () => {
  it('aplica do zero e reaplica sem efeito; arquivo sem INSERT', async () => {
    const b = await abrir(19);
    expect(b.pragma('user_version', { simple: true })).toBe(19);
    expect((await aplicarMigracoes(b, ATE_19)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(tabelas(b)).toEqual(
      expect.arrayContaining(['avaliacao_nutricional', 'avaliacao_nutricional_perfil']),
    );
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '0019_avaliacao_nutricional.sql'),
      'utf8',
    );
    expect([...sql.matchAll(/INSERT\s+INTO/gi)]).toEqual([]);
    expect([...sql.matchAll(/(ALTER|DROP)\s+TABLE/gi)]).toEqual([]);
  });

  it('migra a versão 18 com dados sem mudar nenhuma tabela existente', async () => {
    const b = await abrir(18);
    popularPerfil(b);
    const nomes = tabelas(b);
    const antes = nomes.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_19)).aplicadas.map((m) => m.nome)).toEqual([
      'avaliacao_nutricional',
    ]);
    expect(nomes.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('backup pré-migração da versão 18 é feito antes da 0019 e restaura sem perda', async () => {
    pasta = criarPastaTemporaria();
    const antigo = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 18));
    ambiente = antigo;
    await antigo.gerenciador.abrir();
    popularPerfil(antigo.gerenciador.conexao);
    const perfis = linhas(antigo.gerenciador.conexao, 'perfil_composicao');
    antigo.gerenciador.fechar();
    const atual = montarAmbiente(pasta.caminho, ATE_19);
    ambiente = atual;
    expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([19]);
    const pre = (await atual.backup.listar()).find(
      (x) => x.tipo === 'pre_migracao' && x.versaoSchema === 18,
    );
    expect(pre).toBeDefined();
    avaliacao(atual.gerenciador.conexao, 'av');
    const r = await atual.backup.restaurar(pre!.id);
    expect(r.migracoesAplicadas).toBe(1);
    const c = atual.gerenciador.conexao;
    expect(c.pragma('user_version', { simple: true })).toBe(19);
    expect(linhas(c, 'perfil_composicao')).toEqual(perfis);
    expect(linhas(c, 'avaliacao_nutricional')).toEqual([]);
    expect(c.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(c.pragma('foreign_key_check')).toEqual([]);
  });

  it('uma avaliação gravada também volta intacta de um backup manual', async () => {
    pasta = criarPastaTemporaria();
    const amb = montarAmbiente(pasta.caminho, ATE_19);
    ambiente = amb;
    await amb.gerenciador.abrir();
    const c = amb.gerenciador.conexao;
    popularPerfil(c);
    avaliacao(c, 'av');
    perfilDa(c, 'x1', 'p1', 1, 1);
    const gravadas = [
      linhas(c, 'avaliacao_nutricional'),
      linhas(c, 'avaliacao_nutricional_perfil'),
    ];
    const manual = await amb.backup.criar('manual');
    avaliacao(c, 'outra');
    await amb.backup.restaurar(manual.id);
    const d = amb.gerenciador.conexao;
    expect([linhas(d, 'avaliacao_nutricional'), linhas(d, 'avaliacao_nutricional_perfil')]).toEqual(
      gravadas,
    );
  });
});

describe('migration 0019: proteções do banco', () => {
  async function pronto() {
    const b = await abrir(19);
    b.pragma('foreign_keys = ON');
    popularPerfil(b);
    return b;
  }

  it('sem alteração nem exclusão, nas duas tabelas', async () => {
    const b = await pronto();
    avaliacao(b, 'av');
    perfilDa(b, 'x1', 'p1', 1, 1);
    for (const [t, id] of [
      ['avaliacao_nutricional', 'av'],
      ['avaliacao_nutricional_perfil', 'x1'],
    ] as const) {
      expect(() => b.prepare(`UPDATE ${t} SET updated_at = 'x' WHERE id = ?`).run(id)).toThrow(
        /imutável: grave outra/,
      );
      expect(() => b.prepare(`DELETE FROM ${t} WHERE id = ?`).run(id)).toThrow(/não é excluída/);
    }
    expect(() =>
      b.prepare("UPDATE avaliacao_nutricional SET deleted_at = ? WHERE id = 'av'").run(agora),
    ).toThrow(/imutável/);
  });

  it('JSON validado: tipo de cada coluna, lista de perfis não vazia, hash em hexadecimal', async () => {
    const b = await pronto();
    for (const [i, extra] of [
      { entrada_json: 'não é json' },
      { entrada_json: '[]' },
      { perfis_json: '[]' },
      { perfis_json: '{}' },
      { resultado_json: '[]' },
      { hipoteses_json: '"texto"' },
      { conteudo_sha256: 'B'.repeat(64) },
      { conteudo_sha256: 'b'.repeat(63) },
      { tipo_quantidade: 'formulada' },
      { rotulo: ' com espaço ' },
      { formato_versao: 0 },
      { deleted_at: agora },
    ].entries())
      expect(() => avaliacao(b, `bad-${i}`, extra), JSON.stringify(extra)).toThrow(/CHECK/);
    expect(linhas(b, 'avaliacao_nutricional')).toEqual([]);
  });

  it('perfil listado tem de existir e estar no retrato, na mesma posição e elegibilidade', async () => {
    const b = await pronto();
    avaliacao(b, 'av');
    perfilDa(b, 'x1', 'p1', 1, 1);
    perfilDa(b, 'x2', 'p2', 2, 0);
    expect(() => perfilDa(b, 'x3', 'p2', 1, 0)).toThrow(/fora do retrato/);
    expect(() => perfilDa(b, 'x4', 'p1', 2, 1)).toThrow(/fora do retrato/);
    expect(() => perfilDa(b, 'x5', 'p2', 2, 1)).toThrow(/fora do retrato/);
    expect(() => perfilDa(b, 'x6', 'p1', 1, 1)).toThrow(/UNIQUE/);
    expect(() =>
      inserir(b, 'avaliacao_nutricional_perfil', {
        id: 'x7',
        avaliacao_id: 'inexistente',
        perfil_id: 'p1',
        ordem: 1,
        elegivel: 1,
      }),
    ).toThrow(/fora do retrato|FOREIGN KEY/);
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('migration 0020: anulação de avaliação nutricional', () => {
  const ATE_20 = MIGRACOES_DO_PROJETO.slice(0, 20);
  const anular = (b: Conexao, id: string, extra: Record<string, unknown> = {}) =>
    inserir(b, 'anulacao_avaliacao_nutricional', {
      id,
      avaliacao_id: 'av',
      motivo: 'Motivo fictício.',
      anulado_por: 'Pessoa fictícia',
      anulado_em: agora,
      ...extra,
    });

  it('aplica do zero, reaplica sem efeito e migra a 19 com dados sem mudar nenhuma tabela', async () => {
    const b = await abrir(19);
    popularPerfil(b);
    avaliacao(b, 'av');
    perfilDa(b, 'x1', 'p1', 1, 1);
    const nomes = tabelas(b);
    const antes = nomes.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_20)).aplicadas.map((m) => m.nome)).toEqual([
      'anulacao_avaliacao_nutricional',
    ]);
    expect(nomes.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect((await aplicarMigracoes(b, ATE_20)).aplicadas).toEqual([]);
    expect(b.pragma('user_version', { simple: true })).toBe(20);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '0020_anulacao_avaliacao_nutricional.sql'),
      'utf8',
    );
    expect([...sql.matchAll(/(INSERT\s+INTO|ALTER\s+TABLE|DROP\s+TABLE)/gi)]).toEqual([]);
  });

  it('backup pré-migração da versão 19 é feito antes da 0020 e restaura sem perda', async () => {
    pasta = criarPastaTemporaria();
    const antigo = montarAmbiente(pasta.caminho, ATE_19);
    ambiente = antigo;
    await antigo.gerenciador.abrir();
    popularPerfil(antigo.gerenciador.conexao);
    avaliacao(antigo.gerenciador.conexao, 'av');
    const gravadas = linhas(antigo.gerenciador.conexao, 'avaliacao_nutricional');
    antigo.gerenciador.fechar();
    const atual = montarAmbiente(pasta.caminho, ATE_20);
    ambiente = atual;
    expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([20]);
    const pre = (await atual.backup.listar()).find(
      (x) => x.tipo === 'pre_migracao' && x.versaoSchema === 19,
    );
    expect(pre).toBeDefined();
    anular(atual.gerenciador.conexao, 'n1');
    const r = await atual.backup.restaurar(pre!.id);
    expect(r.migracoesAplicadas).toBe(1);
    const c = atual.gerenciador.conexao;
    expect(linhas(c, 'avaliacao_nutricional')).toEqual(gravadas);
    expect(linhas(c, 'anulacao_avaliacao_nutricional')).toEqual([]);
    expect(c.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('uma anulação por avaliação, com motivo; sem alteração nem exclusão; avaliação precisa existir', async () => {
    const b = await abrir(20);
    b.pragma('foreign_keys = ON');
    popularPerfil(b);
    avaliacao(b, 'av');
    expect(() => anular(b, 'n0', { motivo: ' ' })).toThrow(/CHECK/);
    expect(() => anular(b, 'n0', { motivo: ' com espaço' })).toThrow(/CHECK/);
    anular(b, 'n1');
    expect(() => anular(b, 'n2')).toThrow(/UNIQUE/);
    expect(() => anular(b, 'n3', { avaliacao_id: 'inexistente' })).toThrow(/FOREIGN KEY/);
    expect(() =>
      b.prepare("UPDATE anulacao_avaliacao_nutricional SET motivo = 'X' WHERE id = 'n1'").run(),
    ).toThrow(/não muda/);
    expect(() =>
      b.prepare("DELETE FROM anulacao_avaliacao_nutricional WHERE id = 'n1'").run(),
    ).toThrow(/não é excluída/);
    // A avaliação anulada continua imutável e consultável.
    expect(() =>
      b.prepare("UPDATE avaliacao_nutricional SET rotulo = 'X' WHERE id = 'av'").run(),
    ).toThrow(/imutável/);
    expect(linhas(b, 'avaliacao_nutricional')).toHaveLength(1);
  });
});
