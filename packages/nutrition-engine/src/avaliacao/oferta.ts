import {
  converterUnidade,
  DEFINICOES_UNIDADE,
  type BaseNutricional,
  type NaturezaValor,
  type TipoValor,
  type UnidadeNutricional,
} from '@pecuaria/domain';
import { exigirUnidade, type Quantidade } from '../nucleo/unidades';

/*
 * Oferta nutricional de uma dieta (entrega 6B-1; PLANO_FASE_6.md, seções 9 e 9.7). Aritmética
 * de quantidades, bases e unidades, sem equação do BR-CORTE. A composição vem só de perfis
 * gravados e elegíveis (Fase 5D), passados pelo main; o motor não lê banco.
 *
 * Regras (C-6B-01, 06, 08, 11, 13; regra 2 do CLAUDE.md):
 * - MN e MS nunca se misturam: a conversão usa a MS do próprio perfil, e só se ela for teor
 *   (não garantia) e de base publicada ou validada;
 * - ausência, traço, "ND" e zero sem comprovação nunca viram zero: a contribuição fica
 *   desconhecida e a oferta do nutriente, parcial;
 * - garantia mínima ou máxima de rótulo é limite, nunca teor exato;
 * - a quantidade diz o que representa: oferecido, consumo observado ou consumo assumido sem
 *   sobras (este, só em simulação, sempre identificado).
 */

export const TIPOS_QUANTIDADE = [
  'oferecido',
  'consumo_observado',
  'consumo_assumido_sem_sobras',
] as const;
export type TipoQuantidade = (typeof TIPOS_QUANTIDADE)[number];

/** Um valor de um perfil gravado, como publicado, com a origem. */
export interface ValorPerfilOferta {
  valorId: string;
  /** Código da definição de nutriente (ex.: "PB", "MS", "Ca"). */
  nutriente: string;
  valor: number;
  /** Texto como publicado; o zero só é aceito se este texto for um zero numérico. */
  valorPublicado: string | null;
  unidade: UnidadeNutricional;
  base: BaseNutricional;
  tipoValor: TipoValor;
  formaObtencao: string;
  /** Base interpretada (não publicada pela fonte) e se o usuário a validou (C7). */
  baseInferida: boolean;
  baseValidada: boolean;
  /**
   * O que o número representa, pela definição do nutriente (migration 0018; metadado explícito,
   * nunca deduzido pelo nome): fração mássica (padrão), PB total como N × 6,25
   * ("equivalente_proteico", pode passar de 100 %) ou parcela da PB que vem de NNP
   * ("equivalente_proteico_nnp"), contida na PB total e nunca somada a ela.
   */
  naturezaValor?: NaturezaValor;
  /** Registros de origem do valor (rastreio). */
  origens: readonly string[];
}

export interface PerfilOferta {
  perfilId: string;
  alimentoId: string;
  alimentoNome: string;
  /** Regra de seleção com que o perfil foi gravado (5D). */
  regra: { codigo: string; versao: number };
  /** Decidida no main (perfil gravado, regra aprovada, registros conferidos). */
  elegibilidade: { elegivel: boolean; motivos: readonly string[] };
  /** Avisos de "uso com cautela" e limitações do perfil. */
  cautelas: readonly string[];
  valores: readonly ValorPerfilOferta[];
  /** Valores publicados sem número ("<0,01", "ND", traço). */
  /**
   * Valores publicados sem número ("<0,01", "ND", traço), com a natureza e o significado que a
   * legenda da fonte dá (Fase 5A). Diferente de campo vazio, que é ausência de informação
   * (D-6B1-03).
   */
  naoQuantificados: readonly {
    nutriente: string;
    textoPublicado: string;
    natureza?: string;
    significadoFonte?: string | null;
  }[];
}

export interface ItemDieta {
  itemId: string;
  perfil: PerfilOferta;
  /** Quantidade por cabeça e dia, em "kg MN/dia" ou "kg MS/dia". */
  quantidade: Quantidade;
  /** Só no consumo observado: sobras medidas do mesmo alimento, na mesma unidade. */
  sobras?: Quantidade;
}

export interface DietaOferta {
  tipo: TipoQuantidade;
  itens: readonly ItemDieta[];
  /** Códigos dos nutrientes pedidos. */
  nutrientes: readonly string[];
}

export type SituacaoContribuicao =
  'conhecida' | 'limite_inferior' | 'limite_superior' | 'desconhecida';
export type SituacaoOferta =
  | 'completa'
  | 'limite_inferior'
  | 'limite_superior'
  | 'limites_mistos'
  | 'parcial'
  | 'indeterminada';

export interface ContribuicaoItem {
  itemId: string;
  perfilId: string;
  alimentoNome: string;
  situacao: SituacaoContribuicao;
  /** g/dia; null quando desconhecida. */
  gDia: number | null;
  valorId: string | null;
  tipoValor: TipoValor | null;
  /**
   * Só na PB: parcela de PB equivalente de NNP declarada no perfil (g/dia), contida nesta
   * contribuição; null sem parcela declarada ou sem conversão (D-6B1-04).
   */
  parcelaNnpGDia: number | null;
  /** O perfil declara PB equivalente de NNP (mesmo que a parcela não tenha sido calculada). */
  nnpDeclarado: boolean;
  motivo: string | null;
  avisos: string[];
}

export interface OfertaNutriente {
  nutriente: string;
  situacao: SituacaoOferta;
  /**
   * Total em g/dia: só com todas as contribuições conhecidas ("completa") ou como limite
   * (garantias). Nunca há total com contribuição desconhecida.
   */
  totalGDia: number | null;
  /** Soma só das contribuições conhecidas (não garantias); não é a oferta total se "parcial". */
  somaConhecidaGDia: number | null;
  /** Concentração na MS da dieta (% da MS), com o mesmo sentido do total (valor ou limite). */
  concentracaoPctMs: number | null;
  /**
   * Só na PB: parte das contribuições conhecidas que é PB equivalente de NNP (g/dia). Não é
   * proteína verdadeira nem PM ofertada (D-6B1-04).
   */
  parcelaEquivalenteNnpGDia: number | null;
  /**
   * Só na PB: algum alimento declara NNP sem parcela calculada (garantia, ambiguidade ou falta de
   * conversão). A parcela total é desconhecida; nada é presumido.
   */
  parcelaNnpIncompleta: boolean;
  contribuicoes: ContribuicaoItem[];
  motivos: string[];
}

export interface ItemCalculado {
  itemId: string;
  perfilId: string;
  alimentoNome: string;
  /** MS do perfil (% da MN), quando utilizável na conversão. */
  msPctMn: number | null;
  oferecidoKgMnDia: number | null;
  oferecidoKgMsDia: number | null;
  /** Quantidade que entra na oferta: o oferecido, o consumo observado ou o assumido. */
  usadoKgMnDia: number | null;
  usadoKgMsDia: number | null;
  motivos: string[];
  avisos: string[];
}

/** O que a quantidade usada representa (D-6B1-01). */
export type NaturezaConsumo =
  'oferecido' | 'consumo_estimado_por_sobras' | 'consumo_assumido_simulacao';

export interface ResultadoOferta {
  tipo: TipoQuantidade;
  naturezaConsumo: NaturezaConsumo;
  itens: ItemCalculado[];
  materiaSeca: {
    totalKgMsDia: number | null;
    totalKgMnDia: number | null;
    /** MS da dieta = MS total / MN total × 100. */
    msPctMnDieta: number | null;
    motivos: string[];
  };
  nutrientes: OfertaNutriente[];
  avisos: string[];
  perfis: { perfilId: string; alimentoId: string; regra: { codigo: string; versao: number } }[];
}

export class ErroOferta extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroOferta';
  }
}

const AVISO_ASSUMIDO =
  'Consumo assumido sem sobras: simulação em que tudo o que é oferecido é consumido; não é consumo medido.';
const AVISO_SOBRAS =
  'Consumo observado estimado = oferecido menos sobras medidas. Consumo e composição consumida são estimativas: o animal pode selecionar, e as sobras são tratadas com a composição do alimento oferecido (D-6B1-01).';
const AVISO_ZERO =
  'Zero publicado pela fonte: pode ser valor arredondado; não prova ausência absoluta (D-6B1-02).';
const AVISO_OFERECIDO = 'Quantidade oferecida no cocho; não é o consumo do animal.';

/** Perfil com mais de um valor do nutriente (ex.: em MS e em MN, ou média e garantia): sem escolha implícita. */
const AMBIGUO = (n: string) =>
  `Mais de um valor de ${n} no perfil (bases ou tipos de valor diferentes): sem regra para escolher; não vira zero.`;

const ehZeroPublicado = (texto: string | null) =>
  texto !== null && /^\s*0+([.,]0+)?\s*$/.test(texto);

/** MS do perfil utilizável na conversão MN ↔ MS, ou o motivo de não ser. */
function msDoPerfil(p: PerfilOferta): { valor: number } | { motivo: string } {
  if (!p.elegibilidade.elegivel)
    return {
      motivo: `Perfil não elegível: ${p.elegibilidade.motivos.join(' ') || 'sem motivo informado.'}`,
    };
  const nq = p.naoQuantificados.find((n) => n.nutriente === 'MS');
  const todos = p.valores.filter((x) => x.nutriente === 'MS');
  if (todos.length > 1) return { motivo: AMBIGUO('MS') };
  const v = todos[0];
  if (!v)
    return {
      motivo: nq ? `MS publicada sem número ("${nq.textoPublicado}").` : 'MS ausente no perfil.',
    };
  if (v.base !== 'mn') return { motivo: 'MS do perfil não está em base MN.' };
  if (v.tipoValor === 'minimo_garantido' || v.tipoValor === 'maximo_garantido')
    return {
      motivo: 'MS é garantia de rótulo (limite), não teor: não converte MN ↔ MS (C-6B-08).',
    };
  if (v.baseInferida && !v.baseValidada)
    return { motivo: 'Base da MS interpretada e não validada (C7).' };
  if (DEFINICOES_UNIDADE[v.unidade].grandeza !== 'fracao_massica')
    return { motivo: 'MS em unidade que não é fração mássica.' };
  const pct = converterUnidade(v.valor, v.unidade, 'pct');
  if (!(pct > 0 && pct <= 100)) return { motivo: 'MS fora de 0 a 100 %.' };
  return { valor: pct };
}

function calcularItem(tipo: TipoQuantidade, item: ItemDieta): ItemCalculado {
  const p = item.perfil;
  const motivos: string[] = [];
  const avisos = [...p.cautelas];
  const unidade = item.quantidade.unidade;
  if (unidade !== 'kg MN/dia' && unidade !== 'kg MS/dia')
    throw new ErroOferta(
      `Quantidade de ${p.alimentoNome} em ${unidade}; use kg MN/dia ou kg MS/dia.`,
    );
  const q = exigirUnidade('quantidade', item.quantidade, unidade);
  if (q < 0) throw new ErroOferta(`Quantidade negativa de ${p.alimentoNome}.`);
  let usado = q;
  if (tipo === 'consumo_observado') {
    if (!item.sobras)
      throw new ErroOferta(`Consumo observado de ${p.alimentoNome} exige as sobras medidas.`);
    const s = exigirUnidade('sobras', item.sobras, unidade);
    if (s < 0 || s > q)
      throw new ErroOferta(`Sobras de ${p.alimentoNome} devem estar entre zero e o oferecido.`);
    usado = q - s;
  } else if (item.sobras) throw new ErroOferta('Sobras só entram no consumo observado.');
  const ms = msDoPerfil(p);
  const pct = 'valor' in ms ? ms.valor : null;
  if (!('valor' in ms)) motivos.push(ms.motivo);
  const emMn = unidade === 'kg MN/dia';
  const converte = (kg: number) =>
    emMn
      ? { mn: kg, ms: pct === null ? null : (kg * pct) / 100 }
      : { ms: kg, mn: pct === null ? null : kg / (pct / 100) };
  const of = converte(q);
  const us = converte(usado);
  return {
    itemId: item.itemId,
    perfilId: p.perfilId,
    alimentoNome: p.alimentoNome,
    msPctMn: pct,
    oferecidoKgMnDia: of.mn,
    oferecidoKgMsDia: of.ms,
    usadoKgMnDia: us.mn,
    usadoKgMsDia: us.ms,
    motivos,
    avisos,
  };
}

function contribuicao(item: ItemDieta, calc: ItemCalculado, nutriente: string): ContribuicaoItem {
  const p = item.perfil;
  const base = {
    itemId: item.itemId,
    perfilId: p.perfilId,
    alimentoNome: p.alimentoNome,
    avisos: [] as string[],
  };
  const desconhecida = (motivo: string, v?: ValorPerfilOferta): ContribuicaoItem => ({
    ...base,
    situacao: 'desconhecida',
    gDia: null,
    valorId: v?.valorId ?? null,
    tipoValor: v?.tipoValor ?? null,
    parcelaNnpGDia: null,
    nnpDeclarado: false,
    motivo,
  });
  if (!p.elegibilidade.elegivel)
    return desconhecida(
      `Perfil não elegível: ${p.elegibilidade.motivos.join(' ') || 'sem motivo informado.'}`,
    );
  const todos = p.valores.filter((x) => x.nutriente === nutriente);
  if (todos.length > 1) return desconhecida(AMBIGUO(nutriente));
  const v = todos[0];
  const nnps = p.valores.filter((x) => x.naturezaValor === 'equivalente_proteico_nnp');
  if (!v && nutriente === 'PB' && nnps.length > 0)
    return desconhecida(
      'PB total não publicada: a parcela de PB equivalente de NNP não substitui a PB total (sem dupla contagem).',
    );
  if (!v) {
    const nq = p.naoQuantificados.find((n) => n.nutriente === nutriente);
    const legenda = nq
      ? [
          nq.natureza && `natureza: ${nq.natureza}`,
          nq.significadoFonte && `legenda da fonte: ${nq.significadoFonte}`,
        ]
          .filter(Boolean)
          .join('; ')
      : '';
    return desconhecida(
      nq
        ? `Publicado sem número ("${nq.textoPublicado}"${legenda ? `; ${legenda}` : ''}); não vira zero.`
        : `${nutriente} sem valor no perfil (campo vazio ou não informado pela fonte); não vira zero.`,
    );
  }
  if (DEFINICOES_UNIDADE[v.unidade].grandeza !== 'fracao_massica')
    return desconhecida(
      `${nutriente} em ${DEFINICOES_UNIDADE[v.unidade].simbolo}: sem conversão para massa nesta etapa (energia ofertada adiada, C-6B-16).`,
      v,
    );
  if (v.baseInferida && !v.baseValidada)
    return desconhecida('Base do valor interpretada e não validada (C7).', v);
  if (v.valor === 0 && !ehZeroPublicado(v.valorPublicado))
    return desconhecida('Zero sem comprovação explícita na fonte (C-6B-13).', v);
  const natureza = v.naturezaValor ?? 'fracao_massica';
  const dentroDaUnidade =
    v.valor >= 0 && v.valor <= (DEFINICOES_UNIDADE[v.unidade].maximo ?? Infinity);
  if (v.valor < 0 || (natureza === 'fracao_massica' && !dentroDaUnidade))
    return desconhecida(
      `Valor fora da faixa da unidade (${v.valor} ${DEFINICOES_UNIDADE[v.unidade].simbolo}).`,
      v,
    );
  // PB acima de 100 % (N × 6,25 da ureia) só com a parcela de NNP declarada no perfil.
  if (natureza === 'equivalente_proteico' && !dentroDaUnidade && nnps.length === 0)
    return desconhecida(
      'PB acima de 100 % sem parcela de PB equivalente de NNP declarada no perfil.',
      v,
    );
  if (v.valor === 0) base.avisos.push(AVISO_ZERO);
  const g = gramasPorDia(v, calc);
  if ('motivo' in g) return desconhecida(g.motivo, v);
  let parcelaNnp: number | null = null;
  if (nutriente === 'PB' && nnps.length > 0) {
    const n = nnps.length > 1 ? null : nnps[0]!;
    const gn = !n
      ? { motivo: AMBIGUO('PB equivalente de NNP') }
      : n.valor < 0
        ? { motivo: 'valor negativo.' }
        : n.valor === 0 && !ehZeroPublicado(n.valorPublicado)
          ? { motivo: 'zero sem comprovação explícita na fonte (C-6B-13).' }
          : gramasPorDia(n, calc);
    if (n && (n.tipoValor === 'minimo_garantido' || n.tipoValor === 'maximo_garantido'))
      base.avisos.push('Parcela de NNP é garantia de rótulo (limite): não entra como valor.');
    else if ('motivo' in gn) base.avisos.push(`Parcela de NNP não calculada: ${gn.motivo}`);
    else if (gn.g > g.g * (1 + 1e-12))
      return desconhecida(
        'Parcela de PB equivalente de NNP declarada maior que a PB total: inconsistência.',
        v,
      );
    else parcelaNnp = gn.g;
    if (parcelaNnp !== null && parcelaNnp > 0)
      base.avisos.push(
        'A PB inclui PB equivalente de nitrogênio não proteico (N × 6,25), contida na PB total: não é proteína verdadeira nem PM ofertada.',
      );
  }
  const gDia = g.g;
  const situacao: SituacaoContribuicao =
    v.tipoValor === 'minimo_garantido'
      ? 'limite_inferior'
      : v.tipoValor === 'maximo_garantido'
        ? 'limite_superior'
        : 'conhecida';
  if (situacao !== 'conhecida')
    base.avisos.push('Garantia de rótulo: limite, não teor exato (C-6B-08).');
  return {
    ...base,
    situacao,
    gDia,
    valorId: v.valorId,
    tipoValor: v.tipoValor,
    parcelaNnpGDia: parcelaNnp,
    nnpDeclarado: nutriente === 'PB' && nnps.length > 0,
    motivo: null,
  };
}

/** g/dia do valor na base dele (MS ou MN), ou o motivo de não converter. */
function gramasPorDia(
  v: ValorPerfilOferta,
  calc: ItemCalculado,
): { g: number } | { motivo: string } {
  if (v.baseInferida && !v.baseValidada)
    return { motivo: 'Base do valor interpretada e não validada (C7).' };
  if (DEFINICOES_UNIDADE[v.unidade].grandeza !== 'fracao_massica')
    return { motivo: `Unidade ${DEFINICOES_UNIDADE[v.unidade].simbolo} sem conversão para massa.` };
  const kg = v.base === 'ms' ? calc.usadoKgMsDia : calc.usadoKgMnDia;
  if (kg === null)
    return {
      motivo: `Falta converter a quantidade para a base ${v.base.toUpperCase()} do valor (${calc.motivos[0] ?? 'MS indisponível'}).`,
    };
  return { g: kg * converterUnidade(v.valor, v.unidade, 'g_kg') };
}

const soma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function ofertaDoNutriente(
  nutriente: string,
  contribuicoes: ContribuicaoItem[],
  totalKgMs: number | null,
): OfertaNutriente {
  const tem = (s: SituacaoContribuicao) => contribuicoes.some((c) => c.situacao === s);
  const incompleta = contribuicoes.some(
    (c) => c.nnpDeclarado && c.gDia !== null && c.parcelaNnpGDia === null,
  );
  const exatas = contribuicoes.filter((c) => c.situacao === 'conhecida').map((c) => c.gDia!);
  const motivos: string[] = [];
  let situacao: SituacaoOferta;
  let total: number | null = null;
  if (contribuicoes.length === 0) {
    situacao = 'indeterminada';
    motivos.push('Dieta sem alimentos.');
  } else if (tem('desconhecida')) {
    situacao = contribuicoes.every((c) => c.situacao === 'desconhecida')
      ? 'indeterminada'
      : 'parcial';
    const faltam = contribuicoes.filter((c) => c.situacao === 'desconhecida');
    motivos.push(
      `Contribuição desconhecida de ${faltam.map((c) => c.alimentoNome).join(', ')}: a soma das contribuições conhecidas não é a oferta total.`,
    );
  } else if (tem('limite_inferior') && tem('limite_superior')) {
    situacao = 'limites_mistos';
    motivos.push('Garantias mínimas e máximas na mesma dieta: o total não é valor nem limite.');
  } else {
    total = soma(contribuicoes.map((c) => c.gDia!));
    situacao = tem('limite_inferior')
      ? 'limite_inferior'
      : tem('limite_superior')
        ? 'limite_superior'
        : 'completa';
  }
  return {
    nutriente,
    situacao,
    totalGDia: total,
    somaConhecidaGDia: situacao === 'indeterminada' ? null : soma(exatas),
    concentracaoPctMs:
      total !== null && totalKgMs !== null && totalKgMs > 0
        ? (total / (totalKgMs * 1000)) * 100
        : null,
    parcelaEquivalenteNnpGDia:
      nutriente === 'PB' && contribuicoes.some((c) => c.parcelaNnpGDia !== null) && !incompleta
        ? soma(contribuicoes.filter((c) => c.parcelaNnpGDia !== null).map((c) => c.parcelaNnpGDia!))
        : null,
    parcelaNnpIncompleta: incompleta,
    contribuicoes,
    motivos,
  };
}

/**
 * Oferta da dieta: matéria seca e cada nutriente pedido, com a contribuição de cada alimento.
 * Precisão integral; nenhum arredondamento.
 */
export function calcularOferta(dieta: DietaOferta): ResultadoOferta {
  const itens = dieta.itens.map((i) => calcularItem(dieta.tipo, i));
  const ms = itens.map((i) => i.usadoKgMsDia);
  const mn = itens.map((i) => i.usadoKgMnDia);
  const completos = (xs: (number | null)[]) => xs.length > 0 && xs.every((x) => x !== null);
  const totalKgMs = completos(ms) ? soma(ms as number[]) : null;
  const totalKgMn = completos(mn) ? soma(mn as number[]) : null;
  const motivosMs = itens.flatMap((i) => i.motivos.map((m) => `${i.alimentoNome}: ${m}`));
  if (itens.length === 0) motivosMs.push('Dieta sem alimentos.');
  const nutrientes = dieta.nutrientes
    .filter((n) => n !== 'MS')
    .map((n) =>
      ofertaDoNutriente(
        n,
        dieta.itens.map((item, k) => contribuicao(item, itens[k]!, n)),
        totalKgMs,
      ),
    );
  const avisos = [
    dieta.tipo === 'oferecido'
      ? AVISO_OFERECIDO
      : dieta.tipo === 'consumo_observado'
        ? AVISO_SOBRAS
        : AVISO_ASSUMIDO,
  ];
  return {
    tipo: dieta.tipo,
    naturezaConsumo:
      dieta.tipo === 'oferecido'
        ? 'oferecido'
        : dieta.tipo === 'consumo_observado'
          ? 'consumo_estimado_por_sobras'
          : 'consumo_assumido_simulacao',
    itens,
    materiaSeca: {
      totalKgMsDia: totalKgMs,
      totalKgMnDia: totalKgMn,
      msPctMnDieta:
        totalKgMs !== null && totalKgMn !== null && totalKgMn > 0
          ? (totalKgMs / totalKgMn) * 100
          : null,
      motivos: motivosMs,
    },
    nutrientes,
    avisos,
    perfis: dieta.itens.map((i) => ({
      perfilId: i.perfil.perfilId,
      alimentoId: i.perfil.alimentoId,
      regra: { ...i.perfil.regra },
    })),
  };
}
