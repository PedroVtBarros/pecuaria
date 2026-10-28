import { useState } from 'react';
import { Link } from 'react-router';
import { Package, Plus } from 'lucide-react';
import { esquemaPreferenciasEstoque, type Propriedade } from '@pecuaria/shared-types';
import { useAcaoEstoque, useAlertasEstoque, useEstoque } from '../../lib/consultas-estoque';
import { useConfiguracao } from '../../lib/consultas';
import { mensagemDeErro } from '../../lib/api';
import { formatarData } from '../../lib/formatar-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, Selecao, CaixaMarcar } from '../../components/ui/campos';
import { Cartao, CartaoConteudo } from '../../components/ui/cartao';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { Selo } from '../../components/ui/selo';
import { quantidadeEstoque, tiposItemEstoque, valorEstoque } from '../../textos-estoque';
import { ComPropriedade } from '../rebanho/layout-rebanho';
import { ModalItemEstoque, TextoEstoque } from './modais-estoque';

function PreferenciaValidade({ inicial }: { inicial: number }) {
  const [dias, setDias] = useState(String(inicial));
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useAcaoEstoque('configuracao:definir');
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(dias);
        const r = esquemaPreferenciasEstoque.safeParse({ antecedenciaValidadeDias: n });
        if (!dias.trim() || !r.success) {
          setErro('Informe entre 0 e 365 dias inteiros.');
          return;
        }
        setErro(null);
        salvar.mutate(
          { chave: 'alertas.estoque', valor: r.data },
          { onError: (e) => setErro(mensagemDeErro(e)) },
        );
      }}
    >
      <TextoEstoque
        rotulo="Antecedência dos avisos de validade (dias)"
        valor={dias}
        aoMudar={setDias}
      />
      <Botao type="submit" variante="secundario" carregando={salvar.isPending}>
        Salvar antecedência
      </Botao>
      {erro && <Alerta tom="perigo" titulo={erro} />}
    </form>
  );
}
function Conteudo({ propriedade }: { propriedade: Propriedade }) {
  const [inativos, setInativos] = useState(false);
  const estoque = useEstoque(propriedade.id, inativos);
  const alertas = useAlertasEstoque(propriedade.id);
  const preferencias = useConfiguracao('alertas.estoque');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');
  const [novo, setNovo] = useState(false);
  const itens = estoque.data ?? [];
  const f = busca.trim().toLocaleLowerCase('pt-BR');
  const filtrados = itens.filter(
    (i) => (!tipo || i.tipo === tipo) && i.nome.toLocaleLowerCase('pt-BR').includes(f),
  );
  const pref = esquemaPreferenciasEstoque.safeParse(preferencias.data);
  return (
    <div className="flex min-w-0 flex-col gap-6 p-8">
      <CabecalhoPagina
        titulo="Estoque"
        descricao="Entradas, consumo e saldo físico por propriedade, com valoração e rastreabilidade."
        acoes={
          <Botao onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden />
            Novo item
          </Botao>
        }
      />
      {estoque.isError && <Alerta tom="perigo" titulo={mensagemDeErro(estoque.error)} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          ['Itens cadastrados', itens.length],
          ['No mínimo ou abaixo', alertas.data?.minimo.length ?? 0],
          ['Com valoração incompleta', itens.filter((i) => !i.valoracaoCompleta).length],
        ].map(([label, n]) => (
          <Cartao key={label}>
            <CartaoConteudo>
              <p className="text-sm text-texto-suave">{label}</p>
              <p className="text-2xl font-semibold">{n}</p>
            </CartaoConteudo>
          </Cartao>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Campo rotulo="Buscar item de estoque">
          {(p) => (
            <Entrada
              {...p}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do insumo"
            />
          )}
        </Campo>
        <Campo rotulo="Tipo de item">
          {(p) => (
            <Selecao {...p} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(tiposItemEstoque).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <CaixaMarcar rotulo="Incluir itens inativos" marcado={inativos} aoMudar={setInativos} />
      </div>
      {filtrados.length === 0 ? (
        <EstadoVazio
          icone={Package}
          titulo={estoque.isLoading ? 'Carregando estoque' : 'Nenhum item encontrado'}
          descricao="Cadastre os insumos comprados ou produzidos na propriedade. O catálogo começa vazio."
        />
      ) : (
        <Tabela data-testid="tabela-estoque">
          <Cabeca>
            <Th>Item</Th>
            <Th>Tipo e unidade</Th>
            <Th>Saldo</Th>
            <Th>Valor do saldo</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {filtrados.map((i) => (
              <Linha key={i.id}>
                <Td>
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/estoque/itens/${i.id}`}
                  >
                    {i.nome}
                  </Link>
                </Td>
                <Td>
                  {tiposItemEstoque[i.tipo]} · {i.unidadeBase}
                  {i.baseMateria === 'mn' && (
                    <span className="block text-xs text-texto-suave">Matéria natural</span>
                  )}
                </Td>
                <Td>{quantidadeEstoque(i.saldo, i.unidadeBase)}</Td>
                <Td>{valorEstoque(i.valorSaldoCentavos)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {!i.ativo && <Selo>Inativo</Selo>}
                    {i.abaixoMinimo && <Selo tom="alerta">Estoque mínimo</Selo>}
                    {!i.valoracaoCompleta && <Selo tom="alerta">Custo desconhecido</Selo>}
                  </div>
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      <section className="flex flex-col gap-3" aria-label="Alertas de estoque">
        <h3 className="font-semibold">Validade e estoque mínimo</h3>
        <p className="text-sm text-texto-suave">
          Avisos operacionais, sem recomendação de uso. Validade ausente continua não informada. O
          sistema não sugere produtos ou dosagens. Item sem estoque mínimo informado não gera aviso;
          com mínimo zero, o aviso aparece só com saldo zerado.
        </p>
        {alertas.isError && <Alerta tom="perigo" titulo={mensagemDeErro(alertas.error)} />}
        {(alertas.data?.minimo ?? []).map((i) => (
          <Alerta key={i.id} tom="alerta" titulo={`${i.nome}: estoque no mínimo ou abaixo`}>
            <Link className="text-marca underline" to={`/estoque/itens/${i.id}`}>
              {quantidadeEstoque(i.saldo, i.unidadeBase)} disponíveis; mínimo{' '}
              {quantidadeEstoque(i.estoqueMinimo!, i.unidadeBase)}
            </Link>
          </Alerta>
        ))}
        <Tabela data-testid="tabela-validade-estoque">
          <Cabeca>
            <Th>Item</Th>
            <Th>Lote físico</Th>
            <Th>Validade</Th>
            <Th>Saldo</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {(alertas.data?.validade ?? []).map((a) => (
              <Linha key={a.lote.id}>
                <Td>
                  <Link className="text-marca underline" to={`/estoque/itens/${a.itemId}`}>
                    {a.itemNome}
                  </Link>
                </Td>
                <Td>{a.lote.codigo}</Td>
                <Td>{formatarData(a.lote.validade!)}</Td>
                <Td>{quantidadeEstoque(a.lote.saldo, a.unidadeBase)}</Td>
                <Td>
                  {a.situacao === 'vencido'
                    ? 'Vencido'
                    : a.situacao === 'hoje'
                      ? 'Vence hoje'
                      : 'Próximo do vencimento'}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
        {!preferencias.isLoading && (
          <PreferenciaValidade
            key={pref.success ? pref.data.antecedenciaValidadeDias : 'inicial'}
            inicial={pref.success ? pref.data.antecedenciaValidadeDias : 7}
          />
        )}
      </section>
      {novo && (
        <ModalItemEstoque
          propriedadeId={propriedade.id}
          item={null}
          aoFechar={() => setNovo(false)}
        />
      )}
    </div>
  );
}
export function PaginaEstoque() {
  return <ComPropriedade>{(p) => <Conteudo key={p.id} propriedade={p} />}</ComPropriedade>;
}
