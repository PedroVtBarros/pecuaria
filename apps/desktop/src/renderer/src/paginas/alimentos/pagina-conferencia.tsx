import { Link } from 'react-router';
import { ClipboardCheck } from 'lucide-react';
import { usePropriedadeAtual } from '../../hooks/use-propriedade-atual';
import { mensagemDeErro } from '../../lib/api';
import { useRegistros } from '../../lib/consultas-alimentos';
import { formatarDataHora } from '../../lib/formatar';
import { Alerta } from '../../components/ui/alerta';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { avisosAlimentos, descreverFonte } from '../../textos-alimentos';
import { SeloOrigem } from './componentes-alimentos';

/** Registros transcritos esperando conferência (fontes globais e as da propriedade atual). */
export function PaginaConferencia() {
  const { propriedade, carregando } = usePropriedadeAtual();
  const fila = useRegistros(
    { status: 'transcrito', propriedadeId: propriedade?.id ?? null },
    !carregando,
  );
  const itens = fila.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Conferência"
        descricao="Registros transcritos. Releia cada valor na fonte, pela página ou tabela indicada, antes de conferir."
      />
      <Alerta tom="info" titulo={avisosAlimentos.conferenciaObrigatoria} />
      {fila.isError && <Alerta tom="perigo" titulo={mensagemDeErro(fila.error)} />}
      {itens.length === 0 ? (
        <EstadoVazio
          icone={ClipboardCheck}
          titulo={fila.isLoading ? 'Carregando' : 'Nenhum registro aguardando conferência'}
        />
      ) : (
        <Tabela data-testid="tabela-conferencia">
          <Cabeca>
            <Th>Alimento</Th>
            <Th>Origem</Th>
            <Th>Fonte</Th>
            <Th>Página ou tabela</Th>
            <Th>Valores</Th>
            <Th>Transcrito</Th>
          </Cabeca>
          <tbody>
            {itens.map((r) => (
              <Linha key={r.id}>
                <Td>
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/alimentos/registros/${r.id}`}
                  >
                    {r.alimentoNome}
                  </Link>
                  {r.substituiId && (
                    <span className="block text-xs text-texto-suave">Versão nova</span>
                  )}
                </Td>
                <Td>
                  <SeloOrigem origem={r.fonte.origem} />
                </Td>
                <Td>{descreverFonte(r.fonte)}</Td>
                <Td>{r.referenciaLocal ?? '—'}</Td>
                <Td>{r.nValores}</Td>
                <Td>
                  {r.transcritoPor} · {formatarDataHora(r.transcritoEm!)}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
    </div>
  );
}
