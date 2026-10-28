import { useState } from 'react';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import {
  esquemaEntradaExigencias,
  GRUPOS_EXIGENCIA,
  SEXOS_EXIGENCIA,
  SISTEMAS_EXIGENCIA,
  type EntradaExigencias,
  type ExigenciasCalculadas,
  type FonteCmsExigencia,
  type GrupoExigencia,
  type GrupoResultadoExigencia,
  type ItemExigencia,
  type SexoExigencia,
  type SistemaExigencia,
  type SituacaoExigencia,
} from '@pecuaria/shared-types';
import { textoParaNumero, useFormulario } from '../../hooks/use-formulario';
import { useCalcularExigencias } from '../../lib/consultas-nutricao';
import { formatarData } from '../../lib/formatar-rebanho';
import {
  equacoesCms,
  etapasMineral,
  explicacaoSituacao,
  fontesCms,
  fontesCmsDoSistema,
  gruposGeneticos,
  minerais,
  resultados,
  sexos,
  sistemas,
  situacoes,
  tituloGrupos,
  unidades,
  variaveis,
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
import { Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';

/*
 * Fase 6A-7: exigências nutricionais de um animal (BR-CORTE 2023). A tela só coleta a entrada e
 * mostra o que o main calculou com o motor: nenhum número científico nasce aqui. Exigência do
 * animal, não oferta da dieta (regra 3e). Resultado sem uso operacional nunca aparece como
 * exigência: o valor só é mostrado em "Como foi calculado?", marcado como análise.
 */

const TOM_SITUACAO: Record<SituacaoExigencia, 'sucesso' | 'alerta' | 'perigo' | 'neutro'> = {
  valido: 'sucesso',
  fora_do_dominio: 'alerta',
  fora_do_escopo: 'perigo',
  indeterminado: 'neutro',
};

const ehMotivoDeCategoria = (m: string) => m.startsWith('Categoria fora do escopo');

/** Casas decimais para leitura; o valor integral fica em "Como foi calculado?". */
function casas(item: ItemExigencia, grupo: GrupoResultadoExigencia): number {
  if (grupo === 'minerais') return 2;
  switch (item.unidade) {
    case 'kg':
      return 1;
    case 'g/dia':
      return 0;
    case 'kg/dia':
    case 'Mcal/dia':
      return 2;
    case '% MS':
    case '% PB':
    case '%':
      return 1;
    default:
      return 3;
  }
}

const numero = (v: number, n: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: n, maximumFractionDigits: n });
const comUnidade = (texto: string, unidade: string) => {
  const u = unidades[unidade] ?? unidade;
  return u ? `${texto} ${u}` : texto;
};
const integral = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
/** Leitura com casas pela grandeza (mesma regra das mensagens do motor); o valor não muda. */
const legivel = (v: number) =>
  v.toLocaleString('pt-BR', {
    maximumFractionDigits: Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 1 ? 2 : 3,
  });

function nomeDe(chave: string): string {
  const [mineral, etapa] = chave.split('.');
  if (mineral && etapa && minerais[mineral])
    return `${minerais[mineral]}: ${etapasMineral[etapa] ?? etapa}`;
  return resultados[chave]?.nome ?? chave;
}

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------

interface ValoresFormulario extends Record<string, unknown> {
  grupo: GrupoExigencia;
  sexo: SexoExigencia;
  sistema: SistemaExigencia;
  pcKg: string;
  gmdKgDia: string;
  fonteCms: FonteCmsExigencia;
  cmsKgDia: string;
  ncPctMs: string;
  cmssKgDia: string;
}

function converter(v: ValoresFormulario) {
  const cms = (() => {
    switch (v.fonteCms) {
      case 'informado':
        return { fonte: v.fonteCms, cmsKgDia: textoParaNumero(v.cmsKgDia) };
      case 'concentrado':
        return { fonte: v.fonteCms, ncPctMs: textoParaNumero(v.ncPctMs) };
      case 'pasto':
        return { fonte: v.fonteCms, cmssKgDia: textoParaNumero(v.cmssKgDia) };
      default:
        return { fonte: v.fonteCms };
    }
  })();
  return {
    grupo: v.grupo,
    sexo: v.sexo,
    sistema: v.sistema,
    pcKg: textoParaNumero(v.pcKg),
    gmdKgDia: textoParaNumero(v.gmdKgDia),
    cms,
  };
}

export function PaginaExigencias() {
  const calcular = useCalcularExigencias();
  const [resultado, setResultado] = useState<ExigenciasCalculadas | null>(null);
  const form = useFormulario({
    inicial: {
      grupo: 'zebuino',
      sexo: 'macho_nao_castrado',
      sistema: 'confinamento',
      pcKg: '',
      gmdKgDia: '',
      fonteCms: 'confinamento',
      cmsKgDia: '',
      ncPctMs: '',
      cmssKgDia: '',
    } as ValoresFormulario,
    esquema: esquemaEntradaExigencias,
    converter,
  });
  const { valores, definir, errosCampos, errosGerais } = form;
  const fontes = fontesCmsDoSistema[valores.sistema];
  const foraDoEscopoPasto =
    valores.sistema === 'pasto' && (valores.grupo !== 'zebuino' || valores.sexo === 'femea');
  const desatualizado =
    resultado !== null && JSON.stringify(converter(valores)) !== JSON.stringify(resultado.entrada);

  const enviar = () => {
    const dados = form.validar();
    if (!dados) return;
    calcular.mutate(dados as EntradaExigencias, {
      onSuccess: setResultado,
      onError: form.mostrarErroDoServidor,
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Exigências do animal"
        descricao="Quanto um bovino de corte em crescimento ou terminação precisa por dia, pelo BR-CORTE 2023."
      />
      <Alerta tom="info" titulo="Exigência não é dieta">
        Os valores são o que o animal precisa (exigência), calculados pelo BR-CORTE. Não são os
        nutrientes que a dieta oferece: para comparar com uma dieta, use “Avaliar dieta”. Nada é
        gravado aqui.
      </Alerta>

      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>Dados do animal</CartaoTitulo>
          <CartaoDescricao>
            Categoria: crescimento e terminação de bovinos de corte. Vacas, bezerros lactentes e
            gado leiteiro não são calculados aqui. Informe os dados à mão: o sistema não deduz grupo
            genético nem castração do cadastro do rebanho.
          </CartaoDescricao>
        </CartaoCabecalho>
        <CartaoConteudo className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Campo rotulo="Grupo genético" obrigatorio>
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.grupo}
                  onChange={(e) => definir('grupo', e.target.value as GrupoExigencia)}
                >
                  {opcoesDe(gruposGeneticos, GRUPOS_EXIGENCIA)}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Classe sexual" obrigatorio>
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.sexo}
                  onChange={(e) => definir('sexo', e.target.value as SexoExigencia)}
                >
                  {opcoesDe(sexos, SEXOS_EXIGENCIA)}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Sistema de produção" obrigatorio>
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.sistema}
                  onChange={(e) => {
                    const sistema = e.target.value as SistemaExigencia;
                    definir('sistema', sistema);
                    if (!fontesCmsDoSistema[sistema].includes(valores.fonteCms))
                      definir('fonteCms', fontesCmsDoSistema[sistema][0]!);
                  }}
                >
                  {opcoesDe(sistemas, SISTEMAS_EXIGENCIA)}
                </Selecao>
              )}
            </Campo>
          </div>
          {foraDoEscopoPasto && (
            <Alerta tom="alerta" titulo="Categoria fora do escopo a pasto">
              A pasto, o sistema só calcula zebuínos machos (não castrados e castrados). É uma
              restrição deste projeto: os dados de energia a pasto do BR-CORTE são desses animais.
            </Alerta>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Peso corporal médio (kg)"
              obrigatorio
              erro={errosCampos['pcKg']}
              ajuda="Média do período: peso inicial mais peso final, dividido por dois."
            >
              {(p) => (
                <Entrada
                  {...p}
                  inputMode="decimal"
                  value={valores.pcKg}
                  onChange={(e) => definir('pcKg', e.target.value)}
                />
              )}
            </Campo>
            <Campo
              rotulo="Ganho médio diário desejado (kg/dia)"
              obrigatorio
              erro={errosCampos['gmdKgDia']}
              ajuda="O ganho que você planeja para o período. Não é o GMD observado nas pesagens."
            >
              {(p) => (
                <Entrada
                  {...p}
                  inputMode="decimal"
                  value={valores.gmdKgDia}
                  onChange={(e) => definir('gmdKgDia', e.target.value)}
                />
              )}
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <Campo
              rotulo="Consumo de matéria seca (CMS)"
              obrigatorio
              ajuda="A energia e a proteína dependem do CMS. Escolha como obtê-lo."
            >
              {(p) => (
                <Selecao
                  {...p}
                  value={valores.fonteCms}
                  onChange={(e) => definir('fonteCms', e.target.value as FonteCmsExigencia)}
                >
                  {opcoesDe(fontesCms, fontes)}
                </Selecao>
              )}
            </Campo>
            {valores.fonteCms === 'informado' && (
              <Campo rotulo="CMS informado (kg/dia)" obrigatorio erro={errosCampos['cmsKgDia']}>
                {(p) => (
                  <Entrada
                    {...p}
                    inputMode="decimal"
                    value={valores.cmsKgDia}
                    onChange={(e) => definir('cmsKgDia', e.target.value)}
                  />
                )}
              </Campo>
            )}
            {valores.fonteCms === 'concentrado' && (
              <Campo
                rotulo="Teor de concentrado (% da MS da dieta)"
                obrigatorio
                erro={errosCampos['ncPctMs']}
              >
                {(p) => (
                  <Entrada
                    {...p}
                    inputMode="decimal"
                    value={valores.ncPctMs}
                    onChange={(e) => definir('ncPctMs', e.target.value)}
                  />
                )}
              </Campo>
            )}
            {valores.fonteCms === 'pasto' && (
              <Campo
                rotulo="Consumo de suplemento (kg/dia)"
                obrigatorio
                erro={errosCampos['cmssKgDia']}
              >
                {(p) => (
                  <Entrada
                    {...p}
                    inputMode="decimal"
                    value={valores.cmssKgDia}
                    onChange={(e) => definir('cmssKgDia', e.target.value)}
                  />
                )}
              </Campo>
            )}
          </div>
          {errosGerais.length > 0 && (
            <Alerta tom="perigo" titulo="Não foi possível calcular">
              {errosGerais.join(' ')}
            </Alerta>
          )}
          <div>
            <Botao onClick={enviar} carregando={calcular.isPending}>
              <Calculator className="size-4" aria-hidden />
              Calcular exigências
            </Botao>
          </div>
        </CartaoConteudo>
      </Cartao>

      {resultado && <Resultados resultado={resultado} desatualizado={desatualizado} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

function Resultados({
  resultado,
  desatualizado,
}: {
  resultado: ExigenciasCalculadas;
  desatualizado: boolean;
}) {
  const { resumo, cmsUsado, entrada } = resultado;
  const nadaCalculado = resumo.fora_do_escopo === resumo.total;
  const parcial = resumo.valido < resumo.total && !nadaCalculado;
  return (
    <div className="flex flex-col gap-6" data-testid="resultados-exigencias">
      {desatualizado && (
        <Alerta tom="alerta" titulo="Dados alterados">
          Os resultados abaixo são do cálculo anterior. Clique em “Calcular exigências” de novo.
        </Alerta>
      )}
      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>Resumo</CartaoTitulo>
          <CartaoDescricao>
            {gruposGeneticos[entrada.grupo]} · {sexos[entrada.sexo]} · {sistemas[entrada.sistema]} ·{' '}
            {numero(entrada.pcKg, 0)} kg · GMD desejado {numero(entrada.gmdKgDia, 2)} kg/dia
          </CartaoDescricao>
        </CartaoCabecalho>
        <CartaoConteudo className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" data-testid="resumo-exigencias">
            {(['valido', 'fora_do_dominio', 'fora_do_escopo', 'indeterminado'] as const).map(
              (s) => (
                <Selo key={s} tom={TOM_SITUACAO[s]} title={explicacaoSituacao[s]}>
                  {situacoes[s]}: {resumo[s]}
                </Selo>
              ),
            )}
          </div>
          {nadaCalculado && (
            <Alerta tom="perigo" titulo="Nada foi calculado para esta categoria">
              {Object.values(resultado.grupos)
                .flat()
                .find((i) => i.motivos[0])?.motivos[0] ?? ''}
            </Alerta>
          )}
          {nadaCalculado ? null : parcial ? (
            <Alerta tom="alerta" titulo="Resultado parcial">
              Só os itens marcados “Pode ser usado” valem para decisão. Os demais mostram o motivo;
              valores “Só para análise” ficam em “Como foi calculado?” e não são recomendação.
            </Alerta>
          ) : (
            <Alerta tom="sucesso" titulo="Todos os itens podem ser usados">
              Todos os resultados foram calculados dentro dos dados que validam as equações.
            </Alerta>
          )}
          <p className="text-sm" data-testid="cms-usado">
            <span className="font-medium">CMS usado na energia e na proteína: </span>
            {cmsUsado.origem === 'informado'
              ? 'informado por você (não é equação do livro)'
              : `previsto pelo BR-CORTE, ${equacoesCms[cmsUsado.equacaoId] ?? cmsUsado.equacaoId} (${cmsUsado.equacaoId})`}
            .
          </p>
        </CartaoConteudo>
      </Cartao>

      {(['peso', 'cms', 'energia', 'proteina'] as const).map((g) => (
        <SecaoGrupo key={g} grupo={g} itens={resultado.grupos[g]} />
      ))}
      <SecaoMinerais itens={resultado.grupos.minerais} />

      <p className="text-xs text-texto-suave">
        Fonte: {resultado.fonte.obra}, {resultado.fonte.edicao}, {resultado.fonte.ano} (DOI{' '}
        {resultado.fonte.doi}). Motor de cálculo versão {resultado.versaoMotor}. Fora do escopo
        desta etapa: microminerais, aminoácidos, água, vitaminas, vacas e bezerros.
      </p>
    </div>
  );
}

function CelulaValor({
  item,
  grupo,
  semUnidade = false,
}: {
  item: ItemExigencia;
  grupo: GrupoResultadoExigencia;
  semUnidade?: boolean;
}) {
  if (item.valor !== null && item.usoOperacional) {
    const texto = numero(item.valor, casas(item, grupo));
    return (
      <span className="font-medium whitespace-nowrap tabular-nums">
        {semUnidade ? texto : comUnidade(texto, item.unidade)}
      </span>
    );
  }
  return (
    <span className="text-texto-suave">
      {semUnidade
        ? item.valor === null
          ? '—'
          : 'não usar'
        : item.valor === null
          ? 'Não calculado'
          : 'Não usar para decisão'}
    </span>
  );
}

/** Motivo resumido na linha; o texto completo fica em "Como foi calculado?". */
function MotivoCurto({ item }: { item: ItemExigencia }) {
  if (item.usoOperacional || !item.motivos[0]) return null;
  const texto =
    item.situacao === 'fora_do_dominio'
      ? 'Fora dos dados que validam a equação. Veja “Como foi calculado?”.'
      : ehMotivoDeCategoria(item.motivos[0])
        ? 'Categoria fora do escopo (veja o aviso no resumo).'
        : item.motivos[0];
  return <span className="max-w-md text-xs break-words text-texto-suave">{texto}</span>;
}

function SeloSituacao({ item }: { item: ItemExigencia }) {
  // Só limitações, domínios provisórios e restrições; notas informativas não acionam o selo.
  const comAviso = item.usoOperacional && item.avisos.length > 0;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Selo tom={TOM_SITUACAO[item.situacao]} title={explicacaoSituacao[item.situacao]}>
        {situacoes[item.situacao]}
      </Selo>
      {comAviso && <Selo tom="neutro">Com aviso</Selo>}
    </div>
  );
}

export function SecaoGrupo({
  grupo,
  itens,
}: {
  grupo: GrupoResultadoExigencia;
  itens: ItemExigencia[];
}) {
  const [etapas, setEtapas] = useState(false);
  const principais = itens.filter((i) => resultados[i.chave]?.principal ?? true);
  const intermediarias = itens.filter((i) => !(resultados[i.chave]?.principal ?? true));
  const visiveis = etapas ? itens : principais;
  return (
    <Cartao data-testid={`secao-${grupo}`}>
      <CartaoCabecalho>
        <CartaoTitulo>{tituloGrupos[grupo]}</CartaoTitulo>
      </CartaoCabecalho>
      <CartaoConteudo className="flex flex-col gap-3">
        <Tabela>
          <Cabeca>
            <Th>Item</Th>
            <Th className="text-right">Exigência por dia</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {visiveis.map((i) => (
              <LinhaItem key={i.chave} item={i} grupo={grupo} colunas={3} />
            ))}
          </tbody>
        </Tabela>
        {intermediarias.length > 0 && (
          <div>
            <Botao variante="fantasma" tamanho="pequeno" onClick={() => setEtapas((e) => !e)}>
              {etapas ? (
                <ChevronUp className="size-4" aria-hidden />
              ) : (
                <ChevronDown className="size-4" aria-hidden />
              )}
              {etapas
                ? 'Esconder etapas intermediárias'
                : `Mostrar etapas intermediárias (${intermediarias.length})`}
            </Botao>
          </div>
        )}
      </CartaoConteudo>
    </Cartao>
  );
}

function LinhaItem({
  item,
  grupo,
  colunas,
}: {
  item: ItemExigencia;
  grupo: GrupoResultadoExigencia;
  colunas: number;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Linha data-testid={`linha-${item.chave}`}>
        <Td>
          <div className="flex flex-col">
            <span>{nomeDe(item.chave)}</span>
            <MotivoCurto item={item} />
            <BotaoComo aberto={aberto} aoMudar={setAberto} />
          </div>
        </Td>
        <Td className="text-right">
          <CelulaValor item={item} grupo={grupo} />
        </Td>
        <Td>
          <SeloSituacao item={item} />
        </Td>
      </Linha>
      {aberto && (
        <tr className="bg-superficie-2">
          <td colSpan={colunas} className="px-3 py-3">
            <DetalheCalculo itens={[item]} grupo={grupo} />
          </td>
        </tr>
      )}
    </>
  );
}

function BotaoComo({ aberto, aoMudar }: { aberto: boolean; aoMudar: (a: boolean) => void }) {
  return (
    <Botao
      variante="fantasma"
      tamanho="pequeno"
      className="mt-1 h-7 w-fit px-2 whitespace-nowrap text-marca"
      aria-expanded={aberto}
      onClick={() => aoMudar(!aberto)}
    >
      {aberto ? 'Fechar explicação' : 'Como foi calculado?'}
    </Botao>
  );
}

export function SecaoMinerais({ itens }: { itens: ItemExigencia[] }) {
  const porChave = new Map(itens.map((i) => [i.chave, i]));
  const [aberto, setAberto] = useState<string | null>(null);
  const caP = porChave.get('CaP');
  return (
    <Cartao data-testid="secao-minerais">
      <CartaoCabecalho>
        <CartaoTitulo>{tituloGrupos.minerais}</CartaoTitulo>
        <CartaoDescricao>
          “Na dieta” é a exigência dietética: a líquida dividida pelo coeficiente de retenção do
          mineral. Não é o teor de mineral da dieta nem a disponibilidade de uma fonte mineral.
        </CartaoDescricao>
      </CartaoCabecalho>
      <CartaoConteudo className="flex flex-col gap-3">
        <Tabela>
          <Cabeca>
            <Th>Mineral</Th>
            <Th className="text-right whitespace-normal">Mantença (g/dia)</Th>
            <Th className="text-right whitespace-normal">Ganho (g/dia)</Th>
            <Th className="text-right whitespace-normal">Na dieta (g/dia)</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {Object.keys(minerais).map((m) => {
              const etapas = (['mantenca', 'ganho', 'liquida', 'dietetica'] as const).map((e) =>
                porChave.get(`${m}.${e}`)!,
              );
              const dieta = etapas[3]!;
              const pior = etapas.find((e) => !e.usoOperacional) ?? dieta;
              return (
                <MineralLinha
                  key={m}
                  mineral={m}
                  etapas={etapas}
                  dieta={dieta}
                  pior={pior}
                  aberto={aberto === m}
                  aoMudar={(a) => setAberto(a ? m : null)}
                />
              );
            })}
          </tbody>
        </Tabela>
        {caP && (
          <Tabela>
            <tbody>
              <LinhaItem item={caP} grupo="minerais" colunas={3} />
            </tbody>
          </Tabela>
        )}
      </CartaoConteudo>
    </Cartao>
  );
}

function MineralLinha({
  mineral,
  etapas,
  dieta,
  pior,
  aberto,
  aoMudar,
}: {
  mineral: string;
  etapas: ItemExigencia[];
  dieta: ItemExigencia;
  pior: ItemExigencia;
  aberto: boolean;
  aoMudar: (a: boolean) => void;
}) {
  return (
    <>
      <Linha data-testid={`linha-${mineral}`}>
        <Td>
          <div className="flex flex-col">
            <span>{minerais[mineral]}</span>
            <MotivoCurto item={pior} />
            <BotaoComo aberto={aberto} aoMudar={aoMudar} />
          </div>
        </Td>
        {[etapas[0]!, etapas[1]!, dieta].map((e) => (
          <Td key={e.chave} className="text-right">
            <CelulaValor item={e} grupo="minerais" semUnidade />
          </Td>
        ))}
        <Td>
          <SeloSituacao item={dieta} />
        </Td>
      </Linha>
      {aberto && (
        <tr className="bg-superficie-2">
          <td colSpan={5} className="px-3 py-3">
            <DetalheCalculo itens={etapas} grupo="minerais" />
          </td>
        </tr>
      )}
    </>
  );
}

function DetalheCalculo({
  itens,
  grupo,
}: {
  itens: ItemExigencia[];
  grupo: GrupoResultadoExigencia;
}) {
  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="detalhe-calculo">
      {itens.map((i) => (
        <div key={i.chave} className="flex flex-col gap-1.5">
          <p className="font-medium">
            {nomeDe(i.chave)} <span className="text-texto-suave">({i.equacaoId})</span>
          </p>
          <p className="text-texto-suave">{i.descricao}</p>
          <p>
            <span className="font-medium">Resultado: </span>
            {i.valor === null ? (
              'não calculado'
            ) : i.usoOperacional ? (
              <span title={`Valor integral: ${integral(i.valor)}`}>
                {comUnidade(numero(i.valor, casas(i, grupo)), i.unidade)}
              </span>
            ) : (
              <span className="text-alerta" title={`Valor integral: ${integral(i.valor)}`}>
                {comUnidade(legivel(i.valor), i.unidade)}: valor só para análise, fora do domínio
                validado; não é recomendação.
              </span>
            )}
          </p>
          {Object.keys(i.entradas).length > 0 && (
            <p>
              <span className="font-medium">Entradas: </span>
              {Object.entries(i.entradas)
                .map(
                  ([n, v]) =>
                    `${variaveis[n] ?? nomeDe(n)} = ${comUnidade(legivel(v.valor), v.unidade)}`,
                )
                .join('; ')}
            </p>
          )}
          {Object.keys(i.coeficientes).length > 0 && (
            <p>
              <span className="font-medium">Coeficientes: </span>
              {Object.entries(i.coeficientes)
                .map(([n, v]) => `${n} = ${integral(v)}`)
                .join('; ')}
            </p>
          )}
          {i.referencias.length > 0 && (
            <p>
              <span className="font-medium">Fonte: </span>BR-CORTE 2023,{' '}
              {i.referencias
                .map((r) => `cap. ${r.capitulo}, p. ${r.pagina} (${r.local})`)
                .join('; ')}
              .
            </p>
          )}
          {i.motivos.length > 0 && (
            <div>
              <span className="font-medium">Por que não pode ser usado: </span>
              <ul className="list-disc pl-5">
                {i.motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {i.avisos.length > 0 && (
            <div>
              <span className="font-medium">Avisos (limitações): </span>
              <ul className="list-disc pl-5">
                {i.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {i.notas.length > 0 && (
            <div className="text-texto-suave">
              <span className="font-medium">Observações: </span>
              <ul className="list-disc pl-5">
                {i.notas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-texto-suave">
            {i.aprovacao
              ? `Equação conferida na página do livro e aprovada pelo usuário em ${formatarData(i.aprovacao.data)}.`
              : 'Valor informado por você; não é equação do livro.'}
          </p>
        </div>
      ))}
    </div>
  );
}
