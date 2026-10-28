import { describe, expect, it } from 'vitest';
import {
  CENTAVOS_MAXIMO,
  SEMENTES_PADRAO,
  apurarComponentes,
  criarGeradorDeterministico,
  dividirIgual,
  dividirProporcional,
  ehDataIso,
  formatarCentavosSemSimbolo,
  gerarParcelas,
  interpretarCentavos,
  resumirLancamento,
  somarApuracoes,
  somarMeses,
  validarParcelas,
  type ComponenteCusto,
  type GeradorDeterministico,
  type ParteProporcional,
} from '../src';

/**
 * Testes de propriedade com gerador determinístico (D-K): 1.000 casos por propriedade e por
 * semente. Em falha, a mensagem traz a semente e o caso; PECUARIA_SEMENTE repete uma semente.
 * O modo longo (PECUARIA_CASOS_LONGOS) multiplica os casos e não roda no verify padrão.
 */
const ambiente =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const CASOS = Number(ambiente['PECUARIA_CASOS_LONGOS'] ?? 1000);
const SEMENTES = ambiente['PECUARIA_SEMENTE']
  ? [Number(ambiente['PECUARIA_SEMENTE'])]
  : [...SEMENTES_PADRAO];

function porSemente(nome: string, corpo: (g: GeradorDeterministico, caso: number) => void) {
  describe(nome, () => {
    for (const semente of SEMENTES) {
      it(`semente ${semente}`, () => {
        const g = criarGeradorDeterministico(semente);
        for (let caso = 0; caso < CASOS; caso++) {
          try {
            corpo(g, caso);
          } catch (e) {
            throw new Error(`Falha na semente ${semente}, caso ${caso}: ${(e as Error).message}`);
          }
        }
      });
    }
  });
}

/** Classes de borda que o gerador precisa de fato produzir (guarda de abrangência). */
type ClasseTotal = 'um_centavo' | 'zero' | 'pequeno' | 'medio' | 'grande' | 'maximo';
function gerarTotal(g: GeradorDeterministico): { total: number; classe: ClasseTotal } {
  const x = g.inteiro(0, 9);
  if (x === 0) return { total: 0, classe: 'zero' };
  if (x === 1) return { total: 1, classe: 'um_centavo' };
  if (x === 2) return { total: CENTAVOS_MAXIMO, classe: 'maximo' };
  if (x <= 4) return { total: g.inteiro(2, 99), classe: 'pequeno' };
  if (x <= 7) return { total: g.inteiro(100, 10_000_000), classe: 'medio' };
  return { total: g.inteiro(10_000_001, CENTAVOS_MAXIMO), classe: 'grande' };
}
type ClassePesos = 'iguais' | 'desiguais' | 'extremos' | 'unico';
function gerarPartes(g: GeradorDeterministico): {
  partes: ParteProporcional[];
  classe: ClassePesos;
} {
  const x = g.inteiro(0, 9);
  const n = x === 0 ? 1 : g.inteiro(2, 30);
  const ids = Array.from({ length: n }, (_, i) => `id-${String(i).padStart(3, '0')}`);
  let classe: ClassePesos;
  let pesos: number[];
  if (n === 1) {
    classe = 'unico';
    pesos = [g.inteiro(1, 1000)];
  } else if (x <= 3) {
    classe = 'iguais';
    const p = g.inteiro(1, 1000);
    pesos = ids.map(() => p);
  } else if (x <= 6) {
    classe = 'desiguais';
    pesos = ids.map(() => g.inteiro(1, 5000));
  } else {
    classe = 'extremos';
    pesos = ids.map(() => (g.booleano() ? 1 : g.inteiro(1_000_000, 2 ** 40)));
  }
  return { partes: ids.map((id, i) => ({ id, peso: pesos[i]! })), classe };
}

porSemente(
  'divisão proporcional: a soma fecha, cada parte fica a menos de um centavo do exato e a ordem não importa',
  (g) => {
    const { total } = gerarTotal(g);
    const { partes } = gerarPartes(g);
    const r = dividirProporcional(total, partes);
    expect(r.map((x) => x.id)).toEqual(partes.map((p) => p.id));
    expect(r.reduce((a, x) => a + x.valorCentavos, 0)).toBe(total);
    const soma = partes.reduce((a, p) => a + BigInt(p.peso), 0n);
    for (const [i, parte] of r.entries()) {
      expect(Number.isSafeInteger(parte.valorCentavos) && parte.valorCentavos >= 0).toBe(true);
      const exato = BigInt(total) * BigInt(partes[i]!.peso); // valor exato × soma dos pesos
      const obtido = BigInt(parte.valorCentavos) * soma;
      expect(obtido > exato - soma && obtido < exato + soma).toBe(true);
    }
    const embaralhado = dividirProporcional(total, g.embaralhar(partes));
    const mapa = (v: typeof r) => Object.fromEntries(v.map((x) => [x.id, x.valorCentavos]));
    expect(mapa(embaralhado)).toEqual(mapa(r));
    expect(dividirProporcional(total, partes)).toEqual(r);
  },
);

porSemente('divisão igual: nenhuma parte difere de outra por mais de um centavo', (g) => {
  const { total } = gerarTotal(g);
  const n = g.inteiro(1, 40);
  const r = dividirIgual(
    total,
    Array.from({ length: n }, (_, i) => `i${i}`),
  ).map((x) => x.valorCentavos);
  expect(r.reduce((a, b) => a + b, 0)).toBe(total);
  expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(1);
});

porSemente('parcelas geradas: soma exata, valores positivos, datas válidas e em ordem', (g) => {
  const quantidade = g.inteiro(1, 120);
  const total = g.inteiro(quantidade, g.booleano(0.2) ? CENTAVOS_MAXIMO : 5_000_000);
  const dia = g.inteiro(1, 31);
  const mes = g.inteiro(1, 12);
  const primeiro = `20${g.inteiro(26, 40)}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, 28)).padStart(2, '0')}`;
  const regra = g.booleano()
    ? ({ tipo: 'mensal' } as const)
    : ({ tipo: 'intervalo_dias', dias: g.inteiro(1, 90) } as const);
  const p = gerarParcelas({
    totalCentavos: total,
    quantidade,
    primeiroVencimento: primeiro,
    regra,
  });
  expect(p).toHaveLength(quantidade);
  expect(validarParcelas(p, total)).toEqual([]);
  expect(p.reduce((a, x) => a + x.valorCentavos, 0)).toBe(total);
  expect(p.every((x) => x.valorCentavos >= 1 && ehDataIso(x.vencimento))).toBe(true);
  const datas = p.map((x) => x.vencimento);
  expect([...datas].sort()).toEqual(datas);
  const base = p[0]!.valorCentavos;
  expect(p.slice(0, -1).every((x) => x.valorCentavos === base)).toBe(true);
  expect(p.at(-1)!.valorCentavos).toBeGreaterThanOrEqual(base);
  expect(p.at(-1)!.valorCentavos - base).toBeLessThan(quantidade);
});

porSemente(
  'soma de meses: data sempre válida, dia nunca maior que o original e ordem crescente',
  (g) => {
    const ano = g.inteiro(2026, 2060);
    const mes = g.inteiro(1, 12);
    const dia = g.inteiro(1, 28 + g.inteiro(0, 3));
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (!ehDataIso(data)) return;
    let anterior = data;
    for (let m = 1; m <= 24; m++) {
      const d = somarMeses(data, m, dia);
      expect(ehDataIso(d)).toBe(true);
      expect(Number(d.slice(8, 10))).toBeLessThanOrEqual(dia);
      expect(d > anterior).toBe(true);
      anterior = d;
    }
  },
);

porSemente('texto de dinheiro: ida e volta exata e nenhuma casa decimal inventada', (g) => {
  const centavos = g.booleano(0.1)
    ? g.inteiro(0, 99)
    : g.inteiro(0, g.booleano(0.1) ? CENTAVOS_MAXIMO : 99_999_999);
  const formatado = formatarCentavosSemSimbolo(centavos);
  expect(interpretarCentavos(formatado)).toBe(centavos);
  expect(interpretarCentavos(`R$ ${formatado}`)).toBe(centavos);
  const reais = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, '0');
  expect(interpretarCentavos(`${reais},${resto}`)).toBe(centavos);
  if (reais < 1000) expect(interpretarCentavos(`${reais}.${resto}`)).toBe(centavos);
  expect(interpretarCentavos(`${reais},${resto}7`)).toBeNull();
});

function gerarComponentes(g: GeradorDeterministico): ComponenteCusto[] {
  return Array.from({ length: g.inteiro(0, 8) }, () => {
    const x = g.inteiro(0, 5);
    if (x === 0) return { tipo: 'desconhecido' } as const;
    if (x === 1) return { tipo: 'nao_apurado' } as const;
    return {
      tipo: 'conhecido',
      valorCentavos: g.booleano(0.2) ? 0 : g.inteiro(1, 1_000_000),
    } as const;
  });
}
porSemente(
  'estado de apuração: soma associativa, comutativa e coerente com os componentes',
  (g) => {
    const todos = gerarComponentes(g);
    const corte = g.inteiro(0, todos.length);
    const direto = apurarComponentes(todos);
    const dividido = somarApuracoes([
      apurarComponentes(todos.slice(0, corte)),
      apurarComponentes(todos.slice(corte)),
    ]);
    expect(dividido).toEqual(direto);
    expect(somarApuracoes(g.embaralhar(todos).map((c) => apurarComponentes([c])))).toEqual(direto);
    const conhecidos = todos.filter((c) => c.tipo === 'conhecido').length;
    const faltando = todos.length - conhecidos;
    expect(direto.componentesConhecidos).toBe(conhecidos);
    expect(direto.estado === 'completa').toBe(faltando === 0);
    if (faltando > 0 && conhecidos === 0) expect(direto.estado).not.toBe('parcial');
    if (faltando > 0 && conhecidos > 0) expect(direto.estado).toBe('parcial');
    // Zero conhecido nunca é confundido com desconhecido.
    expect(apurarComponentes([...todos, { tipo: 'desconhecido' }]).estado).not.toBe('completa');
  },
);

porSemente(
  'resumo financeiro: valor pago mais saldo fecha a soma das parcelas e o saldo nunca é negativo',
  (g) => {
    const n = g.inteiro(1, 6);
    const hoje = '2026-10-16';
    const parcelas = Array.from({ length: n }, () => {
      const valorCentavos = g.inteiro(1, 100_000);
      const pagoCentavos = g.booleano(0.4)
        ? 0
        : g.booleano(0.4)
          ? valorCentavos
          : g.inteiro(0, valorCentavos);
      return {
        valorCentavos,
        pagoCentavos,
        vencimento: g.escolher(['2026-09-01', '2026-10-16', '2026-12-01']),
      };
    });
    const total = parcelas.reduce((a, p) => a + p.valorCentavos, 0);
    const r = resumirLancamento({
      valorOperacaoCentavos: total,
      condicao: n === 1 ? 'a_vista' : 'parcelado',
      cancelado: false,
      parcelas,
      hoje,
    });
    expect(r.saldoEmAbertoCentavos).not.toBeNull();
    expect(r.saldoEmAbertoCentavos! >= 0).toBe(true);
    expect(r.pagoCentavos + r.saldoEmAbertoCentavos!).toBe(total);
    expect(r.valorOperacaoCentavos).toBe(total);
    expect(r.situacao === 'quitado').toBe(r.saldoEmAbertoCentavos === 0);
    const vencida = parcelas.some((p) => p.pagoCentavos < p.valorCentavos && p.vencimento < hoje);
    if (vencida) expect(r.situacao).toBe('vencido');
    if (r.saldoEmAbertoCentavos! > 0) expect(r.proximoVencimento).not.toBeNull();
    else expect(r.proximoVencimento).toBeNull();
    const cancelado = resumirLancamento({
      valorOperacaoCentavos: total,
      condicao: 'parcelado',
      cancelado: true,
      parcelas,
      hoje,
    });
    expect(cancelado.situacao).toBe('cancelado');
  },
);

describe('guarda de abrangência dos geradores (D-K)', () => {
  for (const semente of SEMENTES) {
    it(`semente ${semente}: o gerador de fato produz as classes de borda`, () => {
      const g = criarGeradorDeterministico(semente);
      const totais = new Map<string, number>();
      const pesos = new Map<string, number>();
      let tamanhoUm = 0;
      let tamanhoMaximo = 0;
      let empateDeResto = 0;
      for (let i = 0; i < CASOS; i++) {
        const t = gerarTotal(g);
        totais.set(t.classe, (totais.get(t.classe) ?? 0) + 1);
        const p = gerarPartes(g);
        pesos.set(p.classe, (pesos.get(p.classe) ?? 0) + 1);
        if (p.partes.length === 1) tamanhoUm++;
        if (p.partes.length >= 30) tamanhoMaximo++;
        const r = dividirProporcional(t.total, p.partes);
        const soma = p.partes.reduce((a, x) => a + BigInt(x.peso), 0n);
        const restos = p.partes.map((x) => (BigInt(t.total) * BigInt(x.peso)) % soma);
        if (restos.some((x, k) => x > 0n && restos.indexOf(x) !== k) && r.length > 1)
          empateDeResto++;
      }
      for (const classe of ['um_centavo', 'zero', 'pequeno', 'medio', 'grande', 'maximo'])
        expect(totais.get(classe) ?? 0, `classe de total ${classe}`).toBeGreaterThanOrEqual(
          CASOS / 100,
        );
      for (const classe of ['iguais', 'desiguais', 'extremos', 'unico'])
        expect(pesos.get(classe) ?? 0, `classe de pesos ${classe}`).toBeGreaterThanOrEqual(
          CASOS / 100,
        );
      expect(tamanhoUm).toBeGreaterThan(0);
      expect(tamanhoMaximo).toBeGreaterThan(0);
      expect(empateDeResto).toBeGreaterThanOrEqual(CASOS / 100);
    });
  }
});
