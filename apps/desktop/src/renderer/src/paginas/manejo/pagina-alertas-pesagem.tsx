import { useState } from 'react';
import { Link } from 'react-router';
import { CircleCheck, Pencil, ScaleIcon } from 'lucide-react';
import type { AlertaPesagemItem, Propriedade } from '@pecuaria/shared-types';
import { CATEGORIAS_ALERTA_PESAGEM, type CategoriaAlertaPesagem } from '@pecuaria/domain';
import { useAlertasPesagem } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import {
  descreverAlerta,
  formatarData,
  formatarGmd,
  formatarPeso,
  tomDoAlerta,
} from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Selecao, opcoesDe } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { ModalConferirPesagem, ModalPesagem } from '../rebanho/modal-pesagem';

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [conferidas, setConferidas] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaAlertaPesagem | ''>('');
  const alertas = useAlertasPesagem(propriedade.id, conferidas);
  const [modal, setModal] = useState<{
    tipo: 'conferir' | 'corrigir';
    item: AlertaPesagemItem;
  } | null>(null);
  const dados = alertas.data;
  const p = dados?.parametros;
  const itens = (dados?.itens ?? []).filter((i) => !categoria || i.alerta.categoria === categoria);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Alertas de pesagem"
        descricao="Pesagens dos animais ativos que merecem um segundo olhar. Nada é bloqueado: corrija o que estiver errado ou confirme o valor com uma justificativa."
      />
      {p && (
        <Alerta tom="info" titulo="Dois tipos de alerta">
          <ul className="list-disc pl-4" data-testid="explicacao-categorias">
            <li>
              <strong className="font-medium text-texto">Conferência</strong>: possível erro de
              registro (vírgula fora do lugar, peso repetido, pesagem que sobe e desce fora da
              tendência).
            </li>
            <li>
              <strong className="font-medium text-texto">Desempenho</strong>: GMD acima de{' '}
              {p.gmdMaximoKgDia !== null ? formatarGmd(p.gmdMaximoKgDia) : '(desligado)'} ou abaixo
              de {p.gmdMinimoKgDia !== null ? formatarGmd(p.gmdMinimoKgDia) : '(desligado)'}. O peso
              pode estar certo: perda ou ganho alto também acontecem de verdade.
            </li>
          </ul>
          <p className="mt-1">
            {p.intervaloCurtoDias !== null &&
              `Intervalos com menos de ${p.intervaloCurtoDias} dias aparecem marcados como curtos: neles uma pequena diferença de peso vira um GMD grande. `}
            Esses valores são parâmetros operacionais, não limites validados cientificamente.
            Ajuste-os ao seu rebanho em{' '}
            <Link to="/configuracoes" className="text-marca underline">
              Configurações
            </Link>
            .
          </p>
        </Alerta>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Campo rotulo="Tipo de alerta" className="w-56">
          {(props) => (
            <Selecao
              {...props}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaAlertaPesagem | '')}
            >
              <option value="">Todos</option>
              {opcoesDe(rotulos.categoriaAlerta, CATEGORIAS_ALERTA_PESAGEM)}
            </Selecao>
          )}
        </Campo>
        <CaixaMarcar
          rotulo="Mostrar também os já conferidos"
          marcado={conferidas}
          aoMudar={setConferidas}
        />
      </div>
      {alertas.isError && <Alerta tom="perigo" titulo={mensagemDeErro(alertas.error)} />}
      {dados && itens.length === 0 ? (
        <EstadoVazio
          icone={ScaleIcon}
          titulo="Nenhum alerta de pesagem"
          descricao="Os alertas aparecem quando uma pesagem gera GMD fora da faixa configurada, repete o peso anterior ou parece erro de digitação."
        />
      ) : (
        <Tabela data-testid="tabela-alertas-pesagem">
          <Cabeca>
            <Th>Animal</Th>
            <Th>Data</Th>
            <Th>Peso vivo</Th>
            <Th>Alerta</Th>
            <Th>Detalhe</Th>
            <Th className="text-right">Ações</Th>
          </Cabeca>
          <tbody>
            {itens.map((item) => (
              <Linha
                key={`${item.pesagem.id}-${item.alerta.tipo}`}
                data-alerta={item.animal.identificacao}
              >
                <Td className="whitespace-nowrap">
                  <Link
                    to={`/rebanho/animais/${item.animal.id}`}
                    className="font-medium text-marca hover:underline"
                  >
                    {item.animal.identificacao}
                  </Link>
                  {item.animal.lote && (
                    <span className="block text-xs text-texto-suave">
                      Lote: {item.animal.lote.nome}
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{formatarData(item.pesagem.data)}</Td>
                <Td className="whitespace-nowrap font-medium">
                  {formatarPeso(item.pesagem.pesoVivoKg)}
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <span
                      className="text-xs text-texto-suave"
                      title={rotulos.explicacaoCategoriaAlerta[item.alerta.categoria]}
                    >
                      {rotulos.categoriaAlerta[item.alerta.categoria]}
                    </span>
                    {item.conferida ? (
                      <Selo
                        tom="sucesso"
                        title={item.pesagem.justificativaConferencia ?? undefined}
                      >
                        Conferida
                      </Selo>
                    ) : (
                      <Selo tom={tomDoAlerta(item.alerta)}>
                        {rotulos.alertaPesagem[item.alerta.tipo]}
                      </Selo>
                    )}
                    {item.alerta.intervaloCurto && <Selo>Intervalo curto</Selo>}
                  </div>
                </Td>
                <Td className="max-w-md min-w-64 text-sm text-texto-suave">
                  {descreverAlerta(item.alerta, dados!.parametros)}
                  {item.conferida && item.pesagem.justificativaConferencia && (
                    <span className="block text-texto">
                      Justificativa: {item.pesagem.justificativaConferencia}
                    </span>
                  )}
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    {!item.conferida && (
                      <Botao
                        tamanho="pequeno"
                        variante="secundario"
                        onClick={() => setModal({ tipo: 'conferir', item })}
                      >
                        <CircleCheck className="size-3.5" aria-hidden />
                        Confirmar
                      </Botao>
                    )}
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      onClick={() => setModal({ tipo: 'corrigir', item })}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Corrigir
                    </Botao>
                  </div>
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {modal?.tipo === 'conferir' && dados && (
        <ModalConferirPesagem
          pesagem={modal.item.pesagem}
          descricao={`${modal.item.animal.identificacao}: ${descreverAlerta(modal.item.alerta, dados.parametros)}`}
          aoFechar={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'corrigir' && (
        <ModalPesagem
          animalId={modal.item.animal.id}
          pesagem={modal.item.pesagem}
          aoFechar={() => setModal(null)}
        />
      )}
    </div>
  );
}

export function PaginaAlertasPesagem() {
  return <ComPropriedade>{(p) => <Conteudo propriedade={p} />}</ComPropriedade>;
}
