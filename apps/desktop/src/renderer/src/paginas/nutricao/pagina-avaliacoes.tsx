import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ClipboardList, Plus } from 'lucide-react';
import type { AvaliacaoNutricionalGravada } from '@pecuaria/shared-types';
import { ErroChamadaApi, mensagemDeErro } from '../../lib/api';
import {
  useAnularAvaliacao,
  useAvaliacaoNutricional,
  useAvaliacoesNutricionais,
} from '../../lib/consultas-nutricao';
import { formatarDataHora } from '../../lib/formatar';
import { tiposQuantidade } from '../../textos-nutricao';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo } from '../../components/ui/cartao';
import { AreaTexto, Campo, Entrada } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { ResultadoAvaliacao } from './resultado-avaliacao';

/*
 * Fase 6B-5: avaliações nutricionais gravadas (6B-4). Nada é recalculado: a tela mostra o retrato
 * como gravado, com versões e SHA-256. Anulada, divergente (D-6B4-04) ou com perfil inelegível
 * (D-6B4-01) fica identificada e sem uso operacional; a anulação não muda o retrato (D-6B4-03).
 */

function Selos({
  parcial,
  anulada,
  integridade,
  usoOperacional,
}: {
  parcial: boolean;
  anulada: boolean;
  integridade: 'conferida' | 'divergente';
  usoOperacional: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {anulada && <Selo tom="perigo">Anulada</Selo>}
      {integridade === 'divergente' && <Selo tom="perigo">Integridade divergente</Selo>}
      {parcial && <Selo tom="alerta">Parcial</Selo>}
      {usoOperacional ? (
        <Selo tom="sucesso">Pode ser usada</Selo>
      ) : (
        <Selo tom="neutro">Sem uso operacional</Selo>
      )}
    </div>
  );
}

export function PaginaAvaliacoes() {
  const lista = useAvaliacoesNutricionais();
  const navegar = useNavigate();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Avaliações gravadas"
        descricao="Retratos imutáveis das avaliações de dieta, com dados, hipóteses, versões e resultados como foram calculados."
        acoes={
          <Botao onClick={() => void navegar('/nutricao/dieta')}>
            <Plus className="size-4" aria-hidden />
            Nova avaliação
          </Botao>
        }
      />
      {lista.isError && (
        <Alerta tom="perigo" titulo="Não foi possível carregar">
          {mensagemDeErro(lista.error)}
        </Alerta>
      )}
      {lista.isSuccess && lista.data.length === 0 && (
        <EstadoVazio
          icone={ClipboardList}
          titulo="Nenhuma avaliação gravada"
          descricao="Avalie uma dieta e use “Gravar avaliação” para guardar o resultado."
        />
      )}
      {lista.isSuccess && lista.data.length > 0 && (
        <Tabela data-testid="lista-avaliacoes">
          <Cabeca>
            <Th>Avaliação</Th>
            <Th>Gravada</Th>
            <Th>Quantidade</Th>
            <Th>Alimentos</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {lista.data.map((a) => (
              <Linha key={a.id} data-testid={`avaliacao-${a.id}`}>
                <Td>
                  <Link to={`/nutricao/avaliacoes/${a.id}`} className="font-medium text-marca">
                    {a.rotulo}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">
                  {formatarDataHora(a.registradoEm)} · {a.registradoPor}
                </Td>
                <Td className="text-xs">{tiposQuantidade[a.tipoQuantidade]}</Td>
                <Td className="text-xs break-words">
                  {a.perfis.map((p) => p.alimentoNome).join(', ')}
                </Td>
                <Td>
                  <Selos {...a} />
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
    </div>
  );
}

export function PaginaAvaliacao() {
  const { id = '' } = useParams();
  const consulta = useAvaliacaoNutricional(id);
  const [anulando, setAnulando] = useState(false);
  const voltar = { para: '/nutricao/avaliacoes', rotulo: 'Avaliações gravadas' };
  if (consulta.isError)
    return (
      <div className="flex flex-col gap-6">
        <CabecalhoPagina titulo="Avaliação" voltar={voltar} />
        <Alerta tom="perigo" titulo="Não foi possível abrir">
          {mensagemDeErro(consulta.error)}
        </Alerta>
      </div>
    );
  if (!consulta.data) return <p className="text-sm text-texto-suave">Carregando…</p>;
  const g = consulta.data;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo={g.rotulo}
        voltar={voltar}
        selo={
          <Selos
            parcial={g.avaliacao.situacao.parcial}
            anulada={g.anulacao !== null}
            integridade={g.integridade}
            usoOperacional={g.usoOperacional}
          />
        }
        acoes={
          g.anulacao === null && (
            <Botao variante="perigo" onClick={() => setAnulando(true)}>
              Anular
            </Botao>
          )
        }
      />
      {g.integridade === 'divergente' && (
        <Alerta tom="perigo" titulo="Integridade divergente: só para investigação">
          O conteúdo gravado não confere com o código SHA-256 registrado. Pode ser consultado para
          investigar, mas não deve ser usado em decisões. Restaure um backup se necessário.
        </Alerta>
      )}
      {g.anulacao && (
        <Alerta tom="perigo" titulo="Avaliação anulada">
          Anulada por {g.anulacao.anuladoPor} em {formatarDataHora(g.anulacao.anuladoEm)}: “
          {g.anulacao.motivo}”. O retrato abaixo continua como foi gravado.
        </Alerta>
      )}
      <Cartao>
        <CartaoConteudo className="pt-6">
          <ListaDados
            itens={[
              {
                rotulo: 'Gravada',
                valor: `${formatarDataHora(g.registradoEm)} por ${g.registradoPor}`,
              },
              { rotulo: 'Observação', valor: g.observacao ?? '—' },
              {
                rotulo: 'Quantidade',
                valor: tiposQuantidade[g.avaliacao.entrada.dieta.tipo],
              },
              {
                rotulo: 'Versões',
                valor: `Motor ${g.avaliacao.versaoMotor}; formato do retrato ${g.formatoVersao}`,
              },
              {
                rotulo: 'SHA-256 do retrato',
                valor: (
                  <span className="font-mono text-xs break-all" data-testid="hash-avaliacao">
                    {g.conteudoSha256} ({g.integridade === 'conferida' ? 'conferido' : 'divergente'}
                    )
                  </span>
                ),
              },
              ...(g.situacaoCalculadaNaLeitura
                ? [
                    {
                      rotulo: 'Situação',
                      valor:
                        'Retrato de formato 1: a situação (parcial e uso operacional) foi calculada na leitura, a partir do próprio retrato.',
                    },
                  ]
                : []),
            ]}
          />
        </CartaoConteudo>
      </Cartao>
      <ResultadoAvaliacao
        avaliacao={g.avaliacao}
        operacional={{ usoOperacional: g.usoOperacional, bloqueios: g.bloqueios }}
      />
      {anulando && <ModalAnular avaliacao={g} aoFechar={() => setAnulando(false)} />}
    </div>
  );
}

function ModalAnular({
  avaliacao,
  aoFechar,
}: {
  avaliacao: AvaliacaoNutricionalGravada;
  aoFechar: () => void;
}) {
  const anular = useAnularAvaliacao();
  const { notificar } = useNotificacoes();
  const [motivo, setMotivo] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      titulo="Anular avaliação"
      descricao="A anulação fica registrada à parte, com o motivo, quem e quando. O retrato gravado não muda e continua consultável."
      aoFechar={aoFechar}
      aoEnviar={() =>
        anular.mutate(
          { id: avaliacao.id, motivo, responsavel },
          {
            onSuccess: () => {
              notificar('Avaliação anulada.', 'sucesso');
              aoFechar();
            },
            onError: (e) =>
              setErros(
                e instanceof ErroChamadaApi && e.detalhes.length > 0
                  ? e.detalhes
                  : [mensagemDeErro(e)],
              ),
          },
        )
      }
      textoEnviar="Anular"
      perigoso
      enviando={anular.isPending}
      erros={erros}
    >
      <Campo rotulo="Motivo da anulação" obrigatorio>
        {(p) => <AreaTexto {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
      </Campo>
      <Campo rotulo="Nome de quem anula" obrigatorio>
        {(p) => (
          <Entrada {...p} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        )}
      </Campo>
    </Modal>
  );
}
