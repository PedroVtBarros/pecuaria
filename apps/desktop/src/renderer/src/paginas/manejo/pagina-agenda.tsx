import { useState } from 'react';
import { Link } from 'react-router';
import {
  CalendarClock,
  CalendarX,
  CircleCheck,
  Pencil,
  Plus,
  Scale,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ItemAgenda, Propriedade } from '@pecuaria/shared-types';
import type { SituacaoAgenda } from '@pecuaria/domain';
import { useAcaoRebanho, useAgenda, useResumoSanidade } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarData } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar } from '../../components/ui/campos';
import { Cartao, CartaoConteudo } from '../../components/ui/cartao';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, LinhaVazia, Tabela, Td, Th } from '../../components/ui/tabela';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { AvisoCarencia, ModalAgenda, ModalMotivo } from './modais-sanidade';

const TOM_SITUACAO = {
  atrasado: 'perigo',
  hoje: 'alerta',
  proximo: 'alerta',
  futuro: 'neutro',
} as const satisfies Record<SituacaoAgenda, string>;

export function SeloSituacao({ situacao }: { situacao: SituacaoAgenda }) {
  return <Selo tom={TOM_SITUACAO[situacao]}>{rotulos.situacaoAgenda[situacao]}</Selo>;
}

function CartaoContador({
  icone: Icone,
  titulo,
  valor,
  para,
  destaque,
  testId,
}: {
  icone: LucideIcon;
  titulo: string;
  valor: number;
  para?: string;
  destaque: boolean;
  testId: string;
}) {
  const conteudo = (
    <Cartao className={destaque ? 'border-alerta/50' : ''}>
      <CartaoConteudo className="flex items-center gap-4">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${destaque ? 'bg-alerta-suave text-alerta' : 'bg-marca-suave text-marca'}`}
        >
          <Icone className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm text-texto-suave">{titulo}</p>
          <p className="text-2xl font-semibold" data-testid={testId}>
            {valor}
          </p>
        </div>
      </CartaoConteudo>
    </Cartao>
  );
  return para ? <Link to={para}>{conteudo}</Link> : conteudo;
}

/** Contadores de pendências, usados também no painel. */
export function ResumoPendencias({ propriedadeId }: { propriedadeId: string }) {
  const resumo = useResumoSanidade(propriedadeId);
  if (resumo.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(resumo.error)} />;
  const r = resumo.data;
  if (!r) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <CartaoContador
        icone={CalendarX}
        titulo="Eventos atrasados"
        valor={r.agendaAtrasada}
        para="/manejo/agenda"
        destaque={r.agendaAtrasada > 0}
        testId="resumo-atrasados"
      />
      <CartaoContador
        icone={CalendarClock}
        titulo={`Hoje e próximos ${r.antecedenciaDias} dias`}
        valor={r.agendaProxima}
        para="/manejo/agenda"
        destaque={r.agendaProxima > 0}
        testId="resumo-proximos"
      />
      <CartaoContador
        icone={ShieldAlert}
        titulo="Em carência informada"
        valor={r.emCarencia.length}
        para="/manejo/agenda#carencias"
        destaque={r.emCarencia.length > 0}
        testId="resumo-carencia"
      />
      <CartaoContador
        icone={Scale}
        titulo="Alertas de pesagem"
        valor={r.alertasPesagemPendentes}
        para="/manejo/alertas"
        destaque={r.alertasPesagemPendentes > 0}
        testId="resumo-alertas-pesagem"
      />
    </div>
  );
}

function ParaQuem({ item }: { item: ItemAgenda }) {
  if (item.animal)
    return (
      <Link to={`/rebanho/animais/${item.animal.id}`} className="text-marca hover:underline">
        {item.animal.identificacao}
      </Link>
    );
  if (item.lote)
    return (
      <Link to={`/rebanho/lotes/${item.lote.id}`} className="text-marca hover:underline">
        Lote: {item.lote.nome}
      </Link>
    );
  return <span className="text-texto-suave">Rebanho</span>;
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [concluidos, setConcluidos] = useState(false);
  const agenda = useAgenda(propriedade.id, concluidos);
  const resumo = useResumoSanidade(propriedade.id);
  const cancelar = useAcaoRebanho('agendaSanitaria:cancelar');
  const { notificar } = useNotificacoes();
  const [modal, setModal] = useState<
    { tipo: 'novo' } | { tipo: 'editar' | 'cancelar'; item: ItemAgenda } | null
  >(null);
  const itens = agenda.data ?? [];
  const carencias = resumo.data?.emCarencia ?? [];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Agenda e alertas"
        descricao="Próximos eventos sanitários definidos por você, carências em curso pelo prazo informado e alertas de pesagem."
        acoes={
          <Botao onClick={() => setModal({ tipo: 'novo' })}>
            <Plus className="size-4" aria-hidden />
            Novo agendamento
          </Botao>
        }
      />
      <ResumoPendencias propriedadeId={propriedade.id} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Agenda sanitária</h3>
          <CaixaMarcar
            rotulo="Mostrar realizados e cancelados"
            marcado={concluidos}
            aoMudar={setConcluidos}
          />
        </div>
        {agenda.isError && <Alerta tom="perigo" titulo={mensagemDeErro(agenda.error)} />}
        {itens.length === 0 && !agenda.isLoading ? (
          <EstadoVazio
            icone={CalendarClock}
            titulo="Nenhum evento agendado"
            descricao="Agende uma vacinação, um reforço ou um exame. Ao registrar uma aplicação, você também pode informar a data da próxima."
          />
        ) : (
          <Tabela data-testid="tabela-agenda">
            <Cabeca>
              <Th>Data prevista</Th>
              <Th>Situação</Th>
              <Th>Tipo</Th>
              <Th>Produto ou descrição</Th>
              <Th>Para</Th>
              <Th className="text-right">Ações</Th>
            </Cabeca>
            <tbody>
              {itens.map((a) => (
                <Linha key={a.id} data-agenda={a.descricao ?? a.produto?.nome}>
                  <Td className="whitespace-nowrap">{formatarData(a.dataPrevista)}</Td>
                  <Td>
                    {a.situacao ? (
                      <SeloSituacao situacao={a.situacao} />
                    ) : (
                      <Selo tom={a.status === 'realizado' ? 'sucesso' : 'neutro'}>
                        {rotulos.statusAgenda[a.status]}
                      </Selo>
                    )}
                  </Td>
                  <Td>{rotulos.tipoManejo[a.tipo]}</Td>
                  <Td>
                    {a.produto?.nome ?? a.descricao}
                    {a.produto && a.descricao && (
                      <span className="block text-xs text-texto-suave">{a.descricao}</span>
                    )}
                    {a.motivoCancelamento && (
                      <span className="block text-xs text-texto-suave">
                        Cancelado: {a.motivoCancelamento}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <ParaQuem item={a} />
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {a.status === 'pendente' ? (
                        <>
                          <Link to={`/manejo/sanidade/novo?agenda=${a.id}`}>
                            <Botao tamanho="pequeno" variante="secundario">
                              <CircleCheck className="size-3.5" aria-hidden />
                              Registrar aplicação
                            </Botao>
                          </Link>
                          <Botao
                            tamanho="pequeno"
                            variante="fantasma"
                            aria-label="Editar agendamento"
                            onClick={() => setModal({ tipo: 'editar', item: a })}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Botao>
                          <Botao
                            tamanho="pequeno"
                            variante="fantasma"
                            aria-label="Cancelar agendamento"
                            onClick={() => setModal({ tipo: 'cancelar', item: a })}
                          >
                            <X className="size-3.5" aria-hidden />
                          </Botao>
                        </>
                      ) : a.manejoRealizadoId ? (
                        <Link
                          to={`/manejo/sanidade/${a.manejoRealizadoId}`}
                          className="text-sm text-marca hover:underline"
                        >
                          Ver registro
                        </Link>
                      ) : null}
                    </div>
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>

      <section className="flex flex-col gap-3" id="carencias">
        <h3 className="font-semibold">Animais dentro do prazo de carência informado</h3>
        <AvisoCarencia />
        <Tabela data-testid="tabela-carencias">
          <Cabeca>
            <Th>Animal</Th>
            <Th>Lote</Th>
            <Th>Carência carne: fim do prazo calculado</Th>
            <Th>Carência leite: fim do prazo calculado</Th>
          </Cabeca>
          <tbody>
            {carencias.length === 0 && (
              <LinhaVazia colunas={4}>Nenhum animal ativo em carência.</LinhaVazia>
            )}
            {carencias.map((c) => (
              <Linha key={c.animalId}>
                <Td>
                  <Link
                    to={`/rebanho/animais/${c.animalId}`}
                    className="text-marca hover:underline"
                  >
                    {c.identificacao}
                  </Link>
                  {c.nome && <span className="text-texto-suave"> · {c.nome}</span>}
                </Td>
                <Td>{c.lote?.nome ?? '—'}</Td>
                <Td>{c.carne ? `${formatarData(c.carne.fimPrazo)} (${c.carne.produto})` : '—'}</Td>
                <Td>{c.leite ? `${formatarData(c.leite.fimPrazo)} (${c.leite.produto})` : '—'}</Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      </section>

      {(modal?.tipo === 'novo' || modal?.tipo === 'editar') && (
        <ModalAgenda
          propriedadeId={propriedade.id}
          item={modal.tipo === 'editar' ? modal.item : null}
          aoFechar={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'cancelar' && (
        <ModalMotivo
          titulo="Cancelar agendamento?"
          descricao={`${rotulos.tipoManejo[modal.item.tipo]} previsto para ${formatarData(modal.item.dataPrevista)}. O cancelamento fica registrado.`}
          rotuloMotivo="Motivo do cancelamento"
          textoEnviar="Cancelar agendamento"
          enviando={cancelar.isPending}
          aoFechar={() => setModal(null)}
          aoConfirmar={(motivo, mostrarErro) =>
            cancelar.mutate(
              { id: modal.item.id, motivo },
              {
                onSuccess: () => {
                  notificar('Agendamento cancelado.', 'sucesso');
                  setModal(null);
                },
                onError: mostrarErro,
              },
            )
          }
        />
      )}
    </div>
  );
}

export function PaginaAgenda() {
  return <ComPropriedade>{(p) => <Conteudo propriedade={p} />}</ComPropriedade>;
}
