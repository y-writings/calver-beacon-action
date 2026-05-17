const CALVER_DATE_PATTERN = /^\d{4}\.\d{2}\.\d{2}$/;

function parseCalverDateParts(calverDate: string): { year: number; month: number; day: number } {
  const [yearText, monthText, dayText] = calverDate.split('.');

  return {
    year: Number.parseInt(yearText, 10),
    month: Number.parseInt(monthText, 10),
    day: Number.parseInt(dayText, 10),
  };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));

  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

export function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');

  return `${year}.${month}.${day}`;
}

export function resolveCalverDate(calverDate: string | undefined, now: Date = new Date()): string {
  if (calverDate !== undefined && calverDate !== '') {
    return calverDate;
  }

  return formatUtcDate(now);
}

export function validateCalverDate(calverDate: string): void {
  if (!CALVER_DATE_PATTERN.test(calverDate)) {
    throw new Error('calver_date must use YYYY.MM.DD format');
  }

  const { year, month, day } = parseCalverDateParts(calverDate);

  if (!isValidCalendarDate(year, month, day)) {
    throw new Error('calver_date must be a real calendar date in YYYY.MM.DD format');
  }
}

export function buildCalverTag(calverDate: string): string {
  validateCalverDate(calverDate);
  return `v${calverDate}`;
}

export function isCanonicalCalverTag(tag: string): boolean {
  return /^v\d{4}\.\d{2}\.\d{2}$/.test(tag);
}
