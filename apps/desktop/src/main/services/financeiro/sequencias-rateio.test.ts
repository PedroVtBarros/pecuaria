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
  dadosDeLancamento,
} from './apoio-teste';
import { dadosDeCompra } from './apoio-animais';
import { conferirApropriacaoDoBanco } from './apoio-rateio';
import { conferirProducao } from './apoio-producao';
import { conferirResultado } from './apoio-resultado';

/**
 * Sequências de operações da apropriação de custos e do rateio (4E): despesas e consumos de
 * estoque (à propriedade, ao lote e ao animal), compra e movimentação de animais, rateio por todos
 * os critérios, revisão, cancelamento, correção e cancelamento de custos já rateados. Após cada
 * passo, a conservação independente: tudo o que foi distribuído (animais, lotes sem animais e
 * "não alocado") fecha com a soma dos custos de origem calculada por SQL; o rateio de cada custo
 * ativo soma exatamente o valor atual dele; a soma da listagem por animal é a do resumo. Operação
 * recusada não deixa rastro. Desde a 4F, as sequências também criam centros de produção, vinculam e
 * desvinculam custos, encerram (gerando a entrada do volumoso, que depois é consumido) e reabrem;
 * a conferência da produção roda a cada passo.
 */
type Criterio = 'cabecas' | 'animal_dias' | 'peso' | 'manual';
type Passo =
  | {
      op: 'despesa';
      destino: 'propriedade' | 'nenhum' | 'lote' | 'animal';
      valor: number;
      data: string;
      alvo: number;
    }
  | {
      op: 'consumir';
      item: number;
      q: number;
      destino: 'propriedade' | 'lote' | 'animal';
      data: string;
      alvo: number;
    }
  | { op: 'comprarAnimais'; lote: number; n: number; data: string; valor: number }
  | { op: 'transferir'; animal: number; lote: number; data: string }
  | { op: 'sairAnimal'; animal: number; data: string }
  | {
      op: 'ratear';
      alvo: number;
      criterio: Criterio;
      base: string;
      pesos: number[];
      escolha: number[];
    }
  | {
      op: 'revisar';
      alvo: number;
      criterio: Criterio;
      base: string;
      pesos: number[];
      escolha: number[];
    }
  | { op: 'cancelarRateio'; alvo: number }
  | { op: 'cancelarDespesa'; alvo: number }
  | { op: 'cancelarConsumo'; alvo: number }
  | { op: 'corrigirConsumo'; alvo: number; q: number }
  | { op: 'criarCentro' }
  | { op: 'vincular'; centro: number; tipo: 'lancamento' | 'consumo'; alvo: number }
  | { op: 'desvincular'; centro: number; alvo: number }
  | { op: 'encerrar'; centro: number; q: number; data: string }
  | { op: 'reabrir'; centro: number };

const DATAS = ['2026-09-20', '2026-10-01', '2026-10-05', '2026-10-10', '2026-10-16'];
const CRITERIOS: Criterio[] = ['cabecas', 'animal_dias', 'peso', 'manual', 'cabecas', 'manual'];

function passoDeProducao(g: GeradorDeterministico): Passo {
  const y = g.inteiro(0, 99);
  if (y < 5) return { op: 'criarCentro' };
  if (y < 55)
    return {
      op: 'vincular',
      centro: g.booleano(0.7) ? 0 : g.inteiro(0, 30),
      tipo: g.escolher(['lancamento', 'consumo'] as const),
      alvo: g.inteiro(0, 30),
    };
  if (y < 65)
    return {
      op: 'desvincular',
      centro: g.booleano(0.7) ? 0 : g.inteiro(0, 30),
      alvo: g.inteiro(0, 30),
    };
  if (y < 87)
    return {
      op: 'encerrar',
      centro: g.booleano(0.7) ? 0 : g.inteiro(0, 30),
      q: g.inteiro(1, 5000),
      data: g.escolher(DATAS),
    };
  return { op: 'reabrir', centro: g.booleano(0.7) ? 0 : g.inteiro(0, 30) };
}

function gerarPasso(g: GeradorDeterministico): Passo {
  if (g.booleano(0.3)) return passoDeProducao(g);
  const x = g.inteiro(0, 99);
  const rateio = () => ({
    alvo: g.inteiro(0, 30),
    criterio: g.escolher(CRITERIOS),
    base: g.escolher(DATAS),
    pesos: Array.from({ length: 3 }, () => g.inteiro(1, 1000)),
    escolha: Array.from({ length: 3 }, () => g.inteiro(0, 30)),
  });
  if (x < 18)
    return {
      op: 'despesa',
      destino: g.escolher(['propriedade', 'propriedade', 'nenhum', 'lote', 'animal'] as const),
      valor: g.booleano(0.15) ? g.escolher([1, 2, 3, 99]) : g.inteiro(1, 500000),
      data: g.escolher(DATAS),
      alvo: g.inteiro(0, 30),
    };
  if (x < 32)
    return {
      op: 'consumir',
      item: g.inteiro(0, 2),
      q: g.inteiro(1, 300),
      destino: g.escolher(['propriedade', 'propriedade', 'lote', 'animal'] as const),
      data: g.escolher(DATAS),
      alvo: g.inteiro(0, 30),
    };
  if (x < 42)
    return {
      op: 'comprarAnimais',
      lote: g.inteiro(0, 1),
      n: g.inteiro(1, 3),
      data: g.escolher(DATAS),
      valor: g.inteiro(1, 3000000),
    };
  if (x < 50)
    return {
      op: 'transferir',
      animal: g.inteiro(0, 30),
      lote: g.inteiro(0, 1),
      data: g.escolher(DATAS),
    };
  if (x < 53) return { op: 'sairAnimal', animal: g.inteiro(0, 30), data: g.escolher(DATAS) };
  if (x < 74) return { op: 'ratear', ...rateio() };
  if (x < 83) return { op: 'revisar', ...rateio() };
  if (x < 88) return { op: 'cancelarRateio', alvo: g.inteiro(0, 30) };
  if (x < 93) return { op: 'cancelarDespesa', alvo: g.inteiro(0, 30) };
  if (x < 96) return { op: 'cancelarConsumo', alvo: g.inteiro(0, 30) };
  return { op: 'corrigirConsumo', alvo: g.inteiro(0, 30), q: g.inteiro(1, 300) };
}

interface Estatistica {
  sucesso: Map<string, number>;
  falha: Map<string, number>;
}
const nova = (): Estatistica => ({ sucesso: new Map(), falha: new Map() });
const somar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const TABELAS = [
  'lancamento_financeiro',
  'movimentacao_estoque',
  'rateio_custo',
  'rateio_custo_item',
  'animal',
  'movimentacao_animal',
  'negociacao_animal',
  'historico_alteracao',
  'centro_producao',
  'centro_producao_consumo',
  'centro_producao_lancamento',
];
const contagens = (amb: AmbienteIpc) => TABELAS.map((t) => contar(amb, t)).join();

/** Rateio de cada custo ativo soma o valor atual dele; listagem por animal fecha com o resumo. */
async function conferirRateios(amb: AmbienteIpc, prop: string): Promise<string[]> {
  const erros: string[] = [];
  const ativos = await amb.ok('rateio:listar', { propriedadeId: prop, incluirCancelados: false });
  for (const r of ativos) {
    const d = await amb.ok('rateio:obter', { id: r.id });
    if (d.origemCancelada) continue;
    if (d.origem.valorCentavos !== null && d.somaCentavos !== d.origem.valorCentavos)
      erros.push(`${r.id}: rateio soma ${d.somaCentavos} e o custo vale ${d.origem.valorCentavos}`);
    if (d.origem.valorCentavos === null && d.somaCentavos !== null)
      erros.push(`${r.id}: custo desconhecido virou valor`);
  }
  const resumo = await amb.ok('custo:resumo', { propriedadeId: prop });
  let soma = 0;
  for (let pagina = 1; ; pagina++) {
    const p = await amb.ok('custo:animais', { propriedadeId: prop, pagina, tamanhoPagina: 200 });
    soma += p.itens.reduce((s, a) => s + a.apuracao.valorConhecidoCentavos, 0);
    if (pagina * 200 >= p.total) break;
  }
  if (soma !== resumo.animais.apuracao.valorConhecidoCentavos)
    erros.push(
      `listagem por animal ${soma} diferente do resumo ${resumo.animais.apuracao.valorConhecidoCentavos}`,
    );
  return erros;
}

interface Consumo {
  id: string;
  item: number;
  destino: 'propriedade' | 'lote' | 'animal';
  loteId: string | null;
  animalId: string | null;
  data: string;
  ativo: boolean;
}

async function executar(
  amb: AmbienteIpc,
  passos: readonly Passo[],
  est: Estatistica,
): Promise<string | null> {
  const prop = (await criarPropriedade(amb, `Fazenda ${gerarUuidV7()}`)).id;
  const categoria = (await categoriaPorNome(amb, 'Alimentação (despesa direta, sem estoque)')).id;
  const lotes: string[] = [];
  for (const nome of ['L0', 'L1'])
    lotes.push(
      (
        await amb.ok('lote:criar', {
          propriedadeId: prop,
          dados: {
            nome,
            finalidade: 'engorda',
            dataFormacao: '2026-09-01',
            areaId: null,
            observacoes: null,
          },
        })
      ).id,
    );
  // Item 0 com custo conhecido; item 1 com custo da produção ainda desconhecido.
  const itens: string[] = [];
  for (const [k, nome] of ['Ração', 'Feno'].entries()) {
    const id = (
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
    ).id;
    itens.push(id);
    await amb.ok('estoque:registrar', {
      itemId: id,
      requisicaoId: gerarUuidV7(),
      dados: {
        data: '2026-09-01',
        tipo: k === 0 ? 'entrada_compra' : 'entrada_producao',
        quantidade: 100000,
        unidadeBase: 'kg',
        loteEstoqueId: null,
        custoEntradaCentavos: k === 0 ? 10000000 : null,
        destino: null,
        loteAnimalId: null,
        animalId: null,
        documentoOrigemId: null,
        motivo: null,
        observacao: null,
      },
    });
  }
  // Item 2: volumoso produzido pelos centros (sem entrada inicial).
  itens.push(
    (
      await amb.ok('estoque:criarItem', {
        propriedadeId: prop,
        dados: {
          nome: 'Silagem',
          tipo: 'silagem',
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
  const centros: string[] = [];
  // Um centro já aberto desde o início, para os vínculos terem onde cair.
  centros.push(
    (
      await amb.ok('producao:criar', {
        requisicaoId: gerarUuidV7(),
        propriedadeId: prop,
        dados: {
          nome: 'Centro inicial',
          tipo: 'volumoso',
          areaId: null,
          dataInicio: '2026-09-01',
          estoqueItemId: itens[2]!,
          observacoes: null,
        },
      })
    ).id,
  );
  const animais: string[] = [];
  const despesas: { id: string; ativa: boolean }[] = [];
  const consumos: Consumo[] = [];
  let contador = 0;
  const pick = <T>(lista: T[], alvo: number): T | undefined =>
    lista.length ? lista[alvo % lista.length] : undefined;

  for (const [i, passo] of passos.entries()) {
    const rotulo = `passo ${i + 1} (${passo.op})`;
    const antes = contagens(amb);
    let ok: boolean;
    switch (passo.op) {
      case 'despesa': {
        const dest =
          passo.destino === 'lote'
            ? ({ tipo: 'lote', loteId: pick(lotes, passo.alvo)! } as const)
            : passo.destino === 'animal'
              ? animais.length
                ? ({ tipo: 'animal', animalId: pick(animais, passo.alvo)! } as const)
                : ({ tipo: 'animal', animalId: gerarUuidV7() } as const)
              : ({ tipo: passo.destino } as const);
        const r = await amb.chamar('lancamento:criar', {
          requisicaoId: gerarUuidV7(),
          dados: dadosDeLancamento(prop, categoria, {
            valorTotalCentavos: passo.valor,
            dataCompetencia: passo.data,
            destino: dest,
            descricao: `Despesa ${(contador += 1)}`,
          }),
        });
        ok = r.ok;
        if (r.ok) despesas.push({ id: r.dados.id, ativa: true });
        break;
      }
      case 'consumir': {
        const loteId = passo.destino === 'lote' ? pick(lotes, passo.alvo)! : null;
        const animalId =
          passo.destino === 'animal' ? (pick(animais, passo.alvo) ?? gerarUuidV7()) : null;
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
            loteAnimalId: loteId,
            animalId,
            documentoOrigemId: null,
            motivo: null,
            observacao: null,
          },
        });
        ok = r.ok;
        if (r.ok)
          consumos.push({
            id: r.dados.id,
            item: passo.item,
            destino: passo.destino,
            loteId,
            animalId,
            data: passo.data,
            ativo: true,
          });
        break;
      }
      case 'comprarAnimais': {
        const ids = Array.from({ length: passo.n }, () => `A${(contador += 1)}`);
        const r = await amb.chamar(
          'negociacao:registrarCompra',
          dadosDeCompra(
            prop,
            ids.map((identificacao) => ({ identificacao })),
            {
              loteId: lotes[passo.lote]!,
              data: passo.data,
              valorTotalCentavos: passo.valor,
            },
          ),
        );
        ok = r.ok;
        if (r.ok) for (const it of r.dados.itens) animais.push(it.animalId);
        break;
      }
      case 'transferir': {
        const a = pick(animais, passo.animal);
        ok = a
          ? (
              await amb.chamar('animal:transferir', {
                animalIds: [a],
                loteDestinoId: lotes[passo.lote]!,
                data: passo.data,
                motivo: null,
              })
            ).ok
          : false;
        break;
      }
      case 'sairAnimal': {
        const a = pick(animais, passo.animal);
        ok = a
          ? (
              await amb.chamar('animal:registrarSaida', {
                id: a,
                tipo: 'morto',
                data: passo.data,
                motivo: null,
              })
            ).ok
          : false;
        break;
      }
      case 'ratear':
      case 'revisar': {
        const montarManual = () => {
          const alvos = [
            ...lotes.map((id) => ({ tipo: 'lote' as const, id })),
            ...animais.map((id) => ({ tipo: 'animal' as const, id })),
          ];
          const vistos = new Set<string>();
          const manual: { tipo: 'lote' | 'animal'; id: string; peso: number }[] = [];
          passo.escolha.forEach((e, k) => {
            const a = alvos[e % alvos.length]!;
            if (vistos.has(a.id)) return;
            vistos.add(a.id);
            manual.push({ ...a, peso: passo.pesos[k]! });
          });
          return manual;
        };
        const comum = {
          criterio: passo.criterio,
          dataBase: passo.base,
          periodoInicio: passo.criterio === 'animal_dias' ? '2026-09-20' : null,
          periodoFim: passo.criterio === 'animal_dias' ? passo.base : null,
          idadeMaximaPesagemDias: passo.criterio === 'peso' ? 30 : null,
          manual: passo.criterio === 'manual' ? montarManual() : [],
          motivo: 'Teste de rateio',
        };
        if (passo.op === 'ratear') {
          const pend = (await amb.ok('rateio:pendentes', { propriedadeId: prop })).itens;
          const c = pick(pend, passo.alvo);
          ok = c
            ? (
                await amb.chamar('rateio:criar', {
                  requisicaoId: gerarUuidV7(),
                  propriedadeId: prop,
                  origemTipo: c.origemTipo,
                  origemId: c.origemId,
                  ...comum,
                })
              ).ok
            : false;
        } else {
          const ativos = await amb.ok('rateio:listar', {
            propriedadeId: prop,
            incluirCancelados: false,
          });
          const r = pick(ativos, passo.alvo);
          ok = r
            ? (
                await amb.chamar('rateio:revisar', {
                  id: r.id,
                  requisicaoId: gerarUuidV7(),
                  ...comum,
                })
              ).ok
            : false;
        }
        break;
      }
      case 'cancelarRateio': {
        const ativos = await amb.ok('rateio:listar', {
          propriedadeId: prop,
          incluirCancelados: false,
        });
        const r = pick(ativos, passo.alvo);
        ok = r ? (await amb.chamar('rateio:cancelar', { id: r.id, motivo: 'Teste' })).ok : false;
        break;
      }
      case 'cancelarDespesa': {
        const d = pick(despesas, passo.alvo);
        ok = d
          ? (await amb.chamar('lancamento:cancelar', { id: d.id, motivo: 'Teste' })).ok
          : false;
        if (ok && d) d.ativa = false;
        break;
      }
      case 'cancelarConsumo': {
        const c = pick(consumos, passo.alvo);
        ok = c ? (await amb.chamar('estoque:cancelar', { id: c.id, motivo: 'Teste' })).ok : false;
        if (ok && c) c.ativo = false;
        break;
      }
      case 'corrigirConsumo': {
        const c = pick(consumos, passo.alvo);
        if (!c) {
          ok = false;
          break;
        }
        const r = await amb.chamar('estoque:corrigir', {
          id: c.id,
          requisicaoId: gerarUuidV7(),
          dados: {
            data: c.data,
            tipo: 'saida_consumo',
            quantidade: passo.q,
            unidadeBase: 'kg',
            loteEstoqueId: null,
            custoEntradaCentavos: null,
            destino: c.destino,
            loteAnimalId: c.loteId,
            animalId: c.animalId,
            documentoOrigemId: null,
            motivo: null,
            observacao: null,
          },
          motivo: 'Teste de correção',
        });
        ok = r.ok;
        if (r.ok) c.id = r.dados.id;
        break;
      }
      case 'criarCentro': {
        const r = await amb.chamar('producao:criar', {
          requisicaoId: gerarUuidV7(),
          propriedadeId: prop,
          dados: {
            nome: `Centro ${(contador += 1)}`,
            tipo: 'volumoso',
            areaId: null,
            dataInicio: '2026-09-01',
            estoqueItemId: itens[2]!,
            observacoes: null,
          },
        });
        ok = r.ok;
        if (r.ok) centros.push(r.dados.id);
        break;
      }
      case 'vincular': {
        const c = pick(centros, passo.centro);
        const cand = c ? await amb.chamar('producao:candidatos', { id: c }) : null;
        if (!c || !cand?.ok) {
          ok = false;
          break;
        }
        const origemId =
          passo.tipo === 'lancamento'
            ? pick(cand.dados.despesas, passo.alvo)?.id
            : pick(cand.dados.consumos, passo.alvo)?.movimentacaoId;
        ok = origemId
          ? (await amb.chamar('producao:vincular', { id: c, tipo: passo.tipo, origemId })).ok
          : false;
        break;
      }
      case 'desvincular': {
        const c = pick(centros, passo.centro);
        const d = c ? await amb.ok('producao:obter', { id: c }) : null;
        const vinculos = d
          ? [
              ...d.despesas.map((x) => ({ tipo: 'lancamento' as const, id: x.id })),
              ...d.consumos.map((x) => ({ tipo: 'consumo' as const, id: x.movimentacaoId })),
            ]
          : [];
        const v = pick(vinculos, passo.alvo);
        ok =
          c && v
            ? (await amb.chamar('producao:desvincular', { id: c, tipo: v.tipo, origemId: v.id })).ok
            : false;
        break;
      }
      case 'encerrar': {
        const c = pick(centros, passo.centro);
        ok = c
          ? (
              await amb.chamar('producao:encerrar', {
                id: c,
                requisicaoId: gerarUuidV7(),
                dataFim: passo.data,
                quantidade: passo.q,
                loteEstoqueId: null,
                observacao: null,
              })
            ).ok
          : false;
        break;
      }
      case 'reabrir': {
        const c = pick(centros, passo.centro);
        ok = c ? (await amb.chamar('producao:reabrir', { id: c, motivo: 'Teste' })).ok : false;
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
      ...conferirProducao(amb),
      ...(await conferirApropriacaoDoBanco(amb)),
      ...(await conferirRateios(amb, prop)),
    ];
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
const SEQUENCIAS = Number(ambiente['PECUARIA_SEQUENCIAS'] ?? 20);
const SEMENTES = ambiente['PECUARIA_SEMENTE']
  ? [Number(ambiente['PECUARIA_SEMENTE'])]
  : [...SEMENTES_PADRAO];

describe('sequências de apropriação e rateio de custos e invariante de conservação (4E)', () => {
  const geral = nova();
  for (const semente of SEMENTES) {
    it(
      `semente ${semente}: ${SEQUENCIAS} sequências de até 30 passos`,
      { timeout: 600_000 },
      async () => {
        const g = criarGeradorDeterministico(semente);
        for (let s = 0; s < SEQUENCIAS; s++) {
          const passos = Array.from({ length: g.inteiro(8, 30) }, () => gerarPasso(g));
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

  it('guarda de abrangência: despesas, consumos, compras, rateios, revisões e cancelamentos acontecem de verdade, e há recusas', () => {
    console.warn(
      `[sequências rateio] sucessos ${JSON.stringify(Object.fromEntries(geral.sucesso))} recusas ${JSON.stringify(Object.fromEntries(geral.falha))}`,
    );
    for (const op of [
      'despesa',
      'consumir',
      'comprarAnimais',
      'transferir',
      'ratear',
      'revisar',
      'cancelarRateio',
      'cancelarDespesa',
      'cancelarConsumo',
      'corrigirConsumo',
      'criarCentro',
      'vincular',
      'desvincular',
      'encerrar',
      'reabrir',
    ])
      expect(geral.sucesso.get(op) ?? 0, `sucessos de ${op}`).toBeGreaterThan(0);
    for (const op of ['despesa', 'consumir', 'transferir', 'ratear', 'encerrar', 'reabrir'])
      expect(geral.falha.get(op) ?? 0, `recusas de ${op}`).toBeGreaterThan(0);
  });
});
