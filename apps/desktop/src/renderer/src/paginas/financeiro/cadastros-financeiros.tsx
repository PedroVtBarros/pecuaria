import { useState } from 'react';
import { Plus, Tags, Users } from 'lucide-react';
import {
  GRUPOS_CATEGORIA,
  NATUREZAS_FINANCEIRAS,
  PAPEIS_PESSOA,
  TRATAMENTOS_CATEGORIA,
  type ComportamentoCusto,
  type GrupoCategoria,
  type NaturezaFinanceira,
  type PapelPessoa,
  type TratamentoCategoria,
} from '@pecuaria/domain';
import type { CategoriaFinanceira, PessoaComercial } from '@pecuaria/shared-types';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { CaixaMarcar, Campo, Entrada, Selecao, opcoesDe } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { mensagemDeErro } from '../../lib/api';
import {
  useAcaoFinanceiro,
  useCategoriasFinanceiras,
  usePessoasComerciais,
} from '../../lib/consultas-financeiro';
import {
  comportamentos,
  gruposCategoria,
  naturezas,
  papeis,
  tratamentos,
  tratamentosCurtos,
} from '../../textos-financeiro';

function ModalCategoria({
  categoria,
  aoFechar,
}: {
  categoria: CategoriaFinanceira | null;
  aoFechar: () => void;
}) {
  const criar = useAcaoFinanceiro('categoriaFinanceira:criar');
  const atualizar = useAcaoFinanceiro('categoriaFinanceira:atualizar');
  const [nome, setNome] = useState(categoria?.nome ?? '');
  const [natureza, setNatureza] = useState<NaturezaFinanceira>(categoria?.natureza ?? 'despesa');
  const [grupo, setGrupo] = useState<GrupoCategoria>(categoria?.grupo ?? 'outros');
  const [tratamento, setTratamento] = useState<TratamentoCategoria>(
    categoria?.tratamento ?? 'resultado',
  );
  const [comportamento, setComportamento] = useState<ComportamentoCusto>(
    categoria && categoria.comportamentoCusto !== 'nao_se_aplica'
      ? categoria.comportamentoCusto
      : 'nao_classificado',
  );
  const [ativa, setAtiva] = useState(categoria?.ativa ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const travada = categoria !== null;
  return (
    <Modal
      aberto
      titulo={categoria ? 'Editar categoria' : 'Nova categoria'}
      descricao="O tratamento diz como a categoria entra no resultado: compra para estoque e aquisição de animais só viram custo mais tarde, para não contar o mesmo valor duas vezes."
      aoFechar={aoFechar}
      textoEnviar="Salvar"
      enviando={criar.isPending || atualizar.isPending}
      erros={erro ? [erro] : []}
      aoEnviar={() => {
        const dados = {
          nome,
          natureza,
          grupo,
          tratamento,
          comportamentoCusto:
            natureza === 'despesa' ? comportamento : ('nao_classificado' as const),
          ativa,
        };
        const opcoes = { onSuccess: aoFechar, onError: (e: unknown) => setErro(mensagemDeErro(e)) };
        if (categoria) atualizar.mutate({ id: categoria.id, dados, motivo: null }, opcoes);
        else criar.mutate({ dados }, opcoes);
      }}
    >
      <Campo rotulo="Nome" obrigatorio>
        {(p) => (
          <Entrada {...p} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        )}
      </Campo>
      <Campo
        rotulo="Natureza"
        ajuda={travada ? 'Não muda depois que a categoria é criada.' : undefined}
      >
        {(p) => (
          <Selecao
            {...p}
            value={natureza}
            disabled={travada}
            onChange={(e) => setNatureza(e.target.value as NaturezaFinanceira)}
          >
            {opcoesDe(naturezas, NATUREZAS_FINANCEIRAS)}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Grupo">
        {(p) => (
          <Selecao
            {...p}
            value={grupo}
            onChange={(e) => setGrupo(e.target.value as GrupoCategoria)}
          >
            {opcoesDe(gruposCategoria, GRUPOS_CATEGORIA)}
          </Selecao>
        )}
      </Campo>
      <Campo rotulo="Tratamento no resultado">
        {(p) => (
          <Selecao
            {...p}
            value={tratamento}
            onChange={(e) => setTratamento(e.target.value as TratamentoCategoria)}
          >
            {opcoesDe(tratamentos, TRATAMENTOS_CATEGORIA)}
          </Selecao>
        )}
      </Campo>
      {natureza === 'despesa' && (
        <Campo
          rotulo="Classificação padrão do custo"
          ajuda="É copiada para cada lançamento novo, que pode mudá-la. Mudar o padrão não reescreve lançamentos antigos."
        >
          {(p) => (
            <Selecao
              {...p}
              value={comportamento}
              onChange={(e) => setComportamento(e.target.value as ComportamentoCusto)}
            >
              <option value="nao_classificado">{comportamentos.nao_classificado}</option>
              <option value="variavel">{comportamentos.variavel}</option>
              <option value="fixo">{comportamentos.fixo}</option>
            </Selecao>
          )}
        </Campo>
      )}
      <CaixaMarcar rotulo="Categoria ativa" marcado={ativa} aoMudar={setAtiva} />
    </Modal>
  );
}

export function PaginaCategorias() {
  const [inativas, setInativas] = useState(false);
  const [edicao, setEdicao] = useState<CategoriaFinanceira | 'nova' | null>(null);
  const consulta = useCategoriasFinanceiras(inativas);
  const lista = consulta.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Categorias"
        descricao="Categorias sugeridas e suas, com o tratamento de cada uma no resultado."
        acoes={
          <Botao onClick={() => setEdicao('nova')}>
            <Plus className="size-4" aria-hidden />
            Nova categoria
          </Botao>
        }
      />
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      <CaixaMarcar rotulo="Incluir categorias inativas" marcado={inativas} aoMudar={setInativas} />
      {lista.length === 0 ? (
        <EstadoVazio icone={Tags} titulo="Nenhuma categoria" />
      ) : (
        <Tabela data-testid="tabela-categorias">
          <Cabeca>
            <Th>Categoria</Th>
            <Th>Natureza</Th>
            <Th>Grupo</Th>
            <Th>Tratamento</Th>
            <Th>Classificação padrão</Th>
            <Th>
              <span className="sr-only">Ações</span>
            </Th>
          </Cabeca>
          <tbody>
            {lista.map((c) => (
              <Linha key={c.id} className={c.ativa ? undefined : 'opacity-60'}>
                <Td>
                  {c.nome}
                  {c.origem === 'sugestao' && (
                    <span className="ml-2 text-xs text-texto-suave">sugerida</span>
                  )}
                  {!c.ativa && <Selo className="ml-2">Inativa</Selo>}
                  {c.origemExigida && (
                    <div className="text-xs text-texto-suave">
                      Só recebe lançamentos do módulo correspondente (entrega futura).
                    </div>
                  )}
                </Td>
                <Td>{naturezas[c.natureza]}</Td>
                <Td>{gruposCategoria[c.grupo]}</Td>
                <Td title={tratamentos[c.tratamento]}>{tratamentosCurtos[c.tratamento]}</Td>
                <Td>{comportamentos[c.comportamentoCusto]}</Td>
                <Td>
                  <Botao tamanho="pequeno" variante="secundario" onClick={() => setEdicao(c)}>
                    Editar
                  </Botao>
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {edicao && (
        <ModalCategoria
          categoria={edicao === 'nova' ? null : edicao}
          aoFechar={() => setEdicao(null)}
        />
      )}
    </div>
  );
}

function ModalPessoa({
  pessoa,
  aoFechar,
}: {
  pessoa: PessoaComercial | null;
  aoFechar: () => void;
}) {
  const criar = useAcaoFinanceiro('pessoaComercial:criar');
  const atualizar = useAcaoFinanceiro('pessoaComercial:atualizar');
  const [nome, setNome] = useState(pessoa?.nome ?? '');
  const [papel, setPapel] = useState<PapelPessoa>(pessoa?.papel ?? 'fornecedor');
  const [documento, setDocumento] = useState(pessoa?.documento ?? '');
  const [observacoes, setObservacoes] = useState(pessoa?.observacoes ?? '');
  const [ativo, setAtivo] = useState(pessoa?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Modal
      aberto
      titulo={pessoa ? 'Editar contraparte' : 'Nova contraparte'}
      descricao="Fornecedor, comprador, frigorífico, laticínio ou prestador. Os dados ficam só neste computador."
      aoFechar={aoFechar}
      textoEnviar="Salvar"
      enviando={criar.isPending || atualizar.isPending}
      erros={erro ? [erro] : []}
      aoEnviar={() => {
        const dados = {
          nome,
          papel,
          documento: documento.trim() || null,
          observacoes: observacoes.trim() || null,
          ativo,
        };
        const opcoes = { onSuccess: aoFechar, onError: (e: unknown) => setErro(mensagemDeErro(e)) };
        if (pessoa) atualizar.mutate({ id: pessoa.id, dados, motivo: null }, opcoes);
        else criar.mutate({ dados }, opcoes);
      }}
    >
      <Campo rotulo="Nome" obrigatorio>
        {(p) => (
          <Entrada {...p} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        )}
      </Campo>
      <Campo rotulo="Papel">
        {(p) => (
          <Selecao {...p} value={papel} onChange={(e) => setPapel(e.target.value as PapelPessoa)}>
            {opcoesDe(papeis, PAPEIS_PESSOA)}
          </Selecao>
        )}
      </Campo>
      <Campo
        rotulo="CPF ou CNPJ (opcional)"
        ajuda="Texto livre; não é validado nem exportado sem a sua escolha."
      >
        {(p) => (
          <Entrada
            {...p}
            maxLength={30}
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
          />
        )}
      </Campo>
      <Campo rotulo="Observações (opcional)">
        {(p) => (
          <Entrada
            {...p}
            maxLength={1000}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        )}
      </Campo>
      <CaixaMarcar rotulo="Contraparte ativa" marcado={ativo} aoMudar={setAtivo} />
    </Modal>
  );
}

export function PaginaContrapartes() {
  const [inativas, setInativas] = useState(false);
  const [edicao, setEdicao] = useState<PessoaComercial | 'nova' | null>(null);
  const consulta = usePessoasComerciais(inativas);
  const lista = consulta.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Contrapartes"
        descricao="Quem vende, compra ou presta serviço. Usadas nos lançamentos."
        acoes={
          <Botao onClick={() => setEdicao('nova')}>
            <Plus className="size-4" aria-hidden />
            Nova contraparte
          </Botao>
        }
      />
      {consulta.isError && <Alerta tom="perigo" titulo={mensagemDeErro(consulta.error)} />}
      <CaixaMarcar
        rotulo="Incluir contrapartes inativas"
        marcado={inativas}
        aoMudar={setInativas}
      />
      {lista.length === 0 ? (
        <EstadoVazio
          icone={Users}
          titulo="Nenhuma contraparte cadastrada"
          descricao="O cadastro começa vazio. Cadastre fornecedores e compradores conforme precisar."
        />
      ) : (
        <Tabela data-testid="tabela-contrapartes">
          <Cabeca>
            <Th>Nome</Th>
            <Th>Papel</Th>
            <Th>Observações</Th>
            <Th>
              <span className="sr-only">Ações</span>
            </Th>
          </Cabeca>
          <tbody>
            {lista.map((p) => (
              <Linha key={p.id} className={p.ativo ? undefined : 'opacity-60'}>
                <Td>
                  {p.nome}
                  {!p.ativo && <Selo className="ml-2">Inativa</Selo>}
                </Td>
                <Td>{papeis[p.papel]}</Td>
                <Td>{p.observacoes ?? '—'}</Td>
                <Td>
                  <Botao tamanho="pequeno" variante="secundario" onClick={() => setEdicao(p)}>
                    Editar
                  </Botao>
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {edicao && (
        <ModalPessoa pessoa={edicao === 'nova' ? null : edicao} aoFechar={() => setEdicao(null)} />
      )}
    </div>
  );
}
