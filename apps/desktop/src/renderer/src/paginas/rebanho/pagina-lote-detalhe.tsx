import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowRightLeft, MapPinned, Pencil, Power, Scale, Syringe } from 'lucide-react';
import { useAcaoRebanho, useAnimais, useLote } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarData } from '../../lib/formatar-rebanho';
import { EvolucaoDoLote } from './evolucao-lote';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo, CartaoTitulo } from '../../components/ui/cartao';
import { CabecalhoPagina, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { ModalEncerrarLote, ModalLote, ModalMoverArea, ModalTransferencia } from './modais';
import { TabelaAnimais } from './tabela-animais';

export function PaginaLoteDetalhe() {
  const { id = '' } = useParams();
  const lote = useLote(id);
  const animais = useAnimais(lote.data?.propriedadeId ?? null, { loteId: id, tamanhoPagina: 200 });
  const reabrir = useAcaoRebanho('lote:reabrir');
  const { notificar } = useNotificacoes();
  const [modal, setModal] = useState<'editar' | 'mover' | 'encerrar' | 'transferir' | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  if (lote.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(lote.error)} />;
  const l = lote.data;
  if (!l) return null;
  const listaAnimais = animais.data?.itens ?? [];
  const escolhidos = listaAnimais.filter((a) => selecionados.has(a.id));

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        voltar={{ para: '/rebanho/lotes', rotulo: 'Lotes' }}
        titulo={l.nome}
        selo={l.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Encerrado</Selo>}
        descricao={`${rotulos.finalidade[l.finalidade]} · ${l.animaisAtivos} animal(is) ativo(s)`}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setModal('editar')}>
              <Pencil className="size-4" aria-hidden />
              Editar
            </Botao>
            {l.ativo && (
              <Link to={`/manejo/pesagem?lote=${l.id}`}>
                <Botao variante="secundario">
                  <Scale className="size-4" aria-hidden />
                  Pesar lote
                </Botao>
              </Link>
            )}
            {l.ativo && (
              <Link to={`/manejo/sanidade/novo?lote=${l.id}`}>
                <Botao variante="secundario">
                  <Syringe className="size-4" aria-hidden />
                  Registrar sanidade
                </Botao>
              </Link>
            )}
            {l.ativo && (
              <Botao variante="secundario" onClick={() => setModal('mover')}>
                <MapPinned className="size-4" aria-hidden />
                Mover de área
              </Botao>
            )}
            {l.ativo ? (
              <Botao variante="secundario" onClick={() => setModal('encerrar')}>
                <Power className="size-4" aria-hidden />
                Encerrar
              </Botao>
            ) : (
              <Botao
                variante="secundario"
                carregando={reabrir.isPending}
                onClick={() =>
                  reabrir.mutate(
                    { id: l.id },
                    {
                      onSuccess: () => notificar('Lote reaberto.', 'sucesso'),
                      onError: (e) => notificar(mensagemDeErro(e), 'perigo'),
                    },
                  )
                }
              >
                Reabrir
              </Botao>
            )}
          </>
        }
      />

      <Cartao>
        <CartaoConteudo>
          <ListaDados
            itens={[
              { rotulo: 'Área atual', valor: l.area?.nome ?? 'Sem área definida' },
              { rotulo: 'Formação', valor: formatarData(l.dataFormacao) },
              {
                rotulo: 'Encerramento',
                valor: l.dataEncerramento ? formatarData(l.dataEncerramento) : null,
              },
              { rotulo: 'Observações', valor: l.observacoes },
            ]}
          />
        </CartaoConteudo>
      </Cartao>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Animais no lote</h3>
          <Botao
            variante="secundario"
            disabled={escolhidos.length === 0}
            onClick={() => setModal('transferir')}
          >
            <ArrowRightLeft className="size-4" aria-hidden />
            Transferir selecionados{escolhidos.length > 0 ? ` (${escolhidos.length})` : ''}
          </Botao>
        </div>
        <TabelaAnimais
          animais={listaAnimais}
          selecionados={selecionados}
          aoSelecionar={setSelecionados}
          mostrarLote={false}
          vazio="Nenhum animal ativo neste lote."
        />
      </section>

      <EvolucaoDoLote loteId={l.id} />

      {l.movimentacoesArea.length > 0 && (
        <Cartao>
          <CartaoConteudo className="flex flex-col gap-3">
            <CartaoTitulo>Histórico de locais</CartaoTitulo>
            <ul className="flex flex-col gap-2 text-sm">
              {l.movimentacoesArea.map((m) => (
                <li key={m.id} className="flex flex-wrap gap-2">
                  <span className="w-24 text-texto-suave">{formatarData(m.data)}</span>
                  <span>
                    {m.areaOrigem?.nome ?? 'Sem área'} → {m.areaDestino?.nome ?? 'Sem área'}
                  </span>
                  {m.observacao && <span className="text-texto-suave">· {m.observacao}</span>}
                </li>
              ))}
            </ul>
          </CartaoConteudo>
        </Cartao>
      )}

      {modal === 'editar' && (
        <ModalLote propriedadeId={l.propriedadeId} lote={l} aoFechar={() => setModal(null)} />
      )}
      {modal === 'mover' && <ModalMoverArea lote={l} aoFechar={() => setModal(null)} />}
      {modal === 'encerrar' && <ModalEncerrarLote lote={l} aoFechar={() => setModal(null)} />}
      {modal === 'transferir' && (
        <ModalTransferencia
          propriedadeId={l.propriedadeId}
          animais={escolhidos}
          loteAtualId={l.id}
          aoFechar={() => setModal(null)}
          aoConcluir={() => setSelecionados(new Set())}
        />
      )}
    </div>
  );
}
