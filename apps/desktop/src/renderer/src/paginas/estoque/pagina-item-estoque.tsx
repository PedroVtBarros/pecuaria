import { AlimentoDoItem } from '../alimentos/vinculo-estoque';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type {
  ItemEstoque,
  LoteEstoque,
  MovimentoEstoque,
  Propriedade,
} from '@pecuaria/shared-types';
import { sentidoEstoque } from '@pecuaria/domain';
import { useAcaoEstoque, useExtratoEstoque, useItemEstoque } from '../../lib/consultas-estoque';
import { useLotes } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarData } from '../../lib/formatar-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Selecao, CaixaMarcar } from '../../components/ui/campos';
import { Cartao, CartaoConteudo } from '../../components/ui/cartao';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { Selo } from '../../components/ui/selo';
import {
  explicacaoEstoqueMinimo,
  quantidadeEstoque,
  tiposMovimentoEstoque,
  valorEstoque,
} from '../../textos-estoque';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import {
  ModalItemEstoque,
  ModalLoteEstoque,
  ModalMovimentoEstoque,
  TextoEstoque,
} from './modais-estoque';

function Cancelar({ movimento, aoFechar }: { movimento: MovimentoEstoque; aoFechar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const cancelar = useAcaoEstoque('estoque:cancelar');
  return (
    <Modal
      aberto
      titulo="Cancelar movimento de estoque"
      descricao="O lançamento e seus valores anteriores permanecem no histórico. Saldos e valores posteriores serão recalculados."
      aoFechar={aoFechar}
      textoEnviar="Confirmar cancelamento"
      enviando={cancelar.isPending}
      erros={erro ? [erro] : []}
      aoEnviar={() => {
        if (!motivo.trim()) {
          setErro('Informe o motivo.');
          return;
        }
        cancelar.mutate(
          { id: movimento.id, motivo },
          { onSuccess: aoFechar, onError: (e) => setErro(mensagemDeErro(e)) },
        );
      }}
    >
      <TextoEstoque rotulo="Motivo do cancelamento" valor={motivo} aoMudar={setMotivo} />
    </Modal>
  );
}
function Extrato({
  item,
  aoCorrigir,
  aoCancelar,
}: {
  item: ItemEstoque;
  aoCorrigir: (m: MovimentoEstoque) => void;
  aoCancelar: (m: MovimentoEstoque) => void;
}) {
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [destino, setDestino] = useState('');
  const [cancelados, setCancelados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const consulta = useExtratoEstoque({
    itemId: item.id,
    pagina,
    incluirCancelados: cancelados,
    ...(inicio ? { dataInicial: inicio } : {}),
    ...(fim ? { dataFinal: fim } : {}),
    ...(destino ? { destino: destino as 'propriedade' | 'lote' | 'animal' } : {}),
  });
  const lotes = useLotes(item.propriedadeId, true);
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="font-semibold">Extrato de movimentações</h3>
      <div className="flex flex-wrap items-end gap-3">
        <TextoEstoque
          rotulo="Movimentos desde"
          tipo="date"
          valor={inicio}
          aoMudar={(v) => {
            setInicio(v);
            setPagina(1);
          }}
        />
        <TextoEstoque
          rotulo="Movimentos até"
          tipo="date"
          valor={fim}
          aoMudar={(v) => {
            setFim(v);
            setPagina(1);
          }}
        />
        <Campo rotulo="Filtrar destino">
          {(p) => (
            <Selecao
              {...p}
              value={destino}
              onChange={(e) => {
                setDestino(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Todos os destinos</option>
              <option value="propriedade">Propriedade</option>
              <option value="lote">Lote de animais</option>
              <option value="animal">Animal</option>
            </Selecao>
          )}
        </Campo>
        <CaixaMarcar
          rotulo="Mostrar cancelados e substituídos"
          marcado={cancelados}
          aoMudar={(v) => {
            setCancelados(v);
            setPagina(1);
          }}
        />
      </div>
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      <Tabela data-testid="extrato-estoque">
        <Cabeca>
          <Th>Data</Th>
          <Th>Movimento</Th>
          <Th>Quantidade</Th>
          <Th>Custo apropriado</Th>
          <Th>Destino</Th>
          <Th>Rastreabilidade</Th>
          <Th>Ações</Th>
        </Cabeca>
        <tbody>
          {(consulta.data?.itens ?? []).map((m) => (
            <Linha key={m.id}>
              <Td className="whitespace-nowrap">{formatarData(m.data)}</Td>
              <Td>
                {tiposMovimentoEstoque[m.tipo]}
                {m.canceladoEm && <Selo>Cancelado / substituído</Selo>}
              </Td>
              <Td className="whitespace-nowrap">
                {sentidoEstoque(m.tipo) === 'entrada' ? '+' : '−'}
                {quantidadeEstoque(m.quantidade, m.unidadeBase)}
              </Td>
              <Td>{valorEstoque(m.custoApropriadoCentavos)}</Td>
              <Td>
                {m.destino === 'lote' ? (
                  <Link className="text-marca underline" to={`/rebanho/lotes/${m.loteAnimalId}`}>
                    {lotes.data?.find((l) => l.id === m.loteAnimalId)?.nome ?? 'Lote de animais'}
                  </Link>
                ) : m.destino === 'animal' ? (
                  <Link className="text-marca underline" to={`/rebanho/animais/${m.animalId}`}>
                    Ficha do animal
                  </Link>
                ) : m.destino === 'propriedade' ? (
                  'Geral da propriedade'
                ) : (
                  'Entrada no estoque'
                )}
              </Td>
              <Td>
                {m.manejoSanitarioId ? (
                  <Link
                    className="text-marca underline"
                    to={`/manejo/sanidade/${m.manejoSanitarioId}`}
                  >
                    Registro sanitário
                  </Link>
                ) : m.substituiId ? (
                  'Correção auditada'
                ) : (
                  'Movimento próprio'
                )}
                {m.motivo && <p className="text-xs text-texto-suave">{m.motivo}</p>}
              </Td>
              <Td>
                {!m.canceladoEm && !m.manejoSanitarioId && (
                  <div className="flex gap-1">
                    <Botao variante="fantasma" tamanho="pequeno" onClick={() => aoCorrigir(m)}>
                      Corrigir
                    </Botao>
                    <Botao variante="fantasma" tamanho="pequeno" onClick={() => aoCancelar(m)}>
                      Cancelar
                    </Botao>
                  </div>
                )}
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>
          {consulta.data?.total ?? 0} movimento(s) · página {pagina}
        </span>
        <div className="flex gap-2">
          <Botao
            variante="secundario"
            disabled={pagina === 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </Botao>
          <Botao
            variante="secundario"
            disabled={pagina * 50 >= (consulta.data?.total ?? 0)}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Botao>
        </div>
      </div>
    </section>
  );
}
function Conteudo({ id, propriedade }: { id: string; propriedade: Propriedade }) {
  const consulta = useItemEstoque(id);
  const [modal, setModal] = useState<'item' | 'movimento' | 'lote' | null>(null);
  const [correcao, setCorrecao] = useState<MovimentoEstoque | null>(null);
  const [cancelar, setCancelar] = useState<MovimentoEstoque | null>(null);
  const [lote, setLote] = useState<LoteEstoque | null>(null);
  if (consulta.isError)
    return (
      <div className="p-8">
        <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />
      </div>
    );
  if (!consulta.data) return <p className="p-8">Carregando item de estoque...</p>;
  const d = consulta.data;
  const i = d.item;
  if (i.propriedadeId !== propriedade.id)
    return (
      <div className="p-8">
        <Alerta
          tom="info"
          titulo="Este item pertence a outra propriedade. Selecione a propriedade correspondente no cabeçalho."
        />
        <Link to="/estoque">Voltar ao estoque</Link>
      </div>
    );
  const medio =
    i.saldo === 0 || i.valorSaldoCentavos === null
      ? 'Indisponível'
      : (i.valorSaldoCentavos / (100 * i.saldo)).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          maximumFractionDigits: 6,
        });
  return (
    <div className="flex min-w-0 flex-col gap-6 p-8">
      <CabecalhoPagina
        titulo={i.nome}
        voltar={{ para: '/estoque', rotulo: 'Estoque' }}
        descricao={`Unidade física: ${i.unidadeBase}${i.baseMateria === 'mn' ? ' · Matéria natural' : ''}${i.ativo ? '' : ' · Item inativo'}`}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setModal('item')}>
              Editar item
            </Botao>
            <Botao onClick={() => setModal('movimento')} disabled={!i.ativo}>
              Registrar movimento
            </Botao>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          ['Saldo físico', quantidadeEstoque(i.saldo, i.unidadeBase)],
          ['Valor do saldo', valorEstoque(i.valorSaldoCentavos)],
          [`Custo médio por ${i.unidadeBase}`, medio],
        ].map(([titulo, valor]) => (
          <Cartao key={titulo}>
            <CartaoConteudo>
              <p className="text-sm text-texto-suave">{titulo}</p>
              <p
                className="text-xl font-semibold"
                data-testid={titulo === 'Saldo físico' ? 'saldo-estoque' : undefined}
              >
                {valor}
              </p>
            </CartaoConteudo>
          </Cartao>
        ))}
      </div>
      {!i.valoracaoCompleta && (
        <Alerta tom="alerta" titulo="Valoração incompleta">
          Há entrada com custo ainda desconhecido. Isso não significa custo zero. Informe o custo
          por uma correção auditada para recalcular as saídas afetadas.
        </Alerta>
      )}
      {i.abaixoMinimo && (
        <Alerta tom="alerta" titulo="Estoque no mínimo ou abaixo">
          {explicacaoEstoqueMinimo(i.estoqueMinimo!, i.unidadeBase)}
        </Alerta>
      )}
      <p className="text-sm text-texto-suave">
        Saldo e consumo físico não equivalem a pagamento ou despesa financeira. Não há conversão
        entre matéria natural e matéria seca, nem entre doses e unidades comerciais.
      </p>
      <AlimentoDoItem itemId={i.id} tipo={i.tipo} />
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Lotes físicos do estoque</h3>
          <Botao variante="secundario" onClick={() => setModal('lote')}>
            Novo lote físico
          </Botao>
        </div>
        <Tabela data-testid="lotes-fisicos-estoque">
          <Cabeca>
            <Th>Lote físico</Th>
            <Th>Validade informada</Th>
            <Th>Saldo</Th>
            <Th>Ações</Th>
          </Cabeca>
          <tbody>
            {d.lotes.map((l) => (
              <Linha key={l.id}>
                <Td>{l.codigo}</Td>
                <Td>{l.validade ? formatarData(l.validade) : 'Não informada'}</Td>
                <Td>{quantidadeEstoque(l.saldo, i.unidadeBase)}</Td>
                <Td>
                  <Botao variante="fantasma" tamanho="pequeno" onClick={() => setLote(l)}>
                    Corrigir lote
                  </Botao>
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
        {d.lotes.length === 0 && (
          <p className="text-sm text-texto-suave">
            Nenhum lote físico cadastrado.{' '}
            {i.controleLote
              ? 'Cadastre um lote antes de movimentar.'
              : 'O item também permite movimentos sem lote físico.'}
          </p>
        )}
      </section>
      <Extrato key={i.id} item={i} aoCorrigir={setCorrecao} aoCancelar={setCancelar} />
      <details className="rounded-lg border border-borda p-4">
        <summary className="cursor-pointer font-medium">Últimas 100 alterações auditadas</summary>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {d.historico.map((h) => (
            <li key={h.id}>
              <time>{new Date(h.ocorridoEm).toLocaleString('pt-BR')}</time> · {h.acao}
              {h.motivo ? ` · ${h.motivo}` : ''}
            </li>
          ))}
        </ul>
      </details>
      {modal === 'item' && (
        <ModalItemEstoque
          propriedadeId={i.propriedadeId}
          item={i}
          travado={d.movimentos.length > 0}
          aoFechar={() => setModal(null)}
        />
      )}
      {(modal === 'lote' || lote) && (
        <ModalLoteEstoque
          itemId={i.id}
          lote={lote}
          aoFechar={() => {
            setLote(null);
            setModal(null);
          }}
        />
      )}
      {(modal === 'movimento' || correcao) && (
        <ModalMovimentoEstoque
          item={i}
          lotes={d.lotes}
          movimento={correcao}
          aoFechar={() => {
            setCorrecao(null);
            setModal(null);
          }}
        />
      )}
      {cancelar && <Cancelar movimento={cancelar} aoFechar={() => setCancelar(null)} />}
    </div>
  );
}
export function PaginaItemEstoque() {
  const { id = '' } = useParams();
  return (
    <ComPropriedade>
      {(p) => <Conteudo key={`${p.id}-${id}`} id={id} propriedade={p} />}
    </ComPropriedade>
  );
}
