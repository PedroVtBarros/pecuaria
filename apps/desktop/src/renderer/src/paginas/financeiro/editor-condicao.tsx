import { useState } from 'react';
import {
  PARCELAS_MAXIMO,
  formatarCentavos,
  formatarCentavosSemSimbolo,
  gerarParcelas,
  somarCentavos,
  validarParcelas,
  type CondicaoPagamento,
  type NaturezaFinanceira,
} from '@pecuaria/domain';
import type { DadosLancamento } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, Selecao } from '../../components/ui/campos';
import { centavosDoTexto, CampoDinheiro } from './campo-dinheiro';

export interface EstadoCondicao {
  tipo: CondicaoPagamento;
  vencimento: string;
  jaPago: boolean;
  dataPagamento: string;
  forma: string;
  quantidade: string;
  primeiroVencimento: string;
  regra: 'mensal' | 'dias';
  intervaloDias: string;
  parcelas: { vencimento: string; valor: string }[];
}

export function condicaoInicial(hoje: string): EstadoCondicao {
  return {
    tipo: 'a_vista',
    vencimento: hoje,
    jaPago: false,
    dataPagamento: hoje,
    forma: '',
    quantidade: '2',
    primeiroVencimento: hoje,
    regra: 'mensal',
    intervaloDias: '30',
    parcelas: [],
  };
}

type CondicaoApi = DadosLancamento['condicao'];

/** Converte o que foi digitado na condição aceita pela API, ou lista o que está errado. */
export function converterCondicao(
  e: EstadoCondicao,
  totalCentavos: number | null,
  permitirNaoInformada = true,
): { condicao: CondicaoApi | null; erros: string[] } {
  if (e.tipo === 'nao_informada') {
    return permitirNaoInformada
      ? { condicao: { tipo: 'nao_informada' }, erros: [] }
      : { condicao: null, erros: ['Escolha à vista ou parcelado.'] };
  }
  if (e.tipo === 'a_vista') {
    const erros: string[] = [];
    if (!e.vencimento) erros.push('Informe o vencimento.');
    if (e.jaPago && !e.dataPagamento) erros.push('Informe a data do pagamento.');
    if (erros.length) return { condicao: null, erros };
    return {
      condicao: {
        tipo: 'a_vista',
        vencimento: e.vencimento,
        pagamento: e.jaPago ? { data: e.dataPagamento, forma: e.forma.trim() || null } : null,
      },
      erros: [],
    };
  }
  const erros: string[] = [];
  const parcelas = e.parcelas.map((p, i) => {
    const { centavos, erro } = centavosDoTexto(p.valor);
    if (erro) erros.push(`Parcela ${i + 1}: ${erro}`);
    return { vencimento: p.vencimento, valorCentavos: centavos ?? 0 };
  });
  if (parcelas.length < 2) erros.push('Gere ao menos duas parcelas.');
  if (erros.length === 0 && totalCentavos !== null)
    erros.push(...validarParcelas(parcelas, totalCentavos));
  if (erros.length) return { condicao: null, erros };
  return { condicao: { tipo: 'parcelado', parcelas }, erros: [] };
}

/** Lista de parcelas editável, com a soma conferida contra o total a parcelar. */
export function EditorParcelas({
  parcelas,
  aoMudar,
  totalCentavos,
}: {
  parcelas: { vencimento: string; valor: string }[];
  aoMudar: (p: { vencimento: string; valor: string }[]) => void;
  totalCentavos: number | null;
}) {
  const valores = parcelas.map((p) => centavosDoTexto(p.valor).centavos ?? 0);
  const soma = somarCentavos(valores);
  const diferenca = totalCentavos === null ? null : totalCentavos - soma;
  return (
    <div className="flex flex-col gap-2" data-testid="editor-parcelas">
      {parcelas.map((p, i) => (
        <div key={i} className="grid grid-cols-[2rem_1fr_1fr] items-end gap-2">
          <span className="pb-2 text-sm text-texto-suave">{i + 1}</span>
          <Campo rotulo={`Vencimento da parcela ${i + 1}`}>
            {(c) => (
              <Entrada
                {...c}
                type="date"
                value={p.vencimento}
                onChange={(e) =>
                  aoMudar(
                    parcelas.map((x, k) => (k === i ? { ...x, vencimento: e.target.value } : x)),
                  )
                }
              />
            )}
          </Campo>
          <CampoDinheiro
            rotulo={`Valor da parcela ${i + 1}`}
            valor={p.valor}
            ajuda=""
            aoMudar={(valor) => aoMudar(parcelas.map((x, k) => (k === i ? { ...x, valor } : x)))}
          />
        </div>
      ))}
      {parcelas.length > 0 && (
        <p
          className={`text-sm ${diferenca === 0 ? 'text-sucesso' : 'text-perigo'}`}
          data-testid="soma-parcelas"
        >
          Soma das parcelas: {formatarCentavos(soma)}
          {diferenca === null
            ? ''
            : diferenca === 0
              ? ' (confere com o total)'
              : diferenca > 0
                ? ` — faltam ${formatarCentavos(diferenca)} para o total`
                : ` — passam ${formatarCentavos(-diferenca)} do total`}
        </p>
      )}
    </div>
  );
}

/** Gerador de parcelas iguais (resíduo na última), a partir do total e do primeiro vencimento. */
export function GeradorParcelas({
  estado,
  aoMudar,
  totalCentavos,
  minimoParcelas = 2,
}: {
  estado: EstadoCondicao;
  aoMudar: (e: EstadoCondicao) => void;
  totalCentavos: number | null;
  minimoParcelas?: number;
}) {
  const [erro, setErro] = useState<string | null>(null);
  function gerar() {
    try {
      if (totalCentavos === null) throw new Error('Informe antes o valor a parcelar.');
      const geradas = gerarParcelas({
        totalCentavos,
        quantidade: Number(estado.quantidade),
        primeiroVencimento: estado.primeiroVencimento,
        regra:
          estado.regra === 'mensal'
            ? { tipo: 'mensal' }
            : { tipo: 'intervalo_dias', dias: Number(estado.intervaloDias) },
      });
      setErro(null);
      aoMudar({
        ...estado,
        parcelas: geradas.map((p) => ({
          vencimento: p.vencimento,
          valor: formatarCentavosSemSimbolo(p.valorCentavos),
        })),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar as parcelas.');
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Número de parcelas" ajuda={`De ${minimoParcelas} a ${PARCELAS_MAXIMO}`}>
          {(c) => (
            <Entrada
              {...c}
              inputMode="numeric"
              value={estado.quantidade}
              onChange={(e) => aoMudar({ ...estado, quantidade: e.target.value })}
            />
          )}
        </Campo>
        <Campo rotulo="Primeiro vencimento">
          {(c) => (
            <Entrada
              {...c}
              type="date"
              value={estado.primeiroVencimento}
              onChange={(e) => aoMudar({ ...estado, primeiroVencimento: e.target.value })}
            />
          )}
        </Campo>
        <Campo rotulo="Intervalo entre vencimentos">
          {(c) => (
            <Selecao
              {...c}
              value={estado.regra}
              onChange={(e) => aoMudar({ ...estado, regra: e.target.value as 'mensal' | 'dias' })}
            >
              <option value="mensal">Mensal (mesmo dia de cada mês)</option>
              <option value="dias">A cada N dias</option>
            </Selecao>
          )}
        </Campo>
        {estado.regra === 'dias' && (
          <Campo rotulo="Dias entre parcelas">
            {(c) => (
              <Entrada
                {...c}
                inputMode="numeric"
                value={estado.intervaloDias}
                onChange={(e) => aoMudar({ ...estado, intervaloDias: e.target.value })}
              />
            )}
          </Campo>
        )}
      </div>
      <div>
        <Botao variante="secundario" onClick={gerar}>
          Gerar parcelas iguais
        </Botao>
        <span className="ml-3 text-xs text-texto-suave">
          O resíduo da divisão fica na última parcela. Você pode editar cada parcela.
        </span>
      </div>
      {erro && <Alerta tom="perigo" titulo={erro} />}
      <EditorParcelas
        parcelas={estado.parcelas}
        totalCentavos={totalCentavos}
        aoMudar={(parcelas) => aoMudar({ ...estado, parcelas })}
      />
    </div>
  );
}

/** Condição de pagamento: à vista, parcelado ou ainda não informada. */
export function EditorCondicao({
  estado,
  aoMudar,
  totalCentavos,
  natureza,
  permitirNaoInformada = true,
}: {
  estado: EstadoCondicao;
  aoMudar: (e: EstadoCondicao) => void;
  totalCentavos: number | null;
  natureza: NaturezaFinanceira;
  permitirNaoInformada?: boolean;
}) {
  const recebimento = natureza === 'receita';
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-borda p-4">
      <legend className="px-1 text-sm font-medium">
        Condição de {recebimento ? 'recebimento' : 'pagamento'}
      </legend>
      <Campo rotulo="Como será">
        {(c) => (
          <Selecao
            {...c}
            value={estado.tipo}
            onChange={(e) => aoMudar({ ...estado, tipo: e.target.value as CondicaoPagamento })}
          >
            <option value="a_vista">À vista (uma parcela)</option>
            <option value="parcelado">Parcelado</option>
            {permitirNaoInformada && <option value="nao_informada">Ainda não informada</option>}
          </Selecao>
        )}
      </Campo>
      {estado.tipo === 'a_vista' && (
        <>
          <Campo rotulo="Vencimento">
            {(c) => (
              <Entrada
                {...c}
                type="date"
                value={estado.vencimento}
                onChange={(e) => aoMudar({ ...estado, vencimento: e.target.value })}
              />
            )}
          </Campo>
          <CaixaMarcar
            rotulo={`Já foi ${recebimento ? 'recebido' : 'pago'} (registrar o ${recebimento ? 'recebimento' : 'pagamento'} agora)`}
            marcado={estado.jaPago}
            aoMudar={(jaPago) => aoMudar({ ...estado, jaPago })}
          />
          {estado.jaPago ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                rotulo={`Data do ${recebimento ? 'recebimento' : 'pagamento'}`}
                ajuda="Não pode ser data futura."
              >
                {(c) => (
                  <Entrada
                    {...c}
                    type="date"
                    value={estado.dataPagamento}
                    onChange={(e) => aoMudar({ ...estado, dataPagamento: e.target.value })}
                  />
                )}
              </Campo>
              <Campo rotulo="Forma (opcional)">
                {(c) => (
                  <Entrada
                    {...c}
                    value={estado.forma}
                    maxLength={40}
                    onChange={(e) => aoMudar({ ...estado, forma: e.target.value })}
                  />
                )}
              </Campo>
            </div>
          ) : (
            <p className="text-xs text-texto-suave">
              Nada será registrado como {recebimento ? 'recebido' : 'pago'} sem a sua confirmação: a
              parcela fica em aberto até você registrar o{' '}
              {recebimento ? 'recebimento' : 'pagamento'}.
            </p>
          )}
        </>
      )}
      {estado.tipo === 'parcelado' && (
        <GeradorParcelas estado={estado} aoMudar={aoMudar} totalCentavos={totalCentavos} />
      )}
      {estado.tipo === 'nao_informada' && (
        <Alerta tom="alerta" titulo="O lançamento ficará pendente de definição financeira">
          Isso não significa que não haja obrigação de {recebimento ? 'receber' : 'pagar'}: o saldo
          fica &ldquo;a definir&rdquo; e nenhuma parcela é criada. Defina a condição depois, na
          página do lançamento.
        </Alerta>
      )}
    </fieldset>
  );
}
