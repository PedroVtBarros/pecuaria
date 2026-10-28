import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Beef, Plus } from 'lucide-react';
import type { Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Selecao } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useNegociacoes } from '../../lib/consultas-negociacao';
import { formatarData } from '../../lib/formatar-rebanho';
import { avisoGeral, moeda, situacaoDoLancamento, tomDaSituacao } from '../../textos-financeiro';
import { tiposNegociacao, unidadesPrecoCurtas } from '../../textos-negociacao';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { ModalCompra } from './modal-compra';
import { ModalVenda } from './modal-venda';

const TAMANHO_PAGINA = 50;

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const navegar = useNavigate();
  const [aberto, setAberto] = useState<'compra' | 'venda' | null>(null);
  const [tipo, setTipo] = useState('');
  const [canceladas, setCanceladas] = useState(false);
  const [pagina, setPagina] = useState(1);
  const consulta = useNegociacoes({
    propriedadeId: propriedade.id,
    ...(tipo ? { tipo: tipo as 'compra' | 'venda' } : {}),
    incluirCanceladas: canceladas,
    pagina,
    tamanhoPagina: TAMANHO_PAGINA,
  });
  const itens = consulta.data?.itens ?? [];
  const total = consulta.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Compras e vendas de animais"
        descricao="Cada negociação reúne os animais, o valor de cada um e o lançamento financeiro. O valor da operação, o que falta pagar ou receber e o que foi efetivamente pago ou recebido ficam sempre separados."
        acoes={
          <>
            <Botao onClick={() => setAberto('compra')}>
              <Plus className="size-4" aria-hidden />
              Registrar compra
            </Botao>
            <Botao variante="secundario" onClick={() => setAberto('venda')}>
              <Plus className="size-4" aria-hidden />
              Registrar venda
            </Botao>
          </>
        }
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      <div className="flex flex-wrap items-end gap-4">
        <Campo rotulo="Tipo">
          {(p) => (
            <Selecao
              {...p}
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value);
                setPagina(1);
              }}
            >
              <option value="">Compras e vendas</option>
              <option value="compra">Compras</option>
              <option value="venda">Vendas</option>
            </Selecao>
          )}
        </Campo>
        <CaixaMarcar
          rotulo="Incluir canceladas"
          marcado={canceladas}
          aoMudar={(v) => {
            setCanceladas(v);
            setPagina(1);
          }}
        />
      </div>
      {itens.length === 0 ? (
        <EstadoVazio
          icone={Beef}
          titulo={consulta.isLoading ? 'Carregando negociações' : 'Nenhuma negociação encontrada'}
          descricao="Compras criam os animais no rebanho; vendas dão a saída deles. Nada financeiro é criado sem o seu registro."
        />
      ) : (
        <Tabela data-testid="tabela-negociacoes">
          <Cabeca>
            <Th>Data</Th>
            <Th>Tipo</Th>
            <Th>Contraparte</Th>
            <Th className="text-right">Animais</Th>
            <Th>Preço</Th>
            <Th className="text-right">Valor da operação</Th>
            <Th className="text-right">A pagar / a receber</Th>
            <Th className="text-right">Pago / recebido</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {itens.map((n) => (
              <Linha
                key={n.id}
                clicavel
                className={n.cancelada ? 'opacity-60' : undefined}
                onClick={() => navegar(`/financeiro/animais/${n.id}`)}
              >
                <Td className="whitespace-nowrap">{formatarData(n.data)}</Td>
                <Td>
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/financeiro/animais/${n.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {tiposNegociacao[n.tipo]}
                  </Link>
                </Td>
                <Td>{n.pessoa?.nome ?? '—'}</Td>
                <Td className="text-right">{n.quantidadeAnimais}</Td>
                <Td className="whitespace-nowrap">
                  {n.precoUnitarioCentavos === null
                    ? 'Valor total'
                    : `${moeda(n.precoUnitarioCentavos)} ${unidadesPrecoCurtas[n.unidadePreco]}`}
                </Td>
                <Td className="text-right whitespace-nowrap">{moeda(n.valorTotalCentavos)}</Td>
                <Td className="text-right whitespace-nowrap">{moeda(n.saldoEmAbertoCentavos)}</Td>
                <Td className="text-right whitespace-nowrap">{moeda(n.pagoCentavos)}</Td>
                <Td>
                  {n.cancelada ? (
                    <Selo>Cancelada</Selo>
                  ) : (
                    <Selo tom={tomDaSituacao[n.situacaoFinanceira]}>
                      {situacaoDoLancamento(
                        n.situacaoFinanceira,
                        n.tipo === 'venda' ? 'receita' : 'despesa',
                        n.compensadoCentavos,
                      )}
                    </Selo>
                  )}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {total > TAMANHO_PAGINA && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-texto-suave">
            {total} negociações · página {pagina} de {paginas}
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
      {aberto === 'compra' && (
        <ModalCompra
          propriedadeId={propriedade.id}
          aoFechar={() => setAberto(null)}
          aoRegistrar={(n) => navegar(`/financeiro/animais/${n.id}`)}
        />
      )}
      {aberto === 'venda' && (
        <ModalVenda
          propriedadeId={propriedade.id}
          aoFechar={() => setAberto(null)}
          aoRegistrar={(n) => navegar(`/financeiro/animais/${n.id}`)}
        />
      )}
    </div>
  );
}

export function PaginaNegociacoes() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
