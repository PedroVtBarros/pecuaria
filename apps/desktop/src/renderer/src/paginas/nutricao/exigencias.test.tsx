import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EntradaExigencias } from '@pecuaria/shared-types';
// Só no teste: o serviço do main é puro (motor, sem banco) e dá os números reais do livro, sem
// inventar dados (regra 1). Na aplicação, a tela chama o main pelo IPC.
import { ServicoExigencias } from '../../../../main/services/nutricao/servico-exigencias';
import { PaginaExigencias } from './pagina-exigencias';

/* Fase 6A-7: tela de exigências. Casos com as entradas do T-04 (p. 432–434). */
const servico = new ServicoExigencias();

function montar() {
  const invocar = vi.fn(async (canal: string, entrada: unknown) => ({
    ok: true,
    dados:
      canal === 'nutricao:calcularExigencias'
        ? servico.calcular(entrada as EntradaExigencias)
        : null,
  }));
  Object.defineProperty(window, 'api', { value: { invocar }, configurable: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <PaginaExigencias />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return invocar;
}
const preencher = (rotulo: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const escolher = (rotulo: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const calcular = () => fireEvent.click(screen.getByRole('button', { name: /Calcular exigências/ }));

afterEach(cleanup);

describe('Tela de exigências (6A-7)', () => {
  it('T-04: envia a entrada, mostra os valores com unidade e explica o cálculo', async () => {
    const invocar = montar();
    preencher(/^Peso corporal médio/, '520');
    preencher(/^Ganho médio diário/, '1,4');
    calcular();
    await screen.findByTestId('resultados-exigencias');
    expect(invocar).toHaveBeenCalledWith('nutricao:calcularExigencias', {
      grupo: 'zebuino',
      sexo: 'macho_nao_castrado',
      sistema: 'confinamento',
      pcKg: 520,
      gmdKgDia: 1.4,
      cms: { fonte: 'confinamento' },
    });
    expect(within(screen.getByTestId('linha-CMS')).getByText('10,62 kg/dia')).toBeTruthy();
    expect(within(screen.getByTestId('linha-NDT')).getByText('7,31 kg/dia')).toBeTruthy();
    expect(within(screen.getByTestId('linha-PB')).getByText('1.135 g/dia')).toBeTruthy();
    expect(within(screen.getByTestId('linha-Ca')).getByText('27,24')).toBeTruthy();
    expect(screen.getByTestId('cms-usado').textContent).toMatch(/Eq\. 2\.1 a 2\.3.*BRC23-C-01-03/);
    expect(screen.getByText(/Exigência não é dieta/)).toBeTruthy();

    fireEvent.click(
      within(screen.getByTestId('linha-CMS')).getByRole('button', { name: 'Como foi calculado?' }),
    );
    const detalhe = screen.getByTestId('detalhe-calculo');
    expect(detalhe.textContent).toMatch(/BRC23-C-01-03/);
    expect(detalhe.textContent).toMatch(/cap\. 2, p\. 25/);
    expect(detalhe.textContent).toMatch(/Peso corporal médio = 520 kg/);
    expect(detalhe.textContent).toMatch(/aprovada pelo usuário/);
  });

  it('selo "Com aviso" só para limitações e domínio provisório; notas ficam em Observações', async () => {
    montar();
    preencher(/^Peso corporal médio/, '520');
    preencher(/^Ganho médio diário/, '1,4');
    calcular();
    await screen.findByTestId('resultados-exigencias');
    // CMS e Ca: só notas informativas (CMS usado; exigência não é oferta): sem selo.
    expect(within(screen.getByTestId('linha-CMS')).queryByText('Com aviso')).toBeNull();
    expect(within(screen.getByTestId('linha-Ca')).queryByText('Com aviso')).toBeNull();
    // PCVZ: domínio provisório (P-13); PBmic e PDR: limitações científicas (p. 60 e 219).
    expect(within(screen.getByTestId('linha-PCVZ')).getByText('Com aviso')).toBeTruthy();
    expect(within(screen.getByTestId('linha-PDR')).getByText('Com aviso')).toBeTruthy();
    fireEvent.click(
      within(screen.getByTestId('linha-PB')).getByRole('button', { name: 'Como foi calculado?' }),
    );
    const detalhe = screen.getByTestId('detalhe-calculo');
    expect(detalhe.textContent).toMatch(/Observações:.*não é a proteína nem o NDT ofertados/);
    expect(detalhe.textContent).toContain('Resultado: 1.135 g/dia');
    expect(detalhe.textContent).toContain('Proteína metabolizável (PM) = 781,7 g/dia');
  });

  it('motivos com números em português e unidade; GMD é o desejado', async () => {
    montar();
    expect(screen.getByLabelText(/^Ganho médio diário desejado/)).toBeTruthy();
    escolher(/^Classe sexual/, 'femea');
    preencher(/^Peso corporal médio/, '500');
    preencher(/^Ganho médio diário/, '0,8');
    calcular();
    const linha = await screen.findByTestId('linha-PCVZ');
    expect(screen.getByText(/GMD desejado 0,80 kg\/dia/)).toBeTruthy();
    fireEvent.click(within(linha).getByRole('button', { name: 'Como foi calculado?' }));
    const texto = screen.getByTestId('detalhe-calculo').textContent!;
    expect(texto).toMatch(/PCJ = [\d.]+,\d kg fora do domínio validado \(\d+ a \d+ kg/);
    // Nenhum número com ponto decimal e muitas casas (formato bruto do JavaScript).
    expect(texto).not.toMatch(/\d\.\d{4,}/);
  });

  it('etapas intermediárias ficam escondidas até o usuário pedir', async () => {
    montar();
    preencher(/^Peso corporal médio/, '520');
    preencher(/^Ganho médio diário/, '1,4');
    calcular();
    const energia = await screen.findByTestId('secao-energia');
    expect(within(energia).queryByTestId('linha-km')).toBeNull();
    fireEvent.click(within(energia).getByRole('button', { name: /Mostrar etapas intermediárias/ }));
    expect(within(energia).getByTestId('linha-km')).toBeTruthy();
  });

  it('fora do domínio: o valor não aparece como exigência, só no detalhe, como análise', async () => {
    montar();
    // Fêmea zebuína confinada de 500 kg: PCJ acima dos dados de energia e proteína.
    escolher(/^Classe sexual/, 'femea');
    preencher(/^Peso corporal médio/, '500');
    preencher(/^Ganho médio diário/, '0,8');
    calcular();
    const linha = await screen.findByTestId('linha-EMtotal');
    expect(within(linha).getByText('Não usar para decisão')).toBeTruthy();
    expect(within(linha).getByText('Só para análise')).toBeTruthy();
    expect(screen.getByText('Resultado parcial')).toBeTruthy();
    fireEvent.click(within(linha).getByRole('button', { name: 'Como foi calculado?' }));
    expect(screen.getByTestId('detalhe-calculo').textContent).toMatch(
      /valor só para análise, fora do domínio validado; não é recomendação/,
    );
  });

  it('fora do escopo a pasto: aviso antes e resultados sem valor, com o motivo', async () => {
    montar();
    escolher(/^Sistema de produção/, 'pasto');
    escolher(/^Classe sexual/, 'femea');
    expect(screen.getByText('Categoria fora do escopo a pasto')).toBeTruthy();
    preencher(/^Peso corporal médio/, '300');
    preencher(/^Ganho médio diário/, '0,5');
    preencher(/^Consumo de suplemento/, '1');
    calcular();
    const linha = await screen.findByTestId('linha-EMtotal');
    expect(within(linha).getByText('Não calculado')).toBeTruthy();
    expect(within(linha).getByText('Fora do escopo')).toBeTruthy();
    expect(linha.textContent).toMatch(/Categoria fora do escopo/);
    expect(screen.getByText('Nada foi calculado para esta categoria')).toBeTruthy();
    expect(screen.getByTestId('resultados-exigencias').textContent).toMatch(/restrição do projeto/);
  });

  it('pasto troca as opções de CMS; CMS informado identificado', async () => {
    const invocar = montar();
    escolher(/^Sistema de produção/, 'pasto');
    const opcoes = [
      ...(screen.getByLabelText(/^Consumo de matéria seca/) as HTMLSelectElement).options,
    ];
    expect(opcoes.map((o) => o.value)).toEqual([
      'pasto',
      'terminacao_intensiva_pasto',
      'informado',
    ]);
    escolher(/^Sistema de produção/, 'confinamento');
    escolher(/^Consumo de matéria seca/, 'informado');
    preencher(/^CMS informado/, '10,62');
    preencher(/^Peso corporal médio/, '520');
    preencher(/^Ganho médio diário/, '1,4');
    calcular();
    await screen.findByTestId('resultados-exigencias');
    expect(invocar.mock.calls[0]![1]).toMatchObject({
      cms: { fonte: 'informado', cmsKgDia: 10.62 },
    });
    expect(screen.getByTestId('cms-usado').textContent).toMatch(/informado por você/);
  });

  it('valida antes de enviar e avisa quando os dados mudam depois do cálculo', async () => {
    const invocar = montar();
    calcular();
    expect(await screen.findByText(/Peso vivo é obrigatório/)).toBeTruthy();
    expect(invocar).not.toHaveBeenCalled();
    preencher(/^Peso corporal médio/, '520');
    preencher(/^Ganho médio diário/, '1,4');
    calcular();
    await screen.findByTestId('resultados-exigencias');
    preencher(/^Ganho médio diário/, '1,2');
    await waitFor(() => expect(screen.getByText('Dados alterados')).toBeTruthy());
  });
});
