import { useState } from 'react';
import { Link } from 'react-router';
import { formatarCentavos, gerarUuidV7 } from '@pecuaria/domain';
import type { AnimalDetalhe, CustoAnterior } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { Cartao, CartaoConteudo, CartaoTitulo } from '../../components/ui/cartao';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { useCustoDoAnimal } from '../../lib/consultas-negociacao';
import { useLotes } from '../../lib/consultas-rebanho';
import { formatarData, hojeIso } from '../../lib/formatar-rebanho';
import { moeda } from '../../textos-financeiro';
import { situacoesAquisicao, situacoesFormacao, textoCusteioAnimal } from '../../textos-negociacao';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import { GradeIndicadores, Indicador } from './blocos';

const estadosApuracao = {
  completa: 'Completa',
  parcial: 'Parcial (no mínimo)',
  desconhecida: 'Desconhecida',
  nao_apurada: 'Não apurada',
} as const;

/** Registro de custo anterior ao sistema (D-G), por animal ou por lote. */
export function ModalCustoAnterior({
  propriedadeId,
  animalId,
  loteIdInicial,
  aoFechar,
}: {
  propriedadeId: string;
  /** Quando informado, o destino é este animal e não há escolha. */
  animalId?: string;
  loteIdInicial?: string;
  aoFechar: () => void;
}) {
  const registrar = useAcaoFinanceiro('custoAnterior:registrar');
  const lotes = useLotes(propriedadeId);
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [tipo, setTipo] = useState<'animal' | 'lote'>(animalId ? 'animal' : 'lote');
  const [loteId, setLoteId] = useState(loteIdInicial ?? '');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeIso());
  const [descricao, setDescricao] = useState('');
  const [origem, setOrigem] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [rateio, setRateio] = useState(false);
  const [semDuplicidade, setSemDuplicidade] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      largura="lg"
      titulo="Informar custo anterior ao sistema"
      descricao="Valor que o animal ou o lote já acumulou antes do uso do sistema. É informado por você, não vira lançamento, parcela nem pagamento e não aparece no caixa."
      aoFechar={aoFechar}
      textoEnviar="Registrar custo anterior"
      enviando={registrar.isPending}
      erros={erros}
      aoEnviar={() => {
        const { centavos, erro } = centavosDoTexto(valor);
        if (erro || centavos === null || centavos <= 0)
          return setErros([erro ?? 'Informe um valor maior que zero.']);
        if (tipo === 'lote' && !loteId) return setErros(['Escolha o lote.']);
        registrar.mutate(
          {
            requisicaoId,
            propriedadeId,
            destino:
              tipo === 'animal' && animalId
                ? { tipo: 'animal', animalId }
                : { tipo: 'lote', loteId, confirmarRateioIgual: rateio },
            valorCentavos: centavos,
            dataReferencia: data,
            descricao,
            origemInformacao: origem,
            justificativa,
            confirmarSemDuplicidade: semDuplicidade,
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      {!animalId && (
        <Campo rotulo="Destino">
          {(p) => (
            <Selecao
              {...p}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'animal' | 'lote')}
            >
              <option value="lote">Lote (dividido entre os animais que estavam nele)</option>
            </Selecao>
          )}
        </Campo>
      )}
      {tipo === 'lote' && (
        <>
          <Campo rotulo="Lote" obrigatorio>
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
          <CaixaMarcar
            rotulo="Confirmo o rateio igualitário: o valor será dividido por igual entre os animais que estavam no lote na data de referência"
            marcado={rateio}
            aoMudar={setRateio}
          />
        </>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoDinheiro rotulo="Valor acumulado" valor={valor} aoMudar={setValor} obrigatorio />
        <Campo rotulo="Data de referência" obrigatorio ajuda="Até quando o valor foi acumulado.">
          {(p) => (
            <Entrada {...p} type="date" value={data} onChange={(e) => setData(e.target.value)} />
          )}
        </Campo>
      </div>
      <Campo rotulo="Descrição" obrigatorio>
        {(p) => (
          <Entrada
            {...p}
            maxLength={200}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        )}
      </Campo>
      <Campo
        rotulo="Origem da informação"
        obrigatorio
        ajuda="Ex.: caderno de campo, nota antiga, planilha anterior."
      >
        {(p) => (
          <Entrada
            {...p}
            maxLength={200}
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
          />
        )}
      </Campo>
      <Campo rotulo="Justificativa" obrigatorio>
        {(p) => (
          <Entrada
            {...p}
            maxLength={500}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
          />
        )}
      </Campo>
      <CaixaMarcar
        rotulo="Confirmo que este valor não repete custos já registrados no sistema para o mesmo destino"
        marcado={semDuplicidade}
        aoMudar={setSemDuplicidade}
      />
    </Modal>
  );
}

function ListaCustosAnteriores({ itens, animalId }: { itens: CustoAnterior[]; animalId: string }) {
  const cancelar = useAcaoFinanceiro('custoAnterior:cancelar');
  const [alvo, setAlvo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  if (itens.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="custos-anteriores">
      <h4 className="font-medium">Custos anteriores informados</h4>
      <ul className="flex flex-col gap-2">
        {itens.map((c) => {
          const parte = c.itens.find((i) => i.animalId === animalId);
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-borda px-3 py-2"
            >
              <span>
                {c.descricao} · {formatarData(c.dataReferencia)} · origem: {c.origemInformacao}
                {c.destino === 'lote' ? ` · rateio do lote ${c.lote?.nome ?? ''}` : ''}
              </span>
              <span className="flex items-center gap-3">
                <strong>{moeda(parte?.valorCentavos ?? c.valorCentavos)}</strong>
                <button
                  type="button"
                  className="text-perigo hover:underline"
                  onClick={() => setAlvo(c.id)}
                >
                  Cancelar
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {alvo && (
        <Modal
          aberto
          titulo="Cancelar custo anterior"
          descricao="O registro continua guardado, marcado como cancelado, e deixa de entrar no custo."
          aoFechar={() => setAlvo(null)}
          textoEnviar="Cancelar custo anterior"
          perigoso
          enviando={cancelar.isPending}
          erros={erros}
          aoEnviar={() => {
            if (!motivo.trim()) return setErros(['Informe o motivo.']);
            cancelar.mutate(
              { id: alvo, motivo },
              { onSuccess: () => setAlvo(null), onError: (e) => setErros([mensagemDeErro(e)]) },
            );
          }}
        >
          <Campo rotulo="Motivo" obrigatorio>
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
      )}
    </div>
  );
}

/** Aba "Custo" do animal: aquisição, formação, custo anterior e acessórios, com o estado de apuração. */
export function CustoDoAnimalAba({ animal }: { animal: AnimalDetalhe }) {
  const consulta = useCustoDoAnimal(animal.id);
  const [informar, setInformar] = useState(false);
  const c = consulta.data;
  if (consulta.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />;
  if (!c) return <p className="text-sm text-texto-suave">Carregando o custo…</p>;
  const origemRegistrada = c.aquisicao.negociacao;
  return (
    <div className="flex flex-col gap-4" data-testid="custo-do-animal">
      <Alerta tom="info">{textoCusteioAnimal}</Alerta>
      <p className="text-sm">
        <Link
          className="text-marca hover:underline"
          to={`/financeiro/custos?animal=${animal.id}`}
          data-testid="link-custo-completo"
        >
          Ver o custo completo e de onde veio cada valor
        </Link>{' '}
        (alimentação, sanidade, parte dos lotes e rateios).
      </p>
      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <CartaoTitulo>Custo de aquisição e de formação</CartaoTitulo>
          <GradeIndicadores>
            <Indicador
              rotulo="Custo de aquisição"
              valor={
                c.aquisicao.valorCentavos === null
                  ? 'Sem valor'
                  : formatarCentavos(c.aquisicao.valorCentavos)
              }
              dica={situacoesAquisicao[c.aquisicao.situacao]}
            />
            <Indicador
              rotulo="Custo de formação"
              valor={
                c.formacao.valorCentavos === null
                  ? 'Sem valor'
                  : formatarCentavos(c.formacao.valorCentavos)
              }
              dica={situacoesFormacao[c.formacao.situacao]}
            />
            <Indicador
              rotulo="Acessórios lançados ao animal"
              valor={
                c.acessorios.length === 0
                  ? 'Nenhum lançado'
                  : formatarCentavos(c.acessorios.reduce((s, a) => s + a.valorCentavos, 0))
              }
              dica={`${c.acessorios.length} lançamento(s)`}
            />
            <Indicador
              rotulo="Custo conhecido até aqui"
              valor={
                c.apuracao.estado === 'nao_apurada'
                  ? 'Não apurado'
                  : formatarCentavos(c.apuracao.valorConhecidoCentavos)
              }
              dica={`Apuração: ${estadosApuracao[c.apuracao.estado]}`}
              destaque={c.apuracao.estado === 'completa' ? undefined : 'alerta'}
            />
          </GradeIndicadores>
          {origemRegistrada && (
            <p className="text-sm">
              Comprado em {formatarData(origemRegistrada.data)}
              {origemRegistrada.fornecedor ? ` de ${origemRegistrada.fornecedor}` : ''}.{' '}
              <Link
                className="text-marca hover:underline"
                to={`/financeiro/animais/${origemRegistrada.id}`}
              >
                Ver a negociação
              </Link>
            </p>
          )}
          {c.venda && (
            <p className="text-sm">
              Vendido em {formatarData(c.venda.data)} (valor alocado{' '}
              {formatarCentavos(c.venda.valorAlocadoCentavos)}).{' '}
              <Link
                className="text-marca hover:underline"
                to={`/financeiro/animais/${c.venda.negociacaoId}`}
              >
                Ver a venda
              </Link>
            </p>
          )}
          <ListaCustosAnteriores itens={c.custosAnteriores} animalId={animal.id} />
          {!c.aquisicao.negociacao && (
            <div>
              <Botao variante="secundario" onClick={() => setInformar(true)}>
                Informar custo anterior
              </Botao>
            </div>
          )}
          <p className="text-xs text-texto-suave">{c.observacao}</p>
        </CartaoConteudo>
      </Cartao>
      {informar && (
        <ModalCustoAnterior
          propriedadeId={animal.propriedadeId}
          animalId={animal.id}
          aoFechar={() => setInformar(false)}
        />
      )}
    </div>
  );
}

/** Desfazer a saída de um animal (D-H), com escolha explícita do lote. */
export function ModalDesfazerSaida({
  animal,
  aoFechar,
}: {
  animal: AnimalDetalhe;
  aoFechar: () => void;
}) {
  const desfazer = useAcaoFinanceiro('animal:desfazerSaida');
  const lotes = useLotes(animal.propriedadeId);
  const [motivo, setMotivo] = useState('');
  const [destino, setDestino] = useState<'origem' | 'reabrir_origem' | 'lote' | 'sem_lote'>(
    'origem',
  );
  const [loteId, setLoteId] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      titulo={`Desfazer a saída de ${animal.identificacao}`}
      descricao="O animal volta ao rebanho. A saída não é apagada: fica registrada como cancelada, com o motivo. Se a saída foi uma venda registrada, cancele a venda no módulo Financeiro."
      aoFechar={aoFechar}
      textoEnviar="Desfazer saída"
      enviando={desfazer.isPending}
      erros={erros}
      aoEnviar={() => {
        if (!motivo.trim()) return setErros(['Informe o motivo.']);
        if (destino === 'lote' && !loteId) return setErros(['Escolha o lote de destino.']);
        desfazer.mutate(
          {
            id: animal.id,
            motivo,
            destino: destino === 'lote' ? { tipo: 'lote', loteId } : { tipo: destino },
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <Campo rotulo="Motivo" obrigatorio>
        {(p) => (
          <Entrada
            {...p}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </Campo>
      <Campo rotulo="Para onde o animal volta">
        {(p) => (
          <Selecao
            {...p}
            value={destino}
            onChange={(e) => setDestino(e.target.value as typeof destino)}
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
    </Modal>
  );
}
