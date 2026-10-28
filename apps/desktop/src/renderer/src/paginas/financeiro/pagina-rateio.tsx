import { useState } from 'react';
import { Link } from 'react-router';
import { Split } from 'lucide-react';
import type { PendentesDeRateio, Propriedade, RateioDetalhe } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { AreaTexto, Campo, CaixaMarcar } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { usePendentesRateio, useRateio, useRateios } from '../../lib/consultas-rateio';
import { formatarData } from '../../lib/formatar-rebanho';
import { moeda } from '../../textos-financeiro';
import {
  criteriosCurtos,
  criteriosRateio,
  textoRateio,
  valorDesconhecido,
} from '../../textos-rateio';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';
import { ModalRateio, type AlvoDoRateio } from './modal-rateio';
import { ValorApurado } from './valor-apurado';

const valorOuDesconhecido = (c: number | null) => (c === null ? valorDesconhecido : moeda(c));

function SeloDoRateio({
  r,
}: {
  r: { cancelado: boolean; origemCancelada: boolean; baseMudou?: boolean | null };
}) {
  if (r.cancelado) return <Selo tom="neutro">Cancelado</Selo>;
  if (r.origemCancelada) return <Selo tom="alerta">Custo cancelado: sem efeito</Selo>;
  if (r.baseMudou) return <Selo tom="alerta">Base mudou desde a criação</Selo>;
  return <Selo tom="sucesso">Ativo</Selo>;
}

function ModalCancelar({
  rateio,
  aoFechar,
}: {
  rateio: RateioDetalhe;
  aoFechar: (cancelou: boolean) => void;
}) {
  const cancelar = useAcaoFinanceiro('rateio:cancelar');
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      perigoso
      titulo="Cancelar rateio"
      descricao="O custo volta a ficar sem destino (não alocado) até um novo rateio. O rateio cancelado continua no histórico."
      aoFechar={() => aoFechar(false)}
      textoEnviar="Cancelar rateio"
      enviando={cancelar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (!motivo.trim()) return setErros(['Informe o motivo do cancelamento.']);
        cancelar.mutate(
          { id: rateio.id, motivo: motivo.trim() },
          { onSuccess: () => aoFechar(true), onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <Campo rotulo="Motivo" obrigatorio>
        {(p) => (
          <AreaTexto
            {...p}
            rows={2}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

function ModalDetalhe({
  id,
  propriedadeId,
  aoFechar,
}: {
  id: string;
  propriedadeId: string;
  aoFechar: () => void;
}) {
  const consulta = useRateio(id);
  const [acao, setAcao] = useState<'revisar' | 'cancelar' | null>(null);
  const r = consulta.data;
  return (
    <>
      <Modal
        aberto={acao === null}
        largura="xl"
        titulo="Rateio de custo"
        descricao={r ? r.origem.descricao : undefined}
        aoFechar={aoFechar}
      >
        {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
        {!r && !consulta.isError && <p className="text-sm text-texto-suave">Carregando…</p>}
        {r && (
          <div className="flex flex-col gap-4" data-testid="detalhe-rateio">
            <div className="flex flex-wrap items-center gap-2">
              <SeloDoRateio r={r} />
              <Selo tom="neutro">{criteriosCurtos[r.criterio]}</Selo>
            </div>
            <ListaDados
              itens={[
                { rotulo: 'Custo (data)', valor: formatarData(r.origem.data) },
                {
                  rotulo: 'Valor atual do custo',
                  valor: valorOuDesconhecido(r.origem.valorCentavos),
                },
                { rotulo: 'Critério', valor: criteriosRateio[r.criterio] },
                { rotulo: 'Data-base', valor: formatarData(r.dataBase) },
                ...(r.periodoInicio && r.periodoFim
                  ? [
                      {
                        rotulo: 'Período',
                        valor: `${formatarData(r.periodoInicio)} a ${formatarData(r.periodoFim)}`,
                      },
                    ]
                  : []),
                ...(r.idadeMaximaPesagemDias !== null
                  ? [
                      {
                        rotulo: 'Idade máxima da pesagem',
                        valor: `${r.idadeMaximaPesagemDias} dia(s)`,
                      },
                    ]
                  : []),
                { rotulo: 'Motivo', valor: r.motivo },
                ...(r.motivoCancelamento
                  ? [{ rotulo: 'Motivo do cancelamento', valor: r.motivoCancelamento }]
                  : []),
              ]}
            />
            {r.origemCancelada && !r.cancelado && (
              <Alerta tom="alerta">
                O custo de origem foi cancelado ou deixou de ser um custo da propriedade. Este
                rateio não distribui nada enquanto isso. Cancele-o para encerrar.
              </Alerta>
            )}
            {r.baseMudou && (
              <Alerta tom="alerta">
                A composição dos lotes (ou as pesagens) mudou desde a criação: se quiser, revise o
                rateio para recalcular os pesos com os dados de hoje. Enquanto isso, valem os pesos
                gravados.
              </Alerta>
            )}
            <Tabela data-testid="destinos-rateio">
              <Cabeca>
                <Th>Destino</Th>
                <Th>Base gravada</Th>
                <Th className="text-right">Peso</Th>
                <Th className="text-right">Valor</Th>
              </Cabeca>
              <tbody>
                {r.destinos.map((d) => (
                  <Linha key={`${d.tipo}:${d.id}`}>
                    <Td>
                      {d.rotulo} <span className="text-xs text-texto-suave">({d.tipo})</span>
                    </Td>
                    <Td>{d.base}</Td>
                    <Td className="text-right whitespace-nowrap">
                      {d.peso.toLocaleString('pt-BR')}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {valorOuDesconhecido(d.valorCentavos)}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
            <p className="text-xs text-texto-suave">
              Soma das partes: {valorOuDesconhecido(r.somaCentavos)}. Os valores são recalculados a
              partir do valor atual do custo.
            </p>
            {r.versoes.length > 1 && (
              <section>
                <h3 className="mb-1 text-sm font-medium">Versões</h3>
                <ol className="list-decimal pl-5 text-sm">
                  {r.versoes.map((v) => (
                    <li key={v.id}>
                      {criteriosCurtos[v.criterio]} · criada em{' '}
                      {formatarData(v.criadoEm.slice(0, 10))} ·{' '}
                      {v.cancelado ? 'cancelada' : 'vigente'} · {v.motivo}
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {!r.cancelado && (
              <div className="flex gap-2">
                <Botao variante="secundario" onClick={() => setAcao('revisar')}>
                  Revisar
                </Botao>
                <Botao variante="perigo" onClick={() => setAcao('cancelar')}>
                  Cancelar rateio
                </Botao>
              </div>
            )}
          </div>
        )}
      </Modal>
      {r && acao === 'revisar' && (
        <ModalRateio
          propriedadeId={propriedadeId}
          alvo={{ tipo: 'revisar', rateio: r }}
          aoFechar={(novo) => {
            setAcao(null);
            if (novo) aoFechar();
          }}
        />
      )}
      {r && acao === 'cancelar' && (
        <ModalCancelar
          rateio={r}
          aoFechar={(cancelou) => {
            setAcao(null);
            if (cancelou) aoFechar();
          }}
        />
      )}
    </>
  );
}

function Pendentes({
  dados,
  aoRatear,
}: {
  dados: PendentesDeRateio;
  aoRatear: (alvo: AlvoDoRateio) => void;
}) {
  if (dados.itens.length === 0)
    return (
      <EstadoVazio
        icone={Split}
        titulo="Nenhum custo compartilhado sem rateio"
        descricao="Despesas sem lote nem animal e consumos de estoque da propriedade aparecem aqui até serem rateados."
      />
    );
  return (
    <>
      <GradeIndicadores testId="resumo-pendentes">
        <Indicador
          rotulo="Custo sem rateio (não alocado)"
          valor={<ValorApurado a={dados.total} />}
          dica={`${dados.total.componentesConhecidos} com valor, ${dados.total.componentesDesconhecidos} com custo desconhecido`}
          destaque={dados.total.estado === 'completa' ? undefined : 'alerta'}
        />
      </GradeIndicadores>
      <Tabela data-testid="tabela-pendentes-rateio">
        <Cabeca>
          <Th>Data</Th>
          <Th>Custo</Th>
          <Th>Origem</Th>
          <Th className="text-right">Valor</Th>
          <Th>
            <span className="sr-only">Ações</span>
          </Th>
        </Cabeca>
        <tbody>
          {dados.itens.map((c) => (
            <Linha key={`${c.origemTipo}:${c.origemId}`}>
              <Td className="whitespace-nowrap">{formatarData(c.data)}</Td>
              <Td>{c.descricao}</Td>
              <Td>{c.origemTipo === 'lancamento' ? 'Despesa' : 'Consumo de estoque'}</Td>
              <Td className="text-right whitespace-nowrap">
                {valorOuDesconhecido(c.valorCentavos)}
              </Td>
              <Td className="text-right">
                <Botao
                  tamanho="pequeno"
                  variante="secundario"
                  aria-label={`Ratear ${c.descricao}`}
                  onClick={() =>
                    aoRatear({
                      tipo: 'criar',
                      origemTipo: c.origemTipo,
                      origemId: c.origemId,
                      descricao: c.descricao,
                      valorCentavos: c.valorCentavos,
                    })
                  }
                >
                  Ratear
                </Botao>
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
      {dados.truncado && (
        <p className="text-xs text-texto-suave">
          Mostrando os {dados.itens.length} mais recentes de mais custos; o total acima considera
          todos.
        </p>
      )}
    </>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const pendentes = usePendentesRateio(propriedade.id);
  const [cancelados, setCancelados] = useState(false);
  const rateios = useRateios(propriedade.id, cancelados);
  const [alvo, setAlvo] = useState<AlvoDoRateio | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Rateio de custos"
        descricao="Distribui custos compartilhados da propriedade entre lotes e animais, com critério explícito e histórico."
      />
      <Alerta tom="info">{textoRateio}</Alerta>
      {(pendentes.isError || rateios.isError) && (
        <Alerta tom="perigo" titulo={mensagemDeErro(pendentes.error ?? rateios.error)} />
      )}
      <section className="flex min-w-0 flex-col gap-3">
        <h3 className="text-base font-semibold">Custos compartilhados sem rateio</h3>
        {pendentes.data ? (
          <Pendentes dados={pendentes.data} aoRatear={setAlvo} />
        ) : (
          <p className="text-sm text-texto-suave">Carregando…</p>
        )}
      </section>
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Rateios</h3>
          <CaixaMarcar rotulo="Mostrar cancelados" marcado={cancelados} aoMudar={setCancelados} />
        </div>
        {rateios.data && rateios.data.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum rateio criado.</p>
        ) : (
          <Tabela data-testid="tabela-rateios">
            <Cabeca>
              <Th>Custo</Th>
              <Th>Data</Th>
              <Th>Critério</Th>
              <Th className="text-right">Valor</Th>
              <Th className="text-right">Destinos</Th>
              <Th>Situação</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabeca>
            <tbody>
              {(rateios.data ?? []).map((r) => (
                <Linha key={r.id}>
                  <Td>{r.descricao}</Td>
                  <Td className="whitespace-nowrap">{formatarData(r.data)}</Td>
                  <Td>{criteriosCurtos[r.criterio]}</Td>
                  <Td className="text-right whitespace-nowrap">
                    {valorOuDesconhecido(r.valorCentavos)}
                  </Td>
                  <Td className="text-right">{r.destinos}</Td>
                  <Td>
                    <SeloDoRateio r={r} />
                  </Td>
                  <Td className="text-right">
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      aria-label={`Detalhes do rateio de ${r.descricao}`}
                      onClick={() => setDetalhe(r.id)}
                    >
                      Detalhes
                    </Botao>
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
      <p className="text-sm text-texto-suave">
        O resultado do rateio aparece em{' '}
        <Link className="text-marca hover:underline" to="/financeiro/custos">
          Custos por lote e animal
        </Link>
        .
      </p>
      {alvo && (
        <ModalRateio propriedadeId={propriedade.id} alvo={alvo} aoFechar={() => setAlvo(null)} />
      )}
      {detalhe && (
        <ModalDetalhe
          id={detalhe}
          propriedadeId={propriedade.id}
          aoFechar={() => setDetalhe(null)}
        />
      )}
    </div>
  );
}

export function PaginaRateio() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
