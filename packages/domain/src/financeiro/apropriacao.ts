import { apuracaoDeContagens } from './custo-insumos';
import type { Apuracao } from './apuracao';
import { CENTAVOS_MAXIMO } from './dinheiro';
import { dividirIgual, dividirProporcional } from './proporcional';
import type { Classificacao } from './resultado';

/** Linha da conciliação entre competência e caixa a que uma parte de custo pertence (4G). */
export type GrupoConciliacao = 'insumos' | 'despesas' | 'animais';

/** Parte de uma linha de custo com a sua classificação e grupo (margem bruta e conciliação). */
export interface ParteClassificadaDaLinha {
  classificacao: Classificacao;
  grupo: GrupoConciliacao;
  /** `null` = desconhecida. */
  valorCentavos: number | null;
}

/**
 * Apropriação de custos (entrega 4E): como cada custo chega a um animal, a um lote ou fica
 * "não alocado". Funções puras, sem banco, para provar a conservação:
 *
 *   soma dos animais + lotes sem animais + não alocado = soma dos custos de origem
 *
 * - custo de animal: vai ao animal;
 * - custo de lote: fica no lote e, no dia do custo, é dividido por igual entre os animais que
 *   estavam no lote ao fim desse dia (divisão por maior resto, por lote, dia e categoria);
 * - custo da propriedade: só vai a lotes ou animais por um rateio explícito (pesos gravados);
 *   sem rateio fica "não alocado", sempre visível;
 * - custo de registro sanitário: dividido por igual entre os animais tratados.
 * Custo desconhecido (valor `null`) nunca vira zero: contado à parte e torna o total parcial.
 */
export const CATEGORIAS_CUSTO = [
  'aquisicao',
  'custo_anterior',
  'alimentacao',
  'sanidade',
  'mercadoria_vendida',
  'outros',
] as const;
export type CategoriaCusto = (typeof CATEGORIAS_CUSTO)[number];

export type DestinoDeCusto =
  | { tipo: 'animal'; id: string }
  | { tipo: 'lote'; id: string }
  | { tipo: 'propriedade' }
  | { tipo: 'animais_tratados'; animaisIds: readonly string[] };

export interface ItemDeRateio {
  alvo: { tipo: 'lote' | 'animal'; id: string };
  /** Peso relativo gravado: inteiro positivo. O valor de cada destino é calculado a cada leitura. */
  peso: number;
}

export interface LinhaDeCusto {
  id: string;
  origemTipo: 'consumo' | 'lancamento' | 'aquisicao' | 'custo_anterior' | 'manejo_sanitario';
  origemId: string;
  data: string;
  categoria: CategoriaCusto;
  descricao: string;
  /** Valor atual da origem em centavos; `null` = custo desconhecido. */
  valorCentavos: number | null;
  destino: DestinoDeCusto;
  /** Só para custos da propriedade. */
  rateio: { id: string; itens: readonly ItemDeRateio[] } | null;
  /**
   * Composição da linha por classificação e grupo de conciliação (4G). A soma dos valores conhecidos
   * é a parte conhecida da linha; não altera a apropriação.
   */
  partes?: readonly ParteClassificadaDaLinha[];
}

export type AlvoDeCusto =
  { tipo: 'animal'; id: string } | { tipo: 'lote'; id: string } | { tipo: 'nao_alocado' };

export interface ParteDeCusto {
  linhaId: string;
  alvo: AlvoDeCusto;
  valorCentavos: number | null;
  via: 'direto' | 'rateio' | 'animais_tratados' | 'sem_destino';
}

/** Primeiro passo: para onde vai cada custo, sem ainda olhar a composição dos lotes. */
export function dividirLinha(l: LinhaDeCusto): ParteDeCusto[] {
  const v = l.valorCentavos;
  const parte = (
    alvo: AlvoDeCusto,
    valor: number | null,
    via: ParteDeCusto['via'],
  ): ParteDeCusto => ({ linhaId: l.id, alvo, valorCentavos: valor, via });
  const d = l.destino;
  if (d.tipo === 'animal') return [parte({ tipo: 'animal', id: d.id }, v, 'direto')];
  if (d.tipo === 'lote') return [parte({ tipo: 'lote', id: d.id }, v, 'direto')];
  if (d.tipo === 'animais_tratados') {
    if (d.animaisIds.length === 0) return [parte({ tipo: 'nao_alocado' }, v, 'sem_destino')];
    const ids = [...d.animaisIds];
    if (v === null) return ids.map((id) => parte({ tipo: 'animal', id }, null, 'animais_tratados'));
    return dividirIgual(v, ids).map((p) =>
      parte({ tipo: 'animal', id: p.id }, p.valorCentavos, 'animais_tratados'),
    );
  }
  // Custo da propriedade: só com rateio explícito.
  if (!l.rateio || l.rateio.itens.length === 0)
    return [parte({ tipo: 'nao_alocado' }, v, 'sem_destino')];
  const chave = (i: ItemDeRateio) => `${i.alvo.tipo}:${i.alvo.id}`;
  if (v === null) return l.rateio.itens.map((i) => parte({ ...i.alvo }, null, 'rateio'));
  const valores = new Map(
    dividirProporcional(
      v,
      l.rateio.itens.map((i) => ({ id: chave(i), peso: i.peso })),
    ).map((p) => [p.id, p.valorCentavos]),
  );
  return l.rateio.itens.map((i) => parte({ ...i.alvo }, valores.get(chave(i)) ?? 0, 'rateio'));
}

export interface Acumulado {
  conhecidoCentavos: number;
  /** Quantas somas conhecidas entraram (informativo; o estado vem de `desconhecidos`). */
  conhecidos: number;
  desconhecidos: number;
  porCategoria: Partial<Record<CategoriaCusto, number>>;
}
const vazio = (): Acumulado => ({
  conhecidoCentavos: 0,
  conhecidos: 0,
  desconhecidos: 0,
  porCategoria: {},
});
function somarNo(a: Acumulado, valor: number | null, categoria: CategoriaCusto) {
  if (valor === null) {
    a.desconhecidos += 1;
    return;
  }
  a.conhecidoCentavos += valor;
  a.conhecidos += 1;
  a.porCategoria[categoria] = (a.porCategoria[categoria] ?? 0) + valor;
}
export function apuracaoDe(a: Acumulado): Apuracao {
  return apuracaoDeContagens({
    conhecidoCentavos: a.conhecidoCentavos,
    conhecidos: a.conhecidos,
    desconhecidos: a.desconhecidos,
  });
}

export interface VisaoDoLote {
  /** Custos lançados direto ao lote. */
  diretoCentavos: number;
  /** Partes recebidas por rateio. */
  rateadoCentavos: number;
  /** Quantas partes de valor conhecido entraram (informativo; o estado vem de `desconhecidos`). */
  conhecidos: number;
  desconhecidos: number;
  porCategoria: Partial<Record<CategoriaCusto, number>>;
}

/** Como um valor chegou a um animal (para "De onde veio este número?"). */
export interface DetalheDeCusto {
  via: 'direto' | 'rateio' | 'animais_tratados' | 'lote';
  categoria: CategoriaCusto;
  data: string;
  /** Parte do animal; `null` = desconhecida. */
  valorCentavos: number | null;
  linhaIds: string[];
  /** Quando veio do lote: o lote, o total do grupo (lote, dia e categoria) e quantos animais o dividiram. */
  lote?: { id: string; totalDoGrupoCentavos: number; animaisNoGrupo: number };
  rateioId?: string;
}

export interface ResultadoApropriacao {
  porAnimal: Map<string, Acumulado>;
  porLote: Map<string, VisaoDoLote>;
  /** Custo de lote em dia sem nenhum animal presente. */
  loteSemAnimais: Map<string, Acumulado>;
  naoAlocado: Acumulado;
  /** Soma dos custos de origem conhecidos e quantidade dos desconhecidos, para a conferência. */
  origem: { conhecidoCentavos: number; desconhecidos: number };
  detalhes: DetalheDeCusto[];
  /**
   * Só com `limitePorAnimal`: o que chegou a cada animal em linhas com data até o limite dele
   * (ex.: custo acumulado até a saída). Informativo; não entra na conservação.
   */
  porAnimalAte: Map<string, Acumulado>;
}

/**
 * Apropria todos os custos. `presenca(loteId, data)` devolve os animais que estavam no lote ao
 * fim do dia, em ordem estável. Se `coletar` for informado, `detalhes` lista como o valor chegou
 * àquele animal.
 */
export function apropriar(
  linhas: readonly LinhaDeCusto[],
  presenca: (loteId: string, data: string) => readonly string[],
  coletar?: string,
  limitePorAnimal?: (animalId: string) => string | null,
): ResultadoApropriacao {
  const r: ResultadoApropriacao = {
    porAnimal: new Map(),
    porLote: new Map(),
    loteSemAnimais: new Map(),
    naoAlocado: vazio(),
    origem: { conhecidoCentavos: 0, desconhecidos: 0 },
    detalhes: [],
    porAnimalAte: new Map(),
  };
  const ate = (id: string, data: string): Acumulado | null => {
    const limite = limitePorAnimal?.(id);
    if (!limite || data > limite) return null;
    let a = r.porAnimalAte.get(id);
    if (!a) r.porAnimalAte.set(id, (a = vazio()));
    return a;
  };
  const animal = (id: string) => {
    let a = r.porAnimal.get(id);
    if (!a) r.porAnimal.set(id, (a = vazio()));
    return a;
  };
  const lote = (id: string) => {
    let v = r.porLote.get(id);
    if (!v)
      r.porLote.set(
        id,
        (v = {
          diretoCentavos: 0,
          rateadoCentavos: 0,
          conhecidos: 0,
          desconhecidos: 0,
          porCategoria: {},
        }),
      );
    return v;
  };
  interface Grupo {
    loteId: string;
    data: string;
    categoria: CategoriaCusto;
    conhecido: number;
    desconhecidos: number;
    linhaIds: string[];
  }
  const grupos = new Map<string, Grupo>();

  for (const l of linhas) {
    if (l.valorCentavos === null) r.origem.desconhecidos += 1;
    else {
      if (
        !Number.isSafeInteger(l.valorCentavos) ||
        l.valorCentavos < 0 ||
        l.valorCentavos > CENTAVOS_MAXIMO
      )
        throw new Error('Valor de custo inválido.');
      r.origem.conhecidoCentavos += l.valorCentavos;
    }
    for (const p of dividirLinha(l)) {
      const cat = l.categoria;
      if (p.alvo.tipo === 'animal') {
        somarNo(animal(p.alvo.id), p.valorCentavos, cat);
        const limitado = ate(p.alvo.id, l.data);
        if (limitado) somarNo(limitado, p.valorCentavos, cat);
        if (coletar === p.alvo.id)
          r.detalhes.push({
            via: p.via === 'sem_destino' ? 'direto' : p.via,
            categoria: cat,
            data: l.data,
            valorCentavos: p.valorCentavos,
            linhaIds: [l.id],
            ...(p.via === 'rateio' && l.rateio ? { rateioId: l.rateio.id } : {}),
          });
      } else if (p.alvo.tipo === 'nao_alocado') {
        somarNo(r.naoAlocado, p.valorCentavos, cat);
      } else {
        const v = lote(p.alvo.id);
        if (p.valorCentavos === null) v.desconhecidos += 1;
        else {
          v.conhecidos += 1;
          if (p.via === 'rateio') v.rateadoCentavos += p.valorCentavos;
          else v.diretoCentavos += p.valorCentavos;
          v.porCategoria[cat] = (v.porCategoria[cat] ?? 0) + p.valorCentavos;
        }
        const chave = `${p.alvo.id}|${l.data}|${cat}`;
        let g = grupos.get(chave);
        if (!g)
          grupos.set(
            chave,
            (g = {
              loteId: p.alvo.id,
              data: l.data,
              categoria: cat,
              conhecido: 0,
              desconhecidos: 0,
              linhaIds: [],
            }),
          );
        if (p.valorCentavos === null) g.desconhecidos += 1;
        else g.conhecido += p.valorCentavos;
        g.linhaIds.push(l.id);
      }
    }
  }

  // Segundo passo: o que ficou nos lotes é dividido, por dia e categoria, entre os animais presentes.
  for (const g of grupos.values()) {
    const presentes = presenca(g.loteId, g.data);
    if (presentes.length === 0) {
      let s = r.loteSemAnimais.get(g.loteId);
      if (!s) r.loteSemAnimais.set(g.loteId, (s = vazio()));
      if (g.conhecido > 0 || g.desconhecidos === 0) somarNo(s, g.conhecido, g.categoria);
      for (let k = 0; k < g.desconhecidos; k++) somarNo(s, null, g.categoria);
      continue;
    }
    const partes = dividirIgual(g.conhecido, [...presentes]);
    for (const p of partes) {
      const a = animal(p.id);
      if (g.conhecido > 0 || g.desconhecidos === 0) somarNo(a, p.valorCentavos, g.categoria);
      for (let k = 0; k < g.desconhecidos; k++) somarNo(a, null, g.categoria);
      const limitado = ate(p.id, g.data);
      if (limitado) {
        if (g.conhecido > 0 || g.desconhecidos === 0)
          somarNo(limitado, p.valorCentavos, g.categoria);
        for (let k = 0; k < g.desconhecidos; k++) somarNo(limitado, null, g.categoria);
      }
      if (coletar === p.id)
        r.detalhes.push({
          via: 'lote',
          categoria: g.categoria,
          data: g.data,
          valorCentavos: g.conhecido === 0 && g.desconhecidos > 0 ? null : p.valorCentavos,
          linhaIds: g.linhaIds,
          lote: {
            id: g.loteId,
            totalDoGrupoCentavos: g.conhecido,
            animaisNoGrupo: presentes.length,
          },
        });
    }
  }
  return r;
}

/** Confere a conservação; devolve as violações (vazio quando tudo fecha). */
export function conferirApropriacao(r: ResultadoApropriacao): string[] {
  const erros: string[] = [];
  let conhecido = r.naoAlocado.conhecidoCentavos;
  let desconhecidos = r.naoAlocado.desconhecidos;
  for (const a of r.porAnimal.values()) {
    conhecido += a.conhecidoCentavos;
    desconhecidos += a.desconhecidos;
  }
  for (const a of r.loteSemAnimais.values()) {
    conhecido += a.conhecidoCentavos;
    desconhecidos += a.desconhecidos;
  }
  if (conhecido !== r.origem.conhecidoCentavos)
    erros.push(
      `Soma apropriada ${conhecido} diferente da soma de origem ${r.origem.conhecidoCentavos}.`,
    );
  // Cada custo desconhecido precisa aparecer em algum destino (nunca some nem vira zero).
  if (r.origem.desconhecidos > 0 && desconhecidos < r.origem.desconhecidos)
    erros.push('Custo desconhecido sumiu na apropriação.');
  return erros;
}
