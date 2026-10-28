import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  CATEGORIAS_ANIMAL,
  SEXO_DA_CATEGORIA,
  gerarUuidV7,
  type AptidaoAnimal,
  type CategoriaAnimal,
} from '@pecuaria/domain';
import type { NegociacaoDetalhe } from '@pecuaria/shared-types';
import { Botao } from '../../components/ui/botao';
import { Campo, CaixaMarcar, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { useLotes } from '../../lib/consultas-rebanho';
import { hojeIso } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { centavosDoTexto } from './campo-dinheiro';
import { condicaoInicial } from './editor-condicao';
import {
  CamposNegociacao,
  PreviaAlocacao,
  estadoNegocioInicial,
  interpretar,
  quilosDoTexto,
  type EstadoNegociacao,
  type LinhaAnimal,
} from './formulario-negociacao';

interface AnimalCompra extends LinhaAnimal {
  categoria: CategoriaAnimal;
  castrado: boolean;
}
const novaLinha = (rotulo: string): AnimalCompra => ({
  chave: gerarUuidV7(),
  rotulo,
  pesoVivo: '',
  pesoCarcaca: '',
  valorManual: '',
  categoria: 'garrote',
  castrado: false,
});

/** Compra de animais: cria animais, negociação e lançamento financeiro numa só operação. */
export function ModalCompra({
  propriedadeId,
  aoFechar,
  aoRegistrar,
}: {
  propriedadeId: string;
  aoFechar: () => void;
  aoRegistrar: (n: NegociacaoDetalhe) => void;
}) {
  const registrar = useAcaoFinanceiro('negociacao:registrarCompra');
  const lotes = useLotes(propriedadeId);
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [estado, setEstado] = useState<EstadoNegociacao>(() =>
    estadoNegocioInicial(hojeIso(), condicaoInicial(hojeIso())),
  );
  const [aptidao, setAptidao] = useState<AptidaoAnimal>('corte');
  const [loteId, setLoteId] = useState('');
  const [animais, setAnimais] = useState<AnimalCompra[]>([novaLinha('')]);
  const [prefixo, setPrefixo] = useState('');
  const [quantidade, setQuantidade] = useState('5');
  const [erros, setErros] = useState<string[]>([]);
  const usaCarcaca = estado.unidadePreco === 'arroba_carcaca' || estado.criterio === 'peso_carcaca';
  const manual = estado.criterio === 'manual';
  const interpretacao = useMemo(() => interpretar(estado, animais, 'despesa'), [estado, animais]);
  const atualizar = (chave: string, mudanca: Partial<AnimalCompra>) =>
    setAnimais(animais.map((a) => (a.chave === chave ? { ...a, ...mudanca } : a)));

  const gerar = () => {
    const n = Number(quantidade);
    if (!Number.isInteger(n) || n < 1 || n > 200) return;
    const novas = Array.from({ length: n }, (_, i) =>
      novaLinha(`${prefixo.trim()}${String(i + 1).padStart(String(n).length, '0')}`),
    );
    setAnimais([...animais.filter((a) => a.rotulo.trim() !== ''), ...novas]);
  };

  return (
    <Modal
      aberto
      largura="xl"
      titulo="Registrar compra de animais"
      descricao="Cria os animais no rebanho (origem: comprado), a negociação e o lançamento financeiro juntos. Nenhum pagamento é registrado sem a sua confirmação."
      aoFechar={aoFechar}
      textoEnviar="Registrar compra"
      enviando={registrar.isPending}
      erros={erros}
      aoEnviar={() => {
        const faltaId = animais.some((a) => a.rotulo.trim() === '');
        if (faltaId) return setErros(['Informe a identificação de todos os animais.']);
        if (
          interpretacao.erros.length > 0 ||
          !interpretacao.condicao ||
          !interpretacao.totalCentavos
        )
          return setErros(interpretacao.erros.length ? interpretacao.erros : ['Revise os dados.']);
        registrar.mutate(
          {
            requisicaoId,
            propriedadeId,
            data: estado.data,
            pessoaId: estado.pessoaId || null,
            atividade: estado.atividade,
            observacoes: estado.observacoes.trim() || null,
            valorTotalCentavos: interpretacao.totalCentavos,
            unidadePreco: estado.unidadePreco,
            precoUnitarioCentavos: interpretacao.precoCentavos,
            criterio: estado.criterio,
            condicao: interpretacao.condicao,
            loteId: loteId || null,
            animais: animais.map((a) => {
              const sexo = SEXO_DA_CATEGORIA[a.categoria];
              const peso = quilosDoTexto(a.pesoVivo);
              const carcaca = quilosDoTexto(a.pesoCarcaca);
              return {
                dados: {
                  identificacao: a.rotulo.trim(),
                  nome: null,
                  sexo,
                  condicaoSexual: sexo === 'F' ? 'femea' : a.castrado ? 'castrado' : 'inteiro',
                  categoria: a.categoria,
                  aptidao,
                  racaId: null,
                  dataNascimento: null,
                  dataNascimentoEstimada: false,
                  maeId: null,
                  paiId: null,
                  origem: 'comprado',
                  observacoes: null,
                },
                pesoVivoKg: peso,
                metodoPesagem: peso === null ? null : 'balanca',
                pesoCarcacaKg: carcaca,
                valorManualCentavos: manual ? centavosDoTexto(a.valorManual).centavos : null,
              };
            }),
          },
          { onSuccess: aoRegistrar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      <CamposNegociacao
        estado={estado}
        aoMudar={setEstado}
        linhas={animais}
        natureza="despesa"
        rotuloContraparte="Fornecedor"
        sugerirTotal
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Aptidão dos animais">
          {(p) => (
            <Selecao
              {...p}
              value={aptidao}
              onChange={(e) => setAptidao(e.target.value as AptidaoAnimal)}
            >
              <option value="corte">Corte</option>
              <option value="leite">Leite</option>
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Lote de destino (opcional)">
          {(p) => (
            <Selecao {...p} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
              <option value="">Sem lote</option>
              {(lotes.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda p-4">
        <legend className="px-1 text-sm font-medium">Animais comprados ({animais.length})</legend>
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Prefixo da identificação">
            {(p) => (
              <Entrada
                {...p}
                value={prefixo}
                maxLength={20}
                onChange={(e) => setPrefixo(e.target.value)}
              />
            )}
          </Campo>
          <Campo rotulo="Quantidade">
            {(p) => (
              <Entrada
                {...p}
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            )}
          </Campo>
          <Botao variante="secundario" onClick={gerar}>
            Gerar identificações
          </Botao>
          <Botao variante="secundario" onClick={() => setAnimais([...animais, novaLinha('')])}>
            <Plus className="size-4" aria-hidden />
            Adicionar animal
          </Botao>
        </div>
        <div className="flex flex-col gap-2" data-testid="animais-da-compra">
          {animais.map((a, i) => (
            <div
              key={a.chave}
              className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.9fr_auto]"
            >
              <Campo rotulo={`Identificação ${i + 1}`}>
                {(p) => (
                  <Entrada
                    {...p}
                    value={a.rotulo}
                    maxLength={40}
                    onChange={(e) => atualizar(a.chave, { rotulo: e.target.value })}
                  />
                )}
              </Campo>
              <Campo rotulo="Categoria">
                {(p) => (
                  <Selecao
                    {...p}
                    value={a.categoria}
                    onChange={(e) =>
                      atualizar(a.chave, { categoria: e.target.value as CategoriaAnimal })
                    }
                  >
                    {CATEGORIAS_ANIMAL.map((c) => (
                      <option key={c} value={c}>
                        {rotulos.categoria[c]}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Peso vivo (kg)">
                {(p) => (
                  <Entrada
                    {...p}
                    inputMode="decimal"
                    value={a.pesoVivo}
                    onChange={(e) => atualizar(a.chave, { pesoVivo: e.target.value })}
                  />
                )}
              </Campo>
              {usaCarcaca ? (
                <Campo rotulo="Carcaça (kg)">
                  {(p) => (
                    <Entrada
                      {...p}
                      inputMode="decimal"
                      value={a.pesoCarcaca}
                      onChange={(e) => atualizar(a.chave, { pesoCarcaca: e.target.value })}
                    />
                  )}
                </Campo>
              ) : manual ? (
                <Campo rotulo="Valor (R$)">
                  {(p) => (
                    <Entrada
                      {...p}
                      inputMode="decimal"
                      value={a.valorManual}
                      onChange={(e) => atualizar(a.chave, { valorManual: e.target.value })}
                    />
                  )}
                </Campo>
              ) : (
                <div />
              )}
              {SEXO_DA_CATEGORIA[a.categoria] === 'M' ? (
                <CaixaMarcar
                  rotulo="Castrado"
                  marcado={a.castrado}
                  aoMudar={(castrado) => atualizar(a.chave, { castrado })}
                />
              ) : (
                <div />
              )}
              <Botao
                variante="secundario"
                tamanho="pequeno"
                aria-label={`Remover animal ${i + 1}`}
                disabled={animais.length === 1}
                onClick={() => setAnimais(animais.filter((x) => x.chave !== a.chave))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Botao>
            </div>
          ))}
        </div>
        {manual && usaCarcaca === false && (
          <p className="text-xs text-texto-suave">
            Critério manual: digite o valor de cada animal; a soma precisa ser exatamente o valor
            total.
          </p>
        )}
      </fieldset>
      <PreviaAlocacao linhas={animais} interpretacao={interpretacao} criterio={estado.criterio} />
    </Modal>
  );
}
