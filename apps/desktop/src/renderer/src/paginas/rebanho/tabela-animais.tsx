import { useNavigate } from 'react-router';
import type { AnimalResumo } from '@pecuaria/shared-types';
import { formatarData, formatarIdade, formatarPeso } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, LinhaVazia, Tabela, Td, Th } from '../../components/ui/tabela';

/** Tabela de animais com seleção múltipla. Usada na lista geral e no detalhe do lote. */
export function TabelaAnimais({
  animais,
  selecionados,
  aoSelecionar,
  mostrarLote = true,
  vazio,
}: {
  animais: AnimalResumo[];
  selecionados: Set<string>;
  aoSelecionar: (ids: Set<string>) => void;
  mostrarLote?: boolean;
  vazio: string;
}) {
  const navegar = useNavigate();
  const todosMarcados = animais.length > 0 && animais.every((a) => selecionados.has(a.id));
  const alternar = (id: string) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    aoSelecionar(novo);
  };
  const colunas = mostrarLote ? 9 : 8;

  return (
    <Tabela>
      <Cabeca>
        <Th className="w-10">
          <input
            type="checkbox"
            className="size-4 cursor-pointer accent-marca"
            aria-label="Selecionar todos"
            checked={todosMarcados}
            onChange={() =>
              aoSelecionar(todosMarcados ? new Set() : new Set(animais.map((a) => a.id)))
            }
          />
        </Th>
        <Th>Identificação</Th>
        <Th>Nome</Th>
        <Th>Categoria</Th>
        <Th>Raça</Th>
        {mostrarLote && <Th>Lote</Th>}
        <Th>Idade</Th>
        <Th>Último peso vivo</Th>
        <Th>Situação</Th>
      </Cabeca>
      <tbody>
        {animais.length === 0 && <LinhaVazia colunas={colunas}>{vazio}</LinhaVazia>}
        {animais.map((a) => (
          <Linha
            key={a.id}
            clicavel
            onClick={() => navegar(`/rebanho/animais/${a.id}`)}
            data-animal={a.identificacao}
          >
            <Td onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                className="size-4 cursor-pointer accent-marca"
                aria-label={`Selecionar ${a.identificacao}`}
                checked={selecionados.has(a.id)}
                onChange={() => alternar(a.id)}
              />
            </Td>
            <Td className="font-medium">{a.identificacao}</Td>
            <Td>{a.nome ?? '—'}</Td>
            <Td>{rotulos.categoria[a.categoria]}</Td>
            <Td>{a.raca?.nome ?? '—'}</Td>
            {mostrarLote && (
              <Td>{a.lote?.nome ?? <span className="text-texto-suave">Sem lote</span>}</Td>
            )}
            <Td className="whitespace-nowrap">{formatarIdade(a.dataNascimento)}</Td>
            <Td className="whitespace-nowrap">
              {a.ultimaPesagem ? (
                <span title={`Pesado em ${formatarData(a.ultimaPesagem.data)}`}>
                  {formatarPeso(a.ultimaPesagem.pesoVivoKg)}
                  <span className="ml-1 text-xs text-texto-suave">
                    {formatarData(a.ultimaPesagem.data)}
                  </span>
                </span>
              ) : (
                '—'
              )}
            </Td>
            <Td>
              <Selo tom={a.status === 'ativo' ? 'sucesso' : 'neutro'}>
                {rotulos.status[a.status]}
              </Selo>
            </Td>
          </Linha>
        ))}
      </tbody>
    </Tabela>
  );
}
