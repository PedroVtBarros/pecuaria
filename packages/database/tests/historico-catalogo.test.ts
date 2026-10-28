import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { abrirConexao, type Conexao } from '../src/conexao';
import { aplicarMigracoes } from '../src/migracoes/migrador';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import {
  ACOES_HISTORICO,
  ENTIDADES_HISTORICO,
  ErroTrilha,
  RepositorioHistorico,
  type AcaoHistorico,
  type EntidadeHistorico,
} from '../src/repositorios/repositorio-historico';
import { criarPastaTemporaria } from './apoio';

let db: Conexao | undefined;
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
afterEach(() => {
  db?.close();
  db = undefined;
  pasta?.limpar();
});
async function abrir() {
  pasta = criarPastaTemporaria();
  db = abrirConexao(join(pasta.caminho, 'trilha.db'));
  await aplicarMigracoes(db, MIGRACOES_DO_PROJETO);
  return db;
}
const agora = '2026-10-16T12:00:00.000Z';

// Valores aceitos pelo CHECK antigo (migrations 0002 a 0004): nenhum pode sair do catálogo,
// ou a leitura de registros antigos e a escrita de novos fluxos quebrariam.
const ENTIDADES_ANTIGAS = [
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
const ACOES_ANTIGAS = [
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

describe('trilha de alterações: catálogo tipado e escrita centralizada (D-I)', () => {
  it('o catálogo contém tudo o que o banco antigo aceitava, sem repetição e no formato do banco', () => {
    for (const e of ENTIDADES_ANTIGAS)
      expect(ENTIDADES_HISTORICO as readonly string[]).toContain(e);
    for (const a of ACOES_ANTIGAS) expect(ACOES_HISTORICO as readonly string[]).toContain(a);
    expect(new Set(ENTIDADES_HISTORICO).size).toBe(ENTIDADES_HISTORICO.length);
    expect(new Set(ACOES_HISTORICO).size).toBe(ACOES_HISTORICO.length);
    for (const v of [...ENTIDADES_HISTORICO, ...ACOES_HISTORICO])
      expect(v).toMatch(/^[a-z_]{1,60}$/);
  });

  it('todo valor do catálogo é aceito pelo repositório e pelo banco', async () => {
    const b = await abrir();
    const repo = new RepositorioHistorico(() => b);
    let n = 0;
    for (const entidade of ENTIDADES_HISTORICO)
      for (const acao of ACOES_HISTORICO)
        repo.registrar({
          id: `h${n++}`,
          entidade,
          entidadeId: 'x',
          acao,
          dadosAnteriores: { a: 1 },
          dadosNovos: null,
          motivo: null,
          ocorridoEm: agora,
        });
    expect(b.prepare('SELECT COUNT(*) AS n FROM historico_alteracao').get()).toEqual({
      n: ENTIDADES_HISTORICO.length * ACOES_HISTORICO.length,
    });
    expect(repo.listar('lancamento_financeiro', ['x'])).toHaveLength(ACOES_HISTORICO.length);
  });

  it('entidade ou ação fora do catálogo é recusada antes de chegar ao banco', async () => {
    const b = await abrir();
    const repo = new RepositorioHistorico(() => b);
    const base = {
      id: 'h',
      entidadeId: 'x',
      dadosAnteriores: null,
      dadosNovos: null,
      motivo: null,
      ocorridoEm: agora,
    };
    // Valores que passam no formato do banco (minúsculas e "_"), mas não estão no catálogo.
    expect(() =>
      repo.registrar({ ...base, entidade: 'inexistente' as EntidadeHistorico, acao: 'criacao' }),
    ).toThrow(ErroTrilha);
    expect(() =>
      repo.registrar({ ...base, entidade: 'animal', acao: 'inventada' as AcaoHistorico }),
    ).toThrow(/Ação de trilha desconhecida/);
    expect(() => repo.registrar({ ...base, id: ' ', entidade: 'animal', acao: 'criacao' })).toThrow(
      ErroTrilha,
    );
    expect(() =>
      repo.registrar({ ...base, entidadeId: '', entidade: 'animal', acao: 'criacao' }),
    ).toThrow(ErroTrilha);
    expect(b.prepare('SELECT COUNT(*) AS n FROM historico_alteracao').get()).toEqual({ n: 0 });
  });

  it('só o repositório de trilha escreve em historico_alteracao no código de produção', () => {
    const raiz = join(__dirname, '..', '..', '..');
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        if (nome === 'node_modules' || nome === 'out' || nome === 'release' || nome === 'dist')
          continue;
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) arquivos.push(caminho);
      }
    };
    varrer(join(raiz, 'apps'));
    varrer(join(raiz, 'packages'));
    const escritores = arquivos
      .filter((f) => !f.includes(`${join('packages', 'database', 'tests')}`))
      .filter((f) =>
        /INSERT\s+INTO\s+historico_alteracao|UPDATE\s+historico_alteracao|DELETE\s+FROM\s+historico_alteracao/i.test(
          readFileSync(f, 'utf8'),
        ),
      )
      .map((f) => relative(raiz, f).replaceAll('\\', '/'));
    expect(escritores).toEqual(['packages/database/src/repositorios/repositorio-historico.ts']);
  });
});
