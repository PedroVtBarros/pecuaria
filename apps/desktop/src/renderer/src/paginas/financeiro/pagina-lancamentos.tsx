import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Plus, Wallet } from 'lucide-react';
import { ATIVIDADES, NATUREZAS_FINANCEIRAS } from '@pecuaria/domain';
import type { Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useCategoriasFinanceiras, useLancamentos } from '../../lib/consultas-financeiro';
import { formatarData } from '../../lib/formatar-rebanho';
import {
  atividades,
  avisoGeral,
  comportamentos,
  moeda,
  naturezas,
  rotulosDosValores,
  situacaoDoLancamento,
  situacoes,
  tomDaSituacao,
} from '../../textos-financeiro';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { ModalLancamento } from './modal-lancamento';

const TAMANHO_PAGINA = 50;

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const navegar = useNavigate();
  const [novo, setNovo] = useState(false);
  const [natureza, setNatureza] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [atividade, setAtividade] = useState('');
  const [parametros] = useSearchParams();
  const [situacao, setSituacao] = useState(() => {
    const inicial = parametros.get('situacao') ?? '';
    return inicial in situacoes ? inicial : '';
  });
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [busca, setBusca] = useState('');
  const [cancelados, setCancelados] = useState(false);
  const [pagina, setPagina] = useState(1);
  const categorias = useCategoriasFinanceiras(true);
  const filtros = {
    propriedadeId: propriedade.id,
    ...(natureza ? { natureza: natureza as 'receita' | 'despesa' } : {}),
    ...(categoriaId ? { categoriaId } : {}),
    ...(atividade ? { atividade: atividade as (typeof ATIVIDADES)[number] } : {}),
    ...(situacao ? { situacao: situacao as keyof typeof situacoes } : {}),
    ...(inicio ? { dataInicial: inicio } : {}),
    ...(fim ? { dataFinal: fim } : {}),
    ...(busca.trim() ? { busca: busca.trim() } : {}),
    incluirCancelados: cancelados,
    pagina,
    tamanhoPagina: TAMANHO_PAGINA,
  };
  const consulta = useLancamentos(filtros);
  const itens = consulta.data?.itens ?? [];
  const total = consulta.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const voltarAoInicio =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPagina(1);
    };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Lançamentos"
        descricao="Fatos econômicos por data de competência, com o valor da operação, o que falta pagar ou receber e o que efetivamente foi pago ou recebido."
        acoes={
          <Botao onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden />
            Novo lançamento
          </Botao>
        }
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      <div className="flex flex-wrap items-end gap-4">
        <Campo rotulo="Buscar lançamento">
          {(p) => (
            <Entrada
              {...p}
              value={busca}
              placeholder="Descrição, categoria, contraparte"
              onChange={(e) => voltarAoInicio(setBusca)(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Natureza">
          {(p) => (
            <Selecao
              {...p}
              value={natureza}
              onChange={(e) => voltarAoInicio(setNatureza)(e.target.value)}
            >
              <option value="">Todas</option>
              {opcoesDe(naturezas, NATUREZAS_FINANCEIRAS)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Categoria">
          {(p) => (
            <Selecao
              {...p}
              value={categoriaId}
              onChange={(e) => voltarAoInicio(setCategoriaId)(e.target.value)}
            >
              <option value="">Todas</option>
              {(categorias.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
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
              onChange={(e) => voltarAoInicio(setAtividade)(e.target.value)}
            >
              <option value="">Todas</option>
              {opcoesDe(atividades, ATIVIDADES)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Situação">
          {(p) => (
            <Selecao
              {...p}
              value={situacao}
              onChange={(e) => voltarAoInicio(setSituacao)(e.target.value)}
            >
              <option value="">Todas</option>
              {opcoesDe(situacoes)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Competência de">
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={inicio}
              onChange={(e) => voltarAoInicio(setInicio)(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Competência até">
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={fim}
              onChange={(e) => voltarAoInicio(setFim)(e.target.value)}
            />
          )}
        </Campo>
        <CaixaMarcar
          rotulo="Incluir cancelados"
          marcado={cancelados}
          aoMudar={voltarAoInicio(setCancelados)}
        />
      </div>
      {itens.length === 0 ? (
        <EstadoVazio
          icone={Wallet}
          titulo={consulta.isLoading ? 'Carregando lançamentos' : 'Nenhum lançamento encontrado'}
          descricao="Registre despesas e receitas. Nada é criado automaticamente a partir do estoque, da sanidade ou do rebanho."
        />
      ) : (
        <Tabela data-testid="tabela-lancamentos">
          <Cabeca>
            <Th>Competência</Th>
            <Th>Descrição</Th>
            <Th>Categoria</Th>
            <Th>Destino</Th>
            <Th>Valor da operação</Th>
            <Th>A pagar / a receber</Th>
            <Th>Pago / recebido</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {itens.map((l) => {
              const r = rotulosDosValores(l.natureza);
              return (
                <Linha
                  key={l.id}
                  clicavel
                  className={l.cancelado ? 'opacity-60' : undefined}
                  onClick={() => navegar(`/financeiro/lancamentos/${l.id}`)}
                >
                  <Td className="whitespace-nowrap">{formatarData(l.dataCompetencia)}</Td>
                  <Td>
                    <Link
                      className="font-medium text-marca hover:underline"
                      to={`/financeiro/lancamentos/${l.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {l.descricao}
                    </Link>
                    <div className="text-xs text-texto-suave">
                      {naturezas[l.natureza]}
                      {l.pessoa ? ` · ${l.pessoa.nome}` : ''}
                      {l.natureza === 'despesa' && l.comportamentoCusto !== 'nao_classificado'
                        ? ` · ${comportamentos[l.comportamentoCusto]}`
                        : ''}
                    </div>
                  </Td>
                  <Td>{l.categoria.nome}</Td>
                  <Td>
                    {l.destino.tipo === 'lote'
                      ? `Lote ${l.destino.loteNome ?? ''}`
                      : l.destino.tipo === 'animal'
                        ? `Animal ${l.destino.animalIdentificacao ?? ''}`
                        : l.destino.tipo === 'propriedade'
                          ? 'Propriedade'
                          : '—'}
                  </Td>
                  <Td className="text-right whitespace-nowrap" title={r.operacao}>
                    {moeda(l.valorOperacaoCentavos)}
                  </Td>
                  <Td className="text-right whitespace-nowrap" title={r.saldo}>
                    {moeda(l.saldoEmAbertoCentavos)}
                  </Td>
                  <Td className="text-right whitespace-nowrap" title={r.efetivo}>
                    {moeda(l.pagoCentavos)}
                  </Td>
                  <Td>
                    <Selo tom={tomDaSituacao[l.situacao]}>
                      {situacaoDoLancamento(l.situacao, l.natureza, l.compensadoCentavos)}
                    </Selo>
                  </Td>
                </Linha>
              );
            })}
          </tbody>
        </Tabela>
      )}
      {total > TAMANHO_PAGINA && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-texto-suave">
            {total} lançamentos · página {pagina} de {paginas}
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
      {novo && (
        <ModalLancamento
          propriedadeId={propriedade.id}
          lancamento={null}
          aoFechar={() => setNovo(false)}
          aoSalvar={(l) => navegar(`/financeiro/lancamentos/${l.id}`)}
        />
      )}
    </div>
  );
}

export function PaginaLancamentos() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
