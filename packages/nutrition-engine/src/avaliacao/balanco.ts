import type { Resultado } from '../nucleo/tipos';
import { q } from '../nucleo/unidades';
import type { FonteCms } from '../br-corte-2023/energia';
import type { ResultadoProteina } from '../br-corte-2023/proteina';
import type { ResultadoMinerais } from '../br-corte-2023/minerais';
import { NIVEIS_TOXICOS_MACRO } from '../br-corte-2023/dados/toxicidade';
import type { OfertaNutriente, ResultadoOferta, SituacaoOferta } from './oferta';

/*
 * Balanço exigência × oferta (entrega 6B-2; PLANO_FASE_6.md, seções 9.4 a 9.7). Compara a
 * exigência calculada pelo motor (6A) com a oferta da dieta (6B-1), nutriente por nutriente,
 * sem misturar os dois (regra 3e).
 *
 * Situações (C-6B-05, ajustada): "cobertura teórica", "déficit estimado" ou "indeterminado".
 * Nenhum resultado declara adequação nutricional completa. Conclusão a partir de garantia de
 * rótulo só quando é matematicamente fundamentada: limite inferior acima da exigência dá
 * cobertura; limite superior abaixo da exigência dá déficit; o resto fica indeterminado. Oferta
 * parcial (contribuição desconhecida) nunca conclui. Exigência sem uso operacional (fora do
 * domínio, do escopo ou indeterminada) fica indisponível para comparação.
 */

export const SITUACOES_BALANCO = [
  'cobertura_teorica',
  'deficit_estimado',
  'indeterminado',
] as const;
export type SituacaoBalanco = (typeof SITUACOES_BALANCO)[number];

/** Nutrientes do balanço, na ordem (C-6B-02 a 04). */
export const NUTRIENTES_BALANCO = [
  'NDT',
  'PB',
  'PDR',
  'PNDR',
  'PM',
  'Ca',
  'P',
  'Mg',
  'Na',
  'K',
  'S',
] as const;
export type NutrienteBalanco = (typeof NUTRIENTES_BALANCO)[number];

/** Exigências do motor que o balanço usa. */
export interface ExigenciasParaBalanco {
  CMS: Resultado;
  NDT: Resultado;
  PB: Resultado;
  PDR: Resultado;
  PNDR: Resultado;
  PMt: Resultado;
  minerais: ResultadoMinerais;
}

export function exigenciasParaBalanco(
  proteina: ResultadoProteina,
  minerais: ResultadoMinerais,
): ExigenciasParaBalanco {
  const { CMS, NDT, PB, PDR, PNDR, PMt } = proteina;
  return { CMS, NDT, PB, PDR, PNDR, PMt, minerais };
}

export interface ComparacaoNutriente {
  nutriente: NutrienteBalanco;
  situacao: SituacaoBalanco;
  /** Tudo em g/dia. */
  exigencia: {
    gDia: number | null;
    usoOperacional: boolean;
    situacaoMotor: Resultado['situacao'] | null;
    equacaoId: string | null;
  };
  oferta: {
    situacao: SituacaoOferta | null;
    /** Total ("completa") ou limite (garantias); null se parcial ou indeterminada. */
    gDia: number | null;
    somaConhecidaGDia: number | null;
    /** Só na PB: parte que é PB equivalente de NNP; não é proteína verdadeira nem PM (D-6B1-04). */
    parcelaEquivalenteNnpGDia: number | null;
    /** Algum alimento declara NNP sem parcela calculada: parcela total desconhecida. */
    parcelaNnpIncompleta: boolean;
  };
  /** Oferta – exigência e oferta / exigência × 100: só com oferta completa. */
  diferencaGDia: number | null;
  coberturaPct: number | null;
  /**
   * Oferta parcial: piso das contribuições conhecidas (g/dia). Não é total nem permite conclusão
   * (D-6B2-01).
   */
  pisoConhecidoGDia: number | null;
  /** Só informação (D-6B2-03): exigência e oferta em % da MS consumida. */
  concentracao: { exigenciaPctMs: number | null; ofertaPctMs: number | null };
  /**
   * PB com equivalente de NNP (D-6B2-04): a cobertura é numérica, de PB equivalente; não afirma
   * atendimento proteico operacional. Traz a cobertura sem o NNP para comparação.
   */
  pbEquivalente: { parcelaNnpGDia: number | null; coberturaSemNnpPct: number | null } | null;
  /** Por que a conclusão é essa (ou por que não há conclusão). */
  fundamento: string;
  motivos: string[];
}

/** Alerta de segurança da Tabela 10.13 (p. 263; C-6B-14, D-6B2-05): informativo. */
export interface AlertaSeguranca {
  mineral: string;
  concentracaoGKgMs: number;
  nivelToxicoGKgMs: number;
  fonteCitada: string;
  texto: string;
}

/** Relação Ca/P: indicador, nunca critério de adequação (D-MIN-09; 6B-2). */
export interface IndicadorCaP {
  exigencia: number | null;
  oferta: number | null;
  motivos: string[];
}

export interface ResultadoBalanco {
  naturezaConsumo: ResultadoOferta['naturezaConsumo'];
  cmsExigenciaKgDia: number | null;
  msConsumidaKgDia: number | null;
  comparacoes: ComparacaoNutriente[];
  indicadorCaP: IndicadorCaP;
  /**
   * Alertas da Tabela 10.13, só com concentração mineral completa e base válida. Não alteram o
   * balanço nem diagnosticam intoxicação; ausência de alerta não garante segurança.
   */
  seguranca: { alertas: AlertaSeguranca[]; naoAvaliados: string[]; nota: string };
  resumo: Record<SituacaoBalanco, number>;
  avisos: string[];
}

export const NOTA_SEGURANCA =
  'Alerta informativo pelos níveis tóxicos citados na Tabela 10.13 (p. 263, fontes secundárias): não diagnostica intoxicação, e a ausência de alerta não garante segurança.';

export const FRASE_BALANCO =
  'Cobertura teórica dos nutrientes comparados, com composições de referência: não é adequação nutricional completa. Composições médias de referência não garantem o desempenho previsto.';

/**
 * CMS para calcular a exigência com a mesma MS que o animal consome (C-6B-01): a MS consumida
 * (observada ou assumida), como CMS informado. null se a dieta é só oferecida ou sem MS total.
 */
export function fonteCmsDaOferta(oferta: ResultadoOferta): FonteCms | null {
  const ms = oferta.materiaSeca.totalKgMsDia;
  if (oferta.tipo === 'oferecido' || ms === null || !(ms > 0)) return null;
  return { origem: 'informado', CMS: q(ms, 'kg/dia') };
}

const G_POR_KG = 1000;
const DEPENDEM_DO_CMS: readonly NutrienteBalanco[] = ['NDT', 'PB', 'PDR', 'PNDR', 'PM'];
/** Sem oferta possível sem dados de degradação ruminal (C5): sempre indeterminados. */
export const SEM_OFERTA_C5: readonly NutrienteBalanco[] = ['PDR', 'PNDR', 'PM'];

function exigenciaEmG(e: ExigenciasParaBalanco, n: NutrienteBalanco): Resultado {
  switch (n) {
    case 'NDT':
      return e.NDT;
    case 'PB':
      return e.PB;
    case 'PDR':
      return e.PDR;
    case 'PNDR':
      return e.PNDR;
    case 'PM':
      return e.PMt;
    default:
      return e.minerais[n].dietetica;
  }
}
/** Fator para g/dia a partir da unidade da exigência (NDT em kg/dia; o resto em g/dia). */
const paraG = (r: Resultado) => (r.unidade === 'kg/dia' ? G_POR_KG : 1);

function comparar(
  n: NutrienteBalanco,
  exig: Resultado,
  oferta: OfertaNutriente | undefined,
  bloqueio: string | null,
  msConsumidaKg: number | null,
): ComparacaoNutriente {
  const exigencia = {
    gDia: exig.valor === null ? null : exig.valor * paraG(exig),
    usoOperacional: exig.usoOperacional,
    situacaoMotor: exig.situacao,
    equacaoId: exig.equacaoId,
  };
  const of = {
    situacao: oferta?.situacao ?? null,
    gDia: oferta?.totalGDia ?? null,
    somaConhecidaGDia: oferta?.somaConhecidaGDia ?? null,
    parcelaEquivalenteNnpGDia: oferta?.parcelaEquivalenteNnpGDia ?? null,
    parcelaNnpIncompleta: oferta?.parcelaNnpIncompleta ?? false,
  };
  const pct = (g: number | null) =>
    g !== null && msConsumidaKg !== null && msConsumidaKg > 0
      ? (g / (msConsumidaKg * G_POR_KG)) * 100
      : null;
  const base = {
    nutriente: n,
    exigencia,
    oferta: of,
    diferencaGDia: null,
    coberturaPct: null,
    pisoConhecidoGDia: oferta?.situacao === 'parcial' ? (oferta.somaConhecidaGDia ?? null) : null,
    concentracao: {
      exigenciaPctMs: exig.usoOperacional ? pct(exigencia.gDia) : null,
      ofertaPctMs: oferta?.concentracaoPctMs ?? null,
    },
    pbEquivalente: null,
  };
  const indeterminado = (fundamento: string, motivos: string[] = []): ComparacaoNutriente => ({
    ...base,
    situacao: 'indeterminado',
    fundamento,
    motivos,
  });
  if (bloqueio) return indeterminado(bloqueio);
  if (SEM_OFERTA_C5.includes(n))
    return indeterminado(
      'Oferta de PDR, PNDR e PM exige dados de degradação ruminal dos alimentos, que não existem (C5).',
    );
  if (!exig.usoOperacional || exigencia.gDia === null)
    return indeterminado(
      'Exigência indisponível para comparação operacional (fora do domínio validado, fora do escopo ou não calculada).',
      [...exig.motivos],
    );
  if (!oferta || oferta.situacao === 'indeterminada')
    return indeterminado('Oferta do nutriente indeterminada: nenhuma contribuição conhecida.', [
      ...(oferta?.motivos ?? [`${n} não pedido na oferta.`]),
    ]);
  const x = exigencia.gDia;
  switch (oferta.situacao) {
    case 'completa': {
      const t = oferta.totalGDia!;
      const nnp = of.parcelaEquivalenteNnpGDia;
      const incompleta = n === 'PB' && of.parcelaNnpIncompleta;
      const comNnp = n === 'PB' && ((nnp !== null && nnp > 0) || incompleta);
      return {
        ...base,
        situacao: t >= x ? 'cobertura_teorica' : 'deficit_estimado',
        diferencaGDia: t - x,
        coberturaPct: x > 0 ? (t / x) * 100 : null,
        pbEquivalente: comNnp
          ? {
              parcelaNnpGDia: nnp,
              coberturaSemNnpPct: nnp !== null && x > 0 ? ((t - nnp) / x) * 100 : null,
            }
          : null,
        fundamento: comNnp
          ? 'Cobertura numérica de PB equivalente, que inclui NNP: não afirma atendimento proteico operacional (D-6B2-04).'
          : t >= x
            ? 'Oferta completa igual ou acima da exigência.'
            : 'Oferta completa abaixo da exigência.',
        motivos: comNnp
          ? [
              'A PB ofertada inclui PB equivalente de NNP, que não é proteína verdadeira nem PM ofertada; PM, PDR e PNDR ofertadas continuam indeterminadas.',
              ...(incompleta
                ? [
                    'Parcela de NNP de algum alimento não calculada: a cobertura sem NNP fica desconhecida.',
                  ]
                : []),
            ]
          : [],
      };
    }
    case 'limite_inferior':
      return oferta.totalGDia! >= x
        ? {
            ...base,
            situacao: 'cobertura_teorica',
            fundamento:
              'O limite inferior garantido da oferta já alcança a exigência: a oferta real é igual ou maior.',
            motivos: [],
          }
        : indeterminado(
            'O limite inferior garantido fica abaixo da exigência: a oferta real pode estar acima ou abaixo.',
          );
    case 'limite_superior':
      return oferta.totalGDia! < x
        ? {
            ...base,
            situacao: 'deficit_estimado',
            fundamento:
              'O limite superior garantido da oferta fica abaixo da exigência: a oferta real também fica.',
            motivos: [],
          }
        : indeterminado(
            'O limite superior garantido alcança a exigência: a oferta real pode estar acima ou abaixo.',
          );
    case 'limites_mistos':
      return indeterminado('Garantias mínimas e máximas na mesma dieta: sem total nem limite.', [
        ...oferta.motivos,
      ]);
    case 'parcial':
      return indeterminado(
        'Oferta parcial: há alimento com contribuição desconhecida; a soma das contribuições conhecidas não é a oferta total.',
        [...oferta.motivos],
      );
    default:
      return indeterminado('Oferta sem situação reconhecida.');
  }
}

/**
 * Balanço de cada nutriente do escopo. A exigência deve ter sido calculada com a MS consumida
 * como CMS (`fonteCmsDaOferta`); senão, os nutrientes que dependem do CMS ficam indeterminados.
 */
export function calcularBalanco(
  exigencias: ExigenciasParaBalanco,
  oferta: ResultadoOferta,
): ResultadoBalanco {
  const msConsumida = oferta.materiaSeca.totalKgMsDia;
  const cmsExig = exigencias.CMS.valor;
  const avisos = [FRASE_BALANCO];
  const consumo =
    oferta.tipo === 'oferecido'
      ? 'Balanço exige consumo (observado ou assumido sem sobras); quantidade oferecida não é consumo (C-6B-01).'
      : null;
  let semCms: string | null = null;
  if (msConsumida === null)
    semCms = 'MS consumida da dieta indeterminada: não há CMS coerente para a exigência.';
  else if (cmsExig === null) semCms = 'CMS da exigência não calculado.';
  else if (Math.abs(cmsExig - msConsumida) > 1e-9 * Math.max(1, msConsumida))
    semCms = `Exigência calculada com CMS diferente da MS consumida pela dieta; recalcule a exigência com a MS consumida (C-6B-01).`;
  if (oferta.tipo === 'consumo_assumido_sem_sobras')
    avisos.push('Consumo assumido sem sobras: balanço de simulação, não de consumo medido.');
  if (oferta.tipo === 'consumo_observado')
    avisos.push('Consumo estimado pelas sobras: o balanço herda a estimativa (D-6B1-01).');
  const porNutriente = new Map(oferta.nutrientes.map((o) => [o.nutriente, o]));
  const comparacoes = NUTRIENTES_BALANCO.map((n) =>
    comparar(
      n,
      exigenciaEmG(exigencias, n),
      porNutriente.get(n),
      consumo ?? (DEPENDEM_DO_CMS.includes(n) ? semCms : null),
      consumo ? null : msConsumida,
    ),
  );
  const resumo = Object.fromEntries(
    SITUACOES_BALANCO.map((s) => [s, comparacoes.filter((c) => c.situacao === s).length]),
  ) as Record<SituacaoBalanco, number>;
  if (resumo.indeterminado > 0)
    avisos.push(
      `Avaliação parcial: ${resumo.indeterminado} de ${comparacoes.length} nutrientes sem conclusão.`,
    );
  return {
    naturezaConsumo: oferta.naturezaConsumo,
    cmsExigenciaKgDia: cmsExig,
    msConsumidaKgDia: msConsumida,
    comparacoes,
    indicadorCaP: indicadorCaP(exigencias, porNutriente.get('Ca'), porNutriente.get('P')),
    seguranca: alertasSeguranca(porNutriente),
    resumo,
    avisos,
  };
}

/** Concentração do mineral na MS da dieta contra o nível tóxico citado (≥ dispara o alerta). */
function alertasSeguranca(
  porNutriente: Map<string, OfertaNutriente>,
): ResultadoBalanco['seguranca'] {
  const alertas: AlertaSeguranca[] = [];
  const naoAvaliados: string[] = [];
  for (const [mineral, nivel] of Object.entries(NIVEIS_TOXICOS_MACRO)) {
    const o = porNutriente.get(mineral);
    if (!o || o.situacao !== 'completa' || o.concentracaoPctMs === null) {
      naoAvaliados.push(mineral);
      continue;
    }
    const gKg = o.concentracaoPctMs * 10;
    if (gKg >= nivel.gKgMs.valor)
      alertas.push({
        mineral,
        concentracaoGKgMs: gKg,
        nivelToxicoGKgMs: nivel.gKgMs.valor,
        fonteCitada: nivel.fonteCitada,
        texto: `${mineral} na MS da dieta igual ou acima do nível tóxico citado na Tabela 10.13 (${nivel.gKgMs.impresso} g/kg de MS; ${nivel.fonteCitada}). Alerta informativo: não diagnostica intoxicação.`,
      });
  }
  return { alertas, naoAvaliados, nota: NOTA_SEGURANCA };
}

function indicadorCaP(
  e: ExigenciasParaBalanco,
  ca: OfertaNutriente | undefined,
  p: OfertaNutriente | undefined,
): IndicadorCaP {
  const motivos: string[] = ['Indicador: relação Ca/P, não critério de adequação.'];
  const exig = e.minerais.CaP;
  const exigencia = exig.usoOperacional ? exig.valor : null;
  if (!exig.usoOperacional) motivos.push('Ca/P das exigências sem uso operacional.');
  let oferta: number | null = null;
  if (ca?.situacao === 'completa' && p?.situacao === 'completa' && p.totalGDia! > 0)
    oferta = ca.totalGDia! / p.totalGDia!;
  else motivos.push('Ca/P da oferta só com Ca e P completos (P maior que zero).');
  return { exigencia, oferta, motivos };
}
