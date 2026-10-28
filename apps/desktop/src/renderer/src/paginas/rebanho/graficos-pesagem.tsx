import type { EvolucaoLote, Pesagem } from '@pecuaria/shared-types';
import type { IntervaloGmd, PeriodoEvolucao } from '@pecuaria/domain';
import {
  dataDe,
  diaDe,
  GraficoColunas,
  GraficoLinhas,
  Legenda,
} from '../../components/graficos/graficos';
import { formatarData, formatarGanho, formatarGmd, formatarPeso } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';

function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

function dataCurta(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano!.slice(2)}`;
}

/** Peso vivo do animal ao longo do tempo: só pesagens registradas. */
export function GraficoPesoAnimal({
  pesagens,
  intervalos,
}: {
  pesagens: readonly Pesagem[];
  intervalos: readonly IntervaloGmd[];
}) {
  const porDia = new Map(pesagens.map((p) => [diaDe(p.data), p]));
  const intervaloAte = new Map(intervalos.map((i) => [diaDe(i.dataFinal), i]));
  const temEstimado = pesagens.some((p) => p.metodo !== 'balanca');
  return (
    <div className="flex flex-col gap-2" data-testid="grafico-peso-animal">
      <GraficoLinhas
        rotulo="Evolução do peso vivo em kg, por data de pesagem"
        series={[
          {
            id: 'peso',
            destaque: true,
            pontos: pesagens.map((p) => ({
              dia: diaDe(p.data),
              valor: p.pesoVivoKg,
              vazado: p.metodo !== 'balanca',
            })),
          },
        ]}
        diasDica={[...porDia.keys()]}
        formatarEixoY={(v) => `${v.toLocaleString('pt-BR')} kg`}
        dica={(dia) => {
          const p = porDia.get(dia);
          const i = intervaloAte.get(dia);
          if (!p) return null;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-texto-suave">{formatarData(p.data)}</span>
              <strong className="text-sm text-texto">{formatarPeso(p.pesoVivoKg)}</strong>
              <span className="text-texto-suave">{rotulos.metodo[p.metodo]}</span>
              {i && (
                <span className="text-texto-suave">
                  {formatarGanho(i.ganhoKg)} em {i.dias} d ·{' '}
                  <span className="text-texto">{formatarGmd(i.gmdKgDia)}</span>
                </span>
              )}
            </div>
          );
        }}
      />
      {temEstimado && (
        <Legenda
          itens={[
            { chave: 'ponto', texto: 'Pesado em balança' },
            { chave: 'ponto-vazado', texto: 'Estimado (fita ou visual)' },
          ]}
        />
      )}
    </div>
  );
}

/** GMD observado de cada intervalo entre pesagens consecutivas. */
export function GraficoGmdIntervalos({ intervalos }: { intervalos: readonly IntervaloGmd[] }) {
  if (intervalos.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="grafico-gmd-intervalos">
      <GraficoColunas
        rotulo="GMD observado em kg por dia, em cada intervalo entre pesagens"
        colunas={intervalos.map((i) => ({
          id: i.pesagemFinalId,
          rotulo: dataCurta(i.dataFinal),
          valor: i.gmdKgDia,
          estimado: i.estimado,
          dica: (
            <div className="flex flex-col gap-0.5">
              <span className="text-texto-suave">
                {formatarData(i.dataInicial)} a {formatarData(i.dataFinal)} ({i.dias} d)
              </span>
              <strong className="text-sm text-texto">{formatarGmd(i.gmdKgDia)}</strong>
              <span className="text-texto-suave">
                {formatarPeso(i.pesoInicialKg)} → {formatarPeso(i.pesoFinalKg)}
              </span>
              {i.estimado && <span className="text-texto-suave">Inclui peso estimado</span>}
            </div>
          ),
        }))}
      />
      <Legenda
        itens={[
          { chave: 'coluna', texto: 'Ganho' },
          ...(intervalos.some((i) => i.gmdKgDia < 0)
            ? [{ chave: 'coluna-perda' as const, texto: 'Perda' }]
            : []),
          ...(intervalos.some((i) => i.estimado)
            ? [{ chave: 'coluna-clara' as const, texto: 'Inclui peso estimado (fita ou visual)' }]
            : []),
        ]}
      />
    </div>
  );
}

/**
 * Evolução coletiva: a linha forte é a média dos animais pesados em cada data
 * entre os que estavam no lote (quantidade na dica); as linhas claras são os
 * animais, uma por permanência no lote, sem ligar pesagens de fora dele.
 * Nenhum peso é preenchido para quem não foi pesado.
 */
export function GraficoEvolucaoLote({ evolucao }: { evolucao: EvolucaoLote }) {
  const pontos = evolucao.analise.pontos;
  const porDia = new Map(pontos.map((p) => [diaDe(p.data), p]));
  return (
    <div className="flex flex-col gap-2" data-testid="grafico-evolucao-lote">
      <GraficoLinhas
        rotulo="Peso vivo dos animais enquanto estavam no lote, em kg: média por data e cada animal"
        series={[
          ...evolucao.animais.flatMap((a) =>
            a.trechos.map((trecho, i) => ({
              id: `${a.id}-${i}`,
              destaque: false,
              pontos: trecho.map((p) => ({ dia: diaDe(p.data), valor: p.pesoVivoKg })),
            })),
          ),
          {
            id: 'media',
            destaque: true,
            pontos: pontos.map((p) => ({
              dia: diaDe(p.data),
              valor: p.mediaKg,
              vazado: p.estimado,
            })),
          },
        ]}
        diasDica={[...porDia.keys()]}
        formatarEixoY={(v) => `${v.toLocaleString('pt-BR')} kg`}
        dica={(dia) => {
          const p = porDia.get(dia);
          if (!p) return <span>{formatarData(dataDe(dia))}</span>;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-texto-suave">{formatarData(p.data)}</span>
              <strong className="text-sm text-texto">Média {formatarPeso(p.mediaKg)}</strong>
              <span className="text-texto-suave">
                {p.quantidade} de {p.animaisNoLote}{' '}
                {p.animaisNoLote === 1 ? 'animal do lote pesado' : 'animais do lote pesados'}
              </span>
              {p.quantidade > 1 && (
                <span className="text-texto-suave">
                  {formatarPeso(p.minimoKg)} a {formatarPeso(p.maximoKg)}
                </span>
              )}
              {p.noDiaDaTroca > 0 && (
                <span className="text-texto-suave">{p.noDiaDaTroca} no dia da troca de lote</span>
              )}
              {p.estimado && <span className="text-texto-suave">Inclui peso estimado</span>}
            </div>
          );
        }}
      />
      <Legenda
        itens={[
          { chave: 'linha', texto: 'Média dos animais do lote pesados em cada data' },
          { chave: 'linha-suave', texto: 'Cada animal, enquanto esteve no lote' },
          ...(pontos.some((p) => p.estimado)
            ? [{ chave: 'ponto-vazado' as const, texto: 'Data com peso estimado' }]
            : []),
        ]}
      />
    </div>
  );
}

/** GMD médio de cada período, comparando os mesmos animais nas duas datas. */
export function GraficoGmdPeriodos({ periodos }: { periodos: readonly PeriodoEvolucao[] }) {
  if (periodos.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <GraficoColunas
        rotulo="GMD médio observado em kg por dia, por período entre pesagens"
        colunas={periodos.map((p) => ({
          id: `${p.dataInicial}-${p.dataFinal}`,
          // Dois períodos podem terminar na mesma data: o rótulo mostra o intervalo.
          rotulo: `${diaMes(p.dataInicial)}–${diaMes(p.dataFinal)}`,
          valor: p.gmdMedioKgDia,
          estimado: p.estimado,
          dica: (
            <div className="flex flex-col gap-0.5">
              <span className="text-texto-suave">
                {formatarData(p.dataInicial)} a {formatarData(p.dataFinal)} ({p.dias} d)
              </span>
              <strong className="text-sm text-texto">{formatarGmd(p.gmdMedioKgDia)}</strong>
              <span className="text-texto-suave">
                {p.quantidade} {p.quantidade === 1 ? 'animal' : 'animais'} nas duas datas
              </span>
            </div>
          ),
        }))}
      />
      <Legenda
        itens={[
          { chave: 'coluna', texto: 'Ganho médio' },
          ...(periodos.some((p) => p.gmdMedioKgDia < 0)
            ? [{ chave: 'coluna-perda' as const, texto: 'Perda média' }]
            : []),
          ...(periodos.some((p) => p.estimado)
            ? [{ chave: 'coluna-clara' as const, texto: 'Inclui peso estimado (fita ou visual)' }]
            : []),
        ]}
      />
    </div>
  );
}
