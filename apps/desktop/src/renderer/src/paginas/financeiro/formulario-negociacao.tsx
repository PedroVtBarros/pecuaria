import { useMemo } from 'react';
import {
  ATIVIDADES,
  CRITERIOS_ALOCACAO,
  UNIDADES_PRECO,
  alocarPrecoDeAnimais,
  conferirPrecoUnitario,
  criterioPadraoDaUnidade,
  formatarCentavos,
  formatarCentavosSemSimbolo,
  kgParaGramas,
  totalPelaUnidade,
  type CriterioAlocacao,
  type UnidadePreco,
} from '@pecuaria/domain';
import type { DadosCompraAnimais } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { usePessoasComerciais } from '../../lib/consultas-financeiro';
import { atividades } from '../../textos-financeiro';
import { criterios, textoAlocacao, unidadesPreco } from '../../textos-negociacao';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import { EditorCondicao, converterCondicao, type EstadoCondicao } from './editor-condicao';

/** Um animal da operação, com os pesos como o usuário digitou (quilos). */
export interface LinhaAnimal {
  chave: string;
  rotulo: string;
  pesoVivo: string;
  pesoCarcaca: string;
  valorManual: string;
}

export interface EstadoNegociacao {
  data: string;
  pessoaId: string;
  atividade: (typeof ATIVIDADES)[number];
  unidadePreco: UnidadePreco;
  preco: string;
  total: string;
  criterio: CriterioAlocacao;
  condicao: EstadoCondicao;
  observacoes: string;
}

/** Quilos digitados (vírgula ou ponto) para número; `null` vazio, `NaN` inválido. */
export function quilosDoTexto(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d+(\.\d{1,3})?$/.test(t) ? Number(t) : Number.NaN;
}

export interface Interpretacao {
  erros: string[];
  /** Valor de cada animal (por chave) quando a alocação fecha. */
  valores: Map<string, number> | null;
  totalCentavos: number | null;
  precoCentavos: number | null;
  condicao: DadosCompraAnimais['condicao'] | null;
}

/** Converte o formulário e simula a alocação do servidor (que sempre refaz o cálculo). */
export function interpretar(
  e: EstadoNegociacao,
  linhas: readonly LinhaAnimal[],
  natureza: 'receita' | 'despesa',
): Interpretacao {
  const erros: string[] = [];
  const total = centavosDoTexto(e.total);
  const preco = centavosDoTexto(e.preco);
  if (total.erro) erros.push(`Valor total: ${total.erro}`);
  else if (total.centavos === null || total.centavos <= 0)
    erros.push('Informe o valor total da operação.');
  if (preco.erro) erros.push(`Preço unitário: ${preco.erro}`);
  if (e.unidadePreco !== 'total' && preco.centavos === null && !preco.erro)
    erros.push('Informe o preço unitário ou escolha "só o valor total".');
  if (linhas.length === 0) erros.push('Informe ao menos um animal.');

  const animais = linhas.map((l) => {
    const vivo = quilosDoTexto(l.pesoVivo);
    const carcaca = quilosDoTexto(l.pesoCarcaca);
    const manual = centavosDoTexto(l.valorManual);
    if (Number.isNaN(vivo)) erros.push(`${l.rotulo}: peso vivo inválido.`);
    if (Number.isNaN(carcaca)) erros.push(`${l.rotulo}: peso de carcaça inválido.`);
    if (manual.erro) erros.push(`${l.rotulo}: valor inválido.`);
    const g = (kg: number | null) => {
      if (kg === null || Number.isNaN(kg)) return null;
      try {
        return kgParaGramas(kg);
      } catch (x) {
        erros.push(`${l.rotulo}: ${x instanceof Error ? x.message : 'peso inválido.'}`);
        return null;
      }
    };
    return {
      id: l.chave,
      rotulo: l.rotulo,
      pesoVivoG: g(vivo),
      pesoCarcacaG: g(carcaca),
      valorManualCentavos: manual.centavos,
    };
  });

  let valores: Map<string, number> | null = null;
  if (total.centavos !== null && total.centavos > 0 && linhas.length > 0 && erros.length === 0) {
    const r = alocarPrecoDeAnimais({
      totalCentavos: total.centavos,
      criterio: e.criterio,
      animais,
    });
    if (r.erros.length) erros.push(...r.erros);
    else {
      valores = new Map(r.valores.map((v) => [v.id, v.valorCentavos]));
      const soma = (campo: 'pesoVivoG' | 'pesoCarcacaG') =>
        animais.every((a) => a[campo] !== null)
          ? animais.reduce((s, a) => s + (a[campo] as number), 0)
          : null;
      const problema = conferirPrecoUnitario({
        totalCentavos: total.centavos,
        unidade: e.unidadePreco,
        precoUnitarioCentavos: e.unidadePreco === 'total' ? null : preco.centavos,
        cabecas: animais.length,
        pesoVivoG: soma('pesoVivoG'),
        pesoCarcacaG: soma('pesoCarcacaG'),
      });
      if (problema) erros.push(problema);
    }
  }
  const cond = converterCondicao(e.condicao, total.centavos, true);
  if (total.centavos !== null && total.centavos > 0) erros.push(...cond.erros);
  void natureza;
  return {
    erros: [...new Set(erros)],
    valores,
    totalCentavos: total.centavos,
    precoCentavos: e.unidadePreco === 'total' ? null : preco.centavos,
    condicao: cond.condicao,
  };
}

/** Total sugerido pelo preço unitário e pelas quantidades; só ajuda a preencher, o total é editável. */
export function totalSugerido(e: EstadoNegociacao, linhas: readonly LinhaAnimal[]): number | null {
  const preco = centavosDoTexto(e.preco).centavos;
  if (preco === null || e.unidadePreco === 'total' || linhas.length === 0) return null;
  const soma = (campo: 'pesoVivo' | 'pesoCarcaca') => {
    let s = 0;
    for (const l of linhas) {
      const kg = quilosDoTexto(l[campo]);
      if (kg === null || Number.isNaN(kg)) return null;
      try {
        s += kgParaGramas(kg);
      } catch {
        return null;
      }
    }
    return s;
  };
  return totalPelaUnidade(e.unidadePreco, preco, {
    cabecas: linhas.length,
    pesoVivoG: soma('pesoVivo'),
    pesoCarcacaG: soma('pesoCarcaca'),
  });
}

export function estadoNegocioInicial(hoje: string, condicao: EstadoCondicao): EstadoNegociacao {
  return {
    data: hoje,
    pessoaId: '',
    atividade: 'nao_definida' as (typeof ATIVIDADES)[number],
    unidadePreco: 'total',
    preco: '',
    total: '',
    criterio: 'igual',
    condicao,
    observacoes: '',
  };
}

/** Campos comuns de compra e venda: data, contraparte, preço, critério, condição de pagamento. */
export function CamposNegociacao({
  estado,
  aoMudar,
  linhas,
  natureza,
  rotuloContraparte,
  sugerirTotal,
}: {
  estado: EstadoNegociacao;
  aoMudar: (e: EstadoNegociacao) => void;
  linhas: readonly LinhaAnimal[];
  natureza: 'receita' | 'despesa';
  rotuloContraparte: string;
  sugerirTotal: boolean;
}) {
  const pessoas = usePessoasComerciais(false);
  const sugestao = useMemo(() => totalSugerido(estado, linhas), [estado, linhas]);
  const totalCentavos = centavosDoTexto(estado.total).centavos;
  const trocarUnidade = (unidade: UnidadePreco) =>
    aoMudar({
      ...estado,
      unidadePreco: unidade,
      // O critério acompanha a unidade do preço; o usuário pode trocá-lo depois.
      criterio: criterioPadraoDaUnidade(unidade),
    });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo rotulo="Data" obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={estado.data}
              onChange={(e) => aoMudar({ ...estado, data: e.target.value })}
            />
          )}
        </Campo>
        <Campo rotulo={rotuloContraparte}>
          {(p) => (
            <Selecao
              {...p}
              value={estado.pessoaId}
              onChange={(e) => aoMudar({ ...estado, pessoaId: e.target.value })}
            >
              <option value="">Não informado</option>
              {(pessoas.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Atividade">
          {(p) => (
            <Selecao
              {...p}
              value={estado.atividade}
              onChange={(e) =>
                aoMudar({ ...estado, atividade: e.target.value as (typeof ATIVIDADES)[number] })
              }
            >
              {opcoesDe(atividades, ATIVIDADES)}
            </Selecao>
          )}
        </Campo>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-lg border border-borda p-4">
        <legend className="px-1 text-sm font-medium">Preço e alocação</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Unidade do preço negociado">
            {(p) => (
              <Selecao
                {...p}
                value={estado.unidadePreco}
                onChange={(e) => trocarUnidade(e.target.value as UnidadePreco)}
              >
                {opcoesDe(unidadesPreco, UNIDADES_PRECO)}
              </Selecao>
            )}
          </Campo>
          {estado.unidadePreco !== 'total' && (
            <CampoDinheiro
              rotulo="Preço unitário"
              valor={estado.preco}
              aoMudar={(preco) => aoMudar({ ...estado, preco })}
              ajuda="Na unidade escolhida, em reais."
            />
          )}
          <CampoDinheiro
            rotulo="Valor total da operação"
            valor={estado.total}
            aoMudar={(total) => aoMudar({ ...estado, total })}
            obrigatorio
            ajuda="É o valor que fica gravado; o preço unitário só é conferido contra ele."
          />
          <Campo rotulo="Critério de alocação entre os animais">
            {(p) => (
              <Selecao
                {...p}
                value={estado.criterio}
                onChange={(e) =>
                  aoMudar({ ...estado, criterio: e.target.value as CriterioAlocacao })
                }
              >
                {opcoesDe(criterios, CRITERIOS_ALOCACAO)}
              </Selecao>
            )}
          </Campo>
        </div>
        {sugerirTotal && sugestao !== null && sugestao !== totalCentavos && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Preço e quantidades dão <strong>{formatarCentavos(sugestao)}</strong>.
            </span>
            <Botao
              variante="secundario"
              tamanho="pequeno"
              onClick={() => aoMudar({ ...estado, total: formatarCentavosSemSimbolo(sugestao) })}
            >
              Usar como valor total
            </Botao>
          </div>
        )}
        <p className="text-xs text-texto-suave">{textoAlocacao}</p>
      </fieldset>
      <EditorCondicao
        estado={estado.condicao}
        aoMudar={(condicao) => aoMudar({ ...estado, condicao })}
        totalCentavos={totalCentavos}
        natureza={natureza}
      />
      <Campo rotulo="Observações (opcional)">
        {(p) => (
          <Entrada
            {...p}
            maxLength={1000}
            value={estado.observacoes}
            onChange={(e) => aoMudar({ ...estado, observacoes: e.target.value })}
          />
        )}
      </Campo>
    </div>
  );
}

/** Quanto cabe a cada animal, pela mesma regra do servidor, antes de gravar. */
export function PreviaAlocacao({
  linhas,
  interpretacao,
  criterio,
}: {
  linhas: readonly LinhaAnimal[];
  interpretacao: Interpretacao;
  criterio: CriterioAlocacao;
}) {
  const soma = interpretacao.valores
    ? [...interpretacao.valores.values()].reduce((s, v) => s + v, 0)
    : null;
  return (
    <section className="flex flex-col gap-2" data-testid="previa-alocacao">
      <h3 className="text-sm font-medium">
        Prévia da alocação ({criterios[criterio].toLowerCase()})
      </h3>
      {interpretacao.erros.length > 0 && (
        <Alerta tom="alerta" titulo="Ajuste antes de registrar">
          <ul className="list-disc pl-5">
            {interpretacao.erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alerta>
      )}
      {interpretacao.valores && (
        <Tabela>
          <Cabeca>
            <Th>Animal</Th>
            <Th className="text-right">Peso vivo (kg)</Th>
            <Th className="text-right">Carcaça (kg)</Th>
            <Th className="text-right">Valor alocado</Th>
          </Cabeca>
          <tbody>
            {linhas.map((l) => (
              <Linha key={l.chave}>
                <Td>{l.rotulo}</Td>
                <Td className="text-right">{l.pesoVivo || '—'}</Td>
                <Td className="text-right">{l.pesoCarcaca || '—'}</Td>
                <Td className="text-right whitespace-nowrap">
                  {formatarCentavos(interpretacao.valores!.get(l.chave) ?? 0)}
                </Td>
              </Linha>
            ))}
            <Linha>
              <Td className="font-medium" colSpan={3}>
                Soma (confere com o valor total)
              </Td>
              <Td className="text-right font-medium whitespace-nowrap" data-testid="soma-alocacao">
                {soma === null ? '—' : formatarCentavos(soma)}
              </Td>
            </Linha>
          </tbody>
        </Tabela>
      )}
    </section>
  );
}
