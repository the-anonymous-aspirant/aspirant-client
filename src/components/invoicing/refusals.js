// The client's sentence for each refusal of the invoicing server (system_3
// #12300). The server answers a code per cause, the request field it is
// about, and the figures the sentence prints (`limit`, `lines`, `item`,
// `width`, `height`, `line`, `value`). The client chooses the sentence by
// the code; the server's own message stays in the answer for the logs and
// is never printed. The words are #12300's table and design_agent's c77188.
//
// Pure JavaScript, with no Vue, so the contract spec can import it.

// A refusal the client has no sentence for (#12300 review point 3).
export const FALLBACK = 'This could not be saved.';

// The row changed in another tab or by another action (c77188 group 7).
export const STALE =
  'This was changed since the page loaded. Reload the page to see it as it is now.';

// A request that never got an answer. It stays as it was (#12300 ruling 6).
export const UNREACHABLE = 'The server could not be reached. Try again.';

// A logo's pixel limits, the server's invoicing_pdf.MaxLogoSide and
// MaxLogoMegapixels.
export const LOGO_MAX_SIDE = 8000;
export const LOGO_MAX_MEGAPIXELS = 25;

// The proxy cuts a request under /api/ at 25 MB (#12300 ruling 5).
export const PROXY_MAX_BYTES = 25 * 1024 * 1024;

// A figure as the dialogs write it: 1,000 and 10,000.
function figure(n) {
  return Number(n).toLocaleString('en-GB');
}

// A table's own entry for a key the server sent, or undefined. A plain
// `table[key]` would also find what Object.prototype holds, so a code or
// field such as "constructor" would read a function (security's nit on
// PR 574).
function ownEntry(table, key) {
  return typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined;
}

// What a file is called on its line, by the form field it was sent in.
const FILE_NOUN = { logo: 'The logo', receipt: 'The receipt' };

// The name-like fields: one line of at most `limit` characters.
const NAME_FIELDS = new Set(['sender_name', 'payee', 'new_client_name', 'name', 'full_name']);

function tooLong(d) {
  const limit = figure(d.limit);
  if (d.field === 'reference')
    return `Keep the reference to one line of at most ${limit} characters.`;
  if (d.field === 'note') return `Keep this to ${limit} characters at most.`;
  if (d.field === 'notes') return `Keep the notes to ${limit} characters at most.`;
  if (d.field === 'category')
    return `Keep the category to one line of at most ${limit} characters.`;
  if (d.field === 'new_client_address') return `Keep the address to ${limit} characters at most.`;
  if (d.field === 'address') {
    return d.lines
      ? `Keep the address to ${figure(d.lines)} lines of at most ${limit} characters each.`
      : `Keep the address to ${limit} characters at most.`;
  }
  if (NAME_FIELDS.has(d.field)) return `Keep the name to one line of at most ${limit} characters.`;
  return '';
}

// "Line 2: …", by the draft's 1-based line.
function draftLine(d, text) {
  return d.item ? `Line ${d.item}: ${text}` : '';
}

// "PayPal file, line 14: …", or "PayPal file: …" when the server has no line.
function paypalLine(d, text) {
  return d.line ? `PayPal file, line ${d.line}: ${text}` : '';
}

function quoted(v) {
  return `“${v}”`;
}

const PAYPAL_UNREADABLE =
  'PayPal file: this file could not be read as a CSV or Excel file. Download the export again and choose that file.';
const N26_UNREADABLE = 'This file could not be read.';

// One entry per code the invoicing routes can answer. Each takes the
// refusal (errorOf's fields) and the dialog's context, and returns the line,
// or '' where this code has no line for that field: the fallback is said.
// A code mapped to null is answered by the dialog itself, not with a line.
export const SENTENCES = {
  // ---- Dates
  date_too_early: (d) => `Check the year. The date must be ${d.limit || 2000} or later.`,
  date_in_future: (d, ctx) =>
    ctx.form === 'expense'
      ? 'This date is in the future. Enter the day the expense was paid.'
      : 'This date is in the future. Enter the day the money was received.',
  // From a date input only a PayPal file's cell can be met (#12300 c77187 1).
  invalid_date: (d) => paypalLine(d, `${quoted(d.value)} is not a date.`),

  // ---- Amounts, and a draft's lines
  amount_too_large: (d) =>
    d.field === 'unit_price_cents'
      ? draftLine(d, 'the unit price is too large. Check the figure.')
      : d.field === 'file'
        ? paypalLine(d, `the amount ${quoted(d.value)} is too large.`)
        : 'This amount is too large. Check the figure.',
  invalid_amount: (d) =>
    d.field === 'file' ? paypalLine(d, `${quoted(d.value)} is not an amount.`) : '',
  too_many_decimals: (d) =>
    paypalLine(d, `the amount ${quoted(d.value)} has more than two decimals.`),
  invalid_currency: (d) => paypalLine(d, `${quoted(d.value)} is not a currency code.`),
  below_zero: (d) => draftLine(d, 'enter a quantity and a unit price of 0 or more.'),
  quantity_too_large: (d) =>
    draftLine(d, `the quantity is too large. Use at most ${figure(d.limit)}.`),
  invalid_vat_rate: () => 'Enter a rate from 0 to 100, with at most one decimal.',
  invalid_line_items: () => '',

  // ---- Text
  too_long: tooLong,
  full_name_too_long: (d) => tooLong({ ...d, field: 'full_name' }),
  address_too_long: (d) => tooLong({ ...d, field: 'address' }),
  steuernummer_too_long: () => '',
  hidden_characters: () => 'Remove the hidden characters: retype this by hand.',
  no_letter_or_digit: () => 'Use at least one letter or digit in the name.',
  invalid_email: () => 'Not a valid email address.',
  invalid_phone: () => 'Use digits, spaces and + - ( ) / . only, at most 40 characters.',
  invalid_instagram: () => 'Use an Instagram name (@name) or a link to an Instagram profile.',
  invalid_telegram: () => 'Use a Telegram name (@name) or a t.me link.',
  invalid_iban: () => 'Not a valid IBAN. Check each character against the original.',
  required: (d) => {
    if (d.field === 'full_name') return 'Enter your full name. It is printed on every invoice.';
    if (d.field === 'address') return 'Enter your address. It is printed on every invoice.';
    return '';
  },

  // ---- The issuer profile
  invalid_prefix: (d) => `Use 1 to ${d.limit || 20} letters, digits or hyphens.`,
  // The prefix's hyphens (system_3 #12272): the app prints <prefix>-<number>.
  prefix_ends_with_hyphen: () => 'The prefix cannot end with a hyphen: the app adds one before the number.',
  prefix_starts_with_hyphen: () => 'The prefix cannot start with a hyphen.',
  prefix_double_hyphen: () => 'The prefix cannot hold two hyphens in a row.',
  number_too_small: (d) => `Enter ${d.limit || 1} or more.`,
  // #12306 rules this one: the dialog's number was stale.
  next_number_server_owned: () => STALE,

  // ---- Files: the logo, a receipt, a PayPal file, an N26 file
  missing_file: () => '',
  empty_file: (d) => {
    const noun = ownEntry(FILE_NOUN, d.field);
    if (noun) return `${noun} is empty.`;
    if (d.field === 'file') return 'PayPal file: this file is empty.';
    return 'This file is empty.';
  },
  too_large: (d) => {
    const noun = ownEntry(FILE_NOUN, d.field);
    return noun ? `${noun} is larger than ${d.limit || 5} MB.` : 'This file is larger than 5 MB.';
  },
  unsupported_type: (d) =>
    d.field === 'receipt'
      ? 'The receipt must be a PDF, JPEG or PNG file.'
      : d.field === 'logo'
        ? 'The logo must be a PNG or JPEG image.'
        : '',
  unreadable_image: () =>
    'The logo could not be read. Save it again as PNG or JPEG and choose that file.',
  no_visible_pixels: () => 'The logo has no visible pixels. Choose an image with something on it.',
  image_too_large: (d) =>
    d.width && d.height
      ? `The logo is ${d.width} × ${d.height} pixels. Use an image of at most ${LOGO_MAX_SIDE} pixels a side and ${LOGO_MAX_MEGAPIXELS} megapixels in all.`
      : `Use an image of at most ${LOGO_MAX_SIDE} pixels a side and ${LOGO_MAX_MEGAPIXELS} megapixels in all.`,
  xls_unsupported: () =>
    'PayPal file: this is an Excel 97-2003 (.xls) file. Save it as .xlsx or CSV and choose that file.',
  not_paypal_export: () =>
    "PayPal file: this is not PayPal's activity export. Choose the CSV or Excel export from PayPal's activity download.",
  invalid_csv: () => PAYPAL_UNREADABLE,
  invalid_xlsx: () => PAYPAL_UNREADABLE,
  date_orders_disagree: () =>
    'PayPal file: the dates in this file are written in two orders. Download the export again.',
  // The client asks Day/month or Month/day and sends the file again.
  date_order_ambiguous: null,
  too_many_files: (d) => `Choose at most ${figure(d.limit || 10)} files at a time.`,
  not_a_pdf: () => 'This is not a PDF or an N26 CSV export.',
  not_n26_document: () => 'This is not an N26 transfer confirmation or account statement.',
  csv_headers_unrecognised: () => "The columns of this CSV are not N26's.",
  extract_failed: () => N26_UNREADABLE,
  parse_failed: () => N26_UNREADABLE,

  // ---- An import's review rows, named by payer and date (ruling 3)
  invalid_row: (d, ctx) => (ctx.rowName ? `${ctx.rowName}: this could not be imported.` : ''),
  paypal_transfer_row: (d, ctx) =>
    ctx.rowName
      ? `${ctx.rowName}: this is a transfer from PayPal, and the PayPal import already counts it.`
      : '',
  too_many_rows: (d) => `Import at most ${figure(d.limit || 500)} at a time.`,

  // ---- Conflicts
  client_exists: (d) =>
    d.clientName
      ? `${quoted(d.clientName)} is already in your client book. Pick it from the list, or use another name.`
      : 'This client is already in your client book. Pick it from the list, or use another name.',
  duplicate_payment: () => 'A PayPal payment with this transaction id is already in your book.',
  payment_listed_twice: () => '',
  private_never_counts: () => 'Private expenses never count.',
  paypal_transfer_not_paid_work: () =>
    'This is a transfer from PayPal. Its PayPal payments are the paid work, so it cannot be paid work too.',
  builtin_preset_name: () => "“Work only” is the built-in preset's name. Choose another name.",
  duplicate_preset: (d, ctx) =>
    ctx.name
      ? `A preset named ${quoted(ctx.name)} already exists. Choose another name.`
      : 'A preset of this name already exists. Choose another name.',

  // ---- A screen that went stale (c77188 group 7)
  not_found: () => STALE,
  already_removed: () => STALE,
  not_removed: () => STALE,
  not_a_draft: () => STALE,
  payment_on_issued_invoice: () => STALE,
  payment_on_invoice: () => STALE,
  payment_on_draft: () => '',
  builtin_preset: () => STALE,
  no_such_client: () => STALE,
  payer_stale: () => STALE,

  // ---- The client's own request going wrong: nothing ze can do differently
  not_a_string: () => '',
  invalid_choice: () => '',
  invalid_id: () => '',
  client_and_new_client: () => '',
  needs_new_client: () => '',
  not_categorisable: () => '',
  invalid_category: () => STALE,
  removed_category: () => STALE,
  // The Book's category list: none of these is offered on the screen.
  reserved_category: () => '',
  duplicate_category: () => '',
  builtin_category: () => '',
  read_failed: () => '',
  invalid_field: () => '',
  unknown_field: () => '',
  bank_fact_field: () => '',
  bad_request: () => '',
  internal_error: () => '',
  unauthorized: () => '',
  forbidden: () => '',
  conflict: () => '',
};

// A review row as a refusal names it: its payer (or payee) and its day,
// "Dragan Petrovic, 2026-08-20" (#12300 ruling 3). `rows` is what the
// confirm posted, in order; the server's `item` is 1-based into it.
export function reviewRowName(rows, item, payerOf) {
  const row = item ? rows[item - 1] : null;
  if (!row) return '';
  const who = payerOf(row);
  const day = String(row.paid_on || '').slice(0, 10);
  return who && day ? `${who}, ${day}` : who || day;
}

// An N26 file's own line, on its row of the review (c77188 group 5). The
// parse answers each file's error inside a 200, as { code, message }.
export function n26FileLine(fileError) {
  const code = fileError && fileError.code;
  const sentence = ownEntry(SENTENCES, code);
  return (sentence && sentence({ code, field: '' }, {})) || N26_UNREADABLE;
}

// The field of the refusals that name it by their code alone: the four from
// before the server answered `field` (#9967, #10002, #12086), and the
// prefix's hyphens, which aspirant-server PR 247 sends without one (#12272).
const CODE_FIELDS = {
  invalid_phone: 'phone',
  invalid_instagram: 'instagram_url',
  invalid_telegram: 'telegram_url',
  invalid_iban: 'iban',
  prefix_ends_with_hyphen: 'invoice_number_prefix',
  prefix_starts_with_hyphen: 'invoice_number_prefix',
  prefix_double_hyphen: 'invoice_number_prefix',
};

// refusalOf turns a failed request into { field, text, known }: the server's
// field the line is about ('' for none), the line, and whether the line is
// the table's own rather than the fallback. ctx names the dialog and
// what the line needs from it: form ('payment', 'expense', …), rowName
// ("Dragan Petrovic, 2026-08-20") for a review row, name for a preset, and
// files (how many were sent) for a 413. d is errorOf(err).
export function refusalOf(d, ctx = {}) {
  if (!d.status) return { field: '', text: UNREACHABLE, known: true };
  // The proxy's 413 has no code; the server's own (a PayPal file over its
  // limit) comes with too_large (#12300 review point 1).
  if (d.status === 413 && d.code !== 'too_large') {
    return {
      field: '',
      known: true,
      text:
        (ctx.files || 1) > 1
          ? 'These files are too large to send together. Send fewer at a time.'
          : 'This file is too large to send.',
    };
  }
  // Its wording is another task's (#12300 ruling 6): the server's sentence
  // stays until that task words it.
  if (d.code === 'payment_on_draft' && d.message)
    return { field: d.field || '', text: d.message, known: true };
  const sentence = ownEntry(SENTENCES, d.code);
  const own = (sentence && sentence(d, ctx)) || '';
  // known: the table has a line of its own for this refusal, not the fallback.
  return { field: d.field || ownEntry(CODE_FIELDS, d.code) || '', text: own || FALLBACK, known: !!own };
}
