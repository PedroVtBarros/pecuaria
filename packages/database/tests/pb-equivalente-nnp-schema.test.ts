import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFINICOES_DO_SISTEMA, normalizarCodigo } from '@pecuaria/domain';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria, montarAmbiente, type Ambiente } from './apoio';

/*
 * Migration 0018 (Fase 6B, D-6B3-05): natureza do valor na definição do nutriente, PBeqNNP e
 * valor_nutricional reconstruída sem o teto fixo de 100 %. Nomes, textos e números fictícios
 * (CLAUDE.md, regra 1); nenhuma composição real.
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
const ATE_18 = MIGRACOES_DO_PROJETO.slice(0, 18);
const ID_PB = '01929c20-0000-7000-8000-000000000004';
const ID_NNP = '01929c20-0000-7000-8000-000000000013';
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
/** Texto de índices e gatilhos de uma tabela (para conferir que a reconstrução os recriou). */
const objetos = (b: Conexao, tabela: string) =>
  b
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index','trigger') ORDER BY type, name",
    )
    .all(tabela);

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'nnp.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}
function inserir(b: Conexao, tabela: string, campos: Record<string, unknown>) {
  const cols = Object.keys(campos);
  b.prepare(
    `INSERT INTO ${tabela}(${cols.join(',')},created_at,updated_at) VALUES(${cols.map(() => '?').join(',')},?,?)`,
  ).run(...Object.values(campos), agora, agora);
}
const valor = (b: Conexao, id: string, registro: string, nutriente: string, v: number) =>
  inserir(b, 'valor_nutricional', {
    id,
    registro_id: registro,
    nutriente_id: nutriente,
    valor_publicado: String(v).replace('.', ','),
    valor: v,
    unidade: 'pct',
    base: 'ms',
    tipo_valor: 'media',
    forma_obtencao: 'medido',
  });

/** Dados da versão 17: fonte, alimento, registros, valores (um excluído), perfil e avaliação. */
function popular17(b: Conexao) {
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
  for (const id of ['r1', 'r2'])
    inserir(b, 'registro_composicao', {
      id,
      alimento_id: 'a',
      fonte_id: 'fe',
      referencia_local: `Tabela fictícia ${id}`,
      separador_decimal: 'virgula',
      status: 'rascunho',
    });
  valor(b, 'v-ms', 'r1', '01929c20-0000-7000-8000-000000000001', 40.5);
  valor(b, 'v-pb', 'r1', ID_PB, 12.25);
  valor(b, 'v-x', 'r2', ID_PB, 9.5);
  b.prepare("UPDATE valor_nutricional SET deleted_at = ? WHERE id = 'v-x'").run(agora);
  valor(b, 'v-pb2', 'r2', ID_PB, 100);
  inserir(b, 'avaliacao_cientifica', {
    id: 'c1',
    registro_id: 'r1',
    valor_id: 'v-pb',
    tipo: 'uso_com_cautela',
    motivo: 'Motivo fictício.',
    avaliado_por: 'Pessoa fictícia',
    avaliado_em: agora,
  });
  inserir(b, 'aprovacao_regra_selecao', {
    id: 'ap',
    regra_codigo: 'REGRA_TESTE',
    regra_versao: 1,
    conteudo_hash: 'a'.repeat(64),
    aprovado_por: 'Pessoa fictícia',
    aprovado_em: agora,
  });
  inserir(b, 'perfil_composicao', {
    id: 'p1',
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
  });
  inserir(b, 'perfil_valor', {
    id: 'pv',
    perfil_id: 'p1',
    nutriente_id: ID_PB,
    valor: 12.25,
    unidade: 'pct',
    base: 'ms',
    tipo_valor: 'media',
    forma_obtencao: 'medido',
    n_origens: 1,
  });
  inserir(b, 'perfil_valor_origem', {
    id: 'po',
    perfil_valor_id: 'pv',
    valor_nutricional_id: 'v-pb',
    registro_id: 'r1',
    valor_usado: 12.25,
  });
}

describe('migration 0018: PB equivalente de NNP', () => {
  it('aplica do zero e reaplica sem efeito; catálogo com a natureza de cada definição', async () => {
    const b = await abrir(18);
    expect(b.pragma('user_version', { simple: true })).toBe(18);
    expect((await aplicarMigracoes(b, ATE_18)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    expect(
      b
        .prepare(
          'SELECT id, codigo, codigo_normalizado, natureza_valor FROM nutriente ORDER BY rowid',
        )
        .all(),
    ).toEqual(
      DEFINICOES_DO_SISTEMA.map((d) => ({
        id: d.id,
        codigo: d.codigo,
        codigo_normalizado: normalizarCodigo(d.codigo),
        natureza_valor: d.naturezaValor,
      })),
    );
    expect(
      b
        .prepare(
          "SELECT codigo FROM nutriente WHERE natureza_valor <> 'fracao_massica' ORDER BY codigo",
        )
        .all(),
    ).toEqual([{ codigo: 'PB' }, { codigo: 'PBeqNNP' }]);
    expect(tabelas(b)).not.toContain('_valor_nutricional_0017');
  });

  it('o arquivo só insere a definição PBeqNNP (e copia as linhas de valor_nutricional)', () => {
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '0018_pb_equivalente_nnp.sql'),
      'utf8',
    );
    expect([...sql.matchAll(/INSERT\s+INTO\s+(\w+)/gi)].map((m) => m[1])).toEqual([
      'nutriente',
      'valor_nutricional',
    ]);
    expect(
      [...sql.matchAll(/INSERT INTO nutriente[\s\S]*?;\n/g)][0]![0].match(/\n\('/g),
    ).toHaveLength(1);
  });

  it('migra a versão 17 com dados: só nutriente muda; valores com o mesmo rowid e vínculos íntegros', async () => {
    const b = await abrir(17);
    popular17(b);
    const nomes = tabelas(b);
    const antes = Object.fromEntries(nomes.map((t) => [t, hash(linhas(b, t))]));
    const valoresAntes = linhas(b, 'valor_nutricional');
    const nutrientesAntes = linhas(b, 'nutriente') as Record<string, unknown>[];
    const objetosAntes = objetos(b, 'valor_nutricional');
    expect((await aplicarMigracoes(b, ATE_18)).aplicadas.map((m) => m.nome)).toEqual([
      'pb_equivalente_nnp',
    ]);
    for (const t of nomes.filter((t) => t !== 'nutriente'))
      expect(hash(linhas(b, t)), t).toBe(antes[t]);
    expect(linhas(b, 'valor_nutricional')).toEqual(valoresAntes);
    // nutriente: as linhas antigas ganham só a coluna; PB passa a equivalente proteico; +PBeqNNP.
    const depois = linhas(b, 'nutriente') as Record<string, unknown>[];
    expect(depois.slice(0, -1)).toEqual(
      nutrientesAntes.map((n) => ({
        ...n,
        natureza_valor: n['id'] === ID_PB ? 'equivalente_proteico' : 'fracao_massica',
      })),
    );
    expect(depois.at(-1)).toMatchObject({
      id: ID_NNP,
      codigo: 'PBeqNNP',
      origem_definicao: 'sistema',
    });
    // Índices e gatilhos recriados com o mesmo texto, mais os dois do teto pela natureza.
    const objetosDepois = objetos(b, 'valor_nutricional') as { name: string; sql: string }[];
    expect(objetosAntes.length).toBe(12);
    expect(objetosDepois.filter((o) => !o.name.startsWith('tg_valor_faixa_'))).toEqual(
      objetosAntes,
    );
    expect(
      objetosDepois.filter((o) => o.name.startsWith('tg_valor_faixa_')).map((o) => o.name),
    ).toEqual(['tg_valor_faixa_alteracao', 'tg_valor_faixa_insercao']);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    // Os vínculos continuam apontando para a tabela nova.
    expect(() => b.prepare("DELETE FROM valor_nutricional WHERE id = 'v-pb'").run()).toThrow(
      /proibida/,
    );
    expect(() =>
      inserir(b, 'perfil_valor_origem', {
        id: 'po2',
        perfil_valor_id: 'pv',
        valor_nutricional_id: 'inexistente',
        registro_id: 'r1',
        valor_usado: 1,
      }),
    ).toThrow(/FOREIGN KEY|imutável|perfil/);
  });

  it('falha no meio da migration não deixa nada: versão 17 e tabela antiga intactas', async () => {
    const b = await abrir(17);
    popular17(b);
    const valores = linhas(b, 'valor_nutricional');
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 17),
      {
        ...MIGRACOES_DO_PROJETO[17]!,
        sql: `${MIGRACOES_DO_PROJETO[17]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(17);
    expect(linhas(b, 'valor_nutricional')).toEqual(valores);
    expect(
      b
        .prepare("SELECT name FROM pragma_table_info('nutriente') WHERE name = 'natureza_valor'")
        .get(),
    ).toBeUndefined();
  });

  it('backup pré-migração da versão 17 é feito antes da 0018 e restaura sem perda', async () => {
    pasta = criarPastaTemporaria();
    const antigo = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 17));
    ambiente = antigo;
    await antigo.gerenciador.abrir();
    popular17(antigo.gerenciador.conexao);
    const valores = linhas(antigo.gerenciador.conexao, 'valor_nutricional');
    const origens = linhas(antigo.gerenciador.conexao, 'perfil_valor_origem');
    antigo.gerenciador.fechar();
    const atual = montarAmbiente(pasta.caminho, ATE_18);
    ambiente = atual;
    expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([18]);
    const pre = (await atual.backup.listar()).find(
      (x) => x.tipo === 'pre_migracao' && x.versaoSchema === 17,
    );
    expect(pre).toBeDefined();
    // Escrita depois da migration, que a restauração do backup pré-migração desfaz.
    valor(atual.gerenciador.conexao, 'v-novo', 'r2', ID_NNP, 50);
    const r = await atual.backup.restaurar(pre!.id);
    expect(r.migracoesAplicadas).toBe(1);
    const c = atual.gerenciador.conexao;
    expect(c.pragma('user_version', { simple: true })).toBe(18);
    expect(linhas(c, 'valor_nutricional')).toEqual(valores);
    expect(linhas(c, 'perfil_valor_origem')).toEqual(origens);
    expect(c.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(c.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('migration 0018: proteções do banco', () => {
  async function pronto() {
    const b = await abrir(18);
    popular17(b);
    return b;
  }

  it('teto de 100 % só na fração mássica; equivalente proteico passa de 100; piso zero para todos', async () => {
    const b = await pronto();
    valor(b, 'pb260', 'r2', ID_NNP, 260);
    b.prepare(
      "UPDATE valor_nutricional SET valor = 280, valor_publicado = '280' WHERE id = 'v-pb2'",
    ).run();
    expect(() => valor(b, 'ms101', 'r2', '01929c20-0000-7000-8000-000000000001', 101)).toThrow(
      /teto da unidade para fração mássica/,
    );
    expect(() =>
      b.prepare("UPDATE valor_nutricional SET valor = 100.5 WHERE id = 'v-ms'").run(),
    ).toThrow(/teto da unidade para fração mássica/);
    expect(() => valor(b, 'neg', 'r2', '01929c20-0000-7000-8000-000000000005', -1)).toThrow(
      /CHECK/,
    );
    // g/kg: 1.000 é o teto da fração mássica, não do equivalente proteico.
    expect(() =>
      inserir(b, 'valor_nutricional', {
        id: 'gkg',
        registro_id: 'r2',
        nutriente_id: '01929c20-0000-7000-8000-000000000005',
        valor_publicado: '1001',
        valor: 1001,
        unidade: 'g_kg',
        base: 'ms',
        tipo_valor: 'valor_unico',
      }),
    ).toThrow(/teto da unidade/);
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('natureza reservada ao sistema e imutável', async () => {
    const b = await pronto();
    const usuario = (natureza: string) =>
      inserir(b, 'nutriente', {
        id: `u-${natureza}`,
        codigo: `U_${natureza.toUpperCase()}`,
        codigo_normalizado: `U_${natureza.toUpperCase()}`,
        nome: 'Definição fictícia',
        grupo: 'proteina',
        unidade_referencia: 'pct',
        base_referencia: 'ms',
        situacao_fundamentacao: 'pendente',
        direcao_conservadora: 'menor',
        origem_definicao: 'usuario',
        natureza_valor: natureza,
      });
    usuario('fracao_massica');
    for (const n of ['equivalente_proteico', 'equivalente_proteico_nnp'])
      expect(() => usuario(n)).toThrow(/reservada às definições do sistema/);
    expect(() => usuario('outra')).toThrow(/reservada|CHECK/);
    for (const [id, n] of [
      [ID_PB, 'fracao_massica'],
      [ID_NNP, 'equivalente_proteico'],
      ['u-fracao_massica', 'equivalente_proteico_nnp'],
    ])
      expect(() =>
        b.prepare('UPDATE nutriente SET natureza_valor = ? WHERE id = ?').run(n, id),
      ).toThrow(/não muda/);
  });
});
