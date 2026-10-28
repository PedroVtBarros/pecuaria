import { useMemo, useState } from 'react';
import { formatarCentavos, formatarCentavosSemSimbolo, gerarUuidV7 } from '@pecuaria/domain';
import type { LancamentoDetalhe, ParcelaFinanceira } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Campo, Entrada } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { formatarData, hojeIso } from '../../lib/formatar-rebanho';
import { rotulosDosValores } from '../../textos-financeiro';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import {
  EditorCondicao,
  GeradorParcelas,
  condicaoInicial,
  converterCondicao,
  type EstadoCondicao,
} from './editor-condicao';

/** Registro de um pagamento (ou recebimento) de uma parcela, em data realizada. */
export function ModalPagamento({
  lancamento,
  parcela,
  aoFechar,
}: {
  lancamento: LancamentoDetalhe;
  parcela: ParcelaFinanceira;
  aoFechar: () => void;
}) {
  const registrar = useAcaoFinanceiro('pagamento:registrar');
  const recebimento = lancamento.natureza === 'receita';
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [data, setData] = useState(() => hojeIso());
  const [valor, setValor] = useState(formatarCentavosSemSimbolo(parcela.saldoCentavos));
  const [forma, setForma] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const { centavos, erro } = centavosDoTexto(valor);
  return (
    <Modal
      aberto
      titulo={`Registrar ${recebimento ? 'recebimento' : 'pagamento'} da parcela ${parcela.numero}`}
      descricao={`Saldo da parcela: ${formatarCentavos(parcela.saldoCentavos)}, com vencimento em ${formatarData(parcela.vencimento)}. O ${recebimento ? 'recebimento' : 'pagamento'} pode ser parcial.`}
      aoFechar={aoFechar}
      textoEnviar={recebimento ? 'Registrar recebimento' : 'Registrar pagamento'}
      enviando={registrar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (erro || centavos === null || centavos <= 0)
          return setErros([erro ?? 'Informe um valor maior que zero.']);
        if (centavos > parcela.saldoCentavos)
          return setErros([
            `O valor excede o saldo da parcela (${formatarCentavos(parcela.saldoCentavos)}).`,
          ]);
        if (!data) return setErros(['Informe a data.']);
        registrar.mutate(
          {
            parcelaId: parcela.id,
            requisicaoId,
            dados: {
              data,
              valorCentavos: centavos,
              forma: forma.trim() || null,
              observacao: observacao.trim() || null,
            },
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <CampoDinheiro rotulo="Valor" valor={valor} aoMudar={setValor} obrigatorio />
      <Campo
        rotulo={`Data do ${recebimento ? 'recebimento' : 'pagamento'}`}
        obrigatorio
        ajuda="Data em que o dinheiro realmente saiu ou entrou. Não pode ser futura."
      >
        {(p) => (
          <Entrada {...p} type="date" value={data} onChange={(e) => setData(e.target.value)} />
        )}
      </Campo>
      <Campo rotulo="Forma (opcional)">
        {(p) => (
          <Entrada {...p} maxLength={40} value={forma} onChange={(e) => setForma(e.target.value)} />
        )}
      </Campo>
      <Campo rotulo="Observação (opcional)">
        {(p) => (
          <Entrada
            {...p}
            maxLength={500}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

/** Define a condição de um lançamento que estava pendente de definição financeira. */
export function ModalDefinirPagamento({
  lancamento,
  aoFechar,
}: {
  lancamento: LancamentoDetalhe;
  aoFechar: () => void;
}) {
  const definir = useAcaoFinanceiro('lancamento:definirPagamento');
  const [estado, setEstado] = useState<EstadoCondicao>(() => condicaoInicial(hojeIso()));
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      largura="lg"
      titulo="Definir condição de pagamento"
      descricao={`Valor da operação: ${formatarCentavos(lancamento.valorOperacaoCentavos)}. Nenhum pagamento é registrado sem a sua confirmação.`}
      aoFechar={aoFechar}
      textoEnviar="Definir condição"
      enviando={definir.isPending}
      erros={erros}
      aoEnviar={() => {
        const c = converterCondicao(estado, lancamento.valorOperacaoCentavos, false);
        if (!c.condicao || c.condicao.tipo === 'nao_informada') return setErros(c.erros);
        definir.mutate(
          { id: lancamento.id, condicao: c.condicao },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <EditorCondicao
        estado={estado}
        aoMudar={setEstado}
        totalCentavos={lancamento.valorOperacaoCentavos}
        natureza={lancamento.natureza}
        permitirNaoInformada={false}
      />
    </Modal>
  );
}

/** Renegociação do que ainda está em aberto; pagamentos já feitos nunca mudam. */
export function ModalRenegociar({
  lancamento,
  aoFechar,
}: {
  lancamento: LancamentoDetalhe;
  aoFechar: () => void;
}) {
  const renegociar = useAcaoFinanceiro('lancamento:renegociar');
  const r = rotulosDosValores(lancamento.natureza);
  const [alterarTotal, setAlterarTotal] = useState(false);
  const [total, setTotal] = useState(formatarCentavosSemSimbolo(lancamento.valorOperacaoCentavos));
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const [estado, setEstado] = useState<EstadoCondicao>(() => ({
    ...condicaoInicial(hojeIso()),
    tipo: 'parcelado',
  }));
  const totalNovo = alterarTotal
    ? centavosDoTexto(total).centavos
    : lancamento.valorOperacaoCentavos;
  const aParcelar = useMemo(
    () => (totalNovo === null ? null : totalNovo - lancamento.pagoCentavos),
    [totalNovo, lancamento.pagoCentavos],
  );
  return (
    <Modal
      aberto
      largura="lg"
      titulo="Renegociar parcelas em aberto"
      descricao={`Parcelas sem ${r.efetivo.toLowerCase()} são substituídas; parcela parcialmente paga é encerrada no valor já ${r.efetivo.toLowerCase()} e o saldo vai para as novas. Os pagamentos registrados não mudam.`}
      aoFechar={aoFechar}
      textoEnviar="Renegociar"
      enviando={renegociar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (!motivo.trim()) return setErros(['Informe o motivo da renegociação.']);
        if (aParcelar === null) return setErros(['Informe o novo valor total.']);
        if (aParcelar < 0)
          return setErros([
            `O novo total não pode ser menor do que o valor já ${r.efetivo.toLowerCase()}.`,
          ]);
        const itens = estado.parcelas.map((p) => ({
          vencimento: p.vencimento,
          valorCentavos: centavosDoTexto(p.valor).centavos ?? 0,
        }));
        renegociar.mutate(
          {
            id: lancamento.id,
            novasParcelas: aParcelar === 0 ? [] : itens,
            novoTotalCentavos: alterarTotal ? totalNovo : null,
            motivo,
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <dl className="grid grid-cols-3 gap-3 text-sm" data-testid="resumo-renegociacao">
        <div>
          <dt className="text-texto-suave">{r.operacao}</dt>
          <dd className="font-medium">{formatarCentavos(lancamento.valorOperacaoCentavos)}</dd>
        </div>
        <div>
          <dt className="text-texto-suave">{r.efetivo}</dt>
          <dd className="font-medium">{formatarCentavos(lancamento.pagoCentavos)}</dd>
        </div>
        <div>
          <dt className="text-texto-suave">Saldo a parcelar</dt>
          <dd className="font-medium">{aParcelar === null ? '—' : formatarCentavos(aParcelar)}</dd>
        </div>
      </dl>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-marca"
          checked={alterarTotal}
          onChange={(e) => setAlterarTotal(e.target.checked)}
        />
        Alterar também o valor total da operação (ex.: desconto ou acréscimo acordado)
      </label>
      {alterarTotal && <CampoDinheiro rotulo="Novo valor total" valor={total} aoMudar={setTotal} />}
      {aParcelar !== null && aParcelar > 0 ? (
        <GeradorParcelas
          estado={estado}
          aoMudar={setEstado}
          totalCentavos={aParcelar}
          minimoParcelas={1}
        />
      ) : (
        <Alerta tom="info">
          {aParcelar === 0
            ? 'Não há saldo a parcelar: o total já está pago ou recebido.'
            : 'Informe um novo total válido.'}
        </Alerta>
      )}
      <Campo rotulo="Motivo da renegociação" obrigatorio>
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
