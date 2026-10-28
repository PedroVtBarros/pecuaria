import { useState } from 'react';
import {
  ConsumoSanitario,
  converterConsumos,
  iniciarConsumos,
  type LinhaConsumo,
} from '../estoque/consumo-sanitario';
import { z } from 'zod';
import type { ItemAgenda, ManejoDetalhe, ProdutoSanitario } from '@pecuaria/shared-types';
import {
  esquemaDadosAgenda,
  esquemaDadosManejo,
  esquemaDadosProdutoSanitario,
  esquemaMotivo,
  esquemaMotivoObrigatorio,
} from '@pecuaria/shared-types';
import {
  TIPOS_MANEJO_SANITARIO,
  TIPOS_PRODUTO_SANITARIO,
  UNIDADES_DOSE,
  VIAS_APLICACAO,
  type TipoManejoSanitario,
  type TipoProdutoSanitario,
  type UnidadeDose,
  type ViaAplicacao,
} from '@pecuaria/domain';
import { useAcaoRebanho, useLotes, useProdutosSanitarios } from '../../lib/consultas-rebanho';
import { hojeIso, reaisParaCentavos } from '../../lib/formatar-rebanho';
import {
  textoParaNumero,
  useFormulario,
  vazioParaNulo,
  type ErrosCampos,
} from '../../hooks/use-formulario';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { AreaTexto, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { SeletorAnimal } from '../rebanho/seletor-animal';

/** Aviso fixo: o sistema registra, não prescreve. */
export const AVISO_SEM_PRESCRICAO =
  'O sistema registra o que foi feito. Produto, dose, via e carência vêm da bula e da orientação do veterinário; nada é sugerido automaticamente.';

// ---------------------------------------------------------------------------
// Dados do registro sanitário (usados no registro e na correção)
// ---------------------------------------------------------------------------

export type ValoresManejo = {
  tipo: TipoManejoSanitario;
  data: string;
  produtoId: string;
  descricao: string;
  dose: string;
  unidadeDose: UnidadeDose | '';
  via: ViaAplicacao | '';
  carenciaCarneDias: string;
  carenciaLeiteDias: string;
  responsavel: string;
  diagnostico: string;
  custo: string;
  observacoes: string;
};

const numeroTexto = (n: number | null) => (n === null ? '' : n.toLocaleString('pt-BR'));

export function valoresIniciaisManejo(m?: ManejoDetalhe | null): ValoresManejo {
  return {
    tipo: m?.tipo ?? 'vacinacao',
    data: m?.data ?? hojeIso(),
    produtoId: m?.produto?.id ?? '',
    descricao: m?.descricao ?? '',
    dose: numeroTexto(m?.dose ?? null),
    unidadeDose: m?.unidadeDose ?? '',
    via: m?.via ?? '',
    carenciaCarneDias: m?.carenciaCarneDias?.toString() ?? '',
    carenciaLeiteDias: m?.carenciaLeiteDias?.toString() ?? '',
    responsavel: m?.responsavel ?? '',
    diagnostico: m?.diagnostico ?? '',
    custo:
      m?.custoTotalCentavos != null
        ? (m.custoTotalCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : '',
    observacoes: m?.observacoes ?? '',
  };
}

export function converterManejo(v: ValoresManejo) {
  return {
    tipo: v.tipo,
    data: v.data,
    produtoId: vazioParaNulo(v.produtoId),
    descricao: vazioParaNulo(v.descricao),
    dose: textoParaNumero(v.dose),
    unidadeDose: v.unidadeDose === '' ? null : v.unidadeDose,
    via: v.via === '' ? null : v.via,
    carenciaCarneDias: textoParaNumero(v.carenciaCarneDias),
    carenciaLeiteDias: textoParaNumero(v.carenciaLeiteDias),
    responsavel: vazioParaNulo(v.responsavel),
    diagnostico: vazioParaNulo(v.diagnostico),
    custoTotalCentavos: reaisParaCentavos(v.custo),
    observacoes: vazioParaNulo(v.observacoes),
  };
}

/** Campos comuns do registro sanitário. Escolher o produto preenche o que está vazio. */
export function CamposManejo({
  valores,
  definir,
  errosCampos,
}: {
  valores: ValoresManejo;
  /** Os campos de ValoresManejo são todos texto (ou códigos em texto). */
  definir: (campo: keyof ValoresManejo, valor: string) => void;
  errosCampos: ErrosCampos;
}) {
  const produtos = useProdutosSanitarios();
  const [novoProduto, setNovoProduto] = useState(false);

  const escolherProduto = (produto: ProdutoSanitario | undefined) => {
    definir('produtoId', produto?.id ?? '');
    if (!produto) return;
    if (valores.unidadeDose === '' && produto.unidadeDose)
      definir('unidadeDose', produto.unidadeDose);
    if (valores.carenciaCarneDias === '' && produto.carenciaCarneDias !== null)
      definir('carenciaCarneDias', String(produto.carenciaCarneDias));
    if (valores.carenciaLeiteDias === '' && produto.carenciaLeiteDias !== null)
      definir('carenciaLeiteDias', String(produto.carenciaLeiteDias));
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo" obrigatorio erro={errosCampos['tipo']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.tipo}
              onChange={(e) => definir('tipo', e.target.value as TipoManejoSanitario)}
            >
              {opcoesDe(rotulos.tipoManejo, TIPOS_MANEJO_SANITARIO)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Data da aplicação" obrigatorio erro={errosCampos['data']}>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Produto"
          erro={errosCampos['produtoId']}
          ajuda={
            <button
              type="button"
              className="cursor-pointer text-marca underline"
              onClick={() => setNovoProduto(true)}
            >
              Cadastrar produto
            </button>
          }
        >
          {(p) => (
            <Selecao
              {...p}
              value={valores.produtoId}
              onChange={(e) =>
                escolherProduto((produtos.data ?? []).find((x) => x.id === e.target.value))
              }
            >
              <option value="">Sem produto cadastrado</option>
              {(produtos.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo
          rotulo="Descrição"
          erro={errosCampos['descricao']}
          ajuda="Obrigatória quando não há produto (ex.: exame de brucelose)."
        >
          {(p) => (
            <Entrada
              {...p}
              value={valores.descricao}
              onChange={(e) => definir('descricao', e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Dose por animal" erro={errosCampos['dose']} ajuda="Opcional.">
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={valores.dose}
              onChange={(e) => definir('dose', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Unidade" erro={errosCampos['unidadeDose']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.unidadeDose}
              onChange={(e) => definir('unidadeDose', e.target.value as UnidadeDose | '')}
            >
              <option value="">—</option>
              {opcoesDe(rotulos.unidadeDose, UNIDADES_DOSE)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Via" erro={errosCampos['via']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.via}
              onChange={(e) => definir('via', e.target.value as ViaAplicacao | '')}
            >
              <option value="">—</option>
              {opcoesDe(rotulos.via, VIAS_APLICACAO)}
            </Selecao>
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Carência para carne (dias)"
          erro={errosCampos['carenciaCarneDias']}
          ajuda="Conforme a bula e o veterinário. Vazio = não informada."
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="numeric"
              value={valores.carenciaCarneDias}
              onChange={(e) => definir('carenciaCarneDias', e.target.value)}
            />
          )}
        </Campo>
        <Campo
          rotulo="Carência para leite (dias)"
          erro={errosCampos['carenciaLeiteDias']}
          ajuda="Conforme a bula e o veterinário. Vazio = não informada."
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="numeric"
              value={valores.carenciaLeiteDias}
              onChange={(e) => definir('carenciaLeiteDias', e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Responsável" erro={errosCampos['responsavel']}>
          {(p) => (
            <Entrada
              {...p}
              placeholder="Quem aplicou ou o veterinário"
              value={valores.responsavel}
              onChange={(e) => definir('responsavel', e.target.value)}
            />
          )}
        </Campo>
        <Campo
          rotulo="Custo total (R$)"
          erro={errosCampos['custoTotalCentavos']}
          ajuda="Opcional. Será ligado ao financeiro na Fase 4."
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              placeholder="Ex.: 150,00"
              value={valores.custo}
              onChange={(e) => definir('custo', e.target.value)}
            />
          )}
        </Campo>
      </div>
      {(valores.tipo === 'tratamento' || valores.tipo === 'exame' || valores.diagnostico) && (
        <Campo rotulo="Diagnóstico ou motivo" erro={errosCampos['diagnostico']}>
          {(p) => (
            <Entrada
              {...p}
              value={valores.diagnostico}
              onChange={(e) => definir('diagnostico', e.target.value)}
            />
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
      {novoProduto && (
        <ModalProduto
          produto={null}
          aoFechar={() => setNovoProduto(false)}
          aoCriar={(produto) => escolherProduto(produto)}
        />
      )}
    </>
  );
}

/** Correção dos dados comuns de um registro sanitário, com motivo obrigatório. */
export function ModalCorrigirManejo({
  manejo,
  aoFechar,
}: {
  manejo: ManejoDetalhe;
  aoFechar: () => void;
}) {
  const { notificar } = useNotificacoes();
  const atualizar = useAcaoRebanho('manejoSanitario:atualizar');
  const [politica, setPolitica] = useState(
    (manejo.consumosEstoque?.length ?? 0) > 0 ? '' : 'manter',
  );
  const [consumos, setConsumos] = useState<LinhaConsumo[]>(() =>
    iniciarConsumos(manejo.consumosEstoque),
  );
  const [erroConsumo, setErroConsumo] = useState<string | null>(null);
  const form = useFormulario({
    inicial: { ...valoresIniciaisManejo(manejo), motivo: '' },
    esquema: z.object({ dados: esquemaDadosManejo, motivo: esquemaMotivoObrigatorio }),
    converter: (v) => ({ dados: converterManejo(v), motivo: v.motivo }),
  });
  return (
    <Modal
      aberto
      largura="lg"
      titulo="Corrigir registro sanitário"
      descricao="A correção vale para todos os animais do registro. Os valores anteriores ficam no histórico."
      aoFechar={aoFechar}
      aoEnviar={() => {
        const v = form.validar();
        if (!v) return;
        if (!politica) {
          setErroConsumo('Escolha como tratar o consumo de estoque.');
          return;
        }
        let consumosEstoque;
        try {
          if (politica === 'reconciliar') consumosEstoque = converterConsumos(consumos);
        } catch (e) {
          setErroConsumo(e instanceof Error ? e.message : 'Consumo inválido.');
          return;
        }
        setErroConsumo(null);
        atualizar.mutate(
          {
            id: manejo.id,
            dados: v.dados,
            motivo: v.motivo,
            consumosEstoque,
            confirmarConsumoMantido: politica === 'manter',
          },
          {
            onSuccess: () => {
              notificar('Registro corrigido.', 'sucesso');
              aoFechar();
            },
            onError: form.mostrarErroDoServidor,
          },
        );
      }}
      textoEnviar="Salvar correção"
      enviando={atualizar.isPending}
      erros={[...form.errosGerais, ...(erroConsumo ? [erroConsumo] : [])]}
    >
      <Campo rotulo="Tratamento do estoque">
        {(p) => (
          <Selecao {...p} value={politica} onChange={(e) => setPolitica(e.target.value)}>
            <option value="">Escolha e confira</option>
            <option value="manter">Manter consumo conferido (mesmo produto e data)</option>
            <option value="reconciliar">Corrigir ou estornar as baixas explicitamente</option>
          </Selecao>
        )}
      </Campo>
      {politica === 'reconciliar' && (
        <ConsumoSanitario
          propriedadeId={manejo.propriedadeId}
          produtoId={form.valores.produtoId}
          linhas={consumos}
          aoMudar={setConsumos}
        />
      )}
      <CamposManejo
        valores={form.valores}
        definir={(campo, valor) => form.definir(campo, valor as never)}
        errosCampos={form.errosCampos}
      />
      <Campo rotulo="Motivo da correção" obrigatorio erro={form.errosCampos['motivo']}>
        {(p) => (
          <Entrada
            {...p}
            value={form.valores.motivo}
            onChange={(e) => form.definir('motivo', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Produto
// ---------------------------------------------------------------------------

export function ModalProduto({
  produto,
  aoFechar,
  aoCriar,
}: {
  produto: ProdutoSanitario | null;
  aoFechar: () => void;
  aoCriar?: (produto: ProdutoSanitario) => void;
}) {
  const { notificar } = useNotificacoes();
  const criar = useAcaoRebanho('produtoSanitario:criar');
  const atualizar = useAcaoRebanho('produtoSanitario:atualizar');
  const form = useFormulario({
    inicial: {
      nome: produto?.nome ?? '',
      tipo: (produto?.tipo ?? 'vacina') as TipoProdutoSanitario,
      fabricante: produto?.fabricante ?? '',
      principioAtivo: produto?.principioAtivo ?? '',
      unidadeDose: (produto?.unidadeDose ?? '') as UnidadeDose | '',
      carenciaCarneDias: produto?.carenciaCarneDias?.toString() ?? '',
      carenciaLeiteDias: produto?.carenciaLeiteDias?.toString() ?? '',
      observacoes: produto?.observacoes ?? '',
    },
    esquema: esquemaDadosProdutoSanitario,
    converter: (v) => ({
      nome: v.nome,
      tipo: v.tipo,
      fabricante: vazioParaNulo(v.fabricante),
      principioAtivo: vazioParaNulo(v.principioAtivo),
      unidadeDose: v.unidadeDose === '' ? null : v.unidadeDose,
      carenciaCarneDias: textoParaNumero(v.carenciaCarneDias),
      carenciaLeiteDias: textoParaNumero(v.carenciaLeiteDias),
      observacoes: vazioParaNulo(v.observacoes),
    }),
  });
  const { valores, definir, errosCampos } = form;
  const salvar = () => {
    const dados = form.validar();
    if (!dados) return;
    const fim = {
      onSuccess: (salvo: ProdutoSanitario) => {
        notificar(produto ? 'Produto atualizado.' : 'Produto cadastrado.', 'sucesso');
        if (!produto) aoCriar?.(salvo);
        aoFechar();
      },
      onError: form.mostrarErroDoServidor,
    };
    if (produto) atualizar.mutate({ id: produto.id, dados }, fim);
    else criar.mutate({ dados }, fim);
  };
  return (
    <Modal
      aberto
      largura="lg"
      titulo={produto ? 'Editar produto' : 'Novo produto sanitário'}
      descricao="Copie os dados da bula. As carências servem de sugestão ao registrar uma aplicação e podem ser alteradas em cada registro."
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={produto ? 'Salvar alterações' : 'Cadastrar'}
      enviando={criar.isPending || atualizar.isPending}
      erros={form.errosGerais}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome comercial" obrigatorio erro={errosCampos['nome']}>
          {(p) => (
            <Entrada
              {...p}
              autoFocus
              value={valores.nome}
              onChange={(e) => definir('nome', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Tipo" obrigatorio erro={errosCampos['tipo']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.tipo}
              onChange={(e) => definir('tipo', e.target.value as TipoProdutoSanitario)}
            >
              {opcoesDe(rotulos.tipoProduto, TIPOS_PRODUTO_SANITARIO)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Fabricante" erro={errosCampos['fabricante']}>
          {(p) => (
            <Entrada
              {...p}
              value={valores.fabricante}
              onChange={(e) => definir('fabricante', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Princípio ativo" erro={errosCampos['principioAtivo']}>
          {(p) => (
            <Entrada
              {...p}
              value={valores.principioAtivo}
              onChange={(e) => definir('principioAtivo', e.target.value)}
            />
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Unidade da dose" erro={errosCampos['unidadeDose']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.unidadeDose}
              onChange={(e) => definir('unidadeDose', e.target.value as UnidadeDose | '')}
            >
              <option value="">—</option>
              {opcoesDe(rotulos.unidadeDose, UNIDADES_DOSE)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Carência carne (dias)" erro={errosCampos['carenciaCarneDias']}>
          {(p) => (
            <Entrada
              {...p}
              inputMode="numeric"
              value={valores.carenciaCarneDias}
              onChange={(e) => definir('carenciaCarneDias', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Carência leite (dias)" erro={errosCampos['carenciaLeiteDias']}>
          {(p) => (
            <Entrada
              {...p}
              inputMode="numeric"
              value={valores.carenciaLeiteDias}
              onChange={(e) => definir('carenciaLeiteDias', e.target.value)}
            />
          )}
        </Campo>
      </div>
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

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export function ModalAgenda({
  propriedadeId,
  item,
  aoFechar,
}: {
  propriedadeId: string;
  item: ItemAgenda | null;
  aoFechar: () => void;
}) {
  const { notificar } = useNotificacoes();
  const lotes = useLotes(propriedadeId);
  const produtos = useProdutosSanitarios();
  const criar = useAcaoRebanho('agendaSanitaria:criar');
  const atualizar = useAcaoRebanho('agendaSanitaria:atualizar');
  const [rotuloAnimal, setRotuloAnimal] = useState<string | null>(
    item?.animal?.identificacao ?? null,
  );
  const form = useFormulario({
    inicial: {
      dataPrevista: item?.dataPrevista ?? '',
      tipo: (item?.tipo ?? 'vacinacao') as TipoManejoSanitario,
      produtoId: item?.produto?.id ?? '',
      descricao: item?.descricao ?? '',
      alvo: (item?.animal ? 'animal' : item?.lote ? 'lote' : 'propriedade') as
        'propriedade' | 'lote' | 'animal',
      loteId: item?.lote?.id ?? '',
      animalId: item?.animal?.id ?? '',
      observacoes: item?.observacoes ?? '',
      motivo: '',
    },
    esquema: z.object({ dados: esquemaDadosAgenda, motivo: esquemaMotivo }),
    converter: (v) => ({
      dados: {
        dataPrevista: v.dataPrevista,
        tipo: v.tipo,
        produtoId: vazioParaNulo(v.produtoId),
        descricao: vazioParaNulo(v.descricao),
        loteId: v.alvo === 'lote' ? vazioParaNulo(v.loteId) : null,
        animalId: v.alvo === 'animal' ? vazioParaNulo(v.animalId) : null,
        observacoes: vazioParaNulo(v.observacoes),
      },
      motivo: vazioParaNulo(v.motivo),
    }),
  });
  const { valores, definir, errosCampos } = form;
  const [erroAlvo, setErroAlvo] = useState<string | null>(null);
  const salvar = () => {
    const faltaAlvo =
      (valores.alvo === 'lote' && !valores.loteId) ||
      (valores.alvo === 'animal' && !valores.animalId);
    setErroAlvo(
      faltaAlvo ? (valores.alvo === 'lote' ? 'Escolha o lote.' : 'Escolha o animal.') : null,
    );
    const v = form.validar();
    if (!v || faltaAlvo) return;
    const fim = {
      onSuccess: () => {
        notificar(item ? 'Agendamento atualizado.' : 'Agendamento criado.', 'sucesso');
        aoFechar();
      },
      onError: form.mostrarErroDoServidor,
    };
    if (item) atualizar.mutate({ id: item.id, dados: v.dados, motivo: v.motivo }, fim);
    else criar.mutate({ propriedadeId, dados: v.dados }, fim);
  };
  return (
    <Modal
      aberto
      largura="lg"
      titulo={item ? 'Editar agendamento' : 'Novo agendamento sanitário'}
      descricao="Defina você a data e o que será feito. O sistema não traz calendário pronto."
      aoFechar={aoFechar}
      aoEnviar={salvar}
      textoEnviar={item ? 'Salvar alterações' : 'Agendar'}
      enviando={criar.isPending || atualizar.isPending}
      erros={[...form.errosGerais, ...(erroAlvo ? [erroAlvo] : [])]}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Data prevista" obrigatorio erro={errosCampos['dataPrevista']}>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={valores.dataPrevista}
              onChange={(e) => definir('dataPrevista', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Tipo" obrigatorio erro={errosCampos['tipo']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.tipo}
              onChange={(e) => definir('tipo', e.target.value as TipoManejoSanitario)}
            >
              {opcoesDe(rotulos.tipoManejo, TIPOS_MANEJO_SANITARIO)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Produto" erro={errosCampos['produtoId']}>
          {(p) => (
            <Selecao
              {...p}
              value={valores.produtoId}
              onChange={(e) => definir('produtoId', e.target.value)}
            >
              <option value="">Sem produto cadastrado</option>
              {(produtos.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Descrição" erro={errosCampos['descricao']}>
          {(p) => (
            <Entrada
              {...p}
              placeholder="Ex.: reforço da vacina"
              value={valores.descricao}
              onChange={(e) => definir('descricao', e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Para quem" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={valores.alvo}
              onChange={(e) => definir('alvo', e.target.value as 'propriedade' | 'lote' | 'animal')}
            >
              <option value="propriedade">Rebanho da propriedade</option>
              <option value="lote">Um lote</option>
              <option value="animal">Um animal</option>
            </Selecao>
          )}
        </Campo>
        {valores.alvo === 'lote' && (
          <Campo rotulo="Lote" obrigatorio>
            {(p) => (
              <Selecao
                {...p}
                value={valores.loteId}
                onChange={(e) => definir('loteId', e.target.value)}
              >
                <option value="">Escolha</option>
                {(lotes.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        )}
        {valores.alvo === 'animal' && (
          <Campo rotulo="Animal" obrigatorio>
            {(p) => (
              <SeletorAnimal
                id={p.id}
                propriedadeId={propriedadeId}
                somenteAtivos
                valor={valores.animalId}
                rotuloValor={rotuloAnimal}
                aoMudar={(id, rotulo) => {
                  definir('animalId', id);
                  setRotuloAnimal(rotulo);
                }}
              />
            )}
          </Campo>
        )}
      </div>
      <Campo rotulo="Observações" erro={errosCampos['observacoes']}>
        {(p) => (
          <Entrada
            {...p}
            value={valores.observacoes}
            onChange={(e) => definir('observacoes', e.target.value)}
          />
        )}
      </Campo>
      {item && (
        <Campo rotulo="Motivo da alteração" erro={errosCampos['motivo']}>
          {(p) => (
            <Entrada
              {...p}
              value={valores.motivo}
              onChange={(e) => definir('motivo', e.target.value)}
            />
          )}
        </Campo>
      )}
    </Modal>
  );
}

/** Ação com motivo obrigatório (cancelar, remover animal, excluir registro). */
export function ModalMotivo({
  titulo,
  descricao,
  rotuloMotivo = 'Motivo',
  textoEnviar,
  perigoso = true,
  confirmacao,
  enviando,
  aoFechar,
  aoConfirmar,
}: {
  titulo: string;
  descricao: string;
  rotuloMotivo?: string;
  textoEnviar: string;
  perigoso?: boolean;
  confirmacao?: string;
  enviando: boolean;
  aoFechar: () => void;
  aoConfirmar: (motivo: string, mostrarErro: (erro: unknown) => void) => void;
}) {
  const form = useFormulario({
    inicial: { motivo: '', confirmado: false },
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
        if (confirmacao && !form.valores.confirmado) {
          form.mostrarErroDoServidor(
            new Error('Confirme o tratamento do estoque antes de continuar.'),
          );
          return;
        }
        if (dados) aoConfirmar(dados.motivo, form.mostrarErroDoServidor);
      }}
      textoEnviar={textoEnviar}
      perigoso={perigoso}
      enviando={enviando}
      erros={form.errosGerais}
    >
      {confirmacao && (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.valores.confirmado}
            onChange={(e) => form.definir('confirmado', e.target.checked)}
          />
          {confirmacao}
        </label>
      )}
      <Campo rotulo={rotuloMotivo} obrigatorio erro={form.errosCampos['motivo']}>
        {(p) => (
          <Entrada
            {...p}
            autoFocus
            value={form.valores.motivo}
            onChange={(e) => form.definir('motivo', e.target.value)}
          />
        )}
      </Campo>
    </Modal>
  );
}

export function AvisoSemPrescricao() {
  return <Alerta tom="info">{AVISO_SEM_PRESCRICAO}</Alerta>;
}

/** Aviso fixo: o fim da carência é uma conta sobre o dado digitado, não uma liberação. */
export const AVISO_CARENCIA =
  'As datas são só a conta "data da aplicação + dias de carência informados por você", feita separadamente para carne e para leite. Não são garantia de liberação nem autorização para vender o animal, abater ou entregar o leite: o prazo correto é o da bula do produto e da orientação do médico-veterinário.';

export function AvisoCarencia({ className }: { className?: string }) {
  return (
    <Alerta
      tom="info"
      titulo="Fim de prazo calculado, não liberação sanitária"
      className={className}
    >
      <span data-testid="aviso-carencia">{AVISO_CARENCIA}</span>
    </Alerta>
  );
}
