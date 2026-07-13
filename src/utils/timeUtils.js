const TIME_24H_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_12H_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i;

export function to12Hour(time24) {
  const match = TIME_24H_PATTERN.exec(time24);
  if (!match) {
    throw new Error(`Invalid 24-hour time: "${time24}"`);
  }
  const [, hourStr, minuteStr] = match;
  const hour = Number(hourStr);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${period}`;
}

export function to24Hour(time12) {
  const match = TIME_12H_PATTERN.exec(time12.trim());
  if (!match) {
    throw new Error(`Invalid 12-hour time: "${time12}"`);
  }
  const [, hourStr, minuteStr, period] = match;
  let hour = Number(hourStr) % 12;
  if (period.toUpperCase() === 'PM') {
    hour += 12;
  }
  return `${String(hour).padStart(2, '0')}:${minuteStr}`;
}
