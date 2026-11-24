// The Book as a PDF (system_3 #11512, #11497 item 13; operator c70883 on
// #10985; design ack on #11512). Everything that turns the Book tab's state
// into a file is here and pure: the pdfmake document, the file's name and the
// caption that says what the file will hold. The tab passes in what it
// already shows and draws the result, so the file is made in the browser: no
// request is sent and nothing is written.
//
// The file holds the entries, not the CSV's grid of sums: each month the Book
// shows, newest first, with its In, Out and Result, then its entries. That is
// why it has its own name, "Book entries", beside "Bookkeeping report".
//
// The file's words are the tab's own (English). They are all in this module,
// and the day, the amounts and the month names come from the tab's
// formatters, so the two cannot drift apart and a change of language stays
// in one place.

const RIGHT = 'right';

export const BOOK_PDF_BUTTON = 'Book entries (PDF)';
export const BOOK_PDF_NOT_LOADED = 'Available once the Book has loaded.';
// A Book row in another currency: listed, with its own amount, and not in
// any total (system_3 #12258).
export const NOT_COUNTED_ROW = 'Not counted: not in euros';

// ── File name ────────────────────────────────────────────────────────────

const TRANSLITERATIONS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

// A mirror of aspirant-server's fileNameSlug (invoicing_book_report.go):
// lowercase, German umlauts and ß spelled out, every run of anything that is
// not an ASCII letter or digit turned into one '-', trimmed at both ends.
export function fileNameSlug(name) {
  const lower = String(name || '')
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => TRANSLITERATIONS[c]);
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// A mirror of the server's bookSelectionFileName: the preset's name as a
// slug ("work-only"), "preset-<id>" when the name leaves nothing, "-changed"
// when the ticks differ from it, and "custom" when no preset is named.
export function selectionFileName(selection, presets) {
  const preset = (presets || []).find((p) => p.id === selection.preset);
  if (!preset) return 'custom';
  const name = fileNameSlug(preset.name) || `preset-${preset.id}`;
  return selection.changed ? `${name}-changed` : name;
}

// "2026-11-18-0907" and "2026-11-18", in Berlin time, as the server stamps
// its export names (exportFilename): two downloads on one day can be told
// apart (system_3 #9990).
function berlinParts(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { day: `${get('year')}-${get('month')}-${get('day')}`, minute: `${get('hour')}${get('minute')}` };
}

// book-entries-<selection>[-month-2026-07]-<YYYY-MM-DD-HHMM>.pdf, built as
// the CSV's name is (book-report-…).
export function bookPdfFileName({ selection, presets, monthKey = '', now }) {
  const stamp = berlinParts(now);
  const month = monthKey ? `-month-${monthKey}` : '';
  return `book-entries-${selectionFileName(selection, presets)}${month}-${stamp.day}-${stamp.minute}.pdf`;
}

// ── Caption ──────────────────────────────────────────────────────────────

// What the file will hold, said under the button before the press, with the
// count (§3.132 Decision 7). `loaded` is false before the Book has been
// read, or when it could not be: then the button is disabled and this is the
// reason (§3.114).
export function bookPdfCaption({ loaded, entries, selectionName, monthKey = '', monthLabel = '' }) {
  if (!loaded) return BOOK_PDF_NOT_LOADED;
  if (monthKey) {
    if (!entries) return `Nothing counted with ${selectionName} was paid in ${monthLabel}. The file says so.`;
    const lead = entries === 1 ? '1 entry' : `${entries} entries`;
    const verb = entries === 1 ? 'was' : 'were';
    return `${lead} counted with ${selectionName} that ${verb} paid in ${monthLabel}, with the month's totals`;
  }
  if (!entries) return `Nothing is counted with ${selectionName}. The file says so.`;
  const lead = entries === 1 ? '1 entry' : `${entries} entries`;
  return `${lead} counted with ${selectionName}, month by month, with each month's totals`;
}

// ── Document ─────────────────────────────────────────────────────────────

// A cell reads as the tab's does: "who · what", and "—" when both are empty.
const whoAndWhat = (row) => {
  if (row.who && row.what) return `${row.who} · ${row.what}`;
  return row.who || row.what || '—';
};

// Every Out figure carries its minus sign, in the rows and in every total:
// on paper red may print as grey, and colour is never the only signal
// (§3.140 Decision 2).
const totalsText = (t, fmt) => `In ${fmt.money(t.inCents)}    Out ${fmt.signedMoney(-t.outCents)}    Result ${fmt.signedMoney(t.resultCents)}`;

// The tab's columns, in the tab's order. Fixed widths, so the columns line up
// from month to month down the page; "Who and what for" takes what is left
// and wraps.
function columns(withInvoice) {
  return [
    { key: 'paid_on', label: 'Date paid', width: 56 },
    { key: 'description', label: 'Who and what for', width: '*' },
    { key: 'category', label: 'Category', width: 84 },
    ...(withInvoice ? [{ key: 'invoice', label: 'Invoice', width: 56 }] : []),
    { key: 'in', label: 'In', width: 62, alignment: RIGHT },
    { key: 'out', label: 'Out', width: 62, alignment: RIGHT },
  ];
}

function cell(col, row, fmt) {
  switch (col.key) {
    case 'paid_on':
      return { text: fmt.day(row.paid_on), noWrap: true };
    case 'description':
      // A row in another currency is listed, not counted, and says so as
      // the Book does (system_3 #12258).
      if (row.counted === false) return { text: [whoAndWhat(row), { text: `\n${NOT_COUNTED_ROW}`, style: 'muted' }] };
      return { text: whoAndWhat(row) };
    case 'category':
      return { text: row.categoryLabel || '' };
    case 'invoice':
      return { text: (row.issuedInvoice && row.issuedInvoice.number) || '' };
    case 'in':
      return { text: row.type === 'in' ? fmt.money(row.amount_cents, row.currency) : '', alignment: RIGHT, noWrap: true };
    default:
      return { text: row.type === 'out' ? fmt.signedMoney(-row.amount_cents, row.currency) : '', alignment: RIGHT, noWrap: true };
  }
}

// One month: a table whose first header row is the month's name and totals,
// and whose second is the column heads. Both repeat on every page the month
// runs over, and at least one entry stays with them, so a month's heading is
// never the last line of a page.
function monthTable(month, cols, fmt) {
  // One cell across the table, so the heading's width never sizes a column.
  const heading = [
    {
      colSpan: cols.length,
      columns: [
        { text: month.label, style: 'month', width: 'auto', noWrap: true },
        { text: totalsText(month, fmt), style: 'monthTotals', alignment: RIGHT, margin: [0, 1.5, 0, 0] },
      ],
    },
    ...Array.from({ length: cols.length - 1 }, () => ({})),
  ];
  const head = cols.map((c) => ({ text: c.label, style: 'th', alignment: c.alignment }));
  const body = month.rows.map((row) => cols.map((c) => cell(c, row, fmt)));
  return {
    table: { headerRows: 2, keepWithHeaderRows: 1, dontBreakRows: true, widths: cols.map((c) => c.width), body: [heading, head, ...body] },
    layout: 'lightHorizontalLines',
    margin: [0, 14, 0, 0],
  };
}

// A month with no entries keeps its heading and says so, as on the tab.
function emptyMonth(month) {
  return {
    unbreakable: true,
    stack: [
      { text: month.label, style: 'month' },
      { text: 'No entries', style: 'muted', margin: [0, 2, 0, 0] },
    ],
    margin: [0, 14, 0, 0],
  };
}

// months: the month groups to print, newest first, each
//   { key, label, rows, empty, inCents, outCents, resultCents }.
// selectionName: what the Book counts, as the tab names it ("Work only").
// scope: "all months", or "paid in July 2026".
// madeOn: the day the file is made, "2026-11-18" (Berlin).
// countingSentence: the tab's own, word for word.
// uncategorisedSentence: the tab's continuation, or '' when there is none.
// withInvoice: the tab has the Invoice column (system_3 #11509).
// fmt: { day, money, signedMoney }, the tab's formatters.
export function bookPdfDoc({ months, selectionName, scope, madeOn, countingSentence, notCountedSentence = '', uncategorisedSentence = '', withInvoice = false, fmt }) {
  const cols = columns(withInvoice);
  const title = `Book entries · ${selectionName} · ${scope} · made ${madeOn}`;
  const total = months.reduce((t, m) => ({ inCents: t.inCents + (m.inCents || 0), outCents: t.outCents + (m.outCents || 0) }), { inCents: 0, outCents: 0 });
  total.resultCents = total.inCents - total.outCents;

  const content = [
    { text: title, style: 'title' },
    // What is left out comes directly after what counts: rows in another
    // currency (design ack c76261 on system_3 #12258), then Uncategorised.
    { text: [countingSentence, notCountedSentence, uncategorisedSentence].filter(Boolean).join(' '), style: 'counting', margin: [0, 4, 0, 0] },
  ];
  if (!months.length) content.push({ text: 'No entries', style: 'muted', margin: [0, 14, 0, 0] });
  for (const month of months) content.push(month.empty || !month.rows.length ? emptyMonth(month) : monthTable(month, cols, fmt));
  // A total is labelled with what it totals, and is left out when the file
  // holds one month: one month's total twice is one figure with two names.
  if (months.length > 1) {
    content.push({
      unbreakable: true,
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.75 }] },
        {
          columns: [
            { text: 'All months in this file', style: 'month', width: 'auto' },
            { text: totalsText(total, fmt), style: 'monthTotals', alignment: RIGHT },
          ],
          margin: [0, 6, 0, 0],
        },
        // Again under the total, for a reader who turns straight to it.
        ...(notCountedSentence ? [{ text: notCountedSentence, style: 'counting', margin: [0, 4, 0, 0] }] : []),
      ],
      margin: [0, 18, 0, 0],
    });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [40, 44, 40, 48],
    info: { title },
    defaultStyle: { fontSize: 9, lineHeight: 1.15 },
    styles: {
      title: { fontSize: 13, bold: true },
      counting: { fontSize: 9, color: '#444444' },
      month: { fontSize: 10.5, bold: true },
      monthTotals: { fontSize: 9 },
      th: { bold: true, color: '#444444', fontSize: 8.5 },
      muted: { color: '#666666' },
    },
    footer: (currentPage, pageCount) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#666666',
      margin: [0, 18, 0, 0],
    }),
    content,
  };
}
