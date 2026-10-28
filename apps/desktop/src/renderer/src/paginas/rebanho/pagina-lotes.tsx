import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Layers, Plus } from 'lucide-react';
import { useLotes } from '../../lib/consultas-rebanho';
import { formatarData } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { ComPropriedade } from './layout-rebanho';
import { ModalLote } from './modais';

function ConteudoLotes({ propriedadeId }: { propriedadeId: string }) {
  const navegar = useNavigate();
  const [incluirEncerrados, setIncluirEncerrados] = useState(false);
  const [novo, setNovo] = useState(false);
  const lotes = useLotes(propriedadeId, incluirEncerrados);
  const lista = lotes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Lotes"
        descricao="Grupos de manejo. Cada animal está em um lote ou sem lote; as trocas ficam no histórico do animal."
        acoes={
          <Botao onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden />
            Novo lote
          </Botao>
        }
      />
      <CaixaMarcar
        rotulo="Mostrar lotes encerrados"
        marcado={incluirEncerrados}
        aoMudar={setIncluirEncerrados}
      />
      {lotes.isSuccess && lista.length === 0 ? (
        <EstadoVazio
          icone={Layers}
          titulo="Nenhum lote cadastrado"
          descricao="Crie lotes para agrupar os animais por fase ou manejo, como cria, recria e engorda."
          acao={<Botao onClick={() => setNovo(true)}>Criar lote</Botao>}
        />
      ) : (
        <Tabela>
          <Cabeca>
            <Th>Nome</Th>
            <Th>Finalidade</Th>
            <Th>Área</Th>
            <Th>Animais ativos</Th>
            <Th>Formação</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {lista.map((l) => (
              <Linha
                key={l.id}
                clicavel
                onClick={() => navegar(`/rebanho/lotes/${l.id}`)}
                data-lote={l.nome}
              >
                <Td className="font-medium">{l.nome}</Td>
                <Td>{rotulos.finalidade[l.finalidade]}</Td>
                <Td>{l.area?.nome ?? '—'}</Td>
                <Td>{l.animaisAtivos}</Td>
                <Td>{formatarData(l.dataFormacao)}</Td>
                <Td>
                  {l.ativo ? (
                    <Selo tom="sucesso">Ativo</Selo>
                  ) : (
                    <Selo>Encerrado em {formatarData(l.dataEncerramento)}</Selo>
                  )}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {novo && (
        <ModalLote propriedadeId={propriedadeId} lote={null} aoFechar={() => setNovo(false)} />
      )}
    </div>
  );
}

export function PaginaLotes() {
  return <ComPropriedade>{(p) => <ConteudoLotes propriedadeId={p.id} />}</ComPropriedade>;
}
