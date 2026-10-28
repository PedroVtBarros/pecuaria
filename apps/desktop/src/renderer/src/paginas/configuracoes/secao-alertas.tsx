import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  esquemaParametrosAlertasPesagem,
  esquemaPreferenciasSanidade,
  type ValorJson,
} from '@pecuaria/shared-types';
import {
  ANTECEDENCIA_AGENDA_INICIAL_DIAS,
  PARAMETROS_ALERTAS_PESAGEM_INICIAIS,
  type ParametrosAlertasPesagem,
} from '@pecuaria/domain';
import { useConfiguracao, useDefinirConfiguracao } from '../../lib/consultas';
import { chavesRebanho } from '../../lib/consultas-rebanho';
import { textoParaNumero, useFormulario } from '../../hooks/use-formulario';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada } from '../../components/ui/campos';
import {
  Cartao,
  CartaoCabecalho,
  CartaoConteudo,
  CartaoDescricao,
  CartaoTitulo,
} from '../../components/ui/cartao';

const numeroTexto = (n: number | null) => (n === null ? '' : n.toLocaleString('pt-BR'));

function Formulario({
  parametros,
  antecedencia,
}: {
  parametros: ParametrosAlertasPesagem;
  antecedencia: number;
}) {
  const definir = useDefinirConfiguracao();
  const cliente = useQueryClient();
  const { notificar } = useNotificacoes();
  const form = useFormulario({
    inicial: {
      gmdMaximoKgDia: numeroTexto(parametros.gmdMaximoKgDia),
      gmdMinimoKgDia: numeroTexto(parametros.gmdMinimoKgDia),
      intervaloCurtoDias: numeroTexto(parametros.intervaloCurtoDias),
      antecedenciaDias: String(antecedencia),
    },
    esquema: z.object({
      pesagem: esquemaParametrosAlertasPesagem,
      sanidade: esquemaPreferenciasSanidade,
    }),
    converter: (v) => ({
      pesagem: {
        gmdMaximoKgDia: textoParaNumero(v.gmdMaximoKgDia),
        gmdMinimoKgDia: textoParaNumero(v.gmdMinimoKgDia),
        intervaloCurtoDias: textoParaNumero(v.intervaloCurtoDias),
      },
      sanidade: { antecedenciaDias: textoParaNumero(v.antecedenciaDias) },
    }),
  });

  const salvar = async () => {
    const dados = form.validar();
    if (!dados) return;
    try {
      await definir.mutateAsync({
        chave: 'alertas.pesagem',
        valor: dados.pesagem as unknown as ValorJson,
      });
      await definir.mutateAsync({
        chave: 'alertas.sanidade',
        valor: dados.sanidade as unknown as ValorJson,
      });
      // Alertas e situação da agenda dependem destes valores.
      await cliente.invalidateQueries({ queryKey: chavesRebanho.tudo });
      notificar('Critérios de alerta salvos.', 'sucesso');
    } catch (erro) {
      form.mostrarErroDoServidor(erro);
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <Alerta tom="info" titulo="Parâmetros operacionais, não limites científicos">
        São critérios para o sistema chamar sua atenção para uma pesagem. Os valores iniciais (
        {numeroTexto(PARAMETROS_ALERTAS_PESAGEM_INICIAIS.gmdMaximoKgDia)} e{' '}
        {numeroTexto(PARAMETROS_ALERTAS_PESAGEM_INICIAIS.gmdMinimoKgDia)} kg/dia; intervalo curto
        abaixo de {PARAMETROS_ALERTAS_PESAGEM_INICIAIS.intervaloCurtoDias} dias) foram escolhidos só
        para o recurso funcionar no primeiro uso, sem fonte científica. Ajuste ao seu rebanho, de
        preferência com seu zootecnista. Um GMD fora da faixa não significa erro: o peso pode estar
        certo. Deixe vazio para desligar um critério. Nenhuma pesagem é bloqueada por alerta.
      </Alerta>
      {form.errosGerais.length > 0 && <Alerta tom="perigo" titulo={form.errosGerais[0]} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo
          rotulo="Alerta de desempenho se o GMD passar de (kg/dia)"
          erro={form.errosCampos['gmdMaximoKgDia']}
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={form.valores.gmdMaximoKgDia}
              onChange={(e) => form.definir('gmdMaximoKgDia', e.target.value)}
            />
          )}
        </Campo>
        <Campo
          rotulo="Alerta de desempenho se o GMD ficar abaixo de (kg/dia)"
          erro={form.errosCampos['gmdMinimoKgDia']}
          ajuda="0 = qualquer perda de peso."
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={form.valores.gmdMinimoKgDia}
              onChange={(e) => form.definir('gmdMinimoKgDia', e.target.value)}
            />
          )}
        </Campo>
        <Campo
          rotulo="Marcar como intervalo curto se tiver menos de (dias)"
          erro={form.errosCampos['intervaloCurtoDias']}
          ajuda="Em intervalo curto, pouca diferença de peso vira GMD grande. Só marca, não esconde."
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="numeric"
              value={form.valores.intervaloCurtoDias}
              onChange={(e) => form.definir('intervaloCurtoDias', e.target.value)}
            />
          )}
        </Campo>
        <Campo
          rotulo="Avisar eventos da agenda com quantos dias de antecedência"
          erro={form.errosCampos['antecedenciaDias']}
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="numeric"
              value={form.valores.antecedenciaDias}
              onChange={(e) => form.definir('antecedenciaDias', e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div>
        <Botao type="submit" carregando={definir.isPending}>
          Salvar critérios
        </Botao>
      </div>
    </form>
  );
}

export function SecaoAlertas() {
  const pesagem = useConfiguracao('alertas.pesagem');
  const sanidade = useConfiguracao('alertas.sanidade');
  const carregado = !pesagem.isLoading && !sanidade.isLoading;
  const p = esquemaParametrosAlertasPesagem.safeParse(pesagem.data);
  const s = esquemaPreferenciasSanidade.safeParse(sanidade.data);
  return (
    <Cartao>
      <CartaoCabecalho>
        <CartaoTitulo>Alertas de pesagem e agenda</CartaoTitulo>
        <CartaoDescricao>
          Quando o sistema deve chamar sua atenção para uma pesagem e avisar eventos sanitários.
        </CartaoDescricao>
      </CartaoCabecalho>
      <CartaoConteudo>
        {carregado && (
          <Formulario
            parametros={p.success ? p.data : PARAMETROS_ALERTAS_PESAGEM_INICIAIS}
            antecedencia={s.success ? s.data.antecedenciaDias : ANTECEDENCIA_AGENDA_INICIAL_DIAS}
          />
        )}
      </CartaoConteudo>
    </Cartao>
  );
}
