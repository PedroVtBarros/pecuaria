import { useState } from 'react';
import {
  BASES_NUTRICIONAIS,
  basesPermitidas,
  DEFINICOES_UNIDADE,
  exigeDataAmostra,
  exigeDescricaoObtencao,
  FORMAS_OBTENCAO,
  exigeReferenciaLocal,
  lerNumeroPublicado,
  mesmaGrandeza,
  NATUREZAS_NAO_QUANTIFICADO,
  problemasDoNaoQuantificado,
  SEPARADORES_DECIMAIS,
  tiposValorPermitidos,
  UNIDADES_NUTRICIONAIS,
  type BaseNutricional,
  type FormaObtencao,
  type NaturezaNaoQuantificado,
  type OrigemFonte,
  type SeparadorDecimal,
  type TipoValor,
  type UnidadeNutricional,
} from '@pecuaria/domain';
import type {
  DadosRegistro,
  DadosValor,
  DadosValorNaoQuantificado,
  Fonte,
  Nutriente,
  RegistroComposicao,
  ValorNaoQuantificadoApi,
  ValorNutricionalApi,
} from '@pecuaria/shared-types';
import { useAcaoAlimentos, useNutrientes } from '../../lib/consultas-alimentos';
import { Alerta } from '../../components/ui/alerta';
import { Campo, opcoesDe, Selecao } from '../../components/ui/campos';
import { Modal } from '../../components/ui/modal';
import {
  avisosAlimentos,
  basesPorExtenso,
  descreverFonte,
  formasObtencao,
  naturezasNaoQuantificado,
  origensFonte,
  separadores,
  situacoesFundamentacao,
  tiposValor,
  unidadesNutricionais,
} from '../../textos-alimentos';
import { CampoTexto, errosDe, nulo } from './componentes-alimentos';

/** "Nome: valor" por linha ↔ objeto de condições adicionais. */
export function textoParaCondicoes(texto: string): Record<string, string> | null | string {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhas.length === 0) return null;
  const r: Record<string, string> = {};
  for (const l of linhas) {
    const i = l.indexOf(':');
    if (i <= 0) return `Use "nome: valor" em cada linha de outras condições ("${l}").`;
    r[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return r;
}
export function condicoesParaTexto(c: Record<string, string> | null): string {
  return c
    ? Object.entries(c)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '';
}

const inteiroOuNulo = (t: string): number | null => (t.trim() === '' ? null : Number(t.trim()));

/** Cabeçalho do registro: fonte (só ao criar), página ou tabela, condições e separador. */
export function ModalCabecalhoRegistro({
  alimentoId,
  fontes,
  registro,
  aoFechar,
  aoSalvar,
}: {
  alimentoId: string;
  fontes: Fonte[];
  registro: RegistroComposicao | null;
  aoFechar: () => void;
  aoSalvar: (id: string) => void;
}) {
  const [v, setV] = useState({
    fonteId: registro?.fonte.id ?? '',
    referenciaLocal: registro?.referenciaLocal ?? '',
    idadeCorteDias: registro?.idadeCorteDias?.toString() ?? '',
    classeIdadeFonte: registro?.classeIdadeFonte ?? '',
    aditivoEnsilagem: registro?.aditivoEnsilagem ?? '',
    regiao: registro?.regiao ?? '',
    estacao: registro?.estacao ?? '',
    adubacao: registro?.adubacao ?? '',
    outras: condicoesParaTexto(registro?.outrasCondicoes ?? null),
    nObservacoes: registro?.nObservacoes?.toString() ?? '',
    separadorDecimal: (registro?.separadorDecimal ?? 'virgula') as SeparadorDecimal,
    dataAmostra: registro?.dataAmostra ?? '',
    identificacaoAmostra: registro?.identificacaoAmostra ?? '',
    observacoes: registro?.observacoes ?? '',
  });
  const [erros, setErros] = useState<string[]>([]);
  const criar = useAcaoAlimentos('composicao:criar');
  const atualizar = useAcaoAlimentos('composicao:atualizar');
  const def = (k: keyof typeof v) => (x: string) => setV((a) => ({ ...a, [k]: x }));
  const fonte = fontes.find((f) => f.id === v.fonteId);
  const origem: OrigemFonte | null = registro?.fonte.origem ?? fonte?.origem ?? null;
  return (
    <Modal
      aberto
      largura="lg"
      titulo={registro ? 'Editar cabeçalho do registro' : 'Novo registro de composição'}
      descricao="Um registro é uma linha de tabela, um estudo, um laudo, um rótulo ou uma medição. Sem fonte, sem dado."
      aoFechar={aoFechar}
      erros={erros}
      enviando={criar.isPending || atualizar.isPending}
      aoEnviar={() => {
        const outras = textoParaCondicoes(v.outras);
        if (typeof outras === 'string') {
          setErros([outras]);
          return;
        }
        if (!v.fonteId) {
          setErros(['Escolha a fonte.']);
          return;
        }
        const dados: DadosRegistro = {
          alimentoId,
          fonteId: v.fonteId,
          referenciaLocal: nulo(v.referenciaLocal),
          idadeCorteDias: inteiroOuNulo(v.idadeCorteDias),
          classeIdadeFonte: nulo(v.classeIdadeFonte),
          aditivoEnsilagem: nulo(v.aditivoEnsilagem),
          regiao: nulo(v.regiao),
          estacao: nulo(v.estacao),
          adubacao: nulo(v.adubacao),
          outrasCondicoes: outras,
          nObservacoes: inteiroOuNulo(v.nObservacoes),
          separadorDecimal: v.separadorDecimal,
          dataAmostra: nulo(v.dataAmostra),
          identificacaoAmostra: nulo(v.identificacaoAmostra),
          observacoes: nulo(v.observacoes),
        };
        const ok = (d: { registro: { id: string } }) => {
          aoSalvar(d.registro.id);
          aoFechar();
        };
        if (registro)
          atualizar.mutate(
            { id: registro.id, dados },
            { onSuccess: ok, onError: (e) => setErros(errosDe(e)) },
          );
        else criar.mutate({ dados }, { onSuccess: ok, onError: (e) => setErros(errosDe(e)) });
      }}
    >
      {!registro && (
        <Campo rotulo="Fonte" obrigatorio ajuda="Cadastre a fonte antes, na aba Fontes.">
          {(p) => (
            <Selecao {...p} value={v.fonteId} onChange={(e) => def('fonteId')(e.target.value)}>
              <option value="">Selecione</option>
              {fontes.map((f) => (
                <option key={f.id} value={f.id}>
                  {origensFonte[f.origem]}: {descreverFonte(f)}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto
          rotulo="Página ou tabela"
          obrigatorio={origem ? exigeReferenciaLocal(origem) : false}
          valor={v.referenciaLocal}
          aoMudar={def('referenciaLocal')}
          ajuda="Onde reler o valor na fonte (ex.: Tabela 3, p. 45)."
        />
        <Campo
          rotulo="Separador decimal da fonte"
          obrigatorio
          ajuda="Como a fonte imprime os números."
        >
          {(p) => (
            <Selecao
              {...p}
              value={v.separadorDecimal}
              onChange={(e) => def('separadorDecimal')(e.target.value)}
            >
              {opcoesDe(separadores, SEPARADORES_DECIMAIS)}
            </Selecao>
          )}
        </Campo>
        {origem && exigeDataAmostra(origem) && (
          <>
            <CampoTexto
              rotulo="Data da amostra"
              obrigatorio
              tipo="date"
              valor={v.dataAmostra}
              aoMudar={def('dataAmostra')}
            />
            <CampoTexto
              rotulo="Identificação da amostra"
              valor={v.identificacaoAmostra}
              aoMudar={def('identificacaoAmostra')}
            />
          </>
        )}
        <CampoTexto
          rotulo="Idade de corte (dias)"
          valor={v.idadeCorteDias}
          aoMudar={def('idadeCorteDias')}
          ajuda="Só se a fonte informar."
        />
        <CampoTexto
          rotulo="Classe de idade da fonte"
          valor={v.classeIdadeFonte}
          aoMudar={def('classeIdadeFonte')}
        />
        <CampoTexto
          rotulo="Aditivo de ensilagem"
          valor={v.aditivoEnsilagem}
          aoMudar={def('aditivoEnsilagem')}
        />
        <CampoTexto rotulo="Região" valor={v.regiao} aoMudar={def('regiao')} />
        <CampoTexto rotulo="Estação" valor={v.estacao} aoMudar={def('estacao')} />
        <CampoTexto rotulo="Adubação" valor={v.adubacao} aoMudar={def('adubacao')} />
        <CampoTexto
          rotulo="Número de observações"
          valor={v.nObservacoes}
          aoMudar={def('nObservacoes')}
        />
      </div>
      <CampoTexto
        rotulo="Outras condições"
        multilinha
        valor={v.outras}
        aoMudar={def('outras')}
        ajuda='Uma por linha, no formato "nome: valor", como a fonte descreve.'
      />
      <CampoTexto
        rotulo="Observações"
        multilinha
        valor={v.observacoes}
        aoMudar={def('observacoes')}
      />
    </Modal>
  );
}

/** Número digitado lido como o sistema vai gravar, para o usuário conferir na hora. */
function leitura(texto: string, separador: SeparadorDecimal): string | null {
  if (!texto.trim()) return null;
  const l = lerNumeroPublicado(texto, separador);
  return l.ok
    ? `Lido como ${l.numero.valor.toLocaleString('pt-BR', { maximumFractionDigits: 12 })} (${l.numero.casasDecimais} ${l.numero.casasDecimais === 1 ? 'casa decimal' : 'casas decimais'}).`
    : l.motivo;
}

/** Inclusão ou edição de um valor, como publicado. */
export function ModalValor({
  registroId,
  origem,
  separador,
  valor,
  aoFechar,
}: {
  registroId: string;
  origem: OrigemFonte;
  separador: SeparadorDecimal;
  valor: ValorNutricionalApi | null;
  aoFechar: () => void;
}) {
  const nutrientes = useNutrientes();
  const tipos = tiposValorPermitidos(origem);
  const bases = basesPermitidas(origem);
  const [v, setV] = useState({
    nutrienteId: valor?.nutriente.id ?? '',
    valorPublicado: valor?.valorPublicado ?? '',
    unidade: (valor?.unidade ?? '') as UnidadeNutricional | '',
    base: (valor?.base ?? (bases.length === 1 ? bases[0] : '')) as BaseNutricional | '',
    tipoValor: (valor?.tipoValor ?? (tipos.length === 1 ? tipos[0] : '')) as TipoValor | '',
    desvioPadraoPublicado: valor?.desvioPadraoPublicado ?? '',
    minimoPublicado: valor?.minimoPublicado ?? '',
    maximoPublicado: valor?.maximoPublicado ?? '',
    nObservacoes: valor?.nObservacoes?.toString() ?? '',
    metodoAnaliticoFonte: valor?.metodoAnaliticoFonte ?? '',
    formaObtencao: (valor?.formaObtencao ?? 'nao_informado') as FormaObtencao,
    descricaoObtencao: valor?.descricaoObtencao ?? '',
    interpretacaoBase: valor?.interpretacaoBase ?? '',
    referenciaLocal: valor?.referenciaLocal ?? '',
    observacao: valor?.observacao ?? '',
  });
  const [erros, setErros] = useState<string[]>([]);
  const salvar = useAcaoAlimentos('composicao:salvarValor');
  const def = (k: keyof typeof v) => (x: string) => setV((a) => ({ ...a, [k]: x }));
  const nutriente: Nutriente | undefined = (nutrientes.data ?? []).find(
    (n) => n.id === v.nutrienteId,
  );
  const unidades = nutriente
    ? UNIDADES_NUTRICIONAIS.filter((u) => mesmaGrandeza(u, nutriente.unidadeReferencia))
    : UNIDADES_NUTRICIONAIS;
  return (
    <Modal
      aberto
      largura="lg"
      titulo={valor ? 'Editar valor' : 'Novo valor'}
      descricao={avisosAlimentos.numeroComoPublicado}
      aoFechar={aoFechar}
      erros={erros}
      enviando={salvar.isPending}
      aoEnviar={() => {
        if (!v.nutrienteId || !v.unidade || !v.base || !v.tipoValor) {
          setErros(['Escolha o nutriente, a unidade, a base e o tipo de valor.']);
          return;
        }
        const dados: DadosValor = {
          nutrienteId: v.nutrienteId,
          valorPublicado: v.valorPublicado,
          unidade: v.unidade,
          base: v.base,
          tipoValor: v.tipoValor,
          desvioPadraoPublicado: nulo(v.desvioPadraoPublicado),
          minimoPublicado: nulo(v.minimoPublicado),
          maximoPublicado: nulo(v.maximoPublicado),
          nObservacoes: inteiroOuNulo(v.nObservacoes),
          metodoAnaliticoFonte: nulo(v.metodoAnaliticoFonte),
          formaObtencao: v.formaObtencao,
          descricaoObtencao: nulo(v.descricaoObtencao),
          interpretacaoBase: nulo(v.interpretacaoBase),
          referenciaLocal: nulo(v.referenciaLocal),
          observacao: nulo(v.observacao),
        };
        salvar.mutate(
          { registroId, valorId: valor?.id ?? null, dados },
          { onSuccess: aoFechar, onError: (e) => setErros(errosDe(e)) },
        );
      }}
    >
      <Campo rotulo="Nutriente (definição)" obrigatorio>
        {(p) => (
          <Selecao
            {...p}
            value={v.nutrienteId}
            onChange={(e) => def('nutrienteId')(e.target.value)}
          >
            <option value="">Selecione</option>
            {(nutrientes.data ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.codigo} · {n.nome}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      {nutriente && (
        <Alerta
          tom={nutriente.situacaoFundamentacao === 'pendente' ? 'alerta' : 'info'}
          titulo={`Referência da definição: ${unidadesNutricionais[nutriente.unidadeReferencia]} na ${basesPorExtenso[nutriente.baseReferencia]}. ${situacoesFundamentacao[nutriente.situacaoFundamentacao]}.`}
        >
          {nutriente.situacaoFundamentacao === 'pendente' && avisosAlimentos.pendente}
        </Alerta>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CampoTexto
          rotulo="Valor como publicado"
          obrigatorio
          valor={v.valorPublicado}
          aoMudar={def('valorPublicado')}
          ajuda={
            leitura(v.valorPublicado, separador) ?? `Separador decimal: ${separadores[separador]}.`
          }
        />
        <Campo rotulo="Unidade publicada" obrigatorio>
          {(p) => (
            <Selecao {...p} value={v.unidade} onChange={(e) => def('unidade')(e.target.value)}>
              <option value="">Selecione</option>
              {unidades.map((u) => (
                <option key={u} value={u}>
                  {DEFINICOES_UNIDADE[u].simbolo}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Base publicada" obrigatorio>
          {(p) => (
            <Selecao {...p} value={v.base} onChange={(e) => def('base')(e.target.value)}>
              <option value="">Selecione</option>
              {opcoesDe(
                basesPorExtenso,
                BASES_NUTRICIONAIS.filter((b) => bases.includes(b)),
              )}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Tipo de valor" obrigatorio>
          {(p) => (
            <Selecao {...p} value={v.tipoValor} onChange={(e) => def('tipoValor')(e.target.value)}>
              <option value="">Selecione</option>
              {opcoesDe(tiposValor, tipos)}
            </Selecao>
          )}
        </Campo>
        <CampoTexto
          rotulo="Desvio-padrão publicado"
          valor={v.desvioPadraoPublicado}
          aoMudar={def('desvioPadraoPublicado')}
        />
        <CampoTexto
          rotulo="Número de observações"
          valor={v.nObservacoes}
          aoMudar={def('nObservacoes')}
        />
        <CampoTexto
          rotulo="Mínimo publicado"
          valor={v.minimoPublicado}
          aoMudar={def('minimoPublicado')}
        />
        <CampoTexto
          rotulo="Máximo publicado"
          valor={v.maximoPublicado}
          aoMudar={def('maximoPublicado')}
        />
        <CampoTexto
          rotulo="Página ou tabela do valor"
          valor={v.referenciaLocal}
          aoMudar={def('referenciaLocal')}
          ajuda="Se diferente da do registro."
        />
      </div>
      <CampoTexto
        rotulo="Método analítico informado pela fonte"
        valor={v.metodoAnaliticoFonte}
        aoMudar={def('metodoAnaliticoFonte')}
        ajuda="Como a fonte descreve. Se o método for outra variante, use a definição própria dela."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo
          rotulo="Forma de obtenção"
          obrigatorio
          ajuda='Como a fonte diz que o número foi obtido. Sem informação, deixe "não informada".'
        >
          {(p) => (
            <Selecao
              {...p}
              value={v.formaObtencao}
              onChange={(e) => def('formaObtencao')(e.target.value)}
            >
              {opcoesDe(formasObtencao, FORMAS_OBTENCAO)}
            </Selecao>
          )}
        </Campo>
        <div className="sm:col-span-2">
          <CampoTexto
            rotulo="Descrição da obtenção"
            obrigatorio={exigeDescricaoObtencao(v.formaObtencao)}
            valor={v.descricaoObtencao}
            aoMudar={def('descricaoObtencao')}
            ajuda="Equação, cálculo ou calibração como a fonte informa, com a referência."
          />
        </div>
      </div>
      <CampoTexto
        rotulo="Base não declarada pela fonte: interpretação e motivo"
        multilinha
        valor={v.interpretacaoBase}
        aoMudar={def('interpretacaoBase')}
        ajuda="Só quando a fonte não diz a base (ex.: “%” sem “da MS”). Deixe vazio se a base é a declarada pela fonte."
      />
      <CampoTexto rotulo="Observação" multilinha valor={v.observacao} aoMudar={def('observacao')} />
    </Modal>
  );
}

/** Inclusão ou edição de um valor não quantificado: texto e significado segundo a fonte. */
export function ModalNaoQuantificado({
  registroId,
  origem,
  separador,
  valor,
  aoFechar,
}: {
  registroId: string;
  origem: OrigemFonte;
  separador: SeparadorDecimal;
  valor: ValorNaoQuantificadoApi | null;
  aoFechar: () => void;
}) {
  const nutrientes = useNutrientes();
  const tipos = tiposValorPermitidos(origem);
  const [v, setV] = useState({
    nutrienteId: valor?.nutriente.id ?? '',
    textoPublicado: valor?.textoPublicado ?? '',
    natureza: (valor?.natureza ?? '') as NaturezaNaoQuantificado | '',
    significadoFonte: valor?.significadoFonte ?? '',
    unidade: (valor?.unidade ?? '') as UnidadeNutricional | '',
    base: (valor?.base ?? '') as BaseNutricional | '',
    tipoValor: (valor?.tipoValor ?? (tipos.length === 1 ? tipos[0] : '')) as TipoValor | '',
    metodoAnaliticoFonte: valor?.metodoAnaliticoFonte ?? '',
    referenciaLocal: valor?.referenciaLocal ?? '',
    observacao: valor?.observacao ?? '',
  });
  const [erros, setErros] = useState<string[]>([]);
  const salvar = useAcaoAlimentos('composicao:salvarNaoQuantificado');
  const def = (k: keyof typeof v) => (x: string) => setV((a) => ({ ...a, [k]: x }));
  const nutriente: Nutriente | undefined = (nutrientes.data ?? []).find(
    (n) => n.id === v.nutrienteId,
  );
  const unidades = nutriente
    ? UNIDADES_NUTRICIONAIS.filter((u) => mesmaGrandeza(u, nutriente.unidadeReferencia))
    : UNIDADES_NUTRICIONAIS;
  // Conferência na hora, só do texto e da natureza (o resto o formulário já restringe).
  const problemaDoTexto =
    v.textoPublicado.trim() && v.natureza && nutriente && v.unidade && v.tipoValor
      ? (problemasDoNaoQuantificado(
          {
            textoPublicado: v.textoPublicado,
            natureza: v.natureza,
            significadoFonte: v.significadoFonte || '-',
            unidade: v.unidade,
            tipoValor: v.tipoValor,
          },
          {
            origem,
            unidadeReferencia: nutriente.unidadeReferencia,
            codigoNutriente: nutriente.codigo,
            separador,
          },
        )[0] ?? 'Será gravado como texto, sem número.')
      : 'Exatamente como na fonte, com o símbolo (ex.: <0,01, ND, traços).';
  return (
    <Modal
      aberto
      largura="lg"
      titulo={valor ? 'Editar valor não quantificado' : 'Valor não quantificado'}
      descricao={avisosAlimentos.naoQuantificado}
      aoFechar={aoFechar}
      erros={erros}
      enviando={salvar.isPending}
      aoEnviar={() => {
        if (!v.nutrienteId || !v.natureza || !v.unidade || !v.base || !v.tipoValor) {
          setErros(['Escolha o nutriente, o significado, a unidade, a base e o tipo de valor.']);
          return;
        }
        const dados: DadosValorNaoQuantificado = {
          nutrienteId: v.nutrienteId,
          textoPublicado: v.textoPublicado,
          natureza: v.natureza,
          significadoFonte: v.significadoFonte,
          unidade: v.unidade,
          base: v.base,
          tipoValor: v.tipoValor,
          metodoAnaliticoFonte: nulo(v.metodoAnaliticoFonte),
          referenciaLocal: nulo(v.referenciaLocal),
          observacao: nulo(v.observacao),
        };
        salvar.mutate(
          { registroId, valorId: valor?.id ?? null, dados },
          { onSuccess: aoFechar, onError: (e) => setErros(errosDe(e)) },
        );
      }}
    >
      <Campo rotulo="Nutriente (definição)" obrigatorio>
        {(p) => (
          <Selecao
            {...p}
            value={v.nutrienteId}
            onChange={(e) => def('nutrienteId')(e.target.value)}
          >
            <option value="">Selecione</option>
            {(nutrientes.data ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.codigo} · {n.nome}
              </option>
            ))}
          </Selecao>
        )}
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto
          rotulo="Texto como publicado"
          obrigatorio
          valor={v.textoPublicado}
          aoMudar={def('textoPublicado')}
          ajuda={problemaDoTexto}
        />
        <Campo
          rotulo="Natureza (pela legenda da fonte)"
          obrigatorio
          ajuda={avisosAlimentos.naturezaPelaFonte}
        >
          {(p) => (
            <Selecao {...p} value={v.natureza} onChange={(e) => def('natureza')(e.target.value)}>
              <option value="">Selecione</option>
              {opcoesDe(naturezasNaoQuantificado, NATUREZAS_NAO_QUANTIFICADO)}
            </Selecao>
          )}
        </Campo>
      </div>
      <CampoTexto
        rotulo="Significado segundo a fonte"
        obrigatorio
        multilinha
        valor={v.significadoFonte}
        aoMudar={def('significadoFonte')}
        ajuda="Copie a legenda, nota ou texto da fonte e diga onde está. Se a fonte não define o símbolo, diga onde ele aparece."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo rotulo="Unidade da coluna" obrigatorio>
          {(p) => (
            <Selecao {...p} value={v.unidade} onChange={(e) => def('unidade')(e.target.value)}>
              <option value="">Selecione</option>
              {unidades.map((u) => (
                <option key={u} value={u}>
                  {DEFINICOES_UNIDADE[u].simbolo}
                </option>
              ))}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Base publicada" obrigatorio>
          {(p) => (
            <Selecao {...p} value={v.base} onChange={(e) => def('base')(e.target.value)}>
              <option value="">Selecione</option>
              {opcoesDe(basesPorExtenso, BASES_NUTRICIONAIS)}
            </Selecao>
          )}
        </Campo>
        <Campo rotulo="Tipo de valor" obrigatorio>
          {(p) => (
            <Selecao {...p} value={v.tipoValor} onChange={(e) => def('tipoValor')(e.target.value)}>
              <option value="">Selecione</option>
              {opcoesDe(tiposValor, tipos)}
            </Selecao>
          )}
        </Campo>
      </div>
      <CampoTexto
        rotulo="Página ou tabela do valor"
        valor={v.referenciaLocal}
        aoMudar={def('referenciaLocal')}
        ajuda="Se diferente da do registro."
      />
      <CampoTexto
        rotulo="Método analítico informado pela fonte"
        valor={v.metodoAnaliticoFonte}
        aoMudar={def('metodoAnaliticoFonte')}
      />
      <CampoTexto rotulo="Observação" multilinha valor={v.observacao} aoMudar={def('observacao')} />
    </Modal>
  );
}
