import { addMonthsToDay } from './business-time';

describe('addMonthsToDay', () => {
  it('avança o mesmo dia do mês', () => {
    expect(addMonthsToDay('2026-01-15', 1)).toBe('2026-02-15');
  });

  it('clampa pro último dia quando o mês de destino é mais curto', () => {
    expect(addMonthsToDay('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('respeita ano bissexto ao clampar fevereiro', () => {
    expect(addMonthsToDay('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('atravessa o ano corretamente', () => {
    expect(addMonthsToDay('2026-12-15', 1)).toBe('2027-01-15');
  });
});
