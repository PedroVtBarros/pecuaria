import type { SeparadorDecimal } from './enumeracoes';

/**
 * Número como publicado na fonte (decisão D5-3). O texto é gravado exatamente como impresso e o
 * número (`REAL`) é derivado dele só por esta função. Casas decimais indicam a precisão publicada:
 * "12,50" e "12,5" têm o mesmo valor, mas precisões diferentes, e por isso o texto é preservado.
 *
 * O separador decimal vem do registro (como a fonte imprime), nunca é adivinhado: com vírgula,
 * "1.050" é mil e cinquenta; com ponto, é um vírgula zero cinco.
 *
 * Valores censurados ou qualitativos ("<0,01", "ND", "traços") não são números e são recusados
 * aqui. Eles têm registro próprio, sem número, com o significado segundo a fonte
 * (valor-nao-quantificado.ts, Fase 5B-1).
 */
export interface NumeroPublicado {
  /** Texto exatamente como digitado a partir da fonte, sem espaços nas pontas. */
  texto: string;
  valor: number;
  casasDecimais: number;
}

export type LeituraNumeroPublicado =
  { ok: true; numero: NumeroPublicado } | { ok: false; motivo: string };

export const TAMANHO_MAXIMO_NUMERO_PUBLICADO = 30;

const PADROES: Record<SeparadorDecimal, { padrao: RegExp; milhar: string; decimal: string }> = {
  virgula: { padrao: /^-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/, milhar: '.', decimal: ',' },
  ponto: { padrao: /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/, milhar: ',', decimal: '.' },
};

export function lerNumeroPublicado(
  bruto: string,
  separador: SeparadorDecimal,
): LeituraNumeroPublicado {
  const texto = bruto.trim();
  if (texto === '') return { ok: false, motivo: 'Informe o número como publicado.' };
  if (texto.length > TAMANHO_MAXIMO_NUMERO_PUBLICADO)
    return { ok: false, motivo: 'Número publicado longo demais.' };
  const { padrao, milhar, decimal } = PADROES[separador];
  const encontrado = padrao.exec(texto);
  if (!encontrado)
    return {
      ok: false,
      motivo:
        separador === 'virgula'
          ? 'Número inválido para fonte com vírgula decimal (ex.: 12,5 ou 1.050,25). Valores como "<0,01", "ND" ou "traços" não são números: registre-os como valor não quantificado.'
          : 'Número inválido para fonte com ponto decimal (ex.: 12.5 ou 1,050.25). Valores como "<0.01", "ND" ou "traços" não são números: registre-os como valor não quantificado.',
    };
  const normalizado = texto.split(milhar).join('').replace(decimal, '.');
  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return { ok: false, motivo: 'Número fora do intervalo aceito.' };
  return {
    ok: true,
    // `-0` vira 0: o sinal não carrega informação e o banco compararia diferente.
    numero: { texto, valor: valor === 0 ? 0 : valor, casasDecimais: encontrado[1]?.length ?? 0 },
  };
}

/** Versão que lança erro, para os serviços (a mensagem vai para a tela). */
export function exigirNumeroPublicado(bruto: string, separador: SeparadorDecimal): NumeroPublicado {
  const leitura = lerNumeroPublicado(bruto, separador);
  if (!leitura.ok) throw new Error(leitura.motivo);
  return leitura.numero;
}
