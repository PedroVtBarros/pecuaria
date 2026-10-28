import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatarCentavos } from '@pecuaria/domain';
import type { NegociacaoDetalhe } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { useNegociacao } from '../../lib/consultas-negociacao';
import { useLotes } from '../../lib/consultas-rebanho';
import { formatarData } from '../../lib/formatar-rebanho';
import {
  moeda,
  rotulosDosValores,
  situacaoDoLancamento,
  tomDaSituacao,
} from '../../textos-financeiro';
import { criterios, tiposNegociacao, unidadesPreco } from '../../textos-negociacao';
import { textosDevolucao } from '../../textos-devolucao';
import { GradeIndicadores, Indicador } from './blocos';
import { ModalDevolucao, SecaoDevolucoes } from './devolucoes';

type DestinoEscolhido = 'origem' | 'reabrir_origem' | 'lote' | 'sem_lote';

function ModalCancelar({
  negociacao,
  aoFechar,
}: {
  negociacao: NegociacaoDetalhe;
  aoFechar: () => void;
}) {
  const cancelar = useAcaoFinanceiro('negociacao:cancelar');
  const lotes = useLotes(negociacao.propriedadeId);
  const [motivo, setMotivo] = useState('');
  const [destino, setDestino] = useState<DestinoEscolhido>('origem');
  const [loteId, setLoteId] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const venda = negociacao.tipo === 'venda';
  return (
    <Modal
      aberto
      titulo={`Cancelar ${venda ? 'venda' : 'compra'}`}
      descricao={
        venda
          ? 'Cancela a receita e desfaz a saída dos animais (eles voltam ao rebanho). Nada é apagado: a saída fica registrada como cancelada, com o motivo. Recebimentos precisam ser estornados antes.'
          : 'Cancela a compra e retira do cadastro os animais que ela criou, desde que nada tenha sido registrado neles depois da entrada. Nada é apagado fisicamente. Pagamentos precisam ser estornados antes.'
      }
      aoFechar={aoFechar}
      textoEnviar="Cancelar negociação"
      perigoso
      enviando={cancelar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (!motivo.trim()) return setErros(['Informe o motivo do cancelamento.']);
        if (venda && destino === 'lote' && !loteId) return setErros(['Escolha o lote de destino.']);
        cancelar.mutate(
          {
            id: negociacao.id,
            motivo,
            destino: destino === 'lote' ? { tipo: 'lote', loteId } : { tipo: destino },
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <Campo rotulo="Motivo do cancelamento" obrigatorio>
        {(p) => (
          <Entrada
            {...p}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </Campo>
      {venda && (
        <>
          <Campo
            rotulo="Para onde os animais voltam"
            ajuda="Se o lote de origem foi encerrado, escolha reabri-lo, outro lote ativo ou ficar sem lote: o sistema não decide sozinho."
          >
            {(p) => (
              <Selecao
                {...p}
                value={destino}
                onChange={(e) => setDestino(e.target.value as DestinoEscolhido)}
              >
                <option value="origem">Lote de origem (se estiver ativo)</option>
                <option value="reabrir_origem">Reabrir o lote de origem</option>
                <option value="lote">Outro lote ativo</option>
                <option value="sem_lote">Sem lote</option>
              </Selecao>
            )}
          </Campo>
          {destino === 'lote' && (
            <Campo rotulo="Lote de destino" obrigatorio>
              {(p) => (
                <Selecao {...p} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                  <option value="">Selecione</option>
                  {(lotes.data ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          )}
        </>
      )}
    </Modal>
  );
}

export function PaginaNegociacao() {
  const { id = '' } = useParams();
  const consulta = useNegociacao(id);
  const [cancelando, setCancelando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  const n = consulta.data;
  if (consulta.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />;
  if (!n) return <p className="text-sm text-texto-suave">Carregando a negociação…</p>;
  const natureza = n.tipo === 'venda' ? 'receita' : 'despesa';
  const r = rotulosDosValores(natureza);
  const ativos = n.itens.filter((i) => !i.cancelado);
  const exibidos = n.cancelada ? n.itens : ativos;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo={`${tiposNegociacao[n.tipo]} de ${n.quantidadeAnimais} animal(is)`}
        descricao={`${formatarData(n.data)}${n.pessoa ? ` · ${n.pessoa.nome}` : ''}`}
        voltar={{ para: '/financeiro/animais', rotulo: 'Compras e vendas de animais' }}
        selo={
          n.cancelada ? (
            <Selo>Cancelada</Selo>
          ) : (
            <Selo tom={tomDaSituacao[n.situacaoFinanceira]}>
              {situacaoDoLancamento(n.situacaoFinanceira, natureza, n.compensadoCentavos)}
            </Selo>
          )
        }
        acoes={
          <>
            <Link to={`/financeiro/lancamentos/${n.lancamentoId}`}>
              <Botao variante="secundario">Abrir lançamento financeiro</Botao>
            </Link>
            {!n.cancelada && n.itens.some((i) => !i.cancelado && !i.devolucao) && (
              <Botao variante="secundario" onClick={() => setDevolvendo(true)}>
                {textosDevolucao[n.tipo].botao}
              </Botao>
            )}
            {!n.cancelada && !n.devolucoes.some((d) => !d.cancelada) && (
              <Botao variante="secundario" onClick={() => setCancelando(true)}>
                Cancelar {n.tipo === 'venda' ? 'venda' : 'compra'}
              </Botao>
            )}
          </>
        }
      />
      {n.cancelada && (
        <Alerta tom="alerta" titulo="Negociação cancelada">
          Motivo: {n.motivoCancelamento}. O registro e a trilha de alterações continuam no banco.
        </Alerta>
      )}
      <GradeIndicadores testId="valores-negociacao">
        <Indicador rotulo={r.operacao} valor={moeda(n.valorTotalCentavos)} />
        <Indicador rotulo={r.saldo} valor={moeda(n.saldoEmAbertoCentavos)} />
        <Indicador rotulo={r.efetivo} valor={moeda(n.pagoCentavos)} />
        {n.compensadoCentavos > 0 && (
          <Indicador
            rotulo="Compensado em devoluções"
            valor={moeda(n.compensadoCentavos)}
            dica="Liquidado sem caixa pela devolução"
          />
        )}
        <Indicador
          rotulo="Preço negociado"
          valor={
            n.precoUnitarioCentavos === null
              ? 'Só o valor total'
              : `${formatarCentavos(n.precoUnitarioCentavos)}`
          }
          dica={unidadesPreco[n.unidadePreco]}
        />
      </GradeIndicadores>
      <p className="text-sm text-texto-suave">
        Critério de alocação: <strong>{criterios[n.criterio]}</strong>. A soma dos valores por
        animal é exatamente o valor da operação.
      </p>
      <Tabela data-testid="tabela-itens-negociacao">
        <Cabeca>
          <Th>Animal</Th>
          <Th className="text-right">Peso vivo (kg)</Th>
          <Th className="text-right">Carcaça (kg)</Th>
          <Th className="text-right">Valor alocado</Th>
          <Th>Devolução</Th>
        </Cabeca>
        <tbody>
          {exibidos.map((i) => (
            <Linha key={i.id} className={i.cancelado ? 'opacity-60' : undefined}>
              <Td>
                <Link
                  className="font-medium text-marca hover:underline"
                  to={`/rebanho/animais/${i.animalId}`}
                >
                  {i.animalIdentificacao}
                </Link>
              </Td>
              <Td className="text-right">{i.pesoVivoKg ?? '—'}</Td>
              <Td className="text-right">{i.pesoCarcacaKg ?? '—'}</Td>
              <Td className="text-right whitespace-nowrap">{moeda(i.valorAlocadoCentavos)}</Td>
              <Td className="whitespace-nowrap">
                {i.devolucao
                  ? `${formatarData(i.devolucao.data)} · ${moeda(i.devolucao.valorCentavos)}`
                  : '—'}
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
      <SecaoDevolucoes negociacao={n} />
      {cancelando && <ModalCancelar negociacao={n} aoFechar={() => setCancelando(false)} />}
      {devolvendo && <ModalDevolucao negociacao={n} aoFechar={() => setDevolvendo(false)} />}
    </div>
  );
}
