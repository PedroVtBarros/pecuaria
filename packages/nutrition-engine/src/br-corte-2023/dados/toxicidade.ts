import type { Coeficiente } from '../../nucleo/tipos';

/*
 * Níveis tóxicos de macrominerais da Tabela 10.13 do BR-CORTE 2023 (p. 263), como impressos,
 * conferidos na imagem da página (INVENTARIO_BR_CORTE.md, seção 18.2). Valores "obtidos da
 * literatura" pelo livro: a fonte citada de cada um vem na tabela. P não consta. Microminerais
 * fora do escopo (C3). Uso só em alerta informativo (C-6B-14, D-6B2-05).
 */
const k = (impresso: string): Coeficiente => ({
  valor: Number(impresso.replace(',', '.')),
  impresso,
  referencia: { capitulo: 10, pagina: 263, local: 'Tabela 10.13' },
});

export const NIVEIS_TOXICOS_MACRO: Readonly<
  Record<'Ca' | 'K' | 'Mg' | 'Na' | 'S', { gKgMs: Coeficiente; fonteCitada: string }>
> = {
  Ca: { gKgMs: k('44'), fonteCitada: 'NRC (2000)' },
  K: { gKgMs: k('20'), fonteCitada: 'NASEM (2016)' },
  Mg: { gKgMs: k('4'), fonteCitada: 'NRC (2000)' },
  Na: { gKgMs: k('65'), fonteCitada: 'NRC (2000)' },
  S: { gKgMs: k('4'), fonteCitada: 'NRC (2000)' },
};
