import { Link } from 'react-router';
import { CalendarClock, Plus, ShieldAlert, Syringe } from 'lucide-react';
import type { AnimalDetalhe } from '@pecuaria/shared-types';
import { useSanidadeAnimal } from '../../lib/consultas-rebanho';
import { mensagemDeErro } from '../../lib/api';
import { formatarData, formatarDose } from '../../lib/formatar-rebanho';
import { rotulos } from '../../textos-rebanho';
import { Alerta } from '../../components/ui/alerta';
import { Botao } from '../../components/ui/botao';
import { EstadoVazio } from '../../components/ui/pagina';
import { Selo } from '../../components/ui/selo';
import { Cabeca, Linha, Tabela, Td, Th } from '../../components/ui/tabela';
import { AVISO_CARENCIA } from './modais-sanidade';
import { SeloSituacao } from './pagina-agenda';

function FimDeCarencia({ data }: { data: string | null }) {
  if (!data) return <>—</>;
  return (
    <span className="flex items-center gap-1">
      <ShieldAlert className="size-3.5 text-texto-suave" aria-hidden />
      {formatarData(data)}
    </span>
  );
}

/** Histórico sanitário, carências em curso e pendências da agenda de um animal. */
export function SanidadeDoAnimal({ animal }: { animal: AnimalDetalhe }) {
  const sanidade = useSanidadeAnimal(animal.id);
  if (sanidade.isError) return <Alerta tom="perigo" titulo={mensagemDeErro(sanidade.error)} />;
  const s = sanidade.data;
  if (!s) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-texto-suave">
          Vacinas, vermífugos, tratamentos e exames, individuais ou do lote.
        </p>
        <Link to={`/manejo/sanidade/novo?animal=${animal.id}`}>
          <Botao>
            <Plus className="size-4" aria-hidden />
            Registrar sanidade
          </Botao>
        </Link>
      </div>

      {(s.carenciaCarne || s.carenciaLeite) && (
        <Alerta tom="alerta" titulo="Animal dentro do prazo de carência informado">
          <ul className="list-disc pl-4" data-testid="carencias-animal">
            {s.carenciaCarne && (
              <li>
                Carne: fim do prazo calculado em {formatarData(s.carenciaCarne.fimPrazo)} (
                {s.carenciaCarne.produto})
              </li>
            )}
            {s.carenciaLeite && (
              <li>
                Leite: fim do prazo calculado em {formatarData(s.carenciaLeite.fimPrazo)} (
                {s.carenciaLeite.produto})
              </li>
            )}
          </ul>
          <p className="mt-1">{AVISO_CARENCIA}</p>
        </Alerta>
      )}

      {s.agenda.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-borda bg-superficie p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4 text-marca" aria-hidden />
            Próximos eventos
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {s.agenda.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-texto-suave">{formatarData(a.dataPrevista)}</span>
                {a.situacao && <SeloSituacao situacao={a.situacao} />}
                <span>
                  {rotulos.tipoManejo[a.tipo]}: {a.produto?.nome ?? a.descricao}
                </span>
                {a.lote && <span className="text-texto-suave">(lote: {a.lote.nome})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.eventos.length === 0 ? (
        <EstadoVazio icone={Syringe} titulo="Nenhum registro sanitário" />
      ) : (
        <Tabela data-testid="tabela-sanidade-animal">
          <Cabeca>
            <Th>Data</Th>
            <Th>Tipo</Th>
            <Th>Produto ou descrição</Th>
            <Th>Dose</Th>
            <Th>Via</Th>
            <Th>Carência carne: fim do prazo</Th>
            <Th>Carência leite: fim do prazo</Th>
            <Th>Responsável</Th>
          </Cabeca>
          <tbody>
            {s.eventos.map((e) => (
              <Linha key={e.eventoId}>
                <Td className="whitespace-nowrap">
                  <Link
                    to={`/manejo/sanidade/${e.manejoId}`}
                    className="text-marca hover:underline"
                  >
                    {formatarData(e.data)}
                  </Link>
                </Td>
                <Td>{rotulos.tipoManejo[e.tipo]}</Td>
                <Td>
                  {e.produto?.nome ?? e.descricao}
                  {e.abrangencia === 'coletiva' && (
                    <Selo className="ml-2">Coletiva{e.lote ? ` · ${e.lote.nome}` : ''}</Selo>
                  )}
                  {e.diagnostico && (
                    <span className="block text-xs text-texto-suave">{e.diagnostico}</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{formatarDose(e.dose, e.unidadeDose)}</Td>
                <Td>{e.via ? rotulos.via[e.via] : '—'}</Td>
                <Td className="whitespace-nowrap">
                  <FimDeCarencia data={e.fimCarenciaCarne} />
                </Td>
                <Td className="whitespace-nowrap">
                  <FimDeCarencia data={e.fimCarenciaLeite} />
                </Td>
                <Td>{e.responsavel ?? '—'}</Td>
              </Linha>
            ))}
          </tbody>
        </Tabela>
      )}
      {!s.carenciaCarne &&
        !s.carenciaLeite &&
        s.eventos.some((e) => e.fimCarenciaCarne || e.fimCarenciaLeite) && (
          <p className="text-xs text-texto-suave">{AVISO_CARENCIA}</p>
        )}
    </div>
  );
}
