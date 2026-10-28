import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CANAIS_API } from '@pecuaria/shared-types';
import { VERSAO_SCHEMA_SUPORTADA } from '@pecuaria/database';
import { criarAmbienteIpc, type AmbienteIpc } from '../teste/ambiente-ipc';

describe('registrarIpc com banco real', () => {
  let amb: AmbienteIpc;

  beforeEach(async () => {
    amb = await criarAmbienteIpc();
  });

  afterEach(() => {
    amb.encerrar();
  });

  it('registra exatamente os canais do contrato', () => {
    expect([...amb.canais.keys()].sort()).toEqual([...CANAIS_API].sort());
  });

  it('informa versão do schema e migrations aplicadas', async () => {
    const info = await amb.ok('sistema:obterInfo', {});
    expect(info.versaoSchema).toBe(VERSAO_SCHEMA_SUPORTADA);
    expect(info.versaoSchemaSuportada).toBe(VERSAO_SCHEMA_SUPORTADA);
    expect(info.migracoesAplicadas.map((m) => m.nome)).toEqual([
      'infraestrutura',
      'rebanho',
      'sanidade_e_manejo',
      'estoque',
      'financeiro_base',
      'compra_venda_animais',
      'insumos_e_classificacao',
      'rateio_de_custos',
      'producao_propria',
      'indices_desempenho',
      'devolucao_animais',
      'banco_alimentos',
      'valores_nao_quantificados',
      'curadoria',
      'origem_dos_dados',
      'base_interpretada',
      'selecao_e_perfis',
      'pb_equivalente_nnp',
      'avaliacao_nutricional',
      'anulacao_avaliacao_nutricional',
    ]);
  });

  it('grava e lê configuração, validando valores de chaves conhecidas', async () => {
    expect(
      await amb.chamar('configuracao:definir', { chave: 'interface.tema', valor: 'escuro' }),
    ).toEqual({
      ok: true,
      dados: null,
    });
    expect(await amb.ok('configuracao:obter', { chave: 'interface.tema' })).toEqual({
      valor: 'escuro',
    });
    expect(
      await amb.chamar('configuracao:definir', { chave: 'interface.tema', valor: 'roxo' }),
    ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
    expect(
      await amb.chamar('configuracao:definir', { chave: 'interface.propriedadeAtual', valor: 'x' }),
    ).toMatchObject({ ok: false, erro: { codigo: 'ENTRADA_INVALIDA' } });
  });

  it('cria, lista e restaura backup pela API', async () => {
    await amb.ok('configuracao:definir', { chave: 'teste.valor', valor: 'A' });
    const criado = await amb.ok('backup:criar', { observacao: 'teste' });
    await amb.ok('configuracao:definir', { chave: 'teste.valor', valor: 'B' });
    const restaurado = await amb.ok('backup:restaurar', { id: criado.id });
    expect(restaurado.restauradoDe.id).toBe(criado.id);
    expect(await amb.ok('configuracao:obter', { chave: 'teste.valor' })).toEqual({ valor: 'A' });
  });

  it('exportação, importação e modelo de planilha cancelados no diálogo não alteram nada', async () => {
    const criado = await amb.ok('backup:criar', {});
    expect(await amb.ok('backup:exportar', { id: criado.id })).toEqual({ cancelado: true });
    expect(await amb.ok('backup:importarERestaurar', {})).toEqual({ cancelado: true });
    expect(await amb.ok('animal:salvarModeloCsv', {})).toEqual({ cancelado: true });
  });
});
