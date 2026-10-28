import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import type { OrigemFonte, StatusRegistro } from '@pecuaria/domain';
import { mensagemDeErro, ErroChamadaApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Alerta } from '../../components/ui/alerta';
import { AreaTexto, Campo, Entrada } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import { Selo } from '../../components/ui/selo';
import {
  avisosAlimentos,
  naturezaDaOrigem,
  origensFonte,
  statusRegistro,
  tomStatus,
} from '../../textos-alimentos';

const ABAS = [
  { para: '/alimentos', rotulo: 'Alimentos', fim: true },
  { para: '/alimentos/conferencia', rotulo: 'Conferência', fim: false },
  { para: '/alimentos/selecao', rotulo: 'Seleção', fim: false },
  { para: '/alimentos/perfis', rotulo: 'Perfis', fim: false },
  { para: '/alimentos/fontes', rotulo: 'Fontes', fim: false },
  { para: '/alimentos/nutrientes', rotulo: 'Nutrientes', fim: false },
  { para: '/alimentos/produtos', rotulo: 'Produtos comerciais', fim: false },
  { para: '/alimentos/propriedade', rotulo: 'Laudos e MS medida', fim: false },
];

export function LayoutAlimentos() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-8">
      <nav
        aria-label="Seções do banco de alimentos"
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-borda [scrollbar-width:thin]"
      >
        {ABAS.map((aba) => (
          <NavLink
            key={aba.para}
            to={aba.para}
            end={aba.fim}
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 px-4 py-2 text-sm whitespace-nowrap transition-colors',
                isActive
                  ? 'border-marca font-medium text-texto'
                  : 'border-transparent text-texto-suave hover:text-texto',
              )
            }
          >
            {aba.rotulo}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

export function SeloStatus({ status }: { status: StatusRegistro }) {
  return <Selo tom={tomStatus[status]}>{statusRegistro[status]}</Selo>;
}

/** Origem do dado sempre visível: tabela, estudo, laudo, rótulo ou medição própria. */
export function SeloOrigem({ origem }: { origem: OrigemFonte }) {
  const tom =
    origem === 'tabela_compilada' || origem === 'estudo_individual'
      ? 'marca'
      : origem === 'rotulo_comercial'
        ? 'alerta'
        : 'neutro';
  return (
    <Selo tom={tom} title={naturezaDaOrigem[origem]}>
      {origensFonte[origem]}
    </Selo>
  );
}

/** Aviso fixo conforme a origem (rótulo, laudo, medição). */
export function AvisoOrigem({
  origem,
  metodoMedicao,
  limitacoesMedicao,
}: {
  origem: OrigemFonte;
  metodoMedicao?: string | null;
  limitacoesMedicao?: string | null;
}) {
  if (origem === 'rotulo_comercial') return <Alerta tom="alerta" titulo={avisosAlimentos.rotulo} />;
  if (origem === 'laboratorial') return <Alerta tom="info" titulo={avisosAlimentos.laudo} />;
  if (origem === 'medicao_propria')
    return (
      <Alerta tom="alerta" titulo={avisosAlimentos.medicao}>
        <p>
          <strong>Método:</strong> {metodoMedicao ?? '—'}
        </p>
        <p>
          <strong>Limitações:</strong> {limitacoesMedicao ?? '—'}
        </p>
      </Alerta>
    );
  return null;
}

export interface CampoModal {
  nome: string;
  rotulo: string;
  ajuda?: string;
  multilinha?: boolean;
  obrigatorio?: boolean;
}

/**
 * Modal de confirmação com campos de texto (motivo, nome de quem executa). Erros do processo
 * principal aparecem no próprio modal.
 */
export function ModalCampos({
  titulo,
  descricao,
  campos,
  textoEnviar,
  perigoso = false,
  largura = 'md',
  enviando,
  aoFechar,
  aoConfirmar,
  children,
}: {
  titulo: string;
  descricao?: string;
  campos: CampoModal[];
  textoEnviar: string;
  perigoso?: boolean;
  largura?: 'md' | 'lg' | 'xl';
  enviando: boolean;
  aoFechar: () => void;
  aoConfirmar: (valores: Record<string, string>) => Promise<unknown>;
  children?: ReactNode;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(campos.map((c) => [c.nome, ''])),
  );
  const [erros, setErros] = useState<string[]>([]);
  return (
    <Modal
      aberto
      titulo={titulo}
      {...(descricao ? { descricao } : {})}
      aoFechar={aoFechar}
      textoEnviar={textoEnviar}
      perigoso={perigoso}
      largura={largura}
      enviando={enviando}
      erros={erros}
      aoEnviar={() => {
        const faltando = campos.filter((c) => c.obrigatorio !== false && !valores[c.nome]?.trim());
        if (faltando.length) {
          setErros(faltando.map((c) => `${c.rotulo} é obrigatório.`));
          return;
        }
        setErros([]);
        aoConfirmar(valores).then(aoFechar, (e: unknown) =>
          setErros(
            e instanceof ErroChamadaApi && e.detalhes.length ? e.detalhes : [mensagemDeErro(e)],
          ),
        );
      }}
    >
      {children}
      {campos.map((c) => (
        <Campo
          key={c.nome}
          rotulo={c.rotulo}
          obrigatorio={c.obrigatorio !== false}
          {...(c.ajuda ? { ajuda: c.ajuda } : {})}
        >
          {(p) =>
            c.multilinha ? (
              <AreaTexto
                {...p}
                value={valores[c.nome]}
                onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
              />
            ) : (
              <Entrada
                {...p}
                value={valores[c.nome]}
                onChange={(e) => setValores((v) => ({ ...v, [c.nome]: e.target.value }))}
              />
            )
          }
        </Campo>
      ))}
    </Modal>
  );
}

/** Erros de uma chamada (detalhes do Zod ou mensagem do main). */
export function errosDe(e: unknown): string[] {
  return e instanceof ErroChamadaApi && e.detalhes.length ? e.detalhes : [mensagemDeErro(e)];
}

/** Texto vazio vira null; usado nos formulários do módulo. */
export function nulo(texto: string): string | null {
  return texto.trim() === '' ? null : texto;
}

export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  ajuda,
  obrigatorio,
  multilinha,
  tipo = 'text',
  placeholder,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  ajuda?: string;
  obrigatorio?: boolean;
  multilinha?: boolean;
  tipo?: string;
  placeholder?: string;
}) {
  return (
    <Campo rotulo={rotulo} {...(ajuda ? { ajuda } : {})} {...(obrigatorio ? { obrigatorio } : {})}>
      {(p) =>
        multilinha ? (
          <AreaTexto {...p} value={valor} onChange={(e) => aoMudar(e.target.value)} />
        ) : (
          <Entrada
            {...p}
            type={tipo}
            value={valor}
            {...(placeholder ? { placeholder } : {})}
            onChange={(e) => aoMudar(e.target.value)}
          />
        )
      }
    </Campo>
  );
}
