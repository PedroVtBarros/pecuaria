import { useState } from 'react';
import { FileDown } from 'lucide-react';
import {
  TIPOS_RELATORIO,
  type CelulaRelatorio,
  type ColunaRelatorio,
  type Propriedade,
  type Relatorio,
  type TipoRelatorio,
} from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Selecao } from '../../components/ui/campos';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { chamarApi, mensagemDeErro } from '../../lib/api';
import { useAnimais, useLotes } from '../../lib/consultas-rebanho';
import { formatarData } from '../../lib/formatar-rebanho';
import { moeda } from '../../textos-financeiro';
import { textoDocumentos, textoExportacao, tiposRelatorio } from '../../textos-relatorios';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { SeletorPeriodo, mesCorrente, type Periodo } from './seletor-periodo';
import { ValorApurado } from './valor-apurado';

const LIMITE_PREVIA = 20;

function Valor({
  coluna,
  valor,
}: {
  coluna: Pick<ColunaRelatorio, 'tipo'>;
  valor: CelulaRelatorio;
}) {
  if (coluna.tipo === 'apuracao')
    return valor && typeof valor === 'object' ? (
      <ValorApurado a={valor.apuracao} />
    ) : (
      <>Custo desconhecido</>
    );
  if (valor === null) return <>{coluna.tipo === 'dinheiro' ? 'Sem dado' : '—'}</>;
  if (typeof valor === 'object') return <ValorApurado a={valor.apuracao} />;
  if (coluna.tipo === 'dinheiro' && typeof valor === 'number') return <>{moeda(valor)}</>;
  if (coluna.tipo === 'quantidade' && typeof valor === 'number')
    return <>{valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</>;
  if (coluna.tipo === 'data' && typeof valor === 'string') return <>{formatarData(valor)}</>;
  return <>{String(valor)}</>;
}

/** Pré-visualização do mesmo modelo que vira CSV e PDF. */
export function PreviaRelatorio({ relatorio }: { relatorio: Relatorio }) {
  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="previa-relatorio">
      <div>
        <h3 className="text-lg font-semibold">
          {relatorio.titulo}{' '}
          <span className="text-sm font-normal text-texto-suave">({relatorio.visao})</span>
        </h3>
        <p className="text-sm text-texto-suave">
          {relatorio.propriedade} · {relatorio.periodo}
        </p>
      </div>
      {relatorio.avisos.map((a) => (
        <Alerta key={a} tom="alerta">
          {a}
        </Alerta>
      ))}
      {relatorio.secoes.map((s) => (
        <div key={s.titulo} className="flex min-w-0 flex-col gap-2">
          <h4 className="font-medium">{s.titulo}</h4>
          {s.descricao && <p className="text-xs text-texto-suave">{s.descricao}</p>}
          {s.indicadores && s.indicadores.length > 0 && (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {s.indicadores.map((i) => (
                <div key={i.rotulo}>
                  <dt className="text-xs text-texto-suave">{i.rotulo}</dt>
                  <dd className="font-medium">
                    <Valor coluna={i} valor={i.valor} />
                    {i.observacao && (
                      <span className="ml-1 text-xs text-texto-suave">({i.observacao})</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {s.colunas &&
            s.linhas &&
            (s.linhas.length === 0 ? (
              <p className="text-sm text-texto-suave">{s.vazio ?? 'Nenhum registro.'}</p>
            ) : (
              <>
                <Tabela>
                  <Cabeca>
                    {s.colunas.map((c) => (
                      <Th
                        key={c.rotulo}
                        className={
                          c.tipo === 'texto' || c.tipo === 'data' ? undefined : 'text-right'
                        }
                      >
                        {c.rotulo}
                      </Th>
                    ))}
                  </Cabeca>
                  <tbody>
                    {s.linhas.slice(0, LIMITE_PREVIA).map((l, k) => (
                      <Linha key={k}>
                        {s.colunas!.map((c, j) => (
                          <Td
                            key={c.rotulo}
                            className={
                              c.tipo === 'texto' || c.tipo === 'data'
                                ? undefined
                                : 'text-right whitespace-nowrap'
                            }
                          >
                            <Valor coluna={c} valor={l[j] ?? null} />
                          </Td>
                        ))}
                      </Linha>
                    ))}
                  </tbody>
                </Tabela>
                {s.linhas.length > LIMITE_PREVIA && (
                  <p className="text-xs text-texto-suave">
                    Mostrando {LIMITE_PREVIA} de {s.linhas.length} linhas; o arquivo exportado traz
                    todas.
                  </p>
                )}
              </>
            ))}
        </div>
      ))}
    </section>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [tipo, setTipo] = useState<TipoRelatorio>('resultado');
  const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());
  const [todoHistorico, setTodoHistorico] = useState(true);
  const [loteId, setLoteId] = useState('');
  const [animalId, setAnimalId] = useState('');
  const [documentos, setDocumentos] = useState(false);
  const [previa, setPrevia] = useState<Relatorio | null>(null);
  const [mensagem, setMensagem] = useState<{
    tom: 'sucesso' | 'perigo' | 'info';
    texto: string;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const lotes = useLotes(propriedade.id, true);
  const animais = useAnimais(propriedade.id, { status: 'todos', tamanhoPagina: 500 });
  const def = tiposRelatorio[tipo];
  const usaPeriodo = def.periodo === 'obrigatorio' || !todoHistorico;
  const filtros = {
    propriedadeId: propriedade.id,
    dataInicial: usaPeriodo ? periodo.inicio : null,
    dataFinal: usaPeriodo ? periodo.fim : null,
    loteId: (tipo === 'lote' || tipo === 'custos') && loteId ? loteId : null,
    animalId: tipo === 'animal' && animalId ? animalId : null,
    incluirDocumentos: tipo === 'lancamentos' && documentos,
  };
  const faltando =
    (tipo === 'lote' && !loteId ? 'Escolha o lote.' : null) ??
    (tipo === 'animal' && !animalId ? 'Escolha o animal.' : null);
  const executar = async (acao: () => Promise<void>) => {
    if (faltando) {
      setMensagem({ tom: 'perigo', texto: faltando });
      return;
    }
    setOcupado(true);
    setMensagem(null);
    try {
      await acao();
    } catch (e) {
      setMensagem({ tom: 'perigo', texto: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
  };
  const exportar = (formato: 'csv' | 'pdf') =>
    executar(async () => {
      const r = await chamarApi('relatorio:exportar', { tipo, formato, filtros });
      setMensagem(
        r.cancelado
          ? { tom: 'info', texto: 'Exportação cancelada; nenhum arquivo foi salvo.' }
          : { tom: 'sucesso', texto: `Relatório salvo em ${r.dados.caminho}.` },
      );
    });
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Relatórios e exportação"
        descricao="Relatórios gerenciais em CSV e PDF, com os mesmos números das telas, e a conferência financeira."
      />
      <Alerta tom="info">{textoExportacao}</Alerta>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Relatório" ajuda={def.descricao}>
          {(p) => (
            <Selecao
              {...p}
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoRelatorio);
                setPrevia(null);
                setMensagem(null);
              }}
            >
              {TIPOS_RELATORIO.map((t) => (
                <option key={t} value={t}>
                  {tiposRelatorio[t].titulo}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        {(tipo === 'lote' || tipo === 'custos') && (
          <Campo rotulo={tipo === 'lote' ? 'Lote' : 'Lote atual (opcional)'}>
            {(p) => (
              <Selecao {...p} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
                <option value="">{tipo === 'lote' ? 'Escolher…' : 'Todos'}</option>
                {(lotes.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        )}
        {tipo === 'animal' && (
          <Campo rotulo="Animal">
            {(p) => (
              <Selecao {...p} value={animalId} onChange={(e) => setAnimalId(e.target.value)}>
                <option value="">Escolher…</option>
                {(animais.data?.itens ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.identificacao}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
        )}
      </div>
      {def.periodo === 'opcional' && (
        <CaixaMarcar
          rotulo="Todo o histórico (sem limitar o período)"
          marcado={todoHistorico}
          aoMudar={setTodoHistorico}
        />
      )}
      {usaPeriodo && <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />}
      {tipo === 'lancamentos' && (
        <CaixaMarcar rotulo={textoDocumentos} marcado={documentos} aoMudar={setDocumentos} />
      )}
      <div className="flex flex-wrap gap-2">
        <Botao
          variante="secundario"
          carregando={ocupado}
          onClick={() =>
            void executar(async () =>
              setPrevia(await chamarApi('relatorio:montar', { tipo, filtros })),
            )
          }
        >
          Pré-visualizar
        </Botao>
        <Botao carregando={ocupado} onClick={() => void exportar('csv')}>
          <FileDown className="size-4" aria-hidden /> Exportar CSV
        </Botao>
        <Botao carregando={ocupado} onClick={() => void exportar('pdf')}>
          <FileDown className="size-4" aria-hidden /> Exportar PDF
        </Botao>
      </div>
      {mensagem && <Alerta tom={mensagem.tom} titulo={mensagem.texto} />}
      {previa && <PreviaRelatorio relatorio={previa} />}
    </div>
  );
}

export function PaginaRelatorios() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
