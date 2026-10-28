import { useState } from 'react';
import { Link } from 'react-router';
import { CircleCheck } from 'lucide-react';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { EntradaSemDocumentoApi, Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import {
  useAcaoFinanceiro,
  useCategoriasFinanceiras,
  useLancamentos,
} from '../../lib/consultas-financeiro';
import { usePendenciasEstoque } from '../../lib/consultas-insumos';
import { formatarData, hojeIso } from '../../lib/formatar-rebanho';
import { moeda } from '../../textos-financeiro';
import { quantidadeEstoque } from '../../textos-estoque';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';
import { EditorCondicao, condicaoInicial, converterCondicao } from './editor-condicao';

/** Cria o lançamento da compra a partir de uma entrada antiga, ou liga a um lançamento existente. */
function ModalLigar({
  propriedadeId,
  entrada,
  aoFechar,
}: {
  propriedadeId: string;
  entrada: EntradaSemDocumentoApi;
  aoFechar: () => void;
}) {
  const criar = useAcaoFinanceiro('compraInsumo:criarDaEntrada');
  const vincular = useAcaoFinanceiro('compraInsumo:vincularEntrada');
  const categorias = useCategoriasFinanceiras(false);
  const lancamentos = useLancamentos({
    propriedadeId,
    natureza: 'despesa',
    tratamento: 'estoque',
    incluirCancelados: false,
    pagina: 1,
    tamanhoPagina: 100,
  });
  const [modo, setModo] = useState<'criar' | 'ligar'>('ligar');
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [categoriaId, setCategoriaId] = useState('');
  const [lancamentoId, setLancamentoId] = useState('');
  const [condicao, setCondicao] = useState(() => condicaoInicial(hojeIso()));
  const [erros, setErros] = useState<string[]>([]);
  const comCusto = entrada.custoEntradaCentavos !== null;
  return (
    <Modal
      aberto
      largura="lg"
      titulo={`Ligar a entrada de ${entrada.estoqueItemNome}`}
      descricao={`${formatarData(entrada.data)} · ${quantidadeEstoque(entrada.quantidade, entrada.unidadeBase)} · custo de entrada ${entrada.custoEntradaCentavos === null ? 'desconhecido' : moeda(entrada.custoEntradaCentavos)}`}
      aoFechar={aoFechar}
      textoEnviar={modo === 'criar' ? 'Criar lançamento e ligar' : 'Ligar ao lançamento'}
      enviando={criar.isPending || vincular.isPending}
      erros={erros}
      aoEnviar={() => {
        const falha = (e: unknown) => setErros([mensagemDeErro(e)]);
        if (modo === 'ligar') {
          if (!lancamentoId) return setErros(['Escolha o lançamento.']);
          return vincular.mutate(
            { movimentacaoId: entrada.movimentacaoId, lancamentoId },
            { onSuccess: aoFechar, onError: falha },
          );
        }
        if (!categoriaId) return setErros(['Escolha a categoria.']);
        const c = converterCondicao(condicao, entrada.custoEntradaCentavos, true);
        if (!c.condicao) return setErros(c.erros);
        criar.mutate(
          {
            requisicaoId,
            movimentacaoId: entrada.movimentacaoId,
            categoriaId,
            pessoaId: null,
            documentoNumero: null,
            atividade: 'nao_definida',
            condicao: c.condicao,
          },
          { onSuccess: aoFechar, onError: falha },
        );
      }}
    >
      {!comCusto && (
        <Alerta tom="alerta" titulo="Custo de entrada desconhecido">
          Esta entrada não tem custo. Corrija o custo no estoque antes de ligá-la: o sistema não
          inventa um valor para o lançamento.
        </Alerta>
      )}
      <Campo rotulo="O que fazer">
        {(p) => (
          <Selecao
            {...p}
            value={modo}
            disabled={!comCusto}
            onChange={(e) => setModo(e.target.value as 'criar' | 'ligar')}
          >
            <option value="ligar">Ligar a um lançamento de compra que já existe</option>
            <option value="criar">Criar o lançamento a partir desta entrada</option>
          </Selecao>
        )}
      </Campo>
      {modo === 'ligar' ? (
        <Campo
          rotulo="Lançamento de compra para estoque"
          obrigatorio
          ajuda="Nenhum valor é alterado; a diferença para o valor da entrada fica registrada como pendência."
        >
          {(p) => (
            <Selecao {...p} value={lancamentoId} onChange={(e) => setLancamentoId(e.target.value)}>
              <option value="">Escolher…</option>
              {(lancamentos.data?.itens ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {formatarData(l.dataCompetencia)} · {l.descricao} ·{' '}
                  {moeda(l.valorOperacaoCentavos)}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      ) : (
        <>
          <Campo rotulo="Categoria" obrigatorio>
            {(p) => (
              <Selecao {...p} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Escolher…</option>
                {(categorias.data ?? [])
                  .filter((c) => c.natureza === 'despesa' && c.tratamento === 'estoque')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </Selecao>
            )}
          </Campo>
          <EditorCondicao
            estado={condicao}
            aoMudar={setCondicao}
            totalCentavos={entrada.custoEntradaCentavos}
            natureza="despesa"
          />
        </>
      )}
    </Modal>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const consulta = usePendenciasEstoque(propriedade.id);
  const [ligando, setLigando] = useState<EntradaSemDocumentoApi | null>(null);
  const p = consulta.data;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Pendências de estoque e financeiro"
        descricao="Conferência de consistência: entradas de compra sem documento, compras sem entrada, diferenças entre a nota e os itens e consumos sem custo. O sistema só aponta; nada é corrigido sozinho."
      />
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      {p && (
        <>
          <GradeIndicadores testId="resumo-pendencias">
            <Indicador
              rotulo="Entradas sem documento"
              valor={String(p.entradasSemDocumento.total)}
              destaque={p.entradasSemDocumento.total > 0 ? 'alerta' : undefined}
            />
            <Indicador
              rotulo="Compras sem entrada"
              valor={String(p.comprasSemEntrada.length)}
              destaque={p.comprasSemEntrada.length > 0 ? 'alerta' : undefined}
            />
            <Indicador
              rotulo="Notas com diferença"
              valor={String(p.diferencas.length)}
              destaque={p.diferencas.length > 0 ? 'alerta' : undefined}
            />
            <Indicador
              rotulo="Consumos sem custo"
              valor={String(p.consumosSemCusto)}
              destaque={p.consumosSemCusto > 0 ? 'alerta' : undefined}
            />
          </GradeIndicadores>
          {p.total === 0 && (
            <EstadoVazio
              icone={CircleCheck}
              titulo="Nada a conferir"
              descricao="Entradas, compras e consumos estão consistentes."
            />
          )}
          {p.entradasSemDocumento.total > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">
                Entradas de compra sem documento financeiro
              </h3>
              <Tabela data-testid="tabela-entradas-sem-documento">
                <Cabeca>
                  <Th>Data</Th>
                  <Th>Item</Th>
                  <Th className="text-right">Quantidade</Th>
                  <Th className="text-right">Custo de entrada</Th>
                  <Th>
                    <span className="sr-only">Ação</span>
                  </Th>
                </Cabeca>
                <tbody>
                  {p.entradasSemDocumento.itens.map((e) => (
                    <Linha key={e.movimentacaoId}>
                      <Td className="whitespace-nowrap">{formatarData(e.data)}</Td>
                      <Td>
                        <Link
                          className="text-marca hover:underline"
                          to={`/estoque/itens/${e.estoqueItemId}`}
                        >
                          {e.estoqueItemNome}
                        </Link>
                        {e.documentoOrfao && (
                          <div className="text-xs text-perigo">
                            Aponta para um documento que não existe
                          </div>
                        )}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        {quantidadeEstoque(e.quantidade, e.unidadeBase)}
                      </Td>
                      <Td className="text-right whitespace-nowrap">
                        {e.custoEntradaCentavos === null
                          ? 'Custo desconhecido'
                          : moeda(e.custoEntradaCentavos)}
                      </Td>
                      <Td>
                        <Botao
                          variante="secundario"
                          tamanho="pequeno"
                          onClick={() => setLigando(e)}
                        >
                          Ligar
                        </Botao>
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </section>
          )}
          {p.comprasSemEntrada.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">Compras para estoque sem entrada ligada</h3>
              <p className="text-sm text-texto-suave">
                Lançamentos de compra para estoque sem entrada física: o insumo pode não ter entrado
                no estoque ainda. Ligue pela entrada correspondente (acima) ou cancele o lançamento
                se foi engano.
              </p>
              <Tabela data-testid="tabela-compras-sem-entrada">
                <Cabeca>
                  <Th>Data</Th>
                  <Th>Lançamento</Th>
                  <Th className="text-right">Valor da operação</Th>
                </Cabeca>
                <tbody>
                  {p.comprasSemEntrada.map((c) => (
                    <Linha key={c.id}>
                      <Td className="whitespace-nowrap">{formatarData(c.data)}</Td>
                      <Td>
                        <Link
                          className="text-marca hover:underline"
                          to={`/financeiro/lancamentos/${c.id}`}
                        >
                          {c.descricao}
                        </Link>
                      </Td>
                      <Td className="text-right whitespace-nowrap">{moeda(c.valorCentavos)}</Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </section>
          )}
          {p.diferencas.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">Notas cujo total difere da soma dos itens</h3>
              <Tabela data-testid="tabela-diferencas">
                <Cabeca>
                  <Th>Data</Th>
                  <Th>Compra</Th>
                  <Th className="text-right">Valor da operação</Th>
                  <Th className="text-right">Soma dos itens</Th>
                  <Th className="text-right">Diferença</Th>
                </Cabeca>
                <tbody>
                  {p.diferencas.map((c) => (
                    <Linha key={c.id}>
                      <Td className="whitespace-nowrap">{formatarData(c.data)}</Td>
                      <Td>
                        <Link
                          className="text-marca hover:underline"
                          to={`/financeiro/insumos/${c.id}`}
                        >
                          {c.descricao}
                        </Link>
                      </Td>
                      <Td className="text-right whitespace-nowrap">{moeda(c.totalCentavos)}</Td>
                      <Td className="text-right whitespace-nowrap">{moeda(c.somaItensCentavos)}</Td>
                      <Td className="text-right whitespace-nowrap">
                        {moeda(c.totalCentavos - c.somaItensCentavos)}
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </section>
          )}
          {p.consumosSemCusto > 0 && (
            <Alerta tom="alerta" titulo={`${p.consumosSemCusto} consumo(s) sem custo conhecido`}>
              A valoração do estoque está incompleta (entrada sem custo). O custo desses consumos
              aparece como desconhecido e deixa os totais parciais. Corrija o custo da entrada no
              estoque.{' '}
              <Link className="underline" to="/financeiro/consumo">
                Ver custos de consumo
              </Link>
            </Alerta>
          )}
        </>
      )}
      {ligando && (
        <ModalLigar
          propriedadeId={propriedade.id}
          entrada={ligando}
          aoFechar={() => setLigando(null)}
        />
      )}
    </div>
  );
}

export function PaginaPendencias() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
