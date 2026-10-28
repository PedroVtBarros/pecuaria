import { useState } from 'react';
import { Link } from 'react-router';
import { Receipt } from 'lucide-react';
import { ATIVIDADES, formatarCentavos, type NaturezaFinanceira } from '@pecuaria/domain';
import type { ContaEmAberto, Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import {
  useCategoriasFinanceiras,
  useContas,
  useLancamento,
  usePessoasComerciais,
} from '../../lib/consultas-financeiro';
import { formatarData } from '../../lib/formatar-rebanho';
import { cn } from '../../lib/utils';
import { atividades, avisoGeral, moeda, situacoesParcela } from '../../textos-financeiro';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';
import { ModalPagamento } from './modais-lancamento';

const TAMANHO_PAGINA = 50;

/** Carrega o lançamento da parcela e abre o registro de pagamento ou recebimento. */
function ModalPagamentoDaConta({
  conta,
  aoFechar,
}: {
  conta: ContaEmAberto;
  aoFechar: () => void;
}) {
  const lancamento = useLancamento(conta.lancamentoId);
  const parcela = lancamento.data?.parcelas.find((p) => p.id === conta.parcelaId);
  if (!lancamento.data || !parcela) return null;
  return <ModalPagamento lancamento={lancamento.data} parcela={parcela} aoFechar={aoFechar} />;
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [natureza, setNatureza] = useState<NaturezaFinanceira>('despesa');
  const [situacao, setSituacao] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [pessoaId, setPessoaId] = useState('');
  const [atividade, setAtividade] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [pagando, setPagando] = useState<ContaEmAberto | null>(null);
  const categorias = useCategoriasFinanceiras(true);
  const pessoas = usePessoasComerciais(true);
  const consulta = useContas({
    propriedadeId: propriedade.id,
    natureza,
    ...(situacao ? { situacao: situacao as 'atrasada' | 'a_vencer' } : {}),
    ...(categoriaId ? { categoriaId } : {}),
    ...(pessoaId ? { pessoaId } : {}),
    ...(atividade ? { atividade: atividade as (typeof ATIVIDADES)[number] } : {}),
    ...(inicio ? { dataInicial: inicio } : {}),
    ...(fim ? { dataFinal: fim } : {}),
    ...(busca.trim() ? { busca: busca.trim() } : {}),
    pagina,
    tamanhoPagina: TAMANHO_PAGINA,
  });
  const c = consulta.data;
  const recebimento = natureza === 'receita';
  const paginas = Math.max(1, Math.ceil((c?.total ?? 0) / TAMANHO_PAGINA));
  const reiniciar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPagina(1);
    };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Contas a pagar e a receber"
        descricao="Parcelas ainda em aberto, por vencimento. Registrar um pagamento ou recebimento aqui é o mesmo que fazê-lo no lançamento."
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      <div role="tablist" aria-label="Tipo de conta" className="flex gap-1 border-b border-borda">
        {(['despesa', 'receita'] as const).map((n) => (
          <button
            key={n}
            type="button"
            role="tab"
            aria-selected={natureza === n}
            onClick={() => reiniciar(setNatureza)(n)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
              natureza === n
                ? 'border-marca font-medium text-texto'
                : 'border-transparent text-texto-suave hover:text-texto',
            )}
          >
            {n === 'despesa' ? 'A pagar' : 'A receber'}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Campo rotulo="Buscar">
          {(p) => (
            <Entrada
              {...p}
              value={busca}
              placeholder="Descrição, categoria, contraparte"
              onChange={(e) => reiniciar(setBusca)(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Situação">
          {(p) => (
            <Selecao
              {...p}
              value={situacao}
              onChange={(e) => reiniciar(setSituacao)(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="atrasada">Em atraso</option>
              <option value="a_vencer">A vencer</option>
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Categoria">
          {(p) => (
            <Selecao
              {...p}
              value={categoriaId}
              onChange={(e) => reiniciar(setCategoriaId)(e.target.value)}
            >
              <option value="">Todas</option>
              {(categorias.data ?? [])
                .filter((x) => x.natureza === natureza)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Contraparte">
          {(p) => (
            <Selecao
              {...p}
              value={pessoaId}
              onChange={(e) => reiniciar(setPessoaId)(e.target.value)}
            >
              <option value="">Todas</option>
              {(pessoas.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Atividade">
          {(p) => (
            <Selecao
              {...p}
              value={atividade}
              onChange={(e) => reiniciar(setAtividade)(e.target.value)}
            >
              <option value="">Todas</option>
              {opcoesDe(atividades, ATIVIDADES)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Vencimento de">
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={inicio}
              onChange={(e) => reiniciar(setInicio)(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Vencimento até">
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={fim}
              onChange={(e) => reiniciar(setFim)(e.target.value)}
            />
          )}
        </Campo>
      </div>
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      {c && (
        <>
          <GradeIndicadores testId="resumo-contas">
            <Indicador
              rotulo={recebimento ? 'Total a receber' : 'Total a pagar'}
              valor={moeda(c.resumo.saldoTotalCentavos)}
              dica={`${c.resumo.quantidade} parcela(s)`}
            />
            <Indicador
              rotulo="Em atraso"
              valor={moeda(c.resumo.emAtrasoCentavos)}
              destaque={c.resumo.emAtrasoCentavos > 0 ? 'perigo' : undefined}
              dica={`${c.resumo.emAtrasoQuantidade} parcela(s)`}
            />
            <Indicador
              rotulo="A vencer"
              valor={moeda(c.resumo.aVencerCentavos)}
              dica={`${c.resumo.aVencerQuantidade} parcela(s)`}
            />
          </GradeIndicadores>
          {c.pendentesDeDefinicao.quantidade > 0 && (
            <Alerta tom="alerta" titulo="Saldo desconhecido em alguns lançamentos">
              {c.pendentesDeDefinicao.quantidade} lançamento(s) (operações de{' '}
              {formatarCentavos(c.pendentesDeDefinicao.valorOperacaoCentavos)}) ainda não têm
              condição de pagamento e não aparecem na lista nem nos totais acima.{' '}
              <Link className="underline" to="/financeiro/lancamentos?situacao=pendente_definicao">
                Definir as condições
              </Link>
            </Alerta>
          )}
          {c.itens.length === 0 ? (
            <EstadoVazio
              icone={Receipt}
              titulo={recebimento ? 'Nada a receber' : 'Nada a pagar'}
              descricao="Só aparecem parcelas com saldo em aberto. Parcelas quitadas e lançamentos cancelados ficam fora."
            />
          ) : (
            <Tabela data-testid="tabela-contas">
              <Cabeca>
                <Th>Vencimento</Th>
                <Th>Descrição</Th>
                <Th>Contraparte</Th>
                <Th>Categoria</Th>
                <Th>Parcela</Th>
                <Th className="text-right">Valor da parcela</Th>
                <Th className="text-right">{recebimento ? 'Recebido' : 'Pago'}</Th>
                <Th className="text-right">{recebimento ? 'A receber' : 'A pagar'}</Th>
                <Th>Situação</Th>
                <Th>
                  <span className="sr-only">Ação</span>
                </Th>
              </Cabeca>
              <tbody>
                {c.itens.map((i) => (
                  <Linha key={i.parcelaId}>
                    <Td className="whitespace-nowrap">{formatarData(i.vencimento)}</Td>
                    <Td>
                      <Link
                        className="font-medium text-marca hover:underline"
                        to={`/financeiro/lancamentos/${i.lancamentoId}`}
                      >
                        {i.descricao}
                      </Link>
                      {i.destinoDescricao && (
                        <div className="text-xs text-texto-suave">{i.destinoDescricao}</div>
                      )}
                    </Td>
                    <Td>{i.pessoa?.nome ?? '—'}</Td>
                    <Td>{i.categoria.nome}</Td>
                    <Td className="whitespace-nowrap">
                      {i.numero}/{i.totalParcelas}
                    </Td>
                    <Td className="text-right whitespace-nowrap">{moeda(i.valorCentavos)}</Td>
                    <Td className="text-right whitespace-nowrap">{moeda(i.pagoCentavos)}</Td>
                    <Td className="text-right font-medium whitespace-nowrap">
                      {moeda(i.saldoCentavos)}
                    </Td>
                    <Td>
                      <Selo
                        tom={
                          i.situacao === 'atrasada'
                            ? 'perigo'
                            : i.situacao === 'parcial'
                              ? 'marca'
                              : 'neutro'
                        }
                      >
                        {i.situacao === 'atrasada' && i.diasEmAtraso !== null
                          ? `${situacoesParcela.atrasada} há ${i.diasEmAtraso} dia(s)`
                          : situacoesParcela[i.situacao]}
                      </Selo>
                    </Td>
                    <Td>
                      <Botao variante="secundario" tamanho="pequeno" onClick={() => setPagando(i)}>
                        {recebimento ? 'Registrar recebimento' : 'Registrar pagamento'}
                      </Botao>
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
          {c.total > TAMANHO_PAGINA && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-texto-suave">
                {c.total} parcelas · página {pagina} de {paginas}
              </span>
              <div className="flex gap-2">
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  disabled={pagina <= 1}
                  onClick={() => setPagina(pagina - 1)}
                >
                  Anterior
                </Botao>
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  disabled={pagina >= paginas}
                  onClick={() => setPagina(pagina + 1)}
                >
                  Próxima
                </Botao>
              </div>
            </div>
          )}
        </>
      )}
      {pagando && <ModalPagamentoDaConta conta={pagando} aoFechar={() => setPagando(null)} />}
    </div>
  );
}

export function PaginaContas() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
