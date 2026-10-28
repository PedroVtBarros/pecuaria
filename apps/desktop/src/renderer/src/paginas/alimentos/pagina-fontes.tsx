import { useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';
import {
  ORIGENS_FONTE_CADASTRAVEIS,
  origemBibliografica,
  origemDaPropriedade,
  type OrigemFonteCadastravel,
} from '@pecuaria/domain';
import { esquemaDadosFonte, type DadosFonte, type Fonte } from '@pecuaria/shared-types';
import { usePropriedadeAtual } from '../../hooks/use-propriedade-atual';
import { mensagemDeErro } from '../../lib/api';
import { useAcaoAlimentos, useFontes } from '../../lib/consultas-alimentos';
import { formatarData } from '../../lib/formatar-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, opcoesDe, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { naturezaDaOrigem, origensFonte } from '../../textos-alimentos';
import { CampoTexto, errosDe, ModalCampos, nulo, SeloOrigem } from './componentes-alimentos';
import { QuadroCuradorias } from './quadro-curadorias';

type Campos = Record<
  | 'codigo'
  | 'titulo'
  | 'autores'
  | 'ano'
  | 'edicaoVersao'
  | 'instituicaoEditora'
  | 'isbnDoiUrl'
  | 'dataAcesso'
  | 'experimentoOrigem'
  | 'laboratorio'
  | 'numeroLaudo'
  | 'dataLaudo'
  | 'fabricante'
  | 'registroProduto'
  | 'metodoMedicao'
  | 'limitacoesMedicao'
  | 'observacoes'
  | 'motivo',
  string
>;

function inicial(f: Fonte | null): Campos {
  const t = (x: string | number | null | undefined) =>
    x === null || x === undefined ? '' : String(x);
  return {
    codigo: t(f?.codigo),
    titulo: t(f?.titulo),
    autores: t(f?.autores),
    ano: t(f?.ano),
    edicaoVersao: t(f?.edicaoVersao),
    instituicaoEditora: t(f?.instituicaoEditora),
    isbnDoiUrl: t(f?.isbnDoiUrl),
    dataAcesso: t(f?.dataAcesso),
    experimentoOrigem: t(f?.experimentoOrigem),
    laboratorio: t(f?.laboratorio),
    numeroLaudo: t(f?.numeroLaudo),
    dataLaudo: t(f?.dataLaudo),
    fabricante: t(f?.fabricante),
    registroProduto: t(f?.registroProduto),
    metodoMedicao: t(f?.metodoMedicao),
    limitacoesMedicao: t(f?.limitacoesMedicao),
    observacoes: t(f?.observacoes),
    motivo: '',
  };
}

/** Cadastro ou edição de fonte, com os campos que a origem exige. */
export function ModalFonte({
  fonte,
  propriedadeId,
  origemInicial,
  aoFechar,
}: {
  fonte: Fonte | null;
  propriedadeId: string | null;
  origemInicial?: OrigemFonteCadastravel;
  aoFechar: () => void;
}) {
  const [origem, setOrigem] = useState<OrigemFonteCadastravel | ''>(
    (fonte?.origem as OrigemFonteCadastravel | undefined) ?? origemInicial ?? '',
  );
  const [v, setV] = useState(() => inicial(fonte));
  const [erros, setErros] = useState<string[]>([]);
  const criar = useAcaoAlimentos('fonte:criar');
  const atualizar = useAcaoAlimentos('fonte:atualizar');
  const def = (k: keyof Campos) => (x: string) => setV((a) => ({ ...a, [k]: x }));
  const bib = origem !== '' && origemBibliografica(origem);
  return (
    <Modal
      aberto
      largura="lg"
      titulo={fonte ? 'Editar fonte' : 'Nova fonte'}
      descricao="Sem fonte, sem dado. A origem não muda depois de cadastrada."
      aoFechar={aoFechar}
      erros={erros}
      enviando={criar.isPending || atualizar.isPending}
      aoEnviar={() => {
        if (!origem) {
          setErros(['Selecione a origem.']);
          return;
        }
        const dados: DadosFonte = {
          origem,
          codigo: nulo(v.codigo),
          titulo: v.titulo,
          autores: nulo(v.autores),
          ano: v.ano.trim() ? Number(v.ano) : null,
          edicaoVersao: nulo(v.edicaoVersao),
          instituicaoEditora: nulo(v.instituicaoEditora),
          isbnDoiUrl: nulo(v.isbnDoiUrl),
          dataAcesso: nulo(v.dataAcesso),
          experimentoOrigem: nulo(v.experimentoOrigem),
          laboratorio: origem === 'laboratorial' ? nulo(v.laboratorio) : null,
          numeroLaudo: origem === 'laboratorial' ? nulo(v.numeroLaudo) : null,
          dataLaudo: origem === 'laboratorial' ? nulo(v.dataLaudo) : null,
          fabricante: origem === 'rotulo_comercial' ? nulo(v.fabricante) : null,
          registroProduto: origem === 'rotulo_comercial' ? nulo(v.registroProduto) : null,
          metodoMedicao: origem === 'medicao_propria' ? nulo(v.metodoMedicao) : null,
          limitacoesMedicao: origem === 'medicao_propria' ? nulo(v.limitacoesMedicao) : null,
          propriedadeId: origemDaPropriedade(origem)
            ? (fonte?.propriedadeId ?? propriedadeId)
            : null,
          observacoes: nulo(v.observacoes),
        };
        const r = esquemaDadosFonte.safeParse(dados);
        if (!r.success) {
          setErros(r.error.issues.map((i) => i.message));
          return;
        }
        if (fonte && !v.motivo.trim()) {
          setErros(['Informe o motivo da alteração.']);
          return;
        }
        const op = { onSuccess: aoFechar, onError: (e: unknown) => setErros(errosDe(e)) };
        if (fonte) atualizar.mutate({ id: fonte.id, dados, motivo: v.motivo }, op);
        else criar.mutate({ dados }, op);
      }}
    >
      <Campo rotulo="Origem" obrigatorio ajuda={origem ? naturezaDaOrigem[origem] : undefined}>
        {(p) => (
          <Selecao
            {...p}
            value={origem}
            disabled={Boolean(fonte)}
            onChange={(e) => setOrigem(e.target.value as OrigemFonteCadastravel)}
          >
            <option value="">Selecione</option>
            {opcoesDe(origensFonte, ORIGENS_FONTE_CADASTRAVEIS)}
          </Selecao>
        )}
      </Campo>
      {origem && origemDaPropriedade(origem) && !propriedadeId && !fonte && (
        <Alerta
          tom="alerta"
          titulo="Laudo e medição própria pertencem a uma propriedade: escolha a propriedade atual antes."
        />
      )}
      <CampoTexto rotulo="Título" obrigatorio valor={v.titulo} aoMudar={def('titulo')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto
          rotulo="Código"
          obrigatorio={bib}
          valor={v.codigo}
          aoMudar={def('codigo')}
          ajuda="Letras sem acento, dígitos e _ (ex.: CQBAL_4_0)."
        />
        {(bib || origem === '') && (
          <>
            <CampoTexto
              rotulo="Autores"
              obrigatorio={bib}
              valor={v.autores}
              aoMudar={def('autores')}
            />
            <CampoTexto rotulo="Ano" obrigatorio={bib} valor={v.ano} aoMudar={def('ano')} />
            <CampoTexto
              rotulo="Edição ou versão"
              valor={v.edicaoVersao}
              aoMudar={def('edicaoVersao')}
            />
            <CampoTexto
              rotulo="Instituição ou editora"
              valor={v.instituicaoEditora}
              aoMudar={def('instituicaoEditora')}
            />
            <CampoTexto
              rotulo="ISBN, DOI ou URL"
              valor={v.isbnDoiUrl}
              aoMudar={def('isbnDoiUrl')}
            />
            <CampoTexto
              rotulo="Data de acesso"
              tipo="date"
              valor={v.dataAcesso}
              aoMudar={def('dataAcesso')}
            />
            <CampoTexto
              rotulo="Experimento de origem"
              valor={v.experimentoOrigem}
              aoMudar={def('experimentoOrigem')}
              ajuda="Identifica o mesmo experimento publicado em veículos diferentes."
            />
          </>
        )}
        {origem === 'laboratorial' && (
          <>
            <CampoTexto
              rotulo="Laboratório"
              obrigatorio
              valor={v.laboratorio}
              aoMudar={def('laboratorio')}
            />
            <CampoTexto
              rotulo="Número do laudo"
              valor={v.numeroLaudo}
              aoMudar={def('numeroLaudo')}
            />
            <CampoTexto
              rotulo="Data do laudo"
              tipo="date"
              valor={v.dataLaudo}
              aoMudar={def('dataLaudo')}
            />
          </>
        )}
        {origem === 'rotulo_comercial' && (
          <>
            <CampoTexto
              rotulo="Fabricante"
              obrigatorio
              valor={v.fabricante}
              aoMudar={def('fabricante')}
            />
            <CampoTexto
              rotulo="Registro do produto"
              valor={v.registroProduto}
              aoMudar={def('registroProduto')}
            />
          </>
        )}
      </div>
      {origem === 'medicao_propria' && (
        <>
          <CampoTexto
            rotulo="Método de medição"
            obrigatorio
            multilinha
            valor={v.metodoMedicao}
            aoMudar={def('metodoMedicao')}
          />
          <CampoTexto
            rotulo="Limitações do método"
            obrigatorio
            multilinha
            valor={v.limitacoesMedicao}
            aoMudar={def('limitacoesMedicao')}
          />
        </>
      )}
      <CampoTexto
        rotulo="Observações"
        multilinha
        valor={v.observacoes}
        aoMudar={def('observacoes')}
      />
      {fonte && (
        <CampoTexto
          rotulo="Motivo da alteração"
          obrigatorio
          valor={v.motivo}
          aoMudar={def('motivo')}
        />
      )}
    </Modal>
  );
}

export function PaginaFontes() {
  const { propriedade } = usePropriedadeAtual();
  const [excluidas, setExcluidas] = useState(false);
  const [modal, setModal] = useState<Fonte | 'nova' | null>(null);
  const [excluir, setExcluir] = useState<Fonte | null>(null);
  const lista = useFontes({ propriedadeId: propriedade?.id ?? null, incluirExcluidas: excluidas });
  const acaoExcluir = useAcaoAlimentos('fonte:excluir');
  const fontes = lista.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Fontes"
        descricao="Publicações, laudos, rótulos e métodos de medição. Laudos e medições aparecem só na propriedade a que pertencem."
        acoes={
          <Botao onClick={() => setModal('nova')}>
            <Plus className="size-4" aria-hidden />
            Nova fonte
          </Botao>
        }
      />
      {lista.isError && <Alerta tom="perigo" titulo={mensagemDeErro(lista.error)} />}
      <QuadroCuradorias />
      <CaixaMarcar rotulo="Incluir fontes excluídas" marcado={excluidas} aoMudar={setExcluidas} />
      {fontes.length === 0 ? (
        <EstadoVazio
          icone={BookOpen}
          titulo={lista.isLoading ? 'Carregando fontes' : 'Nenhuma fonte cadastrada'}
          descricao="Cadastre a publicação, o laudo ou o rótulo antes de transcrever valores."
        />
      ) : (
        <Tabela data-testid="tabela-fontes">
          <Cabeca>
            <Th>Origem</Th>
            <Th>Fonte</Th>
            <Th>Detalhes</Th>
            <Th>Registros</Th>
            <Th>Ações</Th>
          </Cabeca>
          <tbody>
            {fontes.map((f) => (
              <Linha key={f.id}>
                <Td>
                  <SeloOrigem origem={f.origem} />
                </Td>
                <Td>
                  <span className="font-medium">{f.titulo}</span>
                  {f.codigo && <span className="block text-xs text-texto-suave">{f.codigo}</span>}
                  {f.excluidaEm && <Selo tom="perigo">Excluída</Selo>}
                </Td>
                <Td className="text-xs">
                  {[
                    f.autores,
                    f.ano,
                    f.edicaoVersao,
                    f.laboratorio,
                    f.numeroLaudo && `Laudo ${f.numeroLaudo}`,
                    f.dataLaudo && formatarData(f.dataLaudo),
                    f.fabricante,
                    f.registroProduto,
                    f.propriedadeNome,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </Td>
                <Td>{f.nRegistros}</Td>
                <Td>
                  {!f.excluidaEm && (
                    <div className="flex gap-1">
                      <Botao tamanho="pequeno" variante="secundario" onClick={() => setModal(f)}>
                        Editar
                      </Botao>
                      <Botao tamanho="pequeno" variante="fantasma" onClick={() => setExcluir(f)}>
                        Excluir
                      </Botao>
                    </div>
                  )}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {modal && (
        <ModalFonte
          fonte={modal === 'nova' ? null : modal}
          propriedadeId={propriedade?.id ?? null}
          aoFechar={() => setModal(null)}
        />
      )}
      {excluir && (
        <ModalCampos
          titulo="Excluir fonte"
          descricao="Exclusão lógica. Só é possível sem registros ativos e sem definições fundamentadas por ela."
          campos={[{ nome: 'motivo', rotulo: 'Motivo', multilinha: true }]}
          textoEnviar="Excluir"
          perigoso
          enviando={acaoExcluir.isPending}
          aoFechar={() => setExcluir(null)}
          aoConfirmar={(c) => acaoExcluir.mutateAsync({ id: excluir.id, motivo: c['motivo']! })}
        />
      )}
    </div>
  );
}
