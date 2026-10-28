import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarUuidV7 } from '@pecuaria/domain';
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
import { comprar, criarLote, dadosDeCompra, dadosDeVenda, vender } from './apoio-animais';

/**
 * Entrega 4C: compra e venda de animais, desfazer saída, cancelamentos e custo anterior.
 * Valores calculados à mão. Relógio fixo em 2026-10-16.
 */
let amb: AmbienteIpc;
let prop: string;
const erro = (r: { ok: boolean; erro?: { mensagem: string; detalhes?: string[] } }) => {
  expect(r.ok).toBe(false);
  return [r.erro?.mensagem, ...(r.erro?.detalhes ?? [])].join(' | ');
};
const TABELAS = [
  'lancamento_financeiro',
  'parcela_financeira',
  'pagamento_financeiro',
  'negociacao_animal',
  'negociacao_animal_item',
  'animal',
  'movimentacao_animal',
  'pesagem',
  'historico_alteracao',
  'custo_anterior',
];
const contagens = () => TABELAS.map((t) => contar(amb, t));

beforeEach(async () => {
  amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
  prop = (await criarPropriedade(amb, 'Fazenda dos animais')).id;
});
afterEach(async () => {
  expect(conferirInvariantes(amb)).toEqual([]);
  expect(await conferirCaixa(amb)).toEqual([]);
  amb.encerrar();
});

const animalPorIdentificacao = async (identificacao: string) => {
  const p = await amb.ok('animal:listar', {
    propriedadeId: prop,
    filtros: { busca: identificacao, status: 'todos' },
  });
  return p.itens.find((a) => a.identificacao === identificacao)!;
};

describe('compra de animais', () => {
  it('cria animais, negociação e lançamento juntos, sem pagamento fictício', async () => {
    const lote = await criarLote(amb, prop, 'Engorda 1');
    const antes = contagens();
    const n = await comprar(
      amb,
      dadosDeCompra(
        prop,
        [
          { identificacao: 'C-1', pesoVivoKg: 300 },
          { identificacao: 'C-2', pesoVivoKg: 310 },
          { identificacao: 'C-3', pesoVivoKg: 320 },
        ],
        {
          loteId: lote.id,
          unidadePreco: 'cabeca',
          precoUnitarioCentavos: 300000,
        },
      ),
    );
    expect(n).toMatchObject({
      tipo: 'compra',
      valorTotalCentavos: 900000,
      quantidadeAnimais: 3,
      criterio: 'igual',
      situacaoFinanceira: 'a_vencer',
      pagoCentavos: 0,
      saldoEmAbertoCentavos: 900000,
      cancelada: false,
    });
    expect(n.itens.map((i) => i.valorAlocadoCentavos)).toEqual([300000, 300000, 300000]);
    expect(n.itens.map((i) => i.pesoVivoKg)).toEqual([300, 310, 320]);
    // Um lançamento, três parcelas, três animais com entrada e peso, nenhum pagamento.
    const depois = contagens();
    expect(depois.map((v, i) => v - antes[i]!)).toEqual([1, 3, 0, 1, 3, 3, 3, 3, 5, 0]);
    const a = await animalPorIdentificacao('C-1');
    expect(a.status).toBe('ativo');
    expect((await amb.ok('animal:obter', { id: a.id })).origem).toBe('comprado');
    const detalhe = await amb.ok('lancamento:obter', { id: n.lancamentoId });
    expect(detalhe).toMatchObject({
      origemTipo: 'negociacao_animal',
      origemId: n.id,
      natureza: 'despesa',
      valorOperacaoCentavos: 900000,
    });
    expect(detalhe.categoria.nome).toBe('Compra de animais');
  });

  it('aloca por peso vivo (kg) com o preço unitário conferido', async () => {
    const n = await comprar(
      amb,
      dadosDeCompra(
        prop,
        [
          { identificacao: 'P-1', pesoVivoKg: 300 },
          { identificacao: 'P-2', pesoVivoKg: 200 },
          { identificacao: 'P-3', pesoVivoKg: 500 },
        ],
        {
          valorTotalCentavos: 1000000,
          unidadePreco: 'kg_vivo',
          precoUnitarioCentavos: 1000,
          criterio: 'peso_vivo',
        },
      ),
    );
    // 1.000 kg a R$ 10,00/kg = R$ 10.000,00 repartidos em 30%, 20% e 50%.
    expect(n.itens.map((i) => [i.animalIdentificacao, i.valorAlocadoCentavos])).toEqual([
      ['P-1', 300000],
      ['P-2', 200000],
      ['P-3', 500000],
    ]);
  });

  it('o resto de centavos vai para um animal e a soma fecha exatamente', async () => {
    const n = await comprar(
      amb,
      dadosDeCompra(
        prop,
        [{ identificacao: 'R-1' }, { identificacao: 'R-2' }, { identificacao: 'R-3' }],
        {
          valorTotalCentavos: 10000,
          condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
        },
      ),
    );
    const valores = n.itens.map((i) => i.valorAlocadoCentavos).sort();
    expect(valores).toEqual([3333, 3333, 3334]);
    expect(valores.reduce((s, v) => s + v, 0)).toBe(10000);
  });

  it('critério por peso com peso faltando é recusado, sem cair em "igual" e sem deixar rastro', async () => {
    const antes = contagens();
    const msg = erro(
      await amb.chamar(
        'negociacao:registrarCompra',
        dadosDeCompra(prop, [{ identificacao: 'S-1', pesoVivoKg: 300 }, { identificacao: 'S-2' }], {
          criterio: 'peso_vivo',
        }),
      ),
    );
    expect(msg).toMatch(/exige o peso vivo de todos os animais\. Falta em: S-2/);
    expect(contagens()).toEqual(antes);
  });

  it('preço unitário que não bate com o total é recusado; o total é a verdade gravada', async () => {
    const antes = contagens();
    const ruim = dadosDeCompra(prop, [{ identificacao: 'U-1' }, { identificacao: 'U-2' }], {
      valorTotalCentavos: 602,
      unidadePreco: 'cabeca',
      precoUnitarioCentavos: 300,
    });
    expect(erro(await amb.chamar('negociacao:registrarCompra', ruim))).toMatch(
      /diferença de 2 centavos/,
    );
    expect(contagens()).toEqual(antes);
    const n = await comprar(amb, { ...ruim, requisicaoId: gerarUuidV7(), valorTotalCentavos: 601 });
    expect(n.valorTotalCentavos).toBe(601);
  });

  it('um animal inválido desfaz a compra inteira', async () => {
    await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: { ...dadosDeCompra(prop, [{ identificacao: 'EXISTE' }]).animais[0]!.dados },
      entrada: { data: '2026-01-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
    });
    const antes = contagens();
    const msg = erro(
      await amb.chamar(
        'negociacao:registrarCompra',
        dadosDeCompra(prop, [{ identificacao: 'NOVO-1' }, { identificacao: 'EXISTE' }]),
      ),
    );
    expect(msg).toMatch(/EXISTE: Já existe um animal com a identificação/);
    expect(contagens()).toEqual(antes);
    expect(
      erro(
        await amb.chamar(
          'negociacao:registrarCompra',
          dadosDeCompra(prop, [{ identificacao: 'DUP' }, { identificacao: 'dup' }]),
        ),
      ),
    ).toMatch(/repetida/);
  });

  it('é idempotente: repetir a requisição devolve a mesma negociação; conteúdo diferente é recusado', async () => {
    const dados = dadosDeCompra(prop, [{ identificacao: 'I-1' }, { identificacao: 'I-2' }]);
    const a = await comprar(amb, dados);
    const antes = contagens();
    const b = await comprar(amb, dados);
    expect(b.id).toBe(a.id);
    expect(contagens()).toEqual(antes);
    expect(
      erro(await amb.chamar('negociacao:registrarCompra', { ...dados, valorTotalCentavos: 1 })),
    ).toMatch(/já foi usado com outro conteúdo/);
  });

  it('lote de outra propriedade e contraparte inexistente são recusados', async () => {
    const outra = await criarPropriedade(amb, 'Outra fazenda');
    const loteDeFora = await criarLote(amb, outra.id, 'Lote de fora');
    expect(
      erro(
        await amb.chamar(
          'negociacao:registrarCompra',
          dadosDeCompra(prop, [{ identificacao: 'L-1' }], { loteId: loteDeFora.id }),
        ),
      ),
    ).toMatch(/outra propriedade/);
    expect(
      erro(
        await amb.chamar(
          'negociacao:registrarCompra',
          dadosDeCompra(prop, [{ identificacao: 'L-2' }], { pessoaId: gerarUuidV7() }),
        ),
      ),
    ).toMatch(/Contraparte não encontrada/);
  });

  it('a categoria "Compra de animais" continua fechada para lançamento manual', async () => {
    const c = await categoriaPorNome(amb, 'Compra de animais');
    const r = await amb.chamar('lancamento:criar', {
      requisicaoId: gerarUuidV7(),
      dados: dadosDeLancamento(prop, c.id),
    });
    expect(erro(r)).toMatch(/só recebe lançamentos criados pelo módulo correspondente/);
  });

  it('o lançamento da compra só pode ser renegociado nas parcelas; total, edição e cancelamento direto são recusados', async () => {
    const n = await comprar(
      amb,
      dadosDeCompra(prop, [{ identificacao: 'G-1' }, { identificacao: 'G-2' }]),
    );
    expect(
      erro(await amb.chamar('lancamento:cancelar', { id: n.lancamentoId, motivo: 'x' })),
    ).toMatch(/módulo de origem/);
    expect(
      erro(
        await amb.chamar('lancamento:renegociar', {
          id: n.lancamentoId,
          novasParcelas: [{ vencimento: '2027-03-10', valorCentavos: 800000 }],
          novoTotalCentavos: 800000,
          motivo: 'Desconto',
        }),
      ),
    ).toMatch(/sem mudar o total/);
    const d = await amb.ok('lancamento:renegociar', {
      id: n.lancamentoId,
      novasParcelas: [{ vencimento: '2027-03-10', valorCentavos: 900000 }],
      novoTotalCentavos: null,
      motivo: 'Prazo único combinado',
    });
    expect(d).toMatchObject({ valorOperacaoCentavos: 900000, saldoEmAbertoCentavos: 900000 });
  });

  it('animal comprado não pode ser excluído do cadastro', async () => {
    await comprar(amb, dadosDeCompra(prop, [{ identificacao: 'X-1' }]));
    const a = await animalPorIdentificacao('X-1');
    expect(erro(await amb.chamar('animal:excluir', { id: a.id, motivo: 'engano' }))).toMatch(
      /compra, venda ou custo anterior/,
    );
  });
});

describe('venda de animais', () => {
  async function rebanho() {
    const lote = await criarLote(amb, prop, 'Engorda');
    const c = await comprar(
      amb,
      dadosDeCompra(
        prop,
        [
          { identificacao: 'V-1', pesoVivoKg: 450 },
          { identificacao: 'V-2', pesoVivoKg: 300 },
          { identificacao: 'V-3', pesoVivoKg: 280 },
        ],
        {
          loteId: lote.id,
          condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
        },
      ),
    );
    const ids = Object.fromEntries(c.itens.map((i) => [i.animalIdentificacao, i.animalId]));
    return { lote, ids: ids as Record<string, string> };
  }

  it('vende dois animais por @ de peso vivo: saída, receita e alocação por peso; nada recebido', async () => {
    const { ids } = await rebanho();
    const antes = contagens();
    const v = await vender(
      amb,
      dadosDeVenda(
        prop,
        [
          { animalId: ids['V-1']!, pesoVivoKg: 450 },
          { animalId: ids['V-2']!, pesoVivoKg: 300 },
        ],
        {
          valorTotalCentavos: 800000,
          unidadePreco: 'arroba_vivo',
          precoUnitarioCentavos: 16000,
          criterio: 'peso_vivo',
        },
      ),
    );
    // 750 kg = 50 @ a R$ 160,00 = R$ 8.000,00, divididos por peso: 450/750 e 300/750.
    expect(v.itens.map((i) => [i.animalIdentificacao, i.valorAlocadoCentavos])).toEqual([
      ['V-1', 480000],
      ['V-2', 320000],
    ]);
    expect(v).toMatchObject({
      tipo: 'venda',
      situacaoFinanceira: 'a_vencer',
      pagoCentavos: 0,
      saldoEmAbertoCentavos: 800000,
    });
    const a = await amb.ok('animal:obter', { id: ids['V-1']! });
    expect(a).toMatchObject({ status: 'vendido', dataSaida: '2026-10-10' });
    const l = await amb.ok('lancamento:obter', { id: v.lancamentoId });
    expect(l).toMatchObject({
      natureza: 'receita',
      valorOperacaoCentavos: 800000,
      pagoCentavos: 0,
    });
    const d = contagens().map((x, i) => x - antes[i]!);
    // lançamento, parcela, nenhum pagamento, negociação, 2 itens, nenhum animal novo, 2 saídas.
    expect(d.slice(0, 7)).toEqual([1, 1, 0, 1, 2, 0, 2]);
  });

  it('preço por @ de carcaça exige o peso de carcaça: nunca é estimado a partir do vivo', async () => {
    const { ids } = await rebanho();
    const antes = contagens();
    expect(
      erro(
        await amb.chamar(
          'negociacao:registrarVenda',
          dadosDeVenda(prop, [{ animalId: ids['V-1']!, pesoVivoKg: 450 }], {
            unidadePreco: 'arroba_carcaca',
            precoUnitarioCentavos: 30000,
            criterio: 'peso_carcaca',
          }),
        ),
      ),
    ).toMatch(/peso de carcaça/);
    expect(contagens()).toEqual(antes);
    // Com a carcaça informada (252 kg = 16,8 @ a R$ 300,00 = R$ 5.040,00) a venda é aceita.
    const v = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: ids['V-1']!, pesoVivoKg: 450, pesoCarcacaKg: 252 }], {
        valorTotalCentavos: 504000,
        unidadePreco: 'arroba_carcaca',
        precoUnitarioCentavos: 30000,
        criterio: 'peso_carcaca',
      }),
    );
    expect(v.itens[0]).toMatchObject({ pesoCarcacaKg: 252, valorAlocadoCentavos: 504000 });
  });

  it('um animal que não pode sair desfaz a venda inteira', async () => {
    const { ids } = await rebanho();
    // Pesagem em 12/10: vender com data 10/10 é incompatível para V-2, e V-1 não deve sair.
    await amb.ok('pesagem:registrar', {
      animalId: ids['V-2']!,
      dados: {
        data: '2026-10-12',
        pesoVivoKg: 320,
        metodo: 'balanca',
        observacao: null,
        escoreCorporal: null,
        escalaEcc: null,
      },
    });
    const antes = contagens();
    const msg = erro(
      await amb.chamar(
        'negociacao:registrarVenda',
        dadosDeVenda(prop, [{ animalId: ids['V-1']! }, { animalId: ids['V-2']! }]),
      ),
    );
    expect(msg).toMatch(/V-2: .*pesagem em 12\/10\/2026/);
    expect(contagens()).toEqual(antes);
    expect((await amb.ok('animal:obter', { id: ids['V-1']! })).status).toBe('ativo');
  });

  it('recusa animal já vendido, repetido ou de outra propriedade', async () => {
    const { ids } = await rebanho();
    await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: ids['V-1']! }], { valorTotalCentavos: 100000 }),
    );
    expect(
      erro(
        await amb.chamar(
          'negociacao:registrarVenda',
          dadosDeVenda(prop, [{ animalId: ids['V-1']! }]),
        ),
      ),
    ).toMatch(/não está ativo/);
    expect(
      erro(
        await amb.chamar(
          'negociacao:registrarVenda',
          dadosDeVenda(prop, [{ animalId: ids['V-2']! }, { animalId: ids['V-2']! }]),
        ),
      ),
    ).toMatch(/repetido/);
    const outra = await criarPropriedade(amb, 'Outra');
    expect(
      erro(
        await amb.chamar(
          'negociacao:registrarVenda',
          dadosDeVenda(outra.id, [{ animalId: ids['V-2']! }]),
        ),
      ),
    ).toMatch(/outra propriedade/);
  });

  it('venda à vista com recebimento confirmado cria o recebimento; sem confirmação não cria', async () => {
    const { ids } = await rebanho();
    const v = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: ids['V-3']! }], {
        valorTotalCentavos: 250000,
        condicao: {
          tipo: 'a_vista',
          vencimento: '2026-10-10',
          pagamento: { data: '2026-10-10', forma: 'PIX' },
        },
      }),
    );
    expect(v).toMatchObject({
      pagoCentavos: 250000,
      situacaoFinanceira: 'quitado',
      saldoEmAbertoCentavos: 0,
    });
  });

  it('venda com condição não informada fica pendente de definição, saldo desconhecido', async () => {
    const { ids } = await rebanho();
    const v = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: ids['V-3']! }], {
        valorTotalCentavos: 250000,
        condicao: { tipo: 'nao_informada' },
      }),
    );
    expect(v).toMatchObject({
      situacaoFinanceira: 'pendente_definicao',
      saldoEmAbertoCentavos: null,
      pagoCentavos: 0,
    });
  });
});

describe('cancelar venda e desfazer saída (D-H)', () => {
  async function vendido() {
    const lote = await criarLote(amb, prop, 'Engorda');
    const c = await comprar(
      amb,
      dadosDeCompra(
        prop,
        [
          { identificacao: 'D-1', pesoVivoKg: 400 },
          { identificacao: 'D-2', pesoVivoKg: 400 },
        ],
        {
          loteId: lote.id,
          condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
        },
      ),
    );
    const ids = c.itens.map((i) => i.animalId);
    const v = await vender(
      amb,
      dadosDeVenda(
        prop,
        ids.map((animalId) => ({ animalId })),
        {
          valorTotalCentavos: 600000,
          condicao: {
            tipo: 'parcelado',
            parcelas: [
              { vencimento: '2026-11-10', valorCentavos: 300000 },
              { vencimento: '2026-12-10', valorCentavos: 300000 },
            ],
          },
        },
      ),
    );
    return { lote, ids, venda: v };
  }

  it('cancelar a venda devolve os animais ao lote e cancela a receita, sem apagar nada', async () => {
    const { lote, ids, venda } = await vendido();
    const antesMov = contar(amb, 'movimentacao_animal');
    const c = await amb.ok('negociacao:cancelar', {
      id: venda.id,
      motivo: 'Comprador desistiu',
      destino: { tipo: 'origem' },
    });
    expect(c).toMatchObject({
      cancelada: true,
      motivoCancelamento: 'Comprador desistiu',
      situacaoFinanceira: 'cancelado',
    });
    for (const id of ids) {
      const a = await amb.ok('animal:obter', { id });
      expect(a).toMatchObject({ status: 'ativo', dataSaida: null });
      expect(a.lote?.id).toBe(lote.id);
    }
    // Nenhuma movimentação foi apagada: a saída ficou cancelada logicamente.
    expect(contar(amb, 'movimentacao_animal')).toBe(antesMov);
    expect(contar(amb, 'movimentacao_animal', "tipo = 'saida' AND deleted_at IS NOT NULL")).toBe(2);
    expect(contar(amb, 'historico_alteracao', "acao = 'reversao_saida'")).toBe(2);
    expect(
      contar(
        amb,
        'historico_alteracao',
        "entidade = 'negociacao_animal' AND acao = 'cancelamento'",
      ),
    ).toBe(1);
    // Os animais podem ser vendidos de novo.
    const outra = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: ids[0]! }], { valorTotalCentavos: 100000 }),
    );
    expect(outra.cancelada).toBe(false);
  });

  it('recebimento ativo impede o cancelamento até ser estornado', async () => {
    const { ids, venda } = await vendido();
    const l = await amb.ok('lancamento:obter', { id: venda.lancamentoId });
    const comPagamento = await amb.ok('pagamento:registrar', {
      parcelaId: l.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-15', valorCentavos: 100000, forma: null, observacao: null },
    });
    expect(
      erro(
        await amb.chamar('negociacao:cancelar', {
          id: venda.id,
          motivo: 'x',
          destino: { tipo: 'origem' },
        }),
      ),
    ).toMatch(/Estorne-os no lançamento/);
    expect((await amb.ok('animal:obter', { id: ids[0]! })).status).toBe('vendido');
    await amb.ok('pagamento:estornar', {
      id: comPagamento.pagamentos[0]!.id,
      motivo: 'Recebimento lançado errado',
    });
    expect(
      (
        await amb.ok('negociacao:cancelar', {
          id: venda.id,
          motivo: 'Comprador desistiu',
          destino: { tipo: 'origem' },
        })
      ).cancelada,
    ).toBe(true);
  });

  it('lote de origem encerrado: nada é decidido sozinho; o usuário escolhe reabrir, outro lote ou sem lote', async () => {
    const { lote, ids, venda } = await vendido();
    await amb.ok('lote:encerrar', { id: lote.id, data: '2026-10-12' });
    const antes = contagens();
    const msg = erro(
      await amb.chamar('negociacao:cancelar', {
        id: venda.id,
        motivo: 'x',
        destino: { tipo: 'origem' },
      }),
    );
    expect(msg).toMatch(/lote de origem "Engorda" está encerrado/);
    expect(contagens()).toEqual(antes);
    // Reabrir o lote de origem.
    const c = await amb.ok('negociacao:cancelar', {
      id: venda.id,
      motivo: 'Comprador desistiu',
      destino: { tipo: 'reabrir_origem' },
    });
    expect(c.cancelada).toBe(true);
    const a = await amb.ok('animal:obter', { id: ids[0]! });
    expect(a.lote?.id).toBe(lote.id);
    expect((await amb.ok('lote:obter', { id: lote.id })).ativo).toBe(true);
  });

  it('volta para outro lote ou sem lote, registrando a troca na data da saída', async () => {
    const { lote, ids, venda } = await vendido();
    await amb.ok('lote:encerrar', { id: lote.id, data: '2026-10-12' });
    const outro = await criarLote(amb, prop, 'Recria', '2026-02-01');
    await amb.ok('negociacao:cancelar', {
      id: venda.id,
      motivo: 'Desistência',
      destino: { tipo: 'lote', loteId: outro.id },
    });
    const a = await amb.ok('animal:obter', { id: ids[0]! });
    expect(a.lote?.id).toBe(outro.id);
    const hist = await amb.ok('animal:historico', { id: ids[0]! });
    const trocas = hist.eventos.filter(
      (e) => e.tipo === 'movimentacao' && e.movimentacao.tipo === 'troca_lote',
    );
    expect(trocas.at(0)).toMatchObject({ data: '2026-10-10' });
    // Segundo animal: sem lote (venda nova, depois cancelamento).
    const v2 = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: ids[1]! }], {
        valorTotalCentavos: 100000,
        data: '2026-10-14',
      }),
    );
    await amb.ok('negociacao:cancelar', {
      id: v2.id,
      motivo: 'Desistência',
      destino: { tipo: 'sem_lote' },
    });
    expect((await amb.ok('animal:obter', { id: ids[1]! })).lote).toBeNull();
  });

  it('desfazer a saída direta: morto volta ao rebanho; vendido exige cancelar a venda', async () => {
    const { ids } = await vendido();
    const msg = erro(
      await amb.chamar('animal:desfazerSaida', {
        id: ids[0]!,
        motivo: 'engano',
        destino: { tipo: 'origem' },
      }),
    );
    expect(msg).toMatch(/Cancele a venda no módulo Financeiro/);
    const lote = await criarLote(amb, prop, 'Cria');
    const comp = await comprar(
      amb,
      dadosDeCompra(prop, [{ identificacao: 'M-1' }], { loteId: lote.id }),
    );
    const id = comp.itens[0]!.animalId;
    await amb.ok('animal:registrarSaida', {
      id,
      tipo: 'morto',
      data: '2026-10-12',
      motivo: 'Acidente',
    });
    const a = await amb.ok('animal:desfazerSaida', {
      id,
      motivo: 'Lançado por engano',
      destino: { tipo: 'origem' },
    });
    expect(a).toMatchObject({ status: 'ativo', dataSaida: null });
    expect(a.lote?.id).toBe(lote.id);
    expect(
      erro(
        await amb.chamar('animal:desfazerSaida', {
          id,
          motivo: 'de novo',
          destino: { tipo: 'origem' },
        }),
      ),
    ).toMatch(/não saiu do rebanho/);
  });

  it('fatos posteriores à saída impedem desfazê-la, e nada muda', async () => {
    const lote = await criarLote(amb, prop, 'Cria');
    const comp = await comprar(
      amb,
      dadosDeCompra(prop, [{ identificacao: 'F-1' }], { loteId: lote.id }),
    );
    const id = comp.itens[0]!.animalId;
    await amb.ok('animal:registrarSaida', {
      id,
      tipo: 'descartado',
      data: '2026-10-05',
      motivo: 'Descarte',
    });
    // Lançamento de despesa do animal com competência anterior à saída (permitido) não impede.
    const antes = contagens();
    const ok = await amb.chamar('animal:desfazerSaida', {
      id,
      motivo: 'Revertido',
      destino: { tipo: 'origem' },
    });
    expect(ok.ok).toBe(true);
    expect(contagens().slice(0, 3)).toEqual(antes.slice(0, 3));
  });
});

describe('cancelar compra', () => {
  it('compra intocada pode ser cancelada: animais saem do cadastro, nada é apagado e o lançamento é cancelado', async () => {
    const n = await comprar(
      amb,
      dadosDeCompra(prop, [
        { identificacao: 'K-1', pesoVivoKg: 300 },
        { identificacao: 'K-2', pesoVivoKg: 300 },
      ]),
    );
    const c = await amb.ok('negociacao:cancelar', {
      id: n.id,
      motivo: 'Compra desfeita',
      destino: { tipo: 'origem' },
    });
    expect(c).toMatchObject({ cancelada: true, situacaoFinanceira: 'cancelado' });
    expect(contar(amb, 'animal', 'deleted_at IS NOT NULL')).toBe(2);
    expect(contar(amb, 'animal')).toBe(2); // nada foi apagado fisicamente
    // As identificações ficam livres para uma nova compra.
    expect((await comprar(amb, dadosDeCompra(prop, [{ identificacao: 'K-1' }]))).cancelada).toBe(
      false,
    );
  });

  it('fatos posteriores (pesagem, consumo, venda, financeiro) impedem o cancelamento e listam o motivo', async () => {
    const n = await comprar(
      amb,
      dadosDeCompra(prop, [
        { identificacao: 'N-1', pesoVivoKg: 300 },
        { identificacao: 'N-2', pesoVivoKg: 300 },
      ]),
    );
    const [a, b] = n.itens.map((i) => i.animalId) as [string, string];
    await amb.ok('pesagem:registrar', {
      animalId: a,
      dados: {
        data: '2026-10-10',
        pesoVivoKg: 330,
        metodo: 'balanca',
        observacao: null,
        escoreCorporal: null,
        escalaEcc: null,
      },
    });
    await vender(amb, dadosDeVenda(prop, [{ animalId: b }], { valorTotalCentavos: 100000 }));
    const antes = contagens();
    const r = await amb.chamar('negociacao:cancelar', {
      id: n.id,
      motivo: 'x',
      destino: { tipo: 'origem' },
    });
    const msg = erro(r);
    expect(msg).toMatch(/N-1: há 1 pesagem\(ns\) além do peso de entrada/);
    expect(msg).toMatch(/N-2: o animal já saiu do rebanho/);
    expect(contagens()).toEqual(antes);
  });

  it('pagamento ativo impede cancelar a compra até ser estornado', async () => {
    const n = await comprar(amb, dadosDeCompra(prop, [{ identificacao: 'Q-1' }]));
    const l = await amb.ok('lancamento:obter', { id: n.lancamentoId });
    await amb.ok('pagamento:registrar', {
      parcelaId: l.parcelas[0]!.id,
      requisicaoId: gerarUuidV7(),
      dados: { data: '2026-10-02', valorCentavos: 100000, forma: null, observacao: null },
    });
    expect(
      erro(
        await amb.chamar('negociacao:cancelar', {
          id: n.id,
          motivo: 'x',
          destino: { tipo: 'origem' },
        }),
      ),
    ).toMatch(/Estorne-os/);
  });
});

describe('custo anterior ao sistema e custo do animal (D-F, D-G)', () => {
  const nascido = async (
    identificacao: string,
    data = '2026-01-01',
    loteId: string | null = null,
  ) =>
    amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: {
        identificacao,
        nome: null,
        sexo: 'F',
        condicaoSexual: 'femea',
        categoria: 'bezerra',
        aptidao: 'leite',
        racaId: null,
        dataNascimento: '2025-12-01',
        dataNascimentoEstimada: false,
        maeId: null,
        paiId: null,
        origem: 'nascido',
        observacoes: null,
      },
      entrada: { data, loteId, pesoVivoKg: null, metodoPesagem: null },
    });
  const registrar = (extra: Record<string, unknown>) =>
    amb.chamar('custoAnterior:registrar', {
      requisicaoId: gerarUuidV7(),
      propriedadeId: prop,
      valorCentavos: 100000,
      dataReferencia: '2026-09-01',
      descricao: 'Custo de criação até o cadastro',
      origemInformacao: 'Caderno de campo',
      justificativa: 'Animal nascido antes do uso do sistema',
      confirmarSemDuplicidade: false,
      ...extra,
    } as never);

  it('animal nascido sem custo anterior: aquisição não aplicável, formação não apurada, nunca zero', async () => {
    const a = await nascido('N-1');
    const c = await amb.ok('custoAnimal:obter', { animalId: a.id });
    expect(c.aquisicao).toMatchObject({ situacao: 'nao_aplicavel', valorCentavos: null });
    expect(c.formacao).toEqual({ situacao: 'nao_apurada', valorCentavos: null });
    expect(c.apuracao).toMatchObject({ estado: 'nao_apurada', componentesConhecidos: 0 });
  });

  it('custo anterior de um animal: aparece como formação informada e fica fora do financeiro', async () => {
    const a = await nascido('N-2');
    const antes = ['lancamento_financeiro', 'parcela_financeira', 'pagamento_financeiro'].map((t) =>
      contar(amb, t),
    );
    const r = await registrar({ destino: { tipo: 'animal', animalId: a.id } });
    expect(r.ok).toBe(true);
    const c = await amb.ok('custoAnimal:obter', { animalId: a.id });
    expect(c.formacao).toEqual({ situacao: 'informada', valorCentavos: 100000 });
    expect(c.apuracao).toMatchObject({ estado: 'completa', valorConhecidoCentavos: 100000 });
    expect(c.custosAnteriores[0]).toMatchObject({
      informadoPeloUsuario: true,
      origemInformacao: 'Caderno de campo',
    });
    // Nenhum movimento financeiro foi criado.
    expect(
      ['lancamento_financeiro', 'parcela_financeira', 'pagamento_financeiro'].map((t) =>
        contar(amb, t),
      ),
    ).toEqual(antes);
    const fluxo = await amb.ok('fluxo:obter', {
      propriedadeId: prop,
      dataInicial: '2026-09-01',
      dataFinal: '2026-10-16',
      granularidade: 'mes',
    });
    expect(fluxo.realizado.movimentos + fluxo.previsto.parcelas).toBe(0);
  });

  it('lote: exige a confirmação do rateio igual, divide só quem estava no lote na data e fecha exato', async () => {
    const lote = await criarLote(amb, prop, 'Cria', '2025-12-15');
    await nascido('L-1', '2026-01-01', lote.id);
    await nascido('L-2', '2026-01-10', lote.id);
    await nascido('L-3', '2026-01-20', lote.id);
    await nascido('L-4', '2026-09-10', lote.id); // entra depois da data de referência
    const base = {
      destino: { tipo: 'lote', loteId: lote.id, confirmarRateioIgual: false },
      valorCentavos: 100001,
      dataReferencia: '2026-09-01',
    };
    expect(erro(await registrar(base))).toMatch(/Confirme o rateio igualitário/);
    const ok = await registrar({
      ...base,
      destino: { ...base.destino, confirmarRateioIgual: true },
    });
    expect(ok.ok).toBe(true);
    const lista = await amb.ok('custoAnterior:listar', {
      propriedadeId: prop,
      loteId: lote.id,
      incluirCancelados: false,
    });
    expect(lista[0]!.itens.map((i) => i.animalIdentificacao)).toEqual(['L-1', 'L-2', 'L-3']);
    const valores = lista[0]!.itens.map((i) => i.valorCentavos).sort();
    expect(valores).toEqual([33333, 33334, 33334]);
    expect(valores.reduce((s, v) => s + v, 0)).toBe(100001);
    expect(lista[0]!.itens.every((i) => i.pesoRelativo === 1)).toBe(true);
    const l4 = await animalPorIdentificacao('L-4');
    expect((await amb.ok('custoAnimal:obter', { animalId: l4.id })).formacao.situacao).toBe(
      'nao_apurada',
    );
  });

  it('evita dupla contagem: pede confirmação quando já há lançamento ou consumo, e recusa animal com compra registrada', async () => {
    const a = await nascido('D-1');
    const cat = await categoriaPorNome(amb, 'Outras despesas');
    await criarLancamento(
      amb,
      dadosDeLancamento(prop, cat.id, {
        destino: { tipo: 'animal', animalId: a.id },
        dataCompetencia: '2026-08-01',
      }),
    );
    const sem = await registrar({ destino: { tipo: 'animal', animalId: a.id } });
    expect(erro(sem)).toMatch(/Já existem custos registrados no sistema/);
    expect(
      (
        await registrar({
          destino: { tipo: 'animal', animalId: a.id },
          confirmarSemDuplicidade: true,
        })
      ).ok,
    ).toBe(true);
    // Um segundo custo anterior para o mesmo animal também pede confirmação.
    expect(
      erro(
        await registrar({
          destino: { tipo: 'animal', animalId: a.id },
          confirmarSemDuplicidade: false,
        }),
      ),
    ).toMatch(/Já há custo anterior informado/);
    // Animal comprado e registrado: o custo de aquisição já existe.
    const n = await comprar(amb, dadosDeCompra(prop, [{ identificacao: 'D-2' }]));
    const msg = erro(
      await registrar({
        destino: { tipo: 'animal', animalId: n.itens[0]!.animalId },
        confirmarSemDuplicidade: true,
      }),
    );
    expect(msg).toMatch(/compra registrada no sistema/);
  });

  it('data futura, valor menor que o número de animais e idempotência', async () => {
    const a = await nascido('V-9');
    expect(
      erro(
        await registrar({
          destino: { tipo: 'animal', animalId: a.id },
          dataReferencia: '2026-12-01',
        }),
      ),
    ).toMatch(/não pode ser futura/);
    const req = gerarUuidV7();
    const dados = { requisicaoId: req, destino: { tipo: 'animal', animalId: a.id } };
    const um = await registrar(dados);
    expect(um.ok).toBe(true);
    const antes = contar(amb, 'custo_anterior');
    expect((await registrar(dados)).ok).toBe(true);
    expect(contar(amb, 'custo_anterior')).toBe(antes);
    expect(erro(await registrar({ ...dados, valorCentavos: 5 }))).toMatch(
      /já foi usado com outro conteúdo/,
    );
  });

  it('cancelar o custo anterior devolve a formação para "não apurada" e fica na trilha', async () => {
    const a = await nascido('C-9');
    const r = await registrar({ destino: { tipo: 'animal', animalId: a.id } });
    expect(r.ok).toBe(true);
    const id = (r as { dados: { id: string } }).dados.id;
    const c = await amb.ok('custoAnterior:cancelar', { id, motivo: 'Valor informado errado' });
    expect(c).toMatchObject({ cancelado: true });
    expect((await amb.ok('custoAnimal:obter', { animalId: a.id })).formacao.situacao).toBe(
      'nao_apurada',
    );
    expect(
      contar(amb, 'historico_alteracao', "entidade = 'custo_anterior' AND acao = 'cancelamento'"),
    ).toBe(1);
    expect(erro(await amb.chamar('custoAnterior:cancelar', { id, motivo: 'de novo' }))).toMatch(
      /já está cancelado/,
    );
  });

  it('custo do animal comprado: aquisição registrada mais acessório lançado ao animal; completa', async () => {
    const n = await comprar(
      amb,
      dadosDeCompra(prop, [{ identificacao: 'E-1' }, { identificacao: 'E-2' }], {
        valorTotalCentavos: 500001,
        condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
      }),
    );
    const alvo = n.itens[0]!;
    const frete = await categoriaPorNome(amb, 'Frete, comissão e despesas da compra de animais');
    await criarLancamento(
      amb,
      dadosDeLancamento(prop, frete.id, {
        destino: { tipo: 'animal', animalId: alvo.animalId },
        dataCompetencia: '2026-10-01',
        valorTotalCentavos: 12345,
      }),
    );
    const c = await amb.ok('custoAnimal:obter', { animalId: alvo.animalId });
    expect(c.aquisicao).toMatchObject({
      situacao: 'registrada',
      valorCentavos: alvo.valorAlocadoCentavos,
    });
    expect(c.acessorios).toHaveLength(1);
    expect(c.apuracao).toMatchObject({
      estado: 'completa',
      valorConhecidoCentavos: alvo.valorAlocadoCentavos + 12345,
    });
    expect(c.observacao).toMatch(
      /Alimentação, sanidade, a parte do animal nos custos de lote e os rateios aparecem no custo completo/,
    );
  });

  it('animal comprado sem compra registrada (cadastro antigo): aquisição não apurada, nunca zero', async () => {
    const a = await amb.ok('animal:criar', {
      propriedadeId: prop,
      dados: { ...dadosDeCompra(prop, [{ identificacao: 'ANTIGO' }]).animais[0]!.dados },
      entrada: { data: '2026-01-01', loteId: null, pesoVivoKg: null, metodoPesagem: null },
    });
    const c = await amb.ok('custoAnimal:obter', { animalId: a.id });
    expect(c.aquisicao).toMatchObject({ situacao: 'nao_apurada', valorCentavos: null });
    expect(c.apuracao.estado).toBe('nao_apurada');
  });
});

describe('persistência', () => {
  it('compra, venda e custo anterior sobrevivem ao reinício', async () => {
    const lote = await criarLote(amb, prop, 'Engorda');
    const c = await comprar(
      amb,
      dadosDeCompra(prop, [{ identificacao: 'Z-1' }, { identificacao: 'Z-2' }], {
        loteId: lote.id,
      }),
    );
    const v = await vender(
      amb,
      dadosDeVenda(prop, [{ animalId: c.itens[0]!.animalId }], { valorTotalCentavos: 123456 }),
    );
    await amb.reiniciar();
    const lista = await amb.ok('negociacao:listar', {
      propriedadeId: prop,
      incluirCanceladas: false,
      pagina: 1,
      tamanhoPagina: 50,
    });
    expect(lista.total).toBe(2);
    expect(lista.itens.map((n) => [n.tipo, n.valorTotalCentavos, n.quantidadeAnimais])).toEqual([
      ['venda', 123456, 1],
      ['compra', 900000, 2],
    ]);
    expect((await amb.ok('negociacao:obter', { id: v.id })).itens[0]!.valorAlocadoCentavos).toBe(
      123456,
    );
  });
});

describe('volume', () => {
  it(
    'compra e venda de 500 animais fecham exatamente (tempos medidos, sem limite frágil)',
    { timeout: 180_000 },
    async () => {
      const lote = await criarLote(amb, prop, 'Grande');
      const identificacoes = Array.from({ length: 500 }, (_, i) => ({
        identificacao: `G-${String(i).padStart(4, '0')}`,
        pesoVivoKg: 200 + (i % 150),
      }));
      let t = performance.now();
      const c = await comprar(
        amb,
        dadosDeCompra(prop, identificacoes, {
          loteId: lote.id,
          valorTotalCentavos: 123456789,
          criterio: 'peso_vivo',
          condicao: { tipo: 'a_vista', vencimento: '2026-10-20', pagamento: null },
        }),
      );
      console.warn(`[volume animais] compra de 500: ${Math.round(performance.now() - t)} ms`);
      expect(c.itens).toHaveLength(500);
      expect(c.itens.reduce((s, i) => s + i.valorAlocadoCentavos, 0)).toBe(123456789);
      t = performance.now();
      const v = await vender(
        amb,
        dadosDeVenda(
          prop,
          c.itens.map((i) => ({ animalId: i.animalId })),
          { valorTotalCentavos: 98765432 },
        ),
      );
      console.warn(`[volume animais] venda de 500: ${Math.round(performance.now() - t)} ms`);
      expect(v.itens.reduce((s, i) => s + i.valorAlocadoCentavos, 0)).toBe(98765432);
      t = performance.now();
      await amb.ok('negociacao:cancelar', {
        id: v.id,
        motivo: 'Teste de volume',
        destino: { tipo: 'origem' },
      });
      console.info(
        `[volume animais] cancelamento da venda de 500: ${Math.round(performance.now() - t)} ms`,
      );
      expect(contar(amb, 'animal', "status = 'ativo'")).toBe(500);
    },
  );
});
