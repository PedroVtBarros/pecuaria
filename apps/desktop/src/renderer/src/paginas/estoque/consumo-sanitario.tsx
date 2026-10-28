import { useState } from 'react';
import { interpretarNumero } from '@pecuaria/domain';
import {
  esquemaConsumosEstoque,
  type ConsumoEstoque,
  type MovimentoEstoque,
  type ResumoItemEstoque,
} from '@pecuaria/shared-types';
import { useEstoque, useItemEstoque } from '../../lib/consultas-estoque';
import { Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Botao } from '../../components/ui/botao';
import { Alerta } from '../../components/ui/alerta';

export interface LinhaConsumo {
  chave: string;
  itemId: string;
  loteEstoqueId: string;
  quantidade: string;
  unidadeBase: ConsumoEstoque['unidadeBase'];
}
export function iniciarConsumos(movimentos: MovimentoEstoque[] = []): LinhaConsumo[] {
  return movimentos.map((m) => ({
    chave: crypto.randomUUID(),
    itemId: m.itemId,
    loteEstoqueId: m.loteEstoqueId ?? '',
    quantidade: String(m.quantidade).replace('.', ','),
    unidadeBase: m.unidadeBase,
  }));
}
export function converterConsumos(linhas: LinhaConsumo[]): ConsumoEstoque[] {
  const resultado = esquemaConsumosEstoque.safeParse(
    linhas.map((l) => ({
      requisicaoId: l.chave,
      itemId: l.itemId,
      loteEstoqueId: l.loteEstoqueId || null,
      quantidade: interpretarNumero(l.quantidade),
      unidadeBase: l.unidadeBase,
    })),
  );
  if (!resultado.success)
    throw new Error('Confira o item, o lote físico e a quantidade de cada baixa de estoque.');
  return resultado.data;
}
function Linha({
  linha,
  itens,
  mudar,
  remover,
}: {
  linha: LinhaConsumo;
  itens: ResumoItemEstoque[];
  mudar: (linha: LinhaConsumo) => void;
  remover: () => void;
}) {
  const detalhe = useItemEstoque(linha.itemId);
  const item = itens.find((i) => i.id === linha.itemId);
  return (
    <div className="grid gap-3 rounded border border-borda p-3 sm:grid-cols-2">
      <Campo rotulo="Item para baixa">
        {(p) => (
          <Selecao
            {...p}
            value={linha.itemId}
            onChange={(e) => {
              const i = itens.find((i) => i.id === e.target.value);
              mudar({
                ...linha,
                itemId: e.target.value,
                unidadeBase: i?.unidadeBase ?? 'un',
                loteEstoqueId: '',
              });
            }}
          >
            <option value="">Escolha o item vinculado</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome} ({i.unidadeBase})
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo
        rotulo={`Quantidade efetivamente consumida (${item?.unidadeBase ?? linha.unidadeBase})`}
      >
        {(p) => (
          <Entrada
            {...p}
            inputMode="decimal"
            value={linha.quantidade}
            onChange={(e) => mudar({ ...linha, quantidade: e.target.value })}
          />
        )}
      </Campo>
      {(item?.controleLote || linha.loteEstoqueId) && (
        <Campo rotulo="Lote físico consumido">
          {(p) => (
            <Selecao
              {...p}
              value={linha.loteEstoqueId}
              onChange={(e) => mudar({ ...linha, loteEstoqueId: e.target.value })}
            >
              <option value="">Escolha</option>
              {(detalhe.data?.lotes ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} · saldo {l.saldo}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      )}
      <Botao variante="fantasma" onClick={remover}>
        Remover baixa
      </Botao>
    </div>
  );
}
export function ConsumoSanitario({
  propriedadeId,
  produtoId,
  linhas,
  aoMudar,
}: {
  propriedadeId: string;
  produtoId: string;
  linhas: LinhaConsumo[];
  aoMudar: (linhas: LinhaConsumo[]) => void;
}) {
  const estoque = useEstoque(propriedadeId);
  const itens = (estoque.data ?? []).filter((i) => i.produtoSanitarioId === produtoId);
  const [habilitado, setHabilitado] = useState(linhas.length > 0);
  return (
    <section className="flex flex-col gap-3 rounded border border-borda p-4">
      <h3 className="font-semibold">Consumo de estoque</h3>
      <p className="text-sm text-texto-suave">
        Informe a quantidade física total utilizada, na unidade do estoque. Dose por animal, frasco
        e unidade comercial não são convertidos. Sem baixa informada, o registro sanitário não
        movimenta estoque.
      </p>
      {!habilitado ? (
        <Botao variante="secundario" onClick={() => setHabilitado(true)}>
          Informar baixa de estoque
        </Botao>
      ) : (
        <>
          {estoque.isError && (
            <Alerta tom="perigo">Não foi possível consultar os itens de estoque.</Alerta>
          )}
          {itens.length === 0 && (
            <Alerta tom="info">
              Cadastre um item de estoque vinculado ao produto sanitário nesta propriedade.
            </Alerta>
          )}
          {linhas.map((linha, index) => (
            <Linha
              key={linha.chave}
              linha={linha}
              itens={itens}
              mudar={(nova) => aoMudar(linhas.map((l, i) => (i === index ? nova : l)))}
              remover={() => aoMudar(linhas.filter((_, i) => i !== index))}
            />
          ))}
          <Botao
            variante="secundario"
            disabled={!itens.length}
            onClick={() =>
              aoMudar([
                ...linhas,
                {
                  chave: crypto.randomUUID(),
                  itemId: '',
                  loteEstoqueId: '',
                  quantidade: '',
                  unidadeBase: 'un',
                },
              ])
            }
          >
            Adicionar baixa explícita
          </Botao>
          {linhas.length === 0 && <p className="text-sm">Nenhuma baixa será registrada.</p>}
        </>
      )}
    </section>
  );
}
