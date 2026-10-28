import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ArrowRightLeft,
  CircleCheck,
  Info,
  LogOut,
  Pencil,
  Plus,
  Scale,
  Syringe,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import type { AnimalDetalhe, EventoHistoricoAnimal, Pesagem } from '@pecuaria/shared-types';
import {
  alertaConferido,
  CATEGORIAS_ALERTA_PESAGEM,
  type AlertaPesagem,
  type IntervaloGmd,
} from '@pecuaria/domain';
import {
  useAcaoRebanho,
  useAnimal,
  useHistoricoAnimal,
  usePesagens,
} from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import {
  descreverAlerta,
  tomDoAlerta,
  formatarData,
  formatarDose,
  formatarEcc,
  formatarGanho,
  formatarGmd,
  formatarIdade,
  formatarMoeda,
  formatarPeso,
} from '../../lib/formatar-rebanho';
import { nomesDeCampo, rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo, CartaoTitulo } from '../../components/ui/cartao';
import { Abas, CabecalhoPagina, EstadoVazio, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { SanidadeDoAnimal } from '../manejo/sanidade-do-animal';
import { GraficoGmdIntervalos, GraficoPesoAnimal } from './graficos-pesagem';
import { ModalExclusao, ModalSaida, ModalTransferencia } from './modais';
import { CustoDoAnimalAba, ModalDesfazerSaida } from '../financeiro/custo-do-animal';
import { ModalConferirPesagem, ModalPesagem } from './modal-pesagem';

type Aba = 'resumo' | 'pesagens' | 'sanidade' | 'custo' | 'historico';

function Genitor({ referencia }: { referencia: AnimalDetalhe['mae'] }) {
  if (!referencia) return <>—</>;
  const texto = referencia.nome
    ? `${referencia.identificacao} · ${referencia.nome}`
    : referencia.identificacao;
  if (referencia.excluido)
    return <span className="text-texto-suave">{texto} (cadastro excluído)</span>;
  return (
    <Link to={`/rebanho/animais/${referencia.id}`} className="text-marca hover:underline">
      {texto}
    </Link>
  );
}

function Resumo({ animal }: { animal: AnimalDetalhe }) {
  return (
    <Cartao>
      <CartaoConteudo>
        <ListaDados
          itens={[
            { rotulo: 'Sexo', valor: rotulos.sexo[animal.sexo] },
            { rotulo: 'Condição sexual', valor: rotulos.condicaoSexual[animal.condicaoSexual] },
            { rotulo: 'Categoria', valor: rotulos.categoria[animal.categoria] },
            { rotulo: 'Aptidão', valor: rotulos.aptidaoAnimal[animal.aptidao] },
            { rotulo: 'Raça', valor: animal.raca?.nome },
            {
              rotulo: 'Nascimento',
              valor: animal.dataNascimento
                ? `${formatarData(animal.dataNascimento)}${animal.dataNascimentoEstimada ? ' (estimada)' : ''}`
                : null,
            },
            { rotulo: 'Idade', valor: formatarIdade(animal.dataNascimento) },
            { rotulo: 'Origem', valor: rotulos.origem[animal.origem] },
            { rotulo: 'Entrada no rebanho', valor: formatarData(animal.dataEntrada) },
            {
              rotulo: 'Lote atual',
              valor: animal.lote ? (
                <Link
                  className="text-marca hover:underline"
                  to={`/rebanho/lotes/${animal.lote.id}`}
                >
                  {animal.lote.nome}
                </Link>
              ) : (
                'Sem lote'
              ),
            },
            { rotulo: 'Mãe', valor: <Genitor referencia={animal.mae} /> },
            { rotulo: 'Pai', valor: <Genitor referencia={animal.pai} /> },
            ...(animal.status !== 'ativo'
              ? [
                  {
                    rotulo: 'Saída',
                    valor: `${rotulos.status[animal.status]} em ${formatarData(animal.dataSaida)}`,
                  },
                  { rotulo: 'Motivo da saída', valor: animal.motivoSaida },
                ]
              : []),
            { rotulo: 'Observações', valor: animal.observacoes },
          ]}
        />
      </CartaoConteudo>
    </Cartao>
  );
}

function CartaoGmd({ titulo, intervalo }: { titulo: string; intervalo: IntervaloGmd }) {
  return (
    <Cartao>
      <CartaoConteudo className="flex flex-col gap-1">
        <p className="text-xs text-texto-suave">{titulo}</p>
        <p className="text-2xl font-semibold" data-testid="gmd-valor">
          {formatarGmd(intervalo.gmdKgDia)}
        </p>
        <p className="text-sm text-texto-suave">
          {formatarGanho(intervalo.ganhoKg)} em {intervalo.dias}{' '}
          {intervalo.dias === 1 ? 'dia' : 'dias'} · {formatarData(intervalo.dataInicial)} a{' '}
          {formatarData(intervalo.dataFinal)}
        </p>
        {intervalo.estimado && (
          <Selo tom="alerta" className="w-fit">
            Inclui peso estimado (fita ou visual)
          </Selo>
        )}
      </CartaoConteudo>
    </Cartao>
  );
}

function Pesagens({ animal }: { animal: AnimalDetalhe }) {
  const pesagens = usePesagens(animal.id);
  const excluir = useAcaoRebanho('pesagem:excluir');
  const { notificar } = useNotificacoes();
  const [modal, setModal] = useState<
    | { tipo: 'nova' }
    | { tipo: 'editar' | 'excluir'; pesagem: Pesagem }
    | { tipo: 'conferir'; pesagem: Pesagem; alertas: AlertaPesagem[] }
    | null
  >(null);

  if (pesagens.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(pesagens.error)} />;
  const dados = pesagens.data;
  if (!dados) return null;
  const { gmd, alertas, parametrosAlertas } = dados;
  const intervaloAte = new Map(gmd.intervalos.map((i) => [i.pesagemFinalId, i]));
  // Só alertas ainda não conferidos (regra comum ao processo principal).
  const porId = new Map(dados.pesagens.map((p) => [p.id, p]));
  const pendentes = alertas.filter((a) => !alertaConferido(a, porId));
  const alertasPorPesagem = new Map<string, AlertaPesagem[]>();
  for (const a of pendentes) {
    alertasPorPesagem.set(a.pesagemId, [...(alertasPorPesagem.get(a.pesagemId) ?? []), a]);
  }
  const ultimo = gmd.intervalos.at(-1);
  const lista = [...dados.pesagens].reverse();
  const temEcc = dados.pesagens.some((p) => p.escoreCorporal !== null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm text-texto-suave">
          <Info className="size-4" aria-hidden />
          <span>
            Ganho médio diário <strong className="font-medium text-texto">observado</strong>,
            calculado só com pesagens reais. Peso vivo em kg; arroba de carcaça não é calculada.
          </span>
        </p>
        {animal.status === 'ativo' && (
          <Botao onClick={() => setModal({ tipo: 'nova' })}>
            <Plus className="size-4" aria-hidden />
            Registrar pesagem
          </Botao>
        )}
      </div>

      {pendentes.length > 0 && (
        <Alerta
          tom="alerta"
          titulo={`${pendentes.length} ${pendentes.length === 1 ? 'alerta de pesagem' : 'alertas de pesagem'} em aberto`}
        >
          <ul className="list-disc pl-4">
            {CATEGORIAS_ALERTA_PESAGEM.map((c) => {
              const n = pendentes.filter((a) => a.categoria === c).length;
              return n > 0 ? (
                <li key={c}>
                  {rotulos.categoriaAlerta[c]} ({n}): {rotulos.explicacaoCategoriaAlerta[c]}
                </li>
              ) : null;
            })}
          </ul>
          <p className="mt-1">
            Os critérios são parâmetros definidos em Configurações, não limites científicos. Corrija
            se houver erro ou confirme o valor com uma justificativa.
          </p>
        </Alerta>
      )}

      {gmd.situacao === 'calculado' && gmd.periodoTotal && ultimo ? (
        <div className="grid gap-4 md:grid-cols-2">
          <CartaoGmd titulo="GMD no período total" intervalo={gmd.periodoTotal} />
          <CartaoGmd titulo="GMD entre as duas últimas pesagens" intervalo={ultimo} />
        </div>
      ) : (
        <Alerta tom="info" titulo="GMD ainda não disponível">
          {gmd.situacao === 'sem_pesagens'
            ? 'Registre pelo menos duas pesagens em datas diferentes para calcular o ganho médio diário.'
            : 'Há uma pesagem. Registre outra em data diferente para calcular o ganho médio diário.'}
        </Alerta>
      )}

      {dados.pesagens.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Cartao>
            <CartaoConteudo className="flex flex-col gap-3">
              <CartaoTitulo className="text-sm">Peso vivo (kg)</CartaoTitulo>
              <GraficoPesoAnimal pesagens={dados.pesagens} intervalos={gmd.intervalos} />
            </CartaoConteudo>
          </Cartao>
          {gmd.intervalos.length > 0 && (
            <Cartao>
              <CartaoConteudo className="flex flex-col gap-3">
                <CartaoTitulo className="text-sm">
                  GMD observado por intervalo (kg/dia)
                </CartaoTitulo>
                <GraficoGmdIntervalos intervalos={gmd.intervalos} />
              </CartaoConteudo>
            </Cartao>
          )}
        </div>
      )}

      {lista.length === 0 ? (
        <EstadoVazio icone={Scale} titulo="Nenhuma pesagem registrada" />
      ) : (
        <Tabela data-testid="tabela-pesagens">
          <Cabeca>
            <Th>Data</Th>
            <Th>Peso vivo</Th>
            <Th>Método</Th>
            {temEcc && <Th>Escore corporal</Th>}
            <Th>Ganho desde a anterior</Th>
            <Th>GMD do intervalo</Th>
            <Th>Conferência</Th>
            <Th>Observação</Th>
            <Th className="text-right">Ações</Th>
          </Cabeca>
          <tbody>
            {lista.map((p) => {
              const intervalo = intervaloAte.get(p.id);
              const alertasDaPesagem = alertasPorPesagem.get(p.id) ?? [];
              return (
                <Linha key={p.id} data-pesagem={p.data}>
                  <Td className="whitespace-nowrap">{formatarData(p.data)}</Td>
                  <Td className="font-medium whitespace-nowrap">{formatarPeso(p.pesoVivoKg)}</Td>
                  <Td>{rotulos.metodo[p.metodo]}</Td>
                  {temEcc && (
                    <Td className="whitespace-nowrap">
                      {formatarEcc(p.escoreCorporal, p.escalaEcc)}
                    </Td>
                  )}
                  <Td className="whitespace-nowrap">
                    {intervalo ? `${formatarGanho(intervalo.ganhoKg)} em ${intervalo.dias} d` : '—'}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {intervalo ? (
                      <span
                        className={intervalo.estimado ? 'text-alerta' : ''}
                        title={intervalo.estimado ? 'Inclui peso estimado' : undefined}
                      >
                        {formatarGmd(intervalo.gmdKgDia)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    {alertasDaPesagem.length > 0 ? (
                      <Selo
                        tom={tomDoAlerta(alertasDaPesagem[0]!)}
                        title={alertasDaPesagem
                          .map(
                            (a) =>
                              `${rotulos.categoriaAlerta[a.categoria]}: ${descreverAlerta(a, parametrosAlertas)}`,
                          )
                          .join(' ')}
                      >
                        <TriangleAlert className="size-3" aria-hidden />
                        {rotulos.alertaPesagem[alertasDaPesagem[0]!.tipo]}
                      </Selo>
                    ) : p.conferidaEm ? (
                      <Selo tom="sucesso" title={p.justificativaConferencia ?? undefined}>
                        <CircleCheck className="size-3" aria-hidden />
                        Conferida
                      </Selo>
                    ) : (
                      <span className="text-texto-suave">—</span>
                    )}
                  </Td>
                  <Td className="max-w-48 truncate text-texto-suave">{p.observacao ?? '—'}</Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {alertasDaPesagem.length > 0 && (
                        <Botao
                          tamanho="pequeno"
                          variante="fantasma"
                          aria-label={`Confirmar pesagem de ${formatarData(p.data)}`}
                          title="Confirmar valor conferido"
                          onClick={() =>
                            setModal({ tipo: 'conferir', pesagem: p, alertas: alertasDaPesagem })
                          }
                        >
                          <CircleCheck className="size-3.5" aria-hidden />
                        </Botao>
                      )}
                      <Botao
                        tamanho="pequeno"
                        variante="fantasma"
                        aria-label={`Corrigir pesagem de ${formatarData(p.data)}`}
                        onClick={() => setModal({ tipo: 'editar', pesagem: p })}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Botao>
                      <Botao
                        tamanho="pequeno"
                        variante="fantasma"
                        aria-label={`Excluir pesagem de ${formatarData(p.data)}`}
                        onClick={() => setModal({ tipo: 'excluir', pesagem: p })}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Botao>
                    </div>
                  </Td>
                </Linha>
              );
            })}
          </tbody>
        </Tabela>
      )}

      {(modal?.tipo === 'nova' || modal?.tipo === 'editar') && (
        <ModalPesagem
          animalId={animal.id}
          pesagem={modal.tipo === 'editar' ? modal.pesagem : null}
          dataMinima={animal.dataEntrada}
          pesagensDoAnimal={dados.pesagens}
          parametros={parametrosAlertas}
          aoFechar={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'conferir' && (
        <ModalConferirPesagem
          pesagem={modal.pesagem}
          descricao={modal.alertas.map((a) => descreverAlerta(a, parametrosAlertas)).join(' ')}
          aoFechar={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'excluir' && (
        <ModalExclusao
          titulo="Excluir pesagem?"
          descricao={`Pesagem de ${formatarData(modal.pesagem.data)} (${formatarPeso(modal.pesagem.pesoVivoKg)}). Ela sai dos cálculos, mas a exclusão fica registrada no histórico.`}
          enviando={excluir.isPending}
          aoFechar={() => setModal(null)}
          aoConfirmar={(motivo, mostrarErro) =>
            excluir.mutate(
              { id: modal.pesagem.id, motivo },
              {
                onSuccess: () => {
                  notificar('Pesagem excluída.', 'sucesso');
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

function formatarValorCampo(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return 'vazio';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  if (campo === 'dataNascimento' || campo === 'data') return formatarData(String(valor));
  if (campo === 'pesoVivoKg') return formatarPeso(Number(valor));
  if (campo === 'custoTotalCentavos') return formatarMoeda(Number(valor));
  const mapas: Record<string, Record<string, string>> = {
    sexo: rotulos.sexo,
    condicaoSexual: rotulos.condicaoSexual,
    categoria: rotulos.categoria,
    aptidao: rotulos.aptidaoAnimal,
    origem: rotulos.origem,
    metodo: rotulos.metodo,
    escalaEcc: rotulos.escalaEcc,
    tipo: rotulos.tipoManejo,
    unidadeDose: rotulos.unidadeDose,
    via: rotulos.via,
  };
  return mapas[campo]?.[String(valor)] ?? String(valor);
}

function tituloAlteracao(evento: Extract<EventoHistoricoAnimal, { tipo: 'alteracao' }>): string {
  const deQuando = evento.dataReferencia ? ` de ${formatarData(evento.dataReferencia)}` : '';
  if (evento.entidade === 'pesagem') {
    if (evento.acao === 'exclusao') return `Pesagem${deQuando} excluída`;
    if (evento.acao === 'conferencia') return `Pesagem${deQuando} conferida`;
    return `Pesagem${deQuando} corrigida`;
  }
  if (evento.entidade === 'manejo_sanitario') {
    if (evento.acao === 'exclusao') return `Registro sanitário${deQuando} excluído`;
    if (evento.acao === 'remocao_animal') return `Animal retirado do registro sanitário${deQuando}`;
    return `Registro sanitário${deQuando} corrigido`;
  }
  return 'Cadastro alterado';
}

function DescricaoEvento({ evento }: { evento: EventoHistoricoAnimal }) {
  if (evento.tipo === 'movimentacao') {
    const m = evento.movimentacao;
    const titulo = rotulos.movimentacao[m.tipo];
    const detalhe =
      m.tipo === 'entrada'
        ? m.loteDestino
          ? `no lote ${m.loteDestino.nome}`
          : 'sem lote'
        : m.tipo === 'saida'
          ? m.loteOrigem
            ? `do lote ${m.loteOrigem.nome}`
            : ''
          : `${m.loteOrigem?.nome ?? 'sem lote'} → ${m.loteDestino?.nome ?? 'sem lote'}`;
    return (
      <>
        <p className="font-medium">{titulo}</p>
        <p className="text-sm text-texto-suave">
          {detalhe}
          {m.motivo ? ` · ${m.motivo}` : ''}
        </p>
      </>
    );
  }
  if (evento.tipo === 'pesagem') {
    const p = evento.pesagem;
    return (
      <>
        <p className="font-medium">Pesagem: {formatarPeso(p.pesoVivoKg)}</p>
        <p className="text-sm text-texto-suave">
          {rotulos.metodo[p.metodo]}
          {p.escoreCorporal !== null ? ` · ECC ${formatarEcc(p.escoreCorporal, p.escalaEcc)}` : ''}
          {p.observacao ? ` · ${p.observacao}` : ''}
        </p>
      </>
    );
  }
  if (evento.tipo === 'sanidade') {
    const e = evento.evento;
    return (
      <>
        <p className="font-medium">
          {rotulos.tipoManejo[e.tipo]}: {e.produto?.nome ?? e.descricao}
        </p>
        <p className="text-sm text-texto-suave">
          {[
            e.dose !== null ? formatarDose(e.dose, e.unidadeDose) : null,
            e.via ? rotulos.via[e.via] : null,
            e.abrangencia === 'coletiva'
              ? `Aplicação coletiva${e.lote ? ` (${e.lote.nome})` : ''}`
              : null,
            e.fimCarenciaCarne
              ? `Carência carne: fim do prazo calculado em ${formatarData(e.fimCarenciaCarne)}`
              : null,
            e.fimCarenciaLeite
              ? `Carência leite: fim do prazo calculado em ${formatarData(e.fimCarenciaLeite)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </>
    );
  }
  return (
    <>
      <p className="font-medium">{tituloAlteracao(evento)}</p>
      <ul className="text-sm text-texto-suave">
        {evento.campos.map((c) => (
          <li key={c.campo}>
            {nomesDeCampo[c.campo] ?? c.campo}: {formatarValorCampo(c.campo, c.antes)} →{' '}
            {formatarValorCampo(c.campo, c.depois)}
          </li>
        ))}
        {evento.motivo && <li>Motivo: {evento.motivo}</li>}
      </ul>
    </>
  );
}

function Historico({ animalId }: { animalId: string }) {
  const historico = useHistoricoAnimal(animalId);
  if (historico.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(historico.error)} />;
  const eventos = historico.data?.eventos ?? [];
  return (
    <ol
      className="relative flex flex-col gap-4 border-l border-borda pl-6"
      data-testid="linha-do-tempo"
    >
      {eventos.map((e, i) => (
        <li key={i} className="relative">
          <span
            className="absolute top-1.5 -left-[1.85rem] size-2.5 rounded-full border-2 border-superficie bg-marca"
            aria-hidden
          />
          <p className="text-xs text-texto-suave">{formatarData(e.data)}</p>
          <DescricaoEvento evento={e} />
        </li>
      ))}
    </ol>
  );
}

export function PaginaAnimalDetalhe() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const animal = useAnimal(id);
  const excluir = useAcaoRebanho('animal:excluir');
  const { notificar } = useNotificacoes();
  const [aba, setAba] = useState<Aba>('resumo');
  const [modal, setModal] = useState<
    'pesagem' | 'transferir' | 'saida' | 'desfazer' | 'excluir' | null
  >(null);

  if (animal.isError) {
    return (
      <div className="flex flex-col gap-4">
        <CabecalhoPagina voltar={{ para: '/rebanho/animais', rotulo: 'Animais' }} titulo="Animal" />
        <Alerta tom="perigo" titulo={mensagemDeErro(animal.error)} />
      </div>
    );
  }
  const a = animal.data;
  if (!a) return null;
  const ativo = a.status === 'ativo';

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        voltar={{ para: '/rebanho/animais', rotulo: 'Animais' }}
        titulo={a.identificacao}
        selo={<Selo tom={ativo ? 'sucesso' : 'neutro'}>{rotulos.status[a.status]}</Selo>}
        descricao={[
          a.nome,
          rotulos.categoria[a.categoria],
          a.raca?.nome,
          formatarIdade(a.dataNascimento) !== '—' ? formatarIdade(a.dataNascimento) : null,
          a.lote ? `Lote: ${a.lote.nome}` : ativo ? 'Sem lote' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        acoes={
          <>
            {ativo && (
              <Botao variante="secundario" onClick={() => setModal('pesagem')}>
                <Scale className="size-4" aria-hidden />
                Pesar
              </Botao>
            )}
            <Link to={`/manejo/sanidade/novo?animal=${a.id}`}>
              <Botao variante="secundario">
                <Syringe className="size-4" aria-hidden />
                Registrar sanidade
              </Botao>
            </Link>
            {ativo && (
              <Botao variante="secundario" onClick={() => setModal('transferir')}>
                <ArrowRightLeft className="size-4" aria-hidden />
                Transferir
              </Botao>
            )}
            <Link to={`/rebanho/animais/${a.id}/editar`}>
              <Botao variante="secundario">
                <Pencil className="size-4" aria-hidden />
                Editar
              </Botao>
            </Link>
            {ativo && (
              <Botao variante="secundario" onClick={() => setModal('saida')}>
                <LogOut className="size-4" aria-hidden />
                Registrar saída
              </Botao>
            )}
            {!ativo && (
              <Botao variante="secundario" onClick={() => setModal('desfazer')}>
                <Undo2 className="size-4" aria-hidden />
                Desfazer saída
              </Botao>
            )}
            <Botao
              variante="fantasma"
              aria-label="Excluir cadastro"
              title="Excluir cadastro feito por engano"
              onClick={() => setModal('excluir')}
            >
              <Trash2 className="size-4" aria-hidden />
            </Botao>
          </>
        }
      />

      {a.ultimaPesagem && (
        <div className="flex items-center gap-2 text-sm text-texto-suave">
          <TrendingUp className="size-4 text-marca" aria-hidden />
          Último peso vivo:{' '}
          <strong className="text-texto">{formatarPeso(a.ultimaPesagem.pesoVivoKg)}</strong> em{' '}
          {formatarData(a.ultimaPesagem.data)}
        </div>
      )}

      <Abas<Aba>
        abas={[
          { id: 'resumo', rotulo: 'Resumo' },
          { id: 'pesagens', rotulo: 'Pesagens e GMD' },
          { id: 'sanidade', rotulo: 'Sanidade' },
          { id: 'custo', rotulo: 'Custo' },
          { id: 'historico', rotulo: 'Histórico' },
        ]}
        atual={aba}
        aoMudar={setAba}
      />
      {aba === 'resumo' && <Resumo animal={a} />}
      {aba === 'pesagens' && <Pesagens animal={a} />}
      {aba === 'sanidade' && <SanidadeDoAnimal animal={a} />}
      {aba === 'custo' && <CustoDoAnimalAba animal={a} />}
      {aba === 'historico' && <Historico animalId={a.id} />}

      {modal === 'pesagem' && (
        <ModalPesagemDoCabecalho animal={a} aoFechar={() => setModal(null)} />
      )}
      {modal === 'transferir' && (
        <ModalTransferencia
          propriedadeId={a.propriedadeId}
          animais={[a]}
          loteAtualId={a.lote?.id ?? null}
          aoFechar={() => setModal(null)}
        />
      )}
      {modal === 'saida' && <ModalSaida animal={a} aoFechar={() => setModal(null)} />}
      {modal === 'desfazer' && <ModalDesfazerSaida animal={a} aoFechar={() => setModal(null)} />}
      {modal === 'excluir' && (
        <ModalExclusao
          titulo={`Excluir o cadastro de ${a.identificacao}?`}
          descricao="Use só para cadastros feitos por engano. Para venda, morte ou descarte, use “Registrar saída”. O registro e o histórico ficam guardados, e a identificação fica livre."
          enviando={excluir.isPending}
          aoFechar={() => setModal(null)}
          aoConfirmar={(motivo, mostrarErro) =>
            excluir.mutate(
              { id: a.id, motivo },
              {
                onSuccess: () => {
                  notificar(`Cadastro de ${a.identificacao} excluído.`, 'sucesso');
                  navegar('/rebanho/animais');
                },
                onError: (e) => {
                  mostrarErro(e);
                  notificar(mensagemDeErro(e), 'perigo');
                },
              },
            )
          }
        />
      )}
    </div>
  );
}

/** "Pesar" do cabeçalho: usa as pesagens do animal para mostrar alertas antes de salvar. */
function ModalPesagemDoCabecalho({
  animal,
  aoFechar,
}: {
  animal: AnimalDetalhe;
  aoFechar: () => void;
}) {
  const pesagens = usePesagens(animal.id);
  return (
    <ModalPesagem
      animalId={animal.id}
      pesagem={null}
      dataMinima={animal.dataEntrada}
      pesagensDoAnimal={pesagens.data?.pesagens}
      parametros={pesagens.data?.parametrosAlertas}
      aoFechar={aoFechar}
    />
  );
}
