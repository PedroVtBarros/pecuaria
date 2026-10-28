import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Eraser, ListChecks, Save, Scale, TriangleAlert } from 'lucide-react';
import {
  esquemaParametrosAlertasPesagem,
  type ItemPesagemLote,
  type ItemResultadoPesagemLote,
  type Propriedade,
  type ResultadoPesagemLote,
} from '@pecuaria/shared-types';
import {
  diasEntre,
  ehDataIso,
  ESCALAS_ECC,
  interpretarNumero,
  LIMITES_ESCALA_ECC,
  METODOS_PESAGEM,
  PARAMETROS_ALERTAS_PESAGEM_INICIAIS,
  PESO_VIVO_MAXIMO_KG,
  type EscalaEcc,
  type MetodoPesagem,
} from '@pecuaria/domain';
import { useConfiguracao } from '../../lib/consultas';
import { useAcaoRebanho, useAnimais, useLotes } from '../../lib/consultas-rebanho';
import {
  descreverAlerta,
  formatarData,
  formatarGanho,
  formatarGmd,
  formatarPeso,
  hojeIso,
} from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Cartao, CartaoConteudo } from '../../components/ui/cartao';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { cn } from '../../lib/utils';
import { ComPropriedade } from '../rebanho/layout-rebanho';

interface ValorLinha {
  peso: string;
  ecc: string;
  data: string;
  justificativa: string;
}

const VAZIA: ValorLinha = { peso: '', ecc: '', data: '', justificativa: '' };
const TODOS = 'todos';
const SEM_LOTE = 'sem_lote';

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [parametrosUrl] = useSearchParams();
  const { notificar } = useNotificacoes();
  const lotes = useLotes(propriedade.id);
  const registrar = useAcaoRebanho('pesagem:registrarLote');
  const config = useConfiguracao('alertas.pesagem');
  const parametros = useMemo(() => {
    const r = esquemaParametrosAlertasPesagem.safeParse(config.data);
    return r.success ? r.data : PARAMETROS_ALERTAS_PESAGEM_INICIAIS;
  }, [config.data]);

  const [grupo, setGrupo] = useState(parametrosUrl.get('lote') ?? TODOS);
  const [data, setData] = useState(hojeIso());
  const [metodo, setMetodo] = useState<MetodoPesagem>('balanca');
  const [escala, setEscala] = useState<EscalaEcc | ''>('');
  const [datasIndividuais, setDatasIndividuais] = useState(false);
  const [busca, setBusca] = useState('');
  const [valores, setValores] = useState<Record<string, ValorLinha>>({});
  const [errosLocais, setErrosLocais] = useState<Record<string, string[]>>({});
  const [resultado, setResultado] = useState<ResultadoPesagemLote | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const tabela = useRef<HTMLDivElement>(null);

  const animais = useAnimais(propriedade.id, {
    status: 'ativo',
    ...(grupo === TODOS ? {} : { loteId: grupo }),
    ordenacao: 'identificacao',
    tamanhoPagina: 5000,
  });
  const lista = animais.data?.itens ?? [];
  const termo = busca.trim().toLocaleUpperCase('pt-BR');
  const visiveis = termo
    ? lista.filter(
        (a) =>
          a.identificacao.toLocaleUpperCase('pt-BR').includes(termo) ||
          (a.nome ?? '').toLocaleUpperCase('pt-BR').includes(termo),
      )
    : lista;
  const preenchidos = lista.filter((a) => (valores[a.id]?.peso ?? '').trim() !== '');
  const porAnimal = new Map<string, ItemResultadoPesagemLote>(
    (resultado?.itens ?? []).map((i) => [i.animalId, i]),
  );

  const definir = (animalId: string, campo: keyof ValorLinha, valor: string) => {
    setValores((atual) => ({
      ...atual,
      [animalId]: { ...(atual[animalId] ?? VAZIA), [campo]: valor },
    }));
    // A prévia daquele animal deixa de valer quando o valor muda.
    if (campo !== 'justificativa' && porAnimal.has(animalId)) setResultado(null);
  };

  /** Enter leva ao peso do próximo animal: digitar dezenas de pesos sem mouse. */
  const proximo = (e: KeyboardEvent<HTMLInputElement>, indice: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const campos = tabela.current?.querySelectorAll<HTMLInputElement>('input[data-peso]');
    campos?.[indice + 1]?.focus();
  };

  /** Monta os itens e confere o que dá para conferir antes de enviar. */
  const montarItens = (): ItemPesagemLote[] | null => {
    const erros: Record<string, string[]> = {};
    const itens: ItemPesagemLote[] = [];
    for (const a of preenchidos) {
      const v = valores[a.id]!;
      const lista: string[] = [];
      const peso = interpretarNumero(v.peso);
      if (peso === null) lista.push('Peso inválido. Use números, como 452,5.');
      else if (peso <= 0 || peso > PESO_VIVO_MAXIMO_KG)
        lista.push(
          `O peso deve ficar entre 0 e ${PESO_VIVO_MAXIMO_KG.toLocaleString('pt-BR')} kg.`,
        );
      let escore: number | null = null;
      if (v.ecc.trim() !== '') {
        escore = interpretarNumero(v.ecc);
        if (!escala) lista.push('Escolha a escala do escore no topo da página.');
        else if (
          escore === null ||
          escore < LIMITES_ESCALA_ECC[escala].minimo ||
          escore > LIMITES_ESCALA_ECC[escala].maximo
        )
          lista.push('Escore fora da escala escolhida.');
      }
      const dataIndividual = datasIndividuais && v.data ? v.data : null;
      if (dataIndividual && !ehDataIso(dataIndividual)) lista.push('Data inválida.');
      if (lista.length) erros[a.id] = lista;
      else
        itens.push({
          animalId: a.id,
          pesoVivoKg: peso!,
          data: dataIndividual,
          escoreCorporal: escore,
          observacao: null,
          justificativa: v.justificativa.trim() || null,
        });
    }
    setErrosLocais(erros);
    if (preenchidos.length === 0) {
      setErroGeral('Digite o peso de pelo menos um animal.');
      return null;
    }
    setErroGeral(Object.keys(erros).length ? 'Corrija os valores marcados na tabela.' : null);
    return Object.keys(erros).length ? null : itens;
  };

  const enviar = (confirmar: boolean) => {
    const itens = montarItens();
    if (!itens) return;
    registrar.mutate(
      {
        propriedadeId: propriedade.id,
        pesagem: { data, metodo, escalaEcc: escala === '' ? null : escala, itens },
        confirmar,
      },
      {
        onSuccess: (r) => {
          setResultado(r);
          if (r.confirmado) {
            notificar(
              r.gravadas === 1 ? '1 pesagem registrada.' : `${r.gravadas} pesagens registradas.`,
              'sucesso',
            );
            setValores({});
          } else if (confirmar) {
            setErroGeral('Nada foi gravado. Corrija os animais marcados e salve de novo.');
          }
        },
        onError: (e) => setErroGeral(e instanceof Error ? e.message : String(e)),
      },
    );
  };

  const mudarGrupo = (novo: string) => {
    setGrupo(novo);
    setResultado(null);
    setErrosLocais({});
  };

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Pesagem em lote"
        descricao="Digite o peso de cada animal pesado. Quem ficar em branco não recebe pesagem; nenhum peso é estimado pela média."
      />

      <Cartao>
        <CartaoConteudo className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo
            rotulo="Animais"
            ajuda={preenchidos.length > 0 ? 'Limpe os pesos digitados para trocar.' : undefined}
          >
            {(p) => (
              <Selecao
                {...p}
                value={grupo}
                disabled={preenchidos.length > 0}
                onChange={(e) => mudarGrupo(e.target.value)}
              >
                <option value={TODOS}>Todos os animais ativos</option>
                <option value={SEM_LOTE}>Animais sem lote</option>
                {(lotes.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome} ({l.animaisAtivos})
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Data da pesagem">
            {(p) => (
              <Entrada
                {...p}
                type="date"
                max={hojeIso()}
                value={data}
                onChange={(e) => {
                  setData(e.target.value);
                  setResultado(null);
                }}
              />
            )}
          </Campo>
          <Campo rotulo="Método">
            {(p) => (
              <Selecao
                {...p}
                value={metodo}
                onChange={(e) => {
                  setMetodo(e.target.value as MetodoPesagem);
                  setResultado(null);
                }}
              >
                {opcoesDe(rotulos.metodo, METODOS_PESAGEM)}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Escore corporal">
            {(p) => (
              <Selecao
                {...p}
                value={escala}
                onChange={(e) => setEscala(e.target.value as EscalaEcc | '')}
              >
                <option value="">Não registrar</option>
                {opcoesDe(rotulos.escalaEcc, ESCALAS_ECC)}
              </Selecao>
            )}
          </Campo>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <CaixaMarcar
              rotulo="Alguns animais foram pesados em outra data"
              marcado={datasIndividuais}
              aoMudar={(v) => {
                setDatasIndividuais(v);
                setResultado(null);
              }}
            />
          </div>
        </CartaoConteudo>
      </Cartao>

      {erroGeral && <Alerta tom="perigo" titulo={erroGeral} />}
      {resultado?.confirmado && (
        <Alerta tom="sucesso" titulo={`${resultado.gravadas} pesagem(ns) registrada(s).`}>
          {resultado.comAlerta > 0 ? (
            <>
              {resultado.comAlerta} com alerta de conferência.{' '}
              <Link to="/manejo/alertas" className="text-marca underline">
                Ver alertas de pesagem
              </Link>
            </>
          ) : (
            'Nenhum alerta de conferência.'
          )}
        </Alerta>
      )}
      {resultado && !resultado.confirmado && resultado.comErro === 0 && (
        <Alerta
          tom={resultado.comAlerta > 0 ? 'alerta' : 'sucesso'}
          titulo={
            resultado.comAlerta > 0
              ? `${resultado.comAlerta} animal(is) com alerta. Confira os valores marcados.`
              : 'Tudo conferido, sem erros nem alertas.'
          }
        >
          {resultado.comAlerta > 0 &&
            'Alertas não impedem a gravação. Se o valor estiver certo, escreva a justificativa na linha.'}
        </Alerta>
      )}

      {lista.length === 0 && !animais.isLoading ? (
        <EstadoVazio icone={Scale} titulo="Nenhum animal ativo neste grupo" />
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Entrada
              className="max-w-xs"
              placeholder="Procurar identificação ou nome"
              aria-label="Procurar animal na lista"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <p className="text-sm text-texto-suave" data-testid="contador-pesagem">
              {preenchidos.length} de {lista.length} com peso
            </p>
          </div>
          <div ref={tabela}>
            <Tabela data-testid="tabela-pesagem-lote">
              <Cabeca>
                <Th>Animal</Th>
                <Th>Última pesagem</Th>
                <Th>Peso vivo (kg)</Th>
                {escala && <Th>Escore</Th>}
                {datasIndividuais && <Th>Data (se diferente)</Th>}
                <Th>Ganho e GMD observados</Th>
                <Th>Conferência</Th>
              </Cabeca>
              <tbody>
                {visiveis.map((a, indice) => {
                  const v = valores[a.id] ?? VAZIA;
                  const item = porAnimal.get(a.id);
                  const locais = errosLocais[a.id] ?? [];
                  const peso = interpretarNumero(v.peso);
                  const dataLinha = datasIndividuais && v.data ? v.data : data;
                  const ultima = a.ultimaPesagem;
                  const dias =
                    ultima && ehDataIso(dataLinha) ? diasEntre(ultima.data, dataLinha) : 0;
                  const gmd =
                    peso !== null && ultima && dias > 0 ? (peso - ultima.pesoVivoKg) / dias : null;
                  const foraDoLimite =
                    gmd !== null &&
                    ((parametros.gmdMaximoKgDia !== null && gmd > parametros.gmdMaximoKgDia) ||
                      (parametros.gmdMinimoKgDia !== null && gmd < parametros.gmdMinimoKgDia));
                  const erros = [...locais, ...(item?.erros ?? [])];
                  return (
                    <Linha
                      key={a.id}
                      data-animal={a.identificacao}
                      className={cn(
                        erros.length > 0 && 'bg-perigo-suave/40',
                        erros.length === 0 &&
                          (item?.alertas.length ?? 0) > 0 &&
                          'bg-alerta-suave/40',
                      )}
                    >
                      <Td className="whitespace-nowrap">
                        <span className="font-medium">{a.identificacao}</span>
                        {a.nome && <span className="text-texto-suave"> · {a.nome}</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-texto-suave">
                        {ultima
                          ? `${formatarPeso(ultima.pesoVivoKg)} em ${formatarData(ultima.data)}`
                          : '—'}
                      </Td>
                      <Td>
                        <Entrada
                          data-peso
                          className="h-8 w-28 tabular-nums"
                          inputMode="decimal"
                          aria-label={`Peso de ${a.identificacao}`}
                          aria-invalid={erros.length > 0}
                          value={v.peso}
                          onChange={(e) => definir(a.id, 'peso', e.target.value)}
                          onKeyDown={(e) => proximo(e, indice)}
                        />
                      </Td>
                      {escala && (
                        <Td>
                          <Entrada
                            className="h-8 w-20"
                            inputMode="decimal"
                            aria-label={`Escore de ${a.identificacao}`}
                            value={v.ecc}
                            onChange={(e) => definir(a.id, 'ecc', e.target.value)}
                          />
                        </Td>
                      )}
                      {datasIndividuais && (
                        <Td>
                          <Entrada
                            className="h-8 w-40"
                            type="date"
                            max={hojeIso()}
                            aria-label={`Data de ${a.identificacao}`}
                            value={v.data}
                            onChange={(e) => definir(a.id, 'data', e.target.value)}
                          />
                        </Td>
                      )}
                      <Td className="whitespace-nowrap">
                        {gmd !== null && peso !== null && ultima ? (
                          <span className={foraDoLimite ? 'text-alerta' : 'text-texto-suave'}>
                            {foraDoLimite && (
                              <TriangleAlert className="mr-1 inline size-3.5" aria-hidden />
                            )}
                            {formatarGanho(peso - ultima.pesoVivoKg)} em {dias} d ·{' '}
                            {formatarGmd(gmd)}
                          </span>
                        ) : (
                          <span className="text-texto-suave">—</span>
                        )}
                      </Td>
                      <Td className="min-w-64">
                        {erros.length > 0 && (
                          <ul
                            className="text-xs text-perigo"
                            data-testid={`erros-${a.identificacao}`}
                          >
                            {erros.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        )}
                        {erros.length === 0 && item && item.alertas.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <ul
                              className="text-xs text-alerta"
                              data-testid={`alertas-${a.identificacao}`}
                            >
                              {item.alertas.map((al) => (
                                <li key={al.tipo} title={descreverAlerta(al, parametros)}>
                                  {rotulos.alertaPesagem[al.tipo]}
                                  {al.pesoSugeridoKg !== null &&
                                    ` (quis dizer ${formatarPeso(al.pesoSugeridoKg)}?)`}
                                </li>
                              ))}
                            </ul>
                            <Entrada
                              className="h-8 text-xs"
                              placeholder="Justificativa, se o valor estiver certo"
                              aria-label={`Justificativa de ${a.identificacao}`}
                              value={v.justificativa}
                              onChange={(e) => definir(a.id, 'justificativa', e.target.value)}
                            />
                          </div>
                        )}
                        {erros.length === 0 && item && item.alertas.length === 0 && (
                          <span className="text-xs text-sucesso">OK</span>
                        )}
                      </Td>
                    </Linha>
                  );
                })}
              </tbody>
            </Tabela>
          </div>
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-borda bg-fundo/95 py-3 backdrop-blur">
            <Botao
              variante="fantasma"
              disabled={preenchidos.length === 0}
              onClick={() => {
                setValores({});
                setResultado(null);
                setErrosLocais({});
                setErroGeral(null);
              }}
            >
              <Eraser className="size-4" aria-hidden />
              Limpar
            </Botao>
            <Botao
              variante="secundario"
              disabled={preenchidos.length === 0}
              carregando={registrar.isPending && !registrar.variables?.confirmar}
              onClick={() => enviar(false)}
            >
              <ListChecks className="size-4" aria-hidden />
              Conferir
            </Botao>
            <Botao
              disabled={preenchidos.length === 0}
              carregando={registrar.isPending && registrar.variables?.confirmar === true}
              onClick={() => enviar(true)}
            >
              <Save className="size-4" aria-hidden />
              {preenchidos.length === 0
                ? 'Salvar pesagens'
                : `Salvar ${preenchidos.length} ${preenchidos.length === 1 ? 'pesagem' : 'pesagens'}`}
            </Botao>
          </div>
        </section>
      )}
    </div>
  );
}

export function PaginaPesagemLote() {
  return <ComPropriedade>{(p) => <Conteudo propriedade={p} />}</ComPropriedade>;
}
