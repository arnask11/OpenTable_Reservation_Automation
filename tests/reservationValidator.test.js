import { describe, it, expect } from 'vitest';
import { validateAvailabilityInput, validateReservationInput } from '../src/validators/reservationValidator.js';

const baseAvailability = { rid: 12345, date: '2026-07-20', time: '19:00', partySize: 2 };

const baseReservation = {
  ...baseAvailability,
  firstName: 'Arnas',
  lastName: 'Kumar',
  phone: '1234567890',
  email: 'arnas@example.com',
};

describe('validateAvailabilityInput', () => {
  it('accepts valid input', () => {
    const result = validateAvailabilityInput(baseAvailability);
    expect(result.valid).toBe(true);
    expect(result.data.rid).toBe(12345);
  });

  it('accepts a string rid', () => {
    const result = validateAvailabilityInput({ ...baseAvailability, rid: 'oyster-bar' });
    expect(result.valid).toBe(true);
  });

  it('rejects bad date, time, and partySize', () => {
    const result = validateAvailabilityInput({
      ...baseAvailability,
      date: '07-20-2026',
      time: '7:00 PM',
      partySize: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(3);
  });

  it('rejects partySize above 10', () => {
    const result = validateAvailabilityInput({ ...baseAvailability, partySize: 11 });
    expect(result.valid).toBe(false);
  });

  it('accepts an optional sessionId', () => {
    const result = validateAvailabilityInput({
      ...baseAvailability,
      sessionId: 'abc-123',
    });
    expect(result.valid).toBe(true);
    expect(result.data.sessionId).toBe('abc-123');
  });
});

describe('validateReservationInput', () => {
  it('accepts valid input and applies defaults', () => {
    const result = validateReservationInput(baseReservation);
    expect(result.valid).toBe(true);
    expect(result.data.emailMarketingOptIn).toBe(false);
    expect(result.data.smsReminderOptIn).toBe(true);
    expect(result.data.dryRun).toBe(false);
  });

  it('rejects missing contact fields', () => {
    const result = validateReservationInput({ ...baseReservation, firstName: '', email: 'not-an-email' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((message) => message.includes('firstName'))).toBe(true);
    expect(result.errors.some((message) => message.includes('email'))).toBe(true);
  });

  it('rejects an invalid phone number', () => {
    const result = validateReservationInput({ ...baseReservation, phone: 'abc' });
    expect(result.valid).toBe(false);
  });

  it('respects explicit dryRun and opt-in overrides', () => {
    const result = validateReservationInput({
      ...baseReservation,
      dryRun: true,
      emailMarketingOptIn: true,
      smsReminderOptIn: false,
    });
    expect(result.valid).toBe(true);
    expect(result.data.dryRun).toBe(true);
    expect(result.data.emailMarketingOptIn).toBe(true);
    expect(result.data.smsReminderOptIn).toBe(false);
  });
});
