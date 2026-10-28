import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { esquemaDadosRaca, type Raca } from '@pecuaria/shared-types';
import {
  APTIDOES_RACA,
  GRUPOS_GENETICOS,
  type AptidaoRaca,
  type GrupoGenetico,
} from '@pecuaria/domain';
import { useAcaoRebanho, useRacas } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { useFormulario } from '../../hooks/use-formulario';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { DialogoConfirmacao } from '../../components/ui/dialogo-confirmacao';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';

function FormularioRaca({ raca, aoFechar }: { raca: Raca | null; aoFechar: () => void }) {
  const { notificar } = useNotificacoes();
  const criar = useAcaoRebanho('raca:criar');
  const atualizar = useAcaoRebanho('raca:atualizar');
  const form = useFormulario({
    inicial: {
      nome: raca?.nome ?? '',
      aptidao: (raca?.aptidao ?? 'corte') as AptidaoRaca,
      grupoGenetico: (raca?.grupoGenetico ?? 'indefinido') as GrupoGenetico,
    },
    esquema: esquemaDadosRaca,
    converter: (v) => v,
  });
  const { valores, definir, errosCampos } = form;
  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    const fim = {
      onSuccess: () => {
        notificar(raca ? 'Raça atualizada.' : 'Raça cadastrada.', 'sucesso');
        aoFechar();
      },
      onError: form.mostrarErroDoServidor,
    };
    if (raca) atualizar.mutate({ id: raca.id, dados }, fim);
    else criar.mutate({ dados }, fim);
  };
  return (
    <Modal
      aberto
      titulo={raca ? 'Editar raça' : 'Nova raça'}
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={raca ? 'Salvar alterações' : 'Cadastrar'}
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
        <Campo rotulo="Aptidão" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={valores.aptidao}
              onChange={(e) => definir('aptidao', e.target.value as AptidaoRaca)}
            >
              {opcoesDe(rotulos.aptidaoRaca, APTIDOES_RACA)}
            </Selecao>
          )}
        </Campo>
        <Campo
          rotulo="Grupo genético"
          obrigatorio
          ajuda="Será usado pelo módulo de nutrição (Fase 6)."
        >
          {(p) => (
            <Selecao
              {...p}
              value={valores.grupoGenetico}
              onChange={(e) => definir('grupoGenetico', e.target.value as GrupoGenetico)}
            >
              {opcoesDe(rotulos.grupoGenetico, GRUPOS_GENETICOS)}
            </Selecao>
          )}
        </Campo>
      </div>
    </Modal>
  );
}

export function PaginaRacas() {
  const racas = useRacas();
  const excluir = useAcaoRebanho('raca:excluir');
  const { notificar } = useNotificacoes();
  const [formulario, setFormulario] = useState<{ aberto: boolean; raca: Raca | null }>({
    aberto: false,
    raca: null,
  });
  const [paraExcluir, setParaExcluir] = useState<Raca | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Raças"
        descricao="Catálogo de raças. As raças sugeridas podem ser editadas ou excluídas, se não estiverem em uso."
        acoes={
          <Botao onClick={() => setFormulario({ aberto: true, raca: null })}>
            <Plus className="size-4" aria-hidden />
            Nova raça
          </Botao>
        }
      />
      <Alerta tom="info" titulo="Classificação geral">
        Aptidão e grupo genético das raças sugeridas são classificações gerais de referência. O
        grupo genético será revisado junto com as categorias do BR-CORTE na Fase 6.
      </Alerta>
      <Tabela>
        <Cabeca>
          <Th>Nome</Th>
          <Th>Aptidão</Th>
          <Th>Grupo genético</Th>
          <Th>Origem</Th>
          <Th>Animais</Th>
          <Th className="text-right">Ações</Th>
        </Cabeca>
        <tbody>
          {(racas.data ?? []).map((r) => (
            <Linha key={r.id}>
              <Td className="font-medium">{r.nome}</Td>
              <Td>{rotulos.aptidaoRaca[r.aptidao]}</Td>
              <Td>{rotulos.grupoGenetico[r.grupoGenetico]}</Td>
              <Td>
                {r.origem === 'sugestao' ? (
                  <Selo>Sugerida</Selo>
                ) : (
                  <Selo tom="marca">Cadastrada por você</Selo>
                )}
              </Td>
              <Td>{r.animaisVinculados}</Td>
              <Td>
                <div className="flex justify-end gap-1">
                  <Botao
                    tamanho="pequeno"
                    variante="fantasma"
                    aria-label={`Editar ${r.nome}`}
                    onClick={() => setFormulario({ aberto: true, raca: r })}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Botao>
                  <Botao
                    tamanho="pequeno"
                    variante="fantasma"
                    aria-label={`Excluir ${r.nome}`}
                    onClick={() => setParaExcluir(r)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Botao>
                </div>
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
      {formulario.aberto && (
        <FormularioRaca
          raca={formulario.raca}
          aoFechar={() => setFormulario({ aberto: false, raca: null })}
        />
      )}
      <DialogoConfirmacao
        aberto={paraExcluir !== null}
        titulo="Excluir raça?"
        descricao={`A raça "${paraExcluir?.nome ?? ''}" será excluída do catálogo.`}
        textoConfirmar="Excluir"
        perigoso
        carregando={excluir.isPending}
        aoCancelar={() => setParaExcluir(null)}
        aoConfirmar={() =>
          paraExcluir &&
          excluir.mutate(
            { id: paraExcluir.id },
            {
              onSuccess: () => notificar('Raça excluída.', 'sucesso'),
              onError: (e) => notificar(mensagemDeErro(e), 'perigo'),
              onSettled: () => setParaExcluir(null),
            },
          )
        }
      />
    </div>
  );
}
