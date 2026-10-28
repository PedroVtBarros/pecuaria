import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { diasEntre, somarDias } from '@pecuaria/domain';

/**
 * Gráficos em SVG próprio (sem biblioteca): o app é offline, a CSP é estrita
 * e os gráficos aqui são poucos e simples. Cores vêm dos tokens --grafico-*
 * de styles.css, validados para daltonismo nos temas claro e escuro.
 * Só exibem registros reais; não interpolam nem projetam valores.
 */

const ORIGEM = '1970-01-01';
export const diaDe = (data: string): number => diasEntre(ORIGEM, data);
export const dataDe = (dia: number): string => somarDias(ORIGEM, dia);

const MARGEM = { esquerda: 56, direita: 16, topo: 12, base: 28 };

/** Largura do contêiner, acompanhando redimensionamentos da janela. */
function useLargura<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(640);
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(Math.max(280, Math.floor(entrada.contentRect.width)));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  return [ref, largura];
}

/** Marcas "redondas" no eixo: 1, 2, 2,5 ou 5 vezes uma potência de 10. */
export function marcasBonitas(minimo: number, maximo: number, alvo = 5): number[] {
  if (!Number.isFinite(minimo) || !Number.isFinite(maximo)) return [];
  if (minimo === maximo) {
    const folga = Math.abs(minimo) * 0.1 || 1;
    minimo -= folga;
    maximo += folga;
  }
  const bruto = (maximo - minimo) / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo =
    [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? 10 * potencia;
  const inicio = Math.floor(minimo / passo) * passo;
  const fim = Math.ceil(maximo / passo) * passo;
  const marcas: number[] = [];
  for (let v = inicio; v <= fim + passo / 2; v += passo) marcas.push(Number(v.toFixed(6)));
  return marcas;
}

function escala(dominio: [number, number], faixa: [number, number]) {
  const [d0, d1] = dominio;
  const [f0, f1] = faixa;
  const razao = d1 === d0 ? 0 : (f1 - f0) / (d1 - d0);
  return (v: number) => f0 + (v - d0) * razao;
}

function dataCurta(dia: number): string {
  const [ano, mes, d] = dataDe(dia).split('-');
  return `${d}/${mes}/${ano!.slice(2)}`;
}

const numeroBr = (v: number, casas = 0) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas });

/** Menor número de casas que escreve todas as marcas sem arredondar (0,25 não vira 0,3). */
export function casasDasMarcas(marcas: readonly number[]): number {
  for (let casas = 0; casas < 3; casas++) {
    if (marcas.every((m) => Number(m.toFixed(casas)) === m)) return casas;
  }
  return 3;
}

/** Caixa da dica (tooltip). Valor em destaque, rótulos em texto suave. */
function Dica({ x, largura, children }: { x: number; largura: number; children: ReactNode }) {
  const aDireita = x < largura / 2;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border border-borda bg-superficie px-3 py-2 text-xs shadow-lg"
      style={aDireita ? { left: x + 12 } : { right: largura - x + 12 }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linhas (peso vivo ao longo do tempo)
// ---------------------------------------------------------------------------

export interface PontoLinha {
  dia: number;
  valor: number;
  /** Marcador vazado (ex.: pesagem estimada por fita ou visual). */
  vazado?: boolean;
}

export interface SerieLinha {
  id: string;
  pontos: PontoLinha[];
  /** Série principal: linha de 2px com marcadores. As demais ficam discretas. */
  destaque: boolean;
}

export function GraficoLinhas({
  rotulo,
  series,
  diasDica,
  dica,
  formatarEixoY = (v) => numeroBr(v),
  altura = 260,
}: {
  rotulo: string;
  series: SerieLinha[];
  /** Posições onde a linha vertical da dica pode parar (datas com registro). */
  diasDica: number[];
  dica: (dia: number) => ReactNode;
  formatarEixoY?: (v: number) => string;
  altura?: number;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [indice, setIndice] = useState<number | null>(null);
  const idDescricao = useId();

  const todos = series.flatMap((s) => s.pontos);
  if (todos.length === 0) return null;
  const dias = todos.map((p) => p.dia);
  let [diaMin, diaMax] = [Math.min(...dias), Math.max(...dias)];
  if (diaMin === diaMax) {
    diaMin -= 1;
    diaMax += 1;
  }
  const valores = todos.map((p) => p.valor);
  const marcasY = marcasBonitas(Math.min(...valores), Math.max(...valores));
  const yMin = marcasY[0]!;
  const yMax = marcasY.at(-1)!;
  const x = escala([diaMin, diaMax], [MARGEM.esquerda, largura - MARGEM.direita]);
  const y = escala([yMin, yMax], [altura - MARGEM.base, MARGEM.topo]);

  const quantidadeMarcasX = Math.max(2, Math.min(6, Math.floor(largura / 110)));
  const marcasX = Array.from({ length: quantidadeMarcasX }, (_, i) =>
    Math.round(diaMin + ((diaMax - diaMin) * i) / (quantidadeMarcasX - 1)),
  );

  const alvos = [...new Set(diasDica)].sort((a, b) => a - b);
  const diaAtivo = indice !== null ? alvos[indice] : undefined;

  const aoMover = (e: PointerEvent<SVGRectElement>) => {
    if (alvos.length === 0) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - caixa.left + MARGEM.esquerda;
    let melhor = 0;
    alvos.forEach((d, i) => {
      if (Math.abs(x(d) - px) < Math.abs(x(alvos[melhor]!) - px)) melhor = i;
    });
    setIndice(melhor);
  };
  const aoTeclar = (e: KeyboardEvent<SVGSVGElement>) => {
    if (alvos.length === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const passo = e.key === 'ArrowRight' ? 1 : -1;
      setIndice((i) =>
        Math.min(alvos.length - 1, Math.max(0, (i ?? (passo > 0 ? -1 : alvos.length)) + passo)),
      );
    }
    if (e.key === 'Escape') setIndice(null);
  };

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={largura}
        height={altura}
        role="img"
        aria-label={rotulo}
        aria-describedby={idDescricao}
        tabIndex={0}
        onKeyDown={aoTeclar}
        onBlur={() => setIndice(null)}
        className="block overflow-visible focus-visible:outline-2"
      >
        <desc id={idDescricao}>Use as setas para percorrer as datas.</desc>
        {marcasY.map((v) => (
          <g key={v}>
            <line
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={y(v)}
              y2={y(v)}
              className="stroke-grafico-grade"
              strokeWidth={1}
            />
            <text
              x={MARGEM.esquerda - 8}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-texto-suave text-[11px] tabular-nums"
            >
              {formatarEixoY(v)}
            </text>
          </g>
        ))}
        <line
          x1={MARGEM.esquerda}
          x2={largura - MARGEM.direita}
          y1={altura - MARGEM.base}
          y2={altura - MARGEM.base}
          className="stroke-grafico-eixo"
        />
        {marcasX.map((d, i) => (
          <text
            key={`${d}-${i}`}
            x={x(d)}
            y={altura - MARGEM.base + 18}
            textAnchor={i === 0 ? 'start' : i === marcasX.length - 1 ? 'end' : 'middle'}
            className="fill-texto-suave text-[11px] tabular-nums"
          >
            {dataCurta(d)}
          </text>
        ))}

        {series
          .filter((s) => !s.destaque)
          .map((s) =>
            s.pontos.length > 1 ? (
              <polyline
                key={s.id}
                points={s.pontos.map((p) => `${x(p.dia)},${y(p.valor)}`).join(' ')}
                fill="none"
                className="stroke-grafico-serie"
                strokeOpacity={0.28}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              s.pontos.map((p) => (
                <circle
                  key={`${s.id}-${p.dia}`}
                  cx={x(p.dia)}
                  cy={y(p.valor)}
                  r={2.5}
                  className="fill-grafico-serie"
                  fillOpacity={0.35}
                />
              ))
            ),
          )}

        {diaAtivo !== undefined && (
          <line
            x1={x(diaAtivo)}
            x2={x(diaAtivo)}
            y1={MARGEM.topo}
            y2={altura - MARGEM.base}
            className="stroke-grafico-eixo"
            strokeWidth={1}
          />
        )}

        {series
          .filter((s) => s.destaque)
          .map((s) => (
            <g key={s.id}>
              {s.pontos.length > 1 && (
                <polyline
                  points={s.pontos.map((p) => `${x(p.dia)},${y(p.valor)}`).join(' ')}
                  fill="none"
                  className="stroke-grafico-serie"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {s.pontos.map((p) => (
                <circle
                  key={p.dia}
                  cx={x(p.dia)}
                  cy={y(p.valor)}
                  r={p.dia === diaAtivo ? 5.5 : 4}
                  strokeWidth={2}
                  className={
                    p.vazado
                      ? 'fill-superficie stroke-grafico-serie'
                      : 'fill-grafico-serie stroke-superficie'
                  }
                />
              ))}
            </g>
          ))}

        <rect
          x={MARGEM.esquerda}
          y={MARGEM.topo}
          width={Math.max(0, largura - MARGEM.esquerda - MARGEM.direita)}
          height={Math.max(0, altura - MARGEM.topo - MARGEM.base)}
          fill="transparent"
          onPointerMove={aoMover}
          onPointerLeave={() => setIndice(null)}
        />
      </svg>
      {diaAtivo !== undefined && (
        <Dica x={x(diaAtivo)} largura={largura}>
          {dica(diaAtivo)}
        </Dica>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colunas (GMD por intervalo ou período)
// ---------------------------------------------------------------------------

export interface Coluna {
  id: string;
  /** Rótulo curto do eixo X (ex.: data final do intervalo). */
  rotulo: string;
  valor: number;
  /** Coluna mais clara: inclui pesagem estimada. */
  estimado: boolean;
  dica: ReactNode;
}

/** Caminho de uma coluna com a ponta de dados arredondada e a base reta. */
function caminhoColuna(x0: number, largura: number, yBase: number, yPonta: number): string {
  const altura = Math.abs(yBase - yPonta);
  const r = Math.min(4, largura / 2, altura);
  const x1 = x0 + largura;
  if (yPonta <= yBase) {
    return `M${x0},${yBase} V${yPonta + r} Q${x0},${yPonta} ${x0 + r},${yPonta} H${x1 - r} Q${x1},${yPonta} ${x1},${yPonta + r} V${yBase} Z`;
  }
  return `M${x0},${yBase} V${yPonta - r} Q${x0},${yPonta} ${x0 + r},${yPonta} H${x1 - r} Q${x1},${yPonta} ${x1},${yPonta - r} V${yBase} Z`;
}

export function GraficoColunas({
  rotulo,
  colunas,
  formatarEixoY,
  altura = 220,
}: {
  rotulo: string;
  colunas: Coluna[];
  formatarEixoY?: (v: number) => string;
  altura?: number;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [ativa, setAtiva] = useState<number | null>(null);
  if (colunas.length === 0) return null;

  const valores = colunas.map((c) => c.valor);
  const marcasY = marcasBonitas(Math.min(0, ...valores), Math.max(0, ...valores), 4);
  const casas = casasDasMarcas(marcasY);
  const rotuloEixo = formatarEixoY ?? ((v: number) => numeroBr(v, casas));
  const y = escala([marcasY[0]!, marcasY.at(-1)!], [altura - MARGEM.base, MARGEM.topo]);
  const areaUtil = largura - MARGEM.esquerda - MARGEM.direita;
  const faixa = areaUtil / colunas.length;
  const larguraColuna = Math.max(4, Math.min(24, faixa * 0.6));
  const yZero = y(0);
  const saltoRotulo = Math.max(
    1,
    Math.ceil(colunas.length / Math.max(1, Math.floor(areaUtil / 84))),
  );

  return (
    <div ref={ref} className="relative w-full">
      <svg width={largura} height={altura} role="img" aria-label={rotulo} className="block">
        {marcasY.map((v) => (
          <g key={v}>
            <line
              x1={MARGEM.esquerda}
              x2={largura - MARGEM.direita}
              y1={y(v)}
              y2={y(v)}
              className={v === 0 ? 'stroke-grafico-eixo' : 'stroke-grafico-grade'}
              strokeWidth={1}
            />
            <text
              x={MARGEM.esquerda - 8}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-texto-suave text-[11px] tabular-nums"
            >
              {rotuloEixo(v)}
            </text>
          </g>
        ))}
        {colunas.map((c, i) => {
          const centro = MARGEM.esquerda + faixa * (i + 0.5);
          const x0 = centro - larguraColuna / 2;
          const yPonta = y(c.valor);
          return (
            <g key={c.id}>
              {c.valor !== 0 && (
                <path
                  d={caminhoColuna(x0, larguraColuna, yZero, yPonta)}
                  className={c.valor < 0 ? 'fill-grafico-perda' : 'fill-grafico-serie'}
                  fillOpacity={(c.estimado ? 0.45 : 1) * (ativa === null || ativa === i ? 1 : 0.6)}
                />
              )}
              {i % saltoRotulo === 0 && (
                <text
                  x={centro}
                  y={altura - MARGEM.base + 18}
                  textAnchor="middle"
                  className="fill-texto-suave text-[11px] tabular-nums"
                >
                  {c.rotulo}
                </text>
              )}
              <rect
                x={centro - faixa / 2}
                y={MARGEM.topo}
                width={faixa}
                height={altura - MARGEM.topo - MARGEM.base}
                fill="transparent"
                tabIndex={0}
                aria-label={c.rotulo}
                onPointerEnter={() => setAtiva(i)}
                onPointerLeave={() => setAtiva(null)}
                onFocus={() => setAtiva(i)}
                onBlur={() => setAtiva(null)}
                className="focus-visible:outline-none"
              />
            </g>
          );
        })}
      </svg>
      {ativa !== null && (
        <Dica x={MARGEM.esquerda + faixa * (ativa + 0.5)} largura={largura}>
          {colunas[ativa]!.dica}
        </Dica>
      )}
    </div>
  );
}

/** Legenda: chave de linha, marcador ou coluna, com texto em tinta normal. */
export function Legenda({
  itens,
}: {
  itens: {
    chave:
      | 'linha'
      | 'linha-suave'
      | 'ponto'
      | 'ponto-vazado'
      | 'coluna'
      | 'coluna-clara'
      | 'coluna-perda';
    texto: string;
  }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-texto-suave">
      {itens.map((item) => (
        <li key={item.texto} className="flex items-center gap-1.5">
          <svg width="18" height="10" aria-hidden>
            {item.chave === 'linha' && (
              <line x1="1" x2="17" y1="5" y2="5" className="stroke-grafico-serie" strokeWidth={2} />
            )}
            {item.chave === 'linha-suave' && (
              <line
                x1="1"
                x2="17"
                y1="5"
                y2="5"
                className="stroke-grafico-serie"
                strokeOpacity={0.28}
                strokeWidth={1.5}
              />
            )}
            {item.chave === 'ponto' && (
              <circle cx="9" cy="5" r="4" className="fill-grafico-serie" />
            )}
            {item.chave === 'ponto-vazado' && (
              <circle
                cx="9"
                cy="5"
                r="3.5"
                strokeWidth={2}
                className="fill-superficie stroke-grafico-serie"
              />
            )}
            {item.chave === 'coluna' && (
              <rect x="4" y="0" width="10" height="10" rx="2" className="fill-grafico-serie" />
            )}
            {item.chave === 'coluna-clara' && (
              <rect
                x="4"
                y="0"
                width="10"
                height="10"
                rx="2"
                className="fill-grafico-serie"
                fillOpacity={0.45}
              />
            )}
            {item.chave === 'coluna-perda' && (
              <rect x="4" y="0" width="10" height="10" rx="2" className="fill-grafico-perda" />
            )}
          </svg>
          {item.texto}
        </li>
      ))}
    </ul>
  );
}
