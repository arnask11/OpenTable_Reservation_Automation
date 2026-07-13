import { z } from 'zod';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PHONE_PATTERN = /^\+?\d{7,15}$/;

const ridSchema = z.union([z.number(), z.string().min(1)]);

export const availabilitySchema = z.object({
  rid: ridSchema,
  date: z.string().regex(DATE_PATTERN, 'date must be in YYYY-MM-DD format'),
  time: z.string().regex(TIME_PATTERN, 'time must be in 24-hour HH:MM format'),
  partySize: z.number().int().min(1).max(10),
});

export const reservationSchema = availabilitySchema.extend({
  firstName: z.string().trim().min(1, 'firstName is required'),
  lastName: z.string().trim().min(1, 'lastName is required'),
  phone: z
    .string()
    .transform((value) => value.replace(/[\s()-]/g, ''))
    .pipe(z.string().regex(PHONE_PATTERN, 'phone must be a valid phone number')),
  email: z.string().email('email must be a valid email address'),
  specialRequest: z.string().optional(),
  seatingPreference: z.string().optional(),
  emailMarketingOptIn: z.boolean().default(false),
  smsReminderOptIn: z.boolean().default(true),
  dryRun: z.boolean().default(false),
});

function formatIssues(error) {
  return error.issues.map((issue) => issue.message);
}

export function validateAvailabilityInput(input) {
  const result = availabilitySchema.safeParse(input);
  if (!result.success) {
    return { valid: false, errors: formatIssues(result.error) };
  }
  return { valid: true, data: result.data };
}

export function validateReservationInput(input) {
  const result = reservationSchema.safeParse(input);
  if (!result.success) {
    return { valid: false, errors: formatIssues(result.error) };
  }
  return { valid: true, data: result.data };
}
