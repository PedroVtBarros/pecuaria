import { useState } from 'react';
import { Link } from 'react-router';
import { Tags } from 'lucide-react';
import type { ClassificacaoDaCategoria, Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { chamarApi, mensagemDeErro } from '../../lib/api';
import {
  useAcaoFinanceiro,
  useLancamentos,
  useResumoClassificacao,
} from '../../lib/consultas-financeiro';
import { formatarData } from '../../lib/formatar-rebanho';
import { useQuery } from '@tanstack/react-query';
import { avisoGeral, comportamentos, moeda } from '../../textos-financeiro';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';

const TAMANHO_LISTA = 20;

/** Prévia e confirmação da aplicação do padrão da categoria aos lançamentos não classificados. */
function ModalAplicar({
  propriedadeId,
  categoria,
  aoFechar,
}: {
  propriedadeId: string;
  categoria: ClassificacaoDaCategoria;
  aoFechar: () => void;
}) {
  const previa = useQuery({
    queryKey: ['financeiro', 'classificacao-previa', propriedadeId, categoria.categoriaId],
    queryFn: () =>
      chamarApi('classificacao:previa', { propriedadeId, categoriaId: categoria.categoriaId }),
  });
  const aplicar = useAcaoFinanceiro('classificacao:aplicarCategoria');
  const [erros, setErros] = useState<string[]>([]);
  const p = previa.data;
  const padrao =
    categoria.padrao === 'fixo' || categoria.padrao === 'variavel' ? categoria.padrao : null;
  return (
    <Modal
      aberto
      titulo={`Aplicar "${comportamentos[categoria.padrao]}" aos não classificados`}
      descricao={`Categoria: ${categoria.categoriaNome}. Só lançamentos ainda não classificados são alterados; os já classificados e as outras categorias não são tocados. Cada alteração fica na trilha.`}
      aoFechar={aoFechar}
      textoEnviar="Aplicar classificação"
      enviando={aplicar.isPending}
      erros={erros}
      aoEnviar={() => {
        if (!p || !padrao || p.quantidade === 0) return;
        aplicar.mutate(
          {
            propriedadeId,
            categoriaId: categoria.categoriaId,
            comportamento: padrao,
            quantidadeEsperada: p.quantidade,
            motivo: null,
          },
          { onSuccess: aoFechar, onError: (e) => setErros([mensagemDeErro(e)]) },
        );
      }}
    >
      {!p ? (
        <p className="text-sm text-texto-suave">Carregando a prévia…</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm" data-testid="previa-classificacao">
          <p>
            <strong>{p.quantidade}</strong> lançamento(s), somando{' '}
            <strong>{moeda(p.valorCentavos)}</strong>, passarão de "Não classificado" para{' '}
            <strong>{comportamentos[p.padrao]}</strong>.
          </p>
          {p.amostra.length > 0 && (
            <ul className="list-disc pl-5 text-texto-suave">
              {p.amostra.map((l) => (
                <li key={l.id}>
                  {formatarData(l.dataCompetencia)} · {l.descricao} · {moeda(l.valorCentavos)}
                </li>
              ))}
              {p.quantidade > p.amostra.length && (
                <li>e mais {p.quantidade - p.amostra.length}…</li>
              )}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const resumo = useResumoClassificacao({ propriedadeId: propriedade.id });
  const [aplicando, setAplicando] = useState<ClassificacaoDaCategoria | null>(null);
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const lista = useLancamentos({
    propriedadeId: propriedade.id,
    natureza: 'despesa',
    tratamento: 'resultado',
    comportamentoCusto: 'nao_classificado',
    incluirCancelados: false,
    pagina,
    tamanhoPagina: TAMANHO_LISTA,
  });
  const definir = useAcaoFinanceiro('classificacao:definirLancamento');
  const r = resumo.data;
  const cob = r?.cobertura;
  const totalLista = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(totalLista / TAMANHO_LISTA));
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Classificação de despesas"
        descricao="Fixa ou variável. Indicadores que dependem disso (margem bruta, ponto de equilíbrio) mostram a cobertura e ficam marcados como parciais enquanto houver despesa sem classificação."
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      <Alerta tom="info">
        Aqui entram as despesas lançadas no resultado. Compras para estoque e aquisição de animais
        são classificadas na própria origem (item de estoque, aquisição), nas próximas entregas. O
        padrão da categoria vale só para lançamentos novos; mudar o padrão não reescreve os antigos.
      </Alerta>
      {resumo.isError && <Alerta tom="perigo" titulo={mensagemDeErro(resumo.error)} />}
      {cob && (
        <GradeIndicadores testId="cobertura-classificacao">
          <Indicador
            rotulo="Despesas do resultado"
            valor={moeda(cob.totalCentavos)}
            dica={`${cob.quantidadeTotal} lançamento(s)`}
          />
          <Indicador rotulo="Fixas" valor={moeda(cob.fixoCentavos)} />
          <Indicador rotulo="Variáveis" valor={moeda(cob.variavelCentavos)} />
          <Indicador
            rotulo="Sem classificação"
            valor={moeda(cob.naoClassificadoCentavos)}
            destaque={cob.naoClassificadoCentavos > 0 ? 'alerta' : undefined}
            dica={`${cob.quantidadeNaoClassificada} lançamento(s)`}
          />
        </GradeIndicadores>
      )}
      {r && r.porCategoria.length > 0 && (
        <Tabela data-testid="tabela-classificacao-categorias">
          <Cabeca>
            <Th>Categoria</Th>
            <Th>Padrão para novos lançamentos</Th>
            <Th className="text-right">Fixas</Th>
            <Th className="text-right">Variáveis</Th>
            <Th className="text-right">Sem classificação</Th>
            <Th>
              <span className="sr-only">Ação</span>
            </Th>
          </Cabeca>
          <tbody>
            {r.porCategoria.map((c) => (
              <Linha key={c.categoriaId}>
                <Td>{c.categoriaNome}</Td>
                <Td>
                  {comportamentos[c.padrao]}
                  {c.padrao === 'nao_classificado' && (
                    <div className="text-xs text-texto-suave">
                      Defina em{' '}
                      <Link className="text-marca hover:underline" to="/financeiro/categorias">
                        Categorias
                      </Link>
                    </div>
                  )}
                </Td>
                <Td className="text-right whitespace-nowrap">
                  {moeda(c.fixo.valorCentavos)}{' '}
                  <span className="text-xs text-texto-suave">({c.fixo.quantidade})</span>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  {moeda(c.variavel.valorCentavos)}{' '}
                  <span className="text-xs text-texto-suave">({c.variavel.quantidade})</span>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  {moeda(c.naoClassificado.valorCentavos)}{' '}
                  <span className="text-xs text-texto-suave">({c.naoClassificado.quantidade})</span>
                </Td>
                <Td>
                  {c.naoClassificado.quantidade > 0 && c.padrao !== 'nao_classificado' && (
                    <Botao variante="secundario" tamanho="pequeno" onClick={() => setAplicando(c)}>
                      Aplicar o padrão
                    </Botao>
                  )}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      <section className="flex min-w-0 flex-col gap-3">
        <h3 className="text-base font-semibold">Despesas sem classificação</h3>
        {erro && <Alerta tom="perigo" titulo={erro} />}
        {totalLista === 0 ? (
          <EstadoVazio
            icone={Tags}
            titulo="Nada sem classificação"
            descricao="Todas as despesas do resultado estão classificadas em fixas ou variáveis."
          />
        ) : (
          <Tabela data-testid="tabela-sem-classificacao">
            <Cabeca>
              <Th>Competência</Th>
              <Th>Descrição</Th>
              <Th>Categoria</Th>
              <Th className="text-right">Valor da operação</Th>
              <Th>Classificar como</Th>
            </Cabeca>
            <tbody>
              {(lista.data?.itens ?? []).map((l) => (
                <Linha key={l.id}>
                  <Td className="whitespace-nowrap">{formatarData(l.dataCompetencia)}</Td>
                  <Td>
                    <Link
                      className="font-medium text-marca hover:underline"
                      to={`/financeiro/lancamentos/${l.id}`}
                    >
                      {l.descricao}
                    </Link>
                  </Td>
                  <Td>{l.categoria.nome}</Td>
                  <Td className="text-right whitespace-nowrap">{moeda(l.valorOperacaoCentavos)}</Td>
                  <Td>
                    <Campo rotulo="">
                      {(p) => (
                        <Selecao
                          {...p}
                          aria-label={`Classificar ${l.descricao}`}
                          value=""
                          disabled={definir.isPending}
                          onChange={(e) => {
                            const valor = e.target.value;
                            if (valor !== 'fixo' && valor !== 'variavel') return;
                            setErro(null);
                            definir.mutate(
                              { id: l.id, comportamento: valor, motivo: null },
                              { onError: (x) => setErro(mensagemDeErro(x)) },
                            );
                          }}
                        >
                          <option value="">Escolher…</option>
                          <option value="fixo">Fixo</option>
                          <option value="variavel">Variável</option>
                        </Selecao>
                      )}
                    </Campo>
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
        {totalLista > TAMANHO_LISTA && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-texto-suave">
              {totalLista} lançamentos · página {pagina} de {paginas}
            </span>
            <div className="flex gap-2">
              <Botao
                variante="secundario"
                tamanho="pequeno"
                disabled={pagina <= 1}
                onClick={() => setPagina(pagina - 1)}
              >
                Anterior
              </Botao>
              <Botao
                variante="secundario"
                tamanho="pequeno"
                disabled={pagina >= paginas}
                onClick={() => setPagina(pagina + 1)}
              >
                Próxima
              </Botao>
            </div>
          </div>
        )}
      </section>
      {aplicando && (
        <ModalAplicar
          propriedadeId={propriedade.id}
          categoria={aplicando}
          aoFechar={() => setAplicando(null)}
        />
      )}
    </div>
  );
}

export function PaginaClassificacoes() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
