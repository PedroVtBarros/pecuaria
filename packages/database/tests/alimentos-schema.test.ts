import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFINICOES_INICIAIS_NUTRIENTES, normalizarCodigo } from '@pecuaria/domain';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria } from './apoio';

/*
 * Migration 0012 (Fase 5A). Os valores numéricos e nomes abaixo são fictícios: provam regras de
 * armazenamento, não representam composição de alimento nenhum (CLAUDE.md, regra 1).
 */
let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  pasta?.limpar();
});
const agora = '2026-10-21T12:00:00.000Z';
const ATE_12 = MIGRACOES_DO_PROJETO.slice(0, 12);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const linhas = (b: Conexao, t: string) => b.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
const NOVAS = [
  'fonte',
  'nutriente',
  'alimento',
  'registro_composicao',
  'valor_nutricional',
  'estoque_item_alimento',
];

async function abrir(versao: number): Promise<Conexao> {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'alimentos.db'));
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

function popularFase4(b: Conexao) {
  b.prepare(
    "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Fazenda','fazenda','misto',?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p2','Outra','outra','misto',?,?)",
  ).run(agora, agora);
  for (const [id, tipo] of [
    ['i-racao', 'racao'],
    ['i-med', 'medicamento'],
  ])
    b.prepare(
      "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES(?,'p',?,?,?,'kg','mn',0,?,?)",
    ).run(id, `Item ${id}`, `item ${id}`, tipo, agora, agora);
  b.prepare(
    "INSERT INTO historico_alteracao(id,entidade,entidade_id,acao,dados_novos_json,ocorrido_em) VALUES('h','propriedade','p','criacao','{}',?)",
  ).run(agora);
}

const ins = (b: Conexao, sql: string, ...p: unknown[]) => b.prepare(sql).run(...p, agora, agora);
function fonte(b: Conexao, id: string, origem: string, extra = '') {
  const cod = id.replace(/-/g, '_');
  const campos: Record<string, string> = {
    tabela_compilada: `codigo,codigo_normalizado,autores,ano`,
    estudo_individual: `codigo,codigo_normalizado,autores,ano`,
    laboratorial: `laboratorio,propriedade_id`,
    rotulo_comercial: `fabricante`,
    medicao_propria: `metodo_medicao,limitacoes_medicao,propriedade_id`,
  };
  const valores: Record<string, string> = {
    tabela_compilada: `'T_${cod}','T_${cod.toUpperCase()}','Autor fictício',2020`,
    estudo_individual: `'E_${cod}','E_${cod.toUpperCase()}','Autor fictício',2021`,
    laboratorial: `'Laboratório fictício','p'`,
    rotulo_comercial: `'Fabricante fictício'`,
    medicao_propria: `'Método fictício descrito','Limitações fictícias','p'`,
  };
  ins(
    b,
    `INSERT INTO fonte(id,origem,titulo,${campos[origem]}${extra ? `,${extra.split('=')[0]}` : ''},created_at,updated_at) VALUES(?,?,'Fonte fictícia de teste',${valores[origem]}${extra ? `,${extra.split('=')[1]}` : ''},?,?)`,
    id,
    origem,
  );
}
function alimento(b: Conexao, id: string) {
  ins(
    b,
    "INSERT INTO alimento(id,nome,nome_normalizado,forma_conservacao,classe,comercial,created_at,updated_at) VALUES(?,?,?,'outro','outro',0,?,?)",
    id,
    `Alimento de teste ${id}`,
    `alimento de teste ${id}`,
  );
}
function registro(b: Conexao, id: string, fonteId: string, extra: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    id,
    alimento_id: 'a',
    fonte_id: fonteId,
    separador_decimal: 'virgula',
    status: 'rascunho',
    ...extra,
  };
  const cols = Object.keys(base);
  b.prepare(
    `INSERT INTO registro_composicao(${cols.join(',')},created_at,updated_at) VALUES(${cols.map(() => '?').join(',')},?,?)`,
  ).run(...Object.values(base), agora, agora);
}
function valor(b: Conexao, id: string, registroId: string, extra: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    id,
    registro_id: registroId,
    nutriente_id: 'nt',
    valor_publicado: '10,5',
    valor: 10.5,
    unidade: 'pct',
    base: 'ms',
    tipo_valor: 'valor_unico',
    ...extra,
  };
  const cols = Object.keys(base);
  b.prepare(
    `INSERT INTO valor_nutricional(${cols.join(',')},created_at,updated_at) VALUES(${cols.map(() => '?').join(',')},?,?)`,
  ).run(...Object.values(base), agora, agora);
}
/** Nutriente fictício do usuário, para os testes de valor. */
function nutrienteTeste(b: Conexao, id = 'nt', codigo = 'TESTE_A', grupo = 'outro') {
  ins(
    b,
    "INSERT INTO nutriente(id,codigo,codigo_normalizado,nome,grupo,unidade_referencia,base_referencia,situacao_fundamentacao,direcao_conservadora,origem_definicao,created_at,updated_at) VALUES(?,?,?,'Nutriente de teste',?,'pct','ms','pendente','nao_definida','usuario',?,?)",
    id,
    codigo,
    codigo.toUpperCase(),
    grupo,
  );
}

describe('migration 0012: banco de alimentos', () => {
  it('aplica do zero, reaplica sem efeito e semeia só as definições do domínio', async () => {
    const b = await abrir(12);
    expect(b.pragma('user_version', { simple: true })).toBe(12);
    expect((await aplicarMigracoes(b, ATE_12)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    for (const t of NOVAS.filter((t) => t !== 'nutriente')) expect(linhas(b, t)).toEqual([]);
    const semeados = b
      .prepare(
        'SELECT id,codigo,codigo_normalizado,nome,grupo,unidade_referencia,base_referencia,metodo_analitico,situacao_fundamentacao,fundamentacao_fonte_id,fundamentacao_referencia,direcao_conservadora,origem_definicao,ativo FROM nutriente ORDER BY id',
      )
      .all();
    expect(semeados).toEqual(
      DEFINICOES_INICIAIS_NUTRIENTES.map((d) => ({
        id: d.id,
        codigo: d.codigo,
        codigo_normalizado: normalizarCodigo(d.codigo),
        nome: d.nome,
        grupo: d.grupo,
        unidade_referencia: d.unidadeReferencia,
        base_referencia: d.baseReferencia,
        metodo_analitico: null,
        situacao_fundamentacao: 'pendente',
        fundamentacao_fonte_id: null,
        fundamentacao_referencia: null,
        direcao_conservadora: d.direcaoConservadora,
        origem_definicao: 'sistema',
        ativo: 1,
      })),
    );
  });

  it('o arquivo da migration não semeia fonte, alimento, registro nem valor', () => {
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', '0012_banco_alimentos.sql'),
      'utf8',
    );
    const insercoes = [...sql.matchAll(/INSERT\s+INTO\s+(\w+)/gi)].map((m) => m[1]);
    expect(insercoes).toEqual(['nutriente']);
  });

  it('migra a versão 11 com dados sem tocar em nenhuma tabela anterior', async () => {
    const b = await abrir(11);
    popularFase4(b);
    const anteriores = tabelas(b);
    const antes = anteriores.map((t) => hash(linhas(b, t)));
    expect((await aplicarMigracoes(b, ATE_12)).aplicadas.map((m) => m.nome)).toEqual([
      'banco_alimentos',
    ]);
    expect(anteriores.map((t) => hash(linhas(b, t)))).toEqual(antes);
    expect(tabelas(b)).toEqual([...anteriores, ...NOVAS].sort());
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('a falha no passo final desfaz a migration', async () => {
    const b = await abrir(11);
    popularFase4(b);
    const quebrada = [
      ...MIGRACOES_DO_PROJETO.slice(0, 11),
      {
        ...MIGRACOES_DO_PROJETO[11]!,
        sql: `${MIGRACOES_DO_PROJETO[11]!.sql}\nSELECT * FROM tabela_que_nao_existe;`,
      },
    ];
    await expect(aplicarMigracoes(b, quebrada)).rejects.toThrow();
    expect(b.pragma('user_version', { simple: true })).toBe(11);
    for (const t of NOVAS)
      expect(b.prepare('SELECT name FROM sqlite_master WHERE name = ?').get(t)).toBeUndefined();
  });

  it('fonte: exigências por origem, código único, identidade e exclusão protegidas', async () => {
    const b = await abrir(12);
    popularFase4(b);
    for (const o of [
      'tabela_compilada',
      'estudo_individual',
      'laboratorial',
      'rotulo_comercial',
      'medicao_propria',
    ])
      fonte(b, `f-${o}`, o);
    // Publicação sem autores; laudo sem propriedade; rótulo sem fabricante; medição sem limitações.
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,codigo,codigo_normalizado,titulo,ano,created_at,updated_at) VALUES('x','estudo_individual','X','X','T',2020,?,?)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,titulo,laboratorio,created_at,updated_at) VALUES('x','laboratorial','T','L',?,?)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,titulo,created_at,updated_at) VALUES('x','rotulo_comercial','T',?,?)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,titulo,metodo_medicao,propriedade_id,created_at,updated_at) VALUES('x','medicao_propria','T','M','p',?,?)",
      ),
    ).toThrow(/CHECK/);
    // Tabela compilada não pertence a propriedade; rótulo não tem dados de laudo.
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,codigo,codigo_normalizado,titulo,autores,ano,propriedade_id,created_at,updated_at) VALUES('x','tabela_compilada','Y','Y','T','A',2020,'p',?,?)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,titulo,fabricante,laboratorio,created_at,updated_at) VALUES('x','rotulo_comercial','T','F','L',?,?)",
      ),
    ).toThrow(/CHECK/);
    // Código: formato, normalização e unicidade sem diferença de maiúsculas.
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,codigo,codigo_normalizado,titulo,autores,ano,created_at,updated_at) VALUES('dup','tabela_compilada','t_f_tabela_compilada','T_F_TABELA_COMPILADA','T','A',2020,?,?)",
      ),
    ).toThrow(/UNIQUE/);
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,codigo,codigo_normalizado,titulo,autores,ano,created_at,updated_at) VALUES('x','estudo_individual','A B','A B','T','A',2020,?,?)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      ins(
        b,
        "INSERT INTO fonte(id,origem,codigo,codigo_normalizado,titulo,autores,ano,created_at,updated_at) VALUES('x','estudo_individual','Abc','abc','T','A',2020,?,?)",
      ),
    ).toThrow(/CHECK/);
    expect(() =>
      b
        .prepare("UPDATE fonte SET origem = 'estudo_individual' WHERE id = 'f-tabela_compilada'")
        .run(),
    ).toThrow(/não mudam/);
    expect(() =>
      b.prepare("UPDATE fonte SET propriedade_id = 'p2' WHERE id = 'f-laboratorial'").run(),
    ).toThrow(/não mudam/);
    b.prepare("UPDATE fonte SET titulo = 'Título corrigido' WHERE id = 'f-laboratorial'").run();
    expect(() => b.prepare('DELETE FROM fonte').run()).toThrow(/Exclusão física proibida/);
    alimento(b, 'a');
    registro(b, 'r', 'f-tabela_compilada', { referencia_local: 'Tabela fictícia 1' });
    expect(() =>
      b.prepare("UPDATE fonte SET deleted_at = ? WHERE id = 'f-tabela_compilada'").run(agora),
    ).toThrow(/não pode ser excluída/);
    b.prepare("UPDATE fonte SET deleted_at = ? WHERE id = 'f-rotulo_comercial'").run(agora);
    expect(() =>
      b.prepare("UPDATE fonte SET titulo = 'x' WHERE id = 'f-rotulo_comercial'").run(),
    ).toThrow(/excluída não muda/);
  });

  it('nutriente: definição do sistema protegida, fundamentação com fonte e definição com valores congelada', async () => {
    const b = await abrir(12);
    popularFase4(b);
    const ms = '01929c20-0000-7000-8000-000000000001';
    expect(() => b.prepare("UPDATE nutriente SET nome = 'x' WHERE id = ?").run(ms)).toThrow(
      /não mudam/,
    );
    expect(() => b.prepare("UPDATE nutriente SET codigo = 'MSX' WHERE id = ?").run(ms)).toThrow(
      /não mudam/,
    );
    expect(() =>
      b.prepare("UPDATE nutriente SET unidade_referencia = 'g_kg' WHERE id = ?").run(ms),
    ).toThrow(/não mudam/);
    // Fundamentada exige método, fonte e referência; a fonte precisa ser bibliográfica e ativa.
    expect(() =>
      b
        .prepare(
          "UPDATE nutriente SET situacao_fundamentacao = 'fundamentada', metodo_analitico = 'Método fictício' WHERE id = ?",
        )
        .run(ms),
    ).toThrow(/CHECK/);
    fonte(b, 'fl', 'laboratorial');
    expect(() =>
      b
        .prepare(
          "UPDATE nutriente SET situacao_fundamentacao = 'fundamentada', metodo_analitico = 'Método fictício', fundamentacao_fonte_id = 'fl', fundamentacao_referencia = 'p. 1' WHERE id = ?",
        )
        .run(ms),
    ).toThrow(/fonte bibliográfica ativa/);
    fonte(b, 'fe', 'estudo_individual');
    b.prepare(
      "UPDATE nutriente SET situacao_fundamentacao = 'fundamentada', metodo_analitico = 'Método fictício', fundamentacao_fonte_id = 'fe', fundamentacao_referencia = 'p. 1' WHERE id = ?",
    ).run(ms);
    expect(() => b.prepare("UPDATE fonte SET deleted_at = ? WHERE id = 'fe'").run(agora)).toThrow(
      /não pode ser excluída/,
    );
    // Código único sem diferença de maiúsculas.
    nutrienteTeste(b);
    expect(() => nutrienteTeste(b, 'nt2', 'teste_a')).toThrow(/UNIQUE/);
    expect(() => b.prepare('DELETE FROM nutriente').run()).toThrow(/Exclusão física proibida/);
    // Com valor, a definição do usuário não muda unidade, base, método nem fundamentação.
    alimento(b, 'a');
    registro(b, 'r', 'fe', { referencia_local: 'Tabela fictícia 1' });
    valor(b, 'v', 'r');
    for (const sql of [
      "UPDATE nutriente SET unidade_referencia = 'g_kg' WHERE id = 'nt'",
      "UPDATE nutriente SET base_referencia = 'mn' WHERE id = 'nt'",
      "UPDATE nutriente SET metodo_analitico = 'Outro método fictício' WHERE id = 'nt'",
      "UPDATE nutriente SET grupo = 'fibra' WHERE id = 'nt'",
    ])
      expect(() => b.prepare(sql).run(), sql).toThrow(/cadastre a variante/);
    b.prepare(
      "UPDATE nutriente SET nome = 'Nome corrigido', direcao_conservadora = 'menor' WHERE id = 'nt'",
    ).run();
  });

  it('alimento: identidade imutável com registros, nome único, exclusão protegida', async () => {
    const b = await abrir(12);
    popularFase4(b);
    alimento(b, 'a');
    expect(() =>
      ins(
        b,
        "INSERT INTO alimento(id,nome,nome_normalizado,forma_conservacao,classe,comercial,created_at,updated_at) VALUES('a2','X','alimento de teste a','fresco','outro',0,?,?)",
      ),
    ).toThrow(/UNIQUE/);
    b.prepare("UPDATE alimento SET forma_conservacao = 'ensilado' WHERE id = 'a'").run();
    fonte(b, 'fe', 'estudo_individual');
    registro(b, 'r', 'fe', { referencia_local: 'p. 1' });
    expect(() =>
      b.prepare("UPDATE alimento SET forma_conservacao = 'fresco' WHERE id = 'a'").run(),
    ).toThrow(/identidade/);
    expect(() => b.prepare("UPDATE alimento SET cultivar = 'C' WHERE id = 'a'").run()).toThrow(
      /identidade/,
    );
    b.prepare("UPDATE alimento SET nome = 'Alimento de teste renomeado' WHERE id = 'a'").run();
    expect(() =>
      b
        .prepare("UPDATE alimento SET deleted_at = ?, motivo_exclusao = 'x' WHERE id = 'a'")
        .run(agora),
    ).toThrow(/não pode ser excluído/);
    alimento(b, 'c');
    expect(() => b.prepare("UPDATE alimento SET deleted_at = ? WHERE id = 'c'").run(agora)).toThrow(
      /CHECK/,
    );
    b.prepare("UPDATE alimento SET deleted_at = ?, motivo_exclusao = 'Teste' WHERE id = 'c'").run(
      agora,
    );
    expect(() => b.prepare("UPDATE alimento SET nome = 'x' WHERE id = 'c'").run()).toThrow(
      /excluído não muda/,
    );
  });

  it('registro: exigências por origem, fluxo de status e conferido imutável', async () => {
    const b = await abrir(12);
    popularFase4(b);
    nutrienteTeste(b);
    alimento(b, 'a');
    fonte(b, 'fe', 'estudo_individual');
    fonte(b, 'fl', 'laboratorial');
    // Publicação sem página; laudo sem data da amostra; data da amostra em publicação.
    expect(() => registro(b, 'x', 'fe')).toThrow(/página ou tabela/);
    expect(() => registro(b, 'x', 'fl')).toThrow(/data da amostra/);
    expect(() =>
      registro(b, 'x', 'fe', { referencia_local: 'p. 1', data_amostra: '2026-10-01' }),
    ).toThrow(/data da amostra/);
    expect(() => registro(b, 'x', 'fl', { data_amostra: '2026-02-30' })).toThrow(/CHECK/);
    // Nasce rascunho.
    expect(() =>
      registro(b, 'x', 'fe', { referencia_local: 'p. 1', status: 'conferido' }),
    ).toThrow();
    registro(b, 'r', 'fe', { referencia_local: 'p. 1' });
    // Sem valores não é transcrito.
    const transcrever = () =>
      b
        .prepare(
          "UPDATE registro_composicao SET status = 'transcrito', transcrito_por = 'Pessoa Teste', transcrito_em = ? WHERE id = 'r'",
        )
        .run(agora);
    expect(transcrever).toThrow(/sem valores/);
    valor(b, 'v', 'r');
    // Rascunho não vai direto a conferido.
    expect(() =>
      b
        .prepare(
          "UPDATE registro_composicao SET status = 'conferido', transcrito_por = 'P', transcrito_em = ?, conferido_por = 'P', conferido_em = ? WHERE id = 'r'",
        )
        .run(agora, agora),
    ).toThrow(/fora do fluxo/);
    transcrever();
    // Transcrito não edita conteúdo nem valores.
    expect(() =>
      b.prepare("UPDATE registro_composicao SET referencia_local = 'p. 2' WHERE id = 'r'").run(),
    ).toThrow(/só é editado em rascunho/);
    expect(() =>
      b.prepare("UPDATE valor_nutricional SET valor_publicado = '11', valor = 11").run(),
    ).toThrow(/só mudam em registro em rascunho/);
    expect(() => valor(b, 'v2', 'r', { tipo_valor: 'media' })).toThrow(
      /só entram em registro em rascunho/,
    );
    b.prepare(
      "UPDATE registro_composicao SET status = 'conferido', conferido_por = 'Pessoa Teste', conferido_em = ? WHERE id = 'r'",
    ).run(agora);
    // Conferido: nada muda; só passa a substituído quando uma versão nova é conferida.
    for (const sql of [
      "UPDATE registro_composicao SET observacoes = 'x' WHERE id = 'r'",
      "UPDATE registro_composicao SET conferido_por = 'Outra' WHERE id = 'r'",
      "UPDATE registro_composicao SET status = 'rascunho', transcrito_por = NULL, transcrito_em = NULL, conferido_por = NULL, conferido_em = NULL WHERE id = 'r'",
    ])
      expect(() => b.prepare(sql).run(), sql).toThrow();
    expect(() =>
      b
        .prepare(
          "UPDATE registro_composicao SET status = 'substituido', substituido_em = ? WHERE id = 'r'",
        )
        .run(agora),
    ).toThrow(/Só a versão nova conferida/);
    expect(() =>
      b
        .prepare(
          "UPDATE registro_composicao SET deleted_at = ?, motivo_descarte = 'x' WHERE id = 'r'",
        )
        .run(agora),
    ).toThrow();
    expect(() => b.prepare('DELETE FROM registro_composicao').run()).toThrow(/Exclusão física/);
    // Versão nova: do conferido, mesmo alimento e fonte; uma por registro.
    alimento(b, 'b');
    expect(() =>
      registro(b, 'r2', 'fe', {
        referencia_local: 'p. 1',
        alimento_id: 'b',
        substitui_id: 'r',
        motivo_versao: 'm',
      }),
    ).toThrow(/versão nova só de registro conferido/);
    expect(() => registro(b, 'r2', 'fe', { referencia_local: 'p. 1', substitui_id: 'r' })).toThrow(
      /CHECK/,
    );
    registro(b, 'r2', 'fe', {
      referencia_local: 'p. 1',
      substitui_id: 'r',
      motivo_versao: 'Correção fictícia',
    });
    expect(() =>
      registro(b, 'r3', 'fe', { referencia_local: 'p. 1', substitui_id: 'r', motivo_versao: 'm' }),
    ).toThrow(/UNIQUE/);
    valor(b, 'v3', 'r2', { valor_publicado: '10,50' });
    b.prepare(
      "UPDATE registro_composicao SET status = 'transcrito', transcrito_por = 'P', transcrito_em = ? WHERE id = 'r2'",
    ).run(agora);
    b.prepare(
      "UPDATE registro_composicao SET status = 'conferido', conferido_por = 'P', conferido_em = ? WHERE id = 'r2'",
    ).run(agora);
    b.prepare(
      "UPDATE registro_composicao SET status = 'substituido', substituido_em = ? WHERE id = 'r'",
    ).run(agora);
    expect(() =>
      b.prepare("UPDATE registro_composicao SET substituido_em = 'x' WHERE id = 'r'").run(),
    ).toThrow(/imutável/);
    // O valor do registro substituído continua lá, como foi conferido.
    expect(b.prepare("SELECT valor_publicado FROM valor_nutricional WHERE id = 'v'").get()).toEqual(
      {
        valor_publicado: '10,5',
      },
    );
  });

  it('registro: rejeitar, reabrir, descartar e congelar o descartado', async () => {
    const b = await abrir(12);
    popularFase4(b);
    nutrienteTeste(b);
    alimento(b, 'a');
    fonte(b, 'fe', 'estudo_individual');
    registro(b, 'r', 'fe', { referencia_local: 'p. 1' });
    valor(b, 'v', 'r');
    b.prepare(
      "UPDATE registro_composicao SET status = 'transcrito', transcrito_por = 'P', transcrito_em = ? WHERE id = 'r'",
    ).run(agora);
    expect(() =>
      b.prepare("UPDATE registro_composicao SET status = 'rejeitado' WHERE id = 'r'").run(),
    ).toThrow(/CHECK/);
    b.prepare(
      "UPDATE registro_composicao SET status = 'rejeitado', rejeitado_por = 'P', rejeitado_em = ?, motivo_rejeicao = 'Página errada' WHERE id = 'r'",
    ).run(agora);
    b.prepare(
      "UPDATE registro_composicao SET status = 'rascunho', transcrito_por = NULL, transcrito_em = NULL, rejeitado_por = NULL, rejeitado_em = NULL, motivo_rejeicao = NULL WHERE id = 'r'",
    ).run();
    b.prepare("UPDATE registro_composicao SET referencia_local = 'p. 2' WHERE id = 'r'").run();
    b.prepare(
      "UPDATE registro_composicao SET deleted_at = ?, motivo_descarte = 'Descarte fictício' WHERE id = 'r'",
    ).run(agora);
    expect(() =>
      b.prepare("UPDATE registro_composicao SET observacoes = 'x' WHERE id = 'r'").run(),
    ).toThrow(/descartado não muda/);
  });

  it('valor: como publicado, faixas, grandeza, garantias de rótulo e matéria seca da medição', async () => {
    const b = await abrir(12);
    popularFase4(b);
    nutrienteTeste(b);
    ins(
      b,
      "INSERT INTO nutriente(id,codigo,codigo_normalizado,nome,grupo,unidade_referencia,base_referencia,situacao_fundamentacao,direcao_conservadora,origem_definicao,created_at,updated_at) VALUES('ne','TESTE_E','TESTE_E','Energia de teste','energia','mcal_kg','ms','pendente','menor','usuario',?,?)",
    );
    alimento(b, 'a');
    fonte(b, 'fe', 'estudo_individual');
    fonte(b, 'fr', 'rotulo_comercial');
    fonte(b, 'fm', 'medicao_propria');
    registro(b, 'r', 'fe', { referencia_local: 'p. 1' });
    registro(b, 'rr', 'fr');
    registro(b, 'rm', 'fm', { data_amostra: '2026-10-01' });
    valor(b, 'v1', 'r');
    // Mesmo nutriente, tipo e base: único; base diferente é outro valor publicado.
    expect(() => valor(b, 'x', 'r')).toThrow(/UNIQUE/);
    valor(b, 'v2', 'r', { base: 'mn' });
    for (const [extra, erro] of [
      [{ valor_publicado: 'ND' }, /CHECK/],
      [{ valor_publicado: '' }, /CHECK/],
      [{ valor_publicado: '<0,1' }, /CHECK/],
      [{ valor: 100.5, valor_publicado: '100,5' }, /CHECK/],
      [{ valor: -1, valor_publicado: '-1' }, /CHECK/],
      [{ unidade: 'g_kg', valor: 1000.5, valor_publicado: '1000,5' }, /CHECK/],
      [{ unidade: 'mcal_kg' }, /incompatível/],
      [{ tipo_valor: 'minimo_garantido' }, /incompatível/],
      [{ desvio_padrao_publicado: '1' }, /CHECK/],
      [{ desvio_padrao_publicado: '-1', desvio_padrao: -1 }, /CHECK/],
      [{ minimo_publicado: '5', minimo: 5, maximo_publicado: '4', maximo: 4 }, /CHECK/],
      [{ maximo_publicado: '101', maximo: 101 }, /CHECK/],
      [{ n_observacoes: 0 }, /CHECK/],
    ] as const)
      expect(
        () => valor(b, 'x', 'r', { tipo_valor: 'media', ...extra }),
        JSON.stringify(extra),
      ).toThrow(erro);
    valor(b, 've', 'r', {
      nutriente_id: 'ne',
      unidade: 'mcal_kg',
      valor: 1.5,
      valor_publicado: '1,5',
    });
    valor(b, 'vg', 'r', {
      unidade: 'g_kg',
      valor: 1000,
      valor_publicado: '1.000',
      tipo_valor: 'mediana',
    });
    // Rótulo: só garantias e só em MN.
    expect(() => valor(b, 'x', 'rr', { base: 'mn' })).toThrow(/incompatível/);
    expect(() => valor(b, 'x', 'rr', { tipo_valor: 'minimo_garantido' })).toThrow(/incompatível/);
    valor(b, 'vr', 'rr', { tipo_valor: 'minimo_garantido', base: 'mn' });
    // Medição própria: só matéria seca.
    expect(() => valor(b, 'x', 'rm')).toThrow(/incompatível/);
    valor(b, 'vm', 'rm', { nutriente_id: '01929c20-0000-7000-8000-000000000001', base: 'mn' });
    // Definição inativa não recebe valor novo.
    b.prepare("UPDATE nutriente SET ativo = 0 WHERE id = 'nt'").run();
    expect(() => valor(b, 'x', 'r', { tipo_valor: 'media' })).toThrow(
      /definição de nutriente ativa/,
    );
    // Exclusão lógica em rascunho; excluído congelado; nada apagado.
    b.prepare("UPDATE valor_nutricional SET deleted_at = ? WHERE id = 'v2'").run(agora);
    expect(() =>
      b.prepare("UPDATE valor_nutricional SET deleted_at = NULL WHERE id = 'v2'").run(),
    ).toThrow(/só mudam/);
    expect(() => b.prepare('DELETE FROM valor_nutricional').run()).toThrow(/Exclusão física/);
  });

  it('vínculo com estoque: só item de alimentação e alimento ativos; um por item; só se desfaz', async () => {
    const b = await abrir(12);
    popularFase4(b);
    alimento(b, 'a');
    alimento(b, 'b');
    const vincular = (id: string, item: string, al: string) =>
      ins(
        b,
        'INSERT INTO estoque_item_alimento(id,estoque_item_id,alimento_id,created_at,updated_at) VALUES(?,?,?,?,?)',
        id,
        item,
        al,
      );
    expect(() => vincular('x', 'i-med', 'a')).toThrow(/itens de alimentação/);
    vincular('v1', 'i-racao', 'a');
    expect(() => vincular('v2', 'i-racao', 'b')).toThrow(/UNIQUE/);
    expect(() =>
      b.prepare("UPDATE estoque_item_alimento SET alimento_id = 'b' WHERE id = 'v1'").run(),
    ).toThrow(/não muda/);
    expect(() =>
      b
        .prepare("UPDATE alimento SET deleted_at = ?, motivo_exclusao = 'x' WHERE id = 'a'")
        .run(agora),
    ).toThrow(/não pode ser excluído/);
    b.prepare("UPDATE estoque_item_alimento SET deleted_at = ? WHERE id = 'v1'").run(agora);
    vincular('v2', 'i-racao', 'b');
    expect(() =>
      b.prepare("UPDATE estoque_item_alimento SET deleted_at = NULL WHERE id = 'v1'").run(),
    ).toThrow(/não muda/);
    expect(() => b.prepare('DELETE FROM estoque_item_alimento').run()).toThrow(/Exclusão física/);
  });
});
