import { describe, it, expect } from 'vitest';
import { to12Hour, to24Hour } from '../src/utils/timeUtils.js';

describe('to12Hour', () => {
  it('converts 24-hour time to 12-hour display format', () => {
    expect(to12Hour('19:00')).toBe('7:00 PM');
    expect(to12Hour('09:30')).toBe('9:30 AM');
    expect(to12Hour('00:00')).toBe('12:00 AM');
    expect(to12Hour('12:00')).toBe('12:00 PM');
    expect(to12Hour('23:59')).toBe('11:59 PM');
  });

  it('throws on invalid input', () => {
    expect(() => to12Hour('25:00')).toThrow();
    expect(() => to12Hour('7:00 PM')).toThrow();
  });
});

describe('to24Hour', () => {
  it('converts 12-hour display format back to 24-hour time', () => {
    expect(to24Hour('7:00 PM')).toBe('19:00');
    expect(to24Hour('9:30 AM')).toBe('09:30');
    expect(to24Hour('12:00 AM')).toBe('00:00');
    expect(to24Hour('12:00 PM')).toBe('12:00');
    expect(to24Hour('11:59 pm')).toBe('23:59');
  });

  it('throws on invalid input', () => {
    expect(() => to24Hour('19:00')).toThrow();
    expect(() => to24Hour('13:00 PM')).toThrow();
  });
});

describe('round-trip', () => {
  it('converts back and forth without loss', () => {
    for (const time of ['00:00', '06:30', '09:30', '12:00', '13:15', '19:00', '23:45']) {
      expect(to24Hour(to12Hour(time))).toBe(time);
    }
  });
});
