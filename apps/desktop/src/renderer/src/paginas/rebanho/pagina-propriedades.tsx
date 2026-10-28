import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { esquemaDadosPropriedade, type Propriedade } from '@pecuaria/shared-types';
import { TIPOS_EXPLORACAO, UFS, type TipoExploracao } from '@pecuaria/domain';
import { useAcaoRebanho, usePropriedades } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarArea } from '../../lib/formatar-rebanho';
import { textoParaNumero, useFormulario, vazioParaNulo } from '../../hooks/use-formulario';
import { usePropriedadeAtual } from '../../hooks/use-propriedade-atual';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Botao } from '../../components/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { DialogoConfirmacao } from '../../components/ui/dialogo-confirmacao';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';

function FormularioPropriedade({
  aberto,
  propriedade,
  aoFechar,
}: {
  aberto: boolean;
  propriedade: Propriedade | null;
  aoFechar: () => void;
}) {
  const { notificar } = useNotificacoes();
  const { selecionar, propriedades } = usePropriedadeAtual();
  const criar = useAcaoRebanho('propriedade:criar');
  const atualizar = useAcaoRebanho('propriedade:atualizar');
  const form = useFormulario({
    inicial: {
      nome: propriedade?.nome ?? '',
      municipio: propriedade?.municipio ?? '',
      uf: propriedade?.uf ?? '',
      areaTotalHa: propriedade?.areaTotalHa?.toLocaleString('pt-BR') ?? '',
      tipoExploracao: (propriedade?.tipoExploracao ?? 'corte') as TipoExploracao,
      observacoes: propriedade?.observacoes ?? '',
    },
    esquema: esquemaDadosPropriedade,
    converter: (v) => ({
      nome: v.nome,
      municipio: vazioParaNulo(v.municipio),
      uf: vazioParaNulo(v.uf),
      areaTotalHa: textoParaNumero(v.areaTotalHa),
      tipoExploracao: v.tipoExploracao,
      observacoes: vazioParaNulo(v.observacoes),
    }),
  });
  const { valores, definir, errosCampos } = form;

  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    const aoTerminar = {
      onSuccess: (p: Propriedade) => {
        notificar(propriedade ? 'Propriedade atualizada.' : 'Propriedade cadastrada.', 'sucesso');
        if (!propriedade && propriedades.length === 0) selecionar(p.id);
        aoFechar();
      },
      onError: form.mostrarErroDoServidor,
    };
    if (propriedade) atualizar.mutate({ id: propriedade.id, dados }, aoTerminar);
    else criar.mutate({ dados }, aoTerminar);
  };

  return (
    <Modal
      aberto={aberto}
      titulo={propriedade ? 'Editar propriedade' : 'Nova propriedade'}
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={propriedade ? 'Salvar alterações' : 'Cadastrar'}
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
      <div className="grid grid-cols-[1fr_7rem] gap-4">
        <Campo rotulo="Município" erro={errosCampos['municipio']}>
          {(p) => (
            <Entrada
              {...p}
              value={valores.municipio}
              onChange={(e) => definir('municipio', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="UF" erro={errosCampos['uf']}>
          {(p) => (
            <Selecao {...p} value={valores.uf} onChange={(e) => definir('uf', e.target.value)}>
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Exploração" obrigatorio erro={errosCampos['tipoExploracao']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.tipoExploracao}
              onChange={(e) => definir('tipoExploracao', e.target.value as TipoExploracao)}
            >
              {opcoesDe(rotulos.tipoExploracao, TIPOS_EXPLORACAO)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Área total (ha)" erro={errosCampos['areaTotalHa']}>
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={valores.areaTotalHa}
              onChange={(e) => definir('areaTotalHa', e.target.value)}
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

export function PaginaPropriedades() {
  const lista = usePropriedades();
  const { propriedade: atual, selecionar } = usePropriedadeAtual();
  const excluir = useAcaoRebanho('propriedade:excluir');
  const { notificar } = useNotificacoes();
  const [busca, setBusca] = useSearchParams();
  const [formulario, setFormulario] = useState<{
    aberto: boolean;
    propriedade: Propriedade | null;
  }>({
    aberto: false,
    propriedade: null,
  });
  const [paraExcluir, setParaExcluir] = useState<Propriedade | null>(null);

  // Atalhos "Cadastrar propriedade" (cabeçalho e painel) chegam com ?nova=1.
  const pedidoPorLink = busca.get('nova') === '1';
  const formularioAberto = formulario.aberto || pedidoPorLink;
  const fecharFormulario = () => {
    setFormulario({ aberto: false, propriedade: null });
    if (pedidoPorLink) setBusca({}, { replace: true });
  };

  const propriedades = lista.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Propriedades"
        descricao="Fazendas e sítios. A propriedade em uso aparece no topo da tela e filtra animais, lotes e áreas."
        acoes={
          <Botao onClick={() => setFormulario({ aberto: true, propriedade: null })}>
            <Plus className="size-4" aria-hidden />
            Nova propriedade
          </Botao>
        }
      />

      {lista.isSuccess && propriedades.length === 0 ? (
        <EstadoVazio
          icone={MapPin}
          titulo="Nenhuma propriedade cadastrada"
          descricao="Cadastre a fazenda ou sítio para começar a registrar o rebanho."
          acao={
            <Botao onClick={() => setFormulario({ aberto: true, propriedade: null })}>
              Cadastrar propriedade
            </Botao>
          }
        />
      ) : (
        <Tabela>
          <Cabeca>
            <Th>Nome</Th>
            <Th>Local</Th>
            <Th>Exploração</Th>
            <Th>Área</Th>
            <Th>Animais ativos</Th>
            <Th>Lotes ativos</Th>
            <Th className="text-right">Ações</Th>
          </Cabeca>
          <tbody>
            {propriedades.map((p) => (
              <Linha key={p.id} data-propriedade={p.nome}>
                <Td className="font-medium">
                  <span className="flex items-center gap-2">
                    {p.nome}
                    {atual?.id === p.id && <Selo tom="marca">Em uso</Selo>}
                  </span>
                </Td>
                <Td>{[p.municipio, p.uf].filter(Boolean).join(' / ') || '—'}</Td>
                <Td>{rotulos.tipoExploracao[p.tipoExploracao]}</Td>
                <Td>{formatarArea(p.areaTotalHa)}</Td>
                <Td>{p.animaisAtivos}</Td>
                <Td>{p.lotesAtivos}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    {atual?.id !== p.id && (
                      <Botao
                        tamanho="pequeno"
                        variante="secundario"
                        onClick={() => selecionar(p.id)}
                      >
                        Usar esta
                      </Botao>
                    )}
                    <Botao
                      tamanho="pequeno"
                      variante="fantasma"
                      aria-label={`Editar ${p.nome}`}
                      onClick={() => setFormulario({ aberto: true, propriedade: p })}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Botao>
                    <Botao
                      tamanho="pequeno"
                      variante="fantasma"
                      aria-label={`Excluir ${p.nome}`}
                      onClick={() => setParaExcluir(p)}
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

      {formularioAberto && (
        <FormularioPropriedade
          aberto
          propriedade={formulario.propriedade}
          aoFechar={fecharFormulario}
        />
      )}
      <DialogoConfirmacao
        aberto={paraExcluir !== null}
        titulo="Excluir propriedade?"
        descricao={`A propriedade "${paraExcluir?.nome ?? ''}" será excluída. Só é possível excluir propriedades sem animais, lotes ou áreas.`}
        textoConfirmar="Excluir"
        perigoso
        carregando={excluir.isPending}
        aoCancelar={() => setParaExcluir(null)}
        aoConfirmar={() =>
          paraExcluir &&
          excluir.mutate(
            { id: paraExcluir.id },
            {
              onSuccess: () => notificar('Propriedade excluída.', 'sucesso'),
              onError: (e) => notificar(mensagemDeErro(e), 'perigo'),
              onSettled: () => setParaExcluir(null),
            },
          )
        }
      />
    </div>
  );
}
