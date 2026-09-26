import { parseDurationSeconds } from './duration';

describe('parseDurationSeconds', () => {
  it.each([
    ['900s', 900],
    ['15m', 900],
    ['12h', 43_200],
    ['7d', 604_800],
  ])('%s → %i seconds', (input, expected) => {
    expect(parseDurationSeconds(input)).toBe(expected);
  });

  it.each(['', '15', 'm', '1w', '-5m', '1.5h', '0m'])('rejects %p', (input) => {
    expect(() => parseDurationSeconds(input)).toThrow();
  });
});
