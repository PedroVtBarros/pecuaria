import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatarCentavos, formatarCentavosSemSimbolo, gerarUuidV7 } from '@pecuaria/domain';
import type { CompraInsumosDetalhe, ItemDaCompra } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro, useLancamento } from '../../lib/consultas-financeiro';
import { useCompraInsumos } from '../../lib/consultas-insumos';
import { formatarData } from '../../lib/formatar-rebanho';
import {
  moeda,
  rotulosDosValores,
  situacaoDoLancamento,
  tomDaSituacao,
} from '../../textos-financeiro';
import { quantidadeEstoque } from '../../textos-estoque';
import { GradeIndicadores, Indicador } from './blocos';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import { GeradorParcelas, condicaoInicial, type EstadoCondicao } from './editor-condicao';
import { hojeIso } from '../../lib/formatar-rebanho';
import { quilosDoTexto } from './formulario-negociacao';

function ModalCorrigir({
  compra,
  item,
  aoFechar,
}: {
  compra: CompraInsumosDetalhe;
  item: ItemDaCompra;
  aoFechar: () => void;
}) {
  const corrigir = useAcaoFinanceiro('compraInsumo:corrigirItem');
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [valor, setValor] = useState(formatarCentavosSemSimbolo(item.valorCentavos));
  const [quantidade, setQuantidade] = useState(String(item.quantidade).replace('.', ','));
  const [motivo, setMotivo] = useState('');
  const [estado, setEstado] = useState<EstadoCondicao>(() => ({
    ...condicaoInicial(hojeIso()),
    tipo: 'parcelado',
  }));
  const [erros, setErros] = useState<string[]>([]);
  const novo = centavosDoTexto(valor).centavos;
  const novoTotal = novo === null ? null : compra.valorTotalCentavos + (novo - item.valorCentavos);
  const mudaTotal = novoTotal !== null && novoTotal !== compra.valorTotalCentavos;
  const aParcelar = novoTotal === null ? null : novoTotal - compra.pagoCentavos;
  const precisaParcelas =
    mudaTotal &&
    compra.condicaoPagamento !== 'nao_informada' &&
    aParcelar !== null &&
    aParcelar > 0;
  return (
    <Modal
      aberto
      largura="lg"
      titulo={`Corrigir ${item.estoqueItemNome}`}
      descricao="A correção passa ao estoque pela correção auditada: o custo médio e o custo apropriado dos consumos são recalculados, e o estoque recusa se o saldo ficaria negativo. A entrada antiga fica guardada."
      aoFechar={aoFechar}
      textoEnviar="Corrigir item"
      enviando={corrigir.isPending}
      erros={erros}
      aoEnviar={() => {
        const q = quilosDoTexto(quantidade);
        if (novo === null || q === null || Number.isNaN(q) || q <= 0)
          return setErros(['Informe valor e quantidade válidos.']);
        if (!motivo.trim()) return setErros(['Informe o motivo da correção.']);
        const parcelas = precisaParcelas
          ? estado.parcelas.map((p) => ({
              vencimento: p.vencimento,
              valorCentavos: centavosDoTexto(p.valor).centavos ?? 0,
            }))
          : [];
        corrigir.mutate(
          {
            itemId: item.id,
            requisicaoId,
            valorCentavos: novo,
            quantidade: q,
            novasParcelas: parcelas,
            motivo,
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoDinheiro rotulo="Valor do item" valor={valor} aoMudar={setValor} obrigatorio />
        <Campo rotulo={`Quantidade (${item.unidadeBase})`} obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          )}
        </Campo>
      </div>
      <p className="text-sm text-texto-suave" data-testid="resumo-correcao">
        Total da compra: {formatarCentavos(compra.valorTotalCentavos)} →{' '}
        <strong>{novoTotal === null ? '—' : formatarCentavos(novoTotal)}</strong>
        {compra.pagoCentavos > 0 ? ` (já pago: ${formatarCentavos(compra.pagoCentavos)})` : ''}
      </p>
      {precisaParcelas && aParcelar !== null && (
        <GeradorParcelas
          estado={estado}
          aoMudar={setEstado}
          totalCentavos={aParcelar}
          minimoParcelas={1}
        />
      )}
      <Campo rotulo="Motivo da correção" obrigatorio>
        {(p) => (
          <Entrada
            {...p}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

function ModalCancelar({
  compra,
  aoFechar,
}: {
  compra: CompraInsumosDetalhe;
  aoFechar: () => void;
}) {
  const cancelar = useAcaoFinanceiro('compraInsumo:cancelar');
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      titulo="Cancelar compra de insumos"
      descricao="Cancela as entradas de estoque ligadas e o lançamento. Nada é apagado. O estoque recusa se o saldo ficaria negativo (insumo já consumido). Pagamentos precisam ser estornados antes."
      aoFechar={aoFechar}
      textoEnviar="Cancelar compra"
      perigoso
      enviando={cancelar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (!motivo.trim()) return setErros(['Informe o motivo.']);
        cancelar.mutate(
          { lancamentoId: compra.lancamentoId, motivo },
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
    </Modal>
  );
}

export function PaginaCompraInsumos() {
  const { id = '' } = useParams();
  const consulta = useCompraInsumos(id);
  const lancamento = useLancamento(id);
  const [corrigindo, setCorrigindo] = useState<ItemDaCompra | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const c = consulta.data;
  if (consulta.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />;
  if (!c) return <p className="text-sm text-texto-suave">Carregando a compra…</p>;
  const r = rotulosDosValores('despesa');
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo={c.descricao}
        descricao={`${formatarData(c.data)}${c.pessoaNome ? ` · ${c.pessoaNome}` : ''}${c.documentoNumero ? ` · Doc. ${c.documentoNumero}` : ''}`}
        voltar={{ para: '/financeiro/insumos', rotulo: 'Compras de insumos' }}
        selo={
          c.cancelada ? (
            <Selo>Cancelada</Selo>
          ) : (
            <Selo tom={tomDaSituacao[c.situacaoFinanceira]}>
              {situacaoDoLancamento(c.situacaoFinanceira, 'despesa')}
            </Selo>
          )
        }
        acoes={
          <>
            <Link to={`/financeiro/lancamentos/${c.lancamentoId}`}>
              <Botao variante="secundario">Abrir lançamento financeiro</Botao>
            </Link>
            {!c.cancelada && (
              <Botao variante="secundario" onClick={() => setCancelando(true)}>
                Cancelar compra
              </Botao>
            )}
          </>
        }
      />
      {c.cancelada && (
        <Alerta tom="alerta" titulo="Compra cancelada">
          {lancamento.data?.motivoCancelamento ?? 'As entradas de estoque foram canceladas.'} O
          registro e a trilha continuam no banco.
        </Alerta>
      )}
      {c.origem === 'manual' && (
        <Alerta tom="info">
          Lançamento criado antes e ligado depois às entradas de estoque. Valor da operação e soma
          dos itens podem diferir (frete, por exemplo): a diferença não é lançada sozinha.
        </Alerta>
      )}
      <GradeIndicadores testId="valores-compra-insumos">
        <Indicador rotulo={r.operacao} valor={moeda(c.valorTotalCentavos)} />
        <Indicador rotulo={r.saldo} valor={moeda(c.saldoEmAbertoCentavos)} />
        <Indicador rotulo={r.efetivo} valor={moeda(c.pagoCentavos)} />
        <Indicador
          rotulo="Soma dos itens (custo de entrada)"
          valor={moeda(c.somaItensCentavos)}
          dica={
            c.diferencaCentavos !== 0
              ? `Diferença com a operação: ${moeda(c.diferencaCentavos)}`
              : 'Confere com a operação'
          }
          destaque={c.diferencaCentavos !== 0 ? 'alerta' : undefined}
        />
      </GradeIndicadores>
      <Tabela data-testid="tabela-itens-compra">
        <Cabeca>
          <Th>Item de estoque</Th>
          <Th className="text-right">Quantidade</Th>
          <Th className="text-right">Custo de entrada</Th>
          <Th>
            <span className="sr-only">Ações</span>
          </Th>
        </Cabeca>
        <tbody>
          {c.itens.map((i) => (
            <Linha key={i.id} className={i.cancelado ? 'opacity-60' : undefined}>
              <Td>
                <Link
                  className="font-medium text-marca hover:underline"
                  to={`/estoque/itens/${i.estoqueItemId}`}
                >
                  {i.estoqueItemNome}
                </Link>
                {i.cancelado && <span className="ml-2 text-xs text-texto-suave">(cancelado)</span>}
              </Td>
              <Td className="text-right whitespace-nowrap">
                {quantidadeEstoque(i.quantidade, i.unidadeBase)}
              </Td>
              <Td className="text-right whitespace-nowrap">{moeda(i.valorCentavos)}</Td>
              <Td className="text-right">
                {!c.cancelada && !i.cancelado && (
                  <Botao variante="secundario" tamanho="pequeno" onClick={() => setCorrigindo(i)}>
                    Corrigir
                  </Botao>
                )}
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
      {corrigindo && (
        <ModalCorrigir compra={c} item={corrigindo} aoFechar={() => setCorrigindo(null)} />
      )}
      {cancelando && <ModalCancelar compra={c} aoFechar={() => setCancelando(false)} />}
    </div>
  );
}
