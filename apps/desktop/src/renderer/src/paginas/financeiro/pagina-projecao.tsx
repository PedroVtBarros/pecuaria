import { useState } from 'react';
import type { BaseDeUnidade } from '@pecuaria/domain';
import type { ProjecaoApi, Propriedade } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao } from '../../components/ui/campos';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { chamarApi, mensagemDeErro } from '../../lib/api';
import { useAnimais, useLotes } from '../../lib/consultas-rebanho';
import { hojeIso } from '../../lib/formatar-rebanho';
import { moeda } from '../../textos-financeiro';
import { basesUnidade, textoProjecao } from '../../textos-resultado';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { GradeIndicadores, Indicador } from './blocos';
import { CampoDinheiro, centavosDoTexto } from './campo-dinheiro';
import { quilosDoTexto } from './formulario-negociacao';
import { ValorApurado } from './valor-apurado';

/** Projeção por premissas: calcula sob demanda e não grava nada. */
function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const lotes = useLotes(propriedade.id);
  const animais = useAnimais(propriedade.id, { status: 'ativo', tamanhoPagina: 500 });
  const [alvo, setAlvo] = useState('');
  const [data, setData] = useState(hojeIso());
  const [base, setBase] = useState<BaseDeUnidade>('arroba_vivo');
  const [preco, setPreco] = useState('');
  const [pesoVivo, setPesoVivo] = useState('');
  const [pesoCarcaca, setPesoCarcaca] = useState('');
  const [futuros, setFuturos] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<ProjecaoApi | null>(null);
  const calcular = async () => {
    const problemas: string[] = [];
    const [tipo, id] = alvo.split(':');
    if (!tipo || !id) problemas.push('Escolha o lote ou o animal.');
    const p = centavosDoTexto(preco);
    if (p.erro || !p.centavos) problemas.push(p.erro ?? 'Informe o preço esperado.');
    const f = centavosDoTexto(futuros);
    if (f.erro) problemas.push(`Custos futuros: ${f.erro}`);
    const vivo = quilosDoTexto(pesoVivo);
    const carcaca = quilosDoTexto(pesoCarcaca);
    if (Number.isNaN(vivo) || Number.isNaN(carcaca))
      problemas.push('Pesos com no máximo três casas decimais.');
    if (problemas.length) {
      setErros(problemas);
      return;
    }
    setErros([]);
    setCalculando(true);
    try {
      setResultado(
        await chamarApi('projecao:calcular', {
          alvo: { tipo: tipo as 'animal' | 'lote', id: id as string },
          data,
          unidadePreco: base,
          precoUnitarioCentavos: p.centavos as number,
          pesoVivoKgPorAnimal: vivo,
          pesoCarcacaKgPorAnimal: carcaca,
          custosFuturosCentavos: f.centavos ?? 0,
        }),
      );
    } catch (e) {
      setResultado(null);
      setErros([mensagemDeErro(e)]);
    } finally {
      setCalculando(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Projeção"
        descricao="Quanto um lote ou animal pode render, com premissas que você informa."
      />
      <Alerta tom="alerta" titulo="Projeção, não resultado">
        {textoProjecao}
      </Alerta>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo rotulo="Lote ou animal" obrigatorio>
          {(p) => (
            <Selecao {...p} value={alvo} onChange={(e) => setAlvo(e.target.value)}>
              <option value="">Escolher…</option>
              <optgroup label="Lotes (animais ativos de hoje)">
                {(lotes.data ?? []).map((l) => (
                  <option key={l.id} value={`lote:${l.id}`}>
                    {l.nome}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Animais ativos">
                {(animais.data?.itens ?? []).map((a) => (
                  <option key={a.id} value={`animal:${a.id}`}>
                    {a.identificacao}
                  </option>
                ))}
              </optgroup>
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Data esperada da venda" obrigatorio>
          {(p) => (
            <Entrada
              {...p}
              type="date"
              value={data}
              min={hojeIso()}
              onChange={(e) => setData(e.target.value)}
            />
          )}
        </Campo>
        <Campo rotulo="Unidade do preço" obrigatorio>
          {(p) => (
            <Selecao {...p} value={base} onChange={(e) => setBase(e.target.value as BaseDeUnidade)}>
              {(Object.keys(basesUnidade) as BaseDeUnidade[]).map((b) => (
                <option key={b} value={b}>
                  {basesUnidade[b]}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <CampoDinheiro rotulo="Preço esperado por unidade" valor={preco} aoMudar={setPreco} />
        <Campo
          rotulo="Peso vivo esperado por animal (kg)"
          ajuda="Para preço por kg vivo ou por @ viva."
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={pesoVivo}
              onChange={(e) => setPesoVivo(e.target.value)}
            />
          )}
        </Campo>
        <Campo
          rotulo="Peso de carcaça esperado por animal (kg)"
          ajuda="Para preço por @ de carcaça. Não é estimado do peso vivo."
        >
          {(p) => (
            <Entrada
              {...p}
              inputMode="decimal"
              value={pesoCarcaca}
              onChange={(e) => setPesoCarcaca(e.target.value)}
            />
          )}
        </Campo>
        <CampoDinheiro
          rotulo="Custos futuros esperados até a venda"
          valor={futuros}
          aoMudar={setFuturos}
          ajuda="Opcional. Total do lote ou do animal."
        />
      </div>
      <Botao className="w-fit" onClick={() => void calcular()} carregando={calculando}>
        Calcular projeção
      </Botao>
      {erros.length > 0 && (
        <Alerta tom="perigo" titulo="Não foi possível calcular">
          <ul className="list-disc pl-5">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alerta>
      )}
      {resultado && (
        <section className="flex flex-col gap-3" data-testid="resultado-projecao">
          <p className="text-sm font-medium">{resultado.rotulo}</p>
          {resultado.erros.length > 0 ? (
            <Alerta tom="alerta">
              <ul className="list-disc pl-5">
                {resultado.erros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alerta>
          ) : (
            <GradeIndicadores>
              <Indicador
                rotulo="Animais"
                valor={String(resultado.animais)}
                dica={resultado.alvo.nome}
              />
              <Indicador
                rotulo="Receita esperada"
                valor={moeda(resultado.receitaEsperadaCentavos)}
              />
              <Indicador
                rotulo="Custo acumulado até hoje"
                valor={<ValorApurado a={resultado.custoAcumulado} />}
              />
              <Indicador
                rotulo="Custos futuros informados"
                valor={moeda(resultado.custosFuturosCentavos)}
              />
              <Indicador
                rotulo="Resultado projetado"
                valor={`${resultado.estado === 'parcial' ? 'no máximo ' : ''}${moeda(resultado.resultadoProjetadoCentavos)}`}
                dica={resultado.estado === 'parcial' ? 'O custo acumulado é parcial' : undefined}
              />
            </GradeIndicadores>
          )}
        </section>
      )}
    </div>
  );
}

export function PaginaProjecao() {
  return <ComPropriedade>{(propriedade) => <Conteudo propriedade={propriedade} />}</ComPropriedade>;
}
