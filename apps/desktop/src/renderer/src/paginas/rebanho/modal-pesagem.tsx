import { useMemo } from 'react';
import { z } from 'zod';
import type { Pesagem } from '@pecuaria/shared-types';
import {
  esquemaDadosPesagem,
  esquemaJustificativa,
  esquemaJustificativaObrigatoria,
  esquemaMotivoObrigatorio,
} from '@pecuaria/shared-types';
import {
  detectarAlertasPesagem,
  ESCALAS_ECC,
  ehDataIso,
  interpretarNumero,
  METODOS_PESAGEM,
  pesagensDoAlerta,
  type EscalaEcc,
  type MetodoPesagem,
  type ParametrosAlertasPesagem,
} from '@pecuaria/domain';
import { useAcaoRebanho } from '../../lib/consultas-rebanho';
import { descreverAlerta, formatarData, formatarPeso, hojeIso } from '../../lib/formatar-rebanho';
import { textoParaNumero, useFormulario, vazioParaNulo } from '../../hooks/use-formulario';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';

const ID_PREVIA = 'previa';

/**
 * Registro ou correção de pesagem. Mostra antes de gravar os alertas que o
 * valor geraria (se as pesagens do animal forem informadas) e permite
 * registrar a justificativa da conferência. Alerta nunca impede a gravação.
 */
export function ModalPesagem({
  animalId,
  pesagem,
  dataMinima,
  pesagensDoAnimal,
  parametros,
  aoFechar,
}: {
  animalId: string;
  pesagem: Pesagem | null;
  dataMinima?: string | undefined;
  pesagensDoAnimal?: readonly Pesagem[] | undefined;
  parametros?: ParametrosAlertasPesagem | undefined;
  aoFechar: () => void;
}) {
  const { notificar } = useNotificacoes();
  const registrar = useAcaoRebanho('pesagem:registrar');
  const atualizar = useAcaoRebanho('pesagem:atualizar');
  const corrigindo = pesagem !== null;
  const form = useFormulario({
    inicial: {
      data: pesagem?.data ?? hojeIso(),
      pesoVivoKg: pesagem ? pesagem.pesoVivoKg.toLocaleString('pt-BR') : '',
      metodo: (pesagem?.metodo ?? 'balanca') as MetodoPesagem,
      escoreCorporal: pesagem?.escoreCorporal?.toLocaleString('pt-BR') ?? '',
      escalaEcc: (pesagem?.escalaEcc ?? '') as EscalaEcc | '',
      observacao: pesagem?.observacao ?? '',
      motivo: '',
      justificativa: '',
    },
    esquema: corrigindo
      ? z.object({
          dados: esquemaDadosPesagem,
          motivo: esquemaMotivoObrigatorio,
          justificativa: esquemaJustificativa,
        })
      : z.object({ dados: esquemaDadosPesagem, justificativa: esquemaJustificativa }),
    converter: (v) => ({
      dados: {
        data: v.data,
        pesoVivoKg: textoParaNumero(v.pesoVivoKg),
        metodo: v.metodo,
        observacao: vazioParaNulo(v.observacao),
        escoreCorporal: textoParaNumero(v.escoreCorporal),
        escalaEcc: v.escalaEcc === '' ? null : v.escalaEcc,
      },
      ...(corrigindo ? { motivo: v.motivo } : {}),
      justificativa: vazioParaNulo(v.justificativa),
    }),
  });
  const { valores, definir, errosCampos } = form;

  // Prévia dos alertas com o valor digitado, sem gravar.
  const alertas = useMemo(() => {
    const peso = interpretarNumero(valores.pesoVivoKg);
    if (!pesagensDoAnimal || !parametros || peso === null || peso <= 0) return [];
    if (!ehDataIso(valores.data)) return [];
    const outras = pesagensDoAnimal.filter((p) => p.id !== pesagem?.id && p.data !== valores.data);
    const lista = [
      ...outras,
      { id: ID_PREVIA, data: valores.data, pesoVivoKg: peso, metodo: valores.metodo },
    ];
    return detectarAlertasPesagem(lista, parametros).filter((a) =>
      pesagensDoAlerta(a).includes(ID_PREVIA),
    );
  }, [pesagensDoAnimal, parametros, pesagem?.id, valores.pesoVivoKg, valores.data, valores.metodo]);

  const salvar = () => {
    const validado = form.validar();
    if (!validado) return;
    const fim = {
      onSuccess: () => {
        notificar(corrigindo ? 'Pesagem corrigida.' : 'Pesagem registrada.', 'sucesso');
        aoFechar();
      },
      onError: form.mostrarErroDoServidor,
    };
    if (pesagem) {
      // Na correção, o esquema exige motivo (texto não vazio).
      const { motivo } = validado as typeof validado & { motivo: string };
      atualizar.mutate(
        { id: pesagem.id, dados: validado.dados, motivo, justificativa: validado.justificativa },
        fim,
      );
    } else {
      registrar.mutate(
        { animalId, dados: validado.dados, justificativa: validado.justificativa },
        fim,
      );
    }
  };

  return (
    <Modal
      aberto
      titulo={corrigindo ? 'Corrigir pesagem' : 'Registrar pesagem'}
      descricao={
        corrigindo
          ? `Pesagem de ${formatarData(pesagem.data)} (${formatarPeso(pesagem.pesoVivoKg)}). O valor anterior fica guardado no histórico.`
          : 'Peso vivo do animal, em quilos.'
      }
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={corrigindo ? 'Salvar correção' : 'Registrar'}
      enviando={registrar.isPending || atualizar.isPending}
      erros={form.errosGerais}
    >
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Data" obrigatorio erro={errosCampos['data']}>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              min={dataMinima}
              max={hojeIso()}
              value={valores.data}
              onChange={(e) => definir('data', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Peso vivo (kg)" obrigatorio erro={errosCampos['pesoVivoKg']}>
          {(p) => (
            <Entrada
              {...p}
              autoFocus
              inputMode="decimal"
              placeholder="Ex.: 452,5"
              value={valores.pesoVivoKg}
              onChange={(e) => definir('pesoVivoKg', e.target.value)}
            />
          )}
        </Campo>
      </div>
      <Campo
        rotulo="Método"
        obrigatorio
        ajuda="Fita e avaliação visual são estimativas. O GMD calculado com elas é marcado como estimado."
      >
        {(p) => (
          <Selecao
            {...p}
            value={valores.metodo}
            onChange={(e) => definir('metodo', e.target.value as MetodoPesagem)}
          >
            {opcoesDe(rotulos.metodo, METODOS_PESAGEM)}
          </Selecao>
        )}
      </Campo>
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Escore corporal" erro={errosCampos['escoreCorporal']} ajuda="Opcional.">
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={valores.escoreCorporal}
              onChange={(e) => definir('escoreCorporal', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Escala do escore" erro={errosCampos['escalaEcc']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.escalaEcc}
              onChange={(e) => definir('escalaEcc', e.target.value as EscalaEcc | '')}
            >
              <option value="">Sem escore</option>
              {opcoesDe(rotulos.escalaEcc, ESCALAS_ECC)}
            </Selecao>
          )}
        </Campo>
      </div>
      <Campo rotulo="Observação" erro={errosCampos['observacao']}>
        {(p) => (
          <Entrada
            {...p}
            value={valores.observacao}
            onChange={(e) => definir('observacao', e.target.value)}
          />
        )}
      </Campo>
      {corrigindo && (
        <Campo rotulo="Motivo da correção" obrigatorio erro={errosCampos['motivo']}>
          {(p) => (
            <Entrada
              {...p}
              placeholder="Ex.: erro de digitação"
              value={valores.motivo}
              onChange={(e) => definir('motivo', e.target.value)}
            />
          )}
        </Campo>
      )}
      {alertas.length > 0 && (
        <Alerta
          tom="alerta"
          titulo={
            alertas.some((a) => a.categoria === 'conferencia')
              ? 'Confira este valor antes de salvar'
              : 'Desempenho fora da faixa configurada'
          }
        >
          <ul className="list-disc pl-4" data-testid="alertas-previa">
            {alertas.map((a) => (
              <li key={`${a.tipo}-${a.intervalo.pesagemFinalId}`}>
                <strong className="font-medium text-texto">
                  {rotulos.categoriaAlerta[a.categoria]} · {rotulos.alertaPesagem[a.tipo]}:
                </strong>{' '}
                {descreverAlerta(a, parametros!)}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            A pesagem pode ser salva assim mesmo. Se o valor estiver certo, registre por quê.
          </p>
        </Alerta>
      )}
      {alertas.length > 0 && (
        <Campo rotulo="Justificativa (valor conferido)" erro={errosCampos['justificativa']}>
          {(p) => (
            <Entrada
              {...p}
              placeholder="Ex.: animal pesado em jejum; balança conferida"
              value={valores.justificativa}
              onChange={(e) => definir('justificativa', e.target.value)}
            />
          )}
        </Campo>
      )}
    </Modal>
  );
}

/** O usuário confere um alerta e confirma que o valor está certo. */
export function ModalConferirPesagem({
  pesagem,
  descricao,
  aoFechar,
}: {
  pesagem: Pesagem;
  descricao: string;
  aoFechar: () => void;
}) {
  const { notificar } = useNotificacoes();
  const conferir = useAcaoRebanho('pesagem:conferir');
  const form = useFormulario({
    inicial: { justificativa: pesagem.justificativaConferencia ?? '' },
    esquema: z.object({ justificativa: esquemaJustificativaObrigatoria }),
    converter: (v) => v,
  });
  return (
    <Modal
      aberto
      titulo={`Confirmar pesagem de ${formatarData(pesagem.data)}`}
      descricao={descricao}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const dados = form.validar();
        if (!dados) return;
        conferir.mutate(
          { id: pesagem.id, justificativa: dados.justificativa },
          {
            onSuccess: () => {
              notificar('Pesagem conferida.', 'sucesso');
              aoFechar();
            },
            onError: form.mostrarErroDoServidor,
          },
        );
      }}
      textoEnviar="Confirmar valor"
      enviando={conferir.isPending}
      erros={form.errosGerais}
    >
      <p className="text-sm text-texto-suave">
        Use quando o valor de {formatarPeso(pesagem.pesoVivoKg)} estiver certo. Se estiver errado,
        use “Corrigir”. A justificativa fica registrada no histórico do animal.
      </p>
      <Campo rotulo="Justificativa" obrigatorio erro={form.errosCampos['justificativa']}>
        {(p) => (
          <Entrada
            {...p}
            autoFocus
            placeholder="Ex.: animal doente no período; pesagem refeita e confirmada"
            value={form.valores.justificativa}
            onChange={(e) => form.definir('justificativa', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}
