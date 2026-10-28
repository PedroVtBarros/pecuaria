import { useState } from 'react';
import { Link } from 'react-router';
import { History, Plus } from 'lucide-react';
import type { Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useCustosAnteriores } from '../../lib/consultas-negociacao';
import { formatarData } from '../../lib/formatar-rebanho';
import { moeda } from '../../textos-financeiro';
import { textoCusteioAnimal } from '../../textos-negociacao';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { ModalCustoAnterior } from './custo-do-animal';

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [novo, setNovo] = useState(false);
  const [cancelados, setCancelados] = useState(false);
  const consulta = useCustosAnteriores({
    propriedadeId: propriedade.id,
    incluirCancelados: cancelados,
  });
  const itens = consulta.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Custo anterior ao sistema"
        descricao="Custos que animais e lotes já tinham acumulado antes de você começar a usar o sistema. São informados por você e aparecem só nos custos apropriados, nunca no caixa."
        acoes={
          <Botao onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden />
            Informar custo de um lote
          </Botao>
        }
      />
      <Alerta tom="info">{textoCusteioAnimal}</Alerta>
      <p className="text-sm text-texto-suave">
        Para um animal só, use a aba &ldquo;Custo&rdquo; na página dele. Animais comprados e
        registrados no sistema já têm o custo de aquisição e não aceitam custo anterior.
      </p>
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      <CaixaMarcar rotulo="Incluir cancelados" marcado={cancelados} aoMudar={setCancelados} />
      {itens.length === 0 ? (
        <EstadoVazio
          icone={History}
          titulo={consulta.isLoading ? 'Carregando' : 'Nenhum custo anterior informado'}
          descricao="Ausência de registro significa custo não informado, não custo zero."
        />
      ) : (
        <Tabela data-testid="tabela-custos-anteriores">
          <Cabeca>
            <Th>Referência</Th>
            <Th>Destino</Th>
            <Th>Descrição</Th>
            <Th>Origem da informação</Th>
            <Th className="text-right">Animais</Th>
            <Th className="text-right">Valor</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {itens.map((c) => (
              <Linha key={c.id} className={c.cancelado ? 'opacity-60' : undefined}>
                <Td className="whitespace-nowrap">{formatarData(c.dataReferencia)}</Td>
                <Td>
                  {c.animal ? (
                    <Link
                      className="text-marca hover:underline"
                      to={`/rebanho/animais/${c.animal.id}`}
                    >
                      Animal {c.animal.identificacao}
                    </Link>
                  ) : (
                    `Lote ${c.lote?.nome ?? ''}`
                  )}
                </Td>
                <Td>{c.descricao}</Td>
                <Td>{c.origemInformacao}</Td>
                <Td className="text-right">{c.itens.length}</Td>
                <Td className="text-right whitespace-nowrap">{moeda(c.valorCentavos)}</Td>
                <Td>{c.cancelado ? <Selo>Cancelado</Selo> : <Selo tom="marca">Informado</Selo>}</Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {novo && (
        <ModalCustoAnterior propriedadeId={propriedade.id} aoFechar={() => setNovo(false)} />
      )}
    </div>
  );
}

export function PaginaCustoAnterior() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
