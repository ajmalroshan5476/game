/**
 * Time and Timezone utilities for Indian Standard Time (IST - Asia/Kolkata)
 */

/**
 * Returns the current date in YYYY-MM-DD format according to Asia/Kolkata (IST) timezone.
 */
export function getISTDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/**
 * Returns current timestamp in ISO format with +05:30 offset
 */
export function getISTTimestamp(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+05:30`;
}
