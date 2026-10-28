import { describe, expect, it } from 'vitest';
import {
  SEMENTES_PADRAO,
  criarGeradorDeterministico,
  gerarUuidV7,
  type GeradorDeterministico,
} from '@pecuaria/domain';
import { criarAmbienteIpc, type AmbienteIpc } from '../../teste/ambiente-ipc';
import {
  DATA_DO_RELOGIO,
  categoriaPorNome,
  conferirCaixa,
  conferirInvariantes,
  contar,
  criarPropriedade,
} from './apoio-teste';
import { conferirInsumos } from './apoio-insumos';

/**
 * Sequências de operações de insumos (D-K): compra com frete, consumo, correção de item da nota
 * (com recálculo retroativo do custo médio), cancelamento de compra e de consumo, estorno. Após
 * cada passo: invariantes financeiros, da nota e do caixa; e a conservação do estoque, que vale
 * por construção quando a valoração é completa: custo das entradas ativas = valor do saldo +
 * custo apropriado dos consumos ativos. Operação recusada não deixa rastro.
 */
type Passo =
  | {
      op: 'comprar';
      itens: { item: number; q: number; valor: number }[];
      frete: number;
      condicao: 'a_vista' | 'parcelado' | 'nao_informada';
      data: string;
    }
  | { op: 'consumir'; item: number; q: number; destino: 'propriedade' | 'lote'; data: string }
  | { op: 'corrigir'; alvo: number; q: number; valor: number }
  | { op: 'cancelarCompra'; alvo: number }
  | { op: 'cancelarConsumo'; alvo: number }
  | { op: 'pagar'; alvo: number }
  | { op: 'estornar'; alvo: number };

const DATAS = ['2026-09-20', '2026-10-01', '2026-10-05', '2026-10-10', '2026-10-16'];

function gerarPasso(g: GeradorDeterministico): Passo {
  const x = g.inteiro(0, 99);
  if (x < 28)
    return {
      op: 'comprar',
      itens: Array.from({ length: g.inteiro(1, 3) }, () => ({
        item: g.inteiro(0, 2),
        q: g.inteiro(1, 500),
        valor: g.booleano(0.1) ? g.escolher([1, 2, 3, 99]) : g.inteiro(1, 500000),
      })),
      frete: g.booleano(0.4) ? g.inteiro(1, 50000) : 0,
      condicao: g.escolher(['a_vista', 'parcelado', 'nao_informada'] as const),
      data: g.escolher(DATAS),
    };
  if (x < 55)
    return {
      op: 'consumir',
      item: g.inteiro(0, 2),
      q: g.inteiro(1, 300),
      destino: g.escolher(['propriedade', 'lote'] as const),
      data: g.escolher(DATAS),
    };
  if (x < 72)
    return {
      op: 'corrigir',
      alvo: g.inteiro(0, 30),
      q: g.inteiro(1, 500),
      valor: g.inteiro(1, 500000),
    };
  if (x < 82) return { op: 'cancelarCompra', alvo: g.inteiro(0, 30) };
  if (x < 90) return { op: 'cancelarConsumo', alvo: g.inteiro(0, 30) };
  if (x < 96) return { op: 'pagar', alvo: g.inteiro(0, 30) };
  return { op: 'estornar', alvo: g.inteiro(0, 30) };
}

interface Estatistica {
  sucesso: Map<string, number>;
  falha: Map<string, number>;
}
const nova = (): Estatistica => ({ sucesso: new Map(), falha: new Map() });
const somar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const TABELAS = [
  'lancamento_financeiro',
  'parcela_financeira',
  'pagamento_financeiro',
  'lancamento_item',
  'movimentacao_estoque',
  'historico_alteracao',
];
const contagens = (amb: AmbienteIpc) => TABELAS.map((t) => contar(amb, t)).join();

/** Conservação do estoque em itens com valoração completa. */
async function conferirConservacao(amb: AmbienteIpc, prop: string): Promise<string[]> {
  const erros: string[] = [];
  const db = amb.gerenciador.conexao;
  const itens = await amb.ok('estoque:listar', { propriedadeId: prop, incluirInativos: true });
  for (const i of itens) {
    if (!i.valoracaoCompleta || i.valorSaldoCentavos === null) continue;
    const r = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN tipo LIKE 'entrada%' OR tipo = 'ajuste_entrada' THEN custo_entrada_centavos END),0) AS entradas,
                COALESCE(SUM(CASE WHEN tipo NOT LIKE 'entrada%' AND tipo <> 'ajuste_entrada' THEN custo_apropriado_centavos END),0) AS saidas
         FROM movimentacao_estoque WHERE estoque_item_id = ? AND deleted_at IS NULL`,
      )
      .get(i.id) as { entradas: number; saidas: number };
    if (r.entradas !== i.valorSaldoCentavos + r.saidas)
      erros.push(
        `${i.nome}: entradas ${r.entradas} diferente de saldo ${i.valorSaldoCentavos} + consumos ${r.saidas}`,
      );
  }
  return erros;
}

async function executar(
  amb: AmbienteIpc,
  passos: readonly Passo[],
  est: Estatistica,
): Promise<string | null> {
  const prop = (await criarPropriedade(amb, `Fazenda ${gerarUuidV7()}`)).id;
  const categoria = (
    await categoriaPorNome(amb, 'Insumos para estoque (ração, silagem, suplemento, mineral)')
  ).id;
  const lote = await amb.ok('lote:criar', {
    propriedadeId: prop,
    dados: {
      nome: 'L',
      finalidade: 'engorda',
      dataFormacao: '2026-09-01',
      areaId: null,
      observacoes: null,
    },
  });
  const itens: string[] = [];
  for (const nome of ['Ração', 'Silagem', 'Mineral'])
    itens.push(
      (
        await amb.ok('estoque:criarItem', {
          propriedadeId: prop,
          dados: {
            nome,
            tipo: 'racao',
            unidadeBase: 'kg',
            controleLote: false,
            estoqueMinimo: null,
            produtoSanitarioId: null,
            ativo: true,
            observacoes: null,
          },
        })
      ).id,
    );
  const pick = <T>(lista: T[], alvo: number): T | undefined =>
    lista.length ? lista[alvo % lista.length] : undefined;

  for (const [i, passo] of passos.entries()) {
    const rotulo = `passo ${i + 1} (${passo.op})`;
    const antes = contagens(amb);
    const compras = (
      await amb.ok('compraInsumo:listar', {
        propriedadeId: prop,
        incluirCanceladas: false,
        pagina: 1,
        tamanhoPagina: 200,
      })
    ).itens;
    let ok: boolean;
    switch (passo.op) {
      case 'comprar': {
        const condicao =
          passo.condicao === 'a_vista'
            ? ({ tipo: 'a_vista', vencimento: '2026-10-30', pagamento: null } as const)
            : passo.condicao === 'nao_informada'
              ? ({ tipo: 'nao_informada' } as const)
              : null;
        const total = passo.itens.reduce((s, x) => s + x.valor, 0) + passo.frete;
        const r = await amb.chamar('compraInsumo:registrar', {
          requisicaoId: gerarUuidV7(),
          propriedadeId: prop,
          data: passo.data,
          pessoaId: null,
          categoriaId: categoria,
          documentoNumero: null,
          atividade: 'corte',
          observacoes: null,
          freteCentavos: passo.frete,
          condicao: condicao ?? {
            tipo: 'parcelado',
            parcelas:
              total >= 2
                ? [
                    { vencimento: '2026-11-10', valorCentavos: 1 },
                    { vencimento: '2026-12-10', valorCentavos: total - 1 },
                  ]
                : [],
          },
          itens: passo.itens.map((x) => ({
            estoqueItemId: itens[x.item]!,
            quantidade: x.q,
            unidadeBase: 'kg',
            valorCentavos: x.valor,
            loteFisico: null,
          })),
        });
        ok = r.ok;
        break;
      }
      case 'consumir': {
        const r = await amb.chamar('estoque:registrar', {
          itemId: itens[passo.item]!,
          requisicaoId: gerarUuidV7(),
          dados: {
            data: passo.data,
            tipo: 'saida_consumo',
            quantidade: passo.q,
            unidadeBase: 'kg',
            loteEstoqueId: null,
            custoEntradaCentavos: null,
            destino: passo.destino,
            loteAnimalId: passo.destino === 'lote' ? lote.id : null,
            animalId: null,
            documentoOrigemId: null,
            motivo: null,
            observacao: null,
          },
        });
        ok = r.ok;
        break;
      }
      case 'corrigir': {
        const c = pick(compras, passo.alvo);
        const d = c ? await amb.ok('compraInsumo:obter', { lancamentoId: c.lancamentoId }) : null;
        const it = d?.itens.find((x) => !x.cancelado);
        if (!d || !it) {
          ok = false;
          break;
        }
        const novoTotal = d.valorTotalCentavos + (passo.valor - it.valorCentavos);
        const lanc = await amb.ok('lancamento:obter', { id: d.lancamentoId });
        const pago = lanc.pagoCentavos;
        const saldo = novoTotal - pago;
        const parcelas =
          d.condicaoPagamento === 'nao_informada' || saldo <= 0
            ? []
            : [{ vencimento: '2026-12-20', valorCentavos: saldo }];
        ok = (
          await amb.chamar('compraInsumo:corrigirItem', {
            itemId: it.id,
            requisicaoId: gerarUuidV7(),
            valorCentavos: passo.valor,
            quantidade: passo.q,
            novasParcelas: d.valorTotalCentavos === novoTotal ? [] : parcelas,
            motivo: 'Teste de correção',
          })
        ).ok;
        break;
      }
      case 'cancelarCompra': {
        const c = pick(compras, passo.alvo);
        ok = c
          ? (
              await amb.chamar('compraInsumo:cancelar', {
                lancamentoId: c.lancamentoId,
                motivo: 'Teste',
              })
            ).ok
          : false;
        break;
      }
      case 'cancelarConsumo': {
        const lista = (
          await amb.ok('consumo:listar', { propriedadeId: prop, pagina: 1, tamanhoPagina: 200 })
        ).itens;
        const c = pick(lista, passo.alvo);
        ok = c
          ? (await amb.chamar('estoque:cancelar', { id: c.movimentacaoId, motivo: 'Teste' })).ok
          : false;
        break;
      }
      case 'pagar': {
        const c = pick(compras, passo.alvo);
        const l = c ? await amb.ok('lancamento:obter', { id: c.lancamentoId }) : null;
        const p = l?.parcelas.find((x) => !x.cancelada && x.saldoCentavos > 0);
        ok = p
          ? (
              await amb.chamar('pagamento:registrar', {
                parcelaId: p.id,
                requisicaoId: gerarUuidV7(),
                dados: {
                  data: '2026-10-16',
                  valorCentavos: p.saldoCentavos,
                  forma: null,
                  observacao: null,
                },
              })
            ).ok
          : false;
        break;
      }
      case 'estornar': {
        const c = pick(compras, passo.alvo);
        const l = c ? await amb.ok('lancamento:obter', { id: c.lancamentoId }) : null;
        const g = l?.pagamentos.find((x) => !x.estornado);
        ok = g ? (await amb.chamar('pagamento:estornar', { id: g.id, motivo: 'Teste' })).ok : false;
        break;
      }
    }
    if (ok) somar(est.sucesso, passo.op);
    else {
      somar(est.falha, passo.op);
      if (contagens(amb) !== antes) return `${rotulo}: operação recusada deixou rastro`;
    }
    const violacoes = [
      ...conferirInvariantes(amb),
      ...conferirInsumos(amb),
      ...(await conferirConservacao(amb, prop)),
    ];
    if (violacoes.length) return `${rotulo}: ${violacoes.join('; ')}`;
  }
  const caixa = await conferirCaixa(amb);
  return caixa.length ? `fim da sequência: ${caixa.join('; ')}` : null;
}

async function reduzir(passos: Passo[]): Promise<Passo[]> {
  let atual = [...passos];
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (let i = atual.length - 1; i >= 0; i--) {
      const tentativa = atual.filter((_, k) => k !== i);
      const amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
      try {
        if ((await executar(amb, tentativa, nova())) !== null) {
          atual = tentativa;
          mudou = true;
        }
      } finally {
        amb.encerrar();
      }
    }
  }
  return atual;
}

const ambiente = process.env;
const SEQUENCIAS = Number(ambiente['PECUARIA_SEQUENCIAS'] ?? 40);
const SEMENTES = ambiente['PECUARIA_SEMENTE']
  ? [Number(ambiente['PECUARIA_SEMENTE'])]
  : [...SEMENTES_PADRAO];

describe('sequências de operações de insumos e invariantes (D-K)', () => {
  const geral = nova();
  for (const semente of SEMENTES) {
    it(
      `semente ${semente}: ${SEQUENCIAS} sequências de até 25 passos`,
      { timeout: 300_000 },
      async () => {
        const g = criarGeradorDeterministico(semente);
        for (let s = 0; s < SEQUENCIAS; s++) {
          const passos = Array.from({ length: g.inteiro(5, 25) }, () => gerarPasso(g));
          const amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
          let falha: string | null;
          try {
            falha = await executar(amb, passos, geral);
          } finally {
            amb.encerrar();
          }
          if (falha) {
            const menor = await reduzir(passos);
            throw new Error(
              `Violação na semente ${semente}, sequência ${s}: ${falha}\nMenor sequência (${menor.length} passos): ${JSON.stringify(menor)}`,
            );
          }
        }
      },
    );
  }

  it('guarda de abrangência: compras, consumos, correções e cancelamentos acontecem de verdade, e há recusas', () => {
    for (const op of [
      'comprar',
      'consumir',
      'corrigir',
      'cancelarCompra',
      'cancelarConsumo',
      'pagar',
    ])
      expect(geral.sucesso.get(op) ?? 0, `sucessos de ${op}`).toBeGreaterThan(0);
    for (const op of ['comprar', 'consumir', 'corrigir', 'cancelarCompra'])
      expect(geral.falha.get(op) ?? 0, `recusas de ${op}`).toBeGreaterThan(0);
  });
});
