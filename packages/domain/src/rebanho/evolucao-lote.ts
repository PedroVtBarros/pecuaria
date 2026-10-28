import { analisarGmd, type PesagemParaGmd } from './gmd';
import { posicaoNoLote, type PermanenciaNoLote } from './permanencia-lote';

/**
 * Evolução de peso de um lote ao longo do tempo, só com pesagens reais e só
 * enquanto cada animal pertencia ao lote. Nenhuma pesagem é estimada a partir
 * de média: animal não pesado numa data não entra no ponto daquela data, e
 * pesagens de antes da entrada ou depois da saída do lote ficam de fora.
 */
export interface MembroDoLote {
  animalId: string;
  permanencias: readonly PermanenciaNoLote[];
  /** Todas as pesagens do animal; a análise separa as do período no lote. */
  pesagens: readonly PesagemParaGmd[];
}

/** Peso vivo médio dos animais pesados numa data, entre os que estavam no lote. */
export interface PontoEvolucao {
  data: string;
  /** Animais do lote pesados nesta data (entram na média). */
  quantidade: number;
  /** Animais que pertenciam ao lote nesta data, pesados ou não. */
  animaisNoLote: number;
  mediaKg: number;
  minimoKg: number;
  maximoKg: number;
  estimado: boolean;
  /** Pesagens desta data feitas no dia de uma troca de lote do animal. */
  noDiaDaTroca: number;
}

/**
 * Período entre duas datas de pesagem, comparando os MESMOS animais
 * (pesados nas duas datas e no lote durante todo o intervalo).
 */
export interface PeriodoEvolucao {
  dataInicial: string;
  dataFinal: string;
  dias: number;
  quantidade: number;
  pesoInicialMedioKg: number;
  pesoFinalMedioKg: number;
  ganhoMedioKg: number;
  gmdMedioKgDia: number;
  gmdMinimoKgDia: number;
  gmdMaximoKgDia: number;
  estimado: boolean;
}

export interface ResumoGmdGrupo {
  /** Animais com pelo menos duas pesagens numa mesma permanência no lote. */
  quantidade: number;
  /**
   * Permanências que entraram na média. Maior que `quantidade` quando algum
   * animal saiu e voltou ao lote: cada permanência conta separada.
   */
  permanencias: number;
  /** Média dos GMD individuais, cada um da primeira à última pesagem da permanência. */
  gmdMedioKgDia: number;
  gmdMinimoKgDia: number;
  gmdMaximoKgDia: number;
  estimado: boolean;
}

export interface AnaliseEvolucaoGrupo {
  pontos: PontoEvolucao[];
  periodos: PeriodoEvolucao[];
  resumo: ResumoGmdGrupo | null;
  /** Pesagens no dia de uma troca de lote (entram no lote de origem e no de destino). */
  pesagensNoDiaDaTroca: number;
  /** Pesagens dos animais feitas fora do período no lote (não entram em nada aqui). */
  pesagensForaDoLote: number;
}

export interface PesagensNoLote {
  /** Pesagens de cada permanência, em ordem; intervalos nunca atravessam uma ausência. */
  trechos: PesagemParaGmd[][];
  noDiaDaTroca: Set<string>;
  foraDoLote: number;
}

/** Separa as pesagens do animal por permanência no lote. */
export function pesagensNoLote(membro: MembroDoLote): PesagensNoLote {
  const ordenadas = [...membro.pesagens].sort((a, b) => a.data.localeCompare(b.data));
  const noDiaDaTroca = new Set<string>();
  const usadas = new Set<string>();
  const trechos = membro.permanencias.map((perm) =>
    ordenadas.filter((p) => {
      if (p.data < perm.inicio || (perm.fim !== null && p.data > perm.fim)) return false;
      usadas.add(p.id);
      if (posicaoNoLote(p.data, [perm]) === 'dia_da_troca') noDiaDaTroca.add(p.id);
      return true;
    }),
  );
  return { trechos, noDiaDaTroca, foraDoLote: ordenadas.length - usadas.size };
}

function media(valores: readonly number[]): number {
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function animaisNoLoteEm(data: string, membros: readonly MembroDoLote[]): number {
  return membros.filter((m) => posicaoNoLote(data, m.permanencias) !== 'fora').length;
}

export function analisarEvolucaoGrupo(membros: readonly MembroDoLote[]): AnaliseEvolucaoGrupo {
  const porData = new Map<string, { pesagem: PesagemParaGmd; naTroca: boolean }[]>();
  const porPeriodo = new Map<
    string,
    { inicial: number[]; final: number[]; gmd: number[]; dias: number; estimado: boolean }
  >();
  const gmdIndividuais: { animalId: string; gmd: number; estimado: boolean }[] = [];
  let pesagensNoDiaDaTroca = 0;
  let pesagensForaDoLote = 0;

  for (const membro of membros) {
    const { trechos, noDiaDaTroca, foraDoLote } = pesagensNoLote(membro);
    pesagensNoDiaDaTroca += noDiaDaTroca.size;
    pesagensForaDoLote += foraDoLote;
    // A mesma pesagem pode cair em duas permanências (saiu e voltou no mesmo dia):
    // no ponto da data ela conta uma vez só.
    const pontuadas = new Set<string>();
    for (const trecho of trechos) {
      for (const p of trecho) {
        if (pontuadas.has(p.id)) continue;
        pontuadas.add(p.id);
        const lista = porData.get(p.data) ?? [];
        lista.push({ pesagem: p, naTroca: noDiaDaTroca.has(p.id) });
        porData.set(p.data, lista);
      }
      const analise = analisarGmd(trecho);
      for (const i of analise.intervalos) {
        const chave = `${i.dataInicial}|${i.dataFinal}`;
        const atual = porPeriodo.get(chave) ?? {
          inicial: [],
          final: [],
          gmd: [],
          dias: i.dias,
          estimado: false,
        };
        atual.inicial.push(i.pesoInicialKg);
        atual.final.push(i.pesoFinalKg);
        atual.gmd.push(i.gmdKgDia);
        atual.estimado ||= i.estimado;
        porPeriodo.set(chave, atual);
      }
      if (analise.periodoTotal) {
        gmdIndividuais.push({
          animalId: membro.animalId,
          gmd: analise.periodoTotal.gmdKgDia,
          estimado: analise.periodoTotal.estimado,
        });
      }
    }
  }

  const pontos: PontoEvolucao[] = [...porData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, lista]) => {
      const pesos = lista.map((x) => x.pesagem.pesoVivoKg);
      return {
        data,
        quantidade: lista.length,
        animaisNoLote: animaisNoLoteEm(data, membros),
        mediaKg: media(pesos),
        minimoKg: Math.min(...pesos),
        maximoKg: Math.max(...pesos),
        estimado: lista.some((x) => x.pesagem.metodo !== 'balanca'),
        noDiaDaTroca: lista.filter((x) => x.naTroca).length,
      };
    });

  const periodos: PeriodoEvolucao[] = [...porPeriodo.entries()]
    .map(([chave, v]) => {
      const [dataInicial, dataFinal] = chave.split('|') as [string, string];
      const pesoInicialMedioKg = media(v.inicial);
      const pesoFinalMedioKg = media(v.final);
      return {
        dataInicial,
        dataFinal,
        dias: v.dias,
        quantidade: v.gmd.length,
        pesoInicialMedioKg,
        pesoFinalMedioKg,
        ganhoMedioKg: pesoFinalMedioKg - pesoInicialMedioKg,
        gmdMedioKgDia: media(v.gmd),
        gmdMinimoKgDia: Math.min(...v.gmd),
        gmdMaximoKgDia: Math.max(...v.gmd),
        estimado: v.estimado,
      };
    })
    .sort(
      (a, b) =>
        a.dataFinal.localeCompare(b.dataFinal) || a.dataInicial.localeCompare(b.dataInicial),
    );

  const resumo: ResumoGmdGrupo | null =
    gmdIndividuais.length === 0
      ? null
      : {
          quantidade: new Set(gmdIndividuais.map((g) => g.animalId)).size,
          permanencias: gmdIndividuais.length,
          gmdMedioKgDia: media(gmdIndividuais.map((g) => g.gmd)),
          gmdMinimoKgDia: Math.min(...gmdIndividuais.map((g) => g.gmd)),
          gmdMaximoKgDia: Math.max(...gmdIndividuais.map((g) => g.gmd)),
          estimado: gmdIndividuais.some((g) => g.estimado),
        };

  return { pontos, periodos, resumo, pesagensNoDiaDaTroca, pesagensForaDoLote };
}
