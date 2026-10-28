import { limitesDoPeriodo, somarDias } from '@pecuaria/domain';
import { Botao } from '../../components/ui/botao';
import { Campo, Entrada } from '../../components/ui/campos';
import { hojeIso } from '../../lib/formatar-rebanho';

export interface Periodo {
  inicio: string;
  fim: string;
}

/** Mês corrente: do dia 1 ao último dia. */
export function mesCorrente(hoje: string = hojeIso()): Periodo {
  const { inicio, fim } = limitesDoPeriodo(hoje.slice(0, 7), 'mes');
  return { inicio, fim };
}

function mesAnterior(hoje: string): Periodo {
  const primeiro = limitesDoPeriodo(hoje.slice(0, 7), 'mes').inicio;
  return mesCorrente(somarDias(primeiro, -1));
}

/** Período de datas com atalhos. O padrão da tela é o mês corrente. */
export function SeletorPeriodo({
  periodo,
  aoMudar,
  rotuloInicio = 'De',
  rotuloFim = 'Até',
  atalhosAFrente = false,
}: {
  periodo: Periodo;
  aoMudar: (p: Periodo) => void;
  rotuloInicio?: string;
  rotuloFim?: string;
  /** Inclui atalhos que olham para a frente (próximos 30/90 dias), úteis para o previsto. */
  atalhosAFrente?: boolean;
}) {
  const hoje = hojeIso();
  const atalhos: [string, Periodo][] = [
    ['Este mês', mesCorrente(hoje)],
    ['Mês passado', mesAnterior(hoje)],
    ['Últimos 90 dias', { inicio: somarDias(hoje, -89), fim: hoje }],
    ['Este ano', { inicio: `${hoje.slice(0, 4)}-01-01`, fim: `${hoje.slice(0, 4)}-12-31` }],
  ];
  if (atalhosAFrente) {
    atalhos.push(
      ['Próximos 30 dias', { inicio: hoje, fim: somarDias(hoje, 30) }],
      ['Próximos 90 dias', { inicio: hoje, fim: somarDias(hoje, 90) }],
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Campo rotulo={rotuloInicio}>
        {(p) => (
          <Entrada
            {...p}
            type="date"
            value={periodo.inicio}
            onChange={(e) => e.target.value && aoMudar({ ...periodo, inicio: e.target.value })}
          />
        )}
      </Campo>
      <Campo rotulo={rotuloFim}>
        {(p) => (
          <Entrada
            {...p}
            type="date"
            value={periodo.fim}
            onChange={(e) => e.target.value && aoMudar({ ...periodo, fim: e.target.value })}
          />
        )}
      </Campo>
      <div className="flex flex-wrap gap-2">
        {atalhos.map(([rotulo, p]) => (
          <Botao key={rotulo} variante="secundario" tamanho="pequeno" onClick={() => aoMudar(p)}>
            {rotulo}
          </Botao>
        ))}
      </div>
    </div>
  );
}
