import { isConfiguredChannel, langFromCode, parseAdminIds, parsePocketId } from './access';

describe('access helpers', () => {
  it('accepts Pocket Option ids and rejects anything else', () => {
    expect(parsePocketId('12345678')).toBe('12345678');
    expect(parsePocketId(' 1234 5678 ')).toBe('12345678');
    expect(parsePocketId('ID: 87654321')).toBe('87654321');
    expect(parsePocketId('hello')).toBeNull();
    expect(parsePocketId('123')).toBeNull();
    expect(parsePocketId('12345678 please')).toBeNull();
  });

  it('parses the admin id list', () => {
    expect(parseAdminIds('111, 222;333 abc')).toEqual(['111', '222', '333']);
    expect(parseAdminIds('')).toEqual([]);
  });

  it('matches the configured channel by id or @username', () => {
    expect(isConfiguredChannel('-1001234', { id: -1001234 })).toBe(true);
    expect(isConfiguredChannel('@MySignals', { id: -1001234, username: 'mysignals' })).toBe(true);
    expect(isConfiguredChannel('-1001234', { id: -1009999, username: 'other' })).toBe(false);
  });

  it('maps Telegram language codes', () => {
    expect(langFromCode('ru-RU')).toBe('ru');
    expect(langFromCode('es')).toBe('es');
    expect(langFromCode(undefined)).toBe('en');
  });
});
