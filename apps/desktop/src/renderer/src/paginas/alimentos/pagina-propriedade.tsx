import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import {
  BASES_NUTRICIONAIS,
  DEFINICOES_UNIDADE,
  DEFINICOES_INICIAIS_NUTRIENTES,
  mesmaGrandeza,
  SEPARADORES_DECIMAIS,
  UNIDADES_NUTRICIONAIS,
  type BaseNutricional,
  type SeparadorDecimal,
  type UnidadeNutricional,
} from '@pecuaria/domain';
import type { DadosLaudo, Propriedade } from '@pecuaria/shared-types';
import { mensagemDeErro } from '../../lib/api';
import {
  useAcaoAlimentos,
  useAlimentos,
  useFontes,
  useNutrientes,
  useRegistros,
} from '../../lib/consultas-alimentos';
import { formatarData } from '../../lib/formatar-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, opcoesDe, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import {
  avisosAlimentos,
  basesNutricionais,
  descreverFonte,
  separadores,
} from '../../textos-alimentos';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { CampoTexto, errosDe, nulo, SeloOrigem, SeloStatus } from './componentes-alimentos';

function SeletorAlimento({ valor, aoMudar }: { valor: string; aoMudar: (id: string) => void }) {
  const alimentos = useAlimentos({ busca: '' }).data ?? [];
  return (
    <Campo rotulo="Alimento" obrigatorio>
      {(p) => (
        <Selecao {...p} value={valor} onChange={(e) => aoMudar(e.target.value)}>
          <option value="">Selecione</option>
          {alimentos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </Selecao>
      )}
    </Campo>
  );
}

function SeletorSeparador({
  valor,
  aoMudar,
}: {
  valor: SeparadorDecimal;
  aoMudar: (s: SeparadorDecimal) => void;
}) {
  return (
    <Campo rotulo="Separador decimal" obrigatorio>
      {(p) => (
        <Selecao {...p} value={valor} onChange={(e) => aoMudar(e.target.value as SeparadorDecimal)}>
          {opcoesDe(separadores, SEPARADORES_DECIMAIS)}
        </Selecao>
      )}
    </Campo>
  );
}

interface LinhaLaudo {
  nutrienteId: string;
  valorPublicado: string;
  unidade: UnidadeNutricional | '';
  base: BaseNutricional | '';
  metodoAnaliticoFonte: string;
}
const linhaVazia = (): LinhaLaudo => ({
  nutrienteId: '',
  valorPublicado: '',
  unidade: '',
  base: '',
  metodoAnaliticoFonte: '',
});

function ModalLaudo({ propriedade, aoFechar }: { propriedade: Propriedade; aoFechar: () => void }) {
  const navegar = useNavigate();
  const nutrientes = useNutrientes().data ?? [];
  const registrar = useAcaoAlimentos('laudo:registrar');
  const [v, setV] = useState({
    alimentoId: '',
    laboratorio: '',
    numeroLaudo: '',
    dataLaudo: '',
    dataAmostra: '',
    identificacaoAmostra: '',
    observacoes: '',
  });
  const [separador, setSeparador] = useState<SeparadorDecimal>('virgula');
  const [linhas, setLinhas] = useState<LinhaLaudo[]>([linhaVazia()]);
  const [erros, setErros] = useState<string[]>([]);
  const mudar = (i: number, x: Partial<LinhaLaudo>) =>
    setLinhas((l) => l.map((y, j) => (j === i ? { ...y, ...x } : y)));
  return (
    <Modal
      aberto
      largura="xl"
      titulo={`Laudo laboratorial · ${propriedade.nome}`}
      descricao={avisosAlimentos.laudo}
      aoFechar={aoFechar}
      erros={erros}
      enviando={registrar.isPending}
      textoEnviar="Registrar laudo"
      aoEnviar={() => {
        if (!v.alimentoId || linhas.some((l) => !l.nutrienteId || !l.unidade || !l.base)) {
          setErros(['Escolha o alimento e complete nutriente, unidade e base de cada valor.']);
          return;
        }
        const dados: DadosLaudo = {
          propriedadeId: propriedade.id,
          alimentoId: v.alimentoId,
          laboratorio: v.laboratorio,
          numeroLaudo: nulo(v.numeroLaudo),
          dataLaudo: nulo(v.dataLaudo),
          dataAmostra: v.dataAmostra,
          identificacaoAmostra: nulo(v.identificacaoAmostra),
          observacoes: nulo(v.observacoes),
          separadorDecimal: separador,
          valores: linhas.map((l) => ({
            nutrienteId: l.nutrienteId,
            valorPublicado: l.valorPublicado,
            unidade: l.unidade as UnidadeNutricional,
            base: l.base as BaseNutricional,
            metodoAnaliticoFonte: nulo(l.metodoAnaliticoFonte),
            observacao: null,
          })),
        };
        registrar.mutate(dados, {
          onSuccess: (r) => navegar(`/alimentos/registros/${r.registro.id}`),
          onError: (e) => setErros(errosDe(e)),
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SeletorAlimento valor={v.alimentoId} aoMudar={(x) => setV({ ...v, alimentoId: x })} />
        <CampoTexto
          rotulo="Laboratório"
          obrigatorio
          valor={v.laboratorio}
          aoMudar={(x) => setV({ ...v, laboratorio: x })}
        />
        <CampoTexto
          rotulo="Número do laudo"
          valor={v.numeroLaudo}
          aoMudar={(x) => setV({ ...v, numeroLaudo: x })}
        />
        <CampoTexto
          rotulo="Data do laudo"
          tipo="date"
          valor={v.dataLaudo}
          aoMudar={(x) => setV({ ...v, dataLaudo: x })}
        />
        <CampoTexto
          rotulo="Data da amostra"
          obrigatorio
          tipo="date"
          valor={v.dataAmostra}
          aoMudar={(x) => setV({ ...v, dataAmostra: x })}
        />
        <CampoTexto
          rotulo="Identificação da amostra"
          valor={v.identificacaoAmostra}
          aoMudar={(x) => setV({ ...v, identificacaoAmostra: x })}
        />
        <SeletorSeparador valor={separador} aoMudar={setSeparador} />
      </div>
      <section className="flex flex-col gap-2" aria-label="Valores do laudo">
        <h3 className="text-sm font-semibold">Valores como impressos no laudo</h3>
        {linhas.map((l, i) => {
          const n = nutrientes.find((x) => x.id === l.nutrienteId);
          const unidades = n
            ? UNIDADES_NUTRICIONAIS.filter((u) => mesmaGrandeza(u, n.unidadeReferencia))
            : UNIDADES_NUTRICIONAIS;
          return (
            <div
              key={i}
              className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_2fr_auto]"
            >
              <Campo rotulo={`Nutriente ${i + 1}`}>
                {(p) => (
                  <Selecao
                    {...p}
                    value={l.nutrienteId}
                    onChange={(e) => mudar(i, { nutrienteId: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {nutrientes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.codigo} · {x.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Valor">
                {(p) => (
                  <Entrada
                    {...p}
                    value={l.valorPublicado}
                    onChange={(e) => mudar(i, { valorPublicado: e.target.value })}
                  />
                )}
              </Campo>
              <Campo rotulo="Unidade">
                {(p) => (
                  <Selecao
                    {...p}
                    value={l.unidade}
                    onChange={(e) => mudar(i, { unidade: e.target.value as UnidadeNutricional })}
                  >
                    <option value="">—</option>
                    {unidades.map((u) => (
                      <option key={u} value={u}>
                        {DEFINICOES_UNIDADE[u].simbolo}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Base">
                {(p) => (
                  <Selecao
                    {...p}
                    value={l.base}
                    onChange={(e) => mudar(i, { base: e.target.value as BaseNutricional })}
                  >
                    <option value="">—</option>
                    {opcoesDe(basesNutricionais, BASES_NUTRICIONAIS)}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Método informado no laudo">
                {(p) => (
                  <Entrada
                    {...p}
                    value={l.metodoAnaliticoFonte}
                    onChange={(e) => mudar(i, { metodoAnaliticoFonte: e.target.value })}
                  />
                )}
              </Campo>
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label={`Remover valor ${i + 1}`}
                disabled={linhas.length === 1}
                onClick={() => setLinhas((x) => x.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Botao>
            </div>
          );
        })}
        <Botao
          variante="secundario"
          tamanho="pequeno"
          className="w-fit"
          onClick={() => setLinhas((x) => [...x, linhaVazia()])}
        >
          <Plus className="size-4" aria-hidden />
          Adicionar valor
        </Botao>
      </section>
      <CampoTexto
        rotulo="Observações"
        multilinha
        valor={v.observacoes}
        aoMudar={(x) => setV({ ...v, observacoes: x })}
      />
    </Modal>
  );
}

function ModalMedicao({
  propriedade,
  aoFechar,
}: {
  propriedade: Propriedade;
  aoFechar: () => void;
}) {
  const navegar = useNavigate();
  const metodos = (
    useFontes({ origem: 'medicao_propria', propriedadeId: propriedade.id }).data ?? []
  ).filter((f) => !f.excluidaEm);
  const fracoesSecas = (useNutrientes().data ?? []).filter((n) => n.grupo === 'fracao_seca');
  const registrar = useAcaoAlimentos('medicaoMs:registrar');
  const [v, setV] = useState({
    alimentoId: '',
    fonteId: '',
    titulo: '',
    metodoMedicao: '',
    limitacoesMedicao: '',
    nutrienteId: DEFINICOES_INICIAIS_NUTRIENTES.find((d) => d.codigo === 'MS')!.id,
    dataAmostra: '',
    identificacaoAmostra: '',
    valorPublicado: '',
    tipoValor: 'valor_unico' as 'valor_unico' | 'media',
    nObservacoes: '',
    observacao: '',
  });
  const [separador, setSeparador] = useState<SeparadorDecimal>('virgula');
  const [erros, setErros] = useState<string[]>([]);
  const nutriente = fracoesSecas.find((n) => n.id === v.nutrienteId);
  return (
    <Modal
      aberto
      largura="lg"
      titulo={`MS medida na fazenda · ${propriedade.nome}`}
      descricao={avisosAlimentos.medicao}
      aoFechar={aoFechar}
      erros={erros}
      enviando={registrar.isPending}
      textoEnviar="Registrar medição"
      aoEnviar={() => {
        if (!v.alimentoId) {
          setErros(['Escolha o alimento.']);
          return;
        }
        registrar.mutate(
          {
            propriedadeId: propriedade.id,
            alimentoId: v.alimentoId,
            fonteId: v.fonteId || null,
            metodo: v.fonteId
              ? null
              : {
                  titulo: v.titulo,
                  metodoMedicao: v.metodoMedicao,
                  limitacoesMedicao: v.limitacoesMedicao,
                },
            nutrienteId: v.nutrienteId,
            dataAmostra: v.dataAmostra,
            identificacaoAmostra: nulo(v.identificacaoAmostra),
            separadorDecimal: separador,
            valorPublicado: v.valorPublicado,
            tipoValor: v.tipoValor,
            nObservacoes: v.nObservacoes.trim() ? Number(v.nObservacoes) : null,
            observacao: nulo(v.observacao),
          },
          {
            onSuccess: (r) => navegar(`/alimentos/registros/${r.registro.id}`),
            onError: (e) => setErros(errosDe(e)),
          },
        );
      }}
    >
      <SeletorAlimento valor={v.alimentoId} aoMudar={(x) => setV({ ...v, alimentoId: x })} />
      <Campo
        rotulo="Método de medição"
        ajuda="Reaproveite um método já descrito nesta propriedade ou descreva um novo."
      >
        {(p) => (
          <Selecao
            {...p}
            value={v.fonteId}
            onChange={(e) => setV({ ...v, fonteId: e.target.value })}
          >
            <option value="">Descrever método novo</option>
            {metodos.map((m) => (
              <option key={m.id} value={m.id}>
                {descreverFonte(m)}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      {!v.fonteId && (
        <>
          <CampoTexto
            rotulo="Nome do método"
            obrigatorio
            valor={v.titulo}
            aoMudar={(x) => setV({ ...v, titulo: x })}
          />
          <CampoTexto
            rotulo="Descrição do método"
            obrigatorio
            multilinha
            valor={v.metodoMedicao}
            aoMudar={(x) => setV({ ...v, metodoMedicao: x })}
          />
          <CampoTexto
            rotulo="Limitações do método"
            obrigatorio
            multilinha
            valor={v.limitacoesMedicao}
            aoMudar={(x) => setV({ ...v, limitacoesMedicao: x })}
            ajuda="O que pode tornar o valor impreciso (amostragem, secagem incompleta, balança)."
          />
        </>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Definição" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={v.nutrienteId}
              onChange={(e) => setV({ ...v, nutrienteId: e.target.value })}
            >
              {fracoesSecas.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.codigo} · {n.nome}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <CampoTexto
          rotulo={`Valor medido${nutriente ? ` (${DEFINICOES_UNIDADE[nutriente.unidadeReferencia].simbolo} da ${nutriente.baseReferencia.toUpperCase()})` : ''}`}
          obrigatorio
          valor={v.valorPublicado}
          aoMudar={(x) => setV({ ...v, valorPublicado: x })}
        />
        <CampoTexto
          rotulo="Data da amostra"
          obrigatorio
          tipo="date"
          valor={v.dataAmostra}
          aoMudar={(x) => setV({ ...v, dataAmostra: x })}
        />
        <CampoTexto
          rotulo="Identificação da amostra"
          valor={v.identificacaoAmostra}
          aoMudar={(x) => setV({ ...v, identificacaoAmostra: x })}
        />
        <Campo rotulo="Tipo">
          {(p) => (
            <Selecao
              {...p}
              value={v.tipoValor}
              onChange={(e) => setV({ ...v, tipoValor: e.target.value as 'media' })}
            >
              <option value="valor_unico">Uma amostra</option>
              <option value="media">Média de repetições</option>
            </Selecao>
          )}
        </Campo>
        <CampoTexto
          rotulo="Número de repetições"
          valor={v.nObservacoes}
          aoMudar={(x) => setV({ ...v, nObservacoes: x })}
        />
        <SeletorSeparador valor={separador} aoMudar={setSeparador} />
      </div>
      <CampoTexto
        rotulo="Observação"
        multilinha
        valor={v.observacao}
        aoMudar={(x) => setV({ ...v, observacao: x })}
      />
    </Modal>
  );
}

function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [modal, setModal] = useState<'laudo' | 'medicao' | null>(null);
  const lista = useRegistros({ propriedadeId: propriedade.id, somenteDaPropriedade: true });
  const itens = lista.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo={`Laudos e MS medida · ${propriedade.nome}`}
        descricao="Dados desta propriedade, separados dos dados científicos publicados. Não aparecem nas outras propriedades."
        acoes={
          <>
            <Botao onClick={() => setModal('laudo')}>
              <Plus className="size-4" aria-hidden />
              Novo laudo
            </Botao>
            <Botao variante="secundario" onClick={() => setModal('medicao')}>
              <Plus className="size-4" aria-hidden />
              Nova MS medida
            </Botao>
          </>
        }
      />
      {lista.isError && <Alerta tom="perigo" titulo={mensagemDeErro(lista.error)} />}
      {itens.length === 0 ? (
        <EstadoVazio
          icone={FlaskConical}
          titulo={lista.isLoading ? 'Carregando' : 'Nenhum laudo ou medição'}
        />
      ) : (
        <Tabela data-testid="tabela-propriedade">
          <Cabeca>
            <Th>Data da amostra</Th>
            <Th>Alimento</Th>
            <Th>Origem</Th>
            <Th>Fonte</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {itens.map((r) => (
              <Linha key={r.id}>
                <Td>{r.dataAmostra ? formatarData(r.dataAmostra) : '—'}</Td>
                <Td>
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/alimentos/registros/${r.id}`}
                  >
                    {r.alimentoNome}
                  </Link>
                </Td>
                <Td>
                  <SeloOrigem origem={r.fonte.origem} />
                </Td>
                <Td>{descreverFonte(r.fonte)}</Td>
                <Td>
                  <SeloStatus status={r.status} />
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {modal === 'laudo' && (
        <ModalLaudo propriedade={propriedade} aoFechar={() => setModal(null)} />
      )}
      {modal === 'medicao' && (
        <ModalMedicao propriedade={propriedade} aoFechar={() => setModal(null)} />
      )}
    </div>
  );
}

export function PaginaPropriedadeAlimentos() {
  return <ComPropriedade>{(p) => <Conteudo key={p.id} propriedade={p} />}</ComPropriedade>;
}
