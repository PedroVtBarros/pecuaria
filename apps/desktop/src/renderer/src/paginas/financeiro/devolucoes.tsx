import { useState } from 'react';
import { Link } from 'react-router';
import { formatarCentavos, formatarCentavosSemSimbolo } from '@pecuaria/domain';
import type {
  DevolucaoDetalhe,
  NegociacaoDetalhe,
  PrevisaoDevolucao,
} from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { chamarApi, mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { useLotes } from '../../lib/consultas-rebanho';
import { formatarData, hojeIso } from '../../lib/formatar-rebanho';
import { moeda, situacaoDoLancamento, tomDaSituacao } from '../../textos-financeiro';
import { textosDevolucao as t } from '../../textos-devolucao';
import { GradeIndicadores, Indicador } from './blocos';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import { EditorCondicao, condicaoInicial, converterCondicao } from './editor-condicao';

/**
 * Registro da devolução: o usuário escolhe os animais e digita o valor acordado de cada um (o
 * valor original aparece como sugestão e só é usado se ele clicar). A prévia mostra o que será
 * compensado e o restante; o restante recebe a condição de pagamento.
 */
export function ModalDevolucao({
  negociacao,
  aoFechar,
}: {
  negociacao: NegociacaoDetalhe;
  aoFechar: () => void;
}) {
  const venda = negociacao.tipo === 'venda';
  const textos = venda ? t.venda : t.compra;
  const disponiveis = negociacao.itens.filter((i) => !i.cancelado && !i.devolucao);
  const lotes = useLotes(negociacao.propriedadeId);
  const registrar = useAcaoFinanceiro('devolucao:registrar');
  const [data, setData] = useState(hojeIso());
  const [valores, setValores] = useState<Record<string, string>>({});
  const [loteRetornoId, setLoteRetornoId] = useState('');
  const [condicao, setCondicao] = useState(condicaoInicial(hojeIso()));
  const [previa, setPrevia] = useState<PrevisaoDevolucao | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [requisicaoId] = useState(() => crypto.randomUUID());

  const escolhidos = Object.keys(valores);
  const mudar = (f: () => void) => {
    f();
    setPrevia(null);
  };
  const montarItens = ():
    | { itens: { negociacaoItemId: string; valorCentavos: number }[] }
    | {
        erro: string;
      } => {
    if (escolhidos.length === 0) return { erro: t.semAnimal };
    const itens: { negociacaoItemId: string; valorCentavos: number }[] = [];
    for (const id of escolhidos) {
      const { centavos, erro } = centavosDoTexto(valores[id] ?? '');
      if (erro || centavos === null || centavos <= 0) return { erro: t.semValor };
      itens.push({ negociacaoItemId: id, valorCentavos: centavos });
    }
    return { itens };
  };
  const base = () => {
    const m = montarItens();
    if ('erro' in m) return { erro: m.erro };
    return {
      dados: {
        negociacaoId: negociacao.id,
        data,
        itens: m.itens,
        loteRetornoId: venda && loteRetornoId ? loteRetornoId : null,
      },
    };
  };
  async function calcular() {
    const b = base();
    if ('erro' in b) return setErros([b.erro ?? t.semValor]);
    setCalculando(true);
    setErros([]);
    try {
      setPrevia(await chamarApi('devolucao:prever', b.dados));
    } catch (e) {
      setPrevia(null);
      setErros([mensagemDeErro(e)]);
    } finally {
      setCalculando(false);
    }
  }
  function enviar() {
    const b = base();
    if ('erro' in b) return setErros([b.erro ?? t.semValor]);
    if (!previa) return setErros([t.semPrevia]);
    const restante = previa.restanteCentavos;
    const c =
      restante === 0
        ? { condicao: { tipo: 'nao_informada' as const }, erros: [] }
        : converterCondicao(condicao, restante, previa.compensadoCentavos === 0);
    if (!c.condicao) return setErros(c.erros);
    registrar.mutate(
      {
        requisicaoId,
        ...b.dados,
        condicaoRestante: c.condicao,
        observacoes: null,
      },
      { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
    );
  }
  return (
    <Modal
      aberto
      largura="lg"
      titulo={textos.titulo}
      descricao={textos.descricao}
      aoFechar={aoFechar}
      textoEnviar={t.registrar}
      enviando={registrar.isPending}
      erros={erros}
      aoEnviar={enviar}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Data da devolução" obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={data}
              onChange={(e) => mudar(() => setData(e.target.value))}
            />
          )}
        </Campo>
        {venda && (
          <Campo rotulo={t.loteRetorno}>
            {(p) => (
              <Selecao
                {...p}
                value={loteRetornoId}
                onChange={(e) => mudar(() => setLoteRetornoId(e.target.value))}
              >
                <option value="">{t.semLote}</option>
                {(lotes.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        )}
      </div>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda p-4">
        <legend className="px-1 text-sm font-medium">Animais devolvidos</legend>
        {disponiveis.length === 0 && (
          <p className="text-sm text-texto-suave">Todos os animais já foram devolvidos.</p>
        )}
        {disponiveis.map((i) => {
          const marcado = i.id in valores;
          return (
            <div
              key={i.id}
              className="flex flex-col gap-2"
              data-testid={`devolver-${i.animalIdentificacao}`}
            >
              <CaixaMarcar
                rotulo={`${i.animalIdentificacao} (valor original ${formatarCentavos(i.valorAlocadoCentavos)})`}
                marcado={marcado}
                aoMudar={(m) =>
                  mudar(() =>
                    setValores((v) => {
                      const novo = { ...v };
                      if (m) novo[i.id] = '';
                      else delete novo[i.id];
                      return novo;
                    }),
                  )
                }
              />
              {marcado && (
                <div className="flex flex-wrap items-end gap-2 pl-6">
                  <CampoDinheiro
                    rotulo={t.valorAcordado(i.animalIdentificacao)}
                    obrigatorio
                    valor={valores[i.id] ?? ''}
                    ajuda={t.sugestao(formatarCentavos(i.valorAlocadoCentavos))}
                    aoMudar={(texto) => mudar(() => setValores((v) => ({ ...v, [i.id]: texto })))}
                  />
                  <Botao
                    variante="secundario"
                    onClick={() =>
                      mudar(() =>
                        setValores((v) => ({
                          ...v,
                          [i.id]: formatarCentavosSemSimbolo(i.valorAlocadoCentavos),
                        })),
                      )
                    }
                  >
                    {t.usarOriginal}
                  </Botao>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
      <div>
        <Botao variante="secundario" carregando={calculando} onClick={() => void calcular()}>
          {t.calcular}
        </Botao>
      </div>
      {previa && (
        <div className="flex flex-col gap-3" data-testid="previa-devolucao">
          <GradeIndicadores>
            <Indicador rotulo={t.rotulos.acordado} valor={moeda(previa.valorTotalCentavos)} />
            <Indicador rotulo={t.rotulos.original} valor={moeda(previa.originalCentavos)} />
            <Indicador
              rotulo={t.rotulos.diferenca}
              valor={moeda(previa.diferencaDoOriginalCentavos)}
            />
            <Indicador
              rotulo={t.rotulos.emAberto}
              valor={moeda(previa.emAbertoNaOriginalCentavos)}
            />
            <Indicador
              rotulo={t.rotulos.liquidado}
              valor={moeda(previa.liquidadoNaOriginalCentavos)}
            />
            <Indicador rotulo={t.rotulos.compensado} valor={moeda(previa.compensadoCentavos)} />
            <Indicador rotulo={textos.restante} valor={moeda(previa.restanteCentavos)} />
          </GradeIndicadores>
          {previa.avisos.map((a) => (
            <Alerta key={a} tom="info">
              {a}
            </Alerta>
          ))}
          {previa.restanteCentavos > 0 && (
            <>
              <p className="text-xs text-texto-suave">{textos.restanteAjuda}</p>
              <EditorCondicao
                estado={condicao}
                aoMudar={setCondicao}
                totalCentavos={previa.restanteCentavos}
                natureza={venda ? 'despesa' : 'receita'}
                permitirNaoInformada={previa.compensadoCentavos === 0}
              />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function ModalCancelarDevolucao({
  devolucao,
  aoFechar,
}: {
  devolucao: DevolucaoDetalhe;
  aoFechar: () => void;
}) {
  const cancelar = useAcaoFinanceiro('devolucao:cancelar');
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      titulo={t.cancelar}
      descricao={t.cancelarDescricao}
      aoFechar={aoFechar}
      textoEnviar={t.cancelar}
      perigoso
      enviando={cancelar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (!motivo.trim()) return setErros(['Informe o motivo do cancelamento.']);
        cancelar.mutate(
          { id: devolucao.id, motivo },
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

/** Lista das devoluções da negociação, com compensado, restante e situação, separados. */
export function SecaoDevolucoes({ negociacao }: { negociacao: NegociacaoDetalhe }) {
  const [cancelando, setCancelando] = useState<DevolucaoDetalhe | null>(null);
  const natureza = negociacao.tipo === 'venda' ? 'despesa' : 'receita';
  return (
    <section className="flex min-w-0 flex-col gap-3" data-testid="secao-devolucoes">
      <h3 className="text-base font-semibold">{t.secao}</h3>
      {negociacao.devolucoes.length === 0 ? (
        <p className="text-sm text-texto-suave">{t.nenhuma}</p>
      ) : (
        <Tabela>
          <Cabeca>
            <Th>Data</Th>
            <Th>Animais</Th>
            <Th className="text-right">{t.rotulos.acordado}</Th>
            <Th className="text-right">{t.rotulos.compensado}</Th>
            <Th className="text-right">{t.rotulos.restante}</Th>
            <Th className="text-right">Restante em aberto</Th>
            <Th>Situação</Th>
            <Th />
          </Cabeca>
          <tbody>
            {negociacao.devolucoes.map((d) => (
              <Linha key={d.id} className={d.cancelada ? 'opacity-60' : undefined}>
                <Td className="whitespace-nowrap">{formatarData(d.data)}</Td>
                <Td>{d.itens.map((i) => i.animalIdentificacao).join(', ')}</Td>
                <Td className="text-right whitespace-nowrap">{moeda(d.valorTotalCentavos)}</Td>
                <Td className="text-right whitespace-nowrap">{moeda(d.compensadoCentavos)}</Td>
                <Td className="text-right whitespace-nowrap">{moeda(d.restanteCentavos)}</Td>
                <Td className="text-right whitespace-nowrap">
                  {d.restanteEmAbertoCentavos === null
                    ? 'A definir'
                    : moeda(d.restanteEmAbertoCentavos)}
                </Td>
                <Td>
                  {d.cancelada ? (
                    <Selo>Cancelada</Selo>
                  ) : (
                    <Selo tom={tomDaSituacao[d.situacaoFinanceira]}>
                      {situacaoDoLancamento(d.situacaoFinanceira, natureza, d.compensadoCentavos)}
                    </Selo>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  <Link
                    className="text-sm text-marca hover:underline"
                    to={`/financeiro/lancamentos/${d.lancamentoId}`}
                  >
                    Lançamento
                  </Link>
                  {!d.cancelada && (
                    <Botao variante="fantasma" className="ml-2" onClick={() => setCancelando(d)}>
                      {t.cancelar}
                    </Botao>
                  )}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {cancelando && (
        <ModalCancelarDevolucao devolucao={cancelando} aoFechar={() => setCancelando(null)} />
      )}
    </section>
  );
}
