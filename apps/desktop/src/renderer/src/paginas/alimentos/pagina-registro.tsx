import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Plus } from 'lucide-react';
import { aceitaNaoQuantificado } from '@pecuaria/domain';
import type {
  DiferencaVersao,
  RegistroDetalhe,
  ValorNaoQuantificadoApi,
  ValorNutricionalApi,
  VinculoOrigemApi,
} from '@pecuaria/shared-types';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoAlimentos, useFontes, useRegistro } from '../../lib/consultas-alimentos';
import { formatarDataHora } from '../../lib/formatar';
import { formatarData } from '../../lib/formatar-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo, CartaoTitulo } from '../../components/ui/cartao';
import { CabecalhoPagina, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, LinhaVazia, Tabela, Td, Th } from '../../components/ui/tabela';
import {
  avisosAlimentos,
  basesNutricionais,
  descreverFonte,
  descreverRelacao,
  formasObtencao,
  naturezasNaoQuantificado,
  separadores,
  situacoesVinculo,
  statusRegistro,
  tiposValor,
  unidadesNutricionais,
  valorComUnidade,
  rotuloAcaoHistorico,
} from '../../textos-alimentos';
import { AvisoOrigem, ModalCampos, SeloOrigem, SeloStatus } from './componentes-alimentos';
import { ModalCabecalhoRegistro, ModalNaoQuantificado, ModalValor } from './formularios-registro';
import { SecaoAvaliacao } from './secao-avaliacao';

/** Valores do registro: sempre o texto publicado, a unidade e a base juntos. */
export function TabelaValores({
  valores,
  aoEditar,
  aoRemover,
}: {
  valores: ValorNutricionalApi[];
  aoEditar?: (v: ValorNutricionalApi) => void;
  aoRemover?: (v: ValorNutricionalApi) => void;
}) {
  const editavel = Boolean(aoEditar || aoRemover);
  return (
    <Tabela data-testid="tabela-valores">
      <Cabeca>
        <Th>Nutriente</Th>
        <Th>Valor publicado</Th>
        <Th>Tipo</Th>
        <Th>DP · mín. · máx. · n</Th>
        <Th>Método e obtenção (pela fonte)</Th>
        <Th>Observação</Th>
        {editavel && <Th>Ações</Th>}
      </Cabeca>
      <tbody>
        {valores.length === 0 && (
          <LinhaVazia colunas={editavel ? 7 : 6}>
            Nenhum valor numérico. {avisosAlimentos.ausenteExplicacao}
          </LinhaVazia>
        )}
        {valores.map((v) => (
          <Linha key={v.id}>
            <Td>
              <span className="font-medium">{v.nutriente.codigo}</span> · {v.nutriente.nome}
              {v.nutriente.situacaoFundamentacao === 'pendente' && (
                <span className="block text-xs text-alerta">Método da definição pendente</span>
              )}
            </Td>
            <Td>
              <span className="whitespace-nowrap">{valorComUnidade(v)}</span>
              {v.interpretacaoBase && (
                <span className="block text-xs text-alerta" data-testid="base-interpretada">
                  Base inferida, não declarada pela fonte
                </span>
              )}
            </Td>
            <Td>{tiposValor[v.tipoValor]}</Td>
            <Td className="text-xs">
              {[
                v.desvioPadraoPublicado && `DP ${v.desvioPadraoPublicado}`,
                v.minimoPublicado && `mín. ${v.minimoPublicado}`,
                v.maximoPublicado && `máx. ${v.maximoPublicado}`,
                v.nObservacoes !== null && `n ${v.nObservacoes}`,
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </Td>
            <Td className="text-xs">
              {v.metodoAnaliticoFonte ?? 'Não informado'}
              <span className="block text-texto-suave" data-testid="forma-obtencao">
                Obtenção: {formasObtencao[v.formaObtencao]}
                {v.descricaoObtencao && ` · ${v.descricaoObtencao}`}
              </span>
              {v.interpretacaoBase && (
                <span className="block text-texto-suave">Base: {v.interpretacaoBase}</span>
              )}
            </Td>
            <Td className="min-w-64 text-xs text-texto-suave">{v.observacao ?? '—'}</Td>
            {editavel && (
              <Td>
                <div className="flex gap-1">
                  {aoEditar && (
                    <Botao tamanho="pequeno" variante="secundario" onClick={() => aoEditar(v)}>
                      Editar
                    </Botao>
                  )}
                  {aoRemover && (
                    <Botao tamanho="pequeno" variante="fantasma" onClick={() => aoRemover(v)}>
                      Remover
                    </Botao>
                  )}
                </div>
              </Td>
            )}
          </Linha>
        ))}
      </tbody>
    </Tabela>
  );
}

/** Valores não quantificados: texto da fonte e significado segundo ela; nunca número. */
export function TabelaNaoQuantificados({
  valores,
  aoEditar,
  aoRemover,
}: {
  valores: ValorNaoQuantificadoApi[];
  aoEditar?: (v: ValorNaoQuantificadoApi) => void;
  aoRemover?: (v: ValorNaoQuantificadoApi) => void;
}) {
  const editavel = Boolean(aoEditar || aoRemover);
  return (
    <Tabela data-testid="tabela-nao-quantificados">
      <Cabeca>
        <Th>Nutriente</Th>
        <Th>Texto publicado</Th>
        <Th>Tipo</Th>
        <Th>Significado segundo a fonte</Th>
        <Th>Método informado pela fonte</Th>
        <Th>Observação</Th>
        {editavel && <Th>Ações</Th>}
      </Cabeca>
      <tbody>
        {valores.map((v) => (
          <Linha key={v.id}>
            <Td>
              <span className="font-medium">{v.nutriente.codigo}</span> · {v.nutriente.nome}
            </Td>
            <Td className="whitespace-nowrap">
              {v.textoPublicado} {unidadesNutricionais[v.unidade]} ({basesNutricionais[v.base]})
            </Td>
            <Td>{tiposValor[v.tipoValor]}</Td>
            <Td className="text-xs">
              <span className="font-medium">{naturezasNaoQuantificado[v.natureza]}</span>:{' '}
              {v.significadoFonte}
            </Td>
            <Td className="text-xs">{v.metodoAnaliticoFonte ?? 'Não informado'}</Td>
            <Td className="min-w-64 text-xs text-texto-suave">{v.observacao ?? '—'}</Td>
            {editavel && (
              <Td>
                <div className="flex gap-1">
                  {aoEditar && (
                    <Botao tamanho="pequeno" variante="secundario" onClick={() => aoEditar(v)}>
                      Editar
                    </Botao>
                  )}
                  {aoRemover && (
                    <Botao tamanho="pequeno" variante="fantasma" onClick={() => aoRemover(v)}>
                      Remover
                    </Botao>
                  )}
                </div>
              </Td>
            )}
          </Linha>
        ))}
      </tbody>
    </Tabela>
  );
}

/** Vínculos de possível mesma origem experimental, com a decisão do usuário. */
function SecaoVinculos({ d }: { d: RegistroDetalhe }) {
  const [decidindo, setDecidindo] = useState<{
    vinculo: VinculoOrigemApi;
    decisao: 'confirmado' | 'descartado';
  } | null>(null);
  const decidir = useAcaoAlimentos('vinculoOrigem:decidir');
  if (d.vinculosOrigem.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="Possível mesma origem experimental">
      <h3 className="font-semibold">Possível mesma origem experimental</h3>
      <Alerta tom="alerta" titulo={avisosAlimentos.vinculosOrigem} />
      <ul className="flex flex-col gap-3" data-testid="vinculos-origem">
        {d.vinculosOrigem.map((v) => (
          <li key={v.id} className="rounded-lg border border-borda p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{descreverRelacao(v.relacao, v.lado)}</span>
              <Selo
                tom={
                  v.situacao === 'a_confirmar'
                    ? 'alerta'
                    : v.situacao === 'confirmado'
                      ? 'sucesso'
                      : 'neutro'
                }
              >
                {situacoesVinculo[v.situacao]}
              </Selo>
            </div>
            <p className="mt-1">
              Outro registro:{' '}
              {v.outro.registroId ? (
                <Link
                  className="text-marca underline"
                  to={`/alimentos/registros/${v.outro.registroId}`}
                >
                  {v.outro.alimentoNome} · {v.outro.fonteCodigo} · {v.outro.referenciaLocal}
                </Link>
              ) : (
                <span>
                  {v.outro.fonteCodigo} · {v.outro.referenciaLocal} (ainda não importado)
                </span>
              )}
            </p>
            <p className="mt-1 text-texto-suave">Evidência: {v.evidencia}</p>
            {v.decididoPor && (
              <p className="mt-1 text-texto-suave">
                {situacoesVinculo[v.situacao]} por {v.decididoPor} em{' '}
                {formatarDataHora(v.decididoEm!)}
                {v.motivoDecisao && `: ${v.motivoDecisao}`}
              </p>
            )}
            {v.situacao === 'a_confirmar' && v.outro.registroId && (
              <div className="mt-2 flex gap-2">
                <Botao
                  tamanho="pequeno"
                  variante="secundario"
                  onClick={() => setDecidindo({ vinculo: v, decisao: 'confirmado' })}
                >
                  Confirmar mesma origem
                </Botao>
                <Botao
                  tamanho="pequeno"
                  variante="fantasma"
                  onClick={() => setDecidindo({ vinculo: v, decisao: 'descartado' })}
                >
                  Descartar vínculo
                </Botao>
              </div>
            )}
          </li>
        ))}
      </ul>
      {decidindo && (
        <ModalCampos
          titulo={
            decidindo.decisao === 'confirmado' ? 'Confirmar mesma origem' : 'Descartar vínculo'
          }
          descricao={
            decidindo.decisao === 'confirmado'
              ? 'Os dois registros continuam não independentes. A decisão não muda depois.'
              : 'Descartar devolve a independência aos dois registros. Diga como verificou que as origens são diferentes. A decisão não muda depois.'
          }
          campos={[
            { nome: 'responsavel', rotulo: 'Nome de quem decide' },
            {
              nome: 'motivo',
              rotulo: 'Motivo',
              multilinha: true,
              obrigatorio: decidindo.decisao === 'descartado',
            },
          ]}
          textoEnviar={decidindo.decisao === 'confirmado' ? 'Confirmar' : 'Descartar'}
          enviando={decidir.isPending}
          aoFechar={() => setDecidindo(null)}
          aoConfirmar={(c) =>
            decidir.mutateAsync({
              registroId: d.registro.id,
              vinculoId: decidindo.vinculo.id,
              decisao: decidindo.decisao,
              responsavel: c['responsavel']!,
              motivo: c['motivo']?.trim() ? c['motivo'] : null,
            })
          }
        />
      )}
    </section>
  );
}

/** O que mudou em relação à versão anterior, como publicado. */
function TabelaDiferencas({ diferencas }: { diferencas: DiferencaVersao[] }) {
  return (
    <Tabela data-testid="tabela-diferencas">
      <Cabeca>
        <Th>Campo</Th>
        <Th>Antes</Th>
        <Th>Agora</Th>
      </Cabeca>
      <tbody>
        {diferencas.map((x) => (
          <Linha key={x.campo}>
            <Td>{x.campo}</Td>
            <Td>{x.antes ?? '—'}</Td>
            <Td>{x.depois ?? '—'}</Td>
          </Linha>
        ))}
      </tbody>
    </Tabela>
  );
}

type Acao =
  | 'transcrever'
  | 'conferir'
  | 'rejeitar'
  | 'devolver'
  | 'reabrir'
  | 'novaVersao'
  | 'descartar'
  | 'cabecalho'
  | 'valor'
  | 'naoQuantificado';

function Detalhe({ d }: { d: RegistroDetalhe }) {
  const navegar = useNavigate();
  const r = d.registro;
  const [acao, setAcao] = useState<Acao | null>(null);
  const [valorEmEdicao, setValorEmEdicao] = useState<ValorNutricionalApi | null>(null);
  const [nqEmEdicao, setNqEmEdicao] = useState<ValorNaoQuantificadoApi | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fontes = useFontes({ propriedadeId: r.fonte.propriedadeId });
  const transcrever = useAcaoAlimentos('composicao:transcrever');
  const conferir = useAcaoAlimentos('composicao:conferir');
  const rejeitar = useAcaoAlimentos('composicao:rejeitar');
  const devolver = useAcaoAlimentos('composicao:devolver');
  const reabrir = useAcaoAlimentos('composicao:reabrir');
  const novaVersao = useAcaoAlimentos('composicao:novaVersao');
  const descartar = useAcaoAlimentos('composicao:descartar');
  const remover = useAcaoAlimentos('composicao:removerValor');
  const removerNq = useAcaoAlimentos('composicao:removerNaoQuantificado');
  const aceitaNq = aceitaNaoQuantificado(r.fonte.origem);
  const fechar = () => {
    setAcao(null);
    setValorEmEdicao(null);
    setNqEmEdicao(null);
  };
  const condicoes = [
    r.idadeCorteDias !== null && `Idade de corte: ${r.idadeCorteDias} dias`,
    r.classeIdadeFonte && `Classe de idade: ${r.classeIdadeFonte}`,
    r.aditivoEnsilagem && `Aditivo: ${r.aditivoEnsilagem}`,
    r.regiao && `Região: ${r.regiao}`,
    r.estacao && `Estação: ${r.estacao}`,
    r.adubacao && `Adubação: ${r.adubacao}`,
    ...Object.entries(r.outrasCondicoes ?? {}).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        voltar={{ para: `/alimentos/itens/${r.alimentoId}`, rotulo: r.alimentoNome }}
        titulo={`Registro de composição: ${r.alimentoNome}`}
        selo={
          <div className="flex gap-2">
            <SeloOrigem origem={r.fonte.origem} />
            <SeloStatus status={r.status} />
            {r.descartadoEm && <Selo tom="perigo">Descartado</Selo>}
          </div>
        }
        descricao={descreverFonte(r.fonte)}
        acoes={
          <>
            {d.acoes.includes('transcrever') && (
              <Botao onClick={() => setAcao('transcrever')}>Marcar como transcrito</Botao>
            )}
            {d.acoes.includes('conferir') && (
              <Botao onClick={() => setAcao('conferir')}>Conferir</Botao>
            )}
            {d.acoes.includes('rejeitar') && (
              <Botao variante="secundario" onClick={() => setAcao('rejeitar')}>
                Rejeitar
              </Botao>
            )}
            {d.acoes.includes('devolver') && (
              <Botao variante="secundario" onClick={() => setAcao('devolver')}>
                Voltar a rascunho
              </Botao>
            )}
            {d.acoes.includes('reabrir') && (
              <Botao variante="secundario" onClick={() => setAcao('reabrir')}>
                Reabrir para correção
              </Botao>
            )}
            {d.aceitaNovaVersao && (
              <Botao variante="secundario" onClick={() => setAcao('novaVersao')}>
                Nova versão
              </Botao>
            )}
            {d.descartavel && (
              <Botao variante="fantasma" onClick={() => setAcao('descartar')}>
                Descartar
              </Botao>
            )}
          </>
        }
      />
      {erro && <Alerta tom="perigo" titulo={erro} />}
      <AvisoOrigem
        origem={r.fonte.origem}
        metodoMedicao={d.fonte.metodoMedicao}
        limitacoesMedicao={d.fonte.limitacoesMedicao}
      />
      {r.status === 'conferido' && (
        <Alerta tom="sucesso" titulo={avisosAlimentos.conferidoImutavel} />
      )}
      {r.status !== 'conferido' && r.status !== 'substituido' && (
        <Alerta tom="info" titulo={avisosAlimentos.conferenciaObrigatoria} />
      )}
      {r.mesmaPessoa && <Alerta tom="alerta" titulo={avisosAlimentos.mesmaPessoa} />}
      {r.status === 'rejeitado' && (
        <Alerta tom="perigo" titulo={`Rejeitado por ${r.rejeitadoPor}: ${r.motivoRejeicao}`} />
      )}
      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CartaoTitulo>Fonte e condições</CartaoTitulo>
            {d.editavel && (
              <Botao tamanho="pequeno" variante="secundario" onClick={() => setAcao('cabecalho')}>
                Editar cabeçalho
              </Botao>
            )}
          </div>
          <ListaDados
            itens={[
              { rotulo: 'Fonte', valor: descreverFonte(d.fonte) },
              {
                rotulo: 'Autores e ano',
                valor: [d.fonte.autores, d.fonte.ano].filter(Boolean).join(', ') || null,
              },
              { rotulo: 'Edição ou versão', valor: d.fonte.edicaoVersao },
              { rotulo: 'Página ou tabela', valor: r.referenciaLocal },
              {
                rotulo: 'Laboratório e laudo',
                valor:
                  [d.fonte.laboratorio, d.fonte.numeroLaudo].filter(Boolean).join(' · ') || null,
              },
              { rotulo: 'Fabricante', valor: d.fonte.fabricante },
              { rotulo: 'Propriedade', valor: d.fonte.propriedadeNome },
              {
                rotulo: 'Data da amostra',
                valor: r.dataAmostra ? formatarData(r.dataAmostra) : null,
              },
              { rotulo: 'Identificação da amostra', valor: r.identificacaoAmostra },
              { rotulo: 'Separador decimal da fonte', valor: separadores[r.separadorDecimal] },
              { rotulo: 'Número de observações', valor: r.nObservacoes },
              { rotulo: 'Condições', valor: condicoes.length ? condicoes.join(' · ') : null },
              {
                rotulo: 'Transcrito por',
                valor: r.transcritoPor
                  ? `${r.transcritoPor} em ${formatarDataHora(r.transcritoEm!)}`
                  : null,
              },
              {
                rotulo: 'Conferido por',
                valor: r.conferidoPor
                  ? `${r.conferidoPor} em ${formatarDataHora(r.conferidoEm!)}`
                  : null,
              },
              { rotulo: 'Observações', valor: r.observacoes },
            ]}
          />
        </CartaoConteudo>
      </Cartao>
      <section className="flex flex-col gap-3" aria-label="Valores">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Valores como publicados</h3>
          {d.editavel && (
            <div className="flex gap-2">
              <Botao tamanho="pequeno" onClick={() => setAcao('valor')}>
                <Plus className="size-4" aria-hidden />
                Novo valor
              </Botao>
              {aceitaNq && (
                <Botao
                  tamanho="pequeno"
                  variante="secundario"
                  onClick={() => setAcao('naoQuantificado')}
                >
                  <Plus className="size-4" aria-hidden />
                  Valor não quantificado
                </Botao>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-texto-suave">
          {avisosAlimentos.ausenteExplicacao} Nada é convertido ao gravar: a unidade e a base são as
          da fonte.
        </p>
        <TabelaValores
          valores={d.valores}
          {...(d.editavel
            ? {
                aoEditar: (v: ValorNutricionalApi) => {
                  setValorEmEdicao(v);
                  setAcao('valor');
                },
                aoRemover: (v: ValorNutricionalApi) =>
                  remover.mutate(
                    { registroId: r.id, valorId: v.id },
                    { onError: (e) => setErro(mensagemDeErro(e)), onSuccess: () => setErro(null) },
                  ),
              }
            : {})}
        />
        {d.valoresNaoQuantificados.length > 0 && (
          <>
            <h4 className="text-sm font-semibold">Não quantificados</h4>
            <p className="text-sm text-texto-suave">{avisosAlimentos.naoQuantificado}</p>
            <TabelaNaoQuantificados
              valores={d.valoresNaoQuantificados}
              {...(d.editavel
                ? {
                    aoEditar: (v: ValorNaoQuantificadoApi) => {
                      setNqEmEdicao(v);
                      setAcao('naoQuantificado');
                    },
                    aoRemover: (v: ValorNaoQuantificadoApi) =>
                      removerNq.mutate(
                        { registroId: r.id, valorId: v.id },
                        {
                          onError: (e) => setErro(mensagemDeErro(e)),
                          onSuccess: () => setErro(null),
                        },
                      ),
                  }
                : {})}
            />
          </>
        )}
      </section>
      <SecaoVinculos d={d} />
      <SecaoAvaliacao d={d} />
      {d.diferencasDaAnterior.length > 0 && (
        <section
          className="flex flex-col gap-3"
          aria-label="Diferenças em relação à versão anterior"
        >
          <h3 className="font-semibold">Diferenças em relação à versão anterior</h3>
          <p className="text-sm text-texto-suave">Motivo da versão: {r.motivoVersao}</p>
          <TabelaDiferencas diferencas={d.diferencasDaAnterior} />
        </section>
      )}
      {d.versoes.length > 1 && (
        <section className="flex flex-col gap-2" aria-label="Versões">
          <h3 className="font-semibold">Versões</h3>
          <ol className="flex flex-col gap-1 text-sm">
            {d.versoes.map((x, i) => (
              <li key={x.id}>
                {i + 1}.{' '}
                {x.id === r.id ? (
                  <strong>esta versão</strong>
                ) : (
                  <Link className="text-marca underline" to={`/alimentos/registros/${x.id}`}>
                    versão {i + 1}
                  </Link>
                )}{' '}
                · {statusRegistro[x.status]}
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="flex flex-col gap-2" aria-label="Histórico do registro">
        <h3 className="font-semibold">Histórico</h3>
        <ul className="flex flex-col gap-1 text-sm text-texto-suave">
          {d.historico.map((h) => (
            <li key={h.id}>
              {formatarDataHora(h.ocorridoEm)} · {rotuloAcaoHistorico(h.acao)}
              {h.motivo && ` · ${h.motivo}`}
            </li>
          ))}
        </ul>
      </section>

      {acao === 'cabecalho' && (
        <ModalCabecalhoRegistro
          alimentoId={r.alimentoId}
          fontes={fontes.data ?? []}
          registro={r}
          aoFechar={fechar}
          aoSalvar={() => undefined}
        />
      )}
      {acao === 'valor' && (
        <ModalValor
          registroId={r.id}
          origem={r.fonte.origem}
          separador={r.separadorDecimal}
          valor={valorEmEdicao}
          aoFechar={fechar}
        />
      )}
      {acao === 'naoQuantificado' && (
        <ModalNaoQuantificado
          registroId={r.id}
          origem={r.fonte.origem}
          separador={r.separadorDecimal}
          valor={nqEmEdicao}
          aoFechar={fechar}
        />
      )}
      {acao === 'transcrever' && (
        <ModalCampos
          titulo="Marcar como transcrito"
          descricao="Confirma que os valores foram digitados como estão na fonte. Depois disso o registro só muda voltando a rascunho."
          campos={[{ nome: 'responsavel', rotulo: 'Nome de quem transcreveu' }]}
          textoEnviar="Marcar como transcrito"
          enviando={transcrever.isPending}
          aoFechar={fechar}
          aoConfirmar={(c) => transcrever.mutateAsync({ id: r.id, responsavel: c['responsavel']! })}
        />
      )}
      {acao === 'conferir' && (
        <ModalCampos
          titulo="Conferir registro"
          descricao={`Releia na fonte (${r.referenciaLocal ?? 'sem página informada'}) cada valor, unidade e base antes de confirmar. Depois de conferido, o registro não muda.`}
          campos={[{ nome: 'responsavel', rotulo: 'Nome de quem conferiu' }]}
          textoEnviar="Confirmar conferência"
          largura="xl"
          enviando={conferir.isPending}
          aoFechar={fechar}
          aoConfirmar={(c) => conferir.mutateAsync({ id: r.id, responsavel: c['responsavel']! })}
        >
          <TabelaValores valores={d.valores} />
          {d.valoresNaoQuantificados.length > 0 && (
            <TabelaNaoQuantificados valores={d.valoresNaoQuantificados} />
          )}
          {d.diferencasDaAnterior.length > 0 && (
            <TabelaDiferencas diferencas={d.diferencasDaAnterior} />
          )}
          {r.transcritoPor && (
            <p className="text-sm text-texto-suave">Transcrito por {r.transcritoPor}.</p>
          )}
        </ModalCampos>
      )}
      {acao === 'rejeitar' && (
        <ModalCampos
          titulo="Rejeitar transcrição"
          campos={[
            { nome: 'responsavel', rotulo: 'Nome de quem conferiu' },
            { nome: 'motivo', rotulo: 'Motivo', multilinha: true },
          ]}
          textoEnviar="Rejeitar"
          perigoso
          enviando={rejeitar.isPending}
          aoFechar={fechar}
          aoConfirmar={(c) =>
            rejeitar.mutateAsync({ id: r.id, responsavel: c['responsavel']!, motivo: c['motivo']! })
          }
        />
      )}
      {acao === 'devolver' && (
        <ModalCampos
          titulo="Voltar a rascunho"
          campos={[{ nome: 'motivo', rotulo: 'Motivo', multilinha: true }]}
          textoEnviar="Voltar a rascunho"
          enviando={devolver.isPending}
          aoFechar={fechar}
          aoConfirmar={(c) => devolver.mutateAsync({ id: r.id, motivo: c['motivo']! })}
        />
      )}
      {acao === 'reabrir' && (
        <ModalCampos
          titulo="Reabrir para correção"
          descricao="O registro volta a rascunho. A rejeição continua no histórico."
          campos={[]}
          textoEnviar="Reabrir"
          enviando={reabrir.isPending}
          aoFechar={fechar}
          aoConfirmar={() => reabrir.mutateAsync({ id: r.id })}
        />
      )}
      {acao === 'novaVersao' && (
        <ModalCampos
          titulo="Nova versão"
          descricao="Cria um rascunho com cópia do cabeçalho e dos valores. Esta versão continua valendo até a nova ser conferida."
          campos={[{ nome: 'motivo', rotulo: 'Motivo da correção', multilinha: true }]}
          textoEnviar="Criar nova versão"
          enviando={novaVersao.isPending}
          aoFechar={fechar}
          aoConfirmar={(c) =>
            novaVersao
              .mutateAsync({ id: r.id, motivo: c['motivo']! })
              .then((n) => navegar(`/alimentos/registros/${n.registro.id}`))
          }
        />
      )}
      {acao === 'descartar' && (
        <ModalCampos
          titulo="Descartar registro"
          descricao="Exclusão lógica: o registro sai das listas, mas fica no histórico."
          campos={[{ nome: 'motivo', rotulo: 'Motivo', multilinha: true }]}
          textoEnviar="Descartar"
          perigoso
          enviando={descartar.isPending}
          aoFechar={fechar}
          aoConfirmar={(c) => descartar.mutateAsync({ id: r.id, motivo: c['motivo']! })}
        />
      )}
    </div>
  );
}

export function PaginaRegistro() {
  const { id = '' } = useParams();
  const registro = useRegistro(id);
  if (registro.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(registro.error)} />;
  if (!registro.data) return null;
  return <Detalhe d={registro.data} />;
}
