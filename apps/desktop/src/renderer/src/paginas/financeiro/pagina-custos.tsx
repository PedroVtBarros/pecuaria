import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Calculator } from 'lucide-react';
import type { Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio, Paginacao } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import {
  useCustosAnimais,
  useExplicacaoAnimal,
  useExplicacaoLote,
  useResumoCustos,
} from '../../lib/consultas-rateio';
import { useLotes } from '../../lib/consultas-rebanho';
import { formatarData } from '../../lib/formatar-rebanho';
import { avisoGeral, moeda } from '../../textos-financeiro';
import { categoriasCusto, origensCusto, textoCustos, valorDesconhecido } from '../../textos-rateio';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';
import { SeletorPeriodo, mesCorrente, type Periodo } from './seletor-periodo';
import { ValorApurado, estadosApuracao } from './valor-apurado';

const TAMANHO = 25;
const tomDoEstado = (e: keyof typeof estadosApuracao) =>
  e === 'completa' ? ('sucesso' as const) : ('alerta' as const);

type OrigemDaLinha = { tipo: string; id: string } | null;

/** Para onde levar o usuário ao clicar na origem de um valor. */
function LinkDeOrigem({ origem, texto }: { origem: OrigemDaLinha; texto: string }) {
  if (!origem) return <>{texto}</>;
  const destino =
    origem.tipo === 'lancamento'
      ? `/financeiro/lancamentos/${origem.id}`
      : origem.tipo === 'aquisicao'
        ? `/financeiro/animais/${origem.id}`
        : origem.tipo === 'custo_anterior'
          ? '/financeiro/custo-anterior'
          : origem.tipo === 'manejo_sanitario'
            ? `/manejo/sanidade/${origem.id}`
            : '/financeiro/consumo';
  return (
    <Link className="text-marca hover:underline" to={destino}>
      {texto}
    </Link>
  );
}

function ModalOrigemAnimal({
  animalId,
  periodo,
  aoFechar,
}: {
  animalId: string;
  periodo: Periodo | null;
  aoFechar: () => void;
}) {
  const consulta = useExplicacaoAnimal({
    animalId,
    ...(periodo ? { dataInicial: periodo.inicio, dataFinal: periodo.fim } : {}),
  });
  const e = consulta.data;
  return (
    <Modal
      aberto
      largura="xl"
      titulo={e ? `De onde veio o custo de ${e.identificacao}` : 'De onde veio este número?'}
      descricao="Cada linha mostra de onde veio uma parte do custo e como ela chegou até o animal."
      aoFechar={aoFechar}
    >
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      {!e && !consulta.isError && <p className="text-sm text-texto-suave">Carregando…</p>}
      {e && (
        <div className="flex flex-col gap-4" data-testid="origem-custo-animal">
          <GradeIndicadores>
            <Indicador
              rotulo="Custo apropriado"
              valor={<ValorApurado a={e.apuracao} />}
              dica={estadosApuracao[e.apuracao.estado]}
              destaque={e.apuracao.estado === 'completa' ? undefined : 'alerta'}
            />
            {e.porCategoria.map((c) => (
              <Indicador
                key={c.categoria}
                rotulo={categoriasCusto[c.categoria]}
                valor={moeda(c.valorCentavos)}
              />
            ))}
          </GradeIndicadores>
          {e.avisos.map((a) => (
            <Alerta key={a} tom="alerta">
              {a}
            </Alerta>
          ))}
          {e.linhas.length === 0 ? (
            <p className="text-sm text-texto-suave">Nenhum custo apropriado a este animal.</p>
          ) : (
            <Tabela data-testid="linhas-origem-animal">
              <Cabeca>
                <Th>Data</Th>
                <Th>Categoria</Th>
                <Th>Origem</Th>
                <Th className="text-right">Valor</Th>
                <Th>Como chegou ao animal</Th>
              </Cabeca>
              <tbody>
                {e.linhas.map((l, k) => (
                  <Linha key={`${k}-${l.data}-${l.descricao}`}>
                    <Td className="whitespace-nowrap">{formatarData(l.data)}</Td>
                    <Td>{categoriasCusto[l.categoria]}</Td>
                    <Td>
                      <LinkDeOrigem origem={l.origem} texto={l.descricao || '—'} />
                      {l.origem && (
                        <div className="text-xs text-texto-suave">
                          {origensCusto[l.origem.tipo]}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {l.valorCentavos === null ? valorDesconhecido : moeda(l.valorCentavos)}
                    </Td>
                    <Td className="text-xs text-texto-suave">{l.explicacao}</Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
      )}
    </Modal>
  );
}

function ModalOrigemLote({
  loteId,
  periodo,
  aoFechar,
}: {
  loteId: string;
  periodo: Periodo | null;
  aoFechar: () => void;
}) {
  const consulta = useExplicacaoLote({
    loteId,
    ...(periodo ? { dataInicial: periodo.inicio, dataFinal: periodo.fim } : {}),
  });
  const e = consulta.data;
  return (
    <Modal
      aberto
      largura="xl"
      titulo={e ? `Composição do custo do ${e.loteNome}` : 'Composição do custo do lote'}
      descricao="Custos lançados direto ao lote ou recebidos por rateio. Cada um é dividido por igual, dia a dia, entre os animais presentes."
      aoFechar={aoFechar}
    >
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      {!e && !consulta.isError && <p className="text-sm text-texto-suave">Carregando…</p>}
      {e && (
        <div className="flex flex-col gap-4" data-testid="origem-custo-lote">
          <GradeIndicadores>
            <Indicador
              rotulo="Custo do lote"
              valor={<ValorApurado a={e.apuracao} />}
              dica={estadosApuracao[e.apuracao.estado]}
              destaque={e.apuracao.estado === 'completa' ? undefined : 'alerta'}
            />
          </GradeIndicadores>
          {e.linhas.length === 0 ? (
            <p className="text-sm text-texto-suave">Nenhum custo neste lote no período.</p>
          ) : (
            <Tabela>
              <Cabeca>
                <Th>Data</Th>
                <Th>Categoria</Th>
                <Th>Custo</Th>
                <Th>Via</Th>
                <Th className="text-right">Valor</Th>
              </Cabeca>
              <tbody>
                {e.linhas.map((l, k) => (
                  <Linha key={`${k}-${l.data}-${l.descricao}`}>
                    <Td className="whitespace-nowrap">{formatarData(l.data)}</Td>
                    <Td>{categoriasCusto[l.categoria]}</Td>
                    <Td>
                      <LinkDeOrigem origem={l.origem} texto={l.descricao} />
                    </Td>
                    <Td>{l.via === 'rateio' ? 'Rateio' : 'Lançado ao lote'}</Td>
                    <Td className="text-right whitespace-nowrap">
                      {l.valorCentavos === null ? valorDesconhecido : moeda(l.valorCentavos)}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
      )}
    </Modal>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [parametros, setParametros] = useSearchParams();
  const [periodoLivre, setPeriodoLivre] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());
  const [loteId, setLoteId] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [loteAberto, setLoteAberto] = useState<string | null>(null);
  const animalAberto = parametros.get('animal');
  const datas = periodoLivre ? { dataInicial: periodo.inicio, dataFinal: periodo.fim } : {};
  const resumo = useResumoCustos({ propriedadeId: propriedade.id, ...datas });
  const lotes = useLotes(propriedade.id, true);
  const animais = useCustosAnimais({
    propriedadeId: propriedade.id,
    ...datas,
    ...(loteId ? { loteId } : {}),
    ...(busca.trim() ? { busca: busca.trim() } : {}),
    pagina,
    tamanhoPagina: TAMANHO,
  });
  const r = resumo.data;
  const abrirAnimal = (id: string | null) => {
    const novo = new URLSearchParams(parametros);
    if (id) novo.set('animal', id);
    else novo.delete('animal');
    setParametros(novo, { replace: true });
  };
  const naoAlocadoConhecido = r?.naoAlocado.apuracao.valorConhecidoCentavos ?? 0;
  const semAnimais = (r?.lotes ?? []).reduce((s, l) => s + l.semAnimaisCentavos, 0);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Custos por lote e animal"
        descricao="Quanto cada lote e cada animal já custou, de onde veio cada valor e o que ainda não foi alocado."
        acoes={
          <Link
            className="inline-flex h-9 items-center rounded-md border border-borda px-4 text-sm hover:bg-superficie-2"
            to="/financeiro/rateio"
          >
            Ratear custos da propriedade
          </Link>
        }
      />
      <Alerta tom="info">{textoCustos}</Alerta>
      <p className="text-xs text-texto-suave">{avisoGeral}</p>
      <div className="flex flex-wrap items-end gap-4">
        <CaixaMarcar
          rotulo="Limitar a um período"
          marcado={periodoLivre}
          aoMudar={(v) => {
            setPeriodoLivre(v);
            setPagina(1);
          }}
        />
        {periodoLivre && (
          <SeletorPeriodo
            periodo={periodo}
            aoMudar={(p) => {
              setPeriodo(p);
              setPagina(1);
            }}
          />
        )}
      </div>
      {(resumo.isError || animais.isError) && (
        <Alerta tom="perigo" titulo={mensagemDeErro(resumo.error ?? animais.error)} />
      )}
      {r && (
        <>
          <GradeIndicadores testId="resumo-custos">
            <Indicador
              rotulo="Chegou aos animais"
              valor={<ValorApurado a={r.animais.apuracao} />}
              dica={`${r.animais.quantidade} animal(is) com custo${r.animais.apuracao.estado === 'completa' ? '' : ' · há custo sem valor ou sem aquisição/formação informada'}`}
              destaque={r.animais.apuracao.estado === 'completa' ? undefined : 'alerta'}
            />
            <Indicador
              rotulo="Não alocado (propriedade)"
              valor={<ValorApurado a={r.naoAlocado.apuracao} />}
              dica="Custo compartilhado sem rateio"
              destaque={naoAlocadoConhecido > 0 ? 'alerta' : undefined}
            />
            <Indicador
              rotulo="Em lote sem animais"
              valor={moeda(semAnimais)}
              dica="Custo de lote em dias sem animal presente"
            />
            <Indicador
              rotulo="Em centros de produção abertos"
              valor={<ValorApurado a={r.emProducao} />}
              dica="Vira custo de estoque ao encerrar o centro; chega aos animais pelo consumo"
            />
            <Indicador
              rotulo="Soma dos custos de origem"
              valor={moeda(r.totalDeOrigemCentavos)}
              dica={
                r.desconhecidosDeOrigem > 0
                  ? `${r.desconhecidosDeOrigem} custo(s) desconhecido(s) fora da soma`
                  : 'Todos os custos têm valor conhecido'
              }
              destaque={r.desconhecidosDeOrigem > 0 ? 'alerta' : undefined}
            />
          </GradeIndicadores>
          <p className="text-sm" data-testid="conferencia-custos">
            {r.conferido ? (
              <Selo tom="sucesso">
                Conferido: animais + lotes sem animais + não alocado = soma de origem
              </Selo>
            ) : (
              <Selo tom="perigo">Não fecha: avise o suporte e não use estes números</Selo>
            )}
          </p>
          {r.avisos.length > 0 && (
            <Alerta
              tom="alerta"
              titulo="Animais fora da divisão por lote: o histórico de lotes não permite saber onde estavam"
            >
              <ul className="list-disc pl-5">
                {r.avisos.slice(0, 5).map((a) => (
                  <li key={a}>{a}</li>
                ))}
                {r.avisos.length > 5 && <li>e mais {r.avisos.length - 5}</li>}
              </ul>
            </Alerta>
          )}
          <section className="flex min-w-0 flex-col gap-2">
            <h3 className="text-base font-semibold">Por lote</h3>
            {r.lotes.length === 0 ? (
              <p className="text-sm text-texto-suave">Nenhum custo lançado a lotes ainda.</p>
            ) : (
              <Tabela data-testid="tabela-custo-lotes">
                <Cabeca>
                  <Th>Lote</Th>
                  <Th className="text-right">Direto</Th>
                  <Th className="text-right">Por rateio</Th>
                  <Th className="text-right">Total do lote</Th>
                  <Th>Situação</Th>
                  <Th>
                    <span className="sr-only">Ações</span>
                  </Th>
                </Cabeca>
                <tbody>
                  {r.lotes.map((l) => (
                    <Linha key={l.loteId}>
                      <Td>{l.loteNome}</Td>
                      <Td className="text-right whitespace-nowrap">{moeda(l.diretoCentavos)}</Td>
                      <Td className="text-right whitespace-nowrap">{moeda(l.rateadoCentavos)}</Td>
                      <Td className="text-right whitespace-nowrap">
                        <ValorApurado a={l.apuracao} />
                      </Td>
                      <Td>
                        <Selo tom={tomDoEstado(l.apuracao.estado)}>
                          {estadosApuracao[l.apuracao.estado]}
                        </Selo>
                      </Td>
                      <Td className="text-right">
                        <Botao
                          tamanho="pequeno"
                          variante="secundario"
                          aria-label={`Composição do custo do ${l.loteNome}`}
                          onClick={() => setLoteAberto(l.loteId)}
                        >
                          Composição
                        </Botao>
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
          </section>
        </>
      )}
      <section className="flex min-w-0 flex-col gap-3">
        <h3 className="text-base font-semibold">Por animal</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Lote atual">
            {(p) => (
              <Selecao
                {...p}
                value={loteId}
                onChange={(e) => {
                  setLoteId(e.target.value);
                  setPagina(1);
                }}
              >
                <option value="">Todos</option>
                {(lotes.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Buscar animal">
            {(p) => (
              <Entrada
                {...p}
                value={busca}
                maxLength={80}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(1);
                }}
              />
            )}
          </Campo>
        </div>
        {animais.data && animais.data.itens.length === 0 ? (
          <EstadoVazio
            icone={Calculator}
            titulo="Nenhum animal encontrado"
            descricao="Cadastre animais no módulo Rebanho para acompanhar o custo de cada um."
          />
        ) : (
          <Tabela data-testid="tabela-custo-animais">
            <Cabeca>
              <Th>Animal</Th>
              <Th>Lote atual</Th>
              <Th>Situação</Th>
              <Th className="text-right">Custo apropriado</Th>
              <Th>Apuração</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabeca>
            <tbody>
              {(animais.data?.itens ?? []).map((a) => (
                <Linha key={a.animalId}>
                  <Td>
                    <Link
                      className="text-marca hover:underline"
                      to={`/rebanho/animais/${a.animalId}`}
                    >
                      {a.identificacao}
                    </Link>
                  </Td>
                  <Td>{a.loteNome ?? 'Sem lote'}</Td>
                  <Td>{a.status}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <ValorApurado a={a.apuracao} />
                  </Td>
                  <Td>
                    <Selo tom={tomDoEstado(a.apuracao.estado)}>
                      {estadosApuracao[a.apuracao.estado]}
                    </Selo>
                  </Td>
                  <Td className="text-right">
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      aria-label={`De onde veio o custo de ${a.identificacao}`}
                      onClick={() => abrirAnimal(a.animalId)}
                    >
                      De onde veio?
                    </Botao>
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
        {animais.data && (
          <Paginacao
            pagina={pagina}
            tamanhoPagina={TAMANHO}
            total={animais.data.total}
            aoMudar={setPagina}
          />
        )}
      </section>
      {animalAberto && (
        <ModalOrigemAnimal
          animalId={animalAberto}
          periodo={periodoLivre ? periodo : null}
          aoFechar={() => abrirAnimal(null)}
        />
      )}
      {loteAberto && (
        <ModalOrigemLote
          loteId={loteAberto}
          periodo={periodoLivre ? periodo : null}
          aoFechar={() => setLoteAberto(null)}
        />
      )}
    </div>
  );
}

export function PaginaCustos() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
