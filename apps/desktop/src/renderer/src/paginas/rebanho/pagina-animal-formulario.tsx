import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import type { AnimalDetalhe } from '@pecuaria/shared-types';
import { esquemaDadosAnimal, esquemaEntradaAnimal, esquemaMotivo } from '@pecuaria/shared-types';
import {
  APTIDOES_ANIMAL,
  CATEGORIAS_ANIMAL,
  METODOS_PESAGEM,
  ORIGENS_ANIMAL,
  SEXO_DA_CATEGORIA,
  validarConsistenciaAnimal,
  type AptidaoAnimal,
  type CategoriaAnimal,
  type CondicaoSexual,
  type MetodoPesagem,
  type OrigemAnimal,
  type Sexo,
} from '@pecuaria/domain';
import { useAcaoRebanho, useAnimal, useLotes, useRacas } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { hojeIso } from '../../lib/formatar-rebanho';
import { textoParaNumero, useFormulario, vazioParaNulo } from '../../hooks/use-formulario';
import { usePropriedadeAtual } from '../../hooks/use-propriedade-atual';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import {
  AreaTexto,
  CaixaMarcar,
  Campo,
  Entrada,
  Selecao,
  opcoesDe,
} from '../../components/ui/campos';
import { Cartao, CartaoConteudo, CartaoDescricao, CartaoTitulo } from '../../components/ui/cartao';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { SeletorAnimal } from './seletor-animal';

type ValoresAnimal = {
  identificacao: string;
  nome: string;
  sexo: Sexo;
  condicaoSexual: CondicaoSexual;
  categoria: CategoriaAnimal | '';
  aptidao: AptidaoAnimal;
  racaId: string;
  dataNascimento: string;
  dataNascimentoEstimada: boolean;
  maeId: string;
  paiId: string;
  origem: OrigemAnimal;
  observacoes: string;
  dataEntrada: string;
  loteId: string;
  pesoEntrada: string;
  metodoPesagem: MetodoPesagem;
  motivo: string;
};

function valoresIniciais(
  animal: AnimalDetalhe | null,
  aptidaoPadrao: AptidaoAnimal,
): ValoresAnimal {
  return {
    identificacao: animal?.identificacao ?? '',
    nome: animal?.nome ?? '',
    sexo: animal?.sexo ?? 'F',
    condicaoSexual: animal?.condicaoSexual ?? 'femea',
    categoria: animal?.categoria ?? '',
    aptidao: animal?.aptidao ?? aptidaoPadrao,
    racaId: animal?.raca?.id ?? '',
    dataNascimento: animal?.dataNascimento ?? '',
    dataNascimentoEstimada: animal?.dataNascimentoEstimada ?? false,
    maeId: animal?.mae?.id ?? '',
    paiId: animal?.pai?.id ?? '',
    origem: animal?.origem ?? 'comprado',
    observacoes: animal?.observacoes ?? '',
    dataEntrada: hojeIso(),
    loteId: '',
    pesoEntrada: '',
    metodoPesagem: 'balanca',
    motivo: '',
  };
}

function converterDados(v: ValoresAnimal) {
  return {
    identificacao: v.identificacao,
    nome: vazioParaNulo(v.nome),
    sexo: v.sexo,
    condicaoSexual: v.condicaoSexual,
    categoria: v.categoria,
    aptidao: v.aptidao,
    racaId: vazioParaNulo(v.racaId),
    dataNascimento: vazioParaNulo(v.dataNascimento),
    dataNascimentoEstimada: v.dataNascimentoEstimada,
    maeId: vazioParaNulo(v.maeId),
    paiId: vazioParaNulo(v.paiId),
    origem: v.origem,
    observacoes: vazioParaNulo(v.observacoes),
  };
}

const esquemaNovo = z.object({ dados: esquemaDadosAnimal, entrada: esquemaEntradaAnimal });
const esquemaEdicao = z.object({ dados: esquemaDadosAnimal, motivo: esquemaMotivo });

function Formulario({
  propriedadeId,
  animal,
  aptidaoPadrao,
}: {
  propriedadeId: string;
  animal: AnimalDetalhe | null;
  aptidaoPadrao: AptidaoAnimal;
}) {
  const navegar = useNavigate();
  const { notificar } = useNotificacoes();
  const racas = useRacas();
  const lotes = useLotes(propriedadeId);
  const criar = useAcaoRebanho('animal:criar');
  const atualizar = useAcaoRebanho('animal:atualizar');
  const [rotulosGenitores, setRotulosGenitores] = useState({
    mae: animal?.mae ? animal.mae.identificacao : null,
    pai: animal?.pai ? animal.pai.identificacao : null,
  });
  const edicao = animal !== null;

  const form = useFormulario({
    inicial: valoresIniciais(animal, aptidaoPadrao),
    esquema: edicao ? esquemaEdicao : esquemaNovo,
    converter: (v: ValoresAnimal) =>
      edicao
        ? { dados: converterDados(v), motivo: vazioParaNulo(v.motivo) }
        : {
            dados: converterDados(v),
            entrada: {
              data: v.dataEntrada,
              loteId: vazioParaNulo(v.loteId),
              pesoVivoKg: textoParaNumero(v.pesoEntrada),
              metodoPesagem: v.pesoEntrada.trim() ? v.metodoPesagem : null,
            },
          },
    validarExtra: (r) =>
      validarConsistenciaAnimal(
        {
          ...r.dados,
          dataEntrada: 'entrada' in r ? r.entrada.data : (animal?.dataEntrada ?? null),
        },
        hojeIso(),
      ),
  });
  const { valores, definir, errosCampos } = form;

  const categoriasDoSexo = useMemo(
    () => CATEGORIAS_ANIMAL.filter((c) => SEXO_DA_CATEGORIA[c] === valores.sexo),
    [valores.sexo],
  );

  const mudarSexo = (sexo: Sexo) => {
    definir('sexo', sexo);
    definir(
      'condicaoSexual',
      sexo === 'F'
        ? 'femea'
        : valores.condicaoSexual === 'femea'
          ? 'inteiro'
          : valores.condicaoSexual,
    );
    if (valores.categoria && SEXO_DA_CATEGORIA[valores.categoria] !== sexo)
      definir('categoria', '');
  };

  const salvar = (evento: FormEvent) => {
    evento.preventDefault();
    const resultado = form.validar();
    if (!resultado) {
      window.scrollTo({ top: 0 });
      return;
    }
    if (animal && 'motivo' in resultado) {
      atualizar.mutate(
        { id: animal.id, dados: resultado.dados, motivo: resultado.motivo },
        {
          onSuccess: () => {
            notificar('Cadastro atualizado.', 'sucesso');
            navegar(`/rebanho/animais/${animal.id}`);
          },
          onError: form.mostrarErroDoServidor,
        },
      );
    } else if ('entrada' in resultado) {
      criar.mutate(
        { propriedadeId, dados: resultado.dados, entrada: resultado.entrada },
        {
          onSuccess: (novo) => {
            notificar(`Animal ${novo.identificacao} cadastrado.`, 'sucesso');
            navegar(`/rebanho/animais/${novo.id}`);
          },
          onError: form.mostrarErroDoServidor,
        },
      );
    }
  };

  return (
    <form onSubmit={salvar} noValidate className="flex flex-col gap-6">
      <CabecalhoPagina
        voltar={
          animal
            ? { para: `/rebanho/animais/${animal.id}`, rotulo: animal.identificacao }
            : { para: '/rebanho/animais', rotulo: 'Animais' }
        }
        titulo={animal ? `Editar ${animal.identificacao}` : 'Novo animal'}
        descricao={
          animal
            ? 'Mudanças no cadastro ficam registradas no histórico do animal.'
            : 'Campos com * são obrigatórios.'
        }
      />

      {form.errosGerais.length > 0 && (
        <Alerta
          tom="perigo"
          titulo={
            form.errosGerais.length === 1 ? form.errosGerais[0] : 'Corrija os problemas abaixo.'
          }
        >
          {form.errosGerais.length > 1 && (
            <ul className="list-disc pl-4">
              {form.errosGerais.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </Alerta>
      )}

      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <CartaoTitulo>Identificação e características</CartaoTitulo>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo
              rotulo="Identificação"
              obrigatorio
              erro={errosCampos['identificacao']}
              ajuda="Brinco, chip ou tatuagem. Única na propriedade."
            >
              {(p) => (
                <Entrada
                  {...p}
                  autoFocus
                  value={valores.identificacao}
                  onChange={(e) => definir('identificacao', e.target.value)}
                />
              )}
            </Campo>
            <Campo rotulo="Nome" erro={errosCampos['nome']}>
              {(p) => (
                <Entrada
                  {...p}
                  value={valores.nome}
                  onChange={(e) => definir('nome', e.target.value)}
                />
              )}
            </Campo>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Campo rotulo="Sexo" obrigatorio>
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.sexo}
                  onChange={(e) => mudarSexo(e.target.value as Sexo)}
                >
                  {opcoesDe(rotulos.sexo)}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Condição sexual" obrigatorio erro={errosCampos['condicaoSexual']}>
              {(p) => (
                <Selecao
                  {...p}
                  disabled={valores.sexo === 'F'}
                  value={valores.condicaoSexual}
                  onChange={(e) => definir('condicaoSexual', e.target.value as CondicaoSexual)}
                >
                  {valores.sexo === 'F'
                    ? opcoesDe(rotulos.condicaoSexual, ['femea'])
                    : opcoesDe(rotulos.condicaoSexual, ['inteiro', 'castrado'])}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Categoria" obrigatorio erro={errosCampos['categoria']}>
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.categoria}
                  onChange={(e) => definir('categoria', e.target.value as CategoriaAnimal)}
                >
                  <option value="">Selecione</option>
                  {opcoesDe(rotulos.categoria, categoriasDoSexo)}
                </Selecao>
              )}
            </Campo>
            <Campo
              rotulo="Aptidão"
              obrigatorio
              ajuda="Corte e leite usam modelos de nutrição diferentes."
            >
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.aptidao}
                  onChange={(e) => definir('aptidao', e.target.value as AptidaoAnimal)}
                >
                  {opcoesDe(rotulos.aptidaoAnimal, APTIDOES_ANIMAL)}
                </Selecao>
              )}
            </Campo>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo rotulo="Raça" erro={errosCampos['racaId']}>
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.racaId}
                  onChange={(e) => definir('racaId', e.target.value)}
                >
                  <option value="">Não informada</option>
                  {(racas.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Origem" obrigatorio>
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.origem}
                  onChange={(e) => definir('origem', e.target.value as OrigemAnimal)}
                >
                  {opcoesDe(rotulos.origem, ORIGENS_ANIMAL)}
                </Selecao>
              )}
            </Campo>
          </div>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <CartaoTitulo>Nascimento e genealogia</CartaoTitulo>
          <div className="grid items-end gap-4 md:grid-cols-2">
            <Campo
              rotulo="Data de nascimento"
              obrigatorio={valores.origem === 'nascido'}
              erro={errosCampos['dataNascimento']}
            >
              {(p) => (
                <Entrada
                  {...p}
                  type="date"
                  max={hojeIso()}
                  value={valores.dataNascimento}
                  onChange={(e) => definir('dataNascimento', e.target.value)}
                />
              )}
            </Campo>
            <div className="pb-2">
              <CaixaMarcar
                rotulo="Data de nascimento estimada"
                marcado={valores.dataNascimentoEstimada}
                aoMudar={(m) => definir('dataNascimentoEstimada', m)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo
              rotulo="Mãe"
              erro={errosCampos['maeId']}
              ajuda="Opcional. Fêmea da mesma propriedade."
            >
              {(p) => (
                <SeletorAnimal
                  id={p.id}
                  propriedadeId={propriedadeId}
                  sexo="F"
                  {...(animal ? { excluirId: animal.id } : {})}
                  valor={valores.maeId}
                  rotuloValor={rotulosGenitores.mae}
                  aoMudar={(id, rotulo) => {
                    definir('maeId', id);
                    setRotulosGenitores((r) => ({ ...r, mae: rotulo }));
                  }}
                />
              )}
            </Campo>
            <Campo
              rotulo="Pai"
              erro={errosCampos['paiId']}
              ajuda="Opcional. Macho da mesma propriedade."
            >
              {(p) => (
                <SeletorAnimal
                  id={p.id}
                  propriedadeId={propriedadeId}
                  sexo="M"
                  {...(animal ? { excluirId: animal.id } : {})}
                  valor={valores.paiId}
                  rotuloValor={rotulosGenitores.pai}
                  aoMudar={(id, rotulo) => {
                    definir('paiId', id);
                    setRotulosGenitores((r) => ({ ...r, pai: rotulo }));
                  }}
                />
              )}
            </Campo>
          </div>
        </CartaoConteudo>
      </Cartao>

      {!edicao && (
        <Cartao>
          <CartaoConteudo className="flex flex-col gap-4">
            <div>
              <CartaoTitulo>Entrada no rebanho</CartaoTitulo>
              <CartaoDescricao>
                O peso de entrada vira a primeira pesagem do animal.
              </CartaoDescricao>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Data de entrada" obrigatorio erro={errosCampos['data']}>
                {(p) => (
                  <Entrada
                    {...p}
                    type="date"
                    max={hojeIso()}
                    value={valores.dataEntrada}
                    onChange={(e) => definir('dataEntrada', e.target.value)}
                  />
                )}
              </Campo>
              <Campo rotulo="Lote" erro={errosCampos['loteId']}>
                {(p) => (
                  <Selecao
                    {...p}
                    value={valores.loteId}
                    onChange={(e) => definir('loteId', e.target.value)}
                  >
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
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Peso vivo de entrada (kg)" erro={errosCampos['pesoVivoKg']}>
                {(p) => (
                  <Entrada
                    {...p}
                    inputMode="decimal"
                    placeholder="Opcional"
                    value={valores.pesoEntrada}
                    onChange={(e) => definir('pesoEntrada', e.target.value)}
                  />
                )}
              </Campo>
              <Campo rotulo="Método da pesagem" erro={errosCampos['metodoPesagem']}>
                {(p) => (
                  <Selecao
                    {...p}
                    disabled={!valores.pesoEntrada.trim()}
                    value={valores.metodoPesagem}
                    onChange={(e) => definir('metodoPesagem', e.target.value as MetodoPesagem)}
                  >
                    {opcoesDe(rotulos.metodo, METODOS_PESAGEM)}
                  </Selecao>
                )}
              </Campo>
            </div>
          </CartaoConteudo>
        </Cartao>
      )}

      <Cartao>
        <CartaoConteudo className="flex flex-col gap-4">
          <Campo rotulo="Observações" erro={errosCampos['observacoes']}>
            {(p) => (
              <AreaTexto
                {...p}
                value={valores.observacoes}
                onChange={(e) => definir('observacoes', e.target.value)}
              />
            )}
          </Campo>
          {edicao && (
            <Campo rotulo="Motivo da alteração" ajuda="Opcional. Fica registrado no histórico.">
              {(p) => (
                <Entrada
                  {...p}
                  value={valores.motivo}
                  onChange={(e) => definir('motivo', e.target.value)}
                />
              )}
            </Campo>
          )}
        </CartaoConteudo>
      </Cartao>

      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => navegar(-1)}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={criar.isPending || atualizar.isPending}>
          {edicao ? 'Salvar alterações' : 'Cadastrar animal'}
        </Botao>
      </div>
    </form>
  );
}

export function PaginaNovoAnimal() {
  const { propriedade, carregando } = usePropriedadeAtual();
  if (carregando) return null;
  if (!propriedade)
    return <Alerta tom="alerta" titulo="Cadastre uma propriedade antes de cadastrar animais." />;
  return (
    <Formulario
      propriedadeId={propriedade.id}
      animal={null}
      aptidaoPadrao={propriedade.tipoExploracao === 'leite' ? 'leite' : 'corte'}
    />
  );
}

export function PaginaEditarAnimal() {
  const { id = '' } = useParams();
  const animal = useAnimal(id);
  if (animal.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(animal.error)} />;
  if (!animal.data) return null;
  return (
    <Formulario
      propriedadeId={animal.data.propriedadeId}
      animal={animal.data}
      aptidaoPadrao={animal.data.aptidao}
    />
  );
}
