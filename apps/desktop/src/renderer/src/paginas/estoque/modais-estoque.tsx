import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  gerarUuidV7,
  interpretarNumero,
  sentidoEstoque,
  UNIDADES_ESTOQUE,
  type TipoItemEstoque,
  type TipoMovimentoEstoque,
  type UnidadeEstoque,
} from '@pecuaria/domain';
import {
  esquemaDadosItemEstoque,
  esquemaDadosMovimentoEstoque,
  type DadosMovimentoEstoque,
  type ItemEstoque,
  type LoteEstoque,
  type MovimentoEstoque,
  type PreviaEstoque,
} from '@pecuaria/shared-types';
import { Campo, Entrada, Selecao, CaixaMarcar } from '../../components/ui/campos';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Modal } from '../../components/ui/modal';
import { useAcaoEstoque } from '../../lib/consultas-estoque';
import { useLotes, useProdutosSanitarios, useAnimal } from '../../lib/consultas-rebanho';
import { chamarApi, mensagemDeErro } from '../../lib/api';
import { hojeIso } from '../../lib/formatar-rebanho';
import {
  ajudaEstoqueMinimo,
  tiposItemEstoque,
  tiposMovimentoEstoque,
  quantidadeEstoque,
  valorEstoque,
} from '../../textos-estoque';
import { SeletorAnimal } from '../rebanho/seletor-animal';

export function TextoEstoque({
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
  ajuda,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  tipo?: string;
  ajuda?: string;
}) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda}>
      {(p) => (
        <Entrada {...p} type={tipo} value={valor} onChange={(e) => aoMudar(e.target.value)} />
      )}
    </Campo>
  );
}
function numero(texto: string, nome: string, vazio: boolean): number | null {
  if (vazio && texto.trim() === '') return null;
  const n = interpretarNumero(texto);
  if (n === null) throw new Error(`${nome}: número inválido ou ambíguo. Use, por exemplo, 1250,5.`);
  return n;
}
export function ModalItemEstoque({
  propriedadeId,
  item,
  travado = false,
  aoFechar,
}: {
  propriedadeId: string;
  item: ItemEstoque | null;
  travado?: boolean;
  aoFechar: () => void;
}) {
  const criar = useAcaoEstoque('estoque:criarItem');
  const editar = useAcaoEstoque('estoque:atualizarItem');
  const produtos = useProdutosSanitarios();
  const [nome, setNome] = useState(item?.nome ?? '');
  const [tipo, setTipo] = useState<TipoItemEstoque>(item?.tipo ?? 'racao');
  const [unidade, setUnidade] = useState<UnidadeEstoque>(item?.unidadeBase ?? 'kg');
  const [controle, setControle] = useState(item?.controleLote ?? false);
  const [minimo, setMinimo] = useState(item?.estoqueMinimo?.toString().replace('.', ',') ?? '');
  const [produto, setProduto] = useState(item?.produtoSanitarioId ?? '');
  const [ativo, setAtivo] = useState(item?.ativo ?? true);
  const [observacoes, setObservacoes] = useState(item?.observacoes ?? '');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    try {
      setErro(null);
      const dados = esquemaDadosItemEstoque.parse({
        nome,
        tipo,
        unidadeBase: unidade,
        controleLote: controle,
        estoqueMinimo: numero(minimo, 'Estoque mínimo', true),
        produtoSanitarioId: produto || null,
        ativo,
        observacoes: observacoes.trim() || null,
      });
      if (item) {
        if (!motivo.trim()) throw new Error('Informe o motivo da alteração.');
        await editar.mutateAsync({ id: item.id, dados, motivo });
      } else await criar.mutateAsync({ propriedadeId, dados });
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }
  return (
    <Modal
      aberto
      titulo={item ? 'Editar item de estoque' : 'Novo item de estoque'}
      aoFechar={aoFechar}
      aoEnviar={() => void salvar()}
      textoEnviar="Salvar item"
      enviando={criar.isPending || editar.isPending}
      erros={erro ? [erro] : []}
    >
      <TextoEstoque rotulo="Nome do item" valor={nome} aoMudar={setNome} />
      <Campo rotulo="Tipo de insumo">
        {(p) => (
          <Selecao
            {...p}
            value={tipo}
            disabled={travado}
            onChange={(e) => setTipo(e.target.value as TipoItemEstoque)}
          >
            {Object.entries(tiposItemEstoque).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <Campo
        rotulo="Unidade física do estoque"
        ajuda="Nenhuma equivalência de frascos, doses, massa ou volume é presumida."
      >
        {(p) => (
          <Selecao
            {...p}
            value={unidade}
            disabled={travado}
            onChange={(e) => setUnidade(e.target.value as UnidadeEstoque)}
          >
            {UNIDADES_ESTOQUE.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Selecao>
        )}
      </Campo>
      <p className="text-sm text-texto-suave">
        Alimentos são registrados na forma física em matéria natural. Matéria seca e composição
        nutricional pertencem às próximas fases.
      </p>
      <CaixaMarcar
        rotulo="Controlar lote físico em cada movimentação"
        marcado={controle}
        aoMudar={setControle}
        disabled={travado}
      />
      <TextoEstoque
        rotulo="Estoque mínimo"
        valor={minimo}
        aoMudar={setMinimo}
        ajuda={ajudaEstoqueMinimo(unidade)}
      />
      <Campo rotulo="Produto sanitário vinculado nesta propriedade">
        {(p) => (
          <Selecao
            {...p}
            value={produto}
            disabled={travado}
            onChange={(e) => setProduto(e.target.value)}
          >
            <option value="">Sem vínculo sanitário</option>
            {(produtos.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <TextoEstoque rotulo="Observações" valor={observacoes} aoMudar={setObservacoes} />
      {item && (
        <>
          <CaixaMarcar rotulo="Item ativo" marcado={ativo} aoMudar={setAtivo} />
          <TextoEstoque rotulo="Motivo da alteração" valor={motivo} aoMudar={setMotivo} />
        </>
      )}
    </Modal>
  );
}
export function ModalLoteEstoque({
  itemId,
  lote,
  aoFechar,
}: {
  itemId: string;
  lote: LoteEstoque | null;
  aoFechar: () => void;
}) {
  const criar = useAcaoEstoque('estoque:criarLote');
  const editar = useAcaoEstoque('estoque:atualizarLote');
  const [codigo, setCodigo] = useState(lote?.codigo ?? '');
  const [validade, setValidade] = useState(lote?.validade ?? '');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  async function salvar() {
    try {
      setErro(null);
      if (lote) {
        if (!motivo.trim()) throw new Error('Informe o motivo.');
        await editar.mutateAsync({
          id: lote.id,
          dados: { codigo, validade: validade || null },
          motivo,
        });
      } else await criar.mutateAsync({ itemId, dados: { codigo, validade: validade || null } });
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }
  return (
    <Modal
      aberto
      titulo={lote ? 'Corrigir lote físico' : 'Novo lote físico'}
      aoFechar={aoFechar}
      aoEnviar={() => void salvar()}
      textoEnviar="Salvar lote"
      enviando={criar.isPending || editar.isPending}
      erros={erro ? [erro] : []}
    >
      <TextoEstoque rotulo="Código do lote físico" valor={codigo} aoMudar={setCodigo} />
      <TextoEstoque
        rotulo="Validade"
        tipo="date"
        valor={validade}
        aoMudar={setValidade}
        ajuda="Vazio significa validade não informada."
      />
      {lote && <TextoEstoque rotulo="Motivo da correção" valor={motivo} aoMudar={setMotivo} />}
    </Modal>
  );
}
export function ModalMovimentoEstoque({
  item,
  lotes,
  movimento,
  aoFechar,
}: {
  item: ItemEstoque;
  lotes: LoteEstoque[];
  movimento: MovimentoEstoque | null;
  aoFechar: () => void;
}) {
  const registrar = useAcaoEstoque('estoque:registrar');
  const corrigir = useAcaoEstoque('estoque:corrigir');
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [tipo, setTipo] = useState<TipoMovimentoEstoque>(movimento?.tipo ?? 'entrada_compra');
  const [data, setData] = useState(movimento?.data ?? hojeIso());
  const [q, setQ] = useState(movimento?.quantidade.toString().replace('.', ',') ?? '');
  const [custo, setCusto] = useState(
    movimento?.custoEntradaCentavos === null || !movimento
      ? ''
      : (movimento.custoEntradaCentavos / 100).toFixed(2),
  );
  const [loteId, setLoteId] = useState(movimento?.loteEstoqueId ?? '');
  const [destino, setDestino] = useState(movimento?.destino ?? 'propriedade');
  const [loteAnimalId, setLoteAnimalId] = useState(movimento?.loteAnimalId ?? '');
  const [animalId, setAnimalId] = useState(movimento?.animalId ?? '');
  const animal = useAnimal(animalId, Boolean(animalId));
  const lotesAnimais = useLotes(item.propriedadeId, true);
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState(movimento?.observacao ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PreviaEstoque | null>(null);
  const entrada = sentidoEstoque(tipo) === 'entrada';
  const conferir = useMutation({
    mutationFn: (dados: DadosMovimentoEstoque) =>
      chamarApi('estoque:prever', { itemId: item.id, dados, substituiId: movimento?.id ?? null }),
  });
  function dados(): DadosMovimentoEstoque {
    const custoReais = entrada ? numero(custo, 'Custo total', true) : null;
    if (custoReais !== null && custoReais !== Number(custoReais.toFixed(2)))
      throw new Error('O custo total deve ter no máximo duas casas decimais.');
    return esquemaDadosMovimentoEstoque.parse({
      data,
      tipo,
      quantidade: numero(q, 'Quantidade', false),
      unidadeBase: item.unidadeBase,
      loteEstoqueId: loteId || null,
      custoEntradaCentavos: custoReais === null ? null : Math.round(custoReais * 100),
      destino: entrada ? null : destino,
      loteAnimalId: !entrada && destino === 'lote' ? loteAnimalId || null : null,
      animalId: !entrada && destino === 'animal' ? animalId || null : null,
      documentoOrigemId: movimento?.documentoOrigemId ?? null,
      motivo: motivo.trim() || null,
      observacao: observacao.trim() || null,
    });
  }
  async function salvar() {
    try {
      setErro(null);
      const d = dados();
      if (movimento) {
        if (!motivo.trim()) throw new Error('Informe o motivo da correção.');
        await corrigir.mutateAsync({ id: movimento.id, requisicaoId, dados: d, motivo });
      } else await registrar.mutateAsync({ itemId: item.id, requisicaoId, dados: d });
      aoFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }
  return (
    <Modal
      aberto
      largura="lg"
      titulo={movimento ? 'Corrigir movimento de estoque' : 'Registrar movimento de estoque'}
      aoFechar={aoFechar}
      aoEnviar={() => void salvar()}
      textoEnviar={movimento ? 'Salvar correção' : 'Registrar movimento'}
      enviando={registrar.isPending || corrigir.isPending}
      erros={erro ? [erro] : []}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" onChange={() => setPrevia(null)}>
        <Campo rotulo="Tipo de movimentação">
          {(p) => (
            <Selecao
              {...p}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoMovimentoEstoque)}
            >
              {Object.entries(tiposMovimentoEstoque).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <TextoEstoque rotulo="Data do movimento" tipo="date" valor={data} aoMudar={setData} />
        <TextoEstoque
          rotulo={`Quantidade (${item.unidadeBase})`}
          valor={q}
          aoMudar={setQ}
          ajuda="Até três casas decimais; unidades contáveis inteiras."
        />
        <Campo rotulo="Lote físico do estoque">
          {(p) => (
            <Selecao {...p} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
              <option value="">
                {item.controleLote ? 'Escolha o lote físico' : 'Sem lote físico'}
              </option>
              {lotes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} · {quantidadeEstoque(l.saldo, item.unidadeBase)}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        {entrada ? (
          <TextoEstoque
            rotulo="Custo total da entrada (R$)"
            valor={custo}
            aoMudar={setCusto}
            ajuda="Vazio: custo desconhecido. Zero: custo conhecido igual a zero. Produção própria não é presumida gratuita."
          />
        ) : (
          <>
            <Campo rotulo="Destino do consumo ou saída">
              {(p) => (
                <Selecao
                  {...p}
                  value={destino}
                  onChange={(e) => setDestino(e.target.value as typeof destino)}
                >
                  <option value="propriedade">Geral da propriedade</option>
                  <option value="lote">Lote de animais</option>
                  <option value="animal">Animal individual</option>
                </Selecao>
              )}
            </Campo>
            {destino === 'lote' && (
              <Campo rotulo="Lote de animais de destino">
                {(p) => (
                  <Selecao
                    {...p}
                    value={loteAnimalId}
                    onChange={(e) => setLoteAnimalId(e.target.value)}
                  >
                    <option value="">Escolha o lote de animais</option>
                    {(lotesAnimais.data ?? []).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
            )}
            {destino === 'animal' && (
              <Campo rotulo="Animal de destino">
                {(p) => (
                  <SeletorAnimal
                    id={p.id}
                    propriedadeId={item.propriedadeId}
                    valor={animalId}
                    rotuloValor={animal.data?.identificacao ?? null}
                    aoMudar={(id) => setAnimalId(id ?? '')}
                  />
                )}
              </Campo>
            )}
          </>
        )}
        <TextoEstoque
          rotulo={movimento ? 'Motivo da correção' : 'Motivo do ajuste (quando aplicável)'}
          valor={motivo}
          aoMudar={setMotivo}
        />
        <TextoEstoque rotulo="Observação do movimento" valor={observacao} aoMudar={setObservacao} />
      </div>
      <p className="text-sm text-texto-suave">
        Entradas e saídas são registros físicos. Não geram lançamentos financeiros. Correções
        preservam o histórico e recalculam os movimentos posteriores.
      </p>
      <Botao
        variante="secundario"
        type="button"
        carregando={conferir.isPending}
        onClick={() => {
          try {
            setErro(null);
            conferir.mutate(dados(), {
              onSuccess: setPrevia,
              onError: (e) => setErro(mensagemDeErro(e)),
            });
          } catch (e) {
            setErro(mensagemDeErro(e));
          }
        }}
      >
        Conferir saldo e valoração
      </Botao>
      {previa && (
        <Alerta tom={previa.valoracaoCompleta ? 'info' : 'alerta'} titulo="Prévia sem gravar">
          <span data-testid="previa-estoque">
            Saldo: {quantidadeEstoque(previa.saldo, item.unidadeBase)} · Valor:{' '}
            {valorEstoque(previa.valorSaldoCentavos)} · Custo deste movimento:{' '}
            {valorEstoque(previa.custoMovimentoCentavos)}. {previa.movimentosRecalculados}{' '}
            movimento(s) anterior(es) terão a valoração recalculada.
          </span>
        </Alerta>
      )}
    </Modal>
  );
}
