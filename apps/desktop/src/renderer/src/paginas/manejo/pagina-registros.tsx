import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Syringe } from 'lucide-react';
import type { FiltrosManejo, Propriedade } from '@pecuaria/shared-types';
import { TIPOS_MANEJO_SANITARIO, type TipoManejoSanitario } from '@pecuaria/domain';
import { useLotes, useManejos } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarData, formatarDose, formatarMoeda } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio, Paginacao } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, LinhaVazia, Tabela, Td, Th } from '../../components/ui/tabela';
import { ComPropriedade } from '../rebanho/layout-rebanho';

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const navegar = useNavigate();
  const lotes = useLotes(propriedade.id, true);
  const [filtros, setFiltros] = useState<FiltrosManejo>({ pagina: 1 });
  const manejos = useManejos(propriedade.id, filtros);
  const dados = manejos.data;
  const semFiltro = !filtros.tipo && !filtros.loteId && !filtros.dataInicial && !filtros.dataFinal;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Registros sanitários"
        descricao="Tudo o que foi aplicado, tratado ou examinado, individual ou coletivamente."
        acoes={
          <Link to="/manejo/sanidade/novo">
            <Botao>
              <Plus className="size-4" aria-hidden />
              Novo registro
            </Botao>
          </Link>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Tipo">
          {(p) => (
            <Selecao
              {...p}
              value={filtros.tipo ?? ''}
              onChange={(e) => {
                const { tipo: _tipo, ...resto } = filtros;
                setFiltros(
                  e.target.value
                    ? { ...resto, tipo: e.target.value as TipoManejoSanitario, pagina: 1 }
                    : { ...resto, pagina: 1 },
                );
              }}
            >
              <option value="">Todos</option>
              {opcoesDe(rotulos.tipoManejo, TIPOS_MANEJO_SANITARIO)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Lote">
          {(p) => (
            <Selecao
              {...p}
              value={filtros.loteId ?? ''}
              onChange={(e) => {
                const { loteId: _loteId, ...resto } = filtros;
                setFiltros(
                  e.target.value
                    ? { ...resto, loteId: e.target.value, pagina: 1 }
                    : { ...resto, pagina: 1 },
                );
              }}
            >
              <option value="">Todos</option>
              {(lotes.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="De">
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={filtros.dataInicial ?? ''}
              onChange={(e) => {
                const { dataInicial: _d, ...resto } = filtros;
                setFiltros(
                  e.target.value
                    ? { ...resto, dataInicial: e.target.value, pagina: 1 }
                    : { ...resto, pagina: 1 },
                );
              }}
            />
          )}
        </Campo>
        <Campo rotulo="Até">
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={filtros.dataFinal ?? ''}
              onChange={(e) => {
                const { dataFinal: _d, ...resto } = filtros;
                setFiltros(
                  e.target.value
                    ? { ...resto, dataFinal: e.target.value, pagina: 1 }
                    : { ...resto, pagina: 1 },
                );
              }}
            />
          )}
        </Campo>
      </div>
      {manejos.isError && <Alerta tom="perigo" titulo={mensagemDeErro(manejos.error)} />}
      {dados && dados.total === 0 && semFiltro ? (
        <EstadoVazio
          icone={Syringe}
          titulo="Nenhum registro sanitário"
          descricao="Registre vacinações, vermifugações, tratamentos e exames. Em aplicações coletivas, cada animal recebe o registro no seu histórico."
          acao={
            <Link to="/manejo/sanidade/novo">
              <Botao>Novo registro</Botao>
            </Link>
          }
        />
      ) : (
        <>
          <Tabela data-testid="tabela-registros">
            <Cabeca>
              <Th>Data</Th>
              <Th>Tipo</Th>
              <Th>Produto ou descrição</Th>
              <Th>Aplicação</Th>
              <Th>Animais</Th>
              <Th>Dose</Th>
              <Th>Carência carne / leite</Th>
              <Th>Custo</Th>
            </Cabeca>
            <tbody>
              {dados?.itens.length === 0 && (
                <LinhaVazia colunas={8}>Nenhum registro com esses filtros.</LinhaVazia>
              )}
              {dados?.itens.map((m) => (
                <Linha
                  key={m.id}
                  clicavel
                  onClick={() => navegar(`/manejo/sanidade/${m.id}`)}
                  data-registro={m.produto?.nome ?? m.descricao}
                >
                  <Td className="whitespace-nowrap">{formatarData(m.data)}</Td>
                  <Td>{rotulos.tipoManejo[m.tipo]}</Td>
                  <Td className="font-medium">{m.produto?.nome ?? m.descricao}</Td>
                  <Td>
                    <Selo tom={m.abrangencia === 'coletiva' ? 'marca' : 'neutro'}>
                      {m.abrangencia === 'coletiva' ? 'Coletiva' : 'Individual'}
                    </Selo>
                    {m.lote && <span className="ml-2 text-texto-suave">{m.lote.nome}</span>}
                  </Td>
                  <Td>{m.quantidadeAnimais}</Td>
                  <Td className="whitespace-nowrap">{formatarDose(m.dose, m.unidadeDose)}</Td>
                  <Td className="whitespace-nowrap">
                    {m.carenciaCarneDias ?? '—'} / {m.carenciaLeiteDias ?? '—'}
                    {(m.carenciaCarneDias !== null || m.carenciaLeiteDias !== null) && ' dias'}
                  </Td>
                  <Td className="whitespace-nowrap">{formatarMoeda(m.custoTotalCentavos)}</Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
          {dados && (
            <Paginacao
              pagina={dados.pagina}
              tamanhoPagina={dados.tamanhoPagina}
              total={dados.total}
              aoMudar={(pagina) => setFiltros({ ...filtros, pagina })}
            />
          )}
        </>
      )}
    </div>
  );
}

export function PaginaRegistros() {
  return <ComPropriedade>{(p) => <Conteudo propriedade={p} />}</ComPropriedade>;
}
