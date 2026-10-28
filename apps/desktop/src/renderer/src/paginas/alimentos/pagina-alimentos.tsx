import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Wheat } from 'lucide-react';
import {
  CLASSES_ALIMENTO,
  FORMAS_CONSERVACAO,
  type ClasseAlimento,
  type FormaConservacao,
} from '@pecuaria/domain';
import { esquemaDadosAlimento, type Alimento, type DadosAlimento } from '@pecuaria/shared-types';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoAlimentos, useAlimentos } from '../../lib/consultas-alimentos';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, opcoesDe, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { avisosAlimentos, classesAlimento, formasConservacao } from '../../textos-alimentos';
import { CampoTexto, errosDe, nulo } from './componentes-alimentos';

interface ValoresAlimento {
  nome: string;
  especie: string;
  cultivar: string;
  partePlanta: string;
  formaConservacao: FormaConservacao | '';
  processamento: string;
  classe: ClasseAlimento | '';
  comercial: boolean;
  observacoes: string;
  motivo: string;
}

export function dadosDoFormularioAlimento(v: ValoresAlimento): DadosAlimento {
  return {
    nome: v.nome,
    especie: nulo(v.especie),
    cultivar: nulo(v.cultivar),
    partePlanta: nulo(v.partePlanta),
    formaConservacao: v.formaConservacao as FormaConservacao,
    processamento: nulo(v.processamento),
    classe: v.classe as ClasseAlimento,
    comercial: v.comercial,
    observacoes: nulo(v.observacoes),
  };
}

/** Campos de identidade do alimento (também usados no atalho de produto comercial). */
export function CamposAlimento({
  v,
  definir,
  ocultarComercial,
}: {
  v: ValoresAlimento;
  definir: <K extends keyof ValoresAlimento>(k: K, valor: ValoresAlimento[K]) => void;
  ocultarComercial?: boolean;
}) {
  return (
    <>
      <CampoTexto rotulo="Nome" obrigatorio valor={v.nome} aoMudar={(x) => definir('nome', x)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          rotulo="Forma de conservação"
          obrigatorio
          ajuda="Fresco e ensilado são alimentos diferentes."
        >
          {(p) => (
            <Selecao
              {...p}
              value={v.formaConservacao}
              onChange={(e) => definir('formaConservacao', e.target.value as FormaConservacao)}
            >
              <option value="">Selecione</option>
              {opcoesDe(formasConservacao, FORMAS_CONSERVACAO)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Classe" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={v.classe}
              onChange={(e) => definir('classe', e.target.value as ClasseAlimento)}
            >
              <option value="">Selecione</option>
              {opcoesDe(classesAlimento, CLASSES_ALIMENTO)}
            </Selecao>
          )}
        </Campo>
        <CampoTexto
          rotulo="Espécie (nome científico)"
          valor={v.especie}
          aoMudar={(x) => definir('especie', x)}
        />
        <CampoTexto rotulo="Cultivar" valor={v.cultivar} aoMudar={(x) => definir('cultivar', x)} />
        <CampoTexto
          rotulo="Parte da planta"
          valor={v.partePlanta}
          aoMudar={(x) => definir('partePlanta', x)}
        />
        <CampoTexto
          rotulo="Processamento"
          valor={v.processamento}
          aoMudar={(x) => definir('processamento', x)}
        />
      </div>
      {!ocultarComercial && (
        <CaixaMarcar
          rotulo="Produto comercial (cadastrado pelo rótulo)"
          marcado={v.comercial}
          aoMudar={(x) => definir('comercial', x)}
        />
      )}
      <CampoTexto
        rotulo="Observações"
        multilinha
        valor={v.observacoes}
        aoMudar={(x) => definir('observacoes', x)}
      />
    </>
  );
}

export function valoresIniciaisAlimento(a: Alimento | null): ValoresAlimento {
  return {
    nome: a?.nome ?? '',
    especie: a?.especie ?? '',
    cultivar: a?.cultivar ?? '',
    partePlanta: a?.partePlanta ?? '',
    formaConservacao: a?.formaConservacao ?? '',
    processamento: a?.processamento ?? '',
    classe: a?.classe ?? '',
    comercial: a?.comercial ?? false,
    observacoes: a?.observacoes ?? '',
    motivo: '',
  };
}

/** Cadastro (alimento nulo) ou edição com motivo. A identidade não muda com registros. */
export function ModalAlimento({
  alimento,
  comRegistros,
  aoFechar,
  aoSalvar,
}: {
  alimento: Alimento | null;
  comRegistros?: boolean;
  aoFechar: () => void;
  aoSalvar?: (id: string) => void;
}) {
  const [v, setV] = useState(() => valoresIniciaisAlimento(alimento));
  const [erros, setErros] = useState<string[]>([]);
  const criar = useAcaoAlimentos('alimento:criar');
  const atualizar = useAcaoAlimentos('alimento:atualizar');
  const definir = <K extends keyof ValoresAlimento>(k: K, valor: ValoresAlimento[K]) =>
    setV((atual) => ({ ...atual, [k]: valor }));
  return (
    <Modal
      aberto
      largura="lg"
      titulo={alimento ? 'Editar alimento' : 'Novo alimento'}
      descricao="Identidade do alimento, sem composição. Os valores entram pelos registros, com fonte."
      aoFechar={aoFechar}
      erros={erros}
      enviando={criar.isPending || atualizar.isPending}
      aoEnviar={() => {
        const dados = dadosDoFormularioAlimento(v);
        const r = esquemaDadosAlimento.safeParse(dados);
        if (!r.success) {
          setErros(r.error.issues.map((i) => i.message));
          return;
        }
        if (alimento && !v.motivo.trim()) {
          setErros(['Informe o motivo da alteração.']);
          return;
        }
        const feito = (x: { id: string }) => {
          aoSalvar?.(x.id);
          aoFechar();
        };
        if (alimento)
          atualizar.mutate(
            { id: alimento.id, dados, motivo: v.motivo },
            { onSuccess: feito, onError: (e) => setErros(errosDe(e)) },
          );
        else criar.mutate({ dados }, { onSuccess: feito, onError: (e) => setErros(errosDe(e)) });
      }}
    >
      {comRegistros && (
        <Alerta
          tom="info"
          titulo="Este alimento tem registros: espécie, cultivar, parte, forma, processamento, classe e comercial não mudam. Só nome e observações."
        />
      )}
      <CamposAlimento v={v} definir={definir} />
      {alimento && (
        <CampoTexto
          rotulo="Motivo da alteração"
          obrigatorio
          valor={v.motivo}
          aoMudar={(x) => definir('motivo', x)}
        />
      )}
    </Modal>
  );
}

export function PaginaAlimentos() {
  const [busca, setBusca] = useState('');
  const [forma, setForma] = useState<FormaConservacao | ''>('');
  const [classe, setClasse] = useState<ClasseAlimento | ''>('');
  const [novo, setNovo] = useState(false);
  const lista = useAlimentos({
    busca,
    formaConservacao: forma || null,
    classe: classe || null,
  });
  const itens = lista.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Banco de alimentos"
        descricao="Identidade de cada alimento e os registros de composição com fonte, base e unidade rastreáveis."
        acoes={
          <Botao onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden />
            Novo alimento
          </Botao>
        }
      />
      <Alerta tom="info" titulo={avisosAlimentos.semValorDeReferencia} />
      {lista.isError && <Alerta tom="perigo" titulo={mensagemDeErro(lista.error)} />}
      <div className="flex flex-wrap items-end gap-4">
        <Campo rotulo="Buscar alimento">
          {(p) => (
            <Entrada
              {...p}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, espécie ou cultivar"
            />
          )}
        </Campo>
        <Campo rotulo="Forma de conservação">
          {(p) => (
            <Selecao
              {...p}
              value={forma}
              onChange={(e) => setForma(e.target.value as FormaConservacao | '')}
            >
              <option value="">Todas</option>
              {opcoesDe(formasConservacao, FORMAS_CONSERVACAO)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Classe">
          {(p) => (
            <Selecao
              {...p}
              value={classe}
              onChange={(e) => setClasse(e.target.value as ClasseAlimento | '')}
            >
              <option value="">Todas</option>
              {opcoesDe(classesAlimento, CLASSES_ALIMENTO)}
            </Selecao>
          )}
        </Campo>
      </div>
      {itens.length === 0 ? (
        <EstadoVazio
          icone={Wheat}
          titulo={lista.isLoading ? 'Carregando alimentos' : 'Nenhum alimento encontrado'}
          descricao="Cadastre os alimentos que você usa. A composição entra depois, por registros com fonte e conferência."
        />
      ) : (
        <Tabela data-testid="tabela-alimentos">
          <Cabeca>
            <Th>Alimento</Th>
            <Th>Forma e classe</Th>
            <Th>Espécie e cultivar</Th>
            <Th>Registros</Th>
          </Cabeca>
          <tbody>
            {itens.map((a) => (
              <Linha key={a.id}>
                <Td>
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/alimentos/itens/${a.id}`}
                  >
                    {a.nome}
                  </Link>
                  {a.comercial && (
                    <Selo tom="alerta" className="ml-2">
                      Comercial
                    </Selo>
                  )}
                </Td>
                <Td>
                  {formasConservacao[a.formaConservacao]} · {classesAlimento[a.classe]}
                </Td>
                <Td>{[a.especie, a.cultivar].filter(Boolean).join(' · ') || '—'}</Td>
                <Td>
                  {a.nRegistros === 0
                    ? 'Sem registros'
                    : `${a.nRegistros} (${a.nConferidos} conferido${a.nConferidos === 1 ? '' : 's'})`}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {novo && <ModalAlimento alimento={null} aoFechar={() => setNovo(false)} />}
    </div>
  );
}
