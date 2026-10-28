import {
  arredondar,
  dataLocalIso,
  idadeEmMeses,
  interpretarNumero,
  type AlertaPesagem,
  type EscalaEcc,
  type ParametrosAlertasPesagem,
  type UnidadeDose,
} from '@pecuaria/domain';
import { rotulos } from '../textos-rebanho';

/** AAAA-MM-DD → DD/MM/AAAA. */
export function formatarData(data: string | null | undefined): string {
  if (!data) return '—';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function hojeIso(): string {
  return dataLocalIso(new Date());
}

/** Peso vivo em kg, com até 1 casa decimal. */
export function formatarPeso(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '—';
  return `${arredondar(kg, 1).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
}

/** GMD em kg/dia, com 3 casas, e sinal explícito quando negativo. */
export function formatarGmd(kgDia: number): string {
  return `${arredondar(kgDia, 3).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg/dia`;
}

export function formatarGanho(kg: number): string {
  const valor = arredondar(kg, 1).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${kg > 0 ? '+' : ''}${valor} kg`;
}

/** Idade legível: "8 meses", "2 anos e 3 meses". */
export function formatarIdade(nascimento: string | null, referencia: string = hojeIso()): string {
  if (!nascimento) return '—';
  const meses = idadeEmMeses(nascimento, referencia);
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const textoAnos = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return resto === 0 ? textoAnos : `${textoAnos} e ${resto} ${resto === 1 ? 'mês' : 'meses'}`;
}

/** Centavos inteiros → "R$ 1.234,56". */
export function formatarMoeda(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '—';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Texto em reais → centavos inteiros. Vazio vira null; inválido ou ambíguo
 * vira NaN para o esquema acusar (mesma regra dos números: "1.050" é recusado).
 */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/R\$\s*/i, '').trim();
  if (limpo === '') return null;
  const valor = interpretarNumero(limpo);
  return valor === null ? Number.NaN : Math.round(valor * 100);
}

export function formatarDose(dose: number | null, unidade: UnidadeDose | null): string {
  if (dose === null) return '—';
  const numero = dose.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return unidade ? `${numero} ${rotulos.unidadeDose[unidade]}` : numero;
}

export function formatarEcc(escore: number | null, escala: EscalaEcc | null): string {
  if (escore === null) return '—';
  const nota = escore.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return escala ? `${nota} (1 a ${escala === '1_5' ? 5 : 9})` : nota;
}

/** Explicação de um alerta de pesagem, com os números que o geraram. */
export function descreverAlerta(alerta: AlertaPesagem, p: ParametrosAlertasPesagem): string {
  return `${descreverCausa(alerta, p)}${alerta.intervaloCurto ? ` ${AVISO_INTERVALO_CURTO}` : ''}`;
}

/** Em intervalo curto, uma pequena diferença de peso vira um GMD grande. */
export const AVISO_INTERVALO_CURTO =
  'Intervalo curto entre as pesagens: o GMD pode não representar o desempenho do período.';

function descreverCausa(alerta: AlertaPesagem, p: ParametrosAlertasPesagem): string {
  const i = alerta.intervalo;
  const base = `${formatarGanho(i.ganhoKg)} em ${i.dias} ${i.dias === 1 ? 'dia' : 'dias'} (${formatarGmd(i.gmdKgDia)}) desde ${formatarData(i.dataInicial)}`;
  const sugestao =
    alerta.pesoSugeridoKg !== null
      ? ` Você quis dizer ${formatarPeso(alerta.pesoSugeridoKg)}?`
      : '';
  switch (alerta.tipo) {
    case 'gmd_acima':
      return `${base}. Acima da faixa configurada (${formatarGmd(p.gmdMaximoKgDia ?? 0)}). O peso pode estar certo; confira se faz sentido para o animal.`;
    case 'gmd_abaixo':
      return `${base}. ${i.ganhoKg < 0 ? 'Perda de peso' : 'Abaixo da faixa configurada'} (faixa a partir de ${formatarGmd(p.gmdMinimoKgDia ?? 0)}). O peso pode estar certo; confira se faz sentido para o animal.`;
    case 'possivel_digitacao':
      return `${base}. Fora da faixa configurada.${sugestao}`;
    case 'pico_isolado': {
      const s = alerta.intervaloSeguinte;
      const depois = s ? ` e ${formatarGanho(s.ganhoKg)} até ${formatarData(s.dataFinal)}` : '';
      return `${formatarGanho(i.ganhoKg)} desde ${formatarData(i.dataInicial)}${depois}: sobe e desce (ou desce e sobe) fora da faixa configurada.${sugestao}`;
    }
    case 'peso_repetido':
      return `Mesmo peso da pesagem de ${formatarData(i.dataInicial)} (${formatarPeso(i.pesoInicialKg)}). Confira se não foi repetido por engano.`;
  }
}

/** Cor do selo: conferência pede atenção; desempenho é informação. */
export function tomDoAlerta(alerta: AlertaPesagem): 'alerta' | 'marca' {
  return alerta.categoria === 'conferencia' ? 'alerta' : 'marca';
}

export function formatarArea(ha: number | null): string {
  if (ha === null) return '—';
  return `${ha.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`;
}
