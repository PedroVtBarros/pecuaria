import {
  BR_CORTE_2023,
  calcularMinerais,
  calcularProteina,
  CMS_INFORMADO_NO,
  EQUACOES_CMS,
  EQUACOES_ENERGIA,
  EQUACOES_MINERAIS,
  EQUACOES_PESO,
  EQUACOES_PROTEINA,
  MACROMINERAIS,
  q,
  RELACAO_CA_P_EQ,
  VERSAO_MOTOR,
  type Categoria,
  type EquacaoRegistrada,
  type FonteCms,
  type Resultado,
  type ResultadoProteina,
} from '@pecuaria/nutrition-engine';
import type {
  EntradaExigencias,
  ExigenciasCalculadas,
  GrupoResultadoExigencia,
  ItemExigencia,
  SituacaoExigencia,
} from '@pecuaria/shared-types';

/*
 * Fase 6A-7: exigências nutricionais de um animal pelo BR-CORTE 2023, calculadas na hora pelo
 * motor (`@pecuaria/nutrition-engine`), sem banco: nada é gravado (A4). O serviço só traduz a
 * entrada validada para o motor e devolve cada resultado com a equação, as páginas, os
 * coeficientes, as entradas, a situação e os motivos, para a tela mostrar "como foi calculado".
 * Exigência do animal, não oferta da dieta (regra 3e).
 */

const EQUACOES: ReadonlyMap<string, EquacaoRegistrada> = new Map(
  [
    ...EQUACOES_PESO,
    ...EQUACOES_ENERGIA,
    ...EQUACOES_CMS,
    ...EQUACOES_PROTEINA,
    ...MACROMINERAIS.flatMap((m) => EQUACOES_MINERAIS[m]),
    RELACAO_CA_P_EQ,
    CMS_INFORMADO_NO,
  ].map((e) => [e.id, e]),
);

/** Nós mostrados em cada grupo, na ordem da tela. */
const NOS: Readonly<
  Record<Exclude<GrupoResultadoExigencia, 'minerais'>, readonly (keyof ResultadoProteina)[]>
> = {
  peso: ['PCJ', 'PCVZ', 'PCVZeq', 'GPCVZ'],
  cms: ['CMS'],
  energia: ['ELm', 'ELg', 'ERprot', 'kg', 'km', 'EMm', 'EMg', 'EMtotal', 'ED', 'NDT', 'NDTpct'],
  proteina: [
    'PMm',
    'PLg',
    'kProteina',
    'PMg',
    'PMt',
    'PBmic',
    'PDR',
    'PNDR',
    'PB',
    'PBpctMS',
    'PDRpctPB',
    'PNDRpctPB',
  ],
};

function fonteCms(cms: EntradaExigencias['cms']): FonteCms {
  switch (cms.fonte) {
    case 'informado':
      return { origem: 'informado', CMS: q(cms.cmsKgDia, 'kg/dia') };
    case 'confinamento':
      return { origem: 'previsto', equacao: 'confinamento' };
    case 'concentrado':
      return { origem: 'previsto', equacao: 'concentrado', NC: q(cms.ncPctMs, '% MS') };
    case 'pasto':
      return { origem: 'previsto', equacao: 'pasto', CMSs: q(cms.cmssKgDia, 'kg/dia') };
    case 'terminacao_intensiva_pasto':
      return { origem: 'previsto', equacao: 'terminacao_intensiva_pasto' };
  }
}

function item(chave: string, r: Resultado): ItemExigencia {
  const e = EQUACOES.get(r.equacaoId);
  return {
    chave,
    equacaoId: r.equacaoId,
    descricao: e?.descricao ?? r.equacaoId,
    referencias: e ? e.referencias.map((x) => ({ ...x })) : [],
    situacao: r.situacao,
    valor: r.valor,
    unidade: r.unidade,
    usoOperacional: r.usoOperacional,
    motivos: [...r.motivos],
    avisos: [...r.avisos],
    notas: [...r.notas],
    coeficientes: { ...r.coeficientes },
    entradas: Object.fromEntries(
      Object.entries(r.entradas).map(([n, v]) => [n, { valor: v.valor, unidade: v.unidade }]),
    ),
    aprovacao: e?.conferencia.aprovacaoUsuario ? { ...e.conferencia.aprovacaoUsuario } : null,
  };
}

export class ServicoExigencias {
  calcular(entrada: EntradaExigencias): ExigenciasCalculadas {
    const c: Categoria = { grupo: entrada.grupo, sexo: entrada.sexo, sistema: entrada.sistema };
    const PC = q(entrada.pcKg, 'kg');
    const GMD = q(entrada.gmdKgDia, 'kg/dia');
    const proteina = calcularProteina(c, { PC, GMD, cms: fonteCms(entrada.cms) });
    const minerais = calcularMinerais(c, { PC, GMD });
    const grupos = {
      peso: NOS.peso.map((n) => item(n, proteina[n])),
      cms: NOS.cms.map((n) => item(n, proteina[n])),
      energia: NOS.energia.map((n) => item(n, proteina[n])),
      proteina: NOS.proteina.map((n) => item(n, proteina[n])),
      minerais: [
        ...MACROMINERAIS.flatMap((m) =>
          (['mantenca', 'ganho', 'liquida', 'dietetica'] as const).map((etapa) =>
            item(`${m}.${etapa}`, minerais[m][etapa]),
          ),
        ),
        item('CaP', minerais.CaP),
      ],
    } satisfies Record<GrupoResultadoExigencia, ItemExigencia[]>;
    const todos = Object.values(grupos).flat();
    const conta = (s: SituacaoExigencia) => todos.filter((i) => i.situacao === s).length;
    return {
      fonte: { ...BR_CORTE_2023 },
      versaoMotor: VERSAO_MOTOR,
      entrada,
      cmsUsado: {
        origem: entrada.cms.fonte === 'informado' ? 'informado' : 'previsto',
        equacaoId: proteina.CMS.equacaoId,
      },
      grupos,
      resumo: {
        valido: conta('valido'),
        fora_do_dominio: conta('fora_do_dominio'),
        fora_do_escopo: conta('fora_do_escopo'),
        indeterminado: conta('indeterminado'),
        total: todos.length,
      },
    };
  }
}
