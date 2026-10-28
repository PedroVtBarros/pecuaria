import { useState } from 'react';
import {
  ConsumoSanitario,
  converterConsumos,
  type LinhaConsumo,
} from '../estoque/consumo-sanitario';
import { useNavigate, useSearchParams } from 'react-router';
import { Trash2, Users } from 'lucide-react';
import { z } from 'zod';
import type { ItemAgenda, Propriedade } from '@pecuaria/shared-types';
import { esquemaDadosManejo, esquemaProximaAplicacao } from '@pecuaria/shared-types';
import { interpretarNumero } from '@pecuaria/domain';
import {
  useAcaoRebanho,
  useAgenda,
  useAnimal,
  useAnimais,
  useLotes,
} from '../../lib/consultas-rebanho';
import { formatarData, hojeIso } from '../../lib/formatar-rebanho';
import { useFormulario, vazioParaNulo } from '../../hooks/use-formulario';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, Selecao } from '../../components/ui/campos';
import { Cartao, CartaoCabecalho, CartaoConteudo, CartaoTitulo } from '../../components/ui/cartao';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Cabeca, Linha, LinhaVazia, Tabela, Td, Th } from '../../components/ui/tabela';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { SeletorAnimal } from '../rebanho/seletor-animal';
import {
  AvisoSemPrescricao,
  CamposManejo,
  converterManejo,
  valoresIniciaisManejo,
} from './modais-sanidade';

interface AnimalEscolhido {
  id: string;
  identificacao: string;
  nome: string | null;
}

interface Inicio {
  modo: 'lote' | 'animais';
  loteId: string;
  animais: AnimalEscolhido[];
  agenda: ItemAgenda | null;
}

function Formulario({ propriedade, inicio }: { propriedade: Propriedade; inicio: Inicio }) {
  const navegar = useNavigate();
  const { notificar } = useNotificacoes();
  const registrar = useAcaoRebanho('manejoSanitario:registrar');
  const lotes = useLotes(propriedade.id);
  const [consumos, setConsumos] = useState<LinhaConsumo[]>([]);
  const [modo, setModo] = useState(inicio.modo);
  const [loteId, setLoteId] = useState(inicio.loteId);
  const [avulsos, setAvulsos] = useState<AnimalEscolhido[]>(inicio.animais);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [dosesIndividuais, setDosesIndividuais] = useState(false);
  const [doses, setDoses] = useState<Record<string, string>>({});
  const [errosAnimais, setErrosAnimais] = useState<string[]>([]);
  const animaisDoLote = useAnimais(modo === 'lote' && loteId ? propriedade.id : null, {
    loteId,
    tamanhoPagina: 5000,
  });

  const agenda = inicio.agenda;
  const form = useFormulario({
    inicial: {
      ...valoresIniciaisManejo(null),
      ...(agenda
        ? {
            tipo: agenda.tipo,
            produtoId: agenda.produto?.id ?? '',
            descricao: agenda.descricao ?? '',
          }
        : {}),
      proximaData: '',
      proximaObservacoes: '',
    },
    esquema: z.object({
      dados: esquemaDadosManejo,
      proxima: esquemaProximaAplicacao.nullable(),
    }),
    converter: (v) => ({
      dados: converterManejo(v),
      proxima: v.proximaData
        ? { data: v.proximaData, observacoes: vazioParaNulo(v.proximaObservacoes) }
        : null,
    }),
  });

  const listaLote: AnimalEscolhido[] = (animaisDoLote.data?.itens ?? []).map((a) => ({
    id: a.id,
    identificacao: a.identificacao,
    nome: a.nome,
  }));
  const escolhidos = modo === 'lote' ? listaLote.filter((a) => !desmarcados.has(a.id)) : avulsos;
  const lista = modo === 'lote' ? listaLote : avulsos;

  const salvar = () => {
    const v = form.validar();
    const erros: string[] = [];
    if (escolhidos.length === 0) erros.push('Selecione ao menos um animal.');
    const animais = escolhidos.map((a) => {
      const texto = doses[a.id]?.trim() ?? '';
      if (!dosesIndividuais || texto === '') return { animalId: a.id, dose: null };
      const dose = interpretarNumero(texto);
      if (dose === null || dose <= 0) erros.push(`${a.identificacao}: dose inválida.`);
      return { animalId: a.id, dose };
    });
    let consumosEstoque;
    try {
      consumosEstoque = converterConsumos(consumos);
    } catch (e) {
      erros.push(e instanceof Error ? e.message : 'Consumo inválido.');
    }
    setErrosAnimais(erros);
    if (!v || erros.length > 0) return;
    registrar.mutate(
      {
        propriedadeId: propriedade.id,
        dados: v.dados,
        animais,
        loteId: modo === 'lote' ? loteId || null : null,
        agendaId: agenda?.id ?? null,
        proximaAplicacao: v.proxima,
        consumosEstoque,
      },
      {
        onSuccess: (r) => {
          notificar(
            r.quantidadeAnimais === 1
              ? 'Registro sanitário salvo.'
              : `Registro salvo para ${r.quantidadeAnimais} animais.`,
            'sucesso',
          );
          navegar(`/manejo/sanidade/${r.id}`);
        },
        onError: form.mostrarErroDoServidor,
      },
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <CabecalhoPagina
        voltar={{ para: '/manejo/sanidade', rotulo: 'Registros sanitários' }}
        titulo="Novo registro sanitário"
        descricao={
          agenda
            ? `Realizando o evento agendado para ${formatarData(agenda.dataPrevista)}: ${rotulos.tipoManejo[agenda.tipo]}.`
            : 'Vacinação, vermifugação, tratamento ou exame de um animal ou de vários de uma vez.'
        }
      />
      {[...form.errosGerais, ...errosAnimais].length > 0 && (
        <Alerta tom="perigo" titulo="Corrija os problemas abaixo.">
          <ul className="list-disc pl-4">
            {[...form.errosGerais, ...errosAnimais].map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alerta>
      )}
      <AvisoSemPrescricao />

      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>O que foi feito</CartaoTitulo>
        </CartaoCabecalho>
        <CartaoConteudo className="flex flex-col gap-4">
          <CamposManejo
            valores={form.valores}
            definir={(campo, valor) => form.definir(campo, valor as never)}
            errosCampos={form.errosCampos}
          />
        </CartaoConteudo>
      </Cartao>

      <ConsumoSanitario
        propriedadeId={propriedade.id}
        produtoId={form.valores.produtoId}
        linhas={consumos}
        aoMudar={setConsumos}
      />
      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>Animais tratados</CartaoTitulo>
        </CartaoCabecalho>
        <CartaoConteudo className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modo"
                className="accent-marca"
                checked={modo === 'lote'}
                onChange={() => setModo('lote')}
              />
              Todos os animais de um lote
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="modo"
                className="accent-marca"
                checked={modo === 'animais'}
                onChange={() => setModo('animais')}
              />
              Escolher animais
            </label>
          </div>
          {modo === 'lote' ? (
            <Campo
              rotulo="Lote"
              ajuda="Todos os animais ativos do lote vêm marcados. Desmarque quem não foi tratado."
            >
              {(p) => (
                <Selecao
                  {...p}
                  value={loteId}
                  onChange={(e) => {
                    setLoteId(e.target.value);
                    setDesmarcados(new Set());
                  }}
                >
                  <option value="">Escolha o lote</option>
                  {(lotes.data ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} ({l.animaisAtivos})
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
          ) : (
            <Campo rotulo="Adicionar animal">
              {(p) => (
                <SeletorAnimal
                  id={p.id}
                  propriedadeId={propriedade.id}
                  somenteAtivos
                  valor=""
                  rotuloValor={null}
                  aoMudar={(id, rotulo) => {
                    if (!id || avulsos.some((a) => a.id === id)) return;
                    const [identificacao, nome] = (rotulo ?? '').split(' · ');
                    setAvulsos([
                      ...avulsos,
                      { id, identificacao: identificacao ?? '', nome: nome ?? null },
                    ]);
                  }}
                />
              )}
            </Campo>
          )}
          <CaixaMarcar
            rotulo="Doses diferentes por animal (ex.: conforme o peso)"
            marcado={dosesIndividuais}
            aoMudar={setDosesIndividuais}
          />
          <Tabela data-testid="tabela-animais-tratados">
            <Cabeca>
              {modo === 'lote' && <Th className="w-10">Tratado</Th>}
              <Th>Identificação</Th>
              <Th>Nome</Th>
              {dosesIndividuais && <Th>Dose individual</Th>}
              {modo === 'animais' && <Th className="w-10" />}
            </Cabeca>
            <tbody>
              {lista.length === 0 && (
                <LinhaVazia colunas={4}>
                  {modo === 'lote'
                    ? loteId
                      ? 'Nenhum animal ativo neste lote.'
                      : 'Escolha um lote.'
                    : 'Busque e adicione os animais tratados.'}
                </LinhaVazia>
              )}
              {lista.map((a) => (
                <Linha key={a.id} data-animal={a.identificacao}>
                  {modo === 'lote' && (
                    <Td>
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-marca"
                        aria-label={`Tratado: ${a.identificacao}`}
                        checked={!desmarcados.has(a.id)}
                        onChange={() => {
                          const novo = new Set(desmarcados);
                          if (novo.has(a.id)) novo.delete(a.id);
                          else novo.add(a.id);
                          setDesmarcados(novo);
                        }}
                      />
                    </Td>
                  )}
                  <Td className="font-medium">{a.identificacao}</Td>
                  <Td>{a.nome ?? '—'}</Td>
                  {dosesIndividuais && (
                    <Td>
                      <Entrada
                        className="h-8 w-28"
                        inputMode="decimal"
                        aria-label={`Dose de ${a.identificacao}`}
                        placeholder="Dose comum"
                        value={doses[a.id] ?? ''}
                        onChange={(e) => setDoses({ ...doses, [a.id]: e.target.value })}
                      />
                    </Td>
                  )}
                  {modo === 'animais' && (
                    <Td>
                      <Botao
                        tamanho="pequeno"
                        variante="fantasma"
                        aria-label={`Remover ${a.identificacao}`}
                        onClick={() => setAvulsos(avulsos.filter((x) => x.id !== a.id))}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Botao>
                    </Td>
                  )}
                </Linha>
              ))}
            </tbody>
          </Tabela>
          <p className="flex items-center gap-2 text-sm text-texto-suave">
            <Users className="size-4" aria-hidden />
            {escolhidos.length}{' '}
            {escolhidos.length === 1 ? 'animal selecionado' : 'animais selecionados'}
          </p>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>Próxima aplicação (opcional)</CartaoTitulo>
        </CartaoCabecalho>
        <CartaoConteudo className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Data"
            ajuda="Informe só se houver reforço ou repetição indicada. Entra na agenda."
          >
            {(p) => (
              <Entrada
                {...p}
                type="date"
                min={form.valores.data || hojeIso()}
                value={form.valores.proximaData}
                onChange={(e) => form.definir('proximaData', e.target.value)}
              />
            )}
          </Campo>
          <Campo rotulo="Observação para a agenda">
            {(p) => (
              <Entrada
                {...p}
                value={form.valores.proximaObservacoes}
                onChange={(e) => form.definir('proximaObservacoes', e.target.value)}
              />
            )}
          </Campo>
        </CartaoConteudo>
      </Cartao>

      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={() => navegar(-1)}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={registrar.isPending}>
          Salvar registro
        </Botao>
      </div>
    </form>
  );
}

/** Espera os dados de origem (agenda, animal) antes de montar o formulário. */
function Preparar({ propriedade }: { propriedade: Propriedade }) {
  const [parametros] = useSearchParams();
  const agendaId = parametros.get('agenda');
  const animalId = parametros.get('animal');
  const loteParam = parametros.get('lote');
  const agenda = useAgenda(agendaId ? propriedade.id : null);
  const animal = useAnimal(animalId ?? '', animalId !== null);
  if (agendaId && !agenda.data) return null;
  if (animalId && !animal.data && !animal.isError) return null;

  const itemAgenda = agenda.data?.find((a) => a.id === agendaId) ?? null;
  const animalInicial: AnimalEscolhido | null = itemAgenda?.animal
    ? { id: itemAgenda.animal.id, identificacao: itemAgenda.animal.identificacao, nome: null }
    : animal.data
      ? { id: animal.data.id, identificacao: animal.data.identificacao, nome: animal.data.nome }
      : null;
  const loteInicial = itemAgenda?.lote?.id ?? loteParam ?? '';
  const inicio: Inicio = animalInicial
    ? {
        modo: 'animais',
        loteId: '',
        animais: [animalInicial],
        agenda: itemAgenda,
      }
    : { modo: 'lote', loteId: loteInicial, animais: [], agenda: itemAgenda };
  return <Formulario propriedade={propriedade} inicio={inicio} />;
}

export function PaginaRegistroNovo() {
  return <ComPropriedade>{(p) => <Preparar propriedade={p} />}</ComPropriedade>;
}
