import type { OrigemFonte, SeparadorDecimal, TipoValor } from './enumeracoes';
import { tiposValorPermitidos } from './regras-alimentos';
import { DEFINICOES_UNIDADE, mesmaGrandeza, type UnidadeNutricional } from './unidades';
import { lerNumeroPublicado, TAMANHO_MAXIMO_NUMERO_PUBLICADO } from './valor-publicado';

/**
 * Valor não quantificado (ajuste do usuário na aprovação da 5A, 2026-10-21): "<0,01", "ND",
 * "traços" e afins. O texto publicado e o significado que a FONTE dá a ele são preservados; nada
 * vira número, nem o limite de "<0,01". Fica em tabela própria, sem coluna numérica, para que
 * nenhum cálculo o leia como valor.
 *
 * A natureza é escolhida por quem transcreve, a partir da legenda ou do texto da fonte, nunca
 * adivinhada pelo símbolo: "ND" pode ser "não detectado" ou "não determinado", conforme a fonte.
 */
export const NATUREZAS_NAO_QUANTIFICADO = [
  'abaixo_do_limite',
  'acima_do_limite',
  'nao_detectado',
  'tracos',
  'nao_determinado',
  'simbolo_sem_definicao',
] as const;
export type NaturezaNaoQuantificado = (typeof NATUREZAS_NAO_QUANTIFICADO)[number];

/** Símbolos que abrem o texto de um limite ("<0,01", "≤ 5"). */
const SIMBOLOS_ABAIXO = ['<', '≤'] as const;
const SIMBOLOS_ACIMA = ['>', '≥'] as const;

export const TAMANHO_MAXIMO_SIGNIFICADO = 500;

/**
 * Origens que publicam valores não quantificados: tabela, estudo e laudo. Rótulo traz garantias
 * numéricas e medição própria registra só a MS medida (D5-8).
 */
export function aceitaNaoQuantificado(origem: OrigemFonte): boolean {
  return (
    origem === 'tabela_compilada' || origem === 'estudo_individual' || origem === 'laboratorial'
  );
}

export interface NaoQuantificadoParaConferir {
  textoPublicado: string;
  natureza: NaturezaNaoQuantificado;
  significadoFonte: string;
  unidade: UnidadeNutricional;
  tipoValor: TipoValor;
}

export interface ContextoNaoQuantificado {
  origem: OrigemFonte;
  unidadeReferencia: UnidadeNutricional;
  codigoNutriente: string;
  separador: SeparadorDecimal;
}

/**
 * Problemas antes de gravar. Lista vazia = aceito. O limite depois de "<" ou ">" só é conferido
 * como número legível com o separador da fonte (para pegar erro de digitação); não é gravado como
 * número nem usado em cálculo.
 */
export function problemasDoNaoQuantificado(
  v: NaoQuantificadoParaConferir,
  ctx: ContextoNaoQuantificado,
): string[] {
  const p: string[] = [];
  const texto = v.textoPublicado.trim();
  if (!aceitaNaoQuantificado(ctx.origem))
    p.push('Só tabela, estudo e laudo registram valor não quantificado.');
  if (texto === '') p.push('Informe o texto exatamente como publicado (ex.: <0,01, ND, traços).');
  else if (texto.length > TAMANHO_MAXIMO_NUMERO_PUBLICADO) p.push('Texto publicado longo demais.');
  else if (lerNumeroPublicado(texto, ctx.separador).ok)
    p.push('O texto é um número: registre como valor numérico.');
  else {
    const simbolo = texto[0]!;
    const abaixo = (SIMBOLOS_ABAIXO as readonly string[]).includes(simbolo);
    const acima = (SIMBOLOS_ACIMA as readonly string[]).includes(simbolo);
    if (v.natureza === 'abaixo_do_limite' || v.natureza === 'acima_do_limite') {
      const esperado = v.natureza === 'abaixo_do_limite' ? abaixo : acima;
      if (!esperado)
        p.push(
          v.natureza === 'abaixo_do_limite'
            ? 'Abaixo do limite: o texto começa com "<" ou "≤", como na fonte.'
            : 'Acima do limite: o texto começa com ">" ou "≥", como na fonte.',
        );
      else if (!lerNumeroPublicado(texto.slice(1), ctx.separador).ok)
        p.push(
          'Depois do símbolo vem o limite como publicado, com o separador decimal do registro.',
        );
    } else if (abaixo || acima)
      p.push('Texto com "<" ou ">" é um limite: escolha "abaixo do limite" ou "acima do limite".');
  }
  if (v.significadoFonte.trim() === '')
    p.push(
      'Informe o significado segundo a fonte (legenda, nota ou texto). Se a fonte não define o símbolo, diga onde ele aparece.',
    );
  else if (v.significadoFonte.trim().length > TAMANHO_MAXIMO_SIGNIFICADO)
    p.push('Significado longo demais.');
  if (!mesmaGrandeza(v.unidade, ctx.unidadeReferencia))
    p.push(
      `A unidade ${DEFINICOES_UNIDADE[v.unidade].simbolo} não é da mesma grandeza da unidade de referência de ${ctx.codigoNutriente} (${DEFINICOES_UNIDADE[ctx.unidadeReferencia].simbolo}).`,
    );
  if (
    v.tipoValor === 'minimo_garantido' ||
    v.tipoValor === 'maximo_garantido' ||
    !tiposValorPermitidos(ctx.origem).includes(v.tipoValor)
  )
    p.push('Tipo de valor incompatível com a origem.');
  return p;
}
