import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import type { ClasseAgregacao, SentidoCenario, TipoPerfil } from '@pecuaria/domain';
import type { ExecucaoSelecao, RegraSelecaoApi } from '@pecuaria/shared-types';
import { mensagemDeErro } from '../../lib/api';
import {
  useAcaoAlimentos,
  useAlimentos,
  useRegrasSelecao,
  useSelecao,
} from '../../lib/consultas-alimentos';
import { formatarDataHora } from '../../lib/formatar';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Cartao, CartaoConteudo, CartaoTitulo } from '../../components/ui/cartao';
import { Campo, Entrada, Selecao } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import {
  avisosAlimentos,
  formasObtencao,
  niveisCorrespondencia,
  situacoesNutriente,
  statusRegistro,
  unidadesNutricionais,
  basesNutricionais,
} from '../../textos-alimentos';
import { ModalCampos } from './componentes-alimentos';

/** Número calculado (média, mediana) na tela: até 2 casas; o perfil guarda o valor inteiro. */
const numero = (x: number | null) =>
  x === null ? '—' : x.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const descreverClasse = (k: ClasseAgregacao) =>
  `${unidadesNutricionais[k.unidade]} (${basesNutricionais[k.base]}) · ${formasObtencao[k.formaObtencao]}${
    k.metodo ? ` · ${k.metodo}` : ' · método não informado'
  }`;

type Gravando = {
  tipo: TipoPerfil;
  registroId: string | null;
  nutrienteId: string | null;
  sentido: SentidoCenario | null;
  descricao: string;
};

function CartaoRegra({ r }: { r: RegraSelecaoApi }) {
  const [aprovando, setAprovando] = useState(false);
  const aprovar = useAcaoAlimentos('selecao:aprovarRegra');
  return (
    <Cartao data-testid="cartao-regra">
      <CartaoConteudo className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CartaoTitulo>
            Regra {r.regra.codigo}, versão {r.regra.versao}
          </CartaoTitulo>
          {r.aprovacao ? (
            <Selo tom="sucesso">Aprovada</Selo>
          ) : (
            <Selo tom="alerta">Não aprovada</Selo>
          )}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer">Decisões aplicadas pela regra</summary>
          <ul className="mt-2 list-disc pl-5 text-texto-suave">
            {r.regra.decisoes.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
        {r.aprovacao ? (
          <p className="text-sm text-texto-suave">
            Aprovada por {r.aprovacao.aprovadoPor} em {formatarDataHora(r.aprovacao.aprovadoEm)}.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Sem aprovação, a seleção pode ser consultada, mas nenhum perfil é gravado.
            </p>
            <div>
              <Botao onClick={() => setAprovando(true)}>Aprovar regra</Botao>
            </div>
          </div>
        )}
      </CartaoConteudo>
      {aprovando && (
        <ModalCampos
          titulo="Aprovar regra de seleção"
          descricao={`Aprova a versão ${r.regra.versao} como está, com as decisões listadas. Mudar a regra exige versão nova, que precisa de nova aprovação. A aprovação não muda depois.`}
          campos={[
            { nome: 'responsavel', rotulo: 'Nome de quem aprova' },
            { nome: 'observacao', rotulo: 'Observação', multilinha: true, obrigatorio: false },
          ]}
          textoEnviar="Aprovar"
          largura="lg"
          enviando={aprovar.isPending}
          aoFechar={() => setAprovando(false)}
          aoConfirmar={(c) =>
            aprovar.mutateAsync({
              codigo: r.regra.codigo,
              versao: r.regra.versao,
              responsavel: c['responsavel']!,
              observacao: c['observacao']?.trim() ? c['observacao'] : null,
            })
          }
        />
      )}
    </Cartao>
  );
}

function Resultado({
  e,
  escolhas,
  aoEscolher,
  aoGravar,
}: {
  e: ExecucaoSelecao;
  escolhas: Record<string, string>;
  aoEscolher: (origemId: string, registroId: string) => void;
  aoGravar: (g: Gravando) => void;
}) {
  const res = e.resultado;
  const aprovada = Boolean(e.regra.aprovacao);
  const ordem = new Map(res.origens.map((o, i) => [o.id, i + 1]));
  const registro = (id: string) => res.candidatos.find((c) => c.registro.id === id)!.registro;
  const rotuloRegistro = (id: string) => {
    const r = registro(id);
    return `${r.fonteDescricao}${r.referenciaLocal ? `, ${r.referenciaLocal}` : ''}`;
  };
  const algumAgregado = res.nutrientes.some((n) => n.situacao === 'agregado');
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-label="Candidatos">
        <h3 className="font-semibold">Candidatos ({res.candidatos.length})</h3>
        <Tabela data-testid="tabela-candidatos">
          <Cabeca>
            <Th>Nível</Th>
            <Th>Registro</Th>
            <Th>Idade</Th>
            <Th>Origem</Th>
            <Th>Uso</Th>
            <Th>Ações</Th>
          </Cabeca>
          <tbody>
            {res.candidatos.map((c) => (
              <Linha key={c.registro.id}>
                <Td>
                  {c.classificacao.nivel ? (
                    <Selo tom={c.classificacao.nivel === 'especifico' ? 'sucesso' : 'alerta'}>
                      {niveisCorrespondencia[c.classificacao.nivel]}
                    </Selo>
                  ) : c.classificacao.pendenteValidacaoIdade ? (
                    <Selo tom="alerta">Pendente de validação</Selo>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td className="min-w-64 text-sm">
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/alimentos/registros/${c.registro.id}`}
                  >
                    {c.registro.alimento.nome}
                  </Link>
                  <span className="block text-xs text-texto-suave">
                    {rotuloRegistro(c.registro.id)} · {statusRegistro[c.registro.status]}
                  </span>
                  {[...c.classificacao.diferencas, ...c.classificacao.avisos].map((t) => (
                    <span key={t} className="block text-xs text-alerta">
                      {t}
                    </span>
                  ))}
                </Td>
                <Td>
                  {c.registro.idadeCorteDias !== null ? `${c.registro.idadeCorteDias} dias` : '—'}
                </Td>
                <Td>Origem {ordem.get(c.origemId)}</Td>
                <Td className="min-w-56 text-xs">
                  {c.classificacao.exclusao ? (
                    <span className="text-perigo">{c.classificacao.exclusao}</span>
                  ) : (
                    <>
                      <span className="block">Referência individual: sim.</span>
                      <span className="block text-texto-suave">
                        Agregação: {c.foraDaAgregacao ?? 'entra, se houver origens suficientes.'}
                      </span>
                    </>
                  )}
                </Td>
                <Td>
                  {!c.classificacao.exclusao && aprovada && (
                    <Botao
                      tamanho="pequeno"
                      variante="secundario"
                      onClick={() =>
                        aoGravar({
                          tipo: 'referencia_individual',
                          registroId: c.registro.id,
                          nutrienteId: null,
                          sentido: null,
                          descricao: `Referência individual: ${rotuloRegistro(c.registro.id)}. Evidência limitada (uma origem), sem média nem cenários.`,
                        })
                      }
                    >
                      Usar como referência
                    </Botao>
                  )}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      </section>

      <section className="flex flex-col gap-3" aria-label="Origens independentes">
        <h3 className="font-semibold">Origens independentes</h3>
        <p className="text-sm" data-testid="contagem-origens">
          Encontradas: {res.origens.length}. Elegíveis para agregação: {res.origensElegiveis.length}{' '}
          (mínimo {res.regra.nMinimoOrigens}).
        </p>
        <ul className="flex flex-col gap-2 text-sm" data-testid="origens">
          {res.origens.map((o) => (
            <li key={o.id} className="rounded-lg border border-borda p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">Origem {ordem.get(o.id)}</span>:{' '}
                  {o.registros.length} {o.registros.length === 1 ? 'registro' : 'registros'} ·{' '}
                  {o.fontes.join('; ')}
                </span>
                {res.origensElegiveis.includes(o.id) ? (
                  <Selo tom="sucesso">Elegível para agregação</Selo>
                ) : (
                  <Selo>Só encontrada</Selo>
                )}
              </div>
              {o.motivos.map((m) => (
                <span key={m} className="block text-xs text-texto-suave">
                  {m}
                </span>
              ))}
            </li>
          ))}
        </ul>
        {res.origensComTratamentos.map((o) => (
          <Campo
            key={o.origemId}
            rotulo={`Tratamento que representa a origem ${ordem.get(o.origemId)} na agregação`}
            ajuda="Cada tratamento continua separado; sem escolha, a origem fica fora da agregação."
          >
            {(p) => (
              <Selecao
                {...p}
                value={escolhas[o.origemId] ?? ''}
                onChange={(ev) => aoEscolher(o.origemId, ev.target.value)}
              >
                <option value="">Nenhum (origem fora da agregação)</option>
                {o.registros.map((id) => (
                  <option key={id} value={id}>
                    {rotuloRegistro(id)}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        ))}
      </section>

      <section className="flex flex-col gap-3" aria-label="Agregação por nutriente">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Agregação por nutriente</h3>
          {aprovada && algumAgregado && (
            <Botao
              onClick={() =>
                aoGravar({
                  tipo: 'agregado_central',
                  registroId: null,
                  nutrienteId: null,
                  sentido: null,
                  descricao:
                    'Perfil central: média simples por origem independente, só nos nutrientes agregados; os demais ficam ausentes. Não é perfil observado de um alimento real.',
                })
              }
            >
              Gravar perfil central
            </Botao>
          )}
        </div>
        <p className="text-sm text-texto-suave">
          Mínimo de {res.regra.nMinimoOrigens} origens independentes na mesma classe (unidade, base,
          tipo de valor, forma de obtenção e método). Extremos são valores observados.
        </p>
        {res.nutrientes.length === 0 ? (
          <EstadoVazio icone={Search} titulo="Nenhum valor elegível" />
        ) : (
          <Tabela data-testid="tabela-agregacao">
            <Cabeca>
              <Th>Nutriente</Th>
              <Th>Situação</Th>
              <Th>Classe</Th>
              <Th>Origens</Th>
              <Th>Cobertura</Th>
              <Th>Média</Th>
              <Th>Mediana</Th>
              <Th>Mín. · máx.</Th>
            </Cabeca>
            <tbody>
              {res.nutrientes.flatMap((n) =>
                (n.classes.length ? n.classes : [null]).map((k, i) => (
                  <Linha key={`${n.nutriente.id}-${k?.chave ?? 'sem'}`}>
                    <Td>
                      {i === 0 && (
                        <>
                          <span className="font-medium">{n.nutriente.codigo}</span>
                          {n.exclusoes.length > 0 && (
                            <details className="text-xs text-texto-suave">
                              <summary className="cursor-pointer">
                                {n.exclusoes.length} fora da agregação
                              </summary>
                              <ul>
                                {n.exclusoes.map((x) => (
                                  <li key={`${x.registroId}-${x.valorId}`}>
                                    {rotuloRegistro(x.registroId)}: {x.motivo}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      )}
                    </Td>
                    <Td className="text-xs">{i === 0 && situacoesNutriente[n.situacao]}</Td>
                    <Td className="text-xs">{k ? descreverClasse(k) : '—'}</Td>
                    <Td>{k?.nOrigens ?? 0}</Td>
                    <Td className="text-xs">
                      {i === 0 && `${n.cobertura.comValor} de ${n.cobertura.total}`}
                    </Td>
                    <Td>{numero(k?.media ?? null)}</Td>
                    <Td>{numero(k?.mediana ?? null)}</Td>
                    <Td className="whitespace-nowrap">
                      {k && k.minimo !== null ? `${numero(k.minimo)} · ${numero(k.maximo)}` : '—'}
                    </Td>
                  </Linha>
                )),
              )}
            </tbody>
          </Tabela>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label="Cenários por perfil real">
        <h3 className="font-semibold">Cenários por perfil real</h3>
        {res.cenarios.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Cenários indisponíveis: nenhum nutriente com direção conservadora definida tem origens
            independentes suficientes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm" data-testid="cenarios">
            {res.cenarios.map((c) => (
              <li
                key={`${c.nutriente.id}-${c.sentido}`}
                className="rounded-lg border border-borda p-3"
              >
                <span className="font-medium">
                  {c.sentido === 'conservador' ? 'Conservador' : 'Favorável'} para{' '}
                  {c.nutriente.codigo}
                </span>{' '}
                ({c.nutriente.codigo} = {numero(c.valor)}). Perfil inteiro de um registro real; vale
                para {c.nutriente.codigo}, não para a qualidade global.
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.registros.map((id) => (
                    <Botao
                      key={id}
                      tamanho="pequeno"
                      variante="secundario"
                      disabled={!aprovada}
                      onClick={() =>
                        aoGravar({
                          tipo: 'cenario_real',
                          registroId: id,
                          nutrienteId: c.nutriente.id,
                          sentido: c.sentido,
                          descricao: `Cenário ${c.sentido === 'conservador' ? 'conservador' : 'favorável'} para ${c.nutriente.codigo}: todos os nutrientes de ${rotuloRegistro(id)}.`,
                        })
                      }
                    >
                      Gravar perfil de {rotuloRegistro(id)}
                    </Botao>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Seleção de composição (Fase 5D): candidatos, origens, agregação e cenários; perfis só por ação. */
export function PaginaSelecao() {
  const navegar = useNavigate();
  const alimentos = useAlimentos({
    busca: '',
    formaConservacao: null,
    classe: null,
    incluirExcluidos: false,
  });
  const regras = useRegrasSelecao();
  const [alimentoId, setAlimentoId] = useState('');
  const [idade, setIdade] = useState('');
  const [busca, setBusca] = useState<{ alimentoId: string; idadeCorteDias: number | null } | null>(
    null,
  );
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState<Gravando | null>(null);
  const gravar = useAcaoAlimentos('perfil:gravar');
  const entrada = busca
    ? {
        ...busca,
        escolhas: Object.entries(escolhas)
          .filter(([, r]) => r)
          .map(([origemId, registroId]) => ({ origemId, registroId })),
      }
    : null;
  const selecao = useSelecao(entrada);
  // Só a versão mais nova é usada e aprovada; as anteriores ficam para histórico.
  const vigente = [...(regras.data ?? [])].sort((a, b) => b.regra.versao - a.regra.versao)[0];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Seleção"
        descricao="Candidatos de composição para um alimento, com nível de correspondência, origens independentes, agregação por nutriente e cenários por perfil real."
      />
      <Alerta tom="info" titulo={avisosAlimentos.selecao} />
      {regras.isError && <Alerta tom="perigo" titulo={mensagemDeErro(regras.error)} />}
      {vigente && <CartaoRegra r={vigente} />}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          const n = idade.trim() ? Number(idade) : null;
          if (!alimentoId) return setErro('Escolha o alimento.');
          if (n !== null && !(Number.isInteger(n) && n >= 1))
            return setErro('Idade de corte: número inteiro de dias, ou vazio.');
          setErro(null);
          setEscolhas({});
          setBusca({ alimentoId, idadeCorteDias: n });
        }}
      >
        <Campo rotulo="Alimento" className="min-w-72">
          {(p) => (
            <Selecao {...p} value={alimentoId} onChange={(ev) => setAlimentoId(ev.target.value)}>
              <option value="">Escolha</option>
              {(alimentos.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Idade de corte (dias)" ajuda="Vazio quando não se aplica.">
          {(p) => (
            <Entrada
              {...p}
              inputMode="numeric"
              value={idade}
              onChange={(ev) => setIdade(ev.target.value)}
            />
          )}
        </Campo>
        <Botao type="submit">Selecionar</Botao>
      </form>
      {erro && <Alerta tom="perigo" titulo={erro} />}
      {selecao.isError && <Alerta tom="perigo" titulo={mensagemDeErro(selecao.error)} />}
      {selecao.data && (
        <Resultado
          e={selecao.data}
          escolhas={escolhas}
          aoEscolher={(o, r) => setEscolhas((x) => ({ ...x, [o]: r }))}
          aoGravar={setGravando}
        />
      )}
      {gravando && entrada && (
        <ModalCampos
          titulo="Gravar perfil de composição"
          descricao={`${gravando.descricao} O perfil é imutável e não altera os registros.`}
          campos={[
            { nome: 'nome', rotulo: 'Nome do perfil' },
            { nome: 'responsavel', rotulo: 'Nome de quem grava' },
          ]}
          textoEnviar="Gravar perfil"
          largura="lg"
          enviando={gravar.isPending}
          aoFechar={() => setGravando(null)}
          aoConfirmar={async (c) => {
            const p = await gravar.mutateAsync({
              ...entrada,
              tipo: gravando.tipo,
              registroId: gravando.registroId,
              nutrienteId: gravando.nutrienteId,
              sentido: gravando.sentido,
              nome: c['nome']!,
              responsavel: c['responsavel']!,
            });
            void navegar(`/alimentos/perfis/${p.perfil.id}`);
          }}
        />
      )}
    </div>
  );
}
