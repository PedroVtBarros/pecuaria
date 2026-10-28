import { Fragment, useState } from 'react';
import { explicarCompletude, situacaoResultado, type Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import { useConciliacao } from '../../lib/consultas-resultado';
import { avisoGeral, moeda } from '../../textos-financeiro';
import { textoConciliacao } from '../../textos-resultado';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';
import { SeletorPeriodo, mesCorrente, type Periodo } from './seletor-periodo';

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());
  const consulta = useConciliacao({
    propriedadeId: propriedade.id,
    dataInicial: periodo.inicio,
    dataFinal: periodo.fim,
  });
  const c = consulta.data;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Conciliação"
        descricao="Diferença entre o resultado por competência e o caixa do período, linha a linha."
      />
      <Alerta tom="info">{textoConciliacao}</Alerta>
      <p className="text-xs text-texto-suave">{avisoGeral}</p>
      <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} />
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      {c && (
        <>
          <GradeIndicadores testId="totais-conciliacao">
            <Indicador
              rotulo="Resultado (competência, valores conhecidos)"
              valor={moeda(c.totais.resultadoCompetenciaCentavos)}
              destaque={c.competencia.estado === 'completo' ? undefined : 'alerta'}
              dica={situacaoResultado(c.competencia)}
            />
            <Indicador rotulo="Caixa líquido" valor={moeda(c.totais.caixaLiquidoCentavos)} />
            <Indicador
              rotulo="Diferença"
              valor={moeda(c.totais.diferencaCentavos)}
              dica="Explicada nas linhas abaixo"
            />
          </GradeIndicadores>
          {c.competencia.estado !== 'completo' && (
            <Alerta tom="alerta" titulo={explicarCompletude(c.competencia)}>
              {c.custoDesconhecido > 0 &&
                `${c.custoDesconhecido} custo(s) de valor desconhecido ficaram fora das somas da competência. `}
              {c.competencia.receitasDesconhecidas > 0 &&
                `${c.competencia.receitasDesconhecidas} receita(s) sem valor registrado ficaram fora das somas da competência.`}
            </Alerta>
          )}
          <Tabela data-testid="linhas-conciliacao">
            <Cabeca>
              <Th>Linha</Th>
              <Th className="text-right">Receita (competência)</Th>
              <Th className="text-right">Custo (competência)</Th>
              <Th className="text-right">Entradas (caixa)</Th>
              <Th className="text-right">Saídas (caixa)</Th>
              <Th className="text-right">Diferença</Th>
            </Cabeca>
            <tbody>
              {c.linhas.map((l) => (
                <Fragment key={l.chave}>
                  <Linha>
                    <Td className="min-w-40">
                      <div className="font-medium">{l.rotulo}</div>
                      {l.competencia.desconhecidos > 0 && (
                        <div className="text-xs text-alerta">
                          {l.competencia.desconhecidos} custo(s) desconhecido(s)
                        </div>
                      )}
                      {l.competencia.receitasDesconhecidas > 0 && (
                        <div className="text-xs text-alerta">
                          {l.competencia.receitasDesconhecidas} receita(s) sem valor registrado
                        </div>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {moeda(l.competencia.receitaCentavos)}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {moeda(l.competencia.custoCentavos)}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {moeda(l.caixa.entradasCentavos)}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {moeda(l.caixa.saidasCentavos)}
                    </Td>
                    <Td className="text-right font-medium whitespace-nowrap">
                      {moeda(l.diferencaCentavos)}
                    </Td>
                  </Linha>
                  <tr>
                    <td colSpan={6} className="px-3 pb-3 text-xs text-texto-suave">
                      {l.explicacao}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </Tabela>
        </>
      )}
    </div>
  );
}

export function PaginaConciliacao() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
