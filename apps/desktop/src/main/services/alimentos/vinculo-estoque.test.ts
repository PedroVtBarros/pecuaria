import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DadosItemEstoque } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { criarPropriedade, dadosAlimento } from './apoio-teste-alimentos';

let amb: AmbienteIpc;
let prop: string;
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 21, 10) });
  prop = (await criarPropriedade(amb)).id;
});
afterEach(() => amb.encerrar());

function item(extra: Partial<DadosItemEstoque> = {}): DadosItemEstoque {
  return {
    nome: 'Item de teste',
    tipo: 'silagem',
    unidadeBase: 'kg',
    controleLote: false,
    estoqueMinimo: null,
    produtoSanitarioId: null,
    ativo: true,
    observacoes: null,
    ...extra,
  };
}
const contagens = () =>
  ['movimentacao_estoque', 'lancamento_financeiro', 'valor_nutricional', 'registro_composicao'].map(
    (t) =>
      (amb.gerenciador.conexao.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n,
  );

describe('5A-5: vínculo entre item de estoque e alimento', () => {
  it('vincula, troca e desfaz com trilha, sem mexer em estoque, financeiro ou composição', async () => {
    const i = await amb.ok('estoque:criarItem', { propriedadeId: prop, dados: item() });
    const a = await amb.ok('alimento:criar', { dados: dadosAlimento() });
    const b = await amb.ok('alimento:criar', { dados: dadosAlimento({ nome: 'Outro de teste' }) });
    const antes = contagens();
    expect(await amb.ok('vinculoAlimento:obter', { itemId: i.id })).toMatchObject({
      alimento: null,
      historico: [],
    });
    expect(
      (await amb.ok('vinculoAlimento:definir', { itemId: i.id, alimentoId: a.id })).alimento,
    ).toEqual({ id: a.id, nome: 'Alimento de teste' });
    // Repetir o mesmo vínculo não grava nada.
    await amb.ok('vinculoAlimento:definir', { itemId: i.id, alimentoId: a.id });
    const ficha = await amb.ok('alimento:obter', { id: a.id });
    expect(ficha.itensEstoque).toEqual([
      { id: i.id, nome: 'Item de teste', propriedadeId: prop, propriedadeNome: 'Fazenda de teste' },
    ]);
    // O alimento vinculado não é excluído.
    expect((await amb.chamar('alimento:excluir', { id: a.id, motivo: 'x' })).ok).toBe(false);
    await amb.ok('vinculoAlimento:definir', { itemId: i.id, alimentoId: b.id });
    const desfeito = await amb.ok('vinculoAlimento:definir', { itemId: i.id, alimentoId: null });
    expect(desfeito.alimento).toBeNull();
    expect(desfeito.historico.map((h) => h.acao)).toEqual([
      'vinculacao',
      'desvinculacao',
      'vinculacao',
      'desvinculacao',
    ]);
    expect(contagens()).toEqual(antes);
    await amb.ok('alimento:excluir', { id: a.id, motivo: 'Teste' });
  });

  it('só itens de alimentação e alimentos ativos', async () => {
    const vacina = await amb.ok('estoque:criarItem', {
      propriedadeId: prop,
      dados: item({ nome: 'Vacina de teste', tipo: 'vacina', unidadeBase: 'dose' }),
    });
    const a = await amb.ok('alimento:criar', { dados: dadosAlimento() });
    expect(
      await amb.chamar('vinculoAlimento:definir', { itemId: vacina.id, alimentoId: a.id }),
    ).toMatchObject({ ok: false, erro: { codigo: 'OPERACAO_INVALIDA' } });
    const i = await amb.ok('estoque:criarItem', { propriedadeId: prop, dados: item() });
    await amb.ok('alimento:excluir', { id: a.id, motivo: 'Teste' });
    expect(
      (await amb.chamar('vinculoAlimento:definir', { itemId: i.id, alimentoId: a.id })).ok,
    ).toBe(false);
    expect(
      await amb.chamar('vinculoAlimento:obter', { itemId: '01929c20-0000-7000-8000-0000000000ff' }),
    ).toMatchObject({ ok: false, erro: { codigo: 'NAO_ENCONTRADO' } });
  });
});
