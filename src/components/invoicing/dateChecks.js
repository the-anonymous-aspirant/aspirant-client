// What a typed date may be (system_3 #12312 ruling 1, with the review's
// point 1). A date field ignores its own min and max when the date is typed,
// so Save checks the value too.
//
// Dates are "YYYY-MM-DD" strings, as an <input type="date"> gives them; with
// a four-digit year they compare as text. A year typed as "26" is "0026".

import { berlinToday } from './monthAxis.js';

// The server's floor for a payment's date (aspirant-server
// earliestPaymentDate) and, since #12312, for a draft's service dates.
export const EARLIEST_DAY = '2000-01-01';

export const BEFORE_2000_LINE = 'Check the year. The date must be 2000 or later.';

export { berlinToday };

// The line for a date before 2000, or ''.
export function floorLine(value) {
  return value && value < EARLIEST_DAY ? BEFORE_2000_LINE : '';
}

// The line for a date that cannot be right on a day that has happened: before
// 2000, or after today in Berlin, followed by the dialog's own sentence
// ("Enter the day the money was received."). '' when it can be right.
export function pastDateLine(value, nextSentence, today = berlinToday()) {
  if (!value) return '';
  if (value < EARLIEST_DAY) return BEFORE_2000_LINE;
  if (value > today) return `This date is in the future. ${nextSentence}`;
  return '';
}
