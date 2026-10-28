import { useState } from 'react';
import { Fence, Pencil, Plus, Trash2 } from 'lucide-react';
import { esquemaDadosArea, type Area } from '@pecuaria/shared-types';
import { TIPOS_AREA, type TipoArea } from '@pecuaria/domain';
import { useAcaoRebanho, useAreas } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarArea } from '../../lib/formatar-rebanho';
import { textoParaNumero, useFormulario, vazioParaNulo } from '../../hooks/use-formulario';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Botao } from '../../components/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { DialogoConfirmacao } from '../../components/ui/dialogo-confirmacao';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { ComPropriedade } from './layout-rebanho';

function FormularioArea({
  propriedadeId,
  area,
  aoFechar,
}: {
  propriedadeId: string;
  area: Area | null;
  aoFechar: () => void;
}) {
  const { notificar } = useNotificacoes();
  const criar = useAcaoRebanho('area:criar');
  const atualizar = useAcaoRebanho('area:atualizar');
  const form = useFormulario({
    inicial: {
      nome: area?.nome ?? '',
      tipo: (area?.tipo ?? 'piquete') as TipoArea,
      areaHa: area?.areaHa?.toLocaleString('pt-BR') ?? '',
      observacoes: area?.observacoes ?? '',
    },
    esquema: esquemaDadosArea,
    converter: (v) => ({
      nome: v.nome,
      tipo: v.tipo,
      areaHa: textoParaNumero(v.areaHa),
      observacoes: vazioParaNulo(v.observacoes),
    }),
  });
  const { valores, definir, errosCampos } = form;
  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    const fim = {
      onSuccess: () => {
        notificar(area ? 'Área atualizada.' : 'Área cadastrada.', 'sucesso');
        aoFechar();
      },
      onError: form.mostrarErroDoServidor,
    };
    if (area) atualizar.mutate({ id: area.id, dados }, fim);
    else criar.mutate({ propriedadeId, dados }, fim);
  };
  return (
    <Modal
      aberto
      titulo={area ? 'Editar área' : 'Nova área'}
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={area ? 'Salvar alterações' : 'Cadastrar'}
      enviando={criar.isPending || atualizar.isPending}
      erros={form.errosGerais}
    >
      <Campo rotulo="Nome" obrigatorio erro={errosCampos['nome']}>
        {(p) => (
          <Entrada
            {...p}
            value={valores.nome}
            onChange={(e) => definir('nome', e.target.value)}
            autoFocus
          />
        )}
      </Campo>
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Tipo" obrigatorio erro={errosCampos['tipo']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.tipo}
              onChange={(e) => definir('tipo', e.target.value as TipoArea)}
            >
              {opcoesDe(rotulos.tipoArea, TIPOS_AREA)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Área (ha)" erro={errosCampos['areaHa']}>
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={valores.areaHa}
              onChange={(e) => definir('areaHa', e.target.value)}
            />
          )}
        </Campo>
      </div>
      <Campo rotulo="Observações" erro={errosCampos['observacoes']}>
        {(p) => (
          <AreaTexto
            {...p}
            value={valores.observacoes}
            onChange={(e) => definir('observacoes', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

function ConteudoAreas({ propriedadeId }: { propriedadeId: string }) {
  const areas = useAreas(propriedadeId);
  const excluir = useAcaoRebanho('area:excluir');
  const { notificar } = useNotificacoes();
  const [formulario, setFormulario] = useState<{ aberto: boolean; area: Area | null }>({
    aberto: false,
    area: null,
  });
  const [paraExcluir, setParaExcluir] = useState<Area | null>(null);
  const lista = areas.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Áreas"
        descricao="Piquetes, currais, baias e confinamentos onde os lotes ficam."
        acoes={
          <Botao onClick={() => setFormulario({ aberto: true, area: null })}>
            <Plus className="size-4" aria-hidden />
            Nova área
          </Botao>
        }
      />
      {areas.isSuccess && lista.length === 0 ? (
        <EstadoVazio
          icone={Fence}
          titulo="Nenhuma área cadastrada"
          descricao="Cadastrar áreas é opcional. Elas servem para registrar onde cada lote está."
        />
      ) : (
        <Tabela>
          <Cabeca>
            <Th>Nome</Th>
            <Th>Tipo</Th>
            <Th>Área</Th>
            <Th>Lotes ativos</Th>
            <Th>Observações</Th>
            <Th className="text-right">Ações</Th>
          </Cabeca>
          <tbody>
            {lista.map((a) => (
              <Linha key={a.id}>
                <Td className="font-medium">{a.nome}</Td>
                <Td>{rotulos.tipoArea[a.tipo]}</Td>
                <Td>{formatarArea(a.areaHa)}</Td>
                <Td>{a.lotesAtivos}</Td>
                <Td className="max-w-64 truncate text-texto-suave">{a.observacoes ?? '—'}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Botao
                      tamanho="pequeno"
                      variante="fantasma"
                      aria-label={`Editar ${a.nome}`}
                      onClick={() => setFormulario({ aberto: true, area: a })}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Botao>
                    <Botao
                      tamanho="pequeno"
                      variante="fantasma"
                      aria-label={`Excluir ${a.nome}`}
                      onClick={() => setParaExcluir(a)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Botao>
                  </div>
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {formulario.aberto && (
        <FormularioArea
          propriedadeId={propriedadeId}
          area={formulario.area}
          aoFechar={() => setFormulario({ aberto: false, area: null })}
        />
      )}
      <DialogoConfirmacao
        aberto={paraExcluir !== null}
        titulo="Excluir área?"
        descricao={`A área "${paraExcluir?.nome ?? ''}" será excluída. O histórico de lotes que passaram por ela é mantido.`}
        textoConfirmar="Excluir"
        perigoso
        carregando={excluir.isPending}
        aoCancelar={() => setParaExcluir(null)}
        aoConfirmar={() =>
          paraExcluir &&
          excluir.mutate(
            { id: paraExcluir.id },
            {
              onSuccess: () => notificar('Área excluída.', 'sucesso'),
              onError: (e) => notificar(mensagemDeErro(e), 'perigo'),
              onSettled: () => setParaExcluir(null),
            },
          )
        }
      />
    </div>
  );
}

export function PaginaAreas() {
  return <ComPropriedade>{(p) => <ConteudoAreas propriedadeId={p.id} />}</ComPropriedade>;
}
