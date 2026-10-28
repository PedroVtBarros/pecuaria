import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { DadosLancamento, DadosMovimentoEstoque } from '@pecuaria/shared-types';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  DATA_DO_RELOGIO,
  categoriaPorNome,
  conferirCaixa,
  conferirInvariantes,
  contar,
  criarLancamento,
  criarPropriedade,
  dadosDeLancamento,
} from './apoio-teste';
import { comprar, criarLote, dadosDeCompra } from './apoio-animais';
import { conferirInsumos } from './apoio-insumos';
import { conferirApropriacaoDoBanco } from './apoio-rateio';
import { conferirProducao } from './apoio-producao';

/**
 * Entrega 4F: produção própria. Custos vinculados ao centro não são de lote nem de animal; ao
 * encerrar viram o custo de entrada do item produzido, que chega aos animais pelo consumo. Valores
 * calculados à mão; conservação conferida por SQL independente depois de cada teste.
 */
let amb: AmbienteIpc;
let prop: string;
let loteA: string;
let categoria: string;
let adubo: string;
let silagem: string;
const animal: Record<string, string> = {};
const erro = (r: { ok: boolean; erro?: { mensagem: string; detalhes?: string[] } }) => {
  expect(r.ok).toBe(false);
  return [r.erro?.mensagem, ...(r.erro?.detalhes ?? [])].join(' | ');
};

const dados = (
  tipo: DadosMovimentoEstoque['tipo'],
  quantidade: number,
  extra: Partial<DadosMovimentoEstoque> = {},
): DadosMovimentoEstoque => ({
  data: '2026-09-01',
  tipo,
  quantidade,
  unidadeBase: 'kg',
  loteEstoqueId: null,
  custoEntradaCentavos: null,
  destino: tipo.startsWith('entrada') ? null : 'propriedade',
  loteAnimalId: null,
  animalId: null,
  documentoOrigemId: null,
  motivo: null,
  observacao: null,
  ...extra,
});
const mover = (itemId: string, d: DadosMovimentoEstoque) =>
  amb.ok('estoque:registrar', { itemId, requisicaoId: gerarUuidV7(), dados: d });
async function criarItem(nome: string, tipo: string) {
  return (
    await amb.ok('estoque:criarItem', {
      propriedadeId: prop,
      dados: {
        nome,
        tipo,
        unidadeBase: 'kg',
        controleLote: false,
        estoqueMinimo: null,
        produtoSanitarioId: null,
        ativo: true,
        observacoes: null,
      } as never,
    })
  ).id;
}
const despesa = (
  valor: number,
  descricao: string,
  destino: DadosLancamento['destino'] = { tipo: 'propriedade' },
) =>
  criarLancamento(
    amb,
    dadosDeLancamento(prop, categoria, {
      valorTotalCentavos: valor,
      descricao,
      destino,
      dataCompetencia: '2026-09-10',
    }),
  );
const criarCentro = (nome = 'Capineira 1', item = silagem, requisicaoId = gerarUuidV7()) =>
  amb.ok('producao:criar', {
    requisicaoId,
    propriedadeId: prop,
    dados: {
      nome,
      tipo: 'volumoso',
      areaId: null,
      dataInicio: '2026-09-01',
      estoqueItemId: item,
      observacoes: null,
    },
  });
const encerrar = (id: string, quantidade: number, requisicaoId = gerarUuidV7()) =>
  amb.chamar('producao:encerrar', {
    id,
    requisicaoId,
    dataFim: '2026-09-30',
    quantidade,
    loteEstoqueId: null,
    observacao: null,
  });
const resumo = () => amb.ok('custo:resumo', { propriedadeId: prop });
const saldoDe = async (id: string) => (await amb.ok('estoque:obter', { id })).item;

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda da capineira')).id;
  loteA = (await criarLote(amb, prop, 'Lote A')).id;
  categoria = (await categoriaPorNome(amb, 'Alimentação (despesa direta, sem estoque)')).id;
  const c = await comprar(
    amb,
    dadosDeCompra(prop, [{ identificacao: 'a1' }, { identificacao: 'a2' }], {
      loteId: loteA,
      valorTotalCentavos: 60000,
    }),
  );
  for (const i of c.itens) animal[i.animalIdentificacao] = i.animalId;
  adubo = await criarItem('Adubo', 'outro');
  silagem = await criarItem('Silagem de capim', 'silagem');
  // 1.000 kg de adubo por R$ 1.000,00: R$ 1,00 por kg.
  await mover(adubo, dados('entrada_compra', 1000, { custoEntradaCentavos: 100000 }));
});
afterEach(async () => {
  expect(conferirInvariantes(amb)).toEqual([]);
  expect(conferirInsumos(amb)).toEqual([]);
  expect(conferirProducao(amb)).toEqual([]);
  expect(await conferirApropriacaoDoBanco(amb)).toEqual([]);
  expect(await conferirCaixa(amb)).toEqual([]);
  amb.encerrar();
});

describe('centro de produção: ciclo completo', () => {
  it('custos vinculados saem do "não alocado", viram a entrada do volumoso e chegam aos animais pelo consumo', async () => {
    const diesel = await despesa(30000, 'Diesel do plantio');
    const maoDeObra = await despesa(20000, 'Mão de obra');
    const consumoAdubo = await mover(adubo, dados('saida_consumo', 200, { data: '2026-09-05' }));
    expect(consumoAdubo.custoApropriadoCentavos).toBe(20000);
    expect((await resumo()).naoAlocado.apuracao.valorConhecidoCentavos).toBe(70000);

    const centro = await criarCentro();
    for (const [tipo, origemId] of [
      ['lancamento', diesel.id],
      ['lancamento', maoDeObra.id],
      ['consumo', consumoAdubo.id],
    ] as const)
      await amb.ok('producao:vincular', { id: centro.id, tipo, origemId });
    const aberto = await amb.ok('producao:obter', { id: centro.id });
    expect(aberto.custo).toMatchObject({
      conhecidoCentavos: 70000,
      completo: true,
      podeEncerrar: true,
      custoDaEntradaCentavos: 70000,
    });
    // Um dono só: no centro, o custo não é "não alocado" nem pode ser rateado.
    let r = await resumo();
    expect(r.naoAlocado.apuracao.valorConhecidoCentavos).toBe(0);
    expect(r.emProducao.valorConhecidoCentavos).toBe(70000);
    expect(r.animais.apuracao.valorConhecidoCentavos).toBe(60000);
    expect((await amb.ok('rateio:pendentes', { propriedadeId: prop })).itens).toEqual([]);

    // Encerrar com 10.000 kg colhidos: a entrada de produção leva R$ 700,00.
    const encerrado = await amb.ok('producao:encerrar', {
      id: centro.id,
      requisicaoId: gerarUuidV7(),
      dataFim: '2026-09-30',
      quantidade: 10000,
      loteEstoqueId: null,
      observacao: null,
    });
    expect(encerrado).toMatchObject({ status: 'encerrado', dataFim: '2026-09-30' });
    expect(encerrado.encerramento).toMatchObject({
      quantidade: 10000,
      custoConhecidoCentavos: 70000,
      componentesDesconhecidos: 0,
      custoTotalCentavos: 70000,
    });
    expect(await saldoDe(silagem)).toMatchObject({
      saldo: 10000,
      valorSaldoCentavos: 70000,
      valoracaoCompleta: true,
    });
    const entrada = (await amb.ok('estoque:obter', { id: silagem })).movimentos.find(
      (m) => m.tipo === 'entrada_producao',
    )!;
    expect(entrada.documentoOrigemId).toBe(centro.id);
    r = await resumo();
    expect(r.emProducao.valorConhecidoCentavos).toBe(0);
    // Ninguém conta o custo do centro como custo de animal antes do consumo.
    expect(r.animais.apuracao.valorConhecidoCentavos).toBe(60000);

    // 1.000 kg de silagem no lote A: R$ 70,00, R$ 35,00 para cada animal.
    const trato = await mover(
      silagem,
      dados('saida_consumo', 1000, { data: '2026-10-05', destino: 'lote', loteAnimalId: loteA }),
    );
    expect(trato.custoApropriadoCentavos).toBe(7000);
    r = await resumo();
    expect(r.animais.apuracao.valorConhecidoCentavos).toBe(60000 + 7000);
    for (const nome of ['a1', 'a2'])
      expect(
        (await amb.ok('custo:animal', { animalId: animal[nome]! })).apuracao.valorConhecidoCentavos,
      ).toBe(30000 + 3500);
  });

  it('centro encerrado protege seus custos e a entrada; reabrir exige que o produto não tenha sido consumido', async () => {
    const diesel = await despesa(30000, 'Diesel');
    const consumoAdubo = await mover(adubo, dados('saida_consumo', 200, { data: '2026-09-05' }));
    const centro = await criarCentro();
    await amb.ok('producao:vincular', { id: centro.id, tipo: 'lancamento', origemId: diesel.id });
    await amb.ok('producao:vincular', {
      id: centro.id,
      tipo: 'consumo',
      origemId: consumoAdubo.id,
    });
    expect((await encerrar(centro.id, 10000)).ok).toBe(true);
    const entrada = (await amb.ok('estoque:obter', { id: silagem })).movimentos.find(
      (m) => m.tipo === 'entrada_producao',
    )!;

    expect(erro(await amb.chamar('lancamento:cancelar', { id: diesel.id, motivo: 'x' }))).toMatch(
      /centro de produção "Capineira 1", que está encerrado/,
    );
    expect(
      erro(await amb.chamar('estoque:cancelar', { id: consumoAdubo.id, motivo: 'x' })),
    ).toMatch(/centro de produção "Capineira 1", que está encerrado/);
    expect(erro(await amb.chamar('estoque:cancelar', { id: entrada.id, motivo: 'x' }))).toMatch(
      /gerada pelo centro de produção/,
    );
    const outra = await despesa(1000, 'Outra');
    expect(
      erro(
        await amb.chamar('producao:vincular', {
          id: centro.id,
          tipo: 'lancamento',
          origemId: outra.id,
        }),
      ),
    ).toMatch(/encerrado/);

    // Parte da silagem já foi consumida: cancelar a entrada deixaria o saldo negativo.
    const trato = await mover(silagem, dados('saida_consumo', 1000, { data: '2026-10-05' }));
    expect(
      erro(await amb.chamar('producao:reabrir', { id: centro.id, motivo: 'Revisar' })),
    ).toMatch(/negativ/i);
    expect((await amb.ok('producao:obter', { id: centro.id })).status).toBe('encerrado');
    expect(await saldoDe(silagem)).toMatchObject({ saldo: 9000 });

    await amb.ok('estoque:cancelar', { id: trato.id, motivo: 'Lançado antes da hora' });
    const reaberto = await amb.ok('producao:reabrir', {
      id: centro.id,
      motivo: 'Faltou o adubo de cobertura',
    });
    expect(reaberto).toMatchObject({ status: 'aberto', dataFim: null, encerramento: null });
    expect(await saldoDe(silagem)).toMatchObject({ saldo: 0 });

    // Com o centro aberto, a correção do consumo acompanha o vínculo e o custo é refeito.
    await amb.ok('estoque:corrigir', {
      id: consumoAdubo.id,
      requisicaoId: gerarUuidV7(),
      dados: dados('saida_consumo', 300, { data: '2026-09-05' }),
      motivo: 'Foram 300 kg',
    });
    const corrigido = await amb.ok('producao:obter', { id: centro.id });
    expect(corrigido.consumos.map((c) => c.custoCentavos)).toEqual([30000]);
    expect(corrigido.custo.conhecidoCentavos).toBe(60000);
    const reencerrado = await encerrar(centro.id, 8000);
    expect(reencerrado.ok).toBe(true);
    expect(await saldoDe(silagem)).toMatchObject({ saldo: 8000, valorSaldoCentavos: 60000 });
    expect(
      contar(amb, 'historico_alteracao', "entidade = 'centro_producao' AND acao = 'reabertura'"),
    ).toBe(1);
  });
});

describe('custo desconhecido e ausência de custo', () => {
  it('consumo de custo desconhecido deixa a entrada com custo desconhecido, nunca zero, até ser apurado', async () => {
    const semente = await criarItem('Semente', 'outro');
    const entradaSemente = await mover(semente, dados('entrada_producao', 100));
    const consumo = await mover(semente, dados('saida_consumo', 10, { data: '2026-09-06' }));
    expect(consumo.custoApropriadoCentavos).toBeNull();
    const diesel = await despesa(10000, 'Diesel');
    const centro = await criarCentro();
    await amb.ok('producao:vincular', { id: centro.id, tipo: 'consumo', origemId: consumo.id });
    await amb.ok('producao:vincular', { id: centro.id, tipo: 'lancamento', origemId: diesel.id });
    const aberto = await amb.ok('producao:obter', { id: centro.id });
    expect(aberto.custo).toMatchObject({
      conhecidoCentavos: 10000,
      desconhecidos: 1,
      completo: false,
      custoDaEntradaCentavos: null,
    });
    expect(aberto.custo.apuracao.estado).toBe('parcial');
    expect((await resumo()).emProducao.estado).toBe('parcial');

    const r = await encerrar(centro.id, 5000);
    expect(r.ok).toBe(true);
    const encerrado = await amb.ok('producao:obter', { id: centro.id });
    expect(encerrado.encerramento).toMatchObject({
      custoConhecidoCentavos: 10000,
      componentesDesconhecidos: 1,
      custoTotalCentavos: null,
    });
    expect(await saldoDe(silagem)).toMatchObject({ saldo: 5000, valoracaoCompleta: false });

    // O custo da semente é apurado: reabrir, corrigir o estoque e reencerrar fecham o valor.
    await amb.ok('producao:reabrir', { id: centro.id, motivo: 'Custo da semente apurado' });
    await amb.ok('estoque:corrigir', {
      id: entradaSemente.id,
      requisicaoId: gerarUuidV7(),
      dados: dados('entrada_producao', 100, { custoEntradaCentavos: 1000 }),
      motivo: 'Custo apurado',
    });
    expect((await encerrar(centro.id, 5000)).ok).toBe(true);
    // 10 kg de semente a R$ 0,10 = R$ 1,00, mais R$ 100,00 de diesel.
    expect(
      (await amb.ok('producao:obter', { id: centro.id })).encerramento?.custoTotalCentavos,
    ).toBe(10100);
    expect(await saldoDe(silagem)).toMatchObject({
      valorSaldoCentavos: 10100,
      valoracaoCompleta: true,
    });
  });

  it('sem nenhum custo vinculado não encerra; centro com custos não é cancelado sem desvincular', async () => {
    const centro = await criarCentro();
    expect(erro(await encerrar(centro.id, 100))).toMatch(/Vincule ao menos uma despesa/);
    expect(contar(amb, 'movimentacao_estoque', "tipo = 'entrada_producao'")).toBe(0);
    const diesel = await despesa(1000, 'Diesel');
    await amb.ok('producao:vincular', { id: centro.id, tipo: 'lancamento', origemId: diesel.id });
    expect(erro(await amb.chamar('producao:cancelar', { id: centro.id, motivo: 'x' }))).toMatch(
      /Desvincule-os/,
    );
    await amb.ok('producao:desvincular', {
      id: centro.id,
      tipo: 'lancamento',
      origemId: diesel.id,
    });
    expect((await resumo()).naoAlocado.apuracao.valorConhecidoCentavos).toBe(1000);
    const cancelado = await amb.ok('producao:cancelar', { id: centro.id, motivo: 'Não plantou' });
    expect(cancelado.cancelado).toBe(true);
    expect((await amb.ok('producao:listar', { propriedadeId: prop })).length).toBe(0);
    // Cancelado, o nome fica livre para um centro novo.
    await criarCentro();
  });
});

describe('o que pode entrar no centro', () => {
  it('recusa despesa já lançada a lote, consumo do próprio produto, custo rateado e custo já em outro centro', async () => {
    const centro = await criarCentro();
    const aLote = await despesa(1000, 'Ração no cocho', { tipo: 'lote', loteId: loteA });
    expect(
      erro(
        await amb.chamar('producao:vincular', {
          id: centro.id,
          tipo: 'lancamento',
          origemId: aLote.id,
        }),
      ),
    ).toMatch(/lote ou animal/);

    await mover(silagem, dados('entrada_compra', 100, { custoEntradaCentavos: 1000 }));
    const doProduto = await mover(silagem, dados('saida_consumo', 10, { data: '2026-09-05' }));
    expect(
      erro(
        await amb.chamar('producao:vincular', {
          id: centro.id,
          tipo: 'consumo',
          origemId: doProduto.id,
        }),
      ),
    ).toMatch(/item produzido não pode ser insumo/);

    const rateada = await despesa(3000, 'Energia');
    await amb.ok('rateio:criar', {
      requisicaoId: gerarUuidV7(),
      propriedadeId: prop,
      origemTipo: 'lancamento',
      origemId: rateada.id,
      criterio: 'cabecas',
      dataBase: '2026-10-10',
      periodoInicio: null,
      periodoFim: null,
      idadeMaximaPesagemDias: null,
      manual: [],
      motivo: 'Rateio',
    });
    expect(
      erro(
        await amb.chamar('producao:vincular', {
          id: centro.id,
          tipo: 'lancamento',
          origemId: rateada.id,
        }),
      ),
    ).toMatch(/rateio ativo/);

    const diesel = await despesa(1000, 'Diesel');
    await amb.ok('producao:vincular', { id: centro.id, tipo: 'lancamento', origemId: diesel.id });
    const outro = await criarCentro('Capineira 2');
    expect(
      erro(
        await amb.chamar('producao:vincular', {
          id: outro.id,
          tipo: 'lancamento',
          origemId: diesel.id,
        }),
      ),
    ).toMatch(/já está no centro "Capineira 1"/);
    // E o custo do centro não pode ser rateado.
    expect(
      erro(
        await amb.chamar('rateio:criar', {
          requisicaoId: gerarUuidV7(),
          propriedadeId: prop,
          origemTipo: 'lancamento',
          origemId: diesel.id,
          criterio: 'cabecas',
          dataBase: '2026-10-10',
          periodoInicio: null,
          periodoFim: null,
          idadeMaximaPesagemDias: null,
          manual: [],
          motivo: 'x',
        }),
      ),
    ).toMatch(/centro de produção "Capineira 1"/);
    const candidatos = await amb.ok('producao:candidatos', { id: outro.id });
    expect(candidatos.despesas.map((d) => d.id)).not.toContain(diesel.id);
    expect(candidatos.despesas.map((d) => d.id)).not.toContain(rateada.id);
    expect(candidatos.consumos.map((c) => c.movimentacaoId)).not.toContain(doProduto.id);
  });

  it('cancelar a despesa ou o consumo vinculado ao centro aberto tira o custo do centro; mudar o destino exige desvincular', async () => {
    const centro = await criarCentro();
    const diesel = await despesa(1000, 'Diesel');
    const consumo = await mover(adubo, dados('saida_consumo', 50, { data: '2026-09-05' }));
    await amb.ok('producao:vincular', { id: centro.id, tipo: 'lancamento', origemId: diesel.id });
    await amb.ok('producao:vincular', { id: centro.id, tipo: 'consumo', origemId: consumo.id });
    expect(
      erro(
        await amb.chamar('estoque:corrigir', {
          id: consumo.id,
          requisicaoId: gerarUuidV7(),
          dados: dados('saida_consumo', 50, {
            data: '2026-09-05',
            destino: 'lote',
            loteAnimalId: loteA,
          }),
          motivo: 'x',
        }),
      ),
    ).toMatch(/Desvincule-o do centro/);
    await amb.ok('lancamento:cancelar', { id: diesel.id, motivo: 'Duplicado' });
    await amb.ok('estoque:cancelar', { id: consumo.id, motivo: 'Lançado errado' });
    const depois = await amb.ok('producao:obter', { id: centro.id });
    expect(depois.despesas).toEqual([]);
    expect(depois.consumos).toEqual([]);
    expect(depois.custo.podeEncerrar).toBe(false);
  });
});

describe('cadastro, idempotência e telas de consumo', () => {
  it('é idempotente na criação e no encerramento, recusa nome repetido e data futura', async () => {
    const req = gerarUuidV7();
    const a = await criarCentro('Capineira 1', silagem, req);
    const b = await criarCentro('Capineira 1', silagem, req);
    expect(b.id).toBe(a.id);
    expect(contar(amb, 'centro_producao')).toBe(1);
    expect(
      erro(
        await amb.chamar('producao:criar', {
          requisicaoId: gerarUuidV7(),
          propriedadeId: prop,
          dados: {
            nome: 'capineira 1',
            tipo: 'volumoso',
            areaId: null,
            dataInicio: '2026-09-01',
            estoqueItemId: silagem,
            observacoes: null,
          },
        }),
      ),
    ).toMatch(/Já existe um centro/);
    expect(
      erro(
        await amb.chamar('producao:criar', {
          requisicaoId: gerarUuidV7(),
          propriedadeId: prop,
          dados: {
            nome: 'Futuro',
            tipo: 'volumoso',
            areaId: null,
            dataInicio: '2026-12-01',
            estoqueItemId: silagem,
            observacoes: null,
          },
        }),
      ),
    ).toMatch(/futura/);

    const diesel = await despesa(1000, 'Diesel');
    await amb.ok('producao:vincular', { id: a.id, tipo: 'lancamento', origemId: diesel.id });
    const reqEncerrar = gerarUuidV7();
    expect((await encerrar(a.id, 100, reqEncerrar)).ok).toBe(true);
    expect((await encerrar(a.id, 100, reqEncerrar)).ok).toBe(true);
    expect(contar(amb, 'movimentacao_estoque', "tipo = 'entrada_producao'")).toBe(1);
    expect(erro(await encerrar(a.id, 100))).toMatch(/já está encerrado/);
  });

  it('consumo vinculado aparece como "Centro de produção", fora do não alocado da tela de consumo', async () => {
    const centro = await criarCentro();
    const consumo = await mover(adubo, dados('saida_consumo', 50, { data: '2026-09-05' }));
    await mover(adubo, dados('saida_consumo', 20, { data: '2026-09-06' }));
    await amb.ok('producao:vincular', { id: centro.id, tipo: 'consumo', origemId: consumo.id });
    const lista = await amb.ok('consumo:listar', {
      propriedadeId: prop,
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(lista.itens.find((c) => c.movimentacaoId === consumo.id)?.destinoDescricao).toBe(
      'Centro de produção Capineira 1',
    );
    const r = await amb.ok('consumo:resumo', { propriedadeId: prop });
    expect(r.naoAlocado.valorConhecidoCentavos).toBe(2000);
    expect(
      r.porDestino.find((d) => d.chave === 'centro_producao')?.apuracao.valorConhecidoCentavos,
    ).toBe(5000);
    expect(r.total.valorConhecidoCentavos).toBe(7000);
  });
});
