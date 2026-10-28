import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  BASES_NUTRICIONAIS,
  direcaoSugeridaPorGrupo,
  DIRECOES_CONSERVADORAS,
  GRUPOS_NUTRIENTE,
  UNIDADES_NUTRICIONAIS,
  type BaseNutricional,
  type DirecaoConservadora,
  type GrupoNutriente,
  type UnidadeNutricional,
} from '@pecuaria/domain';
import { esquemaDadosNutriente, type DadosNutriente, type Nutriente } from '@pecuaria/shared-types';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoAlimentos, useFontes, useNutrientes } from '../../lib/consultas-alimentos';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, opcoesDe, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import {
  avisosAlimentos,
  basesPorExtenso,
  descreverFonte,
  direcoes,
  gruposNutriente,
  situacoesFundamentacao,
  unidadesNutricionais,
} from '../../textos-alimentos';
import { CampoTexto, errosDe, nulo } from './componentes-alimentos';

function ModalNutriente({ n, aoFechar }: { n: Nutriente | null; aoFechar: () => void }) {
  const fontes = useFontes({ origem: null });
  const [v, setV] = useState({
    codigo: n?.codigo ?? '',
    nome: n?.nome ?? '',
    grupo: (n?.grupo ?? '') as GrupoNutriente | '',
    unidadeReferencia: (n?.unidadeReferencia ?? 'pct') as UnidadeNutricional,
    baseReferencia: (n?.baseReferencia ?? 'ms') as BaseNutricional,
    direcaoConservadora: (n?.direcaoConservadora ?? '') as DirecaoConservadora | '',
    metodoAnalitico: n?.metodoAnalitico ?? '',
    fundamentar: n?.situacaoFundamentacao === 'fundamentada',
    fundamentacaoFonteId: n?.fundamentacaoFonte?.id ?? '',
    fundamentacaoReferencia: n?.fundamentacaoReferencia ?? '',
    descricao: n?.descricao ?? '',
    ativo: n?.ativo ?? true,
    motivo: '',
  });
  const [erros, setErros] = useState<string[]>([]);
  const criar = useAcaoAlimentos('nutriente:criar');
  const atualizar = useAcaoAlimentos('nutriente:atualizar');
  const sistema = n?.origemDefinicao === 'sistema';
  const congelada = (n?.nValores ?? 0) > 0;
  const bibliograficas = (fontes.data ?? []).filter(
    (f) => !f.excluidaEm && (f.origem === 'tabela_compilada' || f.origem === 'estudo_individual'),
  );
  return (
    <Modal
      aberto
      largura="lg"
      titulo={n ? `Editar definição ${n.codigo}` : 'Nova definição de nutriente'}
      descricao="Uma definição é o que o número significa: nutriente, unidade, base e método. Variantes de método são definições diferentes."
      aoFechar={aoFechar}
      erros={erros}
      enviando={criar.isPending || atualizar.isPending}
      aoEnviar={() => {
        const grupo = v.grupo as GrupoNutriente;
        const dados: DadosNutriente = {
          codigo: v.codigo,
          nome: v.nome,
          grupo,
          unidadeReferencia: v.unidadeReferencia,
          baseReferencia: v.baseReferencia,
          direcaoConservadora: (v.direcaoConservadora ||
            (v.grupo ? direcaoSugeridaPorGrupo(grupo) : '')) as DirecaoConservadora,
          metodoAnalitico: nulo(v.metodoAnalitico),
          situacaoFundamentacao: v.fundamentar ? 'fundamentada' : 'pendente',
          fundamentacaoFonteId: nulo(v.fundamentacaoFonteId),
          fundamentacaoReferencia: nulo(v.fundamentacaoReferencia),
          descricao: nulo(v.descricao),
          ativo: v.ativo,
        };
        const r = esquemaDadosNutriente.safeParse(dados);
        if (!r.success) {
          setErros(r.error.issues.map((i) => i.message));
          return;
        }
        if (n && !v.motivo.trim()) {
          setErros(['Informe o motivo da alteração.']);
          return;
        }
        const op = { onSuccess: aoFechar, onError: (e: unknown) => setErros(errosDe(e)) };
        if (n) atualizar.mutate({ id: n.id, dados, motivo: v.motivo }, op);
        else criar.mutate({ dados }, op);
      }}
    >
      {congelada && (
        <Alerta
          tom="info"
          titulo={`Esta definição já tem ${n!.nValores} valor(es): grupo, unidade, base, método e fundamentação não mudam. Uma variante de método vira nova definição.`}
        />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Código" obrigatorio ajuda="Ex.: FDNcp. Não muda depois de cadastrado.">
          {(p) => (
            <Entrada
              {...p}
              value={v.codigo}
              disabled={Boolean(n)}
              onChange={(e) => setV({ ...v, codigo: e.target.value })}
            />
          )}
        </Campo>
        <CampoTexto
          rotulo="Nome"
          obrigatorio
          valor={v.nome}
          aoMudar={(x) => setV({ ...v, nome: x })}
        />
        <Campo rotulo="Grupo" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={v.grupo}
              disabled={sistema || congelada}
              onChange={(e) => setV({ ...v, grupo: e.target.value as GrupoNutriente })}
            >
              <option value="">Selecione</option>
              {opcoesDe(gruposNutriente, GRUPOS_NUTRIENTE)}
            </Selecao>
          )}
        </Campo>
        <Campo
          rotulo="Direção conservadora"
          ajuda={
            v.grupo
              ? `Pela regra aprovada (seção 5.4) para o grupo: ${direcoes[direcaoSugeridaPorGrupo(v.grupo)]}.`
              : 'Usada nos cenários (Fase 5D).'
          }
        >
          {(p) => (
            <Selecao
              {...p}
              value={v.direcaoConservadora}
              onChange={(e) =>
                setV({ ...v, direcaoConservadora: e.target.value as DirecaoConservadora })
              }
            >
              <option value="">Pela regra do grupo</option>
              {opcoesDe(direcoes, DIRECOES_CONSERVADORAS)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Unidade de referência" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={v.unidadeReferencia}
              disabled={sistema || congelada}
              onChange={(e) =>
                setV({ ...v, unidadeReferencia: e.target.value as UnidadeNutricional })
              }
            >
              {opcoesDe(unidadesNutricionais, UNIDADES_NUTRICIONAIS)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Base de referência" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={v.baseReferencia}
              disabled={sistema || congelada}
              onChange={(e) => setV({ ...v, baseReferencia: e.target.value as BaseNutricional })}
            >
              {opcoesDe(basesPorExtenso, BASES_NUTRICIONAIS)}
            </Selecao>
          )}
        </Campo>
      </div>
      <CampoTexto
        rotulo="Método analítico"
        valor={v.metodoAnalitico}
        aoMudar={(x) => setV({ ...v, metodoAnalitico: x })}
        ajuda="Só como descrito numa publicação cadastrada. Sem ela, a definição fica pendente."
      />
      <CaixaMarcar
        rotulo="Fundamentada: método conferido em fonte cadastrada, com página ou tabela"
        marcado={v.fundamentar}
        aoMudar={(x) => setV({ ...v, fundamentar: x })}
        disabled={congelada}
      />
      {(v.fundamentar || v.fundamentacaoFonteId) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Fonte da fundamentação" obrigatorio={v.fundamentar}>
            {(p) => (
              <Selecao
                {...p}
                value={v.fundamentacaoFonteId}
                disabled={congelada}
                onChange={(e) => setV({ ...v, fundamentacaoFonteId: e.target.value })}
              >
                <option value="">Selecione</option>
                {bibliograficas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {descreverFonte(f)}
                  </option>
                ))}
              </Selecao>
            )}
          </Campo>
          <CampoTexto
            rotulo="Página ou tabela"
            obrigatorio={v.fundamentar}
            valor={v.fundamentacaoReferencia}
            aoMudar={(x) => setV({ ...v, fundamentacaoReferencia: x })}
          />
        </div>
      )}
      <CampoTexto
        rotulo="Descrição"
        multilinha
        valor={v.descricao}
        aoMudar={(x) => setV({ ...v, descricao: x })}
      />
      <CaixaMarcar
        rotulo="Ativa (recebe valores novos)"
        marcado={v.ativo}
        aoMudar={(x) => setV({ ...v, ativo: x })}
      />
      {n && (
        <CampoTexto
          rotulo="Motivo da alteração"
          obrigatorio
          valor={v.motivo}
          aoMudar={(x) => setV({ ...v, motivo: x })}
        />
      )}
    </Modal>
  );
}

export function PaginaNutrientes() {
  const [inativos, setInativos] = useState(false);
  const [modal, setModal] = useState<Nutriente | 'nova' | null>(null);
  const lista = useNutrientes(inativos);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Definições de nutrientes"
        descricao="Catálogo do que cada número significa. Não contém valores de composição."
        acoes={
          <Botao onClick={() => setModal('nova')}>
            <Plus className="size-4" aria-hidden />
            Nova definição
          </Botao>
        }
      />
      <Alerta tom="alerta" titulo={avisosAlimentos.pendente} />
      {lista.isError && <Alerta tom="perigo" titulo={mensagemDeErro(lista.error)} />}
      <CaixaMarcar rotulo="Incluir definições inativas" marcado={inativos} aoMudar={setInativos} />
      <Tabela data-testid="tabela-nutrientes">
        <Cabeca>
          <Th>Código</Th>
          <Th>Nome e grupo</Th>
          <Th>Referência</Th>
          <Th>Direção conservadora</Th>
          <Th>Método e fundamentação</Th>
          <Th>Valores</Th>
          <Th>Ações</Th>
        </Cabeca>
        <tbody>
          {(lista.data ?? []).map((n) => (
            <Linha key={n.id}>
              <Td className="font-medium">
                {n.codigo}
                {n.origemDefinicao === 'sistema' && (
                  <span className="block text-xs font-normal text-texto-suave">
                    Catálogo inicial
                  </span>
                )}
              </Td>
              <Td>
                {n.nome}
                <span className="block text-xs text-texto-suave">{gruposNutriente[n.grupo]}</span>
              </Td>
              <Td className="whitespace-nowrap">
                {unidadesNutricionais[n.unidadeReferencia]} · {basesPorExtenso[n.baseReferencia]}
              </Td>
              <Td>
                {direcoes[n.direcaoConservadora]}
                {n.direcaoConservadora !== n.direcaoSugerida && (
                  <span className="block text-xs text-alerta">
                    Regra do grupo: {direcoes[n.direcaoSugerida]}
                  </span>
                )}
              </Td>
              <Td>
                <Selo tom={n.situacaoFundamentacao === 'pendente' ? 'alerta' : 'sucesso'}>
                  {situacoesFundamentacao[n.situacaoFundamentacao]}
                </Selo>
                {n.metodoAnalitico && <span className="block text-xs">{n.metodoAnalitico}</span>}
                {n.fundamentacaoFonte && (
                  <span className="block text-xs text-texto-suave">
                    {descreverFonte(n.fundamentacaoFonte)}, {n.fundamentacaoReferencia}
                  </span>
                )}
              </Td>
              <Td>{n.nValores}</Td>
              <Td>
                <Botao tamanho="pequeno" variante="secundario" onClick={() => setModal(n)}>
                  Editar
                </Botao>
                {!n.ativo && <Selo className="ml-1">Inativa</Selo>}
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
      {modal && (
        <ModalNutriente n={modal === 'nova' ? null : modal} aoFechar={() => setModal(null)} />
      )}
    </div>
  );
}
