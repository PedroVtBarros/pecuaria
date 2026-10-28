import { useMemo, useState } from 'react';
import {
  ATIVIDADES,
  UNIDADES_QUANTIDADE_LANCAMENTO,
  gerarUuidV7,
  interpretarNumero,
  formatarCentavosSemSimbolo,
  type Atividade,
  type ComportamentoLancamento,
  type NaturezaFinanceira,
  type UnidadeQuantidadeLancamento,
} from '@pecuaria/domain';
import type { DadosLancamento, EdicaoLancamento, LancamentoDetalhe } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { mensagemDeErro } from '../../lib/api';
import {
  useAcaoFinanceiro,
  useCategoriasFinanceiras,
  usePessoasComerciais,
} from '../../lib/consultas-financeiro';
import { useAnimal, useLotes } from '../../lib/consultas-rebanho';
import { hojeIso } from '../../lib/formatar-rebanho';
import {
  atividades,
  comportamentos,
  naturezas,
  regraAtividadePorFinalidade,
  sugerirAtividade,
  unidadesQuantidade,
} from '../../textos-financeiro';
import { SeletorAnimal } from '../rebanho/seletor-animal';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import {
  EditorCondicao,
  condicaoInicial,
  converterCondicao,
  type EstadoCondicao,
} from './editor-condicao';

type TipoDestino = 'propriedade' | 'lote' | 'animal' | 'nenhum';
const destinos: Record<TipoDestino, string> = {
  propriedade: 'Propriedade (custo ou receita geral)',
  lote: 'Lote de animais',
  animal: 'Animal',
  nenhum: 'Sem destino',
};

function quantidadeEmTexto(q: number | null): string {
  return q === null ? '' : String(q).replace('.', ',');
}

/** Novo lançamento ou edição dos dados de um lançamento existente (sem valor nem condição). */
export function ModalLancamento({
  propriedadeId,
  lancamento,
  aoFechar,
  aoSalvar,
}: {
  propriedadeId: string;
  lancamento: LancamentoDetalhe | null;
  aoFechar: () => void;
  aoSalvar?: (l: LancamentoDetalhe) => void;
}) {
  const edicao = lancamento !== null;
  const criar = useAcaoFinanceiro('lancamento:criar');
  const atualizar = useAcaoFinanceiro('lancamento:atualizar');
  const categorias = useCategoriasFinanceiras(false);
  const pessoas = usePessoasComerciais(false);
  const lotes = useLotes(propriedadeId, true);
  const hoje = useMemo(() => hojeIso(), []);
  const [requisicaoId] = useState(() => gerarUuidV7());

  const [natureza, setNatureza] = useState<NaturezaFinanceira>(lancamento?.natureza ?? 'despesa');
  const [categoriaId, setCategoriaId] = useState(lancamento?.categoria.id ?? '');
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? '');
  const [competencia, setCompetencia] = useState(lancamento?.dataCompetencia ?? hoje);
  const [valor, setValor] = useState(
    lancamento ? formatarCentavosSemSimbolo(lancamento.valorOperacaoCentavos) : '',
  );
  const [pessoaId, setPessoaId] = useState(lancamento?.pessoa?.id ?? '');
  const [documento, setDocumento] = useState(lancamento?.documentoNumero ?? '');
  const [atividade, setAtividade] = useState<Atividade>(lancamento?.atividade ?? 'nao_definida');
  const [destino, setDestino] = useState<TipoDestino>(lancamento?.destino.tipo ?? 'propriedade');
  const [loteId, setLoteId] = useState(lancamento?.destino.loteId ?? '');
  const [animalId, setAnimalId] = useState(lancamento?.destino.animalId ?? '');
  const [quantidade, setQuantidade] = useState(quantidadeEmTexto(lancamento?.quantidade ?? null));
  const [unidade, setUnidade] = useState<UnidadeQuantidadeLancamento>(
    lancamento?.unidadeQuantidade ?? 'kg',
  );
  // '' = copiar a classificação padrão da categoria (D-E). Na edição, mantém a atual.
  const [comportamento, setComportamento] = useState<ComportamentoLancamento | ''>(
    lancamento ? lancamento.comportamentoCusto : '',
  );
  const [observacoes, setObservacoes] = useState(lancamento?.observacoes ?? '');
  const [condicao, setCondicao] = useState<EstadoCondicao>(() => condicaoInicial(hoje));
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const animal = useAnimal(animalId, Boolean(animalId));

  const categoriasDaNatureza = (categorias.data ?? []).filter(
    (c) => c.natureza === natureza && (c.origemExigida === null || c.id === categoriaId),
  );
  const categoria = categoriasDaNatureza.find((c) => c.id === categoriaId) ?? null;
  const loteEscolhido = (lotes.data ?? []).find((l) => l.id === loteId);
  const sugestao =
    destino === 'lote' && loteEscolhido ? sugerirAtividade(loteEscolhido.finalidade) : null;
  const totalCentavos = centavosDoTexto(valor).centavos;

  function montarComum(): { base: EdicaoLancamento | null; erros: string[] } {
    const e: string[] = [];
    if (!categoriaId) e.push('Escolha a categoria.');
    if (!descricao.trim()) e.push('Informe a descrição.');
    if (!competencia) e.push('Informe a data de competência.');
    let qtd: EdicaoLancamento['quantidade'] = null;
    if (quantidade.trim() !== '') {
      const n = interpretarNumero(quantidade);
      if (n === null) e.push('Quantidade: número inválido ou ambíguo. Use, por exemplo, 12,5.');
      else qtd = { valor: n, unidade };
    }
    let destinoApi: EdicaoLancamento['destino'] = { tipo: 'propriedade' };
    if (destino === 'nenhum') destinoApi = { tipo: 'nenhum' };
    if (destino === 'lote') {
      if (!loteId) e.push('Escolha o lote de animais.');
      destinoApi = { tipo: 'lote', loteId };
    }
    if (destino === 'animal') {
      if (!animalId) e.push('Escolha o animal.');
      destinoApi = { tipo: 'animal', animalId };
    }
    if (e.length) return { base: null, erros: e };
    return {
      base: {
        categoriaId,
        pessoaId: pessoaId || null,
        dataCompetencia: competencia,
        descricao,
        documentoNumero: documento.trim() || null,
        atividade,
        destino: destinoApi,
        quantidade: qtd,
        comportamentoCusto:
          natureza === 'despesa' && comportamento !== '' && comportamento !== 'nao_se_aplica'
            ? comportamento
            : null,
        observacoes: observacoes.trim() || null,
      },
      erros: [],
    };
  }

  async function salvar() {
    const { base, erros: e } = montarComum();
    if (!base) return setErros(e);
    try {
      if (lancamento) {
        if (!motivo.trim()) return setErros(['Informe o motivo da alteração.']);
        const r = await atualizar.mutateAsync({ id: lancamento.id, dados: base, motivo });
        aoSalvar?.(r);
        return aoFechar();
      }
      const { centavos, erro } = centavosDoTexto(valor);
      if (erro || centavos === null || centavos <= 0)
        return setErros([erro ?? 'Informe o valor da operação, maior que zero.']);
      const c = converterCondicao(condicao, centavos);
      if (!c.condicao) return setErros(c.erros);
      const dados: DadosLancamento = {
        ...base,
        propriedadeId,
        valorTotalCentavos: centavos,
        condicao: c.condicao,
      };
      const r = await criar.mutateAsync({ requisicaoId, dados });
      aoSalvar?.(r);
      aoFechar();
    } catch (x) {
      setErros([mensagemDeErro(x)]);
    }
  }

  return (
    <Modal
      aberto
      largura="xl"
      titulo={edicao ? 'Editar lançamento' : 'Novo lançamento'}
      descricao={
        edicao
          ? 'Valor e condição de pagamento têm operações próprias (renegociar). Cada alteração fica na trilha, com o motivo.'
          : 'A data de competência é quando o fato ocorreu; pagamentos e recebimentos têm datas próprias.'
      }
      aoFechar={aoFechar}
      aoEnviar={() => void salvar()}
      textoEnviar={edicao ? 'Salvar alterações' : 'Registrar lançamento'}
      enviando={criar.isPending || atualizar.isPending}
      erros={erros}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo rotulo="Natureza" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={natureza}
              disabled={edicao}
              onChange={(e) => {
                setNatureza(e.target.value as NaturezaFinanceira);
                setCategoriaId('');
                setComportamento('');
              }}
            >
              {opcoesDe(naturezas)}
            </Selecao>
          )}
        </Campo>
        <Campo
          rotulo="Categoria"
          obrigatorio
          ajuda={
            categoria && natureza === 'despesa'
              ? `Classificação padrão da categoria: ${comportamentos[categoria.comportamentoCusto]}.`
              : 'Compra e venda de animais ficam disponíveis na entrega própria.'
          }
        >
          {(p) => (
            <Selecao {...p} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Escolha a categoria</option>
              {categoriasDaNatureza.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Descrição" obrigatorio className="md:col-span-2">
          {(p) => (
            <Entrada
              {...p}
              maxLength={200}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          rotulo="Data de competência"
          obrigatorio
          ajuda="Quando o fato ocorreu. Não pode ser futura."
        >
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          )}
        </Campo>
        {edicao ? (
          <Campo
            rotulo="Valor da operação"
            ajuda="Para mudar o valor, use Renegociar na página do lançamento."
          >
            {(p) => <Entrada {...p} value={valor} disabled readOnly />}
          </Campo>
        ) : (
          <CampoDinheiro rotulo="Valor da operação" valor={valor} aoMudar={setValor} obrigatorio />
        )}
        <Campo rotulo="Contraparte (opcional)">
          {(p) => (
            <Selecao {...p} value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
              <option value="">Sem contraparte</option>
              {(pessoas.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Número do documento (opcional)">
          {(p) => (
            <Entrada
              {...p}
              maxLength={60}
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Destino do lançamento" ajuda="Um único destino por lançamento.">
          {(p) => (
            <Selecao
              {...p}
              value={destino}
              onChange={(e) => setDestino(e.target.value as TipoDestino)}
            >
              {opcoesDe(destinos)}
            </Selecao>
          )}
        </Campo>
        {destino === 'lote' && (
          <Campo rotulo="Lote de animais" obrigatorio>
            {(p) => (
              <Selecao {...p} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                <option value="">Escolha o lote</option>
                {(lotes.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        )}
        {destino === 'animal' && (
          <Campo rotulo="Animal" obrigatorio>
            {(p) => (
              <SeletorAnimal
                id={p.id}
                propriedadeId={propriedadeId}
                valor={animalId}
                rotuloValor={animal.data?.identificacao ?? null}
                aoMudar={(id) => setAnimalId(id)}
              />
            )}
          </Campo>
        )}
        <Campo
          rotulo="Atividade"
          ajuda="Corte, leite ou compartilhada. Nada é classificado sem a sua confirmação."
        >
          {(p) => (
            <Selecao
              {...p}
              value={atividade}
              onChange={(e) => setAtividade(e.target.value as Atividade)}
            >
              {opcoesDe(atividades, ATIVIDADES)}
            </Selecao>
          )}
        </Campo>
        {sugestao && atividade !== sugestao && (
          <div className="flex flex-col justify-end gap-1 pb-1">
            <p className="text-xs text-texto-suave">
              Sugestão pela finalidade do lote: {atividades[sugestao]}.{' '}
              {regraAtividadePorFinalidade}
            </p>
            <div>
              <Botao variante="secundario" tamanho="pequeno" onClick={() => setAtividade(sugestao)}>
                Usar a sugestão
              </Botao>
            </div>
          </div>
        )}
        {natureza === 'despesa' && (
          <Campo
            rotulo="Classificação do custo"
            ajuda="Usada em margem bruta e ponto de equilíbrio. Não classificado nunca entra em silêncio nesses indicadores."
          >
            {(p) => (
              <Selecao
                {...p}
                value={comportamento}
                onChange={(e) => setComportamento(e.target.value as ComportamentoLancamento | '')}
              >
                {!edicao && (
                  <option value="">
                    Padrão da categoria
                    {categoria ? ` (${comportamentos[categoria.comportamentoCusto]})` : ''}
                  </option>
                )}
                <option value="variavel">{comportamentos.variavel}</option>
                <option value="fixo">{comportamentos.fixo}</option>
                <option value="nao_classificado">{comportamentos.nao_classificado}</option>
              </Selecao>
            )}
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Quantidade informativa (opcional)"
            ajuda="Não é usada para calcular o valor."
          >
            {(p) => (
              <Entrada
                {...p}
                inputMode="decimal"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            )}
          </Campo>
          <Campo rotulo="Unidade">
            {(p) => (
              <Selecao
                {...p}
                value={unidade}
                onChange={(e) => setUnidade(e.target.value as UnidadeQuantidadeLancamento)}
              >
                {opcoesDe(unidadesQuantidade, UNIDADES_QUANTIDADE_LANCAMENTO)}
              </Selecao>
            )}
          </Campo>
        </div>
        <Campo rotulo="Observações (opcional)" className="md:col-span-2">
          {(p) => (
            <AreaTexto
              {...p}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          )}
        </Campo>
      </div>
      {!edicao && (
        <EditorCondicao
          estado={condicao}
          aoMudar={setCondicao}
          totalCentavos={totalCentavos}
          natureza={natureza}
        />
      )}
      {edicao && (
        <Campo rotulo="Motivo da alteração" obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          )}
        </Campo>
      )}
      {!edicao && (
        <Alerta tom="info">
          Registrar um lançamento não cria pagamento, recebimento nem movimento de estoque. Entradas
          e consumos do estoque continuam sendo apenas quantidades físicas.
        </Alerta>
      )}
    </Modal>
  );
}
