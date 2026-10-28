import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { ConsumoEstoque, DadosManejo, EntradaApi } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
let amb: AmbienteIpc;
let prop: string;
let produto: string;
let item: string;
let animais: { animalId: string; dose: null }[];
const data = '2026-10-01';
function manejo(extra: Partial<DadosManejo> = {}): DadosManejo {
  return {
    tipo: 'tratamento',
    data,
    produtoId: produto,
    descricao: null,
    dose: 0.1,
    unidadeDose: 'ml',
    via: null,
    carenciaCarneDias: null,
    carenciaLeiteDias: null,
    responsavel: null,
    diagnostico: null,
    custoTotalCentavos: null,
    observacoes: null,
    ...extra,
  };
}
function consumo(quantidade = 5, extra: Partial<ConsumoEstoque> = {}): ConsumoEstoque {
  return {
    requisicaoId: gerarUuidV7(),
    itemId: item,
    loteEstoqueId: null,
    quantidade,
    unidadeBase: 'ml',
    ...extra,
  };
}
function pedido(consumosEstoque: ConsumoEstoque[] = []): EntradaApi<'manejoSanitario:registrar'> {
  return { propriedadeId: prop, dados: manejo(), animais, consumosEstoque };
}
async function saldo() {
  return (await amb.ok('estoque:obter', { id: item })).item.saldo;
}
beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: new Date(2026, 9, 16, 12) });
  prop = (
    await amb.ok('propriedade:criar', {
      dados: {
        nome: 'Fazenda teste',
        municipio: null,
        uf: null,
        areaTotalHa: null,
        tipoExploracao: 'misto',
        observacoes: null,
      },
    })
  ).id;
  produto = (
    await amb.ok('produtoSanitario:criar', {
      dados: {
        nome: 'Produto informado',
        tipo: 'outro',
        fabricante: null,
        principioAtivo: null,
        unidadeDose: null,
        carenciaCarneDias: null,
        carenciaLeiteDias: null,
        observacoes: null,
      },
    })
  ).id;
  item = (
    await amb.ok('estoque:criarItem', {
      propriedadeId: prop,
      dados: {
        nome: 'Produto em estoque',
        tipo: 'medicamento',
        unidadeBase: 'ml',
        controleLote: false,
        estoqueMinimo: null,
        produtoSanitarioId: produto,
        ativo: true,
        observacoes: null,
      },
    })
  ).id;
  await amb.ok('estoque:registrar', {
    itemId: item,
    requisicaoId: gerarUuidV7(),
    dados: {
      data: '2026-09-01',
      tipo: 'entrada_compra',
      quantidade: 100,
      unidadeBase: 'ml',
      loteEstoqueId: null,
      custoEntradaCentavos: 2000,
      destino: null,
      loteAnimalId: null,
      animalId: null,
      documentoOrigemId: null,
      motivo: null,
      observacao: null,
    },
  });
  animais = [];
  for (const identificacao of ['A-1', 'A-2']) {
    const a = await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: {
        identificacao,
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
    animais.push({ animalId: a.id, dose: null });
  }
});
afterEach(() => amb.encerrar());
describe('entrega 5: baixa sanitária explícita e transacional', () => {
  it('não deduz consumo das doses nem cria baixa para registros antigos', async () => {
    const r = await amb.ok('manejoSanitario:registrar', pedido());
    expect(r.consumosEstoque).toEqual([]);
    expect(await saldo()).toBe(100);
    await amb.ok('manejoSanitario:atualizar', {
      id: r.id,
      dados: manejo({ observacoes: 'Conferido' }),
      motivo: 'Conferência sem consumo',
    });
    expect(await saldo()).toBe(100);
  });
  it('baixa a quantidade física explícita e a repetição não duplica manejo ou consumo', async () => {
    const p = pedido([consumo()]);
    const r = await amb.ok('manejoSanitario:registrar', p);
    expect(r.consumosEstoque?.[0]).toMatchObject({
      quantidade: 5,
      unidadeBase: 'ml',
      custoApropriadoCentavos: 100,
    });
    expect((await amb.ok('manejoSanitario:registrar', p)).id).toBe(r.id);
    expect(await saldo()).toBe(95);
    expect(
      (await amb.ok('manejoSanitario:listar', { propriedadeId: prop, filtros: {} })).total,
    ).toBe(1);
    expect(
      (await amb.chamar('manejoSanitario:registrar', { ...p, dados: manejo({ dose: 0.2 }) })).ok,
    ).toBe(false);
    expect(
      (
        await amb.chamar('manejoSanitario:registrar', {
          ...p,
          consumosEstoque: [{ ...p.consumosEstoque![0]!, quantidade: 6 }],
        })
      ).ok,
    ).toBe(false);
  });
  it('saldo insuficiente desfaz cabeçalho, animais, agenda e todas as baixas', async () => {
    const agenda = await amb.ok('agendaSanitaria:criar', {
      propriedadeId: prop,
      dados: {
        dataPrevista: data,
        tipo: 'tratamento',
        produtoId: produto,
        descricao: null,
        loteId: null,
        animalId: null,
        observacoes: null,
      },
    });
    expect(
      (
        await amb.chamar('manejoSanitario:registrar', {
          ...pedido([consumo(5), consumo(100)]),
          agendaId: agenda.id,
          proximaAplicacao: { data: '2026-10-20', observacoes: null },
        })
      ).ok,
    ).toBe(false);
    expect(await saldo()).toBe(100);
    expect(
      (await amb.ok('manejoSanitario:listar', { propriedadeId: prop, filtros: {} })).total,
    ).toBe(0);
    const eventos = await amb.ok('agendaSanitaria:listar', { propriedadeId: prop });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.status).toBe('pendente');
  });
  it('recusa unidade ou vínculo de produto incompatível, sem conversões', async () => {
    for (const c of [consumo(1, { unidadeBase: 'dose' }), consumo(1, { unidadeBase: 'un' })])
      expect((await amb.chamar('manejoSanitario:registrar', pedido([c]))).ok).toBe(false);
    expect(
      (
        await amb.chamar('manejoSanitario:registrar', {
          ...pedido([consumo()]),
          dados: manejo({ produtoId: null, descricao: 'Sem produto' }),
        })
      ).ok,
    ).toBe(false);
    expect(await saldo()).toBe(100);
  });
  it('correção exige decisão explícita e reconcilia quantidade preservando ordem e auditoria', async () => {
    const r = await amb.ok('manejoSanitario:registrar', pedido([consumo()]));
    const baixa = r.consumosEstoque![0]!;
    expect(
      (
        await amb.chamar('manejoSanitario:atualizar', {
          id: r.id,
          dados: manejo(),
          motivo: 'Conferência',
        })
      ).ok,
    ).toBe(false);
    const atualizado = await amb.ok('manejoSanitario:atualizar', {
      id: r.id,
      dados: manejo(),
      motivo: 'Quantidade física conferida',
      consumosEstoque: [consumo(8)],
    });
    expect(await saldo()).toBe(92);
    expect(atualizado.consumosEstoque?.[0]).toMatchObject({
      ordem: baixa.ordem,
      substituiId: baixa.id,
      quantidade: 8,
      custoApropriadoCentavos: 160,
    });
    const d = await amb.ok('estoque:obter', { id: item });
    expect(d.movimentos.find((m) => m.id === baixa.id)?.canceladoEm).not.toBeNull();
    expect(d.historico.some((h) => h.motivo === 'Quantidade física conferida')).toBe(true);
  });
  it('reconciliação insuficiente é atômica e mudar data exige reconciliar', async () => {
    const r = await amb.ok('manejoSanitario:registrar', pedido([consumo()]));
    expect(
      (
        await amb.chamar('manejoSanitario:atualizar', {
          id: r.id,
          dados: manejo({ observacoes: 'Não deve persistir' }),
          motivo: 'Correção inválida',
          consumosEstoque: [consumo(101)],
        })
      ).ok,
    ).toBe(false);
    expect(await saldo()).toBe(95);
    expect((await amb.ok('manejoSanitario:obter', { id: r.id })).observacoes).toBeNull();
    expect(
      (
        await amb.chamar('manejoSanitario:atualizar', {
          id: r.id,
          dados: manejo({ data: '2026-10-02' }),
          motivo: 'Troca de data',
          confirmarConsumoMantido: true,
        })
      ).ok,
    ).toBe(false);
  });
  it('retirada de animal confirmada mantém consumo, sem estorno proporcional', async () => {
    const r = await amb.ok('manejoSanitario:registrar', pedido([consumo()]));
    const p = {
      manejoId: r.id,
      animalId: animais[0]!.animalId,
      motivo: 'Animal incluído por engano',
    };
    expect((await amb.chamar('manejoSanitario:removerAnimal', p)).ok).toBe(false);
    await amb.ok('manejoSanitario:removerAnimal', { ...p, confirmarConsumoMantido: true });
    expect(await saldo()).toBe(95);
    expect((await amb.ok('manejoSanitario:obter', { id: r.id })).quantidadeAnimais).toBe(1);
  });
  it('exclusão exige estorno explícito, restitui estoque uma vez e reabre agenda', async () => {
    const agenda = await amb.ok('agendaSanitaria:criar', {
      propriedadeId: prop,
      dados: {
        dataPrevista: data,
        tipo: 'tratamento',
        produtoId: produto,
        descricao: null,
        loteId: null,
        animalId: null,
        observacoes: null,
      },
    });
    const r = await amb.ok('manejoSanitario:registrar', {
      ...pedido([consumo()]),
      agendaId: agenda.id,
    });
    const p = { id: r.id, motivo: 'Registro feito por engano' };
    expect((await amb.chamar('manejoSanitario:excluir', p)).ok).toBe(false);
    await amb.ok('manejoSanitario:excluir', { ...p, estornarEstoque: true });
    expect(await saldo()).toBe(100);
    expect(
      (await amb.ok('agendaSanitaria:listar', { propriedadeId: prop })).find(
        (a) => a.id === agenda.id,
      )?.status,
    ).toBe('pendente');
    await amb.chamar('manejoSanitario:excluir', { ...p, estornarEstoque: true });
    expect(await saldo()).toBe(100);
    expect(
      (
        await amb.chamar(
          'manejoSanitario:registrar',
          pedido(
            r.consumosEstoque!.map((c) => ({
              itemId: c.itemId,
              loteEstoqueId: c.loteEstoqueId,
              quantidade: c.quantidade,
              unidadeBase: c.unidadeBase,
              requisicaoId: c.requisicaoId,
            })),
          ),
        )
      ).ok,
    ).toBe(false);
  });
  it('estoque não permite estorno ou correção direta de baixa sanitária', async () => {
    const r = await amb.ok('manejoSanitario:registrar', pedido([consumo()]));
    const baixa = r.consumosEstoque![0]!;
    expect(
      (await amb.chamar('estoque:cancelar', { id: baixa.id, motivo: 'Via incorreta' })).ok,
    ).toBe(false);
    expect(await saldo()).toBe(95);
  });
});
describe('entrega 6: persistência, backup e restauração', () => {
  it('reinício e restauração preservam estoque, baixas, vínculos e trilha', async () => {
    const r = await amb.ok('manejoSanitario:registrar', pedido([consumo()]));
    const antes = await amb.ok('estoque:obter', { id: item });
    const backup = await amb.ok('backup:criar', { observacao: 'Estoque e manejo vinculados' });
    await amb.ok('manejoSanitario:atualizar', {
      id: r.id,
      dados: manejo(),
      motivo: 'Quantidade revisada',
      consumosEstoque: [consumo(8)],
    });
    expect(await saldo()).toBe(92);
    await amb.reiniciar();
    expect(await saldo()).toBe(92);
    await amb.ok('backup:restaurar', { id: backup.id });
    expect(await amb.ok('estoque:obter', { id: item })).toEqual(antes);
    expect((await amb.ok('manejoSanitario:obter', { id: r.id })).consumosEstoque).toEqual(
      r.consumosEstoque,
    );
    expect(amb.gerenciador.conexao.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    expect(amb.gerenciador.conexao.pragma('foreign_key_check')).toEqual([]);
    await amb.reiniciar();
    expect(await saldo()).toBe(95);
  });
});

describe('rastreabilidade e ordem em correções', () => {
  it('consumo individual mantém destino e protege a ficha contra exclusão', async () => {
    const a = animais[0]!.animalId;
    const r = await amb.ok('estoque:registrar', {
      itemId: item,
      requisicaoId: gerarUuidV7(),
      dados: {
        data,
        tipo: 'saida_consumo',
        quantidade: 2,
        unidadeBase: 'ml',
        destino: 'animal',
        animalId: a,
      },
    });
    expect(r).toMatchObject({ animalId: a, destino: 'animal', custoApropriadoCentavos: 40 });
    expect(
      (await amb.chamar('animal:excluir', { id: a, motivo: 'Cadastro com consumo vinculado' })).ok,
    ).toBe(false);
    expect((await amb.ok('animal:obter', { id: a })).id).toBe(a);
  });
  it('reconciliação mantém custo anterior à compra posterior na mesma data', async () => {
    const r = await amb.ok('manejoSanitario:registrar', pedido([consumo()]));
    await amb.ok('estoque:registrar', {
      itemId: item,
      requisicaoId: gerarUuidV7(),
      dados: {
        data,
        tipo: 'entrada_compra',
        quantidade: 100,
        unidadeBase: 'ml',
        custoEntradaCentavos: 10000,
      },
    });
    const atualizado = await amb.ok('manejoSanitario:atualizar', {
      id: r.id,
      dados: manejo(),
      motivo: 'Conferência física',
      consumosEstoque: [consumo(8)],
    });
    expect(atualizado.consumosEstoque?.[0]?.custoApropriadoCentavos).toBe(160);
    expect((await amb.ok('estoque:obter', { id: item })).item).toMatchObject({
      saldo: 192,
      valorSaldoCentavos: 11840,
    });
  });
});
