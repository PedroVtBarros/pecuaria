import { useState } from 'react';
import { Pencil, Pill, Plus, Trash2 } from 'lucide-react';
import type { ProdutoSanitario } from '@pecuaria/shared-types';
import { useAcaoRebanho, useProdutosSanitarios } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { DialogoConfirmacao } from '../../components/ui/dialogo-confirmacao';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { ModalProduto } from './modais-sanidade';

const dias = (n: number | null) => (n === null ? '—' : `${n} ${n === 1 ? 'dia' : 'dias'}`);

export function PaginaProdutos() {
  const produtos = useProdutosSanitarios();
  const excluir = useAcaoRebanho('produtoSanitario:excluir');
  const { notificar } = useNotificacoes();
  const [modal, setModal] = useState<
    { tipo: 'novo' } | { tipo: 'editar' | 'excluir'; produto: ProdutoSanitario } | null
  >(null);
  const lista = produtos.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Produtos sanitários"
        descricao="Vacinas, vermífugos e medicamentos que você usa, com os dados copiados da bula. A lista começa vazia: nenhum produto ou carência vem pronto."
        acoes={
          <Botao onClick={() => setModal({ tipo: 'novo' })}>
            <Plus className="size-4" aria-hidden />
            Novo produto
          </Botao>
        }
      />
      {produtos.isError && <Alerta tom="perigo" titulo={mensagemDeErro(produtos.error)} />}
      {lista.length === 0 && !produtos.isLoading ? (
        <EstadoVazio
          icone={Pill}
          titulo="Nenhum produto cadastrado"
          descricao="Cadastrar o produto evita redigitar e sugere a carência ao registrar uma aplicação. Também é possível registrar sem produto, só com a descrição."
        />
      ) : (
        <Tabela data-testid="tabela-produtos">
          <Cabeca>
            <Th>Nome</Th>
            <Th>Tipo</Th>
            <Th>Fabricante</Th>
            <Th>Princípio ativo</Th>
            <Th>Carência carne</Th>
            <Th>Carência leite</Th>
            <Th>Registros</Th>
            <Th className="text-right">Ações</Th>
          </Cabeca>
          <tbody>
            {lista.map((p) => (
              <Linha key={p.id} data-produto={p.nome}>
                <Td className="font-medium">{p.nome}</Td>
                <Td>{rotulos.tipoProduto[p.tipo]}</Td>
                <Td>{p.fabricante ?? '—'}</Td>
                <Td>{p.principioAtivo ?? '—'}</Td>
                <Td>{dias(p.carenciaCarneDias)}</Td>
                <Td>{dias(p.carenciaLeiteDias)}</Td>
                <Td>{p.usos}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Botao
                      tamanho="pequeno"
                      variante="fantasma"
                      aria-label={`Editar ${p.nome}`}
                      onClick={() => setModal({ tipo: 'editar', produto: p })}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Botao>
                    <Botao
                      tamanho="pequeno"
                      variante="fantasma"
                      aria-label={`Excluir ${p.nome}`}
                      disabled={p.usos > 0}
                      title={p.usos > 0 ? 'Produto em uso não pode ser excluído' : undefined}
                      onClick={() => setModal({ tipo: 'excluir', produto: p })}
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
      {(modal?.tipo === 'novo' || modal?.tipo === 'editar') && (
        <ModalProduto
          produto={modal.tipo === 'editar' ? modal.produto : null}
          aoFechar={() => setModal(null)}
        />
      )}
      {modal?.tipo === 'excluir' && (
        <DialogoConfirmacao
          aberto
          titulo={`Excluir "${modal.produto.nome}"?`}
          descricao="O produto sai da lista. O registro da exclusão fica guardado."
          textoConfirmar="Excluir"
          perigoso
          carregando={excluir.isPending}
          aoCancelar={() => setModal(null)}
          aoConfirmar={() =>
            excluir.mutate(
              { id: modal.produto.id },
              {
                onSuccess: () => {
                  notificar('Produto excluído.', 'sucesso');
                  setModal(null);
                },
                onError: (e) => notificar(mensagemDeErro(e), 'perigo'),
              },
            )
          }
        />
      )}
    </div>
  );
}
