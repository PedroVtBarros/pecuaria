import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CRITERIOS_RATEIO, gerarUuidV7, type CriterioRateio } from '@pecuaria/domain';
import type { EntradaApi, RateioDetalhe } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { AreaTexto, Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { usePreviaRateio } from '../../lib/consultas-rateio';
import { useAnimais, useLotes } from '../../lib/consultas-rebanho';
import { hojeIso } from '../../lib/formatar-rebanho';
import { moeda } from '../../textos-financeiro';
import { ajudaCriterio, criteriosRateio, valorDesconhecido } from '../../textos-rateio';

interface LinhaManual {
  chave: string;
  /** "lote:<id>" ou "animal:<id>"; vazio = não escolhido. */
  alvo: string;
  peso: string;
}
const novaLinha = (): LinhaManual => ({ chave: gerarUuidV7(), alvo: '', peso: '' });

/** Custo a ratear (criação) ou rateio a revisar. */
export type AlvoDoRateio =
  | {
      tipo: 'criar';
      origemTipo: 'lancamento' | 'movimentacao_estoque';
      origemId: string;
      descricao: string;
      valorCentavos: number | null;
    }
  | { tipo: 'revisar'; rateio: RateioDetalhe };

const inteiroPositivo = (t: string): number | null => {
  if (!/^\d{1,12}$/.test(t.trim())) return null;
  const n = Number(t.trim());
  return n > 0 ? n : null;
};

/** Cria ou revisa o rateio de um custo da propriedade. A prévia vem do servidor, que calcula os pesos. */
export function ModalRateio({
  propriedadeId,
  alvo,
  aoFechar,
}: {
  propriedadeId: string;
  alvo: AlvoDoRateio;
  aoFechar: (rateio?: RateioDetalhe) => void;
}) {
  const criar = useAcaoFinanceiro('rateio:criar');
  const revisar = useAcaoFinanceiro('rateio:revisar');
  const lotes = useLotes(propriedadeId, true);
  const animais = useAnimais(propriedadeId, { status: 'ativo', tamanhoPagina: 500 });
  const anterior = alvo.tipo === 'revisar' ? alvo.rateio : null;
  const [requisicaoId] = useState(() => gerarUuidV7());
  const [criterio, setCriterio] = useState<CriterioRateio>(anterior?.criterio ?? 'cabecas');
  const [dataBase, setDataBase] = useState(anterior?.dataBase ?? hojeIso());
  const [periodoInicio, setPeriodoInicio] = useState(anterior?.periodoInicio ?? '');
  const [periodoFim, setPeriodoFim] = useState(anterior?.periodoFim ?? hojeIso());
  const [idade, setIdade] = useState(
    anterior?.idadeMaximaPesagemDias !== null && anterior?.idadeMaximaPesagemDias !== undefined
      ? String(anterior.idadeMaximaPesagemDias)
      : '',
  );
  const [manual, setManual] = useState<LinhaManual[]>(() =>
    anterior && anterior.criterio === 'manual'
      ? anterior.destinos.map((d) => ({
          chave: gerarUuidV7(),
          alvo: `${d.tipo}:${d.id}`,
          peso: String(d.peso),
        }))
      : [novaLinha()],
  );
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<string[]>([]);

  const origemTipo = alvo.tipo === 'criar' ? alvo.origemTipo : alvo.rateio.origemTipo;
  const origemId = alvo.tipo === 'criar' ? alvo.origemId : alvo.rateio.origemId;
  const pesosManuais = manual.map((l) => {
    const [tipo, id] = l.alvo.split(':');
    return { tipo: tipo as 'lote' | 'animal', id: id ?? '', peso: inteiroPositivo(l.peso) };
  });
  const manualValido =
    manual.length > 0 &&
    pesosManuais.every((m) => (m.tipo === 'lote' || m.tipo === 'animal') && m.id && m.peso);
  const idadeNumero = /^\d{1,4}$/.test(idade.trim()) ? Number(idade.trim()) : null;
  const camposValidos =
    Boolean(dataBase) &&
    (criterio !== 'animal_dias' || Boolean(periodoInicio && periodoFim)) &&
    (criterio !== 'peso' || idadeNumero !== null) &&
    (criterio !== 'manual' || manualValido);

  const parametros = {
    criterio,
    dataBase,
    periodoInicio: criterio === 'animal_dias' ? periodoInicio : null,
    periodoFim: criterio === 'animal_dias' ? periodoFim : null,
    idadeMaximaPesagemDias: criterio === 'peso' ? idadeNumero : null,
    manual:
      criterio === 'manual'
        ? pesosManuais.map((m) => ({ tipo: m.tipo, id: m.id, peso: m.peso as number }))
        : [],
  };
  const entradaPrevia: EntradaApi<'rateio:previa'> | null = camposValidos
    ? { propriedadeId, origemTipo, origemId, ...parametros }
    : null;
  const previa = usePreviaRateio(entradaPrevia);
  // Ao revisar, o custo já tem este rateio: "já tem rateio ativo" não é um problema da prévia.
  // Com campos incompletos a prévia anterior (mantida pelo cache) não vale mais.
  const dadosDaPrevia = camposValidos ? previa.data : undefined;
  const errosDaPrevia = dadosDaPrevia?.erros ?? [];
  const destinos = dadosDaPrevia?.destinos ?? [];
  const valorOrigem = dadosDaPrevia?.origem.valorCentavos ?? null;

  const atualizar = (chave: string, m: Partial<LinhaManual>) =>
    setManual(manual.map((l) => (l.chave === chave ? { ...l, ...m } : l)));

  return (
    <Modal
      aberto
      largura="xl"
      titulo={alvo.tipo === 'criar' ? 'Ratear custo da propriedade' : 'Revisar rateio'}
      descricao={
        alvo.tipo === 'criar'
          ? `${alvo.descricao} · ${alvo.valorCentavos === null ? valorDesconhecido : moeda(alvo.valorCentavos)}`
          : `${alvo.rateio.origem.descricao}. A revisão cria uma versão nova e cancela a anterior, que continua no histórico.`
      }
      aoFechar={() => aoFechar()}
      textoEnviar={alvo.tipo === 'criar' ? 'Criar rateio' : 'Salvar revisão'}
      enviando={criar.isPending || revisar.isPending}
      erros={erros}
      aoEnviar={() => {
        const problemas: string[] = [];
        if (!camposValidos) problemas.push('Complete os campos do critério escolhido.');
        if (!motivo.trim()) problemas.push('Informe o motivo do rateio.');
        if (dadosDaPrevia && dadosDaPrevia.erros.length > 0) problemas.push(...dadosDaPrevia.erros);
        if (problemas.length > 0) return setErros([...new Set(problemas)]);
        const aoSucesso = {
          onSuccess: aoFechar,
          onError: (e: unknown) => setErros([mensagemDeErro(e)]),
        };
        if (alvo.tipo === 'criar')
          criar.mutate(
            {
              requisicaoId,
              propriedadeId,
              origemTipo,
              origemId,
              ...parametros,
              motivo: motivo.trim(),
            },
            aoSucesso,
          );
        else
          revisar.mutate(
            { id: alvo.rateio.id, requisicaoId, ...parametros, motivo: motivo.trim() },
            aoSucesso,
          );
      }}
    >
      <Campo rotulo="Critério" obrigatorio ajuda={ajudaCriterio[criterio]}>
        {(p) => (
          <Selecao
            {...p}
            value={criterio}
            onChange={(e) => setCriterio(e.target.value as CriterioRateio)}
          >
            {CRITERIOS_RATEIO.map((c) => (
              <option key={c} value={c}>
                {criteriosRateio[c]}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {criterio !== 'animal_dias' && criterio !== 'manual' && (
          <Campo rotulo="Data-base" obrigatorio ajuda="Animais presentes ao fim deste dia.">
            {(p) => (
              <Entrada
                {...p}
                type="date"
                value={dataBase}
                max={hojeIso()}
                onChange={(e) => setDataBase(e.target.value)}
              />
            )}
          </Campo>
        )}
        {criterio === 'animal_dias' && (
          <>
            <Campo rotulo="Início do período" obrigatorio>
              {(p) => (
                <Entrada
                  {...p}
                  type="date"
                  value={periodoInicio}
                  onChange={(e) => setPeriodoInicio(e.target.value)}
                />
              )}
            </Campo>
            <Campo rotulo="Fim do período" obrigatorio>
              {(p) => (
                <Entrada
                  {...p}
                  type="date"
                  value={periodoFim}
                  max={hojeIso()}
                  onChange={(e) => {
                    setPeriodoFim(e.target.value);
                    setDataBase(e.target.value || dataBase);
                  }}
                />
              )}
            </Campo>
          </>
        )}
        {criterio === 'manual' && (
          <Campo rotulo="Data de referência" obrigatorio ajuda="Fica registrada no rateio.">
            {(p) => (
              <Entrada
                {...p}
                type="date"
                value={dataBase}
                max={hojeIso()}
                onChange={(e) => setDataBase(e.target.value)}
              />
            )}
          </Campo>
        )}
        {criterio === 'peso' && (
          <Campo
            rotulo="Idade máxima da pesagem (dias)"
            obrigatorio
            ajuda="Todos os animais precisam ter pesagem real dentro deste limite. Quem define é você."
          >
            {(p) => (
              <Entrada
                {...p}
                inputMode="numeric"
                value={idade}
                onChange={(e) => setIdade(e.target.value)}
              />
            )}
          </Campo>
        )}
      </div>

      {criterio === 'manual' && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-borda p-4">
          <legend className="px-1 text-sm font-medium">Destinos e pesos</legend>
          {manual.map((l, i) => (
            <div
              key={l.chave}
              className="grid grid-cols-[1fr_8rem_auto] items-end gap-2"
              data-testid="linha-peso-manual"
            >
              <Campo rotulo={`Destino ${i + 1}`}>
                {(p) => (
                  <Selecao
                    {...p}
                    value={l.alvo}
                    onChange={(e) => atualizar(l.chave, { alvo: e.target.value })}
                  >
                    <option value="">Escolher…</option>
                    <optgroup label="Lotes">
                      {(lotes.data ?? []).map((x) => (
                        <option key={x.id} value={`lote:${x.id}`}>
                          {x.nome}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Animais ativos">
                      {(animais.data?.itens ?? []).map((x) => (
                        <option key={x.id} value={`animal:${x.id}`}>
                          {x.identificacao}
                        </option>
                      ))}
                    </optgroup>
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Peso relativo">
                {(p) => (
                  <Entrada
                    {...p}
                    inputMode="numeric"
                    value={l.peso}
                    onChange={(e) => atualizar(l.chave, { peso: e.target.value })}
                  />
                )}
              </Campo>
              <Botao
                variante="secundario"
                tamanho="pequeno"
                aria-label={`Remover destino ${i + 1}`}
                disabled={manual.length === 1}
                onClick={() => setManual(manual.filter((x) => x.chave !== l.chave))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Botao>
            </div>
          ))}
          <Botao
            variante="secundario"
            tamanho="pequeno"
            className="w-fit"
            onClick={() => setManual([...manual, novaLinha()])}
          >
            <Plus className="size-4" aria-hidden /> Adicionar destino
          </Botao>
        </fieldset>
      )}

      <section
        className="flex flex-col gap-2"
        aria-label="Prévia do rateio"
        data-testid="previa-rateio"
      >
        <h3 className="text-sm font-medium">Prévia</h3>
        {!camposValidos && (
          <p className="text-sm text-texto-suave">
            Preencha os campos para ver como o custo será dividido.
          </p>
        )}
        {errosDaPrevia.length > 0 && (
          <Alerta tom="alerta" titulo="O critério não pôde ser calculado">
            <ul className="list-disc pl-5">
              {errosDaPrevia.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alerta>
        )}
        {destinos.length > 0 && (
          <Tabela>
            <Cabeca>
              <Th>Destino</Th>
              <Th>Base</Th>
              <Th className="text-right">Peso</Th>
              <Th className="text-right">Valor</Th>
            </Cabeca>
            <tbody>
              {destinos.map((d) => (
                <Linha key={`${d.tipo}:${d.id}`}>
                  <Td>{d.rotulo}</Td>
                  <Td>{d.base}</Td>
                  <Td className="text-right whitespace-nowrap">{d.peso.toLocaleString('pt-BR')}</Td>
                  <Td className="text-right whitespace-nowrap">
                    {d.valorCentavos === null ? valorDesconhecido : moeda(d.valorCentavos)}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
        {destinos.length > 0 && valorOrigem !== null && (
          <p className="text-xs text-texto-suave">
            A soma das partes é exatamente {moeda(valorOrigem)}: a divisão não perde nem cria
            centavos.
          </p>
        )}
        {destinos.length > 0 && valorOrigem === null && (
          <p className="text-xs text-texto-suave">
            O custo de origem é desconhecido. O rateio grava os pesos e os valores aparecem quando o
            custo for apurado.
          </p>
        )}
      </section>

      <Campo rotulo="Motivo do rateio" obrigatorio>
        {(p) => (
          <AreaTexto
            {...p}
            rows={2}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}
