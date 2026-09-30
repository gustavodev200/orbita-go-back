import { parseReminderText } from './reminder-parser';

const TODAY = '2026-09-29'; // terça

describe('parseReminderText', () => {
  it('interpreta o exemplo do design (aluguel todo dia 5 às 9h)', () => {
    expect(
      parseReminderText('me lembra de pagar o aluguel todo dia 5 às 9h', TODAY),
    ).toEqual({
      title: 'Pagar o aluguel',
      kind: 'finance',
      time: '09:00',
      repeat: 'monthly',
      dayOfMonth: 5,
    });
  });

  it('lembrete único amanhã com minutos', () => {
    expect(
      parseReminderText(
        'me lembra de ligar pro dentista amanhã às 14h30',
        TODAY,
      ),
    ).toEqual({
      title: 'Ligar pro dentista',
      kind: 'task',
      time: '14:30',
      repeat: 'none',
      date: '2026-09-30',
    });
  });

  it('todo dia sem data vira diário; sem horário usa 09:00', () => {
    expect(
      parseReminderText('me lembra de fechar o dia todo dia', TODAY),
    ).toMatchObject({ repeat: 'daily', time: '09:00', title: 'Fechar o dia' });
  });

  it('toda semana com dia da semana', () => {
    expect(
      parseReminderText('lembrar de regar as plantas toda sexta 8:15', TODAY),
    ).toMatchObject({ repeat: 'weekly', weekday: 5, time: '08:15' });
  });

  it('"dia N" sem repetição aponta para a próxima ocorrência', () => {
    expect(
      parseReminderText('me lembra de pagar a fatura dia 10', TODAY),
    ).toMatchObject({ repeat: 'none', date: '2026-10-10', kind: 'finance' });
  });

  it('sem gatilho "lembra de" usa o texto inteiro como título', () => {
    expect(parseReminderText('comprar pão', TODAY)).toMatchObject({
      title: 'Comprar pão',
      repeat: 'none',
      date: TODAY,
    });
  });
});
