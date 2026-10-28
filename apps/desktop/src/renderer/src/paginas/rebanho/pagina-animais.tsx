import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRightLeft, Beef, Plus, Search } from 'lucide-react';
import type { FiltrosAnimal } from '@pecuaria/shared-types';
import {
  CATEGORIAS_ANIMAL,
  STATUS_ANIMAL,
  type CategoriaAnimal,
  type Sexo,
  type StatusAnimal,
} from '@pecuaria/domain';
import { useAnimais, useLotes } from '../../lib/consultas-rebanho';
import { rotulos } from '../../textos-rebanho';
import { Botao } from '../../components/ui/botao';
import { Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio, Paginacao } from '../../components/ui/pagina';
import { ComPropriedade } from './layout-rebanho';
import { ModalTransferencia } from './modais';
import { TabelaAnimais } from './tabela-animais';

const TAMANHO_PAGINA = 50;

function ConteudoAnimais({ propriedadeId }: { propriedadeId: string }) {
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [status, setStatus] = useState<StatusAnimal | 'todos'>('ativo');
  const [loteId, setLoteId] = useState('');
  const [sexo, setSexo] = useState<Sexo | ''>('');
  const [categoria, setCategoria] = useState<CategoriaAnimal | ''>('');
  const [pagina, setPagina] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [transferindo, setTransferindo] = useState(false);

  /** Mudar qualquer filtro volta para a primeira página e limpa a seleção. */
  const reiniciarLista = () => {
    setPagina(1);
    setSelecionados(new Set());
  };

  // Busca enquanto digita, com pequena espera para não consultar a cada tecla.
  useEffect(() => {
    const espera = window.setTimeout(() => {
      setBuscaAplicada(busca);
      setPagina(1);
      setSelecionados(new Set());
    }, 250);
    return () => window.clearTimeout(espera);
  }, [busca]);

  const filtros = useMemo<FiltrosAnimal>(
    () => ({
      ...(buscaAplicada.trim() ? { busca: buscaAplicada.trim() } : {}),
      status,
      ...(loteId ? { loteId } : {}),
      ...(sexo ? { sexo } : {}),
      ...(categoria ? { categoria } : {}),
      pagina,
      tamanhoPagina: TAMANHO_PAGINA,
    }),
    [buscaAplicada, status, loteId, sexo, categoria, pagina],
  );

  const animais = useAnimais(propriedadeId, filtros);
  const lotes = useLotes(propriedadeId);
  const dados = animais.data;
  const escolhidos = (dados?.itens ?? []).filter((a) => selecionados.has(a.id));
  const semFiltros = !buscaAplicada && status === 'ativo' && !loteId && !sexo && !categoria;

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        titulo="Animais"
        descricao={dados ? `${dados.total} animal(is) encontrado(s)` : undefined}
        acoes={
          <>
            <Botao
              variante="secundario"
              disabled={escolhidos.length === 0}
              onClick={() => setTransferindo(true)}
            >
              <ArrowRightLeft className="size-4" aria-hidden />
              Transferir{escolhidos.length > 0 ? ` (${escolhidos.length})` : ''}
            </Botao>
            <Link to="/rebanho/animais/novo">
              <Botao>
                <Plus className="size-4" aria-hidden />
                Novo animal
              </Botao>
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-texto-suave"
            aria-hidden
          />
          <Entrada
            aria-label="Buscar por identificação ou nome"
            placeholder="Buscar por identificação ou nome"
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Selecao
          aria-label="Situação"
          className="w-40"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusAnimal | 'todos');
            reiniciarLista();
          }}
        >
          {opcoesDe(rotulos.status, STATUS_ANIMAL)}
          <option value="todos">Todas as situações</option>
        </Selecao>
        <Selecao
          aria-label="Lote"
          className="w-44"
          value={loteId}
          onChange={(e) => {
            setLoteId(e.target.value);
            reiniciarLista();
          }}
        >
          <option value="">Todos os lotes</option>
          <option value="sem_lote">Sem lote</option>
          {(lotes.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </Selecao>
        <Selecao
          aria-label="Sexo"
          className="w-44"
          value={sexo}
          onChange={(e) => {
            setSexo(e.target.value as Sexo | '');
            reiniciarLista();
          }}
        >
          <option value="">Ambos os sexos</option>
          {opcoesDe(rotulos.sexo)}
        </Selecao>
        <Selecao
          aria-label="Categoria"
          className="w-48"
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value as CategoriaAnimal | '');
            reiniciarLista();
          }}
        >
          <option value="">Todas as categorias</option>
          {opcoesDe(rotulos.categoria, CATEGORIAS_ANIMAL)}
        </Selecao>
      </div>

      {dados && dados.total === 0 && semFiltros ? (
        <EstadoVazio
          icone={Beef}
          titulo="Nenhum animal cadastrado"
          descricao="Cadastre os animais um a um ou importe uma planilha com o rebanho."
          acao={
            <div className="flex gap-2">
              <Link to="/rebanho/animais/novo">
                <Botao>Cadastrar animal</Botao>
              </Link>
              <Link to="/rebanho/importar">
                <Botao variante="secundario">Importar planilha</Botao>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <TabelaAnimais
            animais={dados?.itens ?? []}
            selecionados={selecionados}
            aoSelecionar={setSelecionados}
            vazio="Nenhum animal corresponde aos filtros."
          />
          {dados && (
            <Paginacao
              pagina={dados.pagina}
              tamanhoPagina={dados.tamanhoPagina}
              total={dados.total}
              aoMudar={setPagina}
            />
          )}
        </>
      )}

      {transferindo && (
        <ModalTransferencia
          propriedadeId={propriedadeId}
          animais={escolhidos}
          aoFechar={() => setTransferindo(false)}
          aoConcluir={() => setSelecionados(new Set())}
        />
      )}
    </div>
  );
}

export function PaginaAnimais() {
  return <ComPropriedade>{(p) => <ConteudoAnimais propriedadeId={p.id} />}</ComPropriedade>;
}
