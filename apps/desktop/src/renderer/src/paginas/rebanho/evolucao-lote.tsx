import { Link } from 'react-router';
import { Info } from 'lucide-react';
import type { PermanenciaNoLote } from '@pecuaria/domain';
import { useEvolucaoLote } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarData, formatarGanho, formatarGmd, formatarPeso } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Cartao, CartaoConteudo, CartaoTitulo } from '../../components/ui/cartao';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { GraficoEvolucaoLote, GraficoGmdPeriodos } from './graficos-pesagem';

function descreverPermanencia(p: PermanenciaNoLote): string {
  return p.fim
    ? `${formatarData(p.inicio)} a ${formatarData(p.fim)}`
    : `desde ${formatarData(p.inicio)}`;
}

/**
 * Evolução histórica de peso do lote. Cada animal conta só enquanto pertencia
 * ao lote, pelas datas do histórico de movimentações. Só pesagens reais; a
 * comparação entre períodos usa os mesmos animais nas duas datas.
 */
export function EvolucaoDoLote({ loteId }: { loteId: string }) {
  const evolucao = useEvolucaoLote(loteId);
  if (evolucao.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(evolucao.error)} />;
  const e = evolucao.data;
  if (!e || (e.animais.length === 0 && e.semReconstrucao.length === 0)) return null;
  const { pontos, periodos, resumo, pesagensNoDiaDaTroca } = e.analise;
  const ultimo = pontos.at(-1);

  return (
    <section className="flex flex-col gap-3" data-testid="evolucao-lote">
      <h3 className="font-semibold">Evolução de peso do lote</h3>
      <p className="flex items-start gap-1.5 text-sm text-texto-suave">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Cada animal entra só enquanto pertencia ao lote, pelas datas de entrada, transferência e
          saída. Pesagens de antes da entrada ou depois da saída ficam de fora; o histórico completo
          está na ficha de cada animal. Ganho{' '}
          <strong className="font-medium text-texto">observado</strong>; nenhuma projeção
          nutricional.
        </span>
      </p>

      {e.semReconstrucao.length > 0 && (
        <Alerta
          tom="alerta"
          titulo={`${e.semReconstrucao.length} ${e.semReconstrucao.length === 1 ? 'animal ficou' : 'animais ficaram'} fora das médias`}
        >
          <span data-testid="lote-sem-reconstrucao">
            O histórico de movimentações não permite saber com segurança quando{' '}
            {e.semReconstrucao.length === 1 ? 'ele esteve' : 'eles estiveram'} no lote. Para não
            gerar uma média historicamente errada, o sistema não usa esses dados.
          </span>
          <ul className="mt-1 list-disc pl-4">
            {e.semReconstrucao.map((s) => (
              <li key={s.id}>
                <Link to={`/rebanho/animais/${s.id}`} className="text-marca hover:underline">
                  {s.identificacao}
                </Link>
                : {s.motivo}
              </li>
            ))}
          </ul>
        </Alerta>
      )}

      {pontos.length === 0 ? (
        <Alerta
          tom="info"
          titulo="Nenhuma pesagem registrada enquanto os animais estavam neste lote."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Cartao>
              <CartaoConteudo className="flex flex-col gap-1">
                <p className="text-xs text-texto-suave">GMD médio dos animais no lote</p>
                <p className="text-2xl font-semibold" data-testid="gmd-medio-lote">
                  {resumo ? formatarGmd(resumo.gmdMedioKgDia) : '—'}
                </p>
                <p className="text-sm text-texto-suave">
                  {resumo
                    ? `${resumo.quantidade} ${resumo.quantidade === 1 ? 'animal' : 'animais'} com 2 ou mais pesagens no lote, cada um da primeira à última pesagem${resumo.permanencias > resumo.quantidade ? ` (${resumo.permanencias} permanências: quem saiu e voltou conta uma vez por permanência)` : ''}`
                    : 'Ainda não há animal com duas pesagens no lote.'}
                </p>
              </CartaoConteudo>
            </Cartao>
            <Cartao>
              <CartaoConteudo className="flex flex-col gap-1">
                <p className="text-xs text-texto-suave">Variação entre os animais</p>
                <p className="text-2xl font-semibold">
                  {resumo && resumo.permanencias > 1
                    ? `${formatarGmd(resumo.gmdMinimoKgDia).replace(' kg/dia', '')} a ${formatarGmd(resumo.gmdMaximoKgDia)}`
                    : '—'}
                </p>
                <p className="text-sm text-texto-suave">Menor e maior GMD individual</p>
              </CartaoConteudo>
            </Cartao>
            {ultimo && (
              <Cartao>
                <CartaoConteudo className="flex flex-col gap-1">
                  <p className="text-xs text-texto-suave">Última data com pesagem</p>
                  <p className="text-2xl font-semibold">{formatarData(ultimo.data)}</p>
                  <p className="text-sm text-texto-suave">
                    Média {formatarPeso(ultimo.mediaKg)} ({ultimo.quantidade} de{' '}
                    {ultimo.animaisNoLote} {ultimo.animaisNoLote === 1 ? 'animal' : 'animais'} do
                    lote nessa data)
                  </p>
                </CartaoConteudo>
              </Cartao>
            )}
          </div>

          {pesagensNoDiaDaTroca > 0 && (
            <p className="text-xs text-texto-suave" data-testid="aviso-dia-da-troca">
              {pesagensNoDiaDaTroca}{' '}
              {pesagensNoDiaDaTroca === 1 ? 'pesagem foi feita' : 'pesagens foram feitas'} no mesmo
              dia de uma troca de lote. Como o sistema registra só a data, sem a hora, a pesagem
              desse dia conta para o lote de origem e para o de destino.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Cartao>
              <CartaoConteudo className="flex flex-col gap-3">
                <CartaoTitulo className="text-sm">Peso vivo (kg)</CartaoTitulo>
                <GraficoEvolucaoLote evolucao={e} />
              </CartaoConteudo>
            </Cartao>
            {periodos.length > 0 && (
              <Cartao>
                <CartaoConteudo className="flex flex-col gap-3">
                  <CartaoTitulo className="text-sm">GMD médio por período (kg/dia)</CartaoTitulo>
                  <GraficoGmdPeriodos periodos={periodos} />
                </CartaoConteudo>
              </Cartao>
            )}
          </div>

          <Tabela data-testid="tabela-pontos-lote">
            <Cabeca>
              <Th>Data</Th>
              <Th>Animais pesados</Th>
              <Th>Animais no lote nessa data</Th>
              <Th>Peso médio</Th>
              <Th>Menor e maior peso</Th>
            </Cabeca>
            <tbody>
              {[...pontos].reverse().map((p) => (
                <Linha key={p.data}>
                  <Td className="whitespace-nowrap">{formatarData(p.data)}</Td>
                  <Td>
                    {p.quantidade}
                    {p.noDiaDaTroca > 0 && (
                      <span className="ml-1 text-xs text-texto-suave">
                        ({p.noDiaDaTroca} no dia da troca)
                      </span>
                    )}
                  </Td>
                  <Td>{p.animaisNoLote}</Td>
                  <Td className="font-medium whitespace-nowrap">
                    <span className={p.estimado ? 'text-alerta' : ''}>
                      {formatarPeso(p.mediaKg)}
                    </span>
                    {p.estimado && (
                      <span className="ml-1 text-xs text-texto-suave">(inclui estimado)</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-texto-suave">
                    {p.quantidade > 1
                      ? `${formatarPeso(p.minimoKg)} a ${formatarPeso(p.maximoKg)}`
                      : '—'}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>

          {periodos.length > 0 && (
            <Tabela data-testid="tabela-periodos-lote">
              <Cabeca>
                <Th>Período</Th>
                <Th>Dias</Th>
                <Th>Animais</Th>
                <Th>Peso médio inicial</Th>
                <Th>Peso médio final</Th>
                <Th>Ganho médio</Th>
                <Th>GMD médio</Th>
                <Th>Menor e maior GMD</Th>
              </Cabeca>
              <tbody>
                {[...periodos].reverse().map((p) => (
                  <Linha key={`${p.dataInicial}-${p.dataFinal}`}>
                    <Td className="whitespace-nowrap">
                      {formatarData(p.dataInicial)} a {formatarData(p.dataFinal)}
                    </Td>
                    <Td>{p.dias}</Td>
                    <Td>{p.quantidade}</Td>
                    <Td className="whitespace-nowrap">{formatarPeso(p.pesoInicialMedioKg)}</Td>
                    <Td className="whitespace-nowrap">{formatarPeso(p.pesoFinalMedioKg)}</Td>
                    <Td className="whitespace-nowrap">{formatarGanho(p.ganhoMedioKg)}</Td>
                    <Td className="font-medium whitespace-nowrap">
                      <span className={p.estimado ? 'text-alerta' : ''}>
                        {formatarGmd(p.gmdMedioKgDia)}
                      </span>
                      {p.estimado && (
                        <span className="ml-1 text-xs text-texto-suave">(inclui estimado)</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-texto-suave">
                      {p.quantidade > 1
                        ? `${formatarGmd(p.gmdMinimoKgDia)} a ${formatarGmd(p.gmdMaximoKgDia)}`
                        : '—'}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
          <p className="text-xs text-texto-suave">
            Cada período compara só os animais pesados nas duas datas e que estavam no lote durante
            todo o intervalo. Animais pesados em datas diferentes formam períodos separados.
          </p>
        </>
      )}

      {e.animais.length > 0 && (
        <details
          className="rounded-lg border border-borda bg-superficie"
          data-testid="animais-que-passaram"
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Animais considerados ({e.animais.length}) e período de cada um no lote
          </summary>
          <div className="border-t border-borda p-2">
            <Tabela>
              <Cabeca>
                <Th>Animal</Th>
                <Th>Período no lote</Th>
                <Th>Pesagens no lote</Th>
                <Th>Pesagens fora do lote</Th>
                <Th>Situação hoje</Th>
              </Cabeca>
              <tbody>
                {e.animais.map((a) => (
                  <Linha key={a.id}>
                    <Td>
                      <Link to={`/rebanho/animais/${a.id}`} className="text-marca hover:underline">
                        {a.identificacao}
                      </Link>
                      {a.nome && <span className="text-texto-suave"> · {a.nome}</span>}
                    </Td>
                    <Td>{a.permanencias.map(descreverPermanencia).join('; ')}</Td>
                    <Td>{a.trechos.reduce((s, t) => s + t.length, 0)}</Td>
                    <Td className="text-texto-suave">{a.pesagensForaDoLote}</Td>
                    <Td>
                      {a.noLoteAgora ? (
                        <Selo tom="sucesso">No lote</Selo>
                      ) : a.status === 'ativo' ? (
                        <Selo>Em outro lote ou sem lote</Selo>
                      ) : (
                        <Selo>{rotulos.status[a.status]}</Selo>
                      )}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          </div>
        </details>
      )}
    </section>
  );
}
