import { useState } from 'react';
import { Link } from 'react-router';
import { Wallet } from 'lucide-react';
import { ATIVIDADES, GRANULARIDADES_FLUXO, NATUREZAS_FINANCEIRAS } from '@pecuaria/domain';
import type { Propriedade, TotalPorCategoria } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Selecao, opcoesDe } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useCategoriasFinanceiras, useFluxo } from '../../lib/consultas-financeiro';
import { formatarData } from '../../lib/formatar-rebanho';
import { cn } from '../../lib/utils';
import {
  atividades,
  avisoGeral,
  granularidades,
  moeda,
  naturezas,
  rotuloDoPeriodo,
  textoPrevisto,
  textoRealizado,
  tratamentosCurtos,
} from '../../textos-financeiro';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';
import { SeletorPeriodo, mesCorrente, type Periodo } from './seletor-periodo';

type Visao = 'realizado' | 'previsto';

function PorCategoria({ itens }: { itens: TotalPorCategoria[] }) {
  if (itens.length === 0) return null;
  return (
    <Tabela data-testid="fluxo-por-categoria">
      <Cabeca>
        <Th>Categoria</Th>
        <Th>Natureza</Th>
        <Th>Tratamento</Th>
        <Th className="text-right">Movimentos</Th>
        <Th className="text-right">Total</Th>
      </Cabeca>
      <tbody>
        {itens.map((c) => (
          <Linha key={c.categoriaId}>
            <Td>{c.categoriaNome}</Td>
            <Td>{naturezas[c.natureza]}</Td>
            <Td>{tratamentosCurtos[c.tratamento]}</Td>
            <Td className="text-right">{c.quantidade}</Td>
            <Td className="text-right whitespace-nowrap">{moeda(c.totalCentavos)}</Td>
          </Linha>
        ))}
      </tbody>
    </Tabela>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [visao, setVisao] = useState<Visao>('realizado');
  const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());
  const [granularidade, setGranularidade] =
    useState<(typeof GRANULARIDADES_FLUXO)[number]>('semana');
  const [natureza, setNatureza] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [atividade, setAtividade] = useState('');
  const [mostrarVazios, setMostrarVazios] = useState(false);
  const categorias = useCategoriasFinanceiras(true);
  const consulta = useFluxo({
    propriedadeId: propriedade.id,
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
    granularidade,
    ...(natureza ? { natureza: natureza as 'receita' | 'despesa' } : {}),
    ...(categoriaId ? { categoriaId } : {}),
    ...(atividade ? { atividade: atividade as (typeof ATIVIDADES)[number] } : {}),
  });
  const f = consulta.data;
  const pendentes = f?.pendentesDeDefinicao;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Fluxo de caixa"
        descricao="Dois quadros separados: o que já entrou e saiu (realizado) e o que está para vencer (previsto). Um nunca é somado ao outro."
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} atalhosAFrente />
      <div className="flex flex-wrap items-end gap-4">
        <Campo rotulo="Agrupar">
          {(p) => (
            <Selecao
              {...p}
              value={granularidade}
              onChange={(e) =>
                setGranularidade(e.target.value as (typeof GRANULARIDADES_FLUXO)[number])
              }
            >
              {opcoesDe(granularidades, GRANULARIDADES_FLUXO)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Natureza">
          {(p) => (
            <Selecao {...p} value={natureza} onChange={(e) => setNatureza(e.target.value)}>
              <option value="">Todas</option>
              {opcoesDe(naturezas, NATUREZAS_FINANCEIRAS)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Categoria">
          {(p) => (
            <Selecao {...p} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Todas</option>
              {(categorias.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Atividade">
          {(p) => (
            <Selecao {...p} value={atividade} onChange={(e) => setAtividade(e.target.value)}>
              <option value="">Todas</option>
              {opcoesDe(atividades, ATIVIDADES)}
            </Selecao>
          )}
        </Campo>
      </div>
      <CaixaMarcar
        rotulo="Mostrar períodos sem movimento"
        marcado={mostrarVazios}
        aoMudar={setMostrarVazios}
      />
      <div role="tablist" aria-label="Visão do fluxo" className="flex gap-1 border-b border-borda">
        {(['realizado', 'previsto'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={visao === v}
            onClick={() => setVisao(v)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
              visao === v
                ? 'border-marca font-medium text-texto'
                : 'border-transparent text-texto-suave hover:text-texto',
            )}
          >
            {v === 'realizado'
              ? 'Realizado (pagamentos e recebimentos)'
              : 'Previsto (parcelas em aberto)'}
          </button>
        ))}
      </div>
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      {!f ? (
        <p className="text-sm text-texto-suave">Carregando o fluxo…</p>
      ) : visao === 'realizado' ? (
        <section className="flex min-w-0 flex-col gap-4" data-testid="fluxo-realizado">
          <p className="text-sm text-texto-suave">{textoRealizado}</p>
          <GradeIndicadores>
            <Indicador rotulo="Entradas (recebido)" valor={moeda(f.realizado.entradasCentavos)} />
            <Indicador rotulo="Saídas (pago)" valor={moeda(f.realizado.saidasCentavos)} />
            <Indicador
              rotulo="Saldo do movimento"
              valor={moeda(f.realizado.saldoCentavos)}
              dica={`${f.realizado.movimentos} pagamento(s) e recebimento(s) no período`}
            />
          </GradeIndicadores>
          {f.realizado.movimentos === 0 ? (
            <EstadoVazio
              icone={Wallet}
              titulo="Nenhum pagamento ou recebimento no período"
              descricao="O fluxo realizado só mostra o que foi efetivamente pago ou recebido e registrado."
            />
          ) : (
            <Tabela data-testid="tabela-fluxo-realizado">
              <Cabeca>
                <Th>Período</Th>
                <Th className="text-right">Entradas</Th>
                <Th className="text-right">Saídas</Th>
                <Th className="text-right">Saldo do período</Th>
                <Th
                  className="text-right"
                  title="Soma dos saldos desde o início do período consultado. Não é saldo bancário."
                >
                  Acumulado na consulta
                </Th>
              </Cabeca>
              <tbody>
                {f.realizado.linhas
                  .filter((l) => mostrarVazios || l.movimentos > 0)
                  .map((l) => (
                    <Linha
                      key={l.chave}
                      className={l.movimentos === 0 ? 'text-texto-suave' : undefined}
                    >
                      <Td className="whitespace-nowrap">
                        {rotuloDoPeriodo(l.chave, f.granularidade)}
                      </Td>
                      <Td className="text-right whitespace-nowrap">{moeda(l.entradasCentavos)}</Td>
                      <Td className="text-right whitespace-nowrap">{moeda(l.saidasCentavos)}</Td>
                      <Td className="text-right whitespace-nowrap">
                        {moeda(l.saldoDoPeriodoCentavos)}
                      </Td>
                      <Td className="text-right whitespace-nowrap">{moeda(l.acumuladoCentavos)}</Td>
                    </Linha>
                  ))}
              </tbody>
            </Tabela>
          )}
          <PorCategoria itens={f.realizado.porCategoria} />
        </section>
      ) : (
        <section className="flex min-w-0 flex-col gap-4" data-testid="fluxo-previsto">
          <p className="text-sm text-texto-suave">{textoPrevisto}</p>
          <GradeIndicadores>
            <Indicador rotulo="A receber" valor={moeda(f.previsto.aReceberCentavos)} />
            <Indicador rotulo="A pagar" valor={moeda(f.previsto.aPagarCentavos)} />
            <Indicador
              rotulo="Saldo previsto"
              valor={moeda(f.previsto.saldoPrevistoCentavos)}
              dica={`${f.previsto.parcelas} parcela(s) em aberto com vencimento no período`}
            />
            <Indicador
              rotulo="Receber em atraso"
              valor={moeda(f.previsto.emAtrasoReceberCentavos)}
              destaque={f.previsto.emAtrasoReceberCentavos > 0 ? 'perigo' : undefined}
            />
            <Indicador
              rotulo="Pagar em atraso"
              valor={moeda(f.previsto.emAtrasoPagarCentavos)}
              destaque={f.previsto.emAtrasoPagarCentavos > 0 ? 'perigo' : undefined}
            />
          </GradeIndicadores>
          {pendentes && pendentes.quantidade > 0 && (
            <Alerta tom="alerta" titulo="Há lançamentos sem condição de pagamento definida">
              {pendentes.quantidade} lançamento(s) (operações de{' '}
              {moeda(pendentes.valorOperacaoDespesaCentavos)} em despesas e{' '}
              {moeda(pendentes.valorOperacaoReceitaCentavos)} em receitas) não aparecem no previsto:
              o saldo deles é desconhecido, não zero.{' '}
              <Link className="underline" to="/financeiro/lancamentos?situacao=pendente_definicao">
                Definir as condições
              </Link>
            </Alerta>
          )}
          {f.previsto.parcelas === 0 ? (
            <EstadoVazio
              icone={Wallet}
              titulo="Nenhuma parcela em aberto vence no período"
              descricao={`Período consultado: ${formatarData(f.dataInicial)} a ${formatarData(f.dataFinal)}.`}
            />
          ) : (
            <Tabela data-testid="tabela-fluxo-previsto">
              <Cabeca>
                <Th>Vencimento</Th>
                <Th className="text-right">A receber</Th>
                <Th className="text-right">A pagar</Th>
                <Th className="text-right">Saldo previsto</Th>
                <Th className="text-right">Em atraso</Th>
                <Th className="text-right">Parcelas</Th>
              </Cabeca>
              <tbody>
                {f.previsto.linhas
                  .filter((l) => mostrarVazios || l.parcelas > 0)
                  .map((l) => (
                    <Linha
                      key={l.chave}
                      className={l.parcelas === 0 ? 'text-texto-suave' : undefined}
                    >
                      <Td className="whitespace-nowrap">
                        {rotuloDoPeriodo(l.chave, f.granularidade)}
                      </Td>
                      <Td className="text-right whitespace-nowrap">{moeda(l.aReceberCentavos)}</Td>
                      <Td className="text-right whitespace-nowrap">{moeda(l.aPagarCentavos)}</Td>
                      <Td className="text-right whitespace-nowrap">
                        {moeda(l.saldoPrevistoCentavos)}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        {l.emAtrasoReceberCentavos + l.emAtrasoPagarCentavos > 0
                          ? `${moeda(l.emAtrasoReceberCentavos)} a receber · ${moeda(l.emAtrasoPagarCentavos)} a pagar`
                          : '—'}
                      </Td>
                      <Td className="text-right">{l.parcelas}</Td>
                    </Linha>
                  ))}
              </tbody>
            </Tabela>
          )}
          <PorCategoria itens={f.previsto.porCategoria} />
        </section>
      )}
      <div>
        <Link to="/financeiro/contas">
          <Botao variante="secundario">Ver contas a pagar e a receber</Botao>
        </Link>
      </div>
    </div>
  );
}

export function PaginaFluxo() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
