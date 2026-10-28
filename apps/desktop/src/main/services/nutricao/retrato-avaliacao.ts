import { createHash } from 'node:crypto';
import { SEM_OFERTA_C5, type ResultadoBalanco } from '@pecuaria/nutrition-engine';
import type {
  AvaliacaoDietaCalculada,
  PerfilAvaliado,
  SituacaoAvaliacaoCalculada,
} from '@pecuaria/shared-types';

/*
 * Retrato da avaliação nutricional (6B-4 e decisões D-6B4-01 e 02): o que é gravado, como vira
 * texto sem perda e como o SHA-256 é calculado. O mesmo hash vai para a tela na simulação e é
 * conferido ao gravar: retrato recalculado diferente do exibido não é gravado.
 */

/**
 * Versão do formato do retrato. 1: 6B-4. 2: situação do cálculo (parcial, uso operacional e
 * bloqueios, D-6B4-01) dentro de resultado_json.
 */
export const FORMATO_AVALIACAO = 2;

/**
 * Texto JSON que volta exatamente ao mesmo valor: recusa número não finito (viraria null),
 * `undefined` em lista (viraria null), função, símbolo e bigint. `undefined` em campo de objeto
 * equivale a campo ausente.
 */
export function jsonFiel(valor: unknown, onde: string): string {
  const conferir = (v: unknown, caminho: string): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error(`${caminho}: número não finito (${v}).`);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, k) => {
        if (x === undefined) throw new Error(`${caminho}[${k}]: valor indefinido em lista.`);
        conferir(x, `${caminho}[${k}]`);
      });
      return;
    }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>))
        if (x !== undefined) conferir(x, `${caminho}.${k}`);
      return;
    }
    throw new Error(`${caminho}: tipo ${typeof v} não cabe em JSON.`);
  };
  conferir(valor, onde);
  return JSON.stringify(valor);
}

export interface PartesRetrato {
  formatoVersao: number;
  versaoMotor: string;
  tipoQuantidade: string;
  fonteJson: string;
  entradaJson: string;
  hipotesesJson: string;
  perfisJson: string;
  resultadoJson: string;
}

/** SHA-256 do retrato, sobre o texto exatamente como gravado. */
export function hashDoRetrato(partes: PartesRetrato): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        partes.formatoVersao,
        partes.versaoMotor,
        partes.tipoQuantidade,
        partes.fonteJson,
        partes.entradaJson,
        partes.hipotesesJson,
        partes.perfisJson,
        partes.resultadoJson,
      ]),
    )
    .digest('hex');
}

/** Partes do retrato; lança erro se algo não couber em JSON sem perda. */
export function partesDoRetrato(
  c: Omit<AvaliacaoDietaCalculada, 'conteudoSha256' | 'naoGravavel'>,
): PartesRetrato {
  return {
    formatoVersao: FORMATO_AVALIACAO,
    versaoMotor: c.versaoMotor,
    tipoQuantidade: c.entrada.dieta.tipo,
    fonteJson: jsonFiel(c.fonte, 'fonte'),
    entradaJson: jsonFiel(c.entrada, 'entrada'),
    hipotesesJson: jsonFiel(c.hipoteses, 'hipoteses'),
    perfisJson: jsonFiel(c.perfis, 'perfis'),
    resultadoJson: jsonFiel(
      {
        cmsPrevisto: c.cmsPrevisto,
        exigencias: c.exigencias,
        oferta: c.oferta,
        balanco: c.balanco,
        situacao: c.situacao,
      },
      'resultado',
    ),
  };
}

/**
 * D-6B4-01: avaliação parcial pode ser gravada; perfil inelegível nunca produz avaliação
 * operacional. Parcial: perfil fora do cálculo ou comparação indeterminada (exceto PDR, PNDR e
 * PM, sempre indeterminadas por falta de dados de degradação ruminal, C5).
 */
export function situacaoDoCalculo(
  perfis: readonly PerfilAvaliado[],
  balanco: ResultadoBalanco,
): SituacaoAvaliacaoCalculada {
  const inelegiveis = perfis.filter((p) => !p.elegivel);
  const bloqueios = inelegiveis.map(
    (p) =>
      `Perfil "${p.nome}" (${p.alimentoNome}) inelegível: ${p.motivosInelegibilidade.join(' ')} Não produz avaliação operacional (D-6B4-01).`,
  );
  const motivosParcial = [
    ...inelegiveis.map((p) => `Perfil "${p.nome}" fora do cálculo (inelegível).`),
    ...balanco.comparacoes
      .filter((c) => c.situacao === 'indeterminado' && !SEM_OFERTA_C5.includes(c.nutriente))
      .map((c) => `${c.nutriente}: indeterminado. ${c.fundamento}`),
  ];
  return {
    parcial: motivosParcial.length > 0,
    motivosParcial,
    usoOperacional: bloqueios.length === 0,
    bloqueios,
  };
}
