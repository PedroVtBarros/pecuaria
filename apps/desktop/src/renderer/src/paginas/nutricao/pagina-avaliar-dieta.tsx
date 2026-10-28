import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Calculator, Plus, Save, Trash2 } from 'lucide-react';
import {
  esquemaEntradaAvaliacaoDieta,
  GRUPOS_EXIGENCIA,
  SEXOS_EXIGENCIA,
  SISTEMAS_EXIGENCIA,
  TIPOS_QUANTIDADE_DIETA,
  type AvaliacaoDietaCalculada,
  type EntradaAvaliacaoDieta,
  type FonteCmsExigencia,
  type GrupoExigencia,
  type PerfilParaDieta,
  type SexoExigencia,
  type SistemaExigencia,
  type TipoQuantidadeDieta,
} from '@pecuaria/shared-types';
import { textoParaNumero, vazioParaNulo } from '../../hooks/use-formulario';
import { ErroChamadaApi, mensagemDeErro } from '../../lib/api';
import {
  useAvaliarDieta,
  usePerfisParaDieta,
  useRegistrarAvaliacao,
} from '../../lib/consultas-nutricao';
import {
  basesQuantidade,
  cenariosPerfil,
  explicacaoTipoQuantidade,
  fontesCms,
  fontesCmsDoSistema,
  gruposGeneticos,
  sexos,
  sistemas,
  tiposPerfil,
  tiposQuantidade,
} from '../../textos-nutricao';
import { useNotificacoes } from '../../components/notificacoes';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import {
  Cartao,
  CartaoCabecalho,
  CartaoConteudo,
  CartaoDescricao,
  CartaoTitulo,
} from '../../components/ui/cartao';
import { AreaTexto, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { ResultadoAvaliacao } from './resultado-avaliacao';

/*
 * Fase 6B-5: avaliação de dieta. A tela só coleta a entrada e mostra o que o main calculou com os
 * perfis gravados (Fase 5D) e o motor. Simular não grava nada; gravar é explícito e o main confere
 * que o retrato recalculado é o exibido (D-6B4-02). Oferta, consumo observado e consumo assumido
 * ficam distintos (C-6B-01); exigência, oferta e balanço em blocos separados (regra 3e).
 */

type FontePrevista = Exclude<FonteCmsExigencia, 'informado'>;

interface ItemForm {
  chave: number;
  perfilId: string;
  quantidade: string;
  base: 'mn' | 'ms';
  sobras: string;
}

interface Animal {
  grupo: GrupoExigencia;
  sexo: SexoExigencia;
  sistema: SistemaExigencia;
  pcKg: string;
  gmdKgDia: string;
  fonteCms: FontePrevista;
  ncPctMs: string;
  cmssKgDia: string;
}

const previstas = (s: SistemaExigencia) =>
  fontesCmsDoSistema[s].filter((f): f is FontePrevista => f !== 'informado');

function converter(animal: Animal, tipo: TipoQuantidadeDieta, itens: ItemForm[]) {
  const cmsPrevisto =
    animal.fonteCms === 'concentrado'
      ? { fonte: animal.fonteCms, ncPctMs: textoParaNumero(animal.ncPctMs) }
      : animal.fonteCms === 'pasto'
        ? { fonte: animal.fonteCms, cmssKgDia: textoParaNumero(animal.cmssKgDia) }
        : { fonte: animal.fonteCms };
  return {
    animal: {
      grupo: animal.grupo,
      sexo: animal.sexo,
      sistema: animal.sistema,
      pcKg: textoParaNumero(animal.pcKg),
      gmdKgDia: textoParaNumero(animal.gmdKgDia),
    },
    cmsPrevisto,
    dieta: {
      tipo,
      itens: itens.map((i) => ({
        perfilId: i.perfilId,
        quantidadeKgDia: textoParaNumero(i.quantidade),
        base: i.base,
        sobrasKgDia: tipo === 'consumo_observado' ? textoParaNumero(i.sobras) : null,
      })),
    },
  };
}

interface Erros {
  animal: Record<string, string>;
  itens: Record<number, Record<string, string>>;
  gerais: string[];
}
const SEM_ERROS: Erros = { animal: {}, itens: {}, gerais: [] };

function validar(dados: unknown): { entrada: EntradaAvaliacaoDieta } | { erros: Erros } {
  const r = esquemaEntradaAvaliacaoDieta.safeParse(dados);
  if (r.success) return { entrada: r.data };
  const erros: Erros = { animal: {}, itens: {}, gerais: [] };
  for (const p of r.error.issues) {
    const caminho = [...p.path];
    const campo = [...caminho].reverse().find((x) => typeof x === 'string');
    if (caminho[0] === 'dieta' && caminho[1] === 'itens' && typeof caminho[2] === 'number') {
      const k = caminho[2];
      erros.itens[k] = { ...erros.itens[k], [String(caminho[3] ?? 'perfilId')]: p.message };
    } else if ((caminho[0] === 'animal' || caminho[0] === 'cmsPrevisto') && campo)
      erros.animal[String(campo)] ??= p.message;
    else erros.gerais.push(p.message);
  }
  return { erros };
}

let proximaChave = 1;
const itemVazio = (): ItemForm => ({
  chave: proximaChave++,
  perfilId: '',
  quantidade: '',
  base: 'mn',
  sobras: '',
});

const rotuloPerfil = (p: PerfilParaDieta) =>
  `${p.alimentoNome} — ${p.nome} (${tiposPerfil[p.tipo] ?? p.tipo}, ${cenariosPerfil[p.cenario] ?? p.cenario})`;

export function PaginaAvaliarDieta() {
  const perfis = usePerfisParaDieta();
  const avaliar = useAvaliarDieta();
  const [animal, setAnimal] = useState<Animal>({
    grupo: 'zebuino',
    sexo: 'macho_nao_castrado',
    sistema: 'confinamento',
    pcKg: '',
    gmdKgDia: '',
    fonteCms: 'confinamento',
    ncPctMs: '',
    cmssKgDia: '',
  });
  const [tipo, setTipo] = useState<TipoQuantidadeDieta>('consumo_assumido_sem_sobras');
  const [itens, setItens] = useState<ItemForm[]>(() => [itemVazio()]);
  const [erros, setErros] = useState<Erros>(SEM_ERROS);
  const [resultado, setResultado] = useState<AvaliacaoDietaCalculada | null>(null);
  const [gravando, setGravando] = useState(false);
  const [verInelegiveis, setVerInelegiveis] = useState(false);
  // D-6B4-02: o main recusou a gravação porque os dados mudaram; exige nova avaliação.
  const [recusado, setRecusado] = useState(false);

  const elegiveis = (perfis.data ?? []).filter((p) => p.elegivel);
  const inelegiveis = (perfis.data ?? []).filter((p) => !p.elegivel);
  const desatualizado =
    resultado !== null &&
    JSON.stringify(validar(converter(animal, tipo, itens))) !==
      JSON.stringify({ entrada: resultado.entrada });

  const mudarAnimal = <K extends keyof Animal>(campo: K, valor: Animal[K]) => {
    setAnimal((a) => ({ ...a, [campo]: valor }));
    setErros((e) => ({ ...e, animal: { ...e.animal, [campo]: '' } }));
  };
  const mudarItem = (chave: number, mudanca: Partial<ItemForm>) =>
    setItens((xs) => xs.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));

  const simular = () => {
    const v = validar(converter(animal, tipo, itens));
    if ('erros' in v) {
      setErros(v.erros);
      return;
    }
    setErros(SEM_ERROS);
    avaliar.mutate(v.entrada, {
      onSuccess: (r) => {
        setResultado(r);
        setRecusado(false);
      },
      onError: (e) =>
        setErros({
          ...SEM_ERROS,
          gerais:
            e instanceof ErroChamadaApi && e.detalhes.length > 0 ? e.detalhes : [mensagemDeErro(e)],
        }),
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Avaliar dieta"
        descricao="Compara a exigência do animal com o que a dieta fornece, pelos perfis de composição gravados e pelo BR-CORTE 2023."
      />
      <Alerta tom="info" titulo="Simular não grava nada">
        “Avaliar” só calcula. Para guardar o resultado, use “Gravar avaliação”: o retrato fica
        imutável, com os dados, as hipóteses, as versões e o código de conferência (SHA-256).
      </Alerta>

      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>Animal</CartaoTitulo>
          <CartaoDescricao>
            Bovino de corte em crescimento ou terminação, informado à mão (o sistema não deduz grupo
            genético nem castração do cadastro).
          </CartaoDescricao>
        </CartaoCabecalho>
        <CartaoConteudo className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Campo rotulo="Grupo genético" obrigatorio>
              {(p) => (
                <Selecao
                  {...p}
                  value={animal.grupo}
                  onChange={(e) => mudarAnimal('grupo', e.target.value as GrupoExigencia)}
                >
                  {opcoesDe(gruposGeneticos, GRUPOS_EXIGENCIA)}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Classe sexual" obrigatorio>
              {(p) => (
                <Selecao
                  {...p}
                  value={animal.sexo}
                  onChange={(e) => mudarAnimal('sexo', e.target.value as SexoExigencia)}
                >
                  {opcoesDe(sexos, SEXOS_EXIGENCIA)}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Sistema de produção" obrigatorio>
              {(p) => (
                <Selecao
                  {...p}
                  value={animal.sistema}
                  onChange={(e) => {
                    const s = e.target.value as SistemaExigencia;
                    mudarAnimal('sistema', s);
                    if (!previstas(s).includes(animal.fonteCms))
                      mudarAnimal('fonteCms', previstas(s)[0]!);
                  }}
                >
                  {opcoesDe(sistemas, SISTEMAS_EXIGENCIA)}
                </Selecao>
              )}
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Peso corporal médio (kg)"
              obrigatorio
              erro={erros.animal['pcKg'] || undefined}
            >
              {(p) => (
                <Entrada
                  {...p}
                  inputMode="decimal"
                  value={animal.pcKg}
                  onChange={(e) => mudarAnimal('pcKg', e.target.value)}
                />
              )}
            </Campo>
            <Campo
              rotulo="Ganho médio diário desejado (kg/dia)"
              obrigatorio
              erro={erros.animal['gmdKgDia'] || undefined}
              ajuda="O ganho planejado; não é o GMD observado nas pesagens."
            >
              {(p) => (
                <Entrada
                  {...p}
                  inputMode="decimal"
                  value={animal.gmdKgDia}
                  onChange={(e) => mudarAnimal('gmdKgDia', e.target.value)}
                />
              )}
            </Campo>
          </div>
          <Campo
            rotulo="CMS previsto (mostrado à parte)"
            obrigatorio
            ajuda="Com consumo observado ou assumido, as exigências usam a matéria seca consumida; o CMS previsto aparece só para comparação. Com a dieta só oferecida, as exigências usam o CMS previsto."
          >
            {(p) => (
              <Selecao
                {...p}
                value={animal.fonteCms}
                onChange={(e) => mudarAnimal('fonteCms', e.target.value as FontePrevista)}
              >
                {opcoesDe(fontesCms, previstas(animal.sistema))}
              </Selecao>
            )}
          </Campo>
          {animal.fonteCms === 'concentrado' && (
            <Campo
              rotulo="Teor de concentrado (% da MS da dieta)"
              obrigatorio
              erro={erros.animal['ncPctMs'] || undefined}
            >
              {(p) => (
                <Entrada
                  {...p}
                  inputMode="decimal"
                  value={animal.ncPctMs}
                  onChange={(e) => mudarAnimal('ncPctMs', e.target.value)}
                />
              )}
            </Campo>
          )}
          {animal.fonteCms === 'pasto' && (
            <Campo
              rotulo="Consumo de suplemento (kg/dia)"
              obrigatorio
              erro={erros.animal['cmssKgDia'] || undefined}
            >
              {(p) => (
                <Entrada
                  {...p}
                  inputMode="decimal"
                  value={animal.cmssKgDia}
                  onChange={(e) => mudarAnimal('cmssKgDia', e.target.value)}
                />
              )}
            </Campo>
          )}
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho>
          <CartaoTitulo>Dieta</CartaoTitulo>
          <CartaoDescricao>
            Por cabeça e por dia. Só perfis elegíveis podem ser escolhidos.
          </CartaoDescricao>
        </CartaoCabecalho>
        <CartaoConteudo className="flex flex-col gap-4">
          <Campo
            rotulo="O que a quantidade representa"
            obrigatorio
            ajuda={explicacaoTipoQuantidade[tipo]}
          >
            {(p) => (
              <Selecao
                {...p}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoQuantidadeDieta)}
              >
                {opcoesDe(tiposQuantidade, TIPOS_QUANTIDADE_DIETA)}
              </Selecao>
            )}
          </Campo>

          {perfis.isSuccess && elegiveis.length === 0 && (
            <Alerta tom="alerta" titulo="Nenhum perfil elegível">
              Grave um perfil de composição no banco de alimentos (aba “Seleção”), a partir de
              registros conferidos e com a regra de seleção vigente aprovada.
            </Alerta>
          )}
          {perfis.isError && (
            <Alerta tom="perigo" titulo="Não foi possível carregar os perfis">
              {mensagemDeErro(perfis.error)}
            </Alerta>
          )}

          {itens.map((i, k) => (
            <div
              key={i.chave}
              className="grid grid-cols-1 gap-3 rounded-lg border border-borda p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
              data-testid={`item-dieta-${k + 1}`}
            >
              <Campo
                rotulo={`Alimento ${k + 1}: perfil de composição`}
                obrigatorio
                erro={erros.itens[k]?.['perfilId']}
              >
                {(p) => (
                  <Selecao
                    {...p}
                    value={i.perfilId}
                    onChange={(e) => mudarItem(i.chave, { perfilId: e.target.value })}
                  >
                    <option value="">Escolha um perfil elegível</option>
                    {elegiveis.map((x) => (
                      <option key={x.perfilId} value={x.perfilId}>
                        {rotuloPerfil(x)}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo
                rotulo="Quantidade (kg/dia)"
                obrigatorio
                erro={erros.itens[k]?.['quantidadeKgDia']}
              >
                {(p) => (
                  <Entrada
                    {...p}
                    inputMode="decimal"
                    value={i.quantidade}
                    onChange={(e) => mudarItem(i.chave, { quantidade: e.target.value })}
                  />
                )}
              </Campo>
              <Campo rotulo="Base da quantidade" obrigatorio>
                {(p) => (
                  <Selecao
                    {...p}
                    value={i.base}
                    onChange={(e) => mudarItem(i.chave, { base: e.target.value as 'mn' | 'ms' })}
                  >
                    {opcoesDe(basesQuantidade)}
                  </Selecao>
                )}
              </Campo>
              {tipo === 'consumo_observado' ? (
                <Campo
                  rotulo="Sobras medidas (kg/dia)"
                  obrigatorio
                  erro={erros.itens[k]?.['sobrasKgDia']}
                >
                  {(p) => (
                    <Entrada
                      {...p}
                      inputMode="decimal"
                      value={i.sobras}
                      onChange={(e) => mudarItem(i.chave, { sobras: e.target.value })}
                    />
                  )}
                </Campo>
              ) : (
                <div />
              )}
              <div className="flex items-end">
                <Botao
                  variante="fantasma"
                  tamanho="icone"
                  aria-label={`Remover alimento ${k + 1}`}
                  disabled={itens.length === 1}
                  onClick={() => setItens((xs) => xs.filter((x) => x.chave !== i.chave))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Botao>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" onClick={() => setItens((xs) => [...xs, itemVazio()])}>
              <Plus className="size-4" aria-hidden />
              Adicionar alimento
            </Botao>
            {inelegiveis.length > 0 && (
              <Botao variante="fantasma" onClick={() => setVerInelegiveis((v) => !v)}>
                {verInelegiveis
                  ? 'Esconder perfis inelegíveis'
                  : `Por que ${inelegiveis.length} perfil(is) não aparece(m)?`}
              </Botao>
            )}
          </div>
          {verInelegiveis && (
            <div className="flex flex-col gap-2 text-sm" data-testid="perfis-inelegiveis">
              {inelegiveis.map((p) => (
                <div key={p.perfilId} className="rounded-lg border border-borda p-3">
                  <p className="font-medium">{rotuloPerfil(p)}</p>
                  <ul className="list-disc pl-5 text-perigo">
                    {p.motivosInelegibilidade.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {erros.gerais.length > 0 && (
            <Alerta tom="perigo" titulo="Não foi possível avaliar">
              {erros.gerais.join(' ')}
            </Alerta>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao onClick={simular} carregando={avaliar.isPending}>
              <Calculator className="size-4" aria-hidden />
              Avaliar (simular, sem gravar)
            </Botao>
            {resultado && (
              <Botao
                variante="secundario"
                disabled={desatualizado || recusado || resultado.conteudoSha256 === null}
                onClick={() => setGravando(true)}
              >
                <Save className="size-4" aria-hidden />
                Gravar avaliação
              </Botao>
            )}
          </div>
        </CartaoConteudo>
      </Cartao>

      {resultado && (desatualizado || recusado) && (
        <Alerta tom="alerta" titulo="Avalie de novo antes de gravar">
          {recusado
            ? 'Os dados mudaram desde a avaliação exibida (perfis, registros, regra ou motor). O resultado abaixo é antigo: clique em “Avaliar” de novo.'
            : 'Os dados do formulário mudaram. O resultado abaixo é da avaliação anterior.'}
        </Alerta>
      )}
      {resultado?.naoGravavel && (
        <Alerta tom="perigo" titulo="Esta avaliação não pode ser gravada">
          {resultado.naoGravavel}
        </Alerta>
      )}
      {resultado && <ResultadoAvaliacao avaliacao={resultado} />}

      {resultado && gravando && (
        <ModalGravar
          avaliacao={resultado}
          aoFechar={() => setGravando(false)}
          aoRecusar={() => {
            setGravando(false);
            setRecusado(true);
          }}
        />
      )}
    </div>
  );
}

function ModalGravar({
  avaliacao,
  aoFechar,
  aoRecusar,
}: {
  avaliacao: AvaliacaoDietaCalculada;
  aoFechar: () => void;
  aoRecusar: () => void;
}) {
  const registrar = useRegistrarAvaliacao();
  const navegar = useNavigate();
  const { notificar } = useNotificacoes();
  const [rotulo, setRotulo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const enviar = () =>
    registrar.mutate(
      {
        entrada: avaliacao.entrada,
        conteudoSha256Exibido: avaliacao.conteudoSha256 ?? '',
        rotulo,
        observacao: vazioParaNulo(observacao),
        responsavel,
      },
      {
        onSuccess: (g) => {
          notificar('Avaliação gravada.', 'sucesso');
          void navegar(`/nutricao/avaliacoes/${g.id}`);
        },
        onError: (e) => {
          if (e instanceof ErroChamadaApi && e.codigo === 'DADOS_DESATUALIZADOS') {
            notificar(e.message, 'perigo');
            aoRecusar();
            return;
          }
          setErros(
            e instanceof ErroChamadaApi && e.detalhes.length > 0 ? e.detalhes : [mensagemDeErro(e)],
          );
        },
      },
    );
  return (
    <Modal
      aberto
      titulo="Gravar avaliação"
      descricao="O retrato gravado não muda depois: dados, hipóteses, perfis, versões e resultados ficam como exibidos. Para corrigir, anule e grave outra."
      aoFechar={aoFechar}
      aoEnviar={enviar}
      textoEnviar="Gravar"
      enviando={registrar.isPending}
      erros={erros}
    >
      {!avaliacao.situacao.usoOperacional && (
        <Alerta tom="alerta" titulo="Será gravada sem uso operacional">
          {avaliacao.situacao.bloqueios.join(' ')}
        </Alerta>
      )}
      {avaliacao.situacao.parcial && (
        <Alerta tom="alerta" titulo="Avaliação parcial">
          Será gravada como parcial; os motivos ficam no retrato.
        </Alerta>
      )}
      <Campo rotulo="Nome da avaliação" obrigatorio>
        {(p) => <Entrada {...p} value={rotulo} onChange={(e) => setRotulo(e.target.value)} />}
      </Campo>
      <Campo rotulo="Observação">
        {(p) => (
          <AreaTexto {...p} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        )}
      </Campo>
      <Campo rotulo="Nome de quem grava" obrigatorio>
        {(p) => (
          <Entrada {...p} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        )}
      </Campo>
    </Modal>
  );
}
