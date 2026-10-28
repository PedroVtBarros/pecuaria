import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';

/* Migration 0017 (Fase 5D). Nomes, textos e números fictícios (CLAUDE.md, regra 1). */
let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  pasta?.limpar();
});
const agora = '2026-10-22T12:00:00.000Z';
const ATE_17 = MIGRACOES_DO_PROJETO.slice(0, 17);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
const H64 = 'a'.repeat(64);

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'selecao.db'));
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
  for (const id of ['r1', 'r2'])
    inserir(b, 'registro_composicao', {
      id,
      alimento_id: 'a',
      fonte_id: 'fe',
      referencia_local: `Tabela fictícia ${id}`,
      separador_decimal: 'virgula',
      status: 'rascunho',
    });
  const valor = (id: string, registro: string, interpretacao: string | null, tipo = 'media') =>
    inserir(b, 'valor_nutricional', {
      id,
      registro_id: registro,
      nutriente_id: 'nt',
      valor_publicado: '10,5',
      valor: 10.5,
      unidade: 'pct',
      base: 'ms',
      tipo_valor: tipo,
      interpretacao_base: interpretacao,
    });
  if (b.pragma('user_version', { simple: true }) === 17) {
    valor('v1', 'r1', 'Interpretação fictícia.');
    valor('v2', 'r1', null, 'mediana');
    valor('v3', 'r2', null);
  }
}
const avaliacao = (b: Conexao, id: string, extra: Record<string, unknown> = {}) =>
  inserir(b, 'avaliacao_cientifica', {
    id,
    registro_id: 'r1',
    valor_id: null,
    tipo: 'uso_com_cautela',
    motivo: 'Motivo fictício.',
    avaliado_por: 'Pessoa fictícia',
    avaliado_em: agora,
    ...extra,
  });
const aprovacao = (b: Conexao) =>
  inserir(b, 'aprovacao_regra_selecao', {
    id: 'ap',
    regra_codigo: 'REGRA_TESTE',
    regra_versao: 1,
    conteudo_hash: H64,
    aprovado_por: 'Pessoa fictícia',
    aprovado_em: agora,
  });
const perfil = (b: Conexao, id: string, extra: Record<string, unknown> = {}) =>
  inserir(b, 'perfil_composicao', {
    id,
    alimento_id: 'a',
    nome: 'Perfil fictício',
    tipo: 'referencia_individual',
    cenario: 'unico',
    nivel: 'especifico',
    registro_base_id: 'r1',
    regra_codigo: 'REGRA_TESTE',
    regra_versao: 1,
    diferencas_json: '[]',
    limitacoes_json: '[]',
    nao_quantificados_json: '[]',
    selecao_json: '{}',
    criado_por: 'Pessoa fictícia',
    criado_em: agora,
    ...extra,
  });

describe('migration 0017: seleção e perfis', () => {
  it('aplica do zero e reaplica sem efeito; arquivo sem INSERT', async () => {
    const b = await abrir(17);
    expect(b.pragma('user_version', { simple: true })).toBe(17);
    expect((await aplicarMigracoes(b, ATE_17)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '0017_selecao_e_perfis.sql'),
      'utf8',
    );
    expect([...sql.matchAll(/INSERT\s+INTO/gi)]).toEqual([]);
  });

  it('migra a versão 16 com dados sem mudar nenhuma tabela existente', async () => {
    const b = await abrir(16);
    popular(b);
    const tabelas = (
      b
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migracoes' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((t) => t.name);
    const antes = tabelas.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_17)).aplicadas.map((m) => m.nome)).toEqual([
      'selecao_e_perfis',
    ]);
    expect(tabelas.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('avaliação: coerente com o valor, uma ativa por alvo, só retirada uma vez, sem exclusão', async () => {
    const b = await abrir(17);
    popular(b);
    avaliacao(b, 'c1');
    expect(() => avaliacao(b, 'c2')).toThrow(/UNIQUE/);
    avaliacao(b, 'c3', { valor_id: 'v1', tipo: 'base_validada' });
    expect(() => avaliacao(b, 'c4', { valor_id: 'v2', tipo: 'base_validada' })).toThrow(
      /incoerente/,
    );
    expect(() => avaliacao(b, 'c5', { valor_id: 'v3' })).toThrow(/incoerente/);
    expect(() => avaliacao(b, 'c6', { tipo: 'base_validada' })).toThrow(/CHECK|incoerente/);
    const retirar = b.prepare(
      "UPDATE avaliacao_cientifica SET retirado_por = 'P', retirado_em = ?, motivo_retirada = 'M' WHERE id = 'c1'",
    );
    retirar.run(agora);
    expect(() => retirar.run(agora)).toThrow(/só pode ser retirada/);
    expect(() =>
      b.prepare("UPDATE avaliacao_cientifica SET motivo = 'X' WHERE id = 'c3'").run(),
    ).toThrow(/só pode ser retirada/);
    avaliacao(b, 'c7');
    expect(() => b.prepare('DELETE FROM avaliacao_cientifica').run()).toThrow(/proibida/);
  });

  it('perfil exige regra aprovada, coerência de tipo e é imutável', async () => {
    const b = await abrir(17);
    b.pragma('foreign_keys = ON');
    popular(b);
    expect(() => perfil(b, 'p0')).toThrow(/FOREIGN KEY/);
    aprovacao(b);
    expect(() => b.prepare("UPDATE aprovacao_regra_selecao SET aprovado_por = 'X'").run()).toThrow(
      /não muda/,
    );
    perfil(b, 'p1');
    expect(() => perfil(b, 'p2', { cenario: 'central' })).toThrow(/CHECK/);
    expect(() => perfil(b, 'p3', { tipo: 'cenario_real', cenario: 'conservador' })).toThrow(
      /CHECK/,
    );
    expect(() => perfil(b, 'p4', { tipo: 'agregado_central', cenario: 'central' })).toThrow(
      /CHECK/,
    );
    inserir(b, 'perfil_valor', {
      id: 'pv',
      perfil_id: 'p1',
      nutriente_id: 'nt',
      valor: 10.5,
      unidade: 'pct',
      base: 'ms',
      tipo_valor: 'media',
      forma_obtencao: 'medido',
      n_origens: 1,
    });
    inserir(b, 'perfil_valor_origem', {
      id: 'po',
      perfil_valor_id: 'pv',
      valor_nutricional_id: 'v1',
      registro_id: 'r1',
      valor_usado: 10.5,
    });
    for (const [t, id] of [
      ['perfil_composicao', 'p1'],
      ['perfil_valor', 'pv'],
      ['perfil_valor_origem', 'po'],
    ] as const) {
      expect(() => b.prepare(`UPDATE ${t} SET updated_at = 'x' WHERE id = ?`).run(id)).toThrow(
        /imutável/,
      );
      expect(() => b.prepare(`DELETE FROM ${t} WHERE id = ?`).run(id)).toThrow(/não é excluído/);
    }
  });
});
