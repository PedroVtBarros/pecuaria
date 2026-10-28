import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { CentroProducaoDetalhe } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { useItemEstoque } from '../../lib/consultas-estoque';
import { useCandidatosCentro, useCentroProducao } from '../../lib/consultas-producao';
import { formatarData, hojeIso } from '../../lib/formatar-rebanho';
import { moeda } from '../../textos-financeiro';
import { quantidadeEstoque } from '../../textos-estoque';
import { situacoesCentro, textoCustoDesconhecido } from '../../textos-producao';
import { valorDesconhecido } from '../../textos-rateio';
import { GradeIndicadores, Indicador } from './blocos';
import { quilosDoTexto } from './formulario-negociacao';
import { ModalCentro } from './pagina-producao';
import { ValorApurado, estadosApuracao } from './valor-apurado';

const valor = (c: number | null) => (c === null ? valorDesconhecido : moeda(c));

function ModalVincular({
  centro,
  aoFechar,
}: {
  centro: CentroProducaoDetalhe;
  aoFechar: () => void;
}) {
  const candidatos = useCandidatosCentro(centro.id, true);
  const vincular = useAcaoFinanceiro('producao:vincular');
  const [erro, setErro] = useState<string | null>(null);
  const c = candidatos.data;
  const acao = (tipo: 'lancamento' | 'consumo', origemId: string) =>
    vincular.mutate(
      { id: centro.id, tipo, origemId },
      { onSuccess: () => setErro(null), onError: (e) => setErro(mensagemDeErro(e)) },
    );
  return (
    <Modal
      aberto
      largura="xl"
      titulo="Vincular custos ao centro"
      descricao="Só aparecem despesas manuais de resultado e consumos de estoque da propriedade, sem lote, animal, rateio ou outro centro."
      aoFechar={aoFechar}
    >
      {erro && <Alerta tom="perigo" titulo={erro} />}
      {candidatos.isError && <Alerta tom="perigo" titulo={mensagemDeErro(candidatos.error)} />}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Despesas</h3>
        {c && c.despesas.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhuma despesa disponível.</p>
        ) : (
          <Tabela data-testid="candidatos-despesas">
            <Cabeca>
              <Th>Data</Th>
              <Th>Descrição</Th>
              <Th className="text-right">Valor</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabeca>
            <tbody>
              {(c?.despesas ?? []).map((d) => (
                <Linha key={d.id}>
                  <Td className="whitespace-nowrap">{formatarData(d.data)}</Td>
                  <Td>{d.descricao}</Td>
                  <Td className="text-right whitespace-nowrap">{moeda(d.valorCentavos)}</Td>
                  <Td className="text-right">
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      aria-label={`Vincular ${d.descricao}`}
                      disabled={vincular.isPending}
                      onClick={() => acao('lancamento', d.id)}
                    >
                      Vincular
                    </Botao>
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Consumos de estoque</h3>
        {c && c.consumos.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum consumo disponível.</p>
        ) : (
          <Tabela data-testid="candidatos-consumos">
            <Cabeca>
              <Th>Data</Th>
              <Th>Item</Th>
              <Th className="text-right">Quantidade</Th>
              <Th className="text-right">Custo</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabeca>
            <tbody>
              {(c?.consumos ?? []).map((m) => (
                <Linha key={m.movimentacaoId}>
                  <Td className="whitespace-nowrap">{formatarData(m.data)}</Td>
                  <Td>{m.itemNome}</Td>
                  <Td className="text-right whitespace-nowrap">
                    {quantidadeEstoque(m.quantidade, m.unidadeBase)}
                  </Td>
                  <Td className="text-right whitespace-nowrap">{valor(m.custoCentavos)}</Td>
                  <Td className="text-right">
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      aria-label={`Vincular consumo de ${m.itemNome} em ${formatarData(m.data)}`}
                      disabled={vincular.isPending}
                      onClick={() => acao('consumo', m.movimentacaoId)}
                    >
                      Vincular
                    </Botao>
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
    </Modal>
  );
}

function ModalEncerrar({
  centro,
  aoFechar,
}: {
  centro: CentroProducaoDetalhe;
  aoFechar: () => void;
}) {
  const encerrar = useAcaoFinanceiro('producao:encerrar');
  const item = useItemEstoque(centro.item.id);
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [dataFim, setDataFim] = useState(hojeIso());
  const [quantidade, setQuantidade] = useState('');
  const [lote, setLote] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const controlaLote = item.data?.item.controleLote ?? false;
  return (
    <Modal
      aberto
      titulo="Encerrar centro de produção"
      descricao={`Cria a entrada de produção de ${centro.item.nome} no estoque com o custo apurado.`}
      aoFechar={aoFechar}
      textoEnviar="Encerrar e lançar no estoque"
      enviando={encerrar.isPending}
      erros={erros}
      aoEnviar={() => {
        const q = quilosDoTexto(quantidade);
        const problemas: string[] = [];
        if (q === null || Number.isNaN(q) || q <= 0)
          problemas.push('Informe a quantidade colhida (até três casas decimais).');
        if (controlaLote && !lote) problemas.push('Escolha o lote físico.');
        if (problemas.length) return setErros(problemas);
        encerrar.mutate(
          {
            id: centro.id,
            requisicaoId,
            dataFim,
            quantidade: q as number,
            loteEstoqueId: lote || null,
            observacao: null,
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <ListaDados
        itens={[
          { rotulo: 'Custo apurado', valor: <ValorApurado a={centro.custo.apuracao} /> },
          {
            rotulo: 'Custo de entrada no estoque',
            valor: valor(centro.custo.custoDaEntradaCentavos),
          },
        ]}
      />
      {centro.custo.desconhecidos > 0 && <Alerta tom="alerta">{textoCustoDesconhecido}</Alerta>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Data da colheita" obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={dataFim}
              max={hojeIso()}
              onChange={(e) => setDataFim(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo={`Quantidade colhida (${centro.item.unidadeBase})`} obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          )}
        </Campo>
        {controlaLote && (
          <Campo rotulo="Lote físico" obrigatorio>
            {(p) => (
              <Selecao {...p} value={lote} onChange={(e) => setLote(e.target.value)}>
                <option value="">Escolher…</option>
                {(item.data?.lotes ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        )}
      </div>
    </Modal>
  );
}

function ModalMotivo({
  titulo,
  descricao,
  texto,
  perigoso,
  enviando,
  aoEnviar,
  aoFechar,
}: {
  titulo: string;
  descricao: string;
  texto: string;
  perigoso?: boolean;
  enviando: boolean;
  aoEnviar: (motivo: string, aoErro: (m: string) => void) => void;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      perigoso={perigoso ?? false}
      titulo={titulo}
      descricao={descricao}
      aoFechar={aoFechar}
      textoEnviar={texto}
      enviando={enviando}
      erros={erros}
      aoEnviar={() => {
        if (!motivo.trim()) return setErros(['Informe o motivo.']);
        aoEnviar(motivo.trim(), (m) => setErros([m]));
      }}
    >
      <Campo rotulo="Motivo" obrigatorio>
        {(p) => (
          <Entrada
            {...p}
            value={motivo}
            maxLength={500}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

export function PaginaCentroProducao() {
  const { id = '' } = useParams();
  const consulta = useCentroProducao(id);
  const desvincular = useAcaoFinanceiro('producao:desvincular');
  const reabrir = useAcaoFinanceiro('producao:reabrir');
  const cancelar = useAcaoFinanceiro('producao:cancelar');
  const [modal, setModal] = useState<
    'editar' | 'vincular' | 'encerrar' | 'reabrir' | 'cancelar' | null
  >(null);
  const [erro, setErro] = useState<string | null>(null);
  const c = consulta.data;
  if (consulta.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />;
  if (!c) return <p className="text-sm text-texto-suave">Carregando…</p>;
  const aberto = c.status === 'aberto' && !c.cancelado;
  const tirar = (tipo: 'lancamento' | 'consumo', origemId: string) =>
    desvincular.mutate(
      { id: c.id, tipo, origemId },
      { onSuccess: () => setErro(null), onError: (e) => setErro(mensagemDeErro(e)) },
    );
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo={c.nome}
        voltar={{ para: '/financeiro/producao', rotulo: 'Produção própria' }}
        selo={
          c.cancelado ? (
            <Selo>Cancelado</Selo>
          ) : (
            <Selo tom={aberto ? 'marca' : 'sucesso'}>{situacoesCentro[c.status]}</Selo>
          )
        }
        descricao={`Produz ${c.item.nome} · desde ${formatarData(c.dataInicio)}${c.area ? ` · ${c.area.nome}` : ''}`}
        acoes={
          aberto ? (
            <>
              <Botao variante="secundario" onClick={() => setModal('editar')}>
                Editar
              </Botao>
              <Botao variante="secundario" onClick={() => setModal('vincular')}>
                Vincular custos
              </Botao>
              <Botao disabled={!c.custo.podeEncerrar} onClick={() => setModal('encerrar')}>
                Encerrar
              </Botao>
              <Botao variante="perigo" onClick={() => setModal('cancelar')}>
                Cancelar centro
              </Botao>
            </>
          ) : c.status === 'encerrado' && !c.cancelado ? (
            <Botao variante="secundario" onClick={() => setModal('reabrir')}>
              Reabrir
            </Botao>
          ) : undefined
        }
      />
      <Alerta tom="info">{c.observacao}</Alerta>
      {erro && <Alerta tom="perigo" titulo={erro} />}
      {c.motivoCancelamento && <Alerta tom="alerta">Cancelado: {c.motivoCancelamento}</Alerta>}
      <GradeIndicadores testId="custo-centro">
        <Indicador
          rotulo="Custo apurado"
          valor={<ValorApurado a={c.custo.apuracao} />}
          dica={estadosApuracao[c.custo.apuracao.estado]}
          destaque={c.custo.apuracao.estado === 'completa' ? undefined : 'alerta'}
        />
        <Indicador
          rotulo="Componentes"
          valor={String(c.despesas.filter((d) => !d.cancelada).length + c.consumos.length)}
        />
        <Indicador
          rotulo={c.encerramento ? 'Custo de entrada lançado' : 'Custo de entrada ao encerrar'}
          valor={valor(
            c.encerramento ? c.encerramento.custoTotalCentavos : c.custo.custoDaEntradaCentavos,
          )}
        />
        {c.encerramento && (
          <Indicador
            rotulo="Quantidade colhida"
            valor={quantidadeEstoque(c.encerramento.quantidade, c.item.unidadeBase)}
            dica={c.dataFim ? `Em ${formatarData(c.dataFim)}` : undefined}
          />
        )}
      </GradeIndicadores>
      {c.custo.desconhecidos > 0 && <Alerta tom="alerta">{textoCustoDesconhecido}</Alerta>}
      {aberto && !c.custo.podeEncerrar && (
        <p className="text-sm text-texto-suave">
          Vincule ao menos uma despesa ou consumo para poder encerrar.
        </p>
      )}
      {c.encerramento && (
        <p className="text-sm">
          Entrada no estoque:{' '}
          <Link className="text-marca hover:underline" to={`/estoque/itens/${c.item.id}`}>
            ver {c.item.nome} no Estoque
          </Link>
          . O custo chega aos animais quando o produto é consumido.
        </p>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Despesas vinculadas</h3>
        {c.despesas.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhuma.</p>
        ) : (
          <Tabela data-testid="despesas-centro">
            <Cabeca>
              <Th>Data</Th>
              <Th>Descrição</Th>
              <Th className="text-right">Valor</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabeca>
            <tbody>
              {c.despesas.map((d) => (
                <Linha key={d.id}>
                  <Td className="whitespace-nowrap">{formatarData(d.data)}</Td>
                  <Td>
                    <Link
                      className="text-marca hover:underline"
                      to={`/financeiro/lancamentos/${d.id}`}
                    >
                      {d.descricao}
                    </Link>
                    {d.cancelada && <Selo className="ml-2">Cancelada: não conta</Selo>}
                  </Td>
                  <Td className="text-right whitespace-nowrap">{moeda(d.valorCentavos)}</Td>
                  <Td className="text-right">
                    {aberto && (
                      <Botao
                        tamanho="pequeno"
                        variante="secundario"
                        aria-label={`Desvincular ${d.descricao}`}
                        onClick={() => tirar('lancamento', d.id)}
                      >
                        Desvincular
                      </Botao>
                    )}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Insumos do estoque vinculados</h3>
        {c.consumos.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum.</p>
        ) : (
          <Tabela data-testid="consumos-centro">
            <Cabeca>
              <Th>Data</Th>
              <Th>Item</Th>
              <Th className="text-right">Quantidade</Th>
              <Th className="text-right">Custo</Th>
              <Th>
                <span className="sr-only">Ações</span>
              </Th>
            </Cabeca>
            <tbody>
              {c.consumos.map((m) => (
                <Linha key={m.movimentacaoId}>
                  <Td className="whitespace-nowrap">{formatarData(m.data)}</Td>
                  <Td>{m.itemNome}</Td>
                  <Td className="text-right whitespace-nowrap">
                    {quantidadeEstoque(m.quantidade, m.unidadeBase)}
                  </Td>
                  <Td className="text-right whitespace-nowrap">{valor(m.custoCentavos)}</Td>
                  <Td className="text-right">
                    {aberto && (
                      <Botao
                        tamanho="pequeno"
                        variante="secundario"
                        aria-label={`Desvincular consumo de ${m.itemNome}`}
                        onClick={() => tirar('consumo', m.movimentacaoId)}
                      >
                        Desvincular
                      </Botao>
                    )}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
      {modal === 'editar' && (
        <ModalCentro propriedadeId={c.propriedadeId} centro={c} aoFechar={() => setModal(null)} />
      )}
      {modal === 'vincular' && <ModalVincular centro={c} aoFechar={() => setModal(null)} />}
      {modal === 'encerrar' && <ModalEncerrar centro={c} aoFechar={() => setModal(null)} />}
      {modal === 'reabrir' && (
        <ModalMotivo
          titulo="Reabrir centro de produção"
          descricao="A entrada de produção é cancelada no estoque e o custo volta a ficar no centro. O estoque recusa se o produto já foi consumido além do saldo."
          texto="Reabrir"
          enviando={reabrir.isPending}
          aoFechar={() => setModal(null)}
          aoEnviar={(motivo, aoErro) =>
            reabrir.mutate(
              { id: c.id, motivo },
              { onSuccess: () => setModal(null), onError: (e) => aoErro(mensagemDeErro(e)) },
            )
          }
        />
      )}
      {modal === 'cancelar' && (
        <ModalMotivo
          titulo="Cancelar centro de produção"
          descricao="Só um centro sem custos vinculados pode ser cancelado. Ele continua no histórico."
          texto="Cancelar centro"
          perigoso
          enviando={cancelar.isPending}
          aoFechar={() => setModal(null)}
          aoEnviar={(motivo, aoErro) =>
            cancelar.mutate(
              { id: c.id, motivo },
              { onSuccess: () => setModal(null), onError: (e) => aoErro(mensagemDeErro(e)) },
            )
          }
        />
      )}
    </div>
  );
}
