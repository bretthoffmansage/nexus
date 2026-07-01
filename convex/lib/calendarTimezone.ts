const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidLocalDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidLocalTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Convert local calendar date/time in an IANA zone to UTC epoch ms (minute precision). */
export function localDateTimeToUtcMs(
  localDate: string,
  localTime: string,
  timeZone: string,
): number {
  if (!isValidLocalDate(localDate) || !isValidLocalTime(localTime) || !isValidIanaTimeZone(timeZone)) {
    throw new Error("invalid_local_datetime");
  }
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  let utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 4; i += 1) {
    const parts = formatter.formatToParts(new Date(utcGuess));
    const part = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");
    const observed = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    utcGuess += desired - observed;
  }
  return utcGuess;
}

export function formatLocalDateTime(
  scheduledForUtc: number,
  timeZone: string,
): { localScheduledDate: string; localScheduledTime: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(scheduledForUtc));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const localScheduledDate = `${part("year")}-${part("month")}-${part("day")}`;
  const localScheduledTime = `${part("hour")}:${part("minute")}`;
  return { localScheduledDate, localScheduledTime };
}
