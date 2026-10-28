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
async function abrir(versao: number) {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'financeiro.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO.slice(0, versao));
  return db;
}
const agora = '2026-10-16T12:00:00.000Z';
/** A 0005 é testada até a sua versão: migrations posteriores têm testes próprios. */
const ATE_5 = MIGRACOES_DO_PROJETO.slice(0, 5);
const hash = (linhas: unknown) => createHash('sha256').update(JSON.stringify(linhas)).digest('hex');

/** Dados reais de todas as fases anteriores, inclusive uma trilha com todas as entidades. */
function popular(b: Conexao) {
  b.prepare(
    "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Fazenda','fazenda','misto',?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p2','Outra','outra','misto',?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO lote(id,propriedade_id,nome,nome_normalizado,finalidade,data_formacao,created_at,updated_at) VALUES('l','p','Recria','recria','recria','2026-01-01',?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO lote(id,propriedade_id,nome,nome_normalizado,finalidade,data_formacao,created_at,updated_at) VALUES('l2','p2','Outro','outro','recria','2026-01-01',?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO animal(id,propriedade_id,lote_id,identificacao,identificacao_normalizada,sexo,condicao_sexual,categoria,aptidao,origem,data_entrada,created_at,updated_at) VALUES('a','p','l','A-1','a-1','M','castrado','garrote','corte','comprado','2026-01-01',?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO estoque_item(id,propriedade_id,nome,nome_normalizado,tipo,unidade_base,base_materia,controle_lote,created_at,updated_at) VALUES('i','p','Silagem','silagem','silagem','kg','mn',0,?,?)",
  ).run(agora, agora);
  b.prepare(
    "INSERT INTO movimentacao_estoque(id,estoque_item_id,data,ordem,tipo,quantidade_milesimos,unidade_base,custo_entrada_centavos,requisicao_id,created_at,updated_at) VALUES('m','i','2026-10-01',1,'entrada_compra',1000,'kg',500,'r',?,?)",
  ).run(agora, agora);
  const entidades = [
    'propriedade',
    'area',
    'raca',
    'lote',
    'animal',
    'pesagem',
    'produto_sanitario',
    'manejo_sanitario',
    'agenda_sanitaria',
    'estoque_item',
    'estoque_lote',
    'movimentacao_estoque',
  ];
  const acoes = [
    'criacao',
    'alteracao',
    'exclusao',
    'transferencia',
    'saida',
    'encerramento',
    'reabertura',
    'mudanca_area',
    'importacao',
    'conferencia',
    'remocao_animal',
    'cancelamento',
    'conclusao',
  ];
  const inserir = b.prepare(
    'INSERT INTO historico_alteracao(id,entidade,entidade_id,acao,dados_anteriores_json,dados_novos_json,motivo,ocorrido_em) VALUES(?,?,?,?,?,?,?,?)',
  );
  acoes.forEach((acao, i) => {
    const entidade = entidades[i % entidades.length]!;
    inserir.run(
      `h${String(i).padStart(2, '0')}`,
      entidade,
      `e${i}`,
      acao,
      i % 2 ? '{"antes":"á é í ç"}' : null,
      i % 3 ? '{"depois":[1,2,3]}' : null,
      i % 4 ? `motivo ${i}` : null,
      `2026-10-${String(10 + (i % 5)).padStart(2, '0')}T12:00:00.000Z`,
    );
  });
  // Mais linhas que entidades, para garantir que a ordem original é preservada.
  for (const [i, entidade] of entidades.entries())
    inserir.run(
      `z${String(i).padStart(2, '0')}`,
      entidade,
      `x${i}`,
      'criacao',
      null,
      '{}',
      null,
      agora,
    );
}
const TABELAS_ANTERIORES = [
  'propriedade',
  'lote',
  'animal',
  'estoque_item',
  'movimentacao_estoque',
  'configuracao',
];
const linhas = (b: Conexao, tabela: string) =>
  b.prepare(`SELECT * FROM ${tabela} ORDER BY rowid`).all();

describe('migration 0005: base financeira', () => {
  it('aplica do zero, reaplica sem efeito e mantém integridade', async () => {
    const b = await abrir(5);
    expect(b.pragma('user_version', { simple: true })).toBe(5);
    expect((await aplicarMigracoes(b, ATE_5)).aplicadas).toEqual([]);
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    for (const t of [
      'pessoa_comercial',
      'categoria_financeira',
      'lancamento_financeiro',
      'parcela_financeira',
      'pagamento_financeiro',
    ])
      expect(b.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?`).get(t)).toEqual({
        n: 1,
      });
  });

  it('cria só as tabelas da 4A e nenhuma das entregas seguintes', async () => {
    const b = await abrir(5);
    const nomes = (
      b.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((t) => t.name);
    for (const adiantada of [
      'negociacao_animal',
      'negociacao_animal_item',
      'custo_anterior',
      'rateio_custo',
      'centro_producao',
      'lancamento_item',
      'classificacao_custo_origem',
    ])
      expect(nomes).not.toContain(adiantada);
  });

  it('semeia categorias sugeridas coerentes, sem inventar movimento financeiro', async () => {
    const b = await abrir(5);
    const categorias = b.prepare('SELECT * FROM categoria_financeira').all() as Record<
      string,
      unknown
    >[];
    expect(categorias).toHaveLength(15);
    expect(categorias.every((c) => c['origem'] === 'sugestao' && c['ativa'] === 1)).toBe(true);
    const receitas = categorias.filter((c) => c['natureza'] === 'receita');
    expect(receitas.every((c) => c['comportamento_custo'] === 'nao_se_aplica')).toBe(true);
    const despesas = categorias.filter((c) => c['natureza'] === 'despesa');
    expect(despesas.every((c) => c['comportamento_custo'] === 'nao_classificado')).toBe(true);
    const exclusivas = categorias.filter((c) => c['origem_exigida'] !== null).map((c) => c['nome']);
    expect(exclusivas.sort()).toEqual(['Compra de animais', 'Venda de animais']);
    for (const t of [
      'lancamento_financeiro',
      'parcela_financeira',
      'pagamento_financeiro',
      'pessoa_comercial',
    ])
      expect(b.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({ n: 0 });
  });

  it('migra a versão 4 com dados preservando integralmente a trilha (D-I)', async () => {
    const b = await abrir(4);
    popular(b);
    const trilhaAntes = linhas(b, 'historico_alteracao');
    const hashAntes = hash(trilhaAntes);
    const outrasAntes = TABELAS_ANTERIORES.map((t) => linhas(b, t));
    expect(trilhaAntes.length).toBeGreaterThanOrEqual(25);

    expect((await aplicarMigracoes(b, ATE_5)).aplicadas.map((x) => x.nome)).toEqual([
      'financeiro_base',
    ]);

    const trilhaDepois = linhas(b, 'historico_alteracao');
    expect(trilhaDepois).toEqual(trilhaAntes);
    expect(hash(trilhaDepois)).toBe(hashAntes);
    expect(trilhaDepois.map((l) => (l as { id: string }).id)).toEqual(
      trilhaAntes.map((l) => (l as { id: string }).id),
    );
    TABELAS_ANTERIORES.forEach((t, i) => expect(linhas(b, t)).toEqual(outrasAntes[i]));
    expect(b.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(b.pragma('foreign_key_check')).toEqual([]);
    // O índice da trilha existe e continua sendo usado.
    expect(
      b
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'ix_historico_entidade'")
        .get(),
    ).toEqual({ n: 1 });
  });

  it('após migrar, a trilha continua só de inserção e confere o formato', async () => {
    const b = await abrir(4);
    popular(b);
    await aplicarMigracoes(b, ATE_5);
    expect(() => b.prepare("UPDATE historico_alteracao SET motivo = 'x'").run()).toThrow(
      /não pode ser modificada/,
    );
    expect(() => b.prepare('DELETE FROM historico_alteracao').run()).toThrow(
      /não pode ser apagada/,
    );
    const inserir = (entidade: string, acao: string) => () =>
      b
        .prepare(
          'INSERT INTO historico_alteracao(id,entidade,entidade_id,acao,ocorrido_em) VALUES(?,?,?,?,?)',
        )
        .run(`n-${entidade}-${acao}`, entidade, 'x', acao, agora);
    expect(inserir('lancamento_financeiro', 'estorno')).not.toThrow();
    expect(inserir('Lancamento', 'criacao')).toThrow(/CHECK/);
    expect(inserir('lancamento-financeiro', 'criacao')).toThrow(/CHECK/);
    expect(inserir('', 'criacao')).toThrow(/CHECK/);
    expect(inserir('lancamento_financeiro', 'Criação')).toThrow(/CHECK/);
    expect(inserir('a'.repeat(61), 'criacao')).toThrow(/CHECK/);
    expect(() =>
      b
        .prepare(
          "INSERT INTO historico_alteracao(id,entidade,entidade_id,acao,dados_novos_json,ocorrido_em) VALUES('j','animal','x','criacao','{quebrado',?)",
        )
        .run(agora),
    ).toThrow(/CHECK/);
  });

  it('migra da versão 3 pela cadeia 4 e 5 sem perder dados', async () => {
    const b = await abrir(3);
    b.prepare(
      "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Antiga','antiga','corte',?,?)",
    ).run(agora, agora);
    b.prepare(
      "INSERT INTO historico_alteracao(id,entidade,entidade_id,acao,dados_novos_json,ocorrido_em) VALUES('h','propriedade','p','criacao','{\"nome\":\"Antiga\"}',?)",
    ).run(agora);
    const antes = linhas(b, 'historico_alteracao');
    const r = await aplicarMigracoes(b, ATE_5);
    expect(r.aplicadas.map((x) => x.versao)).toEqual([4, 5]);
    expect(linhas(b, 'historico_alteracao')).toEqual(antes);
    expect(b.prepare('SELECT nome FROM propriedade').get()).toEqual({ nome: 'Antiga' });
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('é transacional: falha no passo final desfaz tudo, inclusive as tabelas financeiras', async () => {
    const b = await abrir(4);
    popular(b);
    const trilhaAntes = linhas(b, 'historico_alteracao');
    // Sabotagem: a tabela temporária da recriação da trilha já existe, então a migration falha
    // depois de criar todas as tabelas financeiras.
    b.exec('CREATE TABLE historico_alteracao_nova (x TEXT) STRICT;');
    await expect(aplicarMigracoes(b, ATE_5)).rejects.toThrow(
      /Nenhuma alteração dessa migration foi mantida/,
    );
    expect(b.pragma('user_version', { simple: true })).toBe(4);
    for (const t of ['lancamento_financeiro', 'categoria_financeira', 'pagamento_financeiro'])
      expect(b.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?').get(t)).toEqual({
        n: 0,
      });
    expect(linhas(b, 'historico_alteracao')).toEqual(trilhaAntes);
    expect(() => b.prepare("UPDATE historico_alteracao SET motivo = 'x'").run()).toThrow(
      /não pode ser modificada/,
    );
    // Corrigida a sabotagem, a migration aplica normalmente (banco antigo continua atualizável).
    b.exec('DROP TABLE historico_alteracao_nova;');
    expect((await aplicarMigracoes(b, ATE_5)).aplicadas.map((x) => x.versao)).toEqual([5]);
    expect(linhas(b, 'historico_alteracao')).toEqual(trilhaAntes);
  });

  it('backup pré-migração da versão 4 é feito antes da 0005 e restaura sem perder a trilha', async () => {
    pasta = criarPastaTemporaria();
    const antigo = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 4));
    ambiente = antigo;
    await antigo.gerenciador.abrir();
    popular(antigo.gerenciador.conexao);
    const trilha = linhas(antigo.gerenciador.conexao, 'historico_alteracao');
    const manual = await antigo.backup.criar('manual');
    antigo.gerenciador.fechar();

    const atual = montarAmbiente(pasta.caminho, ATE_5);
    ambiente = atual;
    expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([5]);
    const lista = await atual.backup.listar();
    expect(lista.some((x) => x.tipo === 'pre_migracao' && x.versaoSchema === 4)).toBe(true);
    expect(linhas(atual.gerenciador.conexao, 'historico_alteracao')).toEqual(trilha);

    const restauracao = await atual.backup.restaurar(manual.id);
    expect(restauracao.migracoesAplicadas).toBe(1);
    const conexao = atual.gerenciador.conexao;
    expect(conexao.pragma('user_version', { simple: true })).toBe(5);
    expect(linhas(conexao, 'historico_alteracao')).toEqual(trilha);
    expect(conexao.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(conexao.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('migration 0005: proteções do banco', () => {
  const categoria = (b: Conexao, natureza: 'despesa' | 'receita') =>
    (
      b
        .prepare(
          'SELECT id FROM categoria_financeira WHERE natureza = ? AND origem_exigida IS NULL ORDER BY id',
        )
        .get(natureza) as { id: string }
    ).id;
  const lancamento = (b: Conexao, id: string, extra: Record<string, unknown> = {}): void => {
    const natureza = (extra['natureza'] as 'despesa' | 'receita' | undefined) ?? 'despesa';
    const v = {
      propriedade_id: 'p',
      categoria_id: categoria(b, natureza),
      natureza,
      data_competencia: '2026-10-01',
      valor_total_centavos: 10000,
      descricao: 'Teste',
      atividade: 'nao_definida',
      destino_tipo: 'nenhum',
      lote_id: null,
      animal_id: null,
      condicao_pagamento: 'parcelado',
      comportamento_custo: natureza === 'despesa' ? 'nao_classificado' : 'nao_se_aplica',
      origem_tipo: 'manual',
      origem_id: null,
      motivo_cancelamento: null,
      deleted_at: null,
      ...extra,
    };
    b.prepare(
      `INSERT INTO lancamento_financeiro(id,propriedade_id,categoria_id,natureza,data_competencia,valor_total_centavos,descricao,atividade,destino_tipo,lote_id,animal_id,condicao_pagamento,comportamento_custo,origem_tipo,origem_id,motivo_cancelamento,deleted_at,requisicao_id,created_at,updated_at)
       VALUES(@id,@propriedade_id,@categoria_id,@natureza,@data_competencia,@valor_total_centavos,@descricao,@atividade,@destino_tipo,@lote_id,@animal_id,@condicao_pagamento,@comportamento_custo,@origem_tipo,@origem_id,@motivo_cancelamento,@deleted_at,@requisicao_id,@agora,@agora)`,
    ).run({ id, requisicao_id: `req-${id}`, agora, ...v });
  };
  const parcela = (b: Conexao, id: string, lancamentoId: string, numero: number, valor: number) =>
    b
      .prepare(
        "INSERT INTO parcela_financeira(id,lancamento_id,numero,vencimento,valor_centavos,created_at,updated_at) VALUES(?,?,?,'2026-11-01',?,?,?)",
      )
      .run(id, lancamentoId, numero, valor, agora, agora);
  const pagamento = (b: Conexao, id: string, parcelaId: string, valor: number) =>
    b
      .prepare(
        "INSERT INTO pagamento_financeiro(id,parcela_id,data,valor_centavos,requisicao_id,created_at,updated_at) VALUES(?,?,'2026-10-10',?,?,?,?)",
      )
      .run(id, parcelaId, valor, `req-${id}`, agora, agora);

  async function pronto() {
    const b = await abrir(5);
    popular(b);
    return b;
  }

  it('lançamento: natureza, destino, propriedade, valores e origem são conferidos', async () => {
    const b = await pronto();
    expect(() =>
      lancamento(b, 'x1', { natureza: 'receita', categoria_id: categoria(b, 'despesa') }),
    ).toThrow(/incompatível/);
    expect(() => lancamento(b, 'x2', { destino_tipo: 'lote', lote_id: null })).toThrow(/CHECK/);
    expect(() => lancamento(b, 'x3', { destino_tipo: 'nenhum', lote_id: 'l' })).toThrow(/CHECK/);
    expect(() => lancamento(b, 'x4', { destino_tipo: 'lote', lote_id: 'l2' })).toThrow(
      /incompatível/,
    );
    expect(() => lancamento(b, 'x5', { valor_total_centavos: 0 })).toThrow(/CHECK/);
    expect(() => lancamento(b, 'x6', { valor_total_centavos: 1_000_000_000_001 })).toThrow(/CHECK/);
    expect(() => lancamento(b, 'x7', { valor_total_centavos: 1.5 })).toThrow();
    expect(() =>
      lancamento(b, 'x8', { comportamento_custo: 'variavel', natureza: 'receita' }),
    ).toThrow(/CHECK/);
    expect(() =>
      lancamento(b, 'x9', { origem_tipo: 'negociacao_animal', origem_id: null }),
    ).toThrow(/CHECK/);
    expect(() => lancamento(b, 'xa', { origem_tipo: 'manual', origem_id: 'z' })).toThrow(/CHECK/);
    expect(() => lancamento(b, 'xb', { data_competencia: '01/10/2026' })).toThrow(/CHECK/);
    expect(() => lancamento(b, 'xc', { deleted_at: agora, motivo_cancelamento: null })).toThrow(
      /CHECK/,
    );
    lancamento(b, 'ok', { destino_tipo: 'lote', lote_id: 'l', comportamento_custo: 'fixo' });
    expect(() => lancamento(b, 'ok2', { requisicao_id: 'req-ok' } as never)).toThrow();
  });

  it('lançamento: campos imutáveis, exclusão física proibida e cancelado congelado', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    for (const [coluna, valor] of [
      ['propriedade_id', 'p2'],
      ['natureza', 'receita'],
      ['origem_tipo', 'sanitario'],
      ['requisicao_id', 'outra'],
      ['tipo', 'devolucao'],
    ])
      expect(() =>
        b.prepare(`UPDATE lancamento_financeiro SET ${coluna} = ? WHERE id = 'l1'`).run(valor),
      ).toThrow();
    b.prepare("UPDATE lancamento_financeiro SET descricao = 'Nova' WHERE id = 'l1'").run();
    // DELETE em tabela vazia não dispara gatilho de linha: as tabelas precisam ter registros.
    lancamento(b, 'l0');
    parcela(b, 'p0', 'l0', 1, 100);
    pagamento(b, 'g0', 'p0', 50);
    b.prepare(
      "INSERT INTO pessoa_comercial(id,nome,nome_normalizado,papel,created_at,updated_at) VALUES('s0','Fornecedor','fornecedor','fornecedor',?,?)",
    ).run(agora, agora);
    expect(() => b.prepare('DELETE FROM lancamento_financeiro').run()).toThrow(/física proibida/);
    expect(() => b.prepare('DELETE FROM parcela_financeira').run()).toThrow(/física proibida/);
    expect(() => b.prepare('DELETE FROM pagamento_financeiro').run()).toThrow(/física proibida/);
    expect(() => b.prepare('DELETE FROM categoria_financeira').run()).toThrow(/física proibida/);
    expect(() => b.prepare('DELETE FROM pessoa_comercial').run()).toThrow(/física proibida/);
    b.prepare(
      "UPDATE lancamento_financeiro SET deleted_at = ?, motivo_cancelamento = 'engano' WHERE id = 'l1'",
    ).run(agora);
    expect(() =>
      b.prepare("UPDATE lancamento_financeiro SET descricao = 'x' WHERE id = 'l1'").run(),
    ).toThrow(/cancelado/);
    expect(() =>
      b
        .prepare('UPDATE lancamento_financeiro SET deleted_at = NULL, motivo_cancelamento = NULL')
        .run(),
    ).toThrow();
  });

  it('parcela: exige condição definida, número único e vencimento imutável', async () => {
    const b = await pronto();
    lancamento(b, 'sem', { condicao_pagamento: 'nao_informada' });
    expect(() => parcela(b, 'ps', 'sem', 1, 10000)).toThrow(/condição de pagamento/);
    lancamento(b, 'l1');
    parcela(b, 'p1', 'l1', 1, 6000);
    expect(() => parcela(b, 'p1b', 'l1', 1, 4000)).toThrow(/UNIQUE/);
    parcela(b, 'p2', 'l1', 2, 4000);
    expect(() => parcela(b, 'p0', 'l1', 3, 0)).toThrow(/CHECK/);
    expect(() =>
      b.prepare("UPDATE parcela_financeira SET vencimento = '2027-01-01' WHERE id = 'p1'").run(),
    ).toThrow();
    expect(() =>
      b.prepare("UPDATE parcela_financeira SET numero = 9 WHERE id = 'p1'").run(),
    ).toThrow();
    b.prepare(
      "UPDATE lancamento_financeiro SET deleted_at = ?, motivo_cancelamento = 'x' WHERE id = 'l1'",
    ).run(agora);
    expect(() => parcela(b, 'p3', 'l1', 3, 10)).toThrow(/lançamento ativo/);
  });

  it('pagamento: nunca acima do saldo, só em parcela ativa, só estornável', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    parcela(b, 'p1', 'l1', 1, 6000);
    pagamento(b, 'g1', 'p1', 2500);
    expect(() => pagamento(b, 'g2', 'p1', 3501)).toThrow(/maior que o saldo/);
    pagamento(b, 'g3', 'p1', 3500);
    expect(() => pagamento(b, 'g4', 'p1', 1)).toThrow(/maior que o saldo/);
    expect(() => pagamento(b, 'g5', 'inexistente', 1)).toThrow(/indisponível/);
    // Estornar libera o saldo.
    b.prepare(
      "UPDATE pagamento_financeiro SET deleted_at = ?, motivo_estorno = 'duplicado' WHERE id = 'g3'",
    ).run(agora);
    pagamento(b, 'g6', 'p1', 3500);
    for (const coluna of ['valor_centavos = 1', "data = '2026-10-11'", "forma = 'pix'"])
      expect(() =>
        b.prepare(`UPDATE pagamento_financeiro SET ${coluna} WHERE id = 'g1'`).run(),
      ).toThrow(/estornado, nunca alterado/);
    expect(() =>
      b
        .prepare(
          "UPDATE pagamento_financeiro SET deleted_at = NULL, motivo_estorno = NULL WHERE id = 'g3'",
        )
        .run(),
    ).toThrow(/estornado, nunca alterado/);
  });

  it('parcela com pagamento não fica abaixo do pago nem é cancelada; lançamento com pagamento não é cancelado', async () => {
    const b = await pronto();
    lancamento(b, 'l1');
    parcela(b, 'p1', 'l1', 1, 6000);
    parcela(b, 'p2', 'l1', 2, 4000);
    pagamento(b, 'g1', 'p1', 2500);
    expect(() =>
      b.prepare('UPDATE parcela_financeira SET valor_centavos = 2499 WHERE id = ?').run('p1'),
    ).toThrow(/abaixo do valor pago/);
    b.prepare('UPDATE parcela_financeira SET valor_centavos = 2500 WHERE id = ?').run('p1');
    expect(() =>
      b
        .prepare(
          "UPDATE parcela_financeira SET deleted_at = ?, motivo_cancelamento = 'r' WHERE id = 'p1'",
        )
        .run(agora),
    ).toThrow(/cancelada/);
    b.prepare(
      "UPDATE parcela_financeira SET deleted_at = ?, motivo_cancelamento = 'r' WHERE id = 'p2'",
    ).run(agora);
    expect(() =>
      b
        .prepare(
          "UPDATE lancamento_financeiro SET deleted_at = ?, motivo_cancelamento = 'engano' WHERE id = 'l1'",
        )
        .run(agora),
    ).toThrow(/Estorne os pagamentos/);
    b.prepare(
      "UPDATE pagamento_financeiro SET deleted_at = ?, motivo_estorno = 'x' WHERE id = 'g1'",
    ).run(agora);
    b.prepare(
      "UPDATE lancamento_financeiro SET deleted_at = ?, motivo_cancelamento = 'engano' WHERE id = 'l1'",
    ).run(agora);
    expect(() => pagamento(b, 'g9', 'p1', 1)).toThrow(/indisponível/);
  });

  it('categoria e pessoa: unicidade por nome ativo e classificação coerente com a natureza', async () => {
    const b = await pronto();
    const inserirCategoria =
      (id: string, nome: string, natureza: string, comportamento: string) => () =>
        b
          .prepare(
            "INSERT INTO categoria_financeira(id,nome,nome_normalizado,natureza,grupo,tratamento,comportamento_custo,origem,created_at,updated_at) VALUES(?,?,?,?,'outros','resultado',?,'usuario',?,?)",
          )
          .run(id, nome, nome, natureza, comportamento, agora, agora);
    expect(inserirCategoria('c1', 'Nova', 'despesa', 'fixo')).not.toThrow();
    expect(inserirCategoria('c2', 'Nova', 'despesa', 'variavel')).toThrow(/UNIQUE/);
    expect(inserirCategoria('c3', 'Nova', 'receita', 'nao_se_aplica')).not.toThrow();
    expect(inserirCategoria('c4', 'Outra', 'receita', 'fixo')).toThrow(/CHECK/);
    expect(inserirCategoria('c5', 'Outra', 'despesa', 'nao_se_aplica')).toThrow(/CHECK/);
    const pessoa = (id: string, nome: string) => () =>
      b
        .prepare(
          "INSERT INTO pessoa_comercial(id,nome,nome_normalizado,papel,created_at,updated_at) VALUES(?,?,?,'fornecedor',?,?)",
        )
        .run(id, nome, nome.toLowerCase(), agora, agora);
    expect(pessoa('s1', 'Casa Agro')).not.toThrow();
    expect(pessoa('s2', 'CASA AGRO')).toThrow(/UNIQUE/);
  });
});
