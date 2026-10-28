import { useState } from 'react';
import { useParams } from 'react-router';
import type { LancamentoDetalhe, ParcelaFinanceira } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo } from '../../components/ui/cartao';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro, useLancamento } from '../../lib/consultas-financeiro';
import { formatarData } from '../../lib/formatar-rebanho';
import {
  atividades,
  comportamentos,
  condicoes,
  gruposCategoria,
  moeda,
  naturezas,
  rotulosDosValores,
  situacaoDoLancamento,
  situacoesParcela,
  tomDaSituacao,
  tratamentos,
  unidadesQuantidade,
} from '../../textos-financeiro';
import { ModalMotivo } from '../manejo/modais-sanidade';
import { ModalLancamento } from './modal-lancamento';
import { ModalDefinirPagamento, ModalPagamento, ModalRenegociar } from './modais-lancamento';

const acoesDaTrilha: Record<string, string> = {
  criacao: 'Criação',
  alteracao: 'Alteração',
  cancelamento: 'Cancelamento',
  estorno: 'Estorno de pagamento',
  renegociacao: 'Renegociação das parcelas',
  definicao_condicao: 'Definição da condição de pagamento',
};

function Detalhe({ l }: { l: LancamentoDetalhe }) {
  const [pagando, setPagando] = useState<ParcelaFinanceira | null>(null);
  const [estornando, setEstornando] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [renegociando, setRenegociando] = useState(false);
  const [definindo, setDefinindo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const estornar = useAcaoFinanceiro('pagamento:estornar');
  const cancelar = useAcaoFinanceiro('lancamento:cancelar');
  const r = rotulosDosValores(l.natureza);
  const recebimento = l.natureza === 'receita';
  const parcelasAtivas = l.parcelas.filter((p) => !p.cancelada);
  const ativo = !l.cancelado;
  const manual = l.origemTipo === 'manual';
  const destino =
    l.destino.tipo === 'lote'
      ? `Lote: ${l.destino.loteNome ?? ''}`
      : l.destino.tipo === 'animal'
        ? `Animal: ${l.destino.animalIdentificacao ?? ''}`
        : l.destino.tipo === 'propriedade'
          ? 'Propriedade (geral)'
          : 'Sem destino';
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        voltar={{ para: '/financeiro/lancamentos', rotulo: 'Lançamentos' }}
        titulo={l.descricao}
        selo={
          <Selo tom={tomDaSituacao[l.situacao]} data-testid="situacao-lancamento">
            {situacaoDoLancamento(l.situacao, l.natureza, l.compensadoCentavos)}
          </Selo>
        }
        descricao={`${naturezas[l.natureza]} · ${l.categoria.nome} · competência ${formatarData(l.dataCompetencia)}`}
        acoes={
          ativo && manual ? (
            <>
              <Botao variante="secundario" onClick={() => setEditando(true)}>
                Editar
              </Botao>
              {l.condicaoPagamento !== 'nao_informada' && (
                <Botao variante="secundario" onClick={() => setRenegociando(true)}>
                  Renegociar
                </Botao>
              )}
              <Botao variante="perigo" onClick={() => setCancelando(true)}>
                Cancelar lançamento
              </Botao>
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="tres-valores">
        {[
          [r.operacao, moeda(l.valorOperacaoCentavos), 'valor-operacao'],
          [r.saldo, moeda(l.saldoEmAbertoCentavos), 'saldo-aberto'],
          [r.efetivo, moeda(l.pagoCentavos), 'valor-efetivo'],
          ...(l.compensadoCentavos > 0
            ? [
                [
                  'Compensado em devolução (sem caixa)',
                  moeda(l.compensadoCentavos),
                  'valor-compensado',
                ],
              ]
            : []),
        ].map(([rotulo, valor, id]) => (
          <Cartao key={id}>
            <CartaoConteudo>
              <p className="text-sm text-texto-suave">{rotulo}</p>
              <p className="text-2xl font-semibold" data-testid={id}>
                {valor}
              </p>
            </CartaoConteudo>
          </Cartao>
        ))}
      </div>
      <p className="text-xs text-texto-suave">
        Valor da operação é o fato (competência). {r.saldo} é o que ainda falta. {r.efetivo} é o
        dinheiro que de fato {recebimento ? 'entrou' : 'saiu'}, nas datas dos{' '}
        {recebimento ? 'recebimentos' : 'pagamentos'}.
        {l.compensadoCentavos > 0 &&
          ' Compensado é o que foi liquidado por uma devolução de animais, sem entrada nem saída de dinheiro.'}
      </p>

      {l.situacao === 'pendente_definicao' && (
        <Alerta tom="alerta" titulo="Pendente de definição financeira">
          A condição de pagamento ainda não foi informada. Isso não significa que não haja obrigação
          de {recebimento ? 'receber' : 'pagar'}: o saldo está &ldquo;a definir&rdquo; e nenhum
          pagamento foi registrado.
          {ativo && manual && (
            <div className="mt-2">
              <Botao onClick={() => setDefinindo(true)}>Definir condição de pagamento</Botao>
            </div>
          )}
        </Alerta>
      )}
      {l.cancelado && (
        <Alerta tom="perigo" titulo="Lançamento cancelado">
          Motivo: {l.motivoCancelamento}. O registro e seu histórico permanecem; nada foi apagado.
        </Alerta>
      )}
      {!manual && (
        <Alerta tom="info">
          Este lançamento é gerenciado por outro módulo e não pode ser editado aqui.
        </Alerta>
      )}

      <Cartao>
        <CartaoConteudo>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Categoria', l.categoria.nome],
              ['Grupo', gruposCategoria[l.categoria.grupo]],
              ['Tratamento', tratamentos[l.categoria.tratamento]],
              ['Contraparte', l.pessoa?.nome ?? 'Não informada'],
              ['Documento', l.documentoNumero ?? 'Não informado'],
              ['Atividade', atividades[l.atividade]],
              ['Destino', destino],
              [
                'Classificação do custo',
                l.natureza === 'receita'
                  ? 'Não se aplica (receita)'
                  : comportamentos[l.comportamentoCusto],
              ],
              ['Condição de pagamento', condicoes[l.condicaoPagamento]],
              [
                'Quantidade informativa',
                l.quantidade === null || !l.unidadeQuantidade
                  ? 'Não informada'
                  : `${l.quantidade.toLocaleString('pt-BR')} ${unidadesQuantidade[l.unidadeQuantidade]}`,
              ],
              ['Observações', l.observacoes ?? '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-texto-suave">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CartaoConteudo>
      </Cartao>

      {l.condicaoPagamento !== 'nao_informada' && (
        <section className="flex flex-col gap-2" aria-label="Parcelas">
          <h3 className="font-semibold">Parcelas</h3>
          <Tabela data-testid="tabela-parcelas">
            <Cabeca>
              <Th>Parcela</Th>
              <Th>Vencimento</Th>
              <Th>Valor</Th>
              <Th>{r.efetivo}</Th>
              <Th>Compensado</Th>
              <Th>{r.saldo}</Th>
              <Th>Situação</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabeca>
            <tbody>
              {l.parcelas.map((p) => (
                <Linha key={p.id} className={p.cancelada ? 'opacity-60' : undefined}>
                  <Td>{p.numero}</Td>
                  <Td className="whitespace-nowrap">{formatarData(p.vencimento)}</Td>
                  <Td className="whitespace-nowrap">{moeda(p.valorCentavos)}</Td>
                  <Td className="whitespace-nowrap">{p.cancelada ? '—' : moeda(p.pagoCentavos)}</Td>
                  <Td className="whitespace-nowrap">
                    {p.cancelada || p.compensadoCentavos === 0 ? '—' : moeda(p.compensadoCentavos)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {p.cancelada ? '—' : moeda(p.saldoCentavos)}
                  </Td>
                  <Td>
                    {p.cancelada ? (
                      <Selo title={p.motivoCancelamento ?? undefined}>Substituída</Selo>
                    ) : (
                      <Selo
                        tom={
                          p.situacao === 'paga' || p.situacao === 'compensada'
                            ? 'sucesso'
                            : p.situacao === 'atrasada'
                              ? 'perigo'
                              : p.situacao === 'parcial'
                                ? 'marca'
                                : 'neutro'
                        }
                      >
                        {p.situacao ? situacoesParcela[p.situacao] : ''}
                      </Selo>
                    )}
                  </Td>
                  <Td>
                    {ativo && !p.cancelada && p.saldoCentavos > 0 && (
                      <Botao tamanho="pequeno" variante="secundario" onClick={() => setPagando(p)}>
                        {recebimento ? 'Registrar recebimento' : 'Registrar pagamento'}
                      </Botao>
                    )}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
          {parcelasAtivas.length === 0 && (
            <p className="text-sm text-texto-suave">Nenhuma parcela ativa.</p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2" aria-label="Pagamentos">
        <h3 className="font-semibold">{recebimento ? 'Recebimentos' : 'Pagamentos'} registrados</h3>
        {l.pagamentos.length === 0 ? (
          <p className="text-sm text-texto-suave" data-testid="sem-pagamentos">
            Nenhum {recebimento ? 'recebimento' : 'pagamento'} registrado. Nada é considerado{' '}
            {recebimento ? 'recebido' : 'pago'} sem o seu registro.
          </p>
        ) : (
          <Tabela data-testid="tabela-pagamentos">
            <Cabeca>
              <Th>Data</Th>
              <Th>Parcela</Th>
              <Th>Valor</Th>
              <Th>Forma</Th>
              <Th>Situação</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabeca>
            <tbody>
              {l.pagamentos.map((g) => (
                <Linha key={g.id} className={g.estornado ? 'opacity-60' : undefined}>
                  <Td className="whitespace-nowrap">{formatarData(g.data)}</Td>
                  <Td>{g.parcelaNumero}</Td>
                  <Td className="whitespace-nowrap">{moeda(g.valorCentavos)}</Td>
                  <Td>{g.forma ?? '—'}</Td>
                  <Td>
                    {g.estornado ? (
                      <Selo tom="alerta" title={g.motivoEstorno ?? undefined}>
                        Estornado: {g.motivoEstorno}
                      </Selo>
                    ) : (
                      <Selo tom="sucesso">Efetivo</Selo>
                    )}
                  </Td>
                  <Td>
                    {ativo && !g.estornado && (
                      <Botao
                        tamanho="pequeno"
                        variante="secundario"
                        onClick={() => setEstornando(g.id)}
                      >
                        Estornar
                      </Botao>
                    )}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Histórico">
        <h3 className="font-semibold">Histórico de alterações</h3>
        <ul className="flex flex-col gap-1 text-sm" data-testid="historico-lancamento">
          {l.historico.map((h) => (
            <li key={h.id} className="rounded-md border border-borda px-3 py-2">
              <span className="font-medium">{acoesDaTrilha[h.acao] ?? h.acao}</span>
              <span className="text-texto-suave">
                {' '}
                · {formatarData(h.ocorridoEm.slice(0, 10))}
                {h.motivo ? ` · ${h.motivo}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {pagando && (
        <ModalPagamento lancamento={l} parcela={pagando} aoFechar={() => setPagando(null)} />
      )}
      {editando && (
        <ModalLancamento
          propriedadeId={l.propriedadeId}
          lancamento={l}
          aoFechar={() => setEditando(false)}
        />
      )}
      {renegociando && <ModalRenegociar lancamento={l} aoFechar={() => setRenegociando(false)} />}
      {definindo && <ModalDefinirPagamento lancamento={l} aoFechar={() => setDefinindo(false)} />}
      {estornando && (
        <ModalMotivo
          titulo={`Estornar ${recebimento ? 'recebimento' : 'pagamento'}`}
          descricao="O registro original permanece no histórico, marcado como estornado. A parcela volta a ter saldo."
          textoEnviar="Estornar"
          enviando={estornar.isPending}
          aoFechar={() => setEstornando(null)}
          aoConfirmar={(motivo, mostrarErro) =>
            estornar.mutate(
              { id: estornando, motivo },
              { onSuccess: () => setEstornando(null), onError: mostrarErro },
            )
          }
        />
      )}
      {cancelando && (
        <ModalMotivo
          titulo="Cancelar lançamento"
          descricao="O lançamento permanece no histórico, marcado como cancelado. É preciso estornar antes os pagamentos registrados."
          textoEnviar="Cancelar lançamento"
          enviando={cancelar.isPending}
          aoFechar={() => setCancelando(false)}
          aoConfirmar={(motivo, mostrarErro) =>
            cancelar.mutate(
              { id: l.id, motivo },
              { onSuccess: () => setCancelando(false), onError: mostrarErro },
            )
          }
        />
      )}
    </div>
  );
}

export function PaginaLancamento() {
  const { id = '' } = useParams();
  const consulta = useLancamento(id);
  if (consulta.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />;
  if (!consulta.data) return <p className="text-sm text-texto-suave">Carregando lançamento…</p>;
  return <Detalhe l={consulta.data} />;
}
