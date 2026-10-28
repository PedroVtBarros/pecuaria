import { useState } from 'react';
import { Link } from 'react-router';
import { Wheat } from 'lucide-react';
import type { Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Selecao } from '../../components/ui/campos';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoFinanceiro } from '../../lib/consultas-financeiro';
import { useConsumos, useResumoConsumos } from '../../lib/consultas-insumos';
import { formatarData } from '../../lib/formatar-rebanho';
import { avisoGeral, comportamentos, moeda } from '../../textos-financeiro';
import { quantidadeEstoque } from '../../textos-estoque';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';
import { SeletorPeriodo, mesCorrente, type Periodo } from './seletor-periodo';
import { ValorApurado, estadosApuracao } from './valor-apurado';

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());
  const [destino, setDestino] = useState('');
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const filtros = {
    propriedadeId: propriedade.id,
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
    ...(destino ? { destino: destino as 'propriedade' | 'lote' | 'animal' } : {}),
  };
  const resumo = useResumoConsumos(filtros);
  const lista = useConsumos({ ...filtros, pagina, tamanhoPagina: 30 });
  const classificar = useAcaoFinanceiro('classificacaoOrigem:definir');
  const r = resumo.data;
  const itens = lista.data?.itens ?? [];
  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / 30));
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Custos de consumo"
        descricao="Custo apropriado dos insumos consumidos, pelo custo médio do estoque na data. Consumo sem custo conhecido aparece como desconhecido e deixa o total parcial: nunca vira zero."
      />
      <Alerta tom="info">{avisoGeral}</Alerta>
      <SeletorPeriodo
        periodo={periodo}
        aoMudar={(p) => {
          setPeriodo(p);
          setPagina(1);
        }}
      />
      <Campo rotulo="Destino do consumo">
        {(p) => (
          <Selecao
            {...p}
            value={destino}
            onChange={(e) => {
              setDestino(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todos</option>
            <option value="animal">Animal</option>
            <option value="lote">Lote de animais</option>
            <option value="propriedade">Propriedade (não alocado)</option>
          </Selecao>
        )}
      </Campo>
      {(resumo.isError || lista.isError) && (
        <Alerta tom="perigo" titulo={mensagemDeErro(resumo.error ?? lista.error)} />
      )}
      {r && (
        <>
          <GradeIndicadores testId="resumo-consumos">
            <Indicador
              rotulo="Custo apropriado no período"
              valor={<ValorApurado a={r.total} />}
              dica={`${estadosApuracao[r.total.estado]} · ${r.total.componentesConhecidos} com custo, ${r.total.componentesDesconhecidos} sem custo`}
              destaque={r.total.estado === 'completa' ? undefined : 'alerta'}
            />
            <Indicador
              rotulo="Não alocado (propriedade)"
              valor={<ValorApurado a={r.naoAlocado} />}
              dica="Custo compartilhado: só vai a lotes e animais pelo rateio"
            />
          </GradeIndicadores>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="text-base font-semibold">Por item de estoque e classificação</h3>
              {erro && <Alerta tom="perigo" titulo={erro} />}
              {r.porItem.length === 0 ? (
                <p className="text-sm text-texto-suave">Nenhum consumo no período.</p>
              ) : (
                <Tabela data-testid="tabela-consumo-por-item">
                  <Cabeca>
                    <Th>Item</Th>
                    <Th className="text-right">Custo</Th>
                    <Th>Fixo ou variável</Th>
                  </Cabeca>
                  <tbody>
                    {r.porItem.map((i) => (
                      <Linha key={i.chave}>
                        <Td>
                          <Link
                            className="text-marca hover:underline"
                            to={`/estoque/itens/${i.chave}`}
                          >
                            {i.rotulo}
                          </Link>
                        </Td>
                        <Td className="text-right whitespace-nowrap">
                          <ValorApurado a={i.apuracao} />
                        </Td>
                        <Td>
                          <Selecao
                            aria-label={`Classificar ${i.rotulo}`}
                            value={i.classificacao}
                            disabled={classificar.isPending}
                            onChange={(e) => {
                              setErro(null);
                              classificar.mutate(
                                {
                                  propriedadeId: propriedade.id,
                                  escopo: 'estoque_item',
                                  referenciaId: i.chave,
                                  comportamento: e.target.value as
                                    'variavel' | 'fixo' | 'nao_classificado',
                                },
                                { onError: (x) => setErro(mensagemDeErro(x)) },
                              );
                            }}
                          >
                            <option value="nao_classificado">
                              {comportamentos.nao_classificado}
                            </option>
                            <option value="variavel">{comportamentos.variavel}</option>
                            <option value="fixo">{comportamentos.fixo}</option>
                          </Selecao>
                        </Td>
                      </Linha>
                    ))}
                  </tbody>
                </Tabela>
              )}
            </section>
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="text-base font-semibold">Por destino e tipo</h3>
              <Tabela data-testid="tabela-consumo-por-destino">
                <Cabeca>
                  <Th>Destino ou tipo</Th>
                  <Th className="text-right">Custo</Th>
                  <Th>Situação</Th>
                </Cabeca>
                <tbody>
                  {[...r.porDestino, ...r.porTipo].map((t, k) => (
                    <Linha key={`${k}-${t.chave}`}>
                      <Td>{t.rotulo}</Td>
                      <Td className="text-right whitespace-nowrap">
                        <ValorApurado a={t.apuracao} />
                      </Td>
                      <Td>
                        <Selo tom={t.apuracao.estado === 'completa' ? 'sucesso' : 'alerta'}>
                          {estadosApuracao[t.apuracao.estado]}
                        </Selo>
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </section>
          </div>
        </>
      )}
      {itens.length === 0 ? (
        <EstadoVazio
          icone={Wheat}
          titulo={lista.isLoading ? 'Carregando consumos' : 'Nenhum consumo no período'}
          descricao="Os consumos vêm do módulo Estoque; aqui só se lê o custo já calculado por lá."
        />
      ) : (
        <Tabela data-testid="tabela-consumos">
          <Cabeca>
            <Th>Data</Th>
            <Th>Item</Th>
            <Th className="text-right">Quantidade</Th>
            <Th>Destino</Th>
            <Th>Tipo</Th>
            <Th className="text-right">Custo apropriado</Th>
          </Cabeca>
          <tbody>
            {itens.map((c) => (
              <Linha key={c.movimentacaoId}>
                <Td className="whitespace-nowrap">{formatarData(c.data)}</Td>
                <Td>{c.estoqueItemNome}</Td>
                <Td className="text-right whitespace-nowrap">
                  {quantidadeEstoque(c.quantidade, c.unidadeBase)}
                </Td>
                <Td>{c.destinoDescricao}</Td>
                <Td>{c.tipo.replace('saida_', '').replace('ajuste_', 'ajuste ')}</Td>
                <Td className="text-right whitespace-nowrap">
                  {c.custoApropriadoCentavos === null
                    ? 'Custo desconhecido'
                    : moeda(c.custoApropriadoCentavos)}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {total > 30 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-texto-suave">
            {total} consumos · página {pagina} de {paginas}
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
    </div>
  );
}

export function PaginaCustosConsumo() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
