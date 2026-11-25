import { test, expect } from '@playwright/test';
import { MAX_AXIS_MONTHS, berlinMonthKey, berlinToday, cutLine, monthAxis, monthLabel, shortMonthLabel } from '../../src/components/invoicing/monthAxis.js';
import { fillEmptyMonths, monthSpanLabel } from '../../src/components/invoicing/listGroups.js';
import { BEFORE_2000_LINE, floorLine, pastDateLine } from '../../src/components/invoicing/dateChecks.js';

/** system_3 #12312: a date that cannot be right, and what one such date may
 *  do to the charts and the Book. The module tests the spec names ("a unit
 *  test of the axis function"), run through Playwright as
 *  invoicing-payer-match.spec.ts runs payerMatch.js. No page is opened. */

test.describe('#12312 month axis, month labels and date checks', () => {
  // A fixed moment: 25 November 2026, 04:00 in Berlin.
  const now = new Date('2026-11-25T03:00:00Z');

  test('rows in 2005-03 and this month: the axis ends this month, is at most 240 months, and names the first month drawn', () => {
    const axis = monthAxis(['2005-03', '2026-11'], now);
    expect(axis.months[axis.months.length - 1]).toBe('2026-11');
    expect(axis.months.length).toBe(MAX_AXIS_MONTHS);
    expect(axis.months[0]).toBe('2006-12');
    expect(axis.cut).toBe(true);
    expect(axis.firstDrawn).toBe('2006-12');
    expect(cutLine(axis)).toBe('Entries before December 2006 are not drawn.');
    // Consecutive months, no gaps and no repeats.
    for (let i = 1; i < axis.months.length; i++) expect(axis.months[i] > axis.months[i - 1]).toBe(true);
  });

  test('a year typed as 26 keeps every real month on the axis, through this month', () => {
    const axis = monthAxis(['0026-11', '2026-07', '2026-09'], now);
    expect(axis.months.slice(-5)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(axis.cut).toBe(true);
    expect(axis.months.every((k) => /^\d{4}-\d{2}$/.test(k))).toBe(true);
  });

  test('within 240 months nothing is cut and there is no line', () => {
    const axis = monthAxis(['2026-07'], now);
    expect(axis.months).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(axis.cut).toBe(false);
    expect(cutLine(axis)).toBe('');
    expect(monthAxis([], now)).toEqual({ months: [], firstDrawn: null, cut: false });
  });

  // The review's point 2: the axis ends at the later of this month in
  // Berlin and the newest entry's month. 23:30 UTC on 30 November is
  // already 1 December in Berlin.
  test('this month is Berlin\'s, not UTC\'s', () => {
    const late = new Date('2026-11-30T23:30:00Z');
    expect(berlinToday(late)).toBe('2026-12-01');
    expect(berlinMonthKey(late)).toBe('2026-12');
    expect(monthAxis(['2026-11'], late).months).toEqual(['2026-11', '2026-12']);
    // A newer entry than this month ends the axis instead.
    expect(monthAxis(['2026-10', '2027-01'], now).months).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
  });

  // Ruling 5 and the review's point 4: both labels print the year as stored.
  test('a month label never reads a year under 1000 as 19xx', () => {
    expect(monthLabel('0026-11')).toBe('November 0026');
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(shortMonthLabel('0026-03')).toBe('Mar 0026');
    expect(shortMonthLabel('2026-03')).toBe('Mar 2026');
    expect(monthSpanLabel(['0026-03'])).toBe('March 0026');
    expect(monthSpanLabel(['2026-09', '2026-11'])).toBe('September–November 2026');
  });

  // Ruling 6: more than twelve empty months in a row are one group.
  test('more than twelve empty months are one gap; twelve stay months', () => {
    const g = (key: string) => ({ key, label: key, rows: [{}] });
    const twelve = fillEmptyMonths([g('2026-11'), g('2025-10')], '2026-11');
    expect(twelve.filter((m: any) => m.empty && !m.gap)).toHaveLength(12);
    expect(twelve.some((m: any) => m.gap)).toBe(false);

    const far = fillEmptyMonths([g('2026-11'), g('2005-03')], '2026-11');
    expect(far.map((m: any) => m.key)).toEqual(['2026-11', 'gap:2005-04', '2005-03']);
    expect(far[1]).toMatchObject({ label: 'April 2005 to October 2026', empty: true, rows: [], gap: { from: '2005-04', to: '2026-10', months: 259 } });

    // An empty current month at the newest end of the run joins the gap.
    const idle = fillEmptyMonths([g('2005-03')], '2026-11');
    expect(idle.map((m: any) => m.key)).toEqual(['gap:2005-04', '2005-03']);
    expect(idle[0].label).toBe('April 2005 to November 2026');
  });

  test('a date before 2000 or after today is refused with its line', () => {
    expect(floorLine('0026-11-03')).toBe(BEFORE_2000_LINE);
    expect(BEFORE_2000_LINE).toBe('Check the year. The date must be 2000 or later.');
    expect(floorLine('2000-01-01')).toBe('');
    expect(floorLine('')).toBe('');
    // A draft's service date may be after today; only the floor applies.
    expect(floorLine('2027-01-04')).toBe('');
    const next = 'Enter the day the money was received.';
    expect(pastDateLine('0026-11-03', next, '2026-11-25')).toBe(BEFORE_2000_LINE);
    expect(pastDateLine('2026-11-26', next, '2026-11-25')).toBe('This date is in the future. Enter the day the money was received.');
    expect(pastDateLine('2026-11-25', next, '2026-11-25')).toBe('');
    expect(pastDateLine('1999-12-31', next, '2026-11-25')).toBe(BEFORE_2000_LINE);
  });
});
