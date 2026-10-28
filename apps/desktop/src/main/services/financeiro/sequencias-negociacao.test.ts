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
  conferirCaixa,
  conferirInvariantes,
  contar,
  criarPropriedade,
} from './apoio-teste';
import { criarLote, dadosDeCompra, dadosDeVenda } from './apoio-animais';
import { conferirResultado } from './apoio-resultado';

/**
 * Sequências de operações com animais (D-K): compra, venda, recebimento, estorno, cancelamento,
 * saída por morte, desfazer saída, custo anterior, encerramento de lote e devolução de venda ou de
 * compra (parcial ou total, com valor igual, menor ou maior que o original) e seu cancelamento. Os passos são dados
 * puros resolvidos contra o estado atual, o que permite reproduzir e reduzir uma falha. Após cada
 * passo valem os invariantes (soma alocada = total da negociação, venda ativa = animal vendido,
 * nenhum animal ativo com saída válida, caixa igual às somas do banco); uma operação recusada não
 * deixa rastro.
 */
type Passo =
  | {
      op: 'comprar';
      n: number;
      total: number;
      criterio: 'igual' | 'peso_vivo' | 'manual';
      pesos: boolean;
      condicao: 'a_vista' | 'parcelado' | 'nao_informada';
      data: string;
      lote: boolean;
    }
  | {
      op: 'vender';
      alvo: number;
      n: number;
      total: number;
      criterio: 'igual' | 'peso_vivo';
      pesos: boolean;
      data: string;
      recebido: boolean;
    }
  | { op: 'receber'; alvo: number; quanto: 'tudo' | 'metade' }
  | { op: 'estornar'; alvo: number }
  | { op: 'cancelar'; alvo: number; destino: 'origem' | 'sem_lote' | 'reabrir_origem' }
  | { op: 'morte'; alvo: number; data: string }
  | { op: 'desfazer'; alvo: number; destino: 'origem' | 'sem_lote' }
  | { op: 'custoAnterior'; alvo: number; valor: number; confirmar: boolean }
  | { op: 'encerrarLote'; data: string }
  | { op: 'reabrirLote' }
  | {
      op: 'devolver';
      alvo: number;
      parcial: boolean;
      valor: 'original' | 'menor' | 'maior';
      data: string;
      restante: 'a_vista' | 'pago' | 'parcelado' | 'nao_informada';
      lote: boolean;
    }
  | { op: 'cancelarDevolucao'; alvo: number };

const DATAS = ['2026-09-20', '2026-10-01', '2026-10-05', '2026-10-10', '2026-10-16'];
const TOTAIS = [1, 2, 3, 100, 101, 33333, 100000, 999999];

function gerarPasso(g: GeradorDeterministico): Passo {
  const y = g.inteiro(0, 99);
  if (y >= 85)
    return y < 95
      ? {
          op: 'devolver',
          alvo: g.inteiro(0, 30),
          parcial: g.booleano(0.5),
          valor: g.escolher(['original', 'original', 'menor', 'maior'] as const),
          data: g.escolher(DATAS),
          restante: g.escolher(['a_vista', 'pago', 'parcelado', 'nao_informada'] as const),
          lote: g.booleano(0.6),
        }
      : { op: 'cancelarDevolucao', alvo: g.inteiro(0, 30) };
  const x = g.inteiro(0, 99);
  if (x < 22)
    return {
      op: 'comprar',
      n: g.inteiro(1, 4),
      total: g.booleano(0.4) ? g.escolher(TOTAIS) : g.inteiro(1, 3_000_000),
      criterio: g.escolher(['igual', 'igual', 'peso_vivo', 'manual'] as const),
      pesos: g.booleano(0.7),
      condicao: g.escolher(['a_vista', 'parcelado', 'nao_informada'] as const),
      data: g.escolher(DATAS),
      lote: g.booleano(0.7),
    };
  if (x < 42)
    return {
      op: 'vender',
      alvo: g.inteiro(0, 30),
      n: g.inteiro(1, 3),
      total: g.booleano(0.4) ? g.escolher(TOTAIS) : g.inteiro(1, 3_000_000),
      criterio: g.escolher(['igual', 'peso_vivo'] as const),
      pesos: g.booleano(0.6),
      data: g.escolher(DATAS),
      recebido: g.booleano(0.3),
    };
  if (x < 52)
    return {
      op: 'receber',
      alvo: g.inteiro(0, 30),
      quanto: g.escolher(['tudo', 'metade'] as const),
    };
  if (x < 60) return { op: 'estornar', alvo: g.inteiro(0, 30) };
  if (x < 74)
    return {
      op: 'cancelar',
      alvo: g.inteiro(0, 30),
      destino: g.escolher(['origem', 'sem_lote', 'reabrir_origem'] as const),
    };
  if (x < 82) return { op: 'morte', alvo: g.inteiro(0, 30), data: g.escolher(DATAS) };
  if (x < 90)
    return {
      op: 'desfazer',
      alvo: g.inteiro(0, 30),
      destino: g.escolher(['origem', 'sem_lote'] as const),
    };
  if (x < 95)
    return {
      op: 'custoAnterior',
      alvo: g.inteiro(0, 30),
      valor: g.inteiro(1, 500000),
      confirmar: g.booleano(0.5),
    };
  if (x < 98) return { op: 'encerrarLote', data: g.escolher(DATAS) };
  return { op: 'reabrirLote' };
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
  'negociacao_animal',
  'negociacao_animal_item',
  'animal',
  'movimentacao_animal',
  'pesagem',
  'historico_alteracao',
  'custo_anterior',
  'devolucao_animal',
  'devolucao_animal_item',
  'compensacao_financeira',
];
const contagens = (amb: AmbienteIpc) => TABELAS.map((t) => contar(amb, t)).join();

async function executar(
  amb: AmbienteIpc,
  passos: readonly Passo[],
  est: Estatistica,
): Promise<string | null> {
  const prop = (await criarPropriedade(amb, `Fazenda ${gerarUuidV7()}`)).id;
  const lote = await criarLote(amb, prop, 'Lote A', '2026-09-01');
  let contador = 0;
  const pagina = {
    propriedadeId: prop,
    incluirCanceladas: false,
    pagina: 1,
    tamanhoPagina: 200,
  } as const;
  for (const [i, passo] of passos.entries()) {
    const rotulo = `passo ${i + 1} (${passo.op})`;
    const antes = contagens(amb);
    let ok: boolean;
    const animais = (
      await amb.ok('animal:listar', {
        propriedadeId: prop,
        filtros: { status: 'todos', tamanhoPagina: 5000 },
      })
    ).itens;
    const ativos = animais.filter((a) => a.status === 'ativo');
    const fora = animais.filter((a) => a.status !== 'ativo');
    const negociacoes = (await amb.ok('negociacao:listar', pagina)).itens;
    const detalhes = await Promise.all(
      negociacoes.map((n) => amb.ok('negociacao:obter', { id: n.id })),
    );
    const devolucoesAtivas = detalhes.flatMap((d) => d.devolucoes.filter((x) => !x.cancelada));
    const lancamentos = [
      ...negociacoes.map((n) => n.lancamentoId),
      ...devolucoesAtivas.map((d) => d.lancamentoId),
    ];
    const pick = <T>(lista: T[], alvo: number): T | undefined =>
      lista.length ? lista[alvo % lista.length] : undefined;

    switch (passo.op) {
      case 'comprar': {
        const animaisDaCompra = Array.from({ length: passo.n }, () => {
          contador += 1;
          return {
            identificacao: `S-${contador}`,
            pesoVivoKg: passo.pesos ? 250 + contador : null,
            valorManualCentavos: null as number | null,
          };
        });
        if (passo.criterio === 'manual') {
          // Valores manuais que somam exatamente o total (o último fica com o resto).
          let resto = passo.total;
          animaisDaCompra.forEach((a, k) => {
            const v = k === animaisDaCompra.length - 1 ? resto : Math.floor(resto / 2);
            a.valorManualCentavos = v;
            resto -= v;
          });
        }
        const condicao =
          passo.condicao === 'a_vista'
            ? { tipo: 'a_vista' as const, vencimento: '2026-10-20', pagamento: null }
            : passo.condicao === 'nao_informada'
              ? { tipo: 'nao_informada' as const }
              : {
                  tipo: 'parcelado' as const,
                  parcelas:
                    passo.total >= 2
                      ? [
                          { vencimento: '2026-11-10', valorCentavos: 1 },
                          { vencimento: '2026-12-10', valorCentavos: passo.total - 1 },
                        ]
                      : [],
                };
        const r = await amb.chamar(
          'negociacao:registrarCompra',
          dadosDeCompra(prop, animaisDaCompra, {
            data: passo.data,
            valorTotalCentavos: passo.total,
            criterio: passo.criterio,
            condicao:
              passo.condicao === 'parcelado' && passo.total < 2
                ? { tipo: 'nao_informada' }
                : condicao,
            loteId: passo.lote ? lote.id : null,
          }),
        );
        ok = r.ok;
        break;
      }
      case 'vender': {
        const escolhidos = Array.from({ length: passo.n }, (_, k) =>
          pick(ativos, passo.alvo + k),
        ).filter((a, k, arr) => a && arr.indexOf(a) === k) as typeof ativos;
        if (escolhidos.length === 0) {
          ok = false;
          const r = await amb.chamar(
            'negociacao:registrarVenda',
            dadosDeVenda(prop, [{ animalId: gerarUuidV7() }], { valorTotalCentavos: passo.total }),
          );
          expect(r.ok).toBe(false);
          break;
        }
        const r = await amb.chamar(
          'negociacao:registrarVenda',
          dadosDeVenda(
            prop,
            escolhidos.map((a, k) => ({
              animalId: a.id,
              pesoVivoKg: passo.pesos ? 300 + k : null,
            })),
            {
              data: passo.data,
              valorTotalCentavos: passo.total,
              criterio: passo.criterio,
              condicao: passo.recebido
                ? {
                    tipo: 'a_vista',
                    vencimento: passo.data,
                    pagamento: { data: passo.data, forma: null },
                  }
                : { tipo: 'a_vista', vencimento: '2026-10-30', pagamento: null },
            },
          ),
        );
        ok = r.ok;
        break;
      }
      case 'receber': {
        const id = pick(lancamentos, passo.alvo);
        const l = id ? await amb.ok('lancamento:obter', { id }) : null;
        const parcela = l?.parcelas.find((p) => !p.cancelada && p.saldoCentavos > 0);
        if (!l || !parcela) {
          ok = false;
          break;
        }
        const valor =
          passo.quanto === 'tudo'
            ? parcela.saldoCentavos
            : Math.max(1, Math.floor(parcela.saldoCentavos / 2));
        ok = (
          await amb.chamar('pagamento:registrar', {
            parcelaId: parcela.id,
            requisicaoId: gerarUuidV7(),
            dados: { data: '2026-10-16', valorCentavos: valor, forma: null, observacao: null },
          })
        ).ok;
        break;
      }
      case 'estornar': {
        const id = pick(lancamentos, passo.alvo);
        const l = id ? await amb.ok('lancamento:obter', { id }) : null;
        const g = l?.pagamentos.find((p) => !p.estornado);
        if (!g) {
          ok = false;
          break;
        }
        ok = (await amb.chamar('pagamento:estornar', { id: g.id, motivo: 'Teste de estorno' })).ok;
        break;
      }
      case 'cancelar': {
        const n = pick(negociacoes, passo.alvo);
        if (!n) {
          ok = false;
          break;
        }
        ok = (
          await amb.chamar('negociacao:cancelar', {
            id: n.id,
            motivo: 'Teste de cancelamento',
            destino: { tipo: passo.destino },
          })
        ).ok;
        break;
      }
      case 'morte': {
        const a = pick(ativos, passo.alvo);
        if (!a) {
          ok = false;
          break;
        }
        ok = (
          await amb.chamar('animal:registrarSaida', {
            id: a.id,
            tipo: 'morto',
            data: passo.data,
            motivo: 'Teste',
          })
        ).ok;
        break;
      }
      case 'desfazer': {
        const a = pick(fora, passo.alvo);
        if (!a) {
          ok = false;
          break;
        }
        ok = (
          await amb.chamar('animal:desfazerSaida', {
            id: a.id,
            motivo: 'Teste de reversão',
            destino: { tipo: passo.destino },
          })
        ).ok;
        break;
      }
      case 'custoAnterior': {
        const a = pick(animais, passo.alvo);
        if (!a) {
          ok = false;
          break;
        }
        ok = (
          await amb.chamar('custoAnterior:registrar', {
            requisicaoId: gerarUuidV7(),
            propriedadeId: prop,
            destino: { tipo: 'animal', animalId: a.id },
            valorCentavos: passo.valor,
            dataReferencia: '2026-09-01',
            descricao: 'Custo',
            origemInformacao: 'Caderno',
            justificativa: 'Teste',
            confirmarSemDuplicidade: passo.confirmar,
          })
        ).ok;
        break;
      }
      case 'encerrarLote':
        ok = (await amb.chamar('lote:encerrar', { id: lote.id, data: passo.data })).ok;
        break;
      case 'reabrirLote':
        ok = (await amb.chamar('lote:reabrir', { id: lote.id })).ok;
        break;
      case 'devolver': {
        const det = pick(detalhes, passo.alvo);
        const livres = det ? det.itens.filter((i) => !i.cancelado && !i.devolucao) : [];
        const escolhidos = passo.parcial ? livres.slice(0, 1) : livres;
        if (!det || escolhidos.length === 0) {
          ok = false;
          break;
        }
        const itens = escolhidos.map((i) => ({
          negociacaoItemId: i.id,
          valorCentavos:
            passo.valor === 'original'
              ? Math.max(1, i.valorAlocadoCentavos)
              : passo.valor === 'menor'
                ? Math.max(1, i.valorAlocadoCentavos - 1)
                : i.valorAlocadoCentavos + 7,
        }));
        const base = {
          negociacaoId: det.id,
          data: passo.data,
          itens,
          loteRetornoId: passo.lote ? lote.id : null,
        };
        const previa = await amb.chamar('devolucao:prever', base);
        const restante = previa.ok ? previa.dados.restanteCentavos : 0;
        const condicaoRestante =
          passo.restante === 'nao_informada'
            ? ({ tipo: 'nao_informada' } as const)
            : passo.restante === 'pago'
              ? ({
                  tipo: 'a_vista',
                  vencimento: passo.data,
                  pagamento: { data: passo.data, forma: null },
                } as const)
              : passo.restante === 'parcelado' && restante >= 2
                ? {
                    tipo: 'parcelado' as const,
                    parcelas: [
                      { vencimento: '2026-11-10', valorCentavos: 1 },
                      { vencimento: '2026-12-10', valorCentavos: restante - 1 },
                    ],
                  }
                : ({ tipo: 'a_vista', vencimento: '2026-10-30', pagamento: null } as const);
        const r = await amb.chamar('devolucao:registrar', {
          requisicaoId: gerarUuidV7(),
          ...base,
          condicaoRestante,
          observacoes: null,
        });
        if (!previa.ok) expect(r.ok).toBe(false);
        ok = r.ok;
        break;
      }
      case 'cancelarDevolucao': {
        const d = pick(devolucoesAtivas, passo.alvo);
        if (!d) {
          ok = false;
          break;
        }
        ok = (await amb.chamar('devolucao:cancelar', { id: d.id, motivo: 'Teste' })).ok;
        break;
      }
    }
    if (ok) somar(est.sucesso, passo.op);
    else {
      somar(est.falha, passo.op);
      if (contagens(amb) !== antes) return `${rotulo}: operação recusada deixou rastro`;
    }
    const violacoes = conferirInvariantes(amb);
    if (violacoes.length) return `${rotulo}: ${violacoes.join('; ')}`;
  }
  const caixa = [
    ...(await conferirCaixa(amb)),
    ...(await conferirResultado(amb, prop, '2026-10-16')),
  ];
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

describe('sequências de operações com animais e invariantes (D-K)', () => {
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

  it('guarda de abrangência: compras, vendas, cancelamentos e reversões acontecem de verdade e há recusas', () => {
    for (const op of [
      'comprar',
      'vender',
      'cancelar',
      'desfazer',
      'receber',
      'devolver',
      'cancelarDevolucao',
    ])
      expect(geral.sucesso.get(op) ?? 0, `sucessos de ${op}`).toBeGreaterThan(0);
    for (const op of ['comprar', 'vender', 'cancelar', 'devolver'])
      expect(geral.falha.get(op) ?? 0, `recusas de ${op}`).toBeGreaterThan(0);
  });
});
