import { afterEach, expect, it } from 'vitest';
import { MIGRACOES_DO_PROJETO } from '../src/migracoes/migracoes-do-projeto';
import { criarPastaTemporaria, montarAmbiente, type Ambiente } from './apoio';
let pasta: ReturnType<typeof criarPastaTemporaria> | undefined;
let aberto: Ambiente | undefined;
afterEach(() => {
  aberto?.gerenciador.fechar();
  pasta?.limpar();
});
it('backup da versão 3 é preservado antes da 0004 e restaura sem inventar consumo', async () => {
  pasta = criarPastaTemporaria();
  const antigo = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 3));
  aberto = antigo;
  await antigo.gerenciador.abrir();
  antigo.gerenciador.conexao
    .prepare(
      "INSERT INTO propriedade(id,nome,nome_normalizado,tipo_exploracao,created_at,updated_at) VALUES('p','Anterior','anterior','misto','2026-10-01','2026-10-01')",
    )
    .run();
  const backup = await antigo.backup.criar('manual');
  antigo.gerenciador.fechar();
  const atual = montarAmbiente(pasta.caminho, MIGRACOES_DO_PROJETO.slice(0, 4));
  aberto = atual;
  expect((await atual.gerenciador.abrir()).aplicadas.map((m) => m.versao)).toEqual([4]);
  expect(
    (await atual.backup.listar()).some((b) => b.tipo === 'pre_migracao' && b.versaoSchema === 3),
  ).toBe(true);
  const restauracao = await atual.backup.restaurar(backup.id);
  expect(restauracao.migracoesAplicadas).toBe(1);
  expect(restauracao.backupSeguranca.versaoSchema).toBe(4);
  const db = atual.gerenciador.conexao;
  expect(db.pragma('user_version', { simple: true })).toBe(4);
  expect(db.prepare('SELECT nome FROM propriedade').get()).toEqual({ nome: 'Anterior' });
  expect(db.prepare('SELECT * FROM movimentacao_estoque').all()).toEqual([]);
  expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
