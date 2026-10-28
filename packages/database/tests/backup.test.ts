import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { ErroAplicacao } from '@pecuaria/shared-types';
import { lerVersaoSchema } from '../src/conexao';
import {
  MIGRACOES_DO_PROJETO,
  VERSAO_SCHEMA_SUPORTADA,
} from '../src/migracoes/migracoes-do-projeto';
import { RepositorioConfiguracao } from '../src/repositorios/repositorio-configuracao';
import { gerarIdBackup } from '../src/backup/servico-backup';
import { sha256Arquivo } from '../src/util';
import { criarPastaTemporaria, MIGRACAO_TESTE_EXTRA, montarAmbiente, type Ambiente } from './apoio';

const UM_DIA = 24 * 3600 * 1000;

describe('ServicoBackup', () => {
  let pasta: ReturnType<typeof criarPastaTemporaria>;
  let amb: Ambiente;
  let repo: RepositorioConfiguracao;

  beforeEach(async () => {
    pasta = criarPastaTemporaria();
    amb = montarAmbiente(pasta.caminho);
    await amb.gerenciador.abrir();
    repo = new RepositorioConfiguracao(() => amb.gerenciador.conexao);
  });

  afterEach(() => {
    amb.gerenciador.fechar();
    pasta.limpar();
  });

  it('cria backup manual com manifesto, hash correto e arquivo único', async () => {
    repo.definir('teste.valor', 'A');
    const info = await amb.backup.criar('manual', '  antes do teste  ');
    const arquivo = join(amb.backup.pasta, info.id);

    expect(info.tipo).toBe('manual');
    expect(info.observacao).toBe('antes do teste');
    expect(info.versaoSchema).toBe(VERSAO_SCHEMA_SUPORTADA);
    expect(existsSync(arquivo)).toBe(true);
    expect(existsSync(arquivo.replace(/\.db$/, '.json'))).toBe(true);
    expect(existsSync(`${arquivo}-wal`)).toBe(false);
    expect(await sha256Arquivo(arquivo)).toBe(info.hashSha256);

    const copia = new Database(arquivo, { readonly: true });
    try {
      expect(copia.pragma('journal_mode', { simple: true })).toBe('delete');
      expect(
        (
          copia
            .prepare("SELECT valor_json FROM configuracao WHERE chave = 'teste.valor'")
            .get() as {
            valor_json: string;
          }
        ).valor_json,
      ).toBe('"A"');
    } finally {
      copia.close();
    }

    expect(await amb.backup.listar()).toEqual([info]);
  });

  it('restauração devolve os dados do backup e guarda o estado anterior', async () => {
    repo.definir('teste.valor', 'A');
    const backupA = await amb.backup.criar('manual');
    repo.definir('teste.valor', 'B');
    repo.definir('teste.somenteDepois', true);

    const resultado = await amb.backup.restaurar(backupA.id);

    expect(repo.obter('teste.valor')).toBe('A');
    expect(repo.obter('teste.somenteDepois')).toBeNull();
    expect(resultado.restauradoDe.id).toBe(backupA.id);
    expect(resultado.backupSeguranca.tipo).toBe('pre_restauracao');
    expect(resultado.migracoesAplicadas).toBe(0);

    // O backup de segurança contém o estado B e também pode ser restaurado.
    await amb.backup.restaurar(resultado.backupSeguranca.id);
    expect(repo.obter('teste.valor')).toBe('B');
    expect(repo.obter('teste.somenteDepois')).toBe(true);
  });

  it('a lista de backups sobrevive à restauração de um backup antigo', async () => {
    const antigo = await amb.backup.criar('manual');
    amb.relogio.avancar(1000);
    const novo = await amb.backup.criar('manual');
    await amb.backup.restaurar(antigo.id);
    const ids = (await amb.backup.listar()).map((b) => b.id);
    expect(ids).toContain(antigo.id);
    expect(ids).toContain(novo.id);
  });

  it('recusa backup adulterado e mantém o banco atual intacto', async () => {
    repo.definir('teste.valor', 'A');
    const info = await amb.backup.criar('manual');
    repo.definir('teste.valor', 'B');

    const arquivo = join(amb.backup.pasta, info.id);
    const bytes = readFileSync(arquivo);
    bytes[bytes.length - 10] = (bytes[bytes.length - 10] ?? 0) ^ 0xff;
    writeFileSync(arquivo, bytes);

    await expect(amb.backup.restaurar(info.id)).rejects.toMatchObject({
      codigo: 'BACKUP_INVALIDO',
    });
    expect(repo.obter('teste.valor')).toBe('B');
  });

  it('recusa identificador com caminho relativo', async () => {
    await expect(amb.backup.restaurar('../dados/pecuaria.db')).rejects.toMatchObject({
      codigo: 'ENTRADA_INVALIDA',
    });
  });

  it('recusa backup inexistente', async () => {
    await expect(
      amb.backup.restaurar('pecuaria_20260101-000000-000_manual.db'),
    ).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO' });
  });

  it('backup automático é criado no máximo uma vez por dia', async () => {
    const primeiro = await amb.backup.backupAutomaticoDiario();
    const repetido = await amb.backup.backupAutomaticoDiario();
    amb.relogio.avancar(UM_DIA);
    const diaSeguinte = await amb.backup.backupAutomaticoDiario();

    expect(primeiro?.tipo).toBe('automatico');
    expect(repetido).toBeNull();
    expect(diaSeguinte?.tipo).toBe('automatico');
    expect((await amb.backup.listar()).filter((b) => b.tipo === 'automatico')).toHaveLength(2);
  });

  it('retenção remove automáticos antigos e nunca remove manuais', async () => {
    const manual = await amb.backup.criar('manual');
    for (let dia = 0; dia < 10; dia++) {
      await amb.backup.backupAutomaticoDiario();
      amb.relogio.avancar(UM_DIA);
    }
    const lista = await amb.backup.listar();
    const automaticos = lista.filter((b) => b.tipo === 'automatico');
    // 10 dias consecutivos: os 7 dias mais recentes ficam pela regra diária e
    // algum mais antigo pode ficar pela regra semanal ou mensal.
    expect(automaticos.length).toBeLessThan(10);
    expect(automaticos.length).toBeGreaterThanOrEqual(7);
    expect(lista.some((b) => b.id === manual.id)).toBe(true);
  });

  it('exporta cópia idêntica do backup', async () => {
    const info = await amb.backup.criar('manual');
    const destino = join(pasta.caminho, 'exportado.db');
    await amb.backup.exportar(info.id, destino);
    expect(await sha256Arquivo(destino)).toBe(info.hashSha256);
  });

  it('importa arquivo externo válido e restaura', async () => {
    repo.definir('teste.valor', 'A');
    const info = await amb.backup.criar('manual');
    const externo = join(pasta.caminho, 'copia-externa.db');
    await amb.backup.exportar(info.id, externo);
    repo.definir('teste.valor', 'B');

    const resultado = await amb.backup.importarERestaurar(externo);

    expect(resultado.restauradoDe.tipo).toBe('importado');
    expect(resultado.restauradoDe.observacao).toBe('Importado de copia-externa.db');
    expect(repo.obter('teste.valor')).toBe('A');
  });

  it('recusa importar arquivo que não é SQLite, sem alterar o banco', async () => {
    repo.definir('teste.valor', 'B');
    const externo = join(pasta.caminho, 'texto.db');
    writeFileSync(externo, 'isto não é um banco de dados'.repeat(100));
    await expect(amb.backup.importarERestaurar(externo)).rejects.toBeInstanceOf(ErroAplicacao);
    expect(repo.obter('teste.valor')).toBe('B');
    expect((await amb.backup.listar()).filter((b) => b.tipo === 'importado')).toEqual([]);
  });

  it('recusa importar SQLite de outro aplicativo', async () => {
    const externo = join(pasta.caminho, 'outro-app.db');
    const outro = new Database(externo);
    outro.exec('CREATE TABLE qualquer (x TEXT);');
    outro.close();
    await expect(amb.backup.importarERestaurar(externo)).rejects.toMatchObject({
      codigo: 'BACKUP_INVALIDO',
    });
  });

  it('operações concorrentes rodam em série sem corromper arquivos', async () => {
    const resultados = await Promise.all([
      amb.backup.criar('manual', '1'),
      amb.backup.criar('manual', '2'),
      amb.backup.criar('manual', '3'),
    ]);
    expect(new Set(resultados.map((r) => r.id)).size).toBe(3);
    for (const r of resultados) {
      expect(await sha256Arquivo(join(amb.backup.pasta, r.id))).toBe(r.hashSha256);
    }
  });
});

describe('ServicoBackup com evolução de schema', () => {
  let pasta: ReturnType<typeof criarPastaTemporaria>;

  beforeEach(() => {
    pasta = criarPastaTemporaria();
  });

  afterEach(() => {
    pasta.limpar();
  });

  it('cria backup pré-migração e restaura backup antigo aplicando as migrations', async () => {
    // Versão 1 do app
    const v1 = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO);
    await v1.gerenciador.abrir();
    new RepositorioConfiguracao(() => v1.gerenciador.conexao).definir('teste.valor', 'v1');
    const backupV1 = await v1.backup.criar('manual');
    v1.gerenciador.fechar();

    // Versão 2 do app, com uma migration nova
    const v2 = montarAmbiente(pasta.caminho, [...MIGRACOES_DO_PROJETO, MIGRACAO_TESTE_EXTRA]);
    const abertura = await v2.gerenciador.abrir();
    try {
      expect(abertura.aplicadas.map((m) => m.versao)).toEqual([MIGRACAO_TESTE_EXTRA.versao]);
      const preMigracao = (await v2.backup.listar()).filter((b) => b.tipo === 'pre_migracao');
      expect(preMigracao).toHaveLength(1);
      expect(preMigracao[0]?.versaoSchema).toBe(VERSAO_SCHEMA_SUPORTADA);

      const resultado = await v2.backup.restaurar(backupV1.id);
      expect(resultado.migracoesAplicadas).toBe(1);
      expect(lerVersaoSchema(v2.gerenciador.conexao)).toBe(MIGRACAO_TESTE_EXTRA.versao);
      expect(new RepositorioConfiguracao(() => v2.gerenciador.conexao).obter('teste.valor')).toBe(
        'v1',
      );
    } finally {
      v2.gerenciador.fechar();
    }
  });

  it('recusa restaurar backup de versão mais nova que o aplicativo', async () => {
    const v2 = montarAmbiente(pasta.caminho, [...MIGRACOES_DO_PROJETO, MIGRACAO_TESTE_EXTRA]);
    await v2.gerenciador.abrir();
    const backupV2 = await v2.backup.criar('manual');
    v2.gerenciador.fechar();

    const outraPasta = criarPastaTemporaria();
    try {
      const v1 = montarAmbiente(outraPasta.caminho, MIGRACOES_DO_PROJETO);
      await v1.gerenciador.abrir();
      try {
        await expect(
          v1.backup.importarERestaurar(join(pasta.caminho, 'backups', backupV2.id)),
        ).rejects.toThrow(/versão mais nova/);
      } finally {
        v1.gerenciador.fechar();
      }
    } finally {
      outraPasta.limpar();
    }
  });
});

describe('gerarIdBackup', () => {
  it('usa horário local e evita colisão', () => {
    const data = new Date(2026, 9, 15, 9, 5, 7, 42);
    const id = gerarIdBackup(data, 'manual', new Set());
    expect(id).toBe('pecuaria_20261015-090507-042_manual.db');
    expect(gerarIdBackup(data, 'manual', new Set([id]))).toBe(
      'pecuaria_20261015-090507-042_manual-1.db',
    );
  });
});
