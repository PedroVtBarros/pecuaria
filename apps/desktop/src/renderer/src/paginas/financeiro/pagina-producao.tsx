import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Factory, Plus } from 'lucide-react';
import { gerarUuidV7 } from '@pecuaria/domain';
import type { CentroProducaoDetalhe, Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { AreaTexto, CaixaMarcar, Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { useEstoque } from '../../lib/consultas-estoque';
import { useCentrosProducao } from '../../lib/consultas-producao';
import { useAreas } from '../../lib/consultas-rebanho';
import { formatarData, hojeIso } from '../../lib/formatar-rebanho';
import { situacoesCentro, textoProducao, tiposCentro } from '../../textos-producao';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { ValorApurado } from './valor-apurado';

/** Cadastro (ou edição, com o centro aberto) de um centro de produção. */
export function ModalCentro({
  propriedadeId,
  centro,
  aoFechar,
}: {
  propriedadeId: string;
  centro?: CentroProducaoDetalhe;
  aoFechar: (c?: CentroProducaoDetalhe) => void;
}) {
  const criar = useAcaoFinanceiro('producao:criar');
  const atualizar = useAcaoFinanceiro('producao:atualizar');
  const itens = useEstoque(propriedadeId);
  const areas = useAreas(propriedadeId);
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [nome, setNome] = useState(centro?.nome ?? '');
  const [tipo, setTipo] = useState<'volumoso' | 'outro'>(centro?.tipo ?? 'volumoso');
  const [itemId, setItemId] = useState(centro?.item.id ?? '');
  const [areaId, setAreaId] = useState(centro?.area?.id ?? '');
  const [dataInicio, setDataInicio] = useState(centro?.dataInicio ?? hojeIso());
  const [observacoes, setObservacoes] = useState(centro?.observacoes ?? '');
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const ativos = (itens.data ?? []).filter((i) => i.ativo);
  return (
    <Modal
      aberto
      largura="lg"
      titulo={centro ? 'Editar centro de produção' : 'Novo centro de produção'}
      descricao="O item produzido recebe a entrada de produção no estoque quando o centro for encerrado."
      aoFechar={() => aoFechar()}
      textoEnviar={centro ? 'Salvar' : 'Criar centro'}
      enviando={criar.isPending || atualizar.isPending}
      erros={erros}
      aoEnviar={() => {
        const problemas: string[] = [];
        if (!nome.trim()) problemas.push('Informe o nome do centro.');
        if (!centro && !itemId) problemas.push('Escolha o item que será produzido.');
        if (centro && !motivo.trim()) problemas.push('Informe o motivo da alteração.');
        if (problemas.length) return setErros(problemas);
        const dados = {
          nome: nome.trim(),
          tipo,
          areaId: areaId || null,
          dataInicio,
          observacoes: observacoes.trim() || null,
        };
        const tratar = {
          onSuccess: aoFechar,
          onError: (e: unknown) => setErros([mensagemDeErro(e)]),
        };
        if (centro) atualizar.mutate({ id: centro.id, dados, motivo: motivo.trim() }, tratar);
        else
          criar.mutate(
            { requisicaoId, propriedadeId, dados: { ...dados, estoqueItemId: itemId } },
            tratar,
          );
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Tipo">
          {(p) => (
            <Selecao
              {...p}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'volumoso' | 'outro')}
            >
              <option value="volumoso">{tiposCentro.volumoso}</option>
              <option value="outro">{tiposCentro.outro}</option>
            </Selecao>
          )}
        </Campo>
        <Campo
          rotulo="Item produzido"
          obrigatorio
          ajuda={
            centro
              ? 'Não muda depois de criado.'
              : 'Cadastre o item no Estoque antes, se ainda não existir.'
          }
        >
          {(p) => (
            <Selecao
              {...p}
              value={itemId}
              disabled={Boolean(centro)}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">Escolher…</option>
              {ativos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome} ({i.unidadeBase})
                </option>
              ))}
              {centro && !ativos.some((i) => i.id === centro.item.id) && (
                <option value={centro.item.id}>{centro.item.nome}</option>
              )}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Área (opcional)">
          {(p) => (
            <Selecao {...p} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Sem área</option>
              {(areas.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Início" obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={dataInicio}
              max={hojeIso()}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          )}
        </Campo>
      </div>
      <Campo rotulo="Observações">
        {(p) => (
          <AreaTexto
            {...p}
            rows={2}
            maxLength={500}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        )}
      </Campo>
      {centro && (
        <Campo rotulo="Motivo da alteração" obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
            />
          )}
        </Campo>
      )}
    </Modal>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [cancelados, setCancelados] = useState(false);
  const [novo, setNovo] = useState(false);
  const navegar = useNavigate();
  const centros = useCentrosProducao(propriedade.id, cancelados);
  const lista = centros.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Produção própria"
        descricao="Centros de produção de volumosos e outros itens: o custo de produzir vira o custo de entrada no estoque."
        acoes={
          <Botao onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden /> Novo centro
          </Botao>
        }
      />
      <Alerta tom="info">{textoProducao}</Alerta>
      {centros.isError && <Alerta tom="perigo" titulo={mensagemDeErro(centros.error)} />}
      <CaixaMarcar rotulo="Mostrar cancelados" marcado={cancelados} aoMudar={setCancelados} />
      {centros.isSuccess && lista.length === 0 ? (
        <EstadoVazio
          icone={Factory}
          titulo="Nenhum centro de produção"
          descricao="Crie um centro para reunir o custo de uma capineira, silagem ou outro item produzido na fazenda."
        />
      ) : (
        <Tabela data-testid="tabela-centros">
          <Cabeca>
            <Th>Centro</Th>
            <Th>Item produzido</Th>
            <Th>Período</Th>
            <Th className="text-right">Custo até aqui</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {lista.map((c) => (
              <Linha key={c.id}>
                <Td>
                  <Link className="text-marca hover:underline" to={`/financeiro/producao/${c.id}`}>
                    {c.nome}
                  </Link>
                </Td>
                <Td>{c.item.nome}</Td>
                <Td className="whitespace-nowrap">
                  {formatarData(c.dataInicio)}
                  {c.dataFim ? ` a ${formatarData(c.dataFim)}` : ''}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <ValorApurado a={c.apuracao} />
                </Td>
                <Td>
                  {c.cancelado ? (
                    <Selo>Cancelado</Selo>
                  ) : (
                    <Selo tom={c.status === 'aberto' ? 'marca' : 'sucesso'}>
                      {situacoesCentro[c.status]}
                    </Selo>
                  )}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {novo && (
        <ModalCentro
          propriedadeId={propriedade.id}
          aoFechar={(c) => {
            setNovo(false);
            if (c) void navegar(`/financeiro/producao/${c.id}`);
          }}
        />
      )}
    </div>
  );
}

export function PaginaProducao() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
