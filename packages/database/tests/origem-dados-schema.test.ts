import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';

/* Migration 0015 (Fase 5C-1). Nomes, textos e números fictícios (CLAUDE.md, regra 1). */
let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  pasta?.limpar();
});
const agora = '2026-10-21T12:00:00.000Z';
const ATE_15 = MIGRACOES_DO_PROJETO.slice(0, 15);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'origem.db'));
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
function vinculo(b: Conexao, id: string, extra: Record<string, unknown> = {}) {
  inserir(b, 'vinculo_registro', {
    id,
    registro_id: 'r1',
    alvo_fonte_codigo: 'E_TESTE',
    alvo_referencia_local: 'Tabela fictícia r2',
    relacao: 'mesmos_valores',
    evidencia: 'Evidência fictícia.',
    situacao: 'a_confirmar',
    ...extra,
  });
}

describe('migration 0015: origem dos dados', () => {
  it('aplica do zero e reaplica sem efeito; arquivo sem INSERT', async () => {
    const b = await abrir(15);
    expect(b.pragma('user_version', { simple: true })).toBe(15);
    expect((await aplicarMigracoes(b, ATE_15)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '0015_origem_dos_dados.sql'),
      'utf8',
    );
    expect([...sql.matchAll(/INSERT\s+INTO/gi)]).toEqual([]);
  });

  it('migra a versão 14 com dados: valores antigos ficam "não informado", nada mais muda', async () => {
    const b = await abrir(14);
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
    expect((await aplicarMigracoes(b, ATE_15)).aplicadas.map((m) => m.nome)).toEqual([
      'origem_dos_dados',
    ]);
    expect(tabelas.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(linhas(b, 'valor_nutricional')).toEqual(
      (valorAntes as Record<string, unknown>[]).map((v) => ({
        ...v,
        forma_obtencao: 'nao_informado',
        descricao_obtencao: null,
      })),
    );
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('a falha no passo final desfaz a migration, inclusive as colunas novas', async () => {
    const b = await abrir(14);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 14),
      {
        ...MIGRACOES_DO_PROJETO[14]!,
        sql: `${MIGRACOES_DO_PROJETO[14]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(14);
    const colunas = (b.pragma('table_info(valor_nutricional)') as { name: string }[]).map(
      (c) => c.name,
    );
    expect(colunas).not.toContain('forma_obtencao');
  });

  it('forma de obtenção: lista fechada; cálculo e equação exigem a descrição', async () => {
    const b = await abrir(15);
    popular(b);
    expect(() => valor(b, 'x', { forma_obtencao: 'chute' })).toThrow(/CHECK/);
    expect(() => valor(b, 'x', { forma_obtencao: 'estimado_equacao' })).toThrow(
      /exige a descrição/,
    );
    expect(() => valor(b, 'x', { forma_obtencao: 'calculado' })).toThrow(/exige a descrição/);
    valor(b, 'v1', { forma_obtencao: 'estimado_nir' });
    valor(b, 'v2', {
      tipo_valor: 'valor_unico',
      forma_obtencao: 'estimado_equacao',
      descricao_obtencao: 'Equação fictícia.',
    });
    expect(() =>
      b.prepare("UPDATE valor_nutricional SET descricao_obtencao = NULL WHERE id = 'v2'").run(),
    ).toThrow(/exige a descrição/);
  });

  it('vínculo: nasce a confirmar, só recebe o relacionado e uma decisão; sem exclusão', async () => {
    const b = await abrir(15);
    popular(b);
    expect(() =>
      vinculo(b, 'x', { situacao: 'confirmado', decidido_por: 'P', decidido_em: agora }),
    ).toThrow(/nasce a confirmar/);
    expect(() => vinculo(b, 'x', { relacao: 'parecido' })).toThrow(/CHECK/);
    expect(() => vinculo(b, 'x', { evidencia: ' ' })).toThrow(/CHECK/);
    expect(() => vinculo(b, 'x', { alvo_fonte_codigo: 'e_teste' })).toThrow(/CHECK/);
    vinculo(b, 'l');
    expect(() => vinculo(b, 'l2')).toThrow(/UNIQUE/);
    expect(() =>
      b.prepare("UPDATE vinculo_registro SET relacionado_id = 'r1' WHERE id = 'l'").run(),
    ).toThrow(/CHECK/);
    b.prepare("UPDATE vinculo_registro SET relacionado_id = 'r2' WHERE id = 'l'").run();
    expect(() =>
      b.prepare("UPDATE vinculo_registro SET relacionado_id = 'r1' WHERE id = 'l'").run(),
    ).toThrow(/só recebe/);
    expect(() =>
      b.prepare("UPDATE vinculo_registro SET evidencia = 'Outra' WHERE id = 'l'").run(),
    ).toThrow(/só recebe/);
    // Descarte exige motivo; decisão tomada não muda.
    expect(() =>
      b
        .prepare(
          "UPDATE vinculo_registro SET situacao = 'descartado', decidido_por = 'P', decidido_em = ? WHERE id = 'l'",
        )
        .run(agora),
    ).toThrow(/CHECK/);
    b.prepare(
      "UPDATE vinculo_registro SET situacao = 'confirmado', decidido_por = 'Pessoa Teste', decidido_em = ? WHERE id = 'l'",
    ).run(agora);
    expect(() =>
      b
        .prepare(
          "UPDATE vinculo_registro SET situacao = 'descartado', motivo_decisao = 'x' WHERE id = 'l'",
        )
        .run(),
    ).toThrow(/só recebe/);
    expect(() => b.prepare('DELETE FROM vinculo_registro').run()).toThrow(/Exclusão física/);
  });
});
