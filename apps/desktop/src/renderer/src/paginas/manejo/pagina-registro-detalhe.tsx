import { useState } from 'react';
import { quantidadeEstoque, valorEstoque } from '../../textos-estoque';
import { Link, useNavigate, useParams } from 'react-router';
import { Pencil, Trash2, UserMinus } from 'lucide-react';
import type { AnimalDoManejo } from '@pecuaria/shared-types';
import { custoPorAnimalCentavos } from '@pecuaria/domain';
import { useAcaoRebanho, useManejo } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarData, formatarDose, formatarMoeda } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo } from '../../components/ui/cartao';
import { CabecalhoPagina, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { AvisoCarencia, ModalCorrigirManejo, ModalMotivo } from './modais-sanidade';
import { SeloSituacao } from './pagina-agenda';
import { CartaoCustoSanitario } from '../financeiro/cartao-custo-sanitario';

export function PaginaRegistroDetalhe() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const manejo = useManejo(id);
  const remover = useAcaoRebanho('manejoSanitario:removerAnimal');
  const excluir = useAcaoRebanho('manejoSanitario:excluir');
  const { notificar } = useNotificacoes();
  const [modal, setModal] = useState<
    { tipo: 'corrigir' | 'excluir' } | { tipo: 'remover'; animal: AnimalDoManejo } | null
  >(null);

  if (manejo.isError) {
    return (
      <div className="flex flex-col gap-4">
        <CabecalhoPagina
          voltar={{ para: '/manejo/sanidade', rotulo: 'Registros sanitários' }}
          titulo="Registro sanitário"
        />
        <Alerta tom="perigo" titulo={mensagemDeErro(manejo.error)} />
      </div>
    );
  }
  const m = manejo.data;
  if (!m) return null;
  const temConsumo = (m.consumosEstoque?.length ?? 0) > 0;
  const temDoseIndividual = m.animais.some((a) => a.dose !== null);
  const porAnimal =
    m.custoTotalCentavos !== null
      ? custoPorAnimalCentavos(m.custoTotalCentavos, m.quantidadeAnimais)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        voltar={{ para: '/manejo/sanidade', rotulo: 'Registros sanitários' }}
        titulo={m.produto?.nome ?? m.descricao ?? rotulos.tipoManejo[m.tipo]}
        selo={
          <Selo tom={m.abrangencia === 'coletiva' ? 'marca' : 'neutro'}>
            {m.abrangencia === 'coletiva' ? 'Aplicação coletiva' : 'Individual'}
          </Selo>
        }
        descricao={`${rotulos.tipoManejo[m.tipo]} em ${formatarData(m.data)} · ${m.quantidadeAnimais} ${m.quantidadeAnimais === 1 ? 'animal' : 'animais'}`}
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setModal({ tipo: 'corrigir' })}>
              <Pencil className="size-4" aria-hidden />
              Corrigir
            </Botao>
            <Botao
              variante="fantasma"
              aria-label="Excluir registro"
              title="Excluir registro feito por engano"
              onClick={() => setModal({ tipo: 'excluir' })}
            >
              <Trash2 className="size-4" aria-hidden />
            </Botao>
          </>
        }
      />

      <Cartao>
        <CartaoConteudo>
          <ListaDados
            itens={[
              { rotulo: 'Produto', valor: m.produto?.nome },
              { rotulo: 'Descrição', valor: m.descricao },
              { rotulo: 'Dose por animal', valor: formatarDose(m.dose, m.unidadeDose) },
              { rotulo: 'Via', valor: m.via ? rotulos.via[m.via] : null },
              {
                rotulo: 'Lote',
                valor: m.lote ? (
                  <Link to={`/rebanho/lotes/${m.lote.id}`} className="text-marca hover:underline">
                    {m.lote.nome}
                  </Link>
                ) : null,
              },
              { rotulo: 'Responsável', valor: m.responsavel },
              {
                rotulo: 'Carência para carne',
                valor:
                  m.carenciaCarneDias !== null
                    ? `${m.carenciaCarneDias} dias${m.fimCarenciaCarne ? ` · fim do prazo calculado: ${formatarData(m.fimCarenciaCarne)}` : ''}`
                    : 'Não informada',
              },
              {
                rotulo: 'Carência para leite',
                valor:
                  m.carenciaLeiteDias !== null
                    ? `${m.carenciaLeiteDias} dias${m.fimCarenciaLeite ? ` · fim do prazo calculado: ${formatarData(m.fimCarenciaLeite)}` : ''}`
                    : 'Não informada',
              },
              {
                rotulo: 'Custo',
                valor:
                  m.custoTotalCentavos !== null
                    ? `${formatarMoeda(m.custoTotalCentavos)}${porAnimal !== null && m.quantidadeAnimais > 1 ? ` (${formatarMoeda(porAnimal)} por animal)` : ''}`
                    : null,
              },
              { rotulo: 'Diagnóstico ou motivo', valor: m.diagnostico },
              { rotulo: 'Observações', valor: m.observacoes },
              {
                rotulo: 'Próxima aplicação',
                valor: m.proximaAgendada ? (
                  <span className="flex items-center gap-2">
                    {formatarData(m.proximaAgendada.dataPrevista)}
                    {m.proximaAgendada.situacao ? (
                      <SeloSituacao situacao={m.proximaAgendada.situacao} />
                    ) : (
                      <Selo>{rotulos.statusAgenda[m.proximaAgendada.status]}</Selo>
                    )}
                  </span>
                ) : null,
              },
            ]}
          />
        </CartaoConteudo>
      </Cartao>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Consumo de estoque</h3>
        {temConsumo ? (
          m.consumosEstoque?.map((c) => (
            <p key={c.id}>
              <Link className="text-marca hover:underline" to={`/estoque/itens/${c.itemId}`}>
                {quantidadeEstoque(c.quantidade, c.unidadeBase)} ·{' '}
                {valorEstoque(c.custoApropriadoCentavos)}
              </Link>
            </p>
          ))
        ) : (
          <p>Sem baixa de estoque registrada.</p>
        )}
        <p className="text-sm text-texto-suave">
          O custo apropriado do estoque é separado do custo informado no registro sanitário.
        </p>
      </section>
      <CartaoCustoSanitario manejoId={m.id} />
      {(m.fimCarenciaCarne || m.fimCarenciaLeite) && <AvisoCarencia />}

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Animais tratados</h3>
        <Tabela data-testid="tabela-animais-registro">
          <Cabeca>
            <Th>Identificação</Th>
            <Th>Nome</Th>
            {temDoseIndividual && <Th>Dose individual</Th>}
            <Th className="text-right">Ações</Th>
          </Cabeca>
          <tbody>
            {m.animais.map((a) => (
              <Linha key={a.eventoId}>
                <Td className="font-medium">
                  <Link
                    to={`/rebanho/animais/${a.animalId}`}
                    className="text-marca hover:underline"
                  >
                    {a.identificacao}
                  </Link>
                </Td>
                <Td>{a.nome ?? '—'}</Td>
                {temDoseIndividual && (
                  <Td>{a.dose !== null ? formatarDose(a.dose, m.unidadeDose) : 'Dose comum'}</Td>
                )}
                <Td>
                  <div className="flex justify-end">
                    {m.animais.length > 1 && (
                      <Botao
                        tamanho="pequeno"
                        variante="fantasma"
                        aria-label={`Retirar ${a.identificacao} do registro`}
                        title="Retirar animal registrado por engano"
                        onClick={() => setModal({ tipo: 'remover', animal: a })}
                      >
                        <UserMinus className="size-3.5" aria-hidden />
                      </Botao>
                    )}
                  </div>
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      </section>

      {modal?.tipo === 'corrigir' && (
        <ModalCorrigirManejo manejo={m} aoFechar={() => setModal(null)} />
      )}
      {modal?.tipo === 'remover' && (
        <ModalMotivo
          titulo={`Retirar ${modal.animal.identificacao} deste registro?`}
          descricao="Use quando o animal foi incluído por engano. A retirada fica no histórico dele."
          confirmacao={
            temConsumo
              ? 'Conferi: o consumo total de estoque será mantido, sem estorno proporcional. Para alterar a quantidade, usarei a correção do registro.'
              : undefined
          }
          textoEnviar="Retirar animal"
          enviando={remover.isPending}
          aoFechar={() => setModal(null)}
          aoConfirmar={(motivo, mostrarErro) =>
            remover.mutate(
              {
                manejoId: m.id,
                animalId: modal.animal.animalId,
                motivo,
                confirmarConsumoMantido: temConsumo,
              },
              {
                onSuccess: () => {
                  notificar('Animal retirado do registro.', 'sucesso');
                  setModal(null);
                },
                onError: mostrarErro,
              },
            )
          }
        />
      )}
      {modal?.tipo === 'excluir' && (
        <ModalMotivo
          titulo="Excluir este registro sanitário?"
          descricao="Use só para registros feitos por engano. Sai do histórico sanitário dos animais, mas a exclusão fica registrada. Se ele realizou um evento da agenda, o evento volta a ficar pendente."
          rotuloMotivo="Motivo da exclusão"
          confirmacao={
            temConsumo
              ? 'Conferi: estas baixas foram registradas por engano e devem ser estornadas integralmente no estoque.'
              : undefined
          }
          textoEnviar="Excluir"
          enviando={excluir.isPending}
          aoFechar={() => setModal(null)}
          aoConfirmar={(motivo, mostrarErro) =>
            excluir.mutate(
              { id: m.id, motivo, estornarEstoque: temConsumo },
              {
                onSuccess: () => {
                  notificar('Registro excluído.', 'sucesso');
                  navegar('/manejo/sanidade');
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
