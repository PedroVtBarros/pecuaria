import { describe, expect, it } from 'vitest';
import {
  SEMENTES_PADRAO,
  criarGeradorDeterministico,
  dividirProporcional,
  gerarParcelas,
  gerarUuidV7,
  type GeradorDeterministico,
} from '@pecuaria/domain';
import type { LancamentoDetalhe } from '@pecuaria/shared-types';
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

/**
 * Sequências de operações financeiras (D-K). O gerador é determinístico: a mesma semente
 * produz a mesma sequência. Os passos são dados puros, resolvidos contra o estado atual na hora
 * de executar, o que permite reproduzir e reduzir uma falha removendo passos.
 *
 * Após cada passo valem os invariantes de conservação: soma das parcelas igual ao total, pagamento
 * nunca acima do saldo, valor da operação = pago + a pagar/receber, nada pago em lançamento
 * cancelado, nada criado sem ação do usuário. Operação recusada não deixa nenhum rastro.
 */
type Passo =
  | {
      op: 'criar';
      condicao: 'a_vista' | 'a_vista_pago' | 'parcelado' | 'nao_informada';
      natureza: 'despesa' | 'receita';
      total: number;
      parcelas: number;
      inicio: string;
      repetir: boolean;
    }
  | {
      op: 'pagar';
      alvo: number;
      parcela: number;
      quanto: 'tudo' | 'metade' | 'um' | 'excesso';
      data: 'ontem' | 'hoje' | 'futuro';
    }
  | { op: 'estornar'; alvo: number; pagamento: number }
  | { op: 'renegociar'; alvo: number; partes: number; ajuste: number | null; somaErrada: boolean }
  | { op: 'cancelar'; alvo: number }
  | { op: 'definir'; alvo: number; condicao: 'a_vista' | 'parcelado' }
  | { op: 'editar'; alvo: number; classificacao: 'fixo' | 'variavel' | 'nao_classificado' };

const INICIOS = ['2026-08-10', '2026-09-30', '2026-10-16', '2026-10-17', '2026-12-31'];
const TOTAIS_DE_BORDA = [1, 2, 3, 99, 100, 101, 1000, 33333, 100000, 1_000_000, 999_999_999];

function gerarPasso(g: GeradorDeterministico): Passo {
  const x = g.inteiro(0, 99);
  if (x < 24)
    return {
      op: 'criar',
      condicao: g.escolher([
        'a_vista',
        'a_vista_pago',
        'parcelado',
        'parcelado',
        'nao_informada',
      ] as const),
      natureza: g.booleano(0.8) ? 'despesa' : 'receita',
      total: g.booleano(0.4) ? g.escolher(TOTAIS_DE_BORDA) : g.inteiro(1, 2_000_000),
      parcelas: g.inteiro(2, 7),
      inicio: g.escolher(INICIOS),
      repetir: g.booleano(0.15),
    };
  if (x < 52)
    return {
      op: 'pagar',
      alvo: g.inteiro(0, 50),
      parcela: g.inteiro(0, 6),
      quanto: g.escolher(['tudo', 'metade', 'um', 'excesso', 'tudo', 'metade'] as const),
      data: g.escolher(['ontem', 'hoje', 'hoje', 'futuro'] as const),
    };
  if (x < 64) return { op: 'estornar', alvo: g.inteiro(0, 50), pagamento: g.inteiro(0, 6) };
  if (x < 78)
    return {
      op: 'renegociar',
      alvo: g.inteiro(0, 50),
      partes: g.inteiro(0, 4),
      ajuste: g.booleano(0.3) ? g.inteiro(-50_000, 50_000) : null,
      somaErrada: g.booleano(0.2),
    };
  if (x < 86) return { op: 'cancelar', alvo: g.inteiro(0, 50) };
  if (x < 94)
    return {
      op: 'definir',
      alvo: g.inteiro(0, 50),
      condicao: g.escolher(['a_vista', 'parcelado'] as const),
    };
  return {
    op: 'editar',
    alvo: g.inteiro(0, 50),
    classificacao: g.escolher(['fixo', 'variavel', 'nao_classificado'] as const),
  };
}

interface Estatistica {
  sucesso: Map<string, number>;
  falha: Map<string, number>;
  situacoes: Set<string>;
}
const novaEstatistica = (): Estatistica => ({
  sucesso: new Map(),
  falha: new Map(),
  situacoes: new Set(),
});
const somar = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

function contagens(amb: AmbienteIpc) {
  return [
    'lancamento_financeiro',
    'parcela_financeira',
    'pagamento_financeiro',
    'historico_alteracao',
  ].map((t) => contar(amb, t));
}

/** Executa os passos; devolve a descrição da primeira violação ou null. */
async function executar(
  amb: AmbienteIpc,
  passos: readonly Passo[],
  estatistica: Estatistica,
): Promise<string | null> {
  const prop = (await criarPropriedade(amb, `Seq ${gerarUuidV7()}`)).id;
  const despesa = (await categoriaPorNome(amb, 'Outras despesas')).id;
  const receita = (await categoriaPorNome(amb, 'Outras receitas')).id;
  const criados: string[] = [];
  const pegar = (indice: number) => (criados.length ? criados[indice % criados.length]! : null);
  const obter = (id: string) => amb.ok('lancamento:obter', { id });

  for (const [n, passo] of passos.entries()) {
    const rotulo = `passo ${n} ${JSON.stringify(passo)}`;
    const antesContagens = contagens(amb);
    let antes: LancamentoDetalhe | null = null;
    let resultado: { ok: boolean };
    let esperado: (depois: LancamentoDetalhe) => string | null = () => null;
    let tocado: string | null = null;

    switch (passo.op) {
      case 'criar': {
        const total = passo.total;
        const base = dadosDeLancamento(prop, passo.natureza === 'despesa' ? despesa : receita, {
          valorTotalCentavos: total,
          dataCompetencia: '2026-10-01',
          descricao: `Lançamento ${n}`,
        });
        let condicao;
        if (passo.condicao === 'nao_informada') condicao = { tipo: 'nao_informada' as const };
        else if (passo.condicao === 'parcelado') {
          const q = Math.min(passo.parcelas, total);
          condicao =
            q >= 2
              ? {
                  tipo: 'parcelado' as const,
                  parcelas: gerarParcelas({
                    totalCentavos: total,
                    quantidade: q,
                    primeiroVencimento: passo.inicio,
                    regra: { tipo: 'mensal' },
                  }),
                }
              : { tipo: 'a_vista' as const, vencimento: passo.inicio, pagamento: null };
        } else
          condicao = {
            tipo: 'a_vista' as const,
            vencimento: passo.inicio,
            pagamento:
              passo.condicao === 'a_vista_pago' ? { data: '2026-10-15', forma: null } : null,
          };
        const dados = { ...base, condicao };
        const requisicaoId = gerarUuidV7();
        const r = await amb.chamar('lancamento:criar', { requisicaoId, dados });
        resultado = r;
        if (!r.ok) return `${rotulo}: criação válida foi recusada (${r.erro.mensagem})`;
        if (r.ok) {
          criados.push(r.dados.id);
          tocado = r.dados.id;
          if (r.dados.valorOperacaoCentavos !== total)
            return `${rotulo}: valor da operação diferente do informado`;
          if (condicao.tipo === 'nao_informada') {
            if (
              r.dados.saldoEmAbertoCentavos !== null ||
              r.dados.parcelas.length !== 0 ||
              r.dados.situacao !== 'pendente_definicao'
            )
              return `${rotulo}: pendente de definição mal representado`;
          } else if (condicao.tipo === 'a_vista' && condicao.pagamento) {
            if (r.dados.situacao !== 'quitado' || r.dados.pagoCentavos !== total)
              return `${rotulo}: à vista pago não ficou quitado`;
          } else if (r.dados.pagoCentavos !== 0 || r.dados.saldoEmAbertoCentavos !== total)
            return `${rotulo}: lançamento sem pagamento informado apareceu pago`;
          if (passo.repetir) {
            const antesRepeticao = contagens(amb);
            const r2 = await amb.chamar('lancamento:criar', { requisicaoId, dados });
            if (!r2.ok || r2.dados.id !== r.dados.id)
              return `${rotulo}: repetição não devolveu o mesmo lançamento`;
            if (contagens(amb).join() !== antesRepeticao.join())
              return `${rotulo}: repetição criou registros`;
          }
        }
        break;
      }
      case 'pagar': {
        const id = pegar(passo.alvo);
        if (!id) continue;
        antes = await obter(id);
        const parcelas = antes.parcelas.filter((p) => !p.cancelada);
        const parcela = parcelas.length ? parcelas[passo.parcela % parcelas.length]! : null;
        if (!parcela) {
          // Sem parcela (pendente de definição): não existe onde pagar. Nada a executar.
          estatistica.situacoes.add(antes.situacao);
          continue;
        }
        const saldo = parcela.saldoCentavos;
        const valor =
          passo.quanto === 'tudo'
            ? saldo
            : passo.quanto === 'metade'
              ? Math.max(1, Math.floor(saldo / 2))
              : passo.quanto === 'um'
                ? 1
                : saldo + 1;
        const data =
          passo.data === 'ontem'
            ? '2026-10-15'
            : passo.data === 'hoje'
              ? '2026-10-16'
              : '2026-10-17';
        const valorPedido = Math.max(1, valor);
        const r = await amb.chamar('pagamento:registrar', {
          parcelaId: parcela.id,
          requisicaoId: gerarUuidV7(),
          dados: { data, valorCentavos: valorPedido, forma: null, observacao: null },
        });
        resultado = r;
        tocado = id;
        const pagoAntes = antes.pagoCentavos;
        esperado = (d) =>
          d.pagoCentavos === pagoAntes + valorPedido
            ? null
            : `pago ${d.pagoCentavos} em vez de ${pagoAntes + valorPedido}`;
        if (r.ok && (data === '2026-10-17' || valorPedido > saldo))
          return `${rotulo}: pagamento inválido foi aceito`;
        if (!r.ok && data !== '2026-10-17' && valorPedido <= saldo && !antes.cancelado)
          return `${rotulo}: pagamento válido foi recusado (${r.erro.mensagem})`;
        break;
      }
      case 'estornar': {
        const id = pegar(passo.alvo);
        if (!id) continue;
        antes = await obter(id);
        const ativos = antes.pagamentos.filter((g) => !g.estornado);
        const alvoPag = ativos.length ? ativos[passo.pagamento % ativos.length]! : null;
        if (!alvoPag) continue;
        const r = await amb.chamar('pagamento:estornar', {
          id: alvoPag.id,
          motivo: 'Estorno de teste',
        });
        resultado = r;
        tocado = id;
        const pagoAntes = antes.pagoCentavos;
        esperado = (d) =>
          d.pagoCentavos === pagoAntes - alvoPag.valorCentavos
            ? null
            : `pago ${d.pagoCentavos} após estorno`;
        if (!r.ok) return `${rotulo}: estorno válido foi recusado (${r.erro.mensagem})`;
        break;
      }
      case 'renegociar': {
        const id = pegar(passo.alvo);
        if (!id) continue;
        antes = await obter(id);
        const alvoTotal = antes.valorOperacaoCentavos + (passo.ajuste ?? 0);
        const aParcelar = alvoTotal - antes.pagoCentavos;
        let novas: { vencimento: string; valorCentavos: number }[] = [];
        if (aParcelar > 0) {
          const partes = Math.max(1, Math.min(passo.partes || 1, aParcelar));
          const valores = dividirProporcional(
            aParcelar,
            Array.from({ length: partes }, (_, i) => ({ id: `p${i}`, peso: 1 })),
          ).map((p) => p.valorCentavos);
          novas = valores.map((valorCentavos, i) => ({
            vencimento: `2027-0${i + 1}-10`,
            valorCentavos,
          }));
          if (passo.somaErrada) novas[0]!.valorCentavos += 1;
        }
        const r = await amb.chamar('lancamento:renegociar', {
          id,
          novasParcelas: novas,
          novoTotalCentavos: passo.ajuste === null ? null : Math.max(1, alvoTotal),
          motivo: 'Renegociação de teste',
        });
        resultado = r;
        tocado = id;
        const pagoAntes = antes.pagoCentavos;
        const idsPagamentos = antes.pagamentos.map((g) => g.id).join();
        esperado = (d) =>
          d.pagoCentavos !== pagoAntes
            ? 'renegociação alterou o valor pago'
            : d.pagamentos.map((g) => g.id).join() !== idsPagamentos
              ? 'renegociação alterou os pagamentos'
              : d.valorOperacaoCentavos !== Math.max(1, alvoTotal)
                ? 'total renegociado incorreto'
                : null;
        if (r.ok && passo.somaErrada && aParcelar > 0) return `${rotulo}: soma errada foi aceita`;
        break;
      }
      case 'cancelar': {
        const id = pegar(passo.alvo);
        if (!id) continue;
        antes = await obter(id);
        const r = await amb.chamar('lancamento:cancelar', { id, motivo: 'Cancelamento de teste' });
        resultado = r;
        tocado = id;
        const temPagamento = antes.pagamentos.some((g) => !g.estornado);
        esperado = (d) => (d.situacao === 'cancelado' ? null : 'não ficou cancelado');
        if (r.ok && (temPagamento || antes.cancelado))
          return `${rotulo}: cancelamento indevido foi aceito`;
        if (!r.ok && !temPagamento && !antes.cancelado)
          return `${rotulo}: cancelamento válido foi recusado`;
        break;
      }
      case 'definir': {
        const id = pegar(passo.alvo);
        if (!id) continue;
        antes = await obter(id);
        const total = antes.valorOperacaoCentavos;
        const condicao =
          passo.condicao === 'a_vista' || total < 2
            ? { tipo: 'a_vista' as const, vencimento: '2026-10-25', pagamento: null }
            : {
                tipo: 'parcelado' as const,
                parcelas: gerarParcelas({
                  totalCentavos: total,
                  quantidade: 2,
                  primeiroVencimento: '2026-11-05',
                  regra: { tipo: 'mensal' },
                }),
              };
        const r = await amb.chamar('lancamento:definirPagamento', { id, condicao });
        resultado = r;
        tocado = id;
        const devia = antes.condicaoPagamento === 'nao_informada' && !antes.cancelado;
        if (r.ok !== devia)
          return `${rotulo}: definição ${r.ok ? 'aceita' : 'recusada'} indevidamente`;
        esperado = (d) =>
          d.pagoCentavos === 0 && d.saldoEmAbertoCentavos === total
            ? null
            : 'definição criou pagamento';
        break;
      }
      case 'editar': {
        const id = pegar(passo.alvo);
        if (!id) continue;
        antes = await obter(id);
        const r = await amb.chamar('lancamento:atualizar', {
          id,
          dados: {
            categoriaId: antes.categoria.id,
            pessoaId: null,
            dataCompetencia: antes.dataCompetencia,
            descricao: antes.descricao,
            documentoNumero: antes.documentoNumero,
            atividade: antes.atividade,
            destino: { tipo: 'propriedade' },
            quantidade: null,
            comportamentoCusto: antes.natureza === 'despesa' ? passo.classificacao : null,
            observacoes: antes.observacoes,
          },
          motivo: 'Edição de teste',
        });
        resultado = r;
        tocado = id;
        const resumo = (d: LancamentoDetalhe) =>
          [
            d.valorOperacaoCentavos,
            d.pagoCentavos,
            d.saldoEmAbertoCentavos,
            d.parcelas.length,
          ].join();
        const resumoAntes = resumo(antes);
        esperado = (d) => (resumo(d) === resumoAntes ? null : 'edição mudou valores financeiros');
        break;
      }
    }

    const nome = passo.op;
    if (resultado.ok) {
      somar(estatistica.sucesso, nome);
      if (tocado) {
        const depois = await obter(tocado);
        estatistica.situacoes.add(depois.situacao);
        const problema = esperado(depois);
        if (problema) return `${rotulo}: ${problema}`;
        if (depois.saldoEmAbertoCentavos !== null && depois.saldoEmAbertoCentavos < 0)
          return `${rotulo}: saldo negativo`;
        if (
          depois.saldoEmAbertoCentavos !== null &&
          !depois.cancelado &&
          depois.pagoCentavos + depois.saldoEmAbertoCentavos !== depois.valorOperacaoCentavos
        )
          return `${rotulo}: pago + a pagar diferente do valor da operação`;
      }
    } else {
      somar(estatistica.falha, nome);
      if (passo.op !== 'criar' && antes && tocado) {
        const depois = await obter(tocado);
        try {
          expect(depois).toEqual(antes);
        } catch {
          return `${rotulo}: operação recusada alterou o lançamento`;
        }
      }
      if (contagens(amb).join() !== antesContagens.join())
        return `${rotulo}: operação recusada deixou rastro`;
    }
    const violacoes = conferirInvariantes(amb);
    if (violacoes.length) return `${rotulo}: ${violacoes.join('; ')}`;
  }
  // O caixa é conferido ao fim de cada sequência (cada conferência faz várias consultas).
  const caixa = await conferirCaixa(amb);
  if (caixa.length) return `fim da sequência: ${caixa.join('; ')}`;
  return null;
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
        if ((await executar(amb, tentativa, novaEstatistica())) !== null) {
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
const SEQUENCIAS = Number(ambiente['PECUARIA_SEQUENCIAS'] ?? 100);
const SEMENTES = ambiente['PECUARIA_SEMENTE']
  ? [Number(ambiente['PECUARIA_SEMENTE'])]
  : [...SEMENTES_PADRAO];

describe('sequências de operações financeiras com invariantes (D-K)', () => {
  const estatisticaGeral = novaEstatistica();
  for (const semente of SEMENTES) {
    it(
      `semente ${semente}: ${SEQUENCIAS} sequências de até 30 passos`,
      { timeout: 240_000 },
      async () => {
        const g = criarGeradorDeterministico(semente);
        const amb = await criarAmbienteIpc({ hoje: DATA_DO_RELOGIO });
        try {
          for (let s = 0; s < SEQUENCIAS; s++) {
            const passos = Array.from({ length: g.inteiro(5, 30) }, () => gerarPasso(g));
            const falha = await executar(amb, passos, estatisticaGeral);
            if (falha) {
              amb.encerrar();
              const menor = await reduzir(passos);
              throw new Error(
                `Violação na semente ${semente}, sequência ${s}: ${falha}\nMenor sequência que reproduz (${menor.length} passos): ${JSON.stringify(menor)}`,
              );
            }
          }
        } finally {
          try {
            amb.encerrar();
          } catch {
            /* já encerrado */
          }
        }
      },
    );
  }

  it('guarda de abrangência: as sequências de fato exercitam sucessos, recusas e todas as situações', () => {
    // Roda depois das sementes (mesma suíte, ordem de declaração).
    for (const op of ['criar', 'pagar', 'estornar', 'renegociar', 'cancelar', 'definir', 'editar'])
      expect(estatisticaGeral.sucesso.get(op) ?? 0, `sucessos de ${op}`).toBeGreaterThan(0);
    for (const op of ['pagar', 'renegociar', 'cancelar', 'definir'])
      expect(estatisticaGeral.falha.get(op) ?? 0, `recusas de ${op}`).toBeGreaterThan(0);
    for (const situacao of [
      'pendente_definicao',
      'a_vencer',
      'vencido',
      'parcialmente_pago',
      'quitado',
      'cancelado',
    ])
      expect(estatisticaGeral.situacoes.has(situacao), `situação ${situacao}`).toBe(true);
  });
});
