import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import type {
  DadosMovimentoEstoque,
  MovimentoEstoque,
  MovimentoEstoqueValidado,
} from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import { mesmosDadosDoMovimento } from './servico-estoque';

/**
 * Ajustes pós-Fase 3: mudanças retroativas de data de saída do animal, de encerramento e de
 * formação do lote não podem deixar consumos de estoque ativos fora do período em que o animal
 * ou o lote existia. O consumo nunca é alterado ou cancelado automaticamente.
 */
let amb: AmbienteIpc;
let prop: string;
let itemId: string;

function movimento(
  tipo: DadosMovimentoEstoque['tipo'],
  quantidade: number,
  extra: Partial<DadosMovimentoEstoque> = {},
): DadosMovimentoEstoque {
  const entrada = tipo.startsWith('entrada');
  return {
    data: '2026-01-02',
    tipo,
    quantidade,
    unidadeBase: 'kg',
    loteEstoqueId: null,
    custoEntradaCentavos: entrada ? 10000 : null,
    destino: entrada ? null : 'propriedade',
    loteAnimalId: null,
    animalId: null,
    documentoOrigemId: null,
    motivo: null,
    observacao: null,
    ...extra,
  };
}
async function registrar(d: DadosMovimentoEstoque): Promise<MovimentoEstoque> {
  return amb.ok('estoque:registrar', { itemId, requisicaoId: gerarUuidV7(), dados: d });
}
async function criarAnimal() {
  return amb.ok('animal:criar', {
    propriedadeId: prop,
    dados: {
      identificacao: 'B-1',
      nome: null,
      sexo: 'M',
      condicaoSexual: 'castrado',
      categoria: 'garrote',
      aptidao: 'corte',
      racaId: null,
      dataNascimento: null,
      dataNascimentoEstimada: false,
      maeId: null,
      paiId: null,
      origem: 'comprado',
      observacoes: null,
    },
    entrada: { data: '2026-01-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
  });
}
async function criarLote(dataFormacao = '2026-01-01') {
  return amb.ok('lote:criar', {
    propriedadeId: prop,
    dados: {
      nome: 'Terminação',
      finalidade: 'engorda',
      dataFormacao,
      areaId: null,
      observacoes: null,
    },
  });
}
async function textoDoErro(
  r: Promise<{ ok: boolean; erro?: { mensagem: string; detalhes?: string[] } }>,
) {
  const resultado = await r;
  expect(resultado.ok).toBe(false);
  return [resultado.erro?.mensagem, ...(resultado.erro?.detalhes ?? [])].join(' | ');
}
async function extrato() {
  return (await amb.ok('estoque:obter', { id: itemId })).movimentos;
}

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 16, 12) });
  prop = (
    await amb.ok('propriedade:criar', {
      dados: {
        nome: 'Fazenda integridade',
        municipio: null,
        uf: null,
        areaTotalHa: null,
        tipoExploracao: 'misto',
        observacoes: null,
      },
    })
  ).id;
  itemId = (
    await amb.ok('estoque:criarItem', {
      propriedadeId: prop,
      dados: {
        nome: 'Silagem própria',
        tipo: 'silagem',
        unidadeBase: 'kg',
        controleLote: false,
        estoqueMinimo: null,
        produtoSanitarioId: null,
        ativo: true,
        observacoes: null,
      },
    })
  ).id;
  await registrar(movimento('entrada_compra', 100));
});
afterEach(() => amb.encerrar());

describe('saída de animal e consumo de estoque', () => {
  it('permite saída em data igual ou posterior ao último consumo e preserva o histórico', async () => {
    const a = await criarAnimal();
    await registrar(
      movimento('saida_consumo', 4, { data: '2026-03-01', destino: 'animal', animalId: a.id }),
    );
    const antes = await extrato();
    const saiu = await amb.ok('animal:registrarSaida', {
      id: a.id,
      tipo: 'vendido',
      data: '2026-03-01',
      motivo: null,
    });
    expect(saiu.status).toBe('vendido');
    expect(await extrato()).toEqual(antes);
  });

  it('recusa saída anterior a consumo ativo, orienta a corrigir e não altera nada', async () => {
    const a = await criarAnimal();
    await registrar(
      movimento('saida_consumo', 4, { data: '2026-03-01', destino: 'animal', animalId: a.id }),
    );
    await registrar(
      movimento('saida_consumo', 6, { data: '2026-04-01', destino: 'animal', animalId: a.id }),
    );
    const antes = await extrato();
    const texto = await textoDoErro(
      amb.chamar('animal:registrarSaida', {
        id: a.id,
        tipo: 'vendido',
        data: '2026-02-15',
        motivo: null,
      }),
    );
    expect(texto).toContain('consumo de estoque registrado depois da data de saída');
    expect(texto).toContain('01/03/2026: Silagem própria, 4 kg');
    expect(texto).toContain('01/04/2026: Silagem própria, 6 kg');
    expect(texto).toContain('Corrija ou cancele esses movimentos na tela de Estoque');
    expect((await amb.ok('animal:obter', { id: a.id })).status).toBe('ativo');
    expect(await extrato()).toEqual(antes);
  });

  it('resume quando há muitos consumos conflitantes', async () => {
    const a = await criarAnimal();
    for (const dia of ['02', '03', '04', '05', '06'])
      await registrar(
        movimento('saida_consumo', 1, {
          data: `2026-03-${dia}`,
          destino: 'animal',
          animalId: a.id,
        }),
      );
    const texto = await textoDoErro(
      amb.chamar('animal:registrarSaida', {
        id: a.id,
        tipo: 'morto',
        data: '2026-03-01',
        motivo: null,
      }),
    );
    expect(texto).toContain('e mais 2');
  });

  it('ignora movimentos cancelados; consumo corrigido para antes da saída também libera', async () => {
    const a = await criarAnimal();
    const cancelado = await registrar(
      movimento('saida_consumo', 4, { data: '2026-04-01', destino: 'animal', animalId: a.id }),
    );
    const corrigido = await registrar(
      movimento('saida_consumo', 5, { data: '2026-05-01', destino: 'animal', animalId: a.id }),
    );
    const data = '2026-03-01';
    expect(
      (
        await amb.chamar('animal:registrarSaida', {
          id: a.id,
          tipo: 'vendido',
          data,
          motivo: null,
        })
      ).ok,
    ).toBe(false);
    await amb.ok('estoque:cancelar', { id: cancelado.id, motivo: 'Lançado por engano' });
    await amb.ok('estoque:corrigir', {
      id: corrigido.id,
      requisicaoId: gerarUuidV7(),
      dados: movimento('saida_consumo', 5, { data, destino: 'animal', animalId: a.id }),
      motivo: 'Data estava errada',
    });
    expect(
      (await amb.ok('animal:registrarSaida', { id: a.id, tipo: 'vendido', data, motivo: null }))
        .status,
    ).toBe('vendido');
  });

  it('consumo de outro animal, da propriedade ou de lote não impede a saída', async () => {
    const a = await criarAnimal();
    const lote = await criarLote();
    await registrar(movimento('saida_consumo', 1, { data: '2026-05-01' }));
    await registrar(
      movimento('saida_consumo', 1, { data: '2026-05-01', destino: 'lote', loteAnimalId: lote.id }),
    );
    expect(
      (
        await amb.ok('animal:registrarSaida', {
          id: a.id,
          tipo: 'descartado',
          data: '2026-02-01',
          motivo: null,
        })
      ).status,
    ).toBe('descartado');
  });
});

describe('encerramento e formação de lote de animais', () => {
  it('encerra em data igual ou posterior ao último consumo e preserva o histórico', async () => {
    const lote = await criarLote();
    await registrar(
      movimento('saida_consumo', 3, {
        data: '2026-06-10',
        destino: 'lote',
        loteAnimalId: lote.id,
      }),
    );
    const antes = await extrato();
    const encerrado = await amb.ok('lote:encerrar', { id: lote.id, data: '2026-06-10' });
    expect(encerrado.ativo).toBe(false);
    expect(await extrato()).toEqual(antes);
  });

  it('recusa encerramento anterior a consumo ativo e não altera lote nem movimentos', async () => {
    const lote = await criarLote();
    await registrar(
      movimento('saida_consumo', 3, {
        data: '2026-06-10',
        destino: 'lote',
        loteAnimalId: lote.id,
      }),
    );
    const antes = await extrato();
    const texto = await textoDoErro(
      amb.chamar('lote:encerrar', { id: lote.id, data: '2026-06-01' }),
    );
    expect(texto).toContain('consumo de estoque registrado depois da data de encerramento');
    expect(texto).toContain('10/06/2026: Silagem própria, 3 kg');
    expect(texto).toContain('não é alterado automaticamente');
    expect((await amb.ok('lote:obter', { id: lote.id })).ativo).toBe(true);
    expect(await extrato()).toEqual(antes);
  });

  it('movimento cancelado não impede o encerramento retroativo', async () => {
    const lote = await criarLote();
    const m = await registrar(
      movimento('saida_consumo', 3, {
        data: '2026-06-10',
        destino: 'lote',
        loteAnimalId: lote.id,
      }),
    );
    await amb.ok('estoque:cancelar', { id: m.id, motivo: 'Lançado no lote errado' });
    expect((await amb.ok('lote:encerrar', { id: lote.id, data: '2026-06-01' })).ativo).toBe(false);
    expect((await extrato()).find((x) => x.id === m.id)?.canceladoEm).not.toBeNull();
  });

  it('formação do lote não pode passar a ser posterior a consumo já registrado', async () => {
    const lote = await criarLote('2026-01-01');
    await registrar(
      movimento('saida_consumo', 3, {
        data: '2026-03-10',
        destino: 'lote',
        loteAnimalId: lote.id,
      }),
    );
    const dados = {
      nome: 'Terminação',
      finalidade: 'engorda' as const,
      observacoes: null,
    };
    const texto = await textoDoErro(
      amb.chamar('lote:atualizar', {
        id: lote.id,
        dados: { ...dados, dataFormacao: '2026-04-01' },
      }),
    );
    expect(texto).toContain('consumo de estoque registrado antes da nova data de formação');
    expect((await amb.ok('lote:obter', { id: lote.id })).dataFormacao).toBe('2026-01-01');
    // Mesma data de formação, outra edição: continua permitida.
    expect(
      (
        await amb.ok('lote:atualizar', {
          id: lote.id,
          dados: { ...dados, nome: 'Terminação 2', dataFormacao: '2026-01-01' },
        })
      ).nome,
    ).toBe('Terminação 2');
    // Formação até a data do primeiro consumo é compatível.
    expect(
      (
        await amb.ok('lote:atualizar', {
          id: lote.id,
          dados: { ...dados, nome: 'Terminação 2', dataFormacao: '2026-03-10' },
        })
      ).dataFormacao,
    ).toBe('2026-03-10');
  });
});

describe('repetição idempotente sem depender da ordem das propriedades', () => {
  const base = movimento('saida_consumo', 2.5, { data: '2026-03-01' }) as MovimentoEstoqueValidado;
  it('reconhece o mesmo conteúdo com propriedades em outra ordem', () => {
    const embaralhado = Object.fromEntries(
      Object.entries(base).reverse(),
    ) as unknown as MovimentoEstoqueValidado;
    expect(Object.keys(embaralhado)).not.toEqual(Object.keys(base));
    expect(mesmosDadosDoMovimento(base, embaralhado)).toBe(true);
  });
  it('distingue qualquer campo diferente', () => {
    for (const mudanca of [
      { data: '2026-03-02' },
      { quantidade: 2.501 },
      { tipo: 'saida_perda' as const },
      { loteEstoqueId: gerarUuidV7() },
      { destino: 'animal' as const, animalId: gerarUuidV7() },
      { motivo: 'outro' },
      { observacao: 'outra' },
      { documentoOrigemId: gerarUuidV7() },
    ])
      expect(mesmosDadosDoMovimento(base, { ...base, ...mudanca })).toBe(false);
  });
  it('requisição repetida com o mesmo conteúdo devolve o movimento; conteúdo diferente é recusado', async () => {
    const requisicaoId = gerarUuidV7();
    const primeiro = await amb.ok('estoque:registrar', {
      itemId,
      requisicaoId,
      dados: movimento('saida_consumo', 2.5, { data: '2026-03-01' }),
    });
    const repetido = await amb.ok('estoque:registrar', {
      itemId,
      requisicaoId,
      dados: movimento('saida_consumo', 2.5, { data: '2026-03-01' }),
    });
    expect(repetido.id).toBe(primeiro.id);
    expect(
      (
        await amb.chamar('estoque:registrar', {
          itemId,
          requisicaoId,
          dados: movimento('saida_consumo', 2.6, { data: '2026-03-01' }),
        })
      ).ok,
    ).toBe(false);
    expect((await extrato()).filter((m) => m.tipo === 'saida_consumo')).toHaveLength(1);
  });
});

describe('estoque mínimo configurável', () => {
  async function itemComMinimo(nome: string, estoqueMinimo: number | null, entrada: number) {
    const i = await amb.ok('estoque:criarItem', {
      propriedadeId: prop,
      dados: {
        nome,
        tipo: 'mineral',
        unidadeBase: 'kg',
        controleLote: false,
        estoqueMinimo,
        produtoSanitarioId: null,
        ativo: true,
        observacoes: null,
      },
    });
    if (entrada > 0)
      await amb.ok('estoque:registrar', {
        itemId: i.id,
        requisicaoId: gerarUuidV7(),
        dados: movimento('entrada_compra', entrada),
      });
    return i.id;
  }
  async function alerta(id: string) {
    return (await amb.ok('estoque:listar', { propriedadeId: prop })).find((i) => i.id === id)!
      .abaixoMinimo;
  }
  it('não informado desliga o alerta, mesmo com saldo zero', async () => {
    expect(await alerta(await itemComMinimo('Sem mínimo', null, 0))).toBe(false);
  });
  it('zero avisa só com saldo zerado', async () => {
    expect(await alerta(await itemComMinimo('Mínimo zero vazio', 0, 0))).toBe(true);
    expect(await alerta(await itemComMinimo('Mínimo zero com saldo', 0, 0.001))).toBe(false);
  });
  it('maior que zero avisa com saldo menor ou igual ao mínimo', async () => {
    expect(await alerta(await itemComMinimo('Acima', 10, 10.001))).toBe(false);
    expect(await alerta(await itemComMinimo('Igual', 10, 10))).toBe(true);
    expect(await alerta(await itemComMinimo('Abaixo', 10, 9.999))).toBe(true);
  });
  it('a lista de alertas segue a mesma regra', async () => {
    const igual = await itemComMinimo('Igual', 10, 10);
    await itemComMinimo('Sem mínimo', null, 0);
    const ids = (await amb.ok('estoque:alertas', { propriedadeId: prop })).minimo.map((i) => i.id);
    expect(ids).toEqual([igual]);
  });
});
