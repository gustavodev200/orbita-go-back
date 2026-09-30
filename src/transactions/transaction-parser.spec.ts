import { parseTransactionText } from './transaction-parser';

const TODAY = '2026-09-29';

describe('parseTransactionText', () => {
  it('interpreta o exemplo do design (gasto no iFood ontem)', () => {
    expect(parseTransactionText('gastei 45 no ifood ontem', TODAY)).toEqual({
      type: 'expense',
      amountCents: 4500,
      description: 'iFood',
      categoryKey: 'ali',
      date: '2026-09-28',
    });
  });

  it('reconhece entrada de salário com milhar e centavos', () => {
    expect(
      parseTransactionText('recebi R$ 6.200,50 de salário', TODAY),
    ).toMatchObject({
      type: 'income',
      amountCents: 620050,
      categoryKey: 'sal',
      date: TODAY,
    });
  });

  it('aceita vírgula decimal e mantém descrição livre', () => {
    expect(
      parseTransactionText('paguei 22,40 de uber pro trabalho', TODAY),
    ).toMatchObject({
      amountCents: 2240,
      categoryKey: 'tra',
      description: 'Uber pro trabalho',
    });
  });

  it('palavras acentuadas casam (café, farmácia)', () => {
    expect(parseTransactionText('café 8', TODAY).categoryKey).toBe('ali');
    expect(parseTransactionText('farmácia 37,5', TODAY)).toMatchObject({
      categoryKey: 'sau',
      amountCents: 3750,
    });
  });

  it('sem categoria reconhecida cai em Outros; sem valor vira 0', () => {
    expect(parseTransactionText('coisa aleatória', TODAY)).toMatchObject({
      type: 'expense',
      categoryKey: 'out',
      amountCents: 0,
    });
  });

  it('"dia N" no futuro do mês corrente aponta para o mês anterior', () => {
    expect(parseTransactionText('mercado 100 dia 30', TODAY).date).toBe(
      '2026-08-30',
    );
    expect(parseTransactionText('mercado 100 dia 3', TODAY).date).toBe(
      '2026-09-03',
    );
  });
});
