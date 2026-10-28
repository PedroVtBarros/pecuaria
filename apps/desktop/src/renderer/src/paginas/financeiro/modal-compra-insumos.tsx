import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ATIVIDADES,
  formatarCentavos,
  gerarUuidV7,
  ratearFretePorValor,
  somarCentavos,
} from '@pecuaria/domain';
import type { ItemEstoque, CompraInsumosDetalhe } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { mensagemDeErro } from '../../lib/api';
import {
  useAcaoFinanceiro,
  useCategoriasFinanceiras,
  usePessoasComerciais,
} from '../../lib/consultas-financeiro';
import { useEstoque, useItemEstoque } from '../../lib/consultas-estoque';
import { hojeIso } from '../../lib/formatar-rebanho';
import { atividades } from '../../textos-financeiro';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import { EditorCondicao, condicaoInicial, converterCondicao } from './editor-condicao';
import { quilosDoTexto } from './formulario-negociacao';

interface LinhaCompra {
  chave: string;
  itemId: string;
  quantidade: string;
  valor: string;
  /** '' = sem lote; 'novo' = criar lote; senão o id de um lote físico existente. */
  lote: string;
  codigoLote: string;
  validadeLote: string;
}
const novaLinha = (): LinhaCompra => ({
  chave: gerarUuidV7(),
  itemId: '',
  quantidade: '',
  valor: '',
  lote: '',
  codigoLote: '',
  validadeLote: '',
});

/** Lotes físicos do item escolhido, para itens que controlam lote. */
function SeletorLote({
  linha,
  item,
  aoMudar,
}: {
  linha: LinhaCompra;
  item: ItemEstoque;
  aoMudar: (m: Partial<LinhaCompra>) => void;
}) {
  const detalhe = useItemEstoque(item.id);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Campo rotulo="Lote físico" obrigatorio>
        {(p) => (
          <Selecao {...p} value={linha.lote} onChange={(e) => aoMudar({ lote: e.target.value })}>
            <option value="">Escolher…</option>
            <option value="novo">Novo lote</option>
            {(detalhe.data?.lotes ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      {linha.lote === 'novo' && (
        <>
          <Campo rotulo="Código do lote" obrigatorio>
            {(p) => (
              <Entrada
                {...p}
                value={linha.codigoLote}
                maxLength={100}
                onChange={(e) => aoMudar({ codigoLote: e.target.value })}
              />
            )}
          </Campo>
          <Campo rotulo="Validade (opcional)">
            {(p) => (
              <Entrada
                {...p}
                type="date"
                value={linha.validadeLote}
                onChange={(e) => aoMudar({ validadeLote: e.target.value })}
              />
            )}
          </Campo>
        </>
      )}
    </div>
  );
}

/** Compra de insumos: cria o lançamento e as entradas de estoque numa só operação. */
export function ModalCompraInsumos({
  propriedadeId,
  aoFechar,
  aoRegistrar,
}: {
  propriedadeId: string;
  aoFechar: () => void;
  aoRegistrar: (c: CompraInsumosDetalhe) => void;
}) {
  const registrar = useAcaoFinanceiro('compraInsumo:registrar');
  const estoque = useEstoque(propriedadeId);
  const categorias = useCategoriasFinanceiras(false);
  const pessoas = usePessoasComerciais(false);
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [data, setData] = useState(hojeIso());
  const [pessoaId, setPessoaId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [documento, setDocumento] = useState('');
  const [atividade, setAtividade] = useState<(typeof ATIVIDADES)[number]>('nao_definida');
  const [frete, setFrete] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [condicao, setCondicao] = useState(() => condicaoInicial(hojeIso()));
  const [linhas, setLinhas] = useState<LinhaCompra[]>([novaLinha()]);
  const [erros, setErros] = useState<string[]>([]);
  const itens = estoque.data ?? [];
  const categoriasEstoque = (categorias.data ?? []).filter(
    (c) => c.natureza === 'despesa' && c.tratamento === 'estoque',
  );
  const atualizar = (chave: string, m: Partial<LinhaCompra>) =>
    setLinhas(linhas.map((l) => (l.chave === chave ? { ...l, ...m } : l)));

  const analise = useMemo(() => {
    const e: string[] = [];
    const valores = linhas.map((l) => {
      const v = centavosDoTexto(l.valor);
      if (v.erro) e.push(`Valor inválido: ${v.erro}`);
      return v.centavos;
    });
    const freteC = centavosDoTexto(frete);
    if (freteC.erro) e.push(`Frete: ${freteC.erro}`);
    let totalCentavos: number | null = null;
    let finais: Map<string, number> | null = null;
    if (valores.every((v) => v !== null) && !freteC.erro) {
      const r = ratearFretePorValor(
        linhas.map((l, i) => ({ id: l.chave, valorCentavos: valores[i] as number })),
        freteC.centavos ?? 0,
      );
      if (r.erros.length) e.push(...r.erros);
      else {
        finais = r.valores;
        totalCentavos = somarCentavos([...r.valores.values()]);
      }
    }
    return { erros: e, valores, freteCentavos: freteC.centavos ?? 0, totalCentavos, finais };
  }, [linhas, frete]);

  return (
    <Modal
      aberto
      largura="xl"
      titulo="Registrar compra de insumos"
      descricao="Cria o lançamento financeiro e as entradas de estoque juntos. A compra só vira custo quando o insumo for consumido; nenhuma despesa de resultado é criada agora, nem pagamento sem a sua confirmação."
      aoFechar={aoFechar}
      textoEnviar="Registrar compra"
      enviando={registrar.isPending}
      erros={erros}
      aoEnviar={() => {
        const problemas = [...analise.erros];
        if (!categoriaId) problemas.push('Escolha a categoria da compra.');
        const quantidades = linhas.map((l) => quilosDoTexto(l.quantidade));
        linhas.forEach((l, i) => {
          if (!l.itemId) problemas.push(`Linha ${i + 1}: escolha o item de estoque.`);
          const q = quantidades[i];
          if (q === null || q === undefined || Number.isNaN(q) || q <= 0)
            problemas.push(`Linha ${i + 1}: informe uma quantidade válida (até três casas).`);
          const item = itens.find((x) => x.id === l.itemId);
          if (item?.controleLote && (!l.lote || (l.lote === 'novo' && !l.codigoLote.trim())))
            problemas.push(`Linha ${i + 1}: informe o lote físico.`);
        });
        const cond = converterCondicao(condicao, analise.totalCentavos, true);
        if (analise.totalCentavos !== null) problemas.push(...cond.erros);
        if (problemas.length > 0 || !cond.condicao) return setErros([...new Set(problemas)]);
        registrar.mutate(
          {
            requisicaoId,
            propriedadeId,
            data,
            pessoaId: pessoaId || null,
            categoriaId,
            documentoNumero: documento.trim() || null,
            atividade,
            observacoes: observacoes.trim() || null,
            freteCentavos: analise.freteCentavos,
            condicao: cond.condicao,
            itens: linhas.map((l, i) => {
              const item = itens.find((x) => x.id === l.itemId)!;
              return {
                estoqueItemId: l.itemId,
                quantidade: quantidades[i] as number,
                unidadeBase: item.unidadeBase,
                valorCentavos: analise.valores[i] as number,
                loteFisico: !item.controleLote
                  ? null
                  : l.lote === 'novo'
                    ? {
                        tipo: 'novo' as const,
                        codigo: l.codigoLote.trim(),
                        validade: l.validadeLote || null,
                      }
                    : { tipo: 'existente' as const, id: l.lote },
              };
            }),
          },
          { onSuccess: aoRegistrar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Data da compra" obrigatorio>
          {(p) => (
            <Entrada {...p} type="date" value={data} onChange={(e) => setData(e.target.value)} />
          )}
        </Campo>
        <Campo rotulo="Fornecedor">
          {(p) => (
            <Selecao {...p} value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
              <option value="">Não informado</option>
              {(pessoas.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Categoria da compra" obrigatorio>
          {(p) => (
            <Selecao {...p} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Escolher…</option>
              {categoriasEstoque.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Número do documento">
          {(p) => (
            <Entrada
              {...p}
              value={documento}
              maxLength={60}
              onChange={(e) => setDocumento(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Atividade">
          {(p) => (
            <Selecao
              {...p}
              value={atividade}
              onChange={(e) => setAtividade(e.target.value as (typeof ATIVIDADES)[number])}
            >
              {opcoesDe(atividades, ATIVIDADES)}
            </Selecao>
          )}
        </Campo>
        <CampoDinheiro
          rotulo="Frete (rateado por valor)"
          valor={frete}
          aoMudar={setFrete}
          ajuda="Opcional. Entra no custo de entrada de cada item, em proporção ao valor."
        />
      </div>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda p-4">
        <legend className="px-1 text-sm font-medium">Itens da compra</legend>
        {estoque.isSuccess && itens.length === 0 && (
          <Alerta tom="alerta">
            Cadastre os itens no módulo Estoque antes de registrar a compra.
          </Alerta>
        )}
        {linhas.map((l, i) => {
          const item = itens.find((x) => x.id === l.itemId);
          return (
            <div
              key={l.chave}
              className="flex flex-col gap-2 border-b border-borda pb-3 last:border-0"
              data-testid="linha-compra"
            >
              <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                <Campo rotulo={`Item ${i + 1}`}>
                  {(p) => (
                    <Selecao
                      {...p}
                      value={l.itemId}
                      onChange={(e) => atualizar(l.chave, { itemId: e.target.value, lote: '' })}
                    >
                      <option value="">Escolher…</option>
                      {itens.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome} ({x.unidadeBase})
                        </option>
                      ))}
                    </Selecao>
                  )}
                </Campo>
                <Campo rotulo={`Quantidade${item ? ` (${item.unidadeBase})` : ''}`}>
                  {(p) => (
                    <Entrada
                      {...p}
                      inputMode="decimal"
                      value={l.quantidade}
                      onChange={(e) => atualizar(l.chave, { quantidade: e.target.value })}
                    />
                  )}
                </Campo>
                <CampoDinheiro
                  rotulo="Valor do item"
                  valor={l.valor}
                  aoMudar={(valor) => atualizar(l.chave, { valor })}
                  ajuda="Sem o frete."
                />
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  aria-label={`Remover item ${i + 1}`}
                  disabled={linhas.length === 1}
                  onClick={() => setLinhas(linhas.filter((x) => x.chave !== l.chave))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Botao>
              </div>
              {item?.controleLote && (
                <SeletorLote linha={l} item={item} aoMudar={(m) => atualizar(l.chave, m)} />
              )}
              {analise.finais && (
                <p className="text-xs text-texto-suave">
                  Custo de entrada deste item:{' '}
                  <strong>{formatarCentavos(analise.finais.get(l.chave) ?? 0)}</strong>
                  {analise.freteCentavos > 0 ? ' (com a parte do frete)' : ''}
                </p>
              )}
            </div>
          );
        })}
        <div>
          <Botao variante="secundario" onClick={() => setLinhas([...linhas, novaLinha()])}>
            <Plus className="size-4" aria-hidden />
            Adicionar item
          </Botao>
        </div>
        <p className="text-sm" data-testid="total-compra">
          Total da compra:{' '}
          <strong>
            {analise.totalCentavos === null ? '—' : formatarCentavos(analise.totalCentavos)}
          </strong>
        </p>
      </fieldset>
      <EditorCondicao
        estado={condicao}
        aoMudar={setCondicao}
        totalCentavos={analise.totalCentavos}
        natureza="despesa"
      />
      <Campo rotulo="Observações (opcional)">
        {(p) => (
          <Entrada
            {...p}
            maxLength={1000}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}
