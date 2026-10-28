import type { Categoria, Resultado } from './tipos';
import { aplicar, type EquacaoRegistrada } from './registro';
import type { Quantidade } from './unidades';

/**
 * Nó do grafo de cálculo: uma equação e de onde vem cada entrada (de uma entrada do usuário ou
 * do resultado de outro nó). MODELOS_NUTRICIONAIS.md, 7.7: o que depende de algo indeterminado
 * fica indeterminado; o resto segue calculado. Nunca se assume zero.
 */
export interface NoCalculo {
  id: string;
  equacao: EquacaoRegistrada;
  /** nome da entrada da equação → id de nó ou "entrada:<nome>". */
  origens: Readonly<Record<string, string>>;
}

export class ErroGrafo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroGrafo';
  }
}

/** Ordem de cálculo (topológica); recusa ciclo e origem inexistente. */
export function ordenar(nos: readonly NoCalculo[]): NoCalculo[] {
  const porId = new Map(nos.map((n) => [n.id, n]));
  if (porId.size !== nos.length) throw new ErroGrafo('Nó repetido.');
  const ordem: NoCalculo[] = [];
  const estado = new Map<string, 'visitando' | 'feito'>();
  const visitar = (n: NoCalculo, caminho: string[]) => {
    if (estado.get(n.id) === 'feito') return;
    if (estado.get(n.id) === 'visitando')
      throw new ErroGrafo(`Ciclo: ${[...caminho, n.id].join(' → ')}.`);
    estado.set(n.id, 'visitando');
    for (const origem of Object.values(n.origens)) {
      if (origem.startsWith('entrada:')) continue;
      const dep = porId.get(origem);
      if (!dep) throw new ErroGrafo(`Nó ${n.id} depende de ${origem}, que não existe.`);
      visitar(dep, [...caminho, n.id]);
    }
    estado.set(n.id, 'feito');
    ordem.push(n);
  };
  for (const n of nos) visitar(n, []);
  return ordem;
}

/**
 * Calcula os nós em ordem. Resultado de nó dependente só usa resultado com valor; o que depende
 * de resultado sem valor fica indeterminado, com o motivo. Fora do domínio propaga: o dependente
 * perde o uso operacional.
 */
export function calcularGrafo(
  nos: readonly NoCalculo[],
  categoria: Categoria,
  entradas: Readonly<Record<string, Quantidade | null>>,
): Map<string, Resultado> {
  const resultados = new Map<string, Resultado>();
  for (const n of ordenar(nos)) {
    const valores: Record<string, Quantidade | null> = {};
    const herdados: string[] = [];
    let semValor: string | null = null;
    let foraDoEscopo: Resultado | null = null;
    for (const [nome, origem] of Object.entries(n.origens)) {
      if (origem.startsWith('entrada:')) {
        valores[nome] = entradas[origem.slice('entrada:'.length)] ?? null;
        continue;
      }
      const r = resultados.get(origem)!;
      if (r.valor === null) {
        semValor ??= origem;
        if (r.situacao === 'fora_do_escopo') foraDoEscopo ??= r;
        valores[nome] = null;
      } else {
        valores[nome] = { valor: r.valor, unidade: r.unidade };
        if (!r.usoOperacional) herdados.push(`Depende de ${origem}, sem uso operacional.`);
      }
    }
    if (semValor) {
      // Dependência fora do escopo deixa o dependente fora do escopo, com o mesmo motivo.
      resultados.set(n.id, {
        equacaoId: n.equacao.id,
        situacao: foraDoEscopo ? 'fora_do_escopo' : 'indeterminado',
        valor: null,
        unidade: n.equacao.saida,
        usoOperacional: false,
        motivos: foraDoEscopo
          ? foraDoEscopo.motivos
          : [`Depende de ${semValor}, que não foi calculado.`],
        avisos: [],
        notas: [],
        coeficientes: {},
        entradas: {},
      });
      continue;
    }
    const r = aplicar(n.equacao, categoria, valores);
    if (herdados.length && r.valor !== null) {
      r.usoOperacional = false;
      if (r.situacao === 'valido') r.situacao = 'fora_do_dominio';
      r.motivos.push(...herdados);
    }
    resultados.set(n.id, r);
  }
  return resultados;
}
