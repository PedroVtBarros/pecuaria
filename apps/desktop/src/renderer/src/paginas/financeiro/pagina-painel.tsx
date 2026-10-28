import { useState } from 'react';
import { Link } from 'react-router';
import { formatarCentavos } from '@pecuaria/domain';
import { situacaoResultado, textoResultado, type Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import {
  Cartao,
  CartaoCabecalho,
  CartaoConteudo,
  CartaoDescricao,
  CartaoTitulo,
} from '../../components/ui/cartao';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { mensagemDeErro } from '../../lib/api';
import { usePainel } from '../../lib/consultas-financeiro';
import { useCentrosProducao } from '../../lib/consultas-producao';
import { usePendentesRateio } from '../../lib/consultas-rateio';
import { useResultadoPeriodo } from '../../lib/consultas-resultado';
import { textoCompetencia } from '../../textos-resultado';
import { ValorApurado } from './valor-apurado';
import { avisoGeral, naturezas, textoRealizado, tratamentosCurtos } from '../../textos-financeiro';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador, destaqueDoResultado } from './blocos';
import { SeletorPeriodo, mesCorrente, type Periodo } from './seletor-periodo';

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());
  const consulta = usePainel({
    propriedadeId: propriedade.id,
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
  });
  const p = consulta.data;
  const resultado = useResultadoPeriodo({
    propriedadeId: propriedade.id,
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
  });
  const pendentesRateio = usePendentesRateio(propriedade.id);
  const centros = useCentrosProducao(propriedade.id, false);
  const r = resultado.data;
  const naoAlocado = pendentesRateio.data?.total;
  const centrosAbertos = (centros.data ?? []).filter((c) => c.status === 'aberto').length;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Painel financeiro"
        descricao="Caixa, contas a pagar e a receber e lançamentos do período, em blocos separados. Nenhum bloco é somado com outro."
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      {!p ? (
        <p className="text-sm text-texto-suave">Carregando o painel…</p>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <Cartao data-testid="bloco-caixa">
            <CartaoCabecalho>
              <CartaoTitulo>Caixa realizado no período</CartaoTitulo>
              <CartaoDescricao>{textoRealizado}</CartaoDescricao>
            </CartaoCabecalho>
            <CartaoConteudo>
              <GradeIndicadores>
                <Indicador
                  rotulo="Entradas (recebido)"
                  valor={formatarCentavos(p.caixa.entradasCentavos)}
                />
                <Indicador
                  rotulo="Saídas (pago)"
                  valor={formatarCentavos(p.caixa.saidasCentavos)}
                />
                <Indicador
                  rotulo="Saldo do movimento"
                  valor={formatarCentavos(p.caixa.saldoCentavos)}
                  dica={`${p.caixa.movimentos} pagamento(s) e recebimento(s)`}
                />
              </GradeIndicadores>
              <Link
                className="mt-4 inline-block text-sm text-marca hover:underline"
                to="/financeiro/fluxo"
              >
                Ver fluxo de caixa
              </Link>
            </CartaoConteudo>
          </Cartao>

          <Cartao data-testid="bloco-contas">
            <CartaoCabecalho>
              <CartaoTitulo>Contas em aberto (todas as datas)</CartaoTitulo>
              <CartaoDescricao>
                Saldo das parcelas ainda não pagas ou recebidas. Previsão, não resultado.
              </CartaoDescricao>
            </CartaoCabecalho>
            <CartaoConteudo className="flex flex-col gap-4">
              <GradeIndicadores>
                <Indicador
                  rotulo="A receber"
                  valor={formatarCentavos(p.contas.aReceber.saldoTotalCentavos)}
                />
                <Indicador
                  rotulo="Receber em atraso"
                  valor={formatarCentavos(p.contas.aReceber.emAtrasoCentavos)}
                  destaque={p.contas.aReceber.emAtrasoCentavos > 0 ? 'perigo' : undefined}
                  dica={`${p.contas.aReceber.emAtrasoQuantidade} parcela(s)`}
                />
                <Indicador
                  rotulo="Receber em 30 dias"
                  valor={formatarCentavos(p.contas.aReceber.proximos30DiasCentavos)}
                  dica={`${p.contas.aReceber.proximos30DiasQuantidade} parcela(s)`}
                />
              </GradeIndicadores>
              <GradeIndicadores>
                <Indicador
                  rotulo="A pagar"
                  valor={formatarCentavos(p.contas.aPagar.saldoTotalCentavos)}
                />
                <Indicador
                  rotulo="Pagar em atraso"
                  valor={formatarCentavos(p.contas.aPagar.emAtrasoCentavos)}
                  destaque={p.contas.aPagar.emAtrasoCentavos > 0 ? 'perigo' : undefined}
                  dica={`${p.contas.aPagar.emAtrasoQuantidade} parcela(s)`}
                />
                <Indicador
                  rotulo="Pagar em 30 dias"
                  valor={formatarCentavos(p.contas.aPagar.proximos30DiasCentavos)}
                  dica={`${p.contas.aPagar.proximos30DiasQuantidade} parcela(s)`}
                />
              </GradeIndicadores>
              <Link className="text-sm text-marca hover:underline" to="/financeiro/contas">
                Ver contas a pagar e a receber
              </Link>
            </CartaoConteudo>
          </Cartao>

          <Cartao data-testid="bloco-competencia">
            <CartaoCabecalho>
              <CartaoTitulo>Lançado no período (competência)</CartaoTitulo>
              <CartaoDescricao>
                Valor das operações pela data do fato, sem relação com o pagamento. Não é o
                resultado: compras de estoque e de animais só viram custo quando consumidas ou
                quando o animal sai.
              </CartaoDescricao>
            </CartaoCabecalho>
            <CartaoConteudo>
              {p.competencia.length === 0 ? (
                <p className="text-sm text-texto-suave">Nenhum lançamento no período.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {p.competencia.map((c) => (
                    <li
                      key={`${c.natureza}-${c.tratamento}`}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span>
                        {naturezas[c.natureza]} · {tratamentosCurtos[c.tratamento]}
                        <span className="ml-1 text-xs text-texto-suave">({c.quantidade})</span>
                      </span>
                      <span className="font-medium whitespace-nowrap">
                        {formatarCentavos(c.totalCentavos)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CartaoConteudo>
          </Cartao>

          <Cartao data-testid="bloco-resultado">
            <CartaoCabecalho>
              <CartaoTitulo>Resultado do período (competência)</CartaoTitulo>
              <CartaoDescricao>{textoCompetencia}</CartaoDescricao>
            </CartaoCabecalho>
            <CartaoConteudo>
              {!r ? (
                <p className="text-sm text-texto-suave">Calculando…</p>
              ) : (
                <GradeIndicadores>
                  <Indicador
                    rotulo="Receitas"
                    valor={formatarCentavos(r.competencia.receitas.totalCentavos)}
                  />
                  <Indicador rotulo="Custos" valor={<ValorApurado a={r.competencia.custo} />} />
                  <Indicador
                    rotulo="Resultado"
                    valor={textoResultado(r.competencia, formatarCentavos)}
                    destaque={destaqueDoResultado(r.competencia)}
                    dica={situacaoResultado(r.competencia)}
                  />
                </GradeIndicadores>
              )}
              <Link
                className="mt-4 inline-block text-sm text-marca hover:underline"
                to="/financeiro/resultado"
              >
                Ver resultado, margens e indicadores
              </Link>
            </CartaoConteudo>
          </Cartao>

          <Cartao data-testid="bloco-pendencias">
            <CartaoCabecalho>
              <CartaoTitulo>Pendências</CartaoTitulo>
              <CartaoDescricao>O que impede ou limita os números acima.</CartaoDescricao>
            </CartaoCabecalho>
            <CartaoConteudo className="flex flex-col gap-3 text-sm">
              {naoAlocado &&
                naoAlocado.componentesConhecidos + naoAlocado.componentesDesconhecidos > 0 && (
                  <p>
                    Custos da propriedade sem rateio (não alocados): <ValorApurado a={naoAlocado} />
                    .{' '}
                    <Link className="text-marca hover:underline" to="/financeiro/rateio">
                      Ratear
                    </Link>
                  </p>
                )}
              {centrosAbertos > 0 && (
                <p>
                  <strong>{centrosAbertos}</strong> centro(s) de produção aberto(s): o custo deles
                  só vira estoque ao encerrar.{' '}
                  <Link className="text-marca hover:underline" to="/financeiro/producao">
                    Ver produção própria
                  </Link>
                </p>
              )}
              {p.pendencias.pendentesDeDefinicao.quantidade === 0 &&
                p.pendencias.despesasNaoClassificadas.quantidade === 0 && (
                  <p className="text-texto-suave">Nenhuma pendência.</p>
                )}
              {p.pendencias.pendentesDeDefinicao.quantidade > 0 && (
                <p>
                  <strong>{p.pendencias.pendentesDeDefinicao.quantidade}</strong> lançamento(s) sem
                  condição de pagamento definida: o saldo a pagar ou receber é desconhecido e não
                  entra nas contas acima.{' '}
                  <Link
                    className="text-marca hover:underline"
                    to="/financeiro/lancamentos?situacao=pendente_definicao"
                  >
                    Ver lançamentos
                  </Link>
                </p>
              )}
              {p.pendencias.despesasNaoClassificadas.quantidade > 0 && (
                <p>
                  <strong>{p.pendencias.despesasNaoClassificadas.quantidade}</strong> despesa(s) do
                  resultado sem classificação em fixa ou variável (
                  {formatarCentavos(p.pendencias.despesasNaoClassificadas.valorCentavos)}).{' '}
                  <Link className="text-marca hover:underline" to="/financeiro/classificacoes">
                    Classificar
                  </Link>
                </p>
              )}
            </CartaoConteudo>
          </Cartao>
        </div>
      )}
    </div>
  );
}

export function PaginaPainelFinanceiro() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
