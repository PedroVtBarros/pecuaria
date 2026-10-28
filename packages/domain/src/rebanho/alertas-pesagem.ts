import { arredondar } from '../comum/numeros';
import { PESO_VIVO_MAXIMO_KG } from './enumeracoes';
import { analisarGmd, type IntervaloGmd, type PesagemParaGmd } from './gmd';

/**
 * Alertas de pesagem atípica. Nunca bloqueiam: a pesagem é gravada mesmo com
 * alerta. Há duas categorias:
 * - conferência: o padrão sugere erro de registro (digitação, peso repetido,
 *   pesagem fora da tendência);
 * - desempenho: o GMD saiu da faixa configurada. O peso pode estar certo;
 *   perda ou ganho alto não significam erro.
 *
 * Os limites NÃO são referências zootécnicas. São parâmetros operacionais
 * definidos pelo usuário (Configurações). Os valores iniciais existem só para
 * o recurso funcionar no primeiro uso e devem ser ajustados ao rebanho.
 */
export interface ParametrosAlertasPesagem {
  /** GMD observado acima deste valor (kg/dia) gera alerta. `null` desliga. */
  gmdMaximoKgDia: number | null;
  /** GMD observado abaixo deste valor (kg/dia) gera alerta. 0 = qualquer perda de peso. `null` desliga. */
  gmdMinimoKgDia: number | null;
  /**
   * Intervalos com menos dias que este são marcados como curtos: neles uma
   * pequena diferença de peso vira um GMD grande, pouco representativo do
   * período. Só muda a apresentação. `null` desliga a marcação.
   */
  intervaloCurtoDias: number | null;
}

/** Valores iniciais, escolhidos pelo sistema e editáveis. Não vêm de fonte científica. */
export const PARAMETROS_ALERTAS_PESAGEM_INICIAIS: ParametrosAlertasPesagem = {
  gmdMaximoKgDia: 2.5,
  gmdMinimoKgDia: 0,
  intervaloCurtoDias: 7,
};

export const TIPOS_ALERTA_PESAGEM = [
  'gmd_acima',
  'gmd_abaixo',
  'possivel_digitacao',
  'pico_isolado',
  'peso_repetido',
] as const;
export type TipoAlertaPesagem = (typeof TIPOS_ALERTA_PESAGEM)[number];

export const CATEGORIAS_ALERTA_PESAGEM = ['conferencia', 'desempenho'] as const;
export type CategoriaAlertaPesagem = (typeof CATEGORIAS_ALERTA_PESAGEM)[number];

/**
 * `gmd_acima` e `gmd_abaixo` falam do desempenho observado; os demais tipos
 * apontam um padrão típico de erro de registro.
 */
export function categoriaDoAlerta(tipo: TipoAlertaPesagem): CategoriaAlertaPesagem {
  return tipo === 'gmd_acima' || tipo === 'gmd_abaixo' ? 'desempenho' : 'conferencia';
}

export interface AlertaPesagem {
  tipo: TipoAlertaPesagem;
  categoria: CategoriaAlertaPesagem;
  /**
   * Algum intervalo do alerta é mais curto que `intervaloCurtoDias`: o GMD
   * calculado nele pode não representar o desempenho do período.
   */
  intervaloCurto: boolean;
  /** Pesagem que deve ser conferida. */
  pesagemId: string;
  /** Intervalo que gerou o alerta (de onde vem o GMD exibido). */
  intervalo: IntervaloGmd;
  /** Só em `pico_isolado`: o intervalo depois da pesagem suspeita. */
  intervaloSeguinte: IntervaloGmd | null;
  /**
   * Peso que deixaria o GMD dentro dos limites, quando ele é o digitado
   * multiplicado ou dividido por 10. É só uma hipótese para o usuário conferir.
   */
  pesoSugeridoKg: number | null;
}

type Desvio = 'acima' | 'abaixo' | null;

function desvio(gmdKgDia: number, p: ParametrosAlertasPesagem): Desvio {
  if (p.gmdMaximoKgDia !== null && gmdKgDia > p.gmdMaximoKgDia) return 'acima';
  if (p.gmdMinimoKgDia !== null && gmdKgDia < p.gmdMinimoKgDia) return 'abaixo';
  return null;
}

const FATORES_DIGITACAO = [10, 0.1] as const;

/** Candidato a peso correto quando o erro parece ser uma casa decimal a mais ou a menos. */
function sugerirPeso(
  pesoDigitadoKg: number,
  dentroDosLimites: (candidatoKg: number) => boolean,
): number | null {
  for (const fator of FATORES_DIGITACAO) {
    const candidato = arredondar(pesoDigitadoKg * fator, 1);
    if (candidato > 0 && candidato <= PESO_VIVO_MAXIMO_KG && dentroDosLimites(candidato)) {
      return candidato;
    }
  }
  return null;
}

/**
 * Procura pesagens que merecem conferência:
 * - `gmd_acima` / `gmd_abaixo`: GMD do intervalo fora dos limites configurados;
 * - `possivel_digitacao`: fora dos limites, mas o peso ×10 ou ÷10 ficaria dentro;
 * - `pico_isolado`: uma pesagem que sobe e desce (ou desce e sobe) fora dos
 *   limites em relação às duas vizinhas; a suspeita é a do meio;
 * - `peso_repetido`: mesmo peso da pesagem anterior, em outra data.
 */
export function detectarAlertasPesagem(
  pesagens: readonly PesagemParaGmd[],
  parametros: ParametrosAlertasPesagem,
): AlertaPesagem[] {
  const { intervalos } = analisarGmd(pesagens);
  const desvios = intervalos.map((i) => desvio(i.gmdKgDia, parametros));
  const curto = (i: IntervaloGmd) =>
    parametros.intervaloCurtoDias !== null && i.dias < parametros.intervaloCurtoDias;
  const alertas: AlertaPesagem[] = [];

  for (let i = 0; i < intervalos.length; i++) {
    const atual = intervalos[i]!;
    const d = desvios[i];
    if (!d) continue;
    const seguinte = intervalos[i + 1];
    const dSeguinte = desvios[i + 1];
    if (seguinte && dSeguinte && dSeguinte !== d) {
      const sugestao = sugerirPeso(
        atual.pesoFinalKg,
        (c) =>
          desvio((c - atual.pesoInicialKg) / atual.dias, parametros) === null &&
          desvio((seguinte.pesoFinalKg - c) / seguinte.dias, parametros) === null,
      );
      alertas.push({
        tipo: 'pico_isolado',
        categoria: categoriaDoAlerta('pico_isolado'),
        intervaloCurto: curto(atual) || curto(seguinte),
        pesagemId: atual.pesagemFinalId,
        intervalo: atual,
        intervaloSeguinte: seguinte,
        pesoSugeridoKg: sugestao,
      });
      i++; // o intervalo seguinte é explicado pelo mesmo pico
      continue;
    }
    const sugestao = sugerirPeso(
      atual.pesoFinalKg,
      (c) => desvio((c - atual.pesoInicialKg) / atual.dias, parametros) === null,
    );
    const tipo: TipoAlertaPesagem =
      sugestao !== null ? 'possivel_digitacao' : d === 'acima' ? 'gmd_acima' : 'gmd_abaixo';
    alertas.push({
      tipo,
      categoria: categoriaDoAlerta(tipo),
      intervaloCurto: curto(atual),
      pesagemId: atual.pesagemFinalId,
      intervalo: atual,
      intervaloSeguinte: null,
      pesoSugeridoKg: sugestao,
    });
  }

  for (const intervalo of intervalos) {
    if (intervalo.pesoFinalKg === intervalo.pesoInicialKg) {
      alertas.push({
        tipo: 'peso_repetido',
        categoria: categoriaDoAlerta('peso_repetido'),
        intervaloCurto: curto(intervalo),
        pesagemId: intervalo.pesagemFinalId,
        intervalo,
        intervaloSeguinte: null,
        pesoSugeridoKg: null,
      });
    }
  }
  return alertas.sort((a, b) => a.intervalo.dataFinal.localeCompare(b.intervalo.dataFinal));
}

/** Pesagens envolvidas no alerta: as duas pontas do intervalo e, no pico, a seguinte. */
export function pesagensDoAlerta(alerta: AlertaPesagem): string[] {
  return [
    ...new Set([
      alerta.intervalo.pesagemInicialId,
      alerta.intervalo.pesagemFinalId,
      ...(alerta.intervaloSeguinte ? [alerta.intervaloSeguinte.pesagemFinalId] : []),
    ]),
  ];
}

export interface EstadoConferencia {
  conferidaEm: string | null;
  /** Instante ISO em que a pesagem foi registrada. */
  criadoEm: string;
}

/**
 * Um alerta compara pesagens; qualquer uma delas pode ser a errada. Ele conta
 * como conferido se alguma das pesagens envolvidas foi confirmada DEPOIS que
 * todas já existiam. Uma pesagem nova que crie outro alerta o reabre.
 */
export function alertaConferido(
  alerta: AlertaPesagem,
  pesagens: ReadonlyMap<string, EstadoConferencia>,
): boolean {
  const envolvidas = pesagensDoAlerta(alerta)
    .map((id) => pesagens.get(id))
    .filter((p): p is EstadoConferencia => p !== undefined);
  const ultimaCriacao = envolvidas.reduce((m, p) => (p.criadoEm > m ? p.criadoEm : m), '');
  return envolvidas.some((p) => p.conferidaEm !== null && p.conferidaEm >= ultimaCriacao);
}

/** Confere se os limites fazem sentido entre si. Retorna mensagens de erro. */
export function validarParametrosAlertas(p: ParametrosAlertasPesagem): string[] {
  if (
    p.gmdMaximoKgDia !== null &&
    p.gmdMinimoKgDia !== null &&
    p.gmdMaximoKgDia <= p.gmdMinimoKgDia
  ) {
    return ['O limite superior do GMD precisa ser maior que o limite inferior.'];
  }
  return [];
}
