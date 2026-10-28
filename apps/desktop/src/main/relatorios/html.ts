import { formatarCentavos, type Apuracao } from '@pecuaria/domain';
import { AVISO_FIXO, type Celula, type Coluna, type Relatorio } from './modelo';

/**
 * HTML do relatório (D-J), base do PDF. Todo texto é escapado; a página não tem script, imagem,
 * fonte externa nem rede (CSP `default-src 'none'`); estilos embutidos. Valor ausente aparece como
 * "Custo desconhecido" ou "Sem dado", nunca como R$ 0,00.
 */
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function apuracaoTexto(a: Apuracao): string {
  if (a.estado === 'desconhecida') return 'Custo desconhecido';
  if (a.estado === 'nao_apurada') return 'Não apurado';
  return `${a.estado === 'parcial' ? 'no mínimo ' : ''}${formatarCentavos(a.valorConhecidoCentavos)}`;
}

export function valorTexto(c: Pick<Coluna, 'tipo'>, v: Celula): string {
  if (c.tipo === 'apuracao')
    return v && typeof v === 'object' ? apuracaoTexto(v.apuracao) : 'Custo desconhecido';
  if (v === null) return c.tipo === 'dinheiro' ? 'Sem dado' : '—';
  if (typeof v === 'object') return apuracaoTexto(v.apuracao);
  if (c.tipo === 'dinheiro' && typeof v === 'number') return formatarCentavos(v);
  if (c.tipo === 'quantidade' && typeof v === 'number')
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  if (c.tipo === 'data' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [a, m, d] = v.split('-');
    return `${d}/${m}/${a}`;
  }
  return String(v);
}

const numerico = (t: Coluna['tipo']) => t !== 'texto' && t !== 'data';

const ESTILO = `
  @page { size: A4; margin: 14mm 12mm 18mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; color: #1f2a1f; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  h2 { font-size: 12pt; margin: 18px 0 6px; border-bottom: 1px solid #c9d3c9; padding-bottom: 3px; }
  .visao { display: inline-block; background: #e6efe6; color: #1f5d2d; border-radius: 10px; padding: 1px 8px; font-size: 9pt; }
  .meta { color: #4b574b; font-size: 9pt; margin: 2px 0; }
  .aviso { background: #fff4d6; border: 1px solid #f0d58a; padding: 6px 8px; margin: 8px 0; font-size: 9pt; }
  .descricao { color: #4b574b; font-size: 9pt; margin: 0 0 6px; }
  dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 16px; margin: 6px 0; }
  dt { color: #4b574b; font-size: 8.5pt; } dd { margin: 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead { display: table-header-group; }
  th { text-align: left; background: #eef3ee; border-bottom: 1px solid #c9d3c9; padding: 4px 6px; }
  td { border-bottom: 1px solid #e3e8e3; padding: 3px 6px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; }
  .vazio { color: #4b574b; font-style: italic; }
  footer { margin-top: 18px; color: #4b574b; font-size: 8pt; border-top: 1px solid #c9d3c9; padding-top: 4px; }
`;

export function gerarHtml(r: Relatorio): string {
  const partes: string[] = [];
  partes.push(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
    `<title>${escapar(`${r.titulo} (${r.visao})`)}</title><style>${ESTILO}</style></head><body>`,
    `<h1>${escapar(r.titulo)} <span class="visao">${escapar(r.visao)}</span></h1>`,
    `<p class="meta">${escapar(r.propriedade)} · ${escapar(r.periodo)}</p>`,
    `<p class="meta">Gerado em ${escapar(r.geradoEm)}</p>`,
  );
  for (const a of r.avisos) partes.push(`<div class="aviso">${escapar(a)}</div>`);
  for (const s of r.secoes) {
    partes.push(`<h2>${escapar(s.titulo)}</h2>`);
    if (s.descricao) partes.push(`<p class="descricao">${escapar(s.descricao)}</p>`);
    if (s.indicadores?.length) {
      partes.push('<dl>');
      for (const i of s.indicadores)
        partes.push(
          `<div><dt>${escapar(i.rotulo)}</dt><dd>${escapar(valorTexto(i, i.valor))}</dd>${
            i.observacao ? `<dt>${escapar(i.observacao)}</dt>` : ''
          }</div>`,
        );
      partes.push('</dl>');
    }
    if (s.colunas && s.linhas) {
      if (s.linhas.length === 0) {
        partes.push(`<p class="vazio">${escapar(s.vazio ?? 'Nenhum registro.')}</p>`);
        continue;
      }
      partes.push('<table><thead><tr>');
      for (const c of s.colunas)
        partes.push(`<th${numerico(c.tipo) ? ' class="num"' : ''}>${escapar(c.rotulo)}</th>`);
      partes.push('</tr></thead><tbody>');
      for (const l of s.linhas) {
        partes.push('<tr>');
        s.colunas.forEach((c, k) =>
          partes.push(
            `<td${numerico(c.tipo) ? ' class="num"' : ''}>${escapar(valorTexto(c, l[k] ?? null))}</td>`,
          ),
        );
        partes.push('</tr>');
      }
      partes.push('</tbody></table>');
    }
  }
  partes.push(`<footer>${escapar(AVISO_FIXO)} Visão: ${escapar(r.visao)}.</footer></body></html>`);
  return partes.join('');
}
