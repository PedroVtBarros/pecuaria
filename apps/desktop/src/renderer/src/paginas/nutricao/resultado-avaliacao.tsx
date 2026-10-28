import { Fragment, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ComparacaoNutriente, OfertaNutriente } from '@pecuaria/nutrition-engine';
import type { AvaliacaoDietaCalculada, PerfilAvaliado } from '@pecuaria/shared-types';
import { formatarDataHora } from '../../lib/formatar';
import {
  basesQuantidade,
  cenariosPerfil,
  equacoesCms,
  explicacaoBalanco,
  nutrientesDieta,
  situacoesBalanco,
  situacoesContribuicao,
  situacoesOferta,
  tiposPerfil,
} from '../../textos-nutricao';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import {
  Cartao,
  CartaoCabecalho,
  CartaoConteudo,
  CartaoDescricao,
  CartaoTitulo,
} from '../../components/ui/cartao';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { SecaoGrupo, SecaoMinerais } from './pagina-exigencias';

/*
 * Fase 6B-5: resultado de uma avaliação de dieta, igual na simulação e na avaliação gravada.
 * Só mostra o que o main calculou (nenhum número nasce aqui). Exigência, oferta e balanço ficam
 * em blocos separados (regra 3e); "Cobertura teórica" nunca é adequação completa (C-6B-05).
 */

const TOM_BALANCO = {
  cobertura_teorica: 'sucesso',
  deficit_estimado: 'alerta',
  indeterminado: 'neutro',
} as const;

/** g/dia com casas pela grandeza (o valor integral fica no título). */
export const gDia = (v: number) =>
  `${v.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2 })} g/dia`;
const kg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} %`;
const razao = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const integral = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 9 });

function Valor({ v, formato }: { v: number | null; formato: (x: number) => string }) {
  if (v === null) return <span className="text-texto-suave">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums" title={`Valor integral: ${integral(v)}`}>
      {formato(v)}
    </span>
  );
}

function Lista({ itens, className }: { itens: string[]; className?: string }) {
  if (itens.length === 0) return null;
  return (
    <ul className={`list-disc pl-5 ${className ?? ''}`}>
      {itens.map((t, k) => (
        <li key={`${k}-${t}`}>{t}</li>
      ))}
    </ul>
  );
}

/**
 * `operacional`: na avaliação gravada, o uso operacional final (com anulação e integridade,
 * D-6B4-03 e 04); na simulação, o do cálculo.
 */
export function ResultadoAvaliacao({
  avaliacao,
  operacional,
}: {
  avaliacao: AvaliacaoDietaCalculada;
  operacional?: { usoOperacional: boolean; bloqueios: string[] };
}) {
  const [exigencias, setExigencias] = useState(false);
  const { situacao, balanco, hipoteses } = avaliacao;
  const uso = operacional ?? situacao;
  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="resultado-avaliacao">
      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>Situação da avaliação</CartaoTitulo>
        </CartaoCabecalho>
        <CartaoConteudo className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" data-testid="situacao-avaliacao">
            {situacao.parcial ? (
              <Selo tom="alerta">Parcial</Selo>
            ) : (
              <Selo tom="sucesso">Sem lacunas nos nutrientes comparados</Selo>
            )}
            {uso.usoOperacional ? (
              <Selo tom="sucesso">Pode ser usada</Selo>
            ) : (
              <Selo tom="perigo">Sem uso operacional</Selo>
            )}
          </div>
          {uso.bloqueios.length > 0 && (
            <Alerta tom="perigo" titulo="Por que não pode ser usada">
              <Lista itens={uso.bloqueios} />
            </Alerta>
          )}
          {situacao.parcial && (
            <Alerta tom="alerta" titulo="O que falta">
              <Lista itens={situacao.motivosParcial} />
            </Alerta>
          )}
          <Alerta tom="info" titulo="Limites desta avaliação">
            <Lista itens={balanco.avisos} />
          </Alerta>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>Hipóteses do cálculo</CartaoTitulo>
        </CartaoCabecalho>
        <CartaoConteudo className="text-sm" data-testid="hipoteses">
          <Lista itens={hipoteses.textos} />
        </CartaoConteudo>
      </Cartao>

      <SecaoBalanco avaliacao={avaliacao} />
      <SecaoOferta avaliacao={avaliacao} />
      <SecaoPerfis perfis={avaliacao.perfis} />

      <Cartao data-testid="secao-cms-previsto">
        <CartaoCabecalho>
          <CartaoTitulo>CMS previsto (à parte)</CartaoTitulo>
          <CartaoDescricao>
            Mostrado só para comparação; não substitui o consumo (C-6B-01).
          </CartaoDescricao>
        </CartaoCabecalho>
        <CartaoConteudo className="text-sm">
          {avaliacao.cmsPrevisto.valor !== null && avaliacao.cmsPrevisto.usoOperacional ? (
            <p>
              <Valor v={avaliacao.cmsPrevisto.valor} formato={(v) => `${kg(v)} kg/dia`} /> (
              {equacoesCms[avaliacao.cmsPrevisto.equacaoId] ?? avaliacao.cmsPrevisto.equacaoId})
            </p>
          ) : (
            <p className="text-texto-suave">
              Sem CMS previsto utilizável. {avaliacao.cmsPrevisto.motivos[0] ?? ''}
            </p>
          )}
          <p className="mt-1 text-texto-suave">
            CMS usado nas exigências:{' '}
            {hipoteses.cmsExigencia.origem === 'ms_consumida'
              ? 'a matéria seca consumida'
              : 'o CMS previsto'}
            {balanco.cmsExigenciaKgDia !== null && (
              <>
                {' '}
                (<Valor v={balanco.cmsExigenciaKgDia} formato={(v) => `${kg(v)} kg/dia`} />)
              </>
            )}
            .
          </p>
        </CartaoConteudo>
      </Cartao>

      <div>
        <Botao variante="secundario" onClick={() => setExigencias((e) => !e)}>
          {exigencias ? (
            <ChevronUp className="size-4" aria-hidden />
          ) : (
            <ChevronDown className="size-4" aria-hidden />
          )}
          {exigencias ? 'Esconder as exigências calculadas' : 'Mostrar as exigências calculadas'}
        </Botao>
      </div>
      {exigencias && (
        <div className="flex flex-col gap-6" data-testid="exigencias-avaliacao">
          {(['cms', 'energia', 'proteina'] as const).map((g) => (
            <SecaoGrupo key={g} grupo={g} itens={avaliacao.exigencias.grupos[g]} />
          ))}
          <SecaoMinerais itens={avaliacao.exigencias.grupos.minerais} />
        </div>
      )}

      <p className="text-xs break-words text-texto-suave" data-testid="versoes-avaliacao">
        Fonte das exigências: {avaliacao.fonte.obra}, {avaliacao.fonte.edicao},{' '}
        {avaliacao.fonte.ano} (DOI {avaliacao.fonte.doi}). Motor de cálculo versão{' '}
        {avaliacao.versaoMotor}.
        {avaliacao.conteudoSha256 && <> Retrato SHA-256: {avaliacao.conteudoSha256}.</>}
        {avaliacao.naoGravavel && <> {avaliacao.naoGravavel}</>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Balanço
// ---------------------------------------------------------------------------

function OfertaDaComparacao({ c }: { c: ComparacaoNutriente }) {
  if (c.oferta.gDia !== null) {
    const limite =
      c.oferta.situacao === 'limite_inferior'
        ? 'no mínimo '
        : c.oferta.situacao === 'limite_superior'
          ? 'no máximo '
          : '';
    return (
      <span>
        {limite}
        <Valor v={c.oferta.gDia} formato={gDia} />
      </span>
    );
  }
  if (c.pisoConhecidoGDia !== null)
    return (
      <span className="text-texto-suave">
        parcial: ao menos <Valor v={c.pisoConhecidoGDia} formato={gDia} />
      </span>
    );
  return <span className="text-texto-suave">desconhecida</span>;
}

function SecaoBalanco({ avaliacao }: { avaliacao: AvaliacaoDietaCalculada }) {
  const { balanco, oferta } = avaliacao;
  const [aberto, setAberto] = useState<string | null>(null);
  const porNutriente = new Map(oferta.nutrientes.map((n) => [n.nutriente, n]));
  return (
    <Cartao data-testid="secao-balanco">
      <CartaoCabecalho>
        <CartaoTitulo>Balanço: exigência × oferta</CartaoTitulo>
        <CartaoDescricao>
          Por nutriente, em g/dia. “Cobertura teórica” não é adequação nutricional completa;
          “Indeterminado” nunca vira zero.
        </CartaoDescricao>
      </CartaoCabecalho>
      <CartaoConteudo className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {(['cobertura_teorica', 'deficit_estimado', 'indeterminado'] as const).map((s) => (
            <Selo key={s} tom={TOM_BALANCO[s]} title={explicacaoBalanco[s]}>
              {situacoesBalanco[s]}: {balanco.resumo[s]}
            </Selo>
          ))}
        </div>
        <Tabela>
          <Cabeca>
            <Th>Nutriente</Th>
            <Th>Situação</Th>
            <Th className="text-right">Exigência</Th>
            <Th className="text-right">Oferta</Th>
            <Th className="text-right">Cobertura</Th>
          </Cabeca>
          <tbody>
            {balanco.comparacoes.map((c) => (
              <Fragment key={c.nutriente}>
                <Linha data-testid={`balanco-${c.nutriente}`}>
                  <Td>
                    <div className="flex flex-col">
                      <span>{nutrientesDieta[c.nutriente] ?? c.nutriente}</span>
                      <Botao
                        variante="fantasma"
                        tamanho="pequeno"
                        className="mt-1 h-7 w-fit px-2 whitespace-nowrap text-marca"
                        aria-expanded={aberto === c.nutriente}
                        onClick={() => setAberto(aberto === c.nutriente ? null : c.nutriente)}
                      >
                        {aberto === c.nutriente ? 'Fechar detalhes' : 'Por quê?'}
                      </Botao>
                    </div>
                  </Td>
                  <Td>
                    <Selo tom={TOM_BALANCO[c.situacao]} title={explicacaoBalanco[c.situacao]}>
                      {situacoesBalanco[c.situacao]}
                    </Selo>
                  </Td>
                  <Td className="text-right">
                    {c.exigencia.usoOperacional ? (
                      <Valor v={c.exigencia.gDia} formato={gDia} />
                    ) : (
                      <span className="text-texto-suave">não usar</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <OfertaDaComparacao c={c} />
                  </Td>
                  <Td className="text-right">
                    <Valor v={c.coberturaPct} formato={pct} />
                  </Td>
                </Linha>
                {aberto === c.nutriente && (
                  <tr className="bg-superficie-2">
                    <td colSpan={5} className="px-3 py-3">
                      <DetalheComparacao c={c} oferta={porNutriente.get(c.nutriente) ?? null} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </Tabela>
        <div className="text-sm" data-testid="indicador-cap">
          <span className="font-medium">Relação Ca/P (só indicador): </span>
          exigência <Valor v={balanco.indicadorCaP.exigencia} formato={razao} />; oferta{' '}
          <Valor v={balanco.indicadorCaP.oferta} formato={razao} />.
          <Lista itens={balanco.indicadorCaP.motivos} className="text-texto-suave" />
        </div>
        <div className="flex flex-col gap-2" data-testid="seguranca">
          {balanco.seguranca.alertas.map((a) => (
            <Alerta key={a.mineral} tom="alerta" titulo={`Alerta de segurança: ${a.mineral}`}>
              {a.texto}
            </Alerta>
          ))}
          <p className="text-xs text-texto-suave">
            {balanco.seguranca.nota}
            {balanco.seguranca.naoAvaliados.length > 0 &&
              ` Não avaliados: ${balanco.seguranca.naoAvaliados.join('; ')}`}
          </p>
        </div>
      </CartaoConteudo>
    </Cartao>
  );
}

function DetalheComparacao({
  c,
  oferta,
}: {
  c: ComparacaoNutriente;
  oferta: OfertaNutriente | null;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="detalhe-balanco">
      <p>
        <span className="font-medium">Fundamento: </span>
        {c.fundamento}
      </p>
      <Lista itens={c.motivos} />
      <p>
        <span className="font-medium">Diferença (oferta − exigência): </span>
        <Valor v={c.diferencaGDia} formato={gDia} />
      </p>
      {c.pbEquivalente && (
        <p>
          <span className="font-medium">PB equivalente de NNP (contida na PB): </span>
          {c.pbEquivalente.parcelaNnpGDia === null ? (
            'parcela desconhecida'
          ) : (
            <Valor v={c.pbEquivalente.parcelaNnpGDia} formato={gDia} />
          )}
          ; cobertura sem NNP:{' '}
          {c.pbEquivalente.coberturaSemNnpPct === null ? (
            'desconhecida'
          ) : (
            <Valor v={c.pbEquivalente.coberturaSemNnpPct} formato={pct} />
          )}
          .
        </p>
      )}
      <p className="text-texto-suave">
        Só informação (% da MS consumida): exigência{' '}
        <Valor v={c.concentracao.exigenciaPctMs} formato={pct} />, oferta{' '}
        <Valor v={c.concentracao.ofertaPctMs} formato={pct} />.
      </p>
      {oferta && <TabelaContribuicoes oferta={oferta} />}
    </div>
  );
}

function TabelaContribuicoes({ oferta }: { oferta: OfertaNutriente }) {
  return (
    <div className="flex flex-col gap-1">
      <p>
        <span className="font-medium">Oferta: </span>
        {situacoesOferta[oferta.situacao]}
        {oferta.motivos.length > 0 && ` — ${oferta.motivos.join(' ')}`}
      </p>
      <Tabela>
        <Cabeca>
          <Th>Alimento</Th>
          <Th className="text-right">Contribuição</Th>
          <Th>Situação</Th>
          <Th>Observação</Th>
        </Cabeca>
        <tbody>
          {oferta.contribuicoes.map((k) => (
            <Linha key={k.itemId}>
              <Td>{k.alimentoNome}</Td>
              <Td className="text-right">
                <Valor v={k.gDia} formato={gDia} />
              </Td>
              <Td>{situacoesContribuicao[k.situacao]}</Td>
              <Td className="text-xs break-words">
                {[k.motivo, ...k.avisos].filter(Boolean).join(' ')}
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Oferta (matéria seca e quantidades)
// ---------------------------------------------------------------------------

function SecaoOferta({ avaliacao }: { avaliacao: AvaliacaoDietaCalculada }) {
  const { oferta } = avaliacao;
  const ms = oferta.materiaSeca;
  return (
    <Cartao data-testid="secao-oferta">
      <CartaoCabecalho>
        <CartaoTitulo>Quantidades e matéria seca</CartaoTitulo>
        <CartaoDescricao>
          Conversão entre matéria natural e seca pela MS de cada perfil. Oferta não é consumo.
        </CartaoDescricao>
      </CartaoCabecalho>
      <CartaoConteudo className="flex flex-col gap-3">
        <Tabela>
          <Cabeca>
            <Th>Alimento</Th>
            <Th className="text-right">MS do perfil</Th>
            <Th className="text-right whitespace-normal">Oferecido (kg MN / kg MS)</Th>
            <Th className="text-right whitespace-normal">Usado no cálculo (kg MN / kg MS)</Th>
            <Th>Observação</Th>
          </Cabeca>
          <tbody>
            {oferta.itens.map((i) => (
              <Linha key={i.itemId}>
                <Td>{i.alimentoNome}</Td>
                <Td className="text-right">
                  <Valor v={i.msPctMn} formato={(v) => `${pct(v)} da MN`} />
                </Td>
                <Td className="text-right">
                  <Valor v={i.oferecidoKgMnDia} formato={kg} /> /{' '}
                  <Valor v={i.oferecidoKgMsDia} formato={kg} />
                </Td>
                <Td className="text-right">
                  <Valor v={i.usadoKgMnDia} formato={kg} /> /{' '}
                  <Valor v={i.usadoKgMsDia} formato={kg} />
                </Td>
                <Td className="text-xs break-words">{[...i.motivos, ...i.avisos].join(' ')}</Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
        <p className="text-sm" data-testid="materia-seca-total">
          <span className="font-medium">Total: </span>
          <Valor v={ms.totalKgMsDia} formato={(v) => `${kg(v)} kg MS/dia`} />;{' '}
          <Valor v={ms.totalKgMnDia} formato={(v) => `${kg(v)} kg MN/dia`} />; MS da dieta{' '}
          <Valor v={ms.msPctMnDieta} formato={(v) => `${pct(v)} da MN`} />.
          {ms.motivos.length > 0 && (
            <span className="text-texto-suave"> {ms.motivos.join(' ')}</span>
          )}
        </p>
        <Lista itens={oferta.avisos} className="text-sm text-texto-suave" />
      </CartaoConteudo>
    </Cartao>
  );
}

// ---------------------------------------------------------------------------
// Perfis usados
// ---------------------------------------------------------------------------

function SecaoPerfis({ perfis }: { perfis: PerfilAvaliado[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <Cartao data-testid="secao-perfis">
      <CartaoCabecalho>
        <CartaoTitulo>Perfis de composição usados</CartaoTitulo>
        <CartaoDescricao>
          Valores como gravados no perfil (fonte, unidade e base); ausente não vira zero.
        </CartaoDescricao>
      </CartaoCabecalho>
      <CartaoConteudo className="flex flex-col gap-3">
        {perfis.map((p) => (
          <div
            key={p.perfilId}
            className="flex flex-col gap-2 rounded-lg border border-borda p-3 text-sm"
            data-testid={`perfil-${p.perfilId}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{p.nome}</span>
              <span className="text-texto-suave">({p.alimentoNome})</span>
              {p.elegivel ? (
                <Selo tom="sucesso">Elegível</Selo>
              ) : (
                <Selo tom="perigo">Inelegível</Selo>
              )}
              <Selo tom="neutro">
                {tiposPerfil[p.tipo] ?? p.tipo} · {cenariosPerfil[p.cenario] ?? p.cenario}
              </Selo>
            </div>
            <p className="text-xs text-texto-suave">
              Regra {p.regra.codigo} v{p.regra.versao}
              {p.regra.vigente ? ' (vigente)' : ' (histórica)'}
              {p.regra.aprovadaEm && `, aprovada em ${formatarDataHora(p.regra.aprovadaEm)}`};
              perfil gravado em {formatarDataHora(p.criadoEm)}. Fontes:{' '}
              {p.fontes
                .map((f) => `${f.fonteTitulo}${f.referenciaLocal ? `, ${f.referenciaLocal}` : ''}`)
                .join('; ')}
              .
            </p>
            {p.motivosInelegibilidade.length > 0 && (
              <Lista itens={p.motivosInelegibilidade} className="text-perigo" />
            )}
            {p.avisos.length > 0 && <Lista itens={p.avisos} className="text-alerta" />}
            <div>
              <Botao
                variante="fantasma"
                tamanho="pequeno"
                className="h-7 px-2 text-marca"
                aria-expanded={aberto === p.perfilId}
                onClick={() => setAberto(aberto === p.perfilId ? null : p.perfilId)}
              >
                {aberto === p.perfilId
                  ? 'Esconder valores usados'
                  : `Valores usados (${p.valores.length})`}
              </Botao>
            </div>
            {aberto === p.perfilId && (
              <Tabela>
                <Cabeca>
                  <Th>Nutriente</Th>
                  <Th className="text-right">Publicado</Th>
                  <Th>Unidade e base</Th>
                  <Th>Tipo</Th>
                  <Th>Origem</Th>
                </Cabeca>
                <tbody>
                  {p.valores.map((v) => (
                    <Linha key={v.valorId}>
                      <Td>{v.nutriente}</Td>
                      <Td className="text-right tabular-nums">
                        {v.valorPublicado ?? integral(v.valor)}
                      </Td>
                      <Td>
                        {v.unidade === 'pct' ? '%' : v.unidade} da {v.base.toUpperCase()}
                        {v.baseInferida &&
                          (v.baseValidada ? ' (base validada)' : ' (base não validada)')}
                      </Td>
                      <Td>{v.tipoValor}</Td>
                      <Td>{v.formaObtencao}</Td>
                    </Linha>
                  ))}
                  {p.naoQuantificados.map((n) => (
                    <Linha key={`nq-${n.nutriente}`}>
                      <Td>{n.nutriente}</Td>
                      <Td className="text-right">“{n.textoPublicado}”</Td>
                      <Td colSpan={3} className="text-texto-suave">
                        Publicado sem número; não vira zero.
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
          </div>
        ))}
        <p className="text-xs text-texto-suave">
          Base da quantidade informada em cada alimento: {basesQuantidade.mn.toLowerCase()} ou{' '}
          {basesQuantidade.ms.toLowerCase()}.
        </p>
      </CartaoConteudo>
    </Cartao>
  );
}
