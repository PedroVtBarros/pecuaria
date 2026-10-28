import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Tag, Trash2 } from 'lucide-react';
import {
  DEFINICOES_UNIDADE,
  mesmaGrandeza,
  SEPARADORES_DECIMAIS,
  TIPOS_VALOR_GARANTIA,
  UNIDADES_NUTRICIONAIS,
  type SeparadorDecimal,
  type UnidadeNutricional,
} from '@pecuaria/domain';
import type { DadosRotulo } from '@pecuaria/shared-types';
import { mensagemDeErro } from '../../lib/api';
import {
  useAcaoAlimentos,
  useAlimentos,
  useNutrientes,
  useRegistros,
} from '../../lib/consultas-alimentos';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada, opcoesDe, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { CabecalhoPagina, EstadoVazio } from '../../components/ui/pagina';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { avisosAlimentos, separadores, tiposValor } from '../../textos-alimentos';
import { CampoTexto, errosDe, nulo, SeloStatus } from './componentes-alimentos';
import {
  CamposAlimento,
  dadosDoFormularioAlimento,
  valoresIniciaisAlimento,
} from './pagina-alimentos';

interface Garantia {
  nutrienteId: string;
  valorPublicado: string;
  unidade: UnidadeNutricional | '';
  tipoValor: 'minimo_garantido' | 'maximo_garantido' | '';
}
const garantiaVazia = (): Garantia => ({
  nutrienteId: '',
  valorPublicado: '',
  unidade: '',
  tipoValor: '',
});

function ModalRotulo({ aoFechar }: { aoFechar: () => void }) {
  const navegar = useNavigate();
  const comerciais = (useAlimentos({ busca: '' }).data ?? []).filter((a) => a.comercial);
  const nutrientes = useNutrientes().data ?? [];
  const registrar = useAcaoAlimentos('rotulo:registrar');
  const [alimentoId, setAlimentoId] = useState('');
  const [alimento, setAlimento] = useState(() => ({
    ...valoresIniciaisAlimento(null),
    formaConservacao: 'mistura_comercial' as const,
    comercial: true,
  }));
  const [v, setV] = useState({ titulo: '', fabricante: '', registroProduto: '', observacoes: '' });
  const [separador, setSeparador] = useState<SeparadorDecimal>('virgula');
  const [garantias, setGarantias] = useState<Garantia[]>([garantiaVazia()]);
  const [erros, setErros] = useState<string[]>([]);
  const mudarGarantia = (i: number, g: Partial<Garantia>) =>
    setGarantias((lista) => lista.map((x, j) => (j === i ? { ...x, ...g } : x)));
  return (
    <Modal
      aberto
      largura="xl"
      titulo="Produto comercial pelo rótulo"
      descricao={avisosAlimentos.rotulo}
      aoFechar={aoFechar}
      erros={erros}
      enviando={registrar.isPending}
      textoEnviar="Registrar rótulo"
      aoEnviar={() => {
        if (garantias.some((g) => !g.nutrienteId || !g.unidade || !g.tipoValor)) {
          setErros(['Complete o nutriente, a unidade e o tipo de cada garantia.']);
          return;
        }
        const dados: DadosRotulo = {
          alimentoId: alimentoId || null,
          alimento: alimentoId ? null : { ...dadosDoFormularioAlimento(alimento), comercial: true },
          titulo: v.titulo,
          fabricante: v.fabricante,
          registroProduto: nulo(v.registroProduto),
          observacoes: nulo(v.observacoes),
          separadorDecimal: separador,
          garantias: garantias.map((g) => ({
            nutrienteId: g.nutrienteId,
            valorPublicado: g.valorPublicado,
            unidade: g.unidade as UnidadeNutricional,
            tipoValor: g.tipoValor as 'minimo_garantido',
            observacao: null,
          })),
        };
        registrar.mutate(dados, {
          onSuccess: (r) => navegar(`/alimentos/registros/${r.registro.id}`),
          onError: (e) => setErros(errosDe(e)),
        });
      }}
    >
      <Campo
        rotulo="Produto"
        ajuda="Escolha um produto comercial já cadastrado ou cadastre um novo abaixo."
      >
        {(p) => (
          <Selecao {...p} value={alimentoId} onChange={(e) => setAlimentoId(e.target.value)}>
            <option value="">Cadastrar produto novo</option>
            {comerciais.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      {!alimentoId && (
        <CamposAlimento
          v={alimento}
          definir={(k, x) => setAlimento((a) => ({ ...a, [k]: x }))}
          ocultarComercial
        />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto
          rotulo="Título do rótulo"
          obrigatorio
          valor={v.titulo}
          aoMudar={(x) => setV({ ...v, titulo: x })}
        />
        <CampoTexto
          rotulo="Fabricante"
          obrigatorio
          valor={v.fabricante}
          aoMudar={(x) => setV({ ...v, fabricante: x })}
        />
        <CampoTexto
          rotulo="Registro do produto"
          valor={v.registroProduto}
          aoMudar={(x) => setV({ ...v, registroProduto: x })}
        />
        <Campo rotulo="Separador decimal do rótulo" obrigatorio>
          {(p) => (
            <Selecao
              {...p}
              value={separador}
              onChange={(e) => setSeparador(e.target.value as SeparadorDecimal)}
            >
              {opcoesDe(separadores, SEPARADORES_DECIMAIS)}
            </Selecao>
          )}
        </Campo>
      </div>
      <section className="flex flex-col gap-2" aria-label="Níveis de garantia">
        <h3 className="text-sm font-semibold">
          Níveis de garantia (matéria natural, como no rótulo)
        </h3>
        {garantias.map((g, i) => {
          const n = nutrientes.find((x) => x.id === g.nutrienteId);
          const unidades = n
            ? UNIDADES_NUTRICIONAIS.filter((u) => mesmaGrandeza(u, n.unidadeReferencia))
            : UNIDADES_NUTRICIONAIS;
          return (
            <div
              key={i}
              className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_1.4fr_auto]"
            >
              <Campo rotulo={`Nutriente ${i + 1}`}>
                {(p) => (
                  <Selecao
                    {...p}
                    value={g.nutrienteId}
                    onChange={(e) => mudarGarantia(i, { nutrienteId: e.target.value })}
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
              <Campo rotulo="Valor no rótulo">
                {(p) => (
                  <Entrada
                    {...p}
                    value={g.valorPublicado}
                    onChange={(e) => mudarGarantia(i, { valorPublicado: e.target.value })}
                  />
                )}
              </Campo>
              <Campo rotulo="Unidade">
                {(p) => (
                  <Selecao
                    {...p}
                    value={g.unidade}
                    onChange={(e) =>
                      mudarGarantia(i, { unidade: e.target.value as UnidadeNutricional })
                    }
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
              <Campo rotulo="Garantia">
                {(p) => (
                  <Selecao
                    {...p}
                    value={g.tipoValor}
                    onChange={(e) =>
                      mudarGarantia(i, { tipoValor: e.target.value as Garantia['tipoValor'] })
                    }
                  >
                    <option value="">—</option>
                    {opcoesDe(tiposValor, TIPOS_VALOR_GARANTIA)}
                  </Selecao>
                )}
              </Campo>
              <Botao
                variante="fantasma"
                tamanho="icone"
                aria-label={`Remover garantia ${i + 1}`}
                disabled={garantias.length === 1}
                onClick={() => setGarantias((l) => l.filter((_, j) => j !== i))}
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
          onClick={() => setGarantias((l) => [...l, garantiaVazia()])}
        >
          <Plus className="size-4" aria-hidden />
          Adicionar garantia
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

export function PaginaProdutosComerciais() {
  const [novo, setNovo] = useState(false);
  const lista = useRegistros({ origem: 'rotulo_comercial' });
  const itens = lista.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Produtos comerciais"
        descricao="Rações, suplementos e minerais cadastrados pelo rótulo, com os níveis de garantia."
        acoes={
          <Botao onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden />
            Novo produto pelo rótulo
          </Botao>
        }
      />
      <Alerta tom="alerta" titulo={avisosAlimentos.rotulo} />
      {lista.isError && <Alerta tom="perigo" titulo={mensagemDeErro(lista.error)} />}
      {itens.length === 0 ? (
        <EstadoVazio
          icone={Tag}
          titulo={lista.isLoading ? 'Carregando' : 'Nenhum rótulo registrado'}
        />
      ) : (
        <Tabela data-testid="tabela-produtos">
          <Cabeca>
            <Th>Produto</Th>
            <Th>Rótulo</Th>
            <Th>Garantias</Th>
            <Th>Situação</Th>
          </Cabeca>
          <tbody>
            {itens.map((r) => (
              <Linha key={r.id}>
                <Td>
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/alimentos/itens/${r.alimentoId}`}
                  >
                    {r.alimentoNome}
                  </Link>
                </Td>
                <Td>
                  <Link className="text-marca underline" to={`/alimentos/registros/${r.id}`}>
                    {r.fonte.titulo}
                  </Link>
                </Td>
                <Td>{r.nValores}</Td>
                <Td>
                  <SeloStatus status={r.status} />
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {novo && <ModalRotulo aoFechar={() => setNovo(false)} />}
    </div>
  );
}
