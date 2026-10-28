import { useState } from 'react';
import { Link } from 'react-router';
import { diasEntre, somarDias, type BaseDeUnidade } from '@pecuaria/domain';
import {
  explicarCompletude,
  situacaoResultado,
  textoResultado,
  type CompletudeResultado,
  type Propriedade,
} from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Campo, Selecao } from '../../components/ui/campos';
import {
  Cartao,
  CartaoCabecalho,
  CartaoConteudo,
  CartaoDescricao,
  CartaoTitulo,
} from '../../components/ui/cartao';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import {
  useIndicadores,
  usePontoEquilibrio,
  useResultadoPeriodo,
  useResultadoRealizado,
} from '../../lib/consultas-resultado';
import { formatarData } from '../../lib/formatar-rebanho';
import { avisoGeral, moeda } from '../../textos-financeiro';
import { categoriasCusto } from '../../textos-rateio';
import {
  basesUnidade,
  saidasAnimal,
  textoCaixa,
  textoCompetencia,
  textoEquilibrio,
  textoMargemBruta,
  textoRealizado,
  unidadesCurtas,
} from '../../textos-resultado';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador, destaqueDoResultado } from './blocos';
import { SeletorPeriodo, mesCorrente, type Periodo } from './seletor-periodo';
import { ValorApurado } from './valor-apurado';

const quantidade = (milesimos: number) =>
  (milesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
/** Valor e qualificador do resultado pela regra única (completo, parcial, não apurado). */
const resultadoTexto = (c: CompletudeResultado) => textoResultado(c, moeda);
/** Receitas por origem: vendas brutas, devoluções (deduzidas), leite, outras e recuperado. */
function dicaReceitas(x: {
  vendaAnimaisCentavos: number;
  devolucoesVendaCentavos: number;
  leiteCentavos: number;
  outrasCentavos: number;
  recuperadoDevolucaoCompraCentavos: number;
}) {
  const partes = [`Animais ${moeda(x.vendaAnimaisCentavos)}`];
  if (x.devolucoesVendaCentavos > 0) partes.push(`devoluções −${moeda(x.devolucoesVendaCentavos)}`);
  partes.push(`leite ${moeda(x.leiteCentavos)}`, `outras ${moeda(x.outrasCentavos)}`);
  if (x.recuperadoDevolucaoCompraCentavos > 0)
    partes.push(
      `recuperado de fornecedor ${moeda(x.recuperadoDevolucaoCompraCentavos)} (não é venda)`,
    );
  return partes.join(' · ');
}

/** Selo com a situação, só quando não é completo. */
function SeloSituacao({ c }: { c: CompletudeResultado }) {
  if (c.estado === 'completo') return null;
  return <Selo tom="alerta">{situacaoResultado(c)}</Selo>;
}
const porUnidade = (c: number | null, unidade: string) =>
  c === null ? 'Sem dado' : `${moeda(c)} / ${unidade}`;

function anterior(p: Periodo): Periodo {
  const dias = diasEntre(p.inicio, p.fim) + 1;
  return { inicio: somarDias(p.inicio, -dias), fim: somarDias(p.inicio, -1) };
}

function Comparacao({ propriedadeId, periodo }: { propriedadeId: string; periodo: Periodo }) {
  const ant = anterior(periodo);
  const atual = useResultadoPeriodo({
    propriedadeId,
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
  });
  const antes = useResultadoPeriodo({ propriedadeId, dataInicial: ant.inicio, dataFinal: ant.fim });
  if (!atual.data || !antes.data) return null;
  const linhas: [string, number | null, number | null][] = [
    [
      'Receitas',
      atual.data.competencia.receitas.totalCentavos,
      antes.data.competencia.receitas.totalCentavos,
    ],
    [
      'Custos (conhecidos)',
      atual.data.competencia.custo.valorConhecidoCentavos,
      antes.data.competencia.custo.valorConhecidoCentavos,
    ],
    [
      'Resultado',
      atual.data.competencia.resultadoCentavos,
      antes.data.competencia.resultadoCentavos,
    ],
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-base font-semibold">Comparação com o período anterior</h3>
      <p className="text-xs text-texto-suave">
        Período anterior de mesmo tamanho: {formatarData(ant.inicio)} a {formatarData(ant.fim)}.
        {atual.data.competencia.estado !== 'completo' ||
        antes.data.competencia.estado !== 'completo'
          ? ' Algum dos períodos tem resultado parcial ou não apurado: a comparação é parcial.'
          : ''}
      </p>
      <Tabela data-testid="comparacao-periodos">
        <Cabeca>
          <Th>Competência</Th>
          <Th className="text-right">Este período</Th>
          <Th className="text-right">Anterior</Th>
          <Th className="text-right">Variação</Th>
        </Cabeca>
        <tbody>
          {linhas.map(([rotulo, a, b]) => (
            <Linha key={rotulo}>
              <Td>{rotulo}</Td>
              <Td className="text-right whitespace-nowrap">
                {a === null ? 'Não apurado' : moeda(a)}
              </Td>
              <Td className="text-right whitespace-nowrap">
                {b === null ? 'Não apurado' : moeda(b)}
              </Td>
              <Td className="text-right whitespace-nowrap">
                {a === null || b === null ? 'Sem dado' : moeda(a - b)}
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
    </section>
  );
}

function PontoDeEquilibrio({
  propriedadeId,
  periodo,
}: {
  propriedadeId: string;
  periodo: Periodo;
}) {
  const [base, setBase] = useState<BaseDeUnidade>('arroba_carcaca');
  const pe = usePontoEquilibrio({
    propriedadeId,
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
    base,
  });
  const d = pe.data;
  return (
    <Cartao data-testid="ponto-equilibrio">
      <CartaoCabecalho>
        <CartaoTitulo>Ponto de equilíbrio</CartaoTitulo>
        <CartaoDescricao>{textoEquilibrio}</CartaoDescricao>
      </CartaoCabecalho>
      <CartaoConteudo className="flex flex-col gap-3">
        <Campo rotulo="Base">
          {(p) => (
            <Selecao {...p} value={base} onChange={(e) => setBase(e.target.value as BaseDeUnidade)}>
              {(Object.keys(basesUnidade) as BaseDeUnidade[]).map((b) => (
                <option key={b} value={b}>
                  {basesUnidade[b]}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        {pe.isError && <Alerta tom="perigo" titulo={mensagemDeErro(pe.error)} />}
        {d && d.estado === 'calculado' && d.unidadesMilesimos !== null && (
          <GradeIndicadores>
            <Indicador
              rotulo="Equilíbrio"
              valor={`${quantidade(d.unidadesMilesimos)} ${unidadesCurtas[d.base]}`}
            />
            <Indicador
              rotulo="Vendido no período"
              valor={`${quantidade(d.unidadesVendidasMilesimos)} ${unidadesCurtas[d.base]}`}
            />
            <Indicador
              rotulo="Preço médio"
              valor={porUnidade(d.precoMedioCentavos, unidadesCurtas[d.base])}
            />
            <Indicador
              rotulo="Custo variável"
              valor={porUnidade(d.custoVariavelPorUnidadeCentavos, unidadesCurtas[d.base])}
            />
          </GradeIndicadores>
        )}
        {d && d.estado === 'indisponivel' && (
          <Alerta tom="alerta" titulo="Não calculado">
            <ul className="list-disc pl-5">
              {d.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Alerta>
        )}
      </CartaoConteudo>
    </Cartao>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());
  const filtros = {
    propriedadeId: propriedade.id,
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
  };
  const resultado = useResultadoPeriodo(filtros);
  const realizado = useResultadoRealizado(filtros);
  const indicadores = useIndicadores(filtros);
  const r = resultado.data;
  const rr = realizado.data;
  const ind = indicadores.data;
  const erro = resultado.error ?? realizado.error ?? indicadores.error;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Resultado"
        descricao="Resultado por competência e caixa lado a lado, margens, indicadores e resultado realizado por animal e lote."
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />
      {erro && <Alerta tom="perigo" titulo={mensagemDeErro(erro)} />}
      {r && (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Cartao data-testid="bloco-resultado-competencia">
            <CartaoCabecalho>
              <CartaoTitulo>Competência</CartaoTitulo>
              <CartaoDescricao>{textoCompetencia}</CartaoDescricao>
            </CartaoCabecalho>
            <CartaoConteudo className="flex flex-col gap-3">
              <GradeIndicadores>
                <Indicador
                  rotulo="Receitas"
                  valor={moeda(r.competencia.receitas.totalCentavos)}
                  dica={dicaReceitas(r.competencia.receitas)}
                />
                <Indicador
                  rotulo="Custos apropriados"
                  valor={<ValorApurado a={r.competencia.custo} />}
                  dica={`Inclui ${moeda(r.competencia.naoAlocadoCentavos)} não alocados e ${moeda(r.competencia.baixaDeAnimaisCentavos)} de aquisição de animais que saíram${r.competencia.estornoDeBaixaCentavos > 0 ? `; ${moeda(r.competencia.estornoDeBaixaCentavos)} de aquisição voltaram ao rebanho com animais devolvidos pelo comprador (saem do custo)` : ''}`}
                />
                <Indicador
                  rotulo="Resultado (margem líquida)"
                  valor={resultadoTexto(r.competencia)}
                  destaque={destaqueDoResultado(r.competencia)}
                  dica={explicarCompletude(r.competencia)}
                />
              </GradeIndicadores>
              {r.competencia.animaisSemBase > 0 && (
                <Alerta tom="alerta">
                  {r.competencia.animaisSemBase} animal(is) saíram sem custo de aquisição nem custo
                  anterior informado: o custo deles está incompleto.
                </Alerta>
              )}
            </CartaoConteudo>
          </Cartao>
          <Cartao data-testid="bloco-resultado-caixa">
            <CartaoCabecalho>
              <CartaoTitulo>Caixa</CartaoTitulo>
              <CartaoDescricao>{textoCaixa}</CartaoDescricao>
            </CartaoCabecalho>
            <CartaoConteudo className="flex flex-col gap-3">
              <GradeIndicadores>
                <Indicador rotulo="Entradas" valor={moeda(r.caixa.entradasCentavos)} />
                <Indicador rotulo="Saídas" valor={moeda(r.caixa.saidasCentavos)} />
                <Indicador rotulo="Saldo do movimento" valor={moeda(r.caixa.saldoCentavos)} />
              </GradeIndicadores>
              <p className="text-sm">
                <Link className="text-marca hover:underline" to="/financeiro/conciliacao">
                  Por que o caixa é diferente do resultado?
                </Link>
              </p>
            </CartaoConteudo>
          </Cartao>
        </div>
      )}
      <Comparacao propriedadeId={propriedade.id} periodo={periodo} />
      {r && (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <section className="flex min-w-0 flex-col gap-2">
            <h3 className="text-base font-semibold">Composição do custo</h3>
            {r.competencia.porCategoria.length === 0 ? (
              <p className="text-sm text-texto-suave">Nenhum custo no período.</p>
            ) : (
              <Tabela data-testid="composicao-custo">
                <Cabeca>
                  <Th>Categoria</Th>
                  <Th className="text-right">Valor conhecido</Th>
                </Cabeca>
                <tbody>
                  {r.competencia.porCategoria.map((c) => (
                    <Linha key={c.categoria}>
                      <Td>{categoriasCusto[c.categoria]}</Td>
                      <Td className="text-right whitespace-nowrap">{moeda(c.valorCentavos)}</Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
          </section>
          <Cartao data-testid="margem-bruta">
            <CartaoCabecalho>
              <CartaoTitulo>Margem bruta</CartaoTitulo>
              <CartaoDescricao>{textoMargemBruta}</CartaoDescricao>
            </CartaoCabecalho>
            <CartaoConteudo className="flex flex-col gap-3">
              <GradeIndicadores>
                <Indicador
                  rotulo="Margem bruta"
                  valor={moeda(r.margemBruta.margemCentavos)}
                  destaque={r.margemBruta.estado === 'parcial' ? 'alerta' : undefined}
                  dica={r.margemBruta.estado === 'parcial' ? 'Parcial' : 'Calculada'}
                />
                <Indicador
                  rotulo="Custos variáveis"
                  valor={moeda(r.margemBruta.variaveisCentavos)}
                />
                <Indicador rotulo="Custos fixos" valor={moeda(r.margemBruta.fixosCentavos)} />
              </GradeIndicadores>
              <p className="text-sm">
                Classificados {moeda(r.margemBruta.coberturaCentavos.classificado)} de{' '}
                {moeda(r.margemBruta.coberturaCentavos.total)}; sem classificação{' '}
                {moeda(r.margemBruta.coberturaCentavos.naoClassificado)}.
              </p>
              {r.margemBruta.motivos.length > 0 && (
                <Alerta tom="alerta">
                  <ul className="list-disc pl-5">
                    {r.margemBruta.motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </Alerta>
              )}
              {r.margemBruta.semClassificacao.length > 0 && (
                <>
                  <Tabela data-testid="sem-classificacao">
                    <Cabeca>
                      <Th>Data</Th>
                      <Th>Custo sem classificação</Th>
                      <Th className="text-right">Valor</Th>
                    </Cabeca>
                    <tbody>
                      {r.margemBruta.semClassificacao.map((s, k) => (
                        <Linha key={`${k}-${s.origem.id}`}>
                          <Td className="whitespace-nowrap">{formatarData(s.data)}</Td>
                          <Td>{s.descricao}</Td>
                          <Td className="text-right whitespace-nowrap">
                            {s.valorCentavos === null
                              ? 'Custo desconhecido'
                              : moeda(s.valorCentavos)}
                          </Td>
                        </Linha>
                      ))}
                    </tbody>
                  </Tabela>
                  <Link
                    className="text-sm text-marca hover:underline"
                    to="/financeiro/classificacoes"
                  >
                    Classificar custos
                  </Link>
                </>
              )}
            </CartaoConteudo>
          </Cartao>
        </div>
      )}
      {ind && (
        <section className="flex min-w-0 flex-col gap-3" data-testid="indicadores">
          <h3 className="text-base font-semibold">Indicadores</h3>
          <GradeIndicadores>
            <Indicador
              rotulo="Custo por kg de peso vivo ganho"
              valor={
                ind.custoPorKgGanho.centavosPorKg === null
                  ? 'Sem dado'
                  : `${ind.custoPorKgGanho.estado === 'parcial' ? 'no mínimo ' : ''}${moeda(ind.custoPorKgGanho.centavosPorKg)} / kg`
              }
              dica={`${ind.custoPorKgGanho.animais} animal(is) com duas pesagens no período; ${ind.custoPorKgGanho.semPesagens} com custo e sem duas pesagens ficaram de fora`}
            />
            <Indicador
              rotulo="Custo por @ de carcaça vendida"
              valor={porUnidade(ind.carcaca.custoPorArrobaCentavos, '@ carcaça')}
              dica={`${ind.carcaca.animais} venda(s) com carcaça; ${ind.carcaca.semPeso} sem peso de carcaça ficaram de fora`}
            />
            <Indicador
              rotulo="Receita por @ de carcaça"
              valor={porUnidade(ind.carcaca.receitaPorArrobaCentavos, '@ carcaça')}
              dica={
                ind.carcaca.margemPorArrobaCentavos === null
                  ? undefined
                  : `Margem ${moeda(ind.carcaca.margemPorArrobaCentavos)} / @`
              }
            />
            <Indicador
              rotulo="Custo por @ de peso vivo vendida"
              valor={porUnidade(ind.vivo.custoPorArrobaCentavos, '@ viva')}
              dica={`${ind.vivo.animais} venda(s) com peso vivo; ${ind.vivo.semPeso} sem peso`}
            />
            <Indicador
              rotulo="Preço médio do litro vendido"
              valor={porUnidade(ind.leite.precoPorLitroCentavos, 'litro')}
              dica={`${quantidade(ind.leite.litrosMilesimos)} litro(s); ${ind.leite.receitasSemLitros} receita(s) sem litros ficaram de fora`}
            />
          </GradeIndicadores>
          {ind.porLote.length > 0 && (
            <Tabela data-testid="custo-kg-por-lote">
              <Cabeca>
                <Th>Lote atual</Th>
                <Th className="text-right">Animais</Th>
                <Th className="text-right">Ganho</Th>
                <Th className="text-right">Custo por kg ganho</Th>
              </Cabeca>
              <tbody>
                {ind.porLote.map((l) => (
                  <Linha key={l.loteId}>
                    <Td>{l.loteNome}</Td>
                    <Td className="text-right">{l.animais}</Td>
                    <Td className="text-right whitespace-nowrap">{quantidade(l.ganhoGramas)} kg</Td>
                    <Td className="text-right whitespace-nowrap">
                      {l.centavosPorKg === null ? 'Sem dado' : `${moeda(l.centavosPorKg)} / kg`}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </section>
      )}
      <PontoDeEquilibrio propriedadeId={propriedade.id} periodo={periodo} />
      {rr && (
        <section className="flex min-w-0 flex-col gap-3" data-testid="realizado">
          <h3 className="text-base font-semibold">Resultado realizado (animais que saíram)</h3>
          <p className="text-sm text-texto-suave">{textoRealizado}</p>
          <GradeIndicadores>
            <Indicador
              rotulo="Animais"
              valor={String(rr.totais.animais)}
              dica={`${rr.totais.vendidos} vendido(s), ${rr.totais.perdas} morte(s)`}
            />
            <Indicador
              rotulo="Receita"
              valor={moeda(rr.totais.receitaCentavos)}
              dica={
                rr.totais.receitasDesconhecidas > 0
                  ? `${rr.totais.receitasDesconhecidas} saída(s) sem receita registrada (fora da soma)`
                  : undefined
              }
            />
            <Indicador rotulo="Custo da baixa" valor={<ValorApurado a={rr.totais.custo} />} />
            <Indicador
              rotulo="Resultado"
              valor={resultadoTexto(rr.totais)}
              destaque={rr.totais.estado === 'completo' ? undefined : 'alerta'}
              dica={
                rr.totais.estado === 'completo'
                  ? `Perdas: ${moeda(rr.totais.perdasCentavos)}`
                  : explicarCompletude(rr.totais)
              }
            />
          </GradeIndicadores>
          {rr.porLote.length > 0 && (
            <Tabela data-testid="realizado-por-lote">
              <Cabeca>
                <Th>Lote de saída</Th>
                <Th className="text-right">Animais</Th>
                <Th className="text-right">Receita</Th>
                <Th className="text-right">Custo</Th>
                <Th className="text-right">Resultado</Th>
              </Cabeca>
              <tbody>
                {rr.porLote.map((g) => (
                  <Linha key={g.loteId ?? 'sem'}>
                    <Td>{g.loteNome}</Td>
                    <Td className="text-right">{g.animais}</Td>
                    <Td className="text-right whitespace-nowrap">
                      {moeda(g.receitaCentavos)}
                      {g.receitasDesconhecidas > 0 && (
                        <span className="block text-xs text-texto-suave">
                          + {g.receitasDesconhecidas} sem receita registrada
                        </span>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <ValorApurado a={g.custo} />
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {resultadoTexto(g)} <SeloSituacao c={g} />
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
          {rr.animais.length > 0 && (
            <Tabela data-testid="realizado-animais">
              <Cabeca>
                <Th>Animal</Th>
                <Th>Saída</Th>
                <Th>Data</Th>
                <Th className="text-right">Receita</Th>
                <Th className="text-right">Custo acumulado</Th>
                <Th className="text-right">Resultado</Th>
              </Cabeca>
              <tbody>
                {rr.animais.map((a) => (
                  <Linha key={a.animalId}>
                    <Td>
                      <Link
                        className="text-marca hover:underline"
                        to={`/financeiro/custos?animal=${a.animalId}`}
                      >
                        {a.identificacao}
                      </Link>
                    </Td>
                    <Td>{saidasAnimal[a.saida]}</Td>
                    <Td className="whitespace-nowrap">{formatarData(a.data)}</Td>
                    <Td className="text-right whitespace-nowrap">
                      {a.receitaCentavos === null ? 'Não registrada' : moeda(a.receitaCentavos)}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <ValorApurado a={a.custo} />
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {resultadoTexto(a)} <SeloSituacao c={a} />
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
          {rr.devolucoesVenda.length > 0 && (
            <div className="flex min-w-0 flex-col gap-2" data-testid="devolucoes-venda">
              <h4 className="font-medium">Devoluções de venda (o comprador devolveu)</h4>
              <p className="text-xs text-texto-suave">
                O animal volta ao rebanho com o custo que tinha na saída; a venda continua no
                histórico do seu período.
              </p>
              <Tabela>
                <Cabeca>
                  <Th>Animal</Th>
                  <Th>Devolução</Th>
                  <Th>Venda</Th>
                  <Th className="text-right">Receita original</Th>
                  <Th className="text-right">Valor devolvido</Th>
                  <Th className="text-right">Custo que volta</Th>
                  <Th className="text-right">Efeito no resultado</Th>
                </Cabeca>
                <tbody>
                  {rr.devolucoesVenda.map((d) => (
                    <Linha key={`${d.animalId}-${d.data}`}>
                      <Td>{d.identificacao}</Td>
                      <Td className="whitespace-nowrap">{formatarData(d.data)}</Td>
                      <Td className="whitespace-nowrap">{formatarData(d.dataVenda)}</Td>
                      <Td className="text-right whitespace-nowrap">
                        {moeda(d.receitaOriginalCentavos)}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        {moeda(d.valorDevolvidoCentavos)}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        <ValorApurado a={d.custoQueVolta} />
                      </Td>
                      <Td className="text-right whitespace-nowrap">{moeda(d.efeitoCentavos)}</Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </div>
          )}
          {rr.devolucoesCompra.animais > 0 && (
            <div className="flex min-w-0 flex-col gap-2" data-testid="devolucoes-compra">
              <h4 className="font-medium">Devoluções ao fornecedor</h4>
              <p className="text-xs text-texto-suave">
                Diferença econômica entre o valor recuperado e o custo acumulado do animal: não é
                lucro de venda de gado e fica fora dos totais acima.
              </p>
              <GradeIndicadores>
                <Indicador rotulo="Animais" valor={String(rr.devolucoesCompra.animais)} />
                <Indicador
                  rotulo="Valor recuperado"
                  valor={moeda(rr.devolucoesCompra.recuperadoCentavos)}
                />
                <Indicador
                  rotulo="Custo acumulado"
                  valor={<ValorApurado a={rr.devolucoesCompra.custo} />}
                />
                <Indicador
                  rotulo="Diferença econômica"
                  valor={moeda(rr.devolucoesCompra.diferencaCentavos)}
                />
              </GradeIndicadores>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function PaginaResultado() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
