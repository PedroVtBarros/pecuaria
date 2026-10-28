import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Package, Plus } from 'lucide-react';
import type { Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useComprasInsumos } from '../../lib/consultas-insumos';
import { formatarData } from '../../lib/formatar-rebanho';
import { avisoGeral, moeda } from '../../textos-financeiro';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { ModalCompraInsumos } from './modal-compra-insumos';

const TAMANHO_PAGINA = 50;

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const navegar = useNavigate();
  const [nova, setNova] = useState(false);
  const [canceladas, setCanceladas] = useState(false);
  const [pagina, setPagina] = useState(1);
  const consulta = useComprasInsumos({
    propriedadeId: propriedade.id,
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
        titulo="Compras de insumos"
        descricao="Cada compra é um lançamento financeiro ligado às entradas físicas do estoque. O custo só aparece nos animais e lotes quando o insumo é consumido; comprar não é gastar."
        acoes={
          <Botao onClick={() => setNova(true)}>
            <Plus className="size-4" aria-hidden />
            Registrar compra
          </Botao>
        }
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      <CaixaMarcar
        rotulo="Incluir canceladas"
        marcado={canceladas}
        aoMudar={(v) => {
          setCanceladas(v);
          setPagina(1);
        }}
      />
      {itens.length === 0 ? (
        <EstadoVazio
          icone={Package}
          titulo={
            consulta.isLoading ? 'Carregando compras' : 'Nenhuma compra de insumos registrada'
          }
          descricao="Registre a compra para criar o lançamento e as entradas no estoque de uma vez. Entradas antigas sem documento aparecem em Pendências."
        />
      ) : (
        <Tabela data-testid="tabela-compras-insumos">
          <Cabeca>
            <Th>Data</Th>
            <Th>Compra</Th>
            <Th>Fornecedor</Th>
            <Th className="text-right">Itens</Th>
            <Th className="text-right">Soma dos itens</Th>
            <Th className="text-right">Valor da operação</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {itens.map((c) => (
              <Linha
                key={c.lancamentoId}
                clicavel
                className={c.cancelada ? 'opacity-60' : undefined}
                onClick={() => navegar(`/financeiro/insumos/${c.lancamentoId}`)}
              >
                <Td className="whitespace-nowrap">{formatarData(c.data)}</Td>
                <Td>
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/financeiro/insumos/${c.lancamentoId}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.descricao}
                  </Link>
                  {c.documentoNumero && (
                    <div className="text-xs text-texto-suave">Doc. {c.documentoNumero}</div>
                  )}
                </Td>
                <Td>{c.pessoaNome ?? '—'}</Td>
                <Td className="text-right">{c.quantidadeItens}</Td>
                <Td className="text-right whitespace-nowrap">{moeda(c.somaItensCentavos)}</Td>
                <Td className="text-right whitespace-nowrap">{moeda(c.valorTotalCentavos)}</Td>
                <Td>
                  {c.cancelada ? (
                    <Selo>Cancelada</Selo>
                  ) : c.diferencaCentavos !== 0 ? (
                    <Selo tom="alerta">Diferença {moeda(c.diferencaCentavos)}</Selo>
                  ) : c.origem === 'manual' ? (
                    <Selo tom="marca">Ligada depois</Selo>
                  ) : (
                    <Selo tom="sucesso">Conferida</Selo>
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
            {total} compras · página {pagina} de {paginas}
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
      {nova && (
        <ModalCompraInsumos
          propriedadeId={propriedade.id}
          aoFechar={() => setNova(false)}
          aoRegistrar={(c) => navegar(`/financeiro/insumos/${c.lancamentoId}`)}
        />
      )}
    </div>
  );
}

export function PaginaComprasInsumos() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
