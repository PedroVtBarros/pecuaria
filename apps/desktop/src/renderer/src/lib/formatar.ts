const formatoDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function formatarDataHora(iso: string): string {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : formatoDataHora.format(data);
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unidades[i]}`;
}

/**
 * Encurta um caminho de arquivo mantendo o começo (unidade) e o fim (pasta e
 * arquivo), que são as partes que identificam o local. Ex.: C:\Users\…\dados\pecuaria.db
 */
export function encurtarCaminho(caminho: string, maximo = 48): string {
  if (caminho.length <= maximo) return caminho;
  const separador = caminho.includes('\\') ? '\\' : '/';
  const partes = caminho.split(separador);
  const inicio = partes.slice(0, 2).join(separador);
  let fim = partes[partes.length - 1] ?? '';
  for (let i = partes.length - 2; i >= 2; i--) {
    const candidato = `${partes[i]}${separador}${fim}`;
    if (inicio.length + candidato.length + 2 > maximo) break;
    fim = candidato;
  }
  return `${inicio}${separador}…${separador}${fim}`;
}
