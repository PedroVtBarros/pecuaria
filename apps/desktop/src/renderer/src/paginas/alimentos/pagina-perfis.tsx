import { Link, useParams } from 'react-router';
import { Layers } from 'lucide-react';
import { mensagemDeErro } from '../../lib/api';
import { useNutrientes, usePerfil, usePerfis } from '../../lib/consultas-alimentos';
import { formatarDataHora } from '../../lib/formatar';
import { Alerta } from '../../components/ui/alerta';
import { CabecalhoPagina, EstadoVazio, ListaDados } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import {
  basesNutricionais,
  cenariosPerfil,
  formasObtencao,
  niveisCorrespondencia,
  tiposPerfil,
  unidadesNutricionais,
} from '../../textos-alimentos';

const numero = (x: number | null) =>
  x === null ? '—' : x.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Perfis de composição gravados (Fase 5D). Imutáveis: para mudar, grave outro. */
export function PaginaPerfis() {
  const perfis = usePerfis(null);
  const itens = perfis.data ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo="Perfis de composição"
        descricao="Resultados gravados da seleção. Não mudam depois de gravados; a Fase 6 vai usá-los no cálculo."
      />
      {perfis.isError && <Alerta tom="perigo" titulo={mensagemDeErro(perfis.error)} />}
      {itens.length === 0 ? (
        <EstadoVazio
          icone={Layers}
          titulo={perfis.isLoading ? 'Carregando' : 'Nenhum perfil gravado'}
        />
      ) : (
        <Tabela data-testid="tabela-perfis">
          <Cabeca>
            <Th>Perfil</Th>
            <Th>Alimento</Th>
            <Th>Tipo</Th>
            <Th>Nível</Th>
            <Th>Valores</Th>
            <Th>Gravado</Th>
          </Cabeca>
          <tbody>
            {itens.map((p) => (
              <Linha key={p.id}>
                <Td>
                  <Link
                    className="font-medium text-marca hover:underline"
                    to={`/alimentos/perfis/${p.id}`}
                  >
                    {p.nome}
                  </Link>
                </Td>
                <Td>{p.alimentoNome}</Td>
                <Td>
                  {tiposPerfil[p.tipo]}
                  {p.nutrienteReferencia &&
                    ` (${cenariosPerfil[p.cenario].toLowerCase()} para ${p.nutrienteReferencia.codigo})`}
                </Td>
                <Td>{niveisCorrespondencia[p.nivel]}</Td>
                <Td>{p.nValores}</Td>
                <Td>
                  {p.criadoPor} · {formatarDataHora(p.criadoEm)}
                </Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
    </div>
  );
}

export function PaginaPerfil() {
  const { id = '' } = useParams();
  const d = usePerfil(id);
  const nutrientes = useNutrientes(true);
  if (d.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(d.error)} />;
  if (!d.data) return null;
  const { perfil: p, valores } = d.data;
  const nome = (nid: string) => nutrientes.data?.find((n) => n.id === nid)?.codigo ?? nid;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <CabecalhoPagina
        titulo={`Perfil de composição: ${p.nome}`}
        descricao="Imutável. Cada valor aponta para os valores conferidos de onde saiu."
      />
      <ListaDados
        itens={[
          { rotulo: 'Alimento', valor: p.alimentoNome },
          {
            rotulo: 'Tipo',
            valor: (
              <>
                {tiposPerfil[p.tipo]} · <Selo>{cenariosPerfil[p.cenario]}</Selo>
                {p.nutrienteReferencia && ` para ${p.nutrienteReferencia.codigo}`}
              </>
            ),
          },
          { rotulo: 'Nível de correspondência', valor: niveisCorrespondencia[p.nivel] },
          {
            rotulo: 'Idade de corte buscada',
            valor: p.idadeCorteBuscaDias !== null ? `${p.idadeCorteBuscaDias} dias` : '—',
          },
          { rotulo: 'Regra', valor: `${p.regraCodigo}, versão ${p.regraVersao}` },
          { rotulo: 'Gravado', valor: `${p.criadoPor} · ${formatarDataHora(p.criadoEm)}` },
        ]}
      />
      <section className="flex flex-col gap-2" aria-label="Limitações">
        <h3 className="font-semibold">Limitações</h3>
        <ul className="list-disc pl-5 text-sm" data-testid="limitacoes-perfil">
          {[...d.data.diferencas, ...d.data.limitacoes].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
      <Tabela data-testid="tabela-perfil-valores">
        <Cabeca>
          <Th>Nutriente</Th>
          <Th>Valor</Th>
          <Th>Origens</Th>
          <Th>Mediana · mín. · máx.</Th>
          <Th>Obtenção</Th>
          <Th>De onde saiu</Th>
        </Cabeca>
        <tbody>
          {valores.map((v) => (
            <Linha key={v.id}>
              <Td>
                <span className="font-medium">{v.nutriente.codigo}</span> · {v.nutriente.nome}
              </Td>
              <Td className="whitespace-nowrap">
                {v.valorPublicado ?? numero(v.valor)} {unidadesNutricionais[v.unidade]} (
                {basesNutricionais[v.base]})
                {v.interpretacaoBase && (
                  <span className="block text-xs text-alerta">
                    Base inferida, não declarada pela fonte
                  </span>
                )}
              </Td>
              <Td>
                {v.nOrigens}
                {v.cobertura && (
                  <span className="block text-xs text-texto-suave">Cobertura: {v.cobertura}</span>
                )}
              </Td>
              <Td className="text-xs">
                {v.mediana === null
                  ? '—'
                  : `${numero(v.mediana)} · ${numero(v.minimo)} · ${numero(v.maximo)}`}
              </Td>
              <Td className="text-xs">
                {formasObtencao[v.formaObtencao]}
                {v.metodoAnaliticoFonte && ` · ${v.metodoAnaliticoFonte}`}
              </Td>
              <Td className="text-xs">
                {v.origens.map((o) => (
                  <Link
                    key={o.valorNutricionalId}
                    className="block text-marca underline"
                    to={`/alimentos/registros/${o.registroId}`}
                  >
                    Registro de origem ({numero(o.valorUsado)})
                  </Link>
                ))}
              </Td>
            </Linha>
          ))}
        </tbody>
      </Tabela>
      {d.data.naoQuantificados.length > 0 && (
        <p className="text-sm text-texto-suave">
          Não quantificados no registro (sem número, fora do cálculo):{' '}
          {d.data.naoQuantificados
            .map((q) => `${nome(q.nutrienteId)} "${q.textoPublicado}"`)
            .join('; ')}
          .
        </p>
      )}
    </div>
  );
}
