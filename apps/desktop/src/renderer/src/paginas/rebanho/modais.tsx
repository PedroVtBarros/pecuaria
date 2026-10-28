import { z } from 'zod';
import type { Lote } from '@pecuaria/shared-types';
import {
  esquemaDadosLote,
  esquemaData,
  esquemaEdicaoLote,
  esquemaMotivoObrigatorio,
  textoOpcional,
} from '@pecuaria/shared-types';
import {
  FINALIDADES_LOTE,
  TIPOS_SAIDA,
  type FinalidadeLote,
  type TipoSaida,
} from '@pecuaria/domain';
import { useAcaoRebanho, useAreas, useLotes } from '../../lib/consultas-rebanho';
import { hojeIso } from '../../lib/formatar-rebanho';
import { useFormulario, vazioParaNulo } from '../../hooks/use-formulario';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { AreaTexto, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';

// ---------------------------------------------------------------------------
// Lote
// ---------------------------------------------------------------------------

export function ModalLote({
  propriedadeId,
  lote,
  aoFechar,
  aoCriar,
}: {
  propriedadeId: string;
  lote: Lote | null;
  aoFechar: () => void;
  aoCriar?: (lote: Lote) => void;
}) {
  const { notificar } = useNotificacoes();
  const areas = useAreas(propriedadeId);
  const criar = useAcaoRebanho('lote:criar');
  const atualizar = useAcaoRebanho('lote:atualizar');
  const form = useFormulario({
    inicial: {
      nome: lote?.nome ?? '',
      finalidade: (lote?.finalidade ?? 'recria') as FinalidadeLote,
      dataFormacao: lote?.dataFormacao ?? hojeIso(),
      areaId: '',
      observacoes: lote?.observacoes ?? '',
    },
    esquema: lote ? esquemaEdicaoLote : esquemaDadosLote,
    converter: (v) => ({
      nome: v.nome,
      finalidade: v.finalidade,
      dataFormacao: v.dataFormacao,
      observacoes: vazioParaNulo(v.observacoes),
      ...(lote ? {} : { areaId: vazioParaNulo(v.areaId) }),
    }),
  });
  const { valores, definir, errosCampos } = form;

  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    if (lote) {
      atualizar.mutate(
        { id: lote.id, dados: dados as z.output<typeof esquemaEdicaoLote> },
        {
          onSuccess: () => {
            notificar('Lote atualizado.', 'sucesso');
            aoFechar();
          },
          onError: form.mostrarErroDoServidor,
        },
      );
    } else {
      criar.mutate(
        { propriedadeId, dados: dados as z.output<typeof esquemaDadosLote> },
        {
          onSuccess: (criado) => {
            notificar('Lote cadastrado.', 'sucesso');
            aoCriar?.(criado);
            aoFechar();
          },
          onError: form.mostrarErroDoServidor,
        },
      );
    }
  };

  return (
    <Modal
      aberto
      titulo={lote ? 'Editar lote' : 'Novo lote'}
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={lote ? 'Salvar alterações' : 'Cadastrar'}
      enviando={criar.isPending || atualizar.isPending}
      erros={form.errosGerais}
    >
      <Campo rotulo="Nome" obrigatorio erro={errosCampos['nome']}>
        {(p) => (
          <Entrada
            {...p}
            value={valores.nome}
            onChange={(e) => definir('nome', e.target.value)}
            autoFocus
          />
        )}
      </Campo>
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Finalidade" obrigatorio erro={errosCampos['finalidade']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.finalidade}
              onChange={(e) => definir('finalidade', e.target.value as FinalidadeLote)}
            >
              {opcoesDe(rotulos.finalidade, FINALIDADES_LOTE)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Data de formação" obrigatorio erro={errosCampos['dataFormacao']}>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              max={hojeIso()}
              value={valores.dataFormacao}
              onChange={(e) => definir('dataFormacao', e.target.value)}
            />
          )}
        </Campo>
      </div>
      {!lote && (
        <Campo
          rotulo="Área inicial"
          ajuda="Opcional. Depois use “Mover de área” para registrar mudanças."
        >
          {(p) => (
            <Selecao
              {...p}
              value={valores.areaId}
              onChange={(e) => definir('areaId', e.target.value)}
            >
              <option value="">Sem área definida</option>
              {(areas.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      )}
      <Campo rotulo="Observações" erro={errosCampos['observacoes']}>
        {(p) => (
          <AreaTexto
            {...p}
            value={valores.observacoes}
            onChange={(e) => definir('observacoes', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

const esquemaMoverArea = z.object({
  areaId: z.string().nullable(),
  data: esquemaData,
  observacao: textoOpcional(500, 'Observação'),
});

export function ModalMoverArea({ lote, aoFechar }: { lote: Lote; aoFechar: () => void }) {
  const { notificar } = useNotificacoes();
  const areas = useAreas(lote.propriedadeId);
  const mover = useAcaoRebanho('lote:moverArea');
  const form = useFormulario({
    inicial: { areaId: '', data: hojeIso(), observacao: '' },
    esquema: esquemaMoverArea,
    converter: (v) => ({
      areaId: vazioParaNulo(v.areaId),
      data: v.data,
      observacao: vazioParaNulo(v.observacao),
    }),
  });
  const { valores, definir, errosCampos } = form;
  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    mover.mutate(
      { id: lote.id, ...dados },
      {
        onSuccess: () => {
          notificar('Local do lote atualizado.', 'sucesso');
          aoFechar();
        },
        onError: form.mostrarErroDoServidor,
      },
    );
  };
  return (
    <Modal
      aberto
      titulo={`Mover "${lote.nome}" de área`}
      descricao={`Local atual: ${lote.area?.nome ?? 'sem área definida'}.`}
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar="Mover lote"
      enviando={mover.isPending}
      erros={form.errosGerais}
    >
      <Campo rotulo="Novo local" obrigatorio>
        {(p) => (
          <Selecao
            {...p}
            value={valores.areaId}
            onChange={(e) => definir('areaId', e.target.value)}
          >
            <option value="">Sem área definida</option>
            {(areas.data ?? [])
              .filter((a) => a.id !== lote.area?.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Data da mudança" obrigatorio erro={errosCampos['data']}>
        {(p) => (
          <Entrada
            {...p}
            type="date"
            max={hojeIso()}
            value={valores.data}
            onChange={(e) => definir('data', e.target.value)}
          />
        )}
      </Campo>
      <Campo rotulo="Observação" erro={errosCampos['observacao']}>
        {(p) => (
          <Entrada
            {...p}
            value={valores.observacao}
            onChange={(e) => definir('observacao', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

export function ModalEncerrarLote({ lote, aoFechar }: { lote: Lote; aoFechar: () => void }) {
  const { notificar } = useNotificacoes();
  const encerrar = useAcaoRebanho('lote:encerrar');
  const form = useFormulario({
    inicial: { data: hojeIso() },
    esquema: z.object({ data: esquemaData }),
    converter: (v) => v,
  });
  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    encerrar.mutate(
      { id: lote.id, data: dados.data },
      {
        onSuccess: () => {
          notificar('Lote encerrado.', 'sucesso');
          aoFechar();
        },
        onError: form.mostrarErroDoServidor,
      },
    );
  };
  return (
    <Modal
      aberto
      titulo={`Encerrar "${lote.nome}"?`}
      descricao="O lote deixa de aparecer nas listas de uso diário. O histórico é mantido e o lote pode ser reaberto."
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar="Encerrar lote"
      enviando={encerrar.isPending}
      erros={form.errosGerais}
    >
      <Campo rotulo="Data de encerramento" obrigatorio erro={form.errosCampos['data']}>
        {(p) => (
          <Entrada
            {...p}
            type="date"
            max={hojeIso()}
            value={form.valores.data}
            onChange={(e) => form.definir('data', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Animal
// ---------------------------------------------------------------------------

const esquemaTransferencia = z.object({
  loteDestinoId: z.string().nullable(),
  data: esquemaData,
  motivo: textoOpcional(500, 'Motivo'),
});

export function ModalTransferencia({
  propriedadeId,
  animais,
  loteAtualId,
  aoFechar,
  aoConcluir,
}: {
  propriedadeId: string;
  animais: { id: string; identificacao: string }[];
  /** Lote de origem comum (para não oferecer o próprio lote como destino). */
  loteAtualId?: string | null;
  aoFechar: () => void;
  aoConcluir?: () => void;
}) {
  const { notificar } = useNotificacoes();
  const lotes = useLotes(propriedadeId);
  const transferir = useAcaoRebanho('animal:transferir');
  const form = useFormulario({
    inicial: { loteDestinoId: '', data: hojeIso(), motivo: '' },
    esquema: esquemaTransferencia,
    converter: (v) => ({
      loteDestinoId: vazioParaNulo(v.loteDestinoId),
      data: v.data,
      motivo: vazioParaNulo(v.motivo),
    }),
  });
  const { valores, definir, errosCampos } = form;
  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    transferir.mutate(
      { animalIds: animais.map((a) => a.id), ...dados },
      {
        onSuccess: (r) => {
          notificar(
            r.transferidos === 1
              ? 'Animal transferido.'
              : `${r.transferidos} animais transferidos.`,
            'sucesso',
          );
          aoConcluir?.();
          aoFechar();
        },
        onError: form.mostrarErroDoServidor,
      },
    );
  };
  const descricao =
    animais.length === 1
      ? `Animal ${animais[0]!.identificacao}.`
      : `${animais.length} animais selecionados: ${animais
          .slice(0, 6)
          .map((a) => a.identificacao)
          .join(', ')}${animais.length > 6 ? '…' : ''}.`;
  return (
    <Modal
      aberto
      titulo="Transferir para outro lote"
      descricao={descricao}
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar="Transferir"
      enviando={transferir.isPending}
      erros={form.errosGerais}
    >
      <Campo rotulo="Lote de destino" obrigatorio>
        {(p) => (
          <Selecao
            {...p}
            value={valores.loteDestinoId}
            onChange={(e) => definir('loteDestinoId', e.target.value)}
          >
            <option value="">Sem lote</option>
            {(lotes.data ?? [])
              .filter((l) => l.id !== loteAtualId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} ({l.animaisAtivos})
                </option>
              ))}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Data da transferência" obrigatorio erro={errosCampos['data']}>
        {(p) => (
          <Entrada
            {...p}
            type="date"
            max={hojeIso()}
            value={valores.data}
            onChange={(e) => definir('data', e.target.value)}
          />
        )}
      </Campo>
      <Campo rotulo="Motivo" erro={errosCampos['motivo']}>
        {(p) => (
          <Entrada
            {...p}
            placeholder="Ex.: desmama, apartação"
            value={valores.motivo}
            onChange={(e) => definir('motivo', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

const esquemaSaida = z.object({
  tipo: z.enum(TIPOS_SAIDA),
  data: esquemaData,
  motivo: textoOpcional(500, 'Motivo'),
});

export function ModalSaida({
  animal,
  aoFechar,
}: {
  animal: { id: string; identificacao: string };
  aoFechar: () => void;
}) {
  const { notificar } = useNotificacoes();
  const registrar = useAcaoRebanho('animal:registrarSaida');
  const form = useFormulario({
    inicial: { tipo: 'vendido' as TipoSaida, data: hojeIso(), motivo: '' },
    esquema: esquemaSaida,
    converter: (v) => ({ tipo: v.tipo, data: v.data, motivo: vazioParaNulo(v.motivo) }),
  });
  const { valores, definir, errosCampos } = form;
  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    registrar.mutate(
      { id: animal.id, ...dados },
      {
        onSuccess: () => {
          notificar('Saída registrada.', 'sucesso');
          aoFechar();
        },
        onError: form.mostrarErroDoServidor,
      },
    );
  };
  return (
    <Modal
      aberto
      titulo={`Registrar saída de ${animal.identificacao}`}
      descricao="O animal sai do lote e do rebanho ativo. O histórico e as pesagens são mantidos."
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar="Registrar saída"
      perigoso
      enviando={registrar.isPending}
      erros={form.errosGerais}
    >
      <div className="grid grid-cols-2 gap-4">
        <Campo rotulo="Tipo de saída" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={valores.tipo}
              onChange={(e) => definir('tipo', e.target.value as TipoSaida)}
            >
              {opcoesDe({ vendido: 'Venda', morto: 'Morte', descartado: 'Descarte' }, TIPOS_SAIDA)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Data" obrigatorio erro={errosCampos['data']}>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              max={hojeIso()}
              value={valores.data}
              onChange={(e) => definir('data', e.target.value)}
            />
          )}
        </Campo>
      </div>
      <Campo rotulo="Motivo ou destino" erro={errosCampos['motivo']}>
        {(p) => (
          <Entrada
            {...p}
            value={valores.motivo}
            onChange={(e) => definir('motivo', e.target.value)}
          />
        )}
      </Campo>
      <Alerta tom="info">Valores de venda serão registrados no módulo financeiro (Fase 4).</Alerta>
    </Modal>
  );
}

/** Exclusão lógica com motivo obrigatório (animal ou pesagem). */
export function ModalExclusao({
  titulo,
  descricao,
  enviando,
  aoFechar,
  aoConfirmar,
  erros,
}: {
  titulo: string;
  descricao: string;
  enviando: boolean;
  aoFechar: () => void;
  aoConfirmar: (motivo: string, mostrarErro: (erro: unknown) => void) => void;
  erros?: string[];
}) {
  const form = useFormulario({
    inicial: { motivo: '' },
    esquema: z.object({ motivo: esquemaMotivoObrigatorio }),
    converter: (v) => v,
  });
  return (
    <Modal
      aberto
      titulo={titulo}
      descricao={descricao}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const dados = form.validar();
        if (dados) aoConfirmar(dados.motivo, form.mostrarErroDoServidor);
      }}
      textoEnviar="Excluir"
      perigoso
      enviando={enviando}
      erros={[...form.errosGerais, ...(erros ?? [])]}
    >
      <Campo rotulo="Motivo da exclusão" obrigatorio erro={form.errosCampos['motivo']}>
        {(p) => (
          <Entrada
            {...p}
            autoFocus
            placeholder="Ex.: cadastro em duplicidade"
            value={form.valores.motivo}
            onChange={(e) => form.definir('motivo', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}
