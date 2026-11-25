import { test, expect } from '@playwright/test';
import {
  FALLBACK,
  SENTENCES,
  STALE,
  n26FileLine,
  ownEntry,
  refusalOf,
  reviewRowName,
} from '../../src/components/invoicing/refusals.js';

/** system_3 #12300: the client holds one sentence per server code and never
 *  prints the server's own. Logic only, no page, as invoicing-payer-match
 *  tests its module (#12300 "Reconciled", point 1). */

// Every code aspirant-server's invoicing handlers answer on the routes the
// Invoices forms call (server PR 256, system_3 #12300 ruling 1; the list
// behind it is /data/aspirant/files/users/aspirant_engineer/evidence/12300/
// refusals.md). A code added there is added here, and then needs a line.
const SERVER_CODES = [
  // Route gates, and the codes derived from a status (common.go).
  'unauthorized',
  'forbidden',
  'bad_request',
  'not_found',
  'conflict',
  'internal_error',
  // Hand entry and edit of a payment or an expense.
  'unknown_field',
  'invalid_field',
  'not_a_string',
  'invalid_date',
  'date_in_future',
  'date_too_early',
  'invalid_amount',
  'amount_too_large',
  'too_long',
  'hidden_characters',
  'no_letter_or_digit',
  'invalid_email',
  'invalid_choice',
  'invalid_id',
  'no_such_client',
  'client_and_new_client',
  'needs_new_client',
  'client_exists',
  'duplicate_payment',
  'bank_fact_field',
  'not_categorisable',
  'paypal_transfer_not_paid_work',
  'payment_on_issued_invoice',
  'payment_on_draft',
  'already_removed',
  'not_removed',
  'payment_on_invoice',
  'invalid_category',
  'removed_category',
  'required',
  // The expense categories.
  'reserved_category',
  'duplicate_category',
  'builtin_category',
  // A receipt and the logo.
  'missing_file',
  'empty_file',
  'too_large',
  'unsupported_type',
  'read_failed',
  'unreadable_image',
  'no_visible_pixels',
  'image_too_large',
  // The client book and the issuer profile.
  'invalid_phone',
  'invalid_instagram',
  'invalid_telegram',
  'invalid_iban',
  'invalid_prefix',
  // The prefix's hyphens (server PR 247, system_3 #12272).
  'prefix_ends_with_hyphen',
  'prefix_starts_with_hyphen',
  'prefix_double_hyphen',
  'number_too_small',
  'next_number_server_owned',
  'full_name_too_long',
  'address_too_long',
  'steuernummer_too_long',
  // The PayPal file and its expenses confirm.
  'xls_unsupported',
  'invalid_csv',
  'invalid_xlsx',
  'not_paypal_export',
  'date_order_ambiguous',
  'date_orders_disagree',
  'too_many_decimals',
  'invalid_currency',
  'invalid_row',
  'too_many_rows',
  // The N26 files and their two confirms.
  'too_many_files',
  'not_a_pdf',
  'not_n26_document',
  'csv_headers_unrecognised',
  'extract_failed',
  'parse_failed',
  'paypal_transfer_row',
  // Book presets and the selection.
  'builtin_preset_name',
  'duplicate_preset',
  'builtin_preset',
  'private_never_counts',
  // The payers dialog.
  'payer_stale',
  // A draft invoice's save.
  'not_a_draft',
  'below_zero',
  'quantity_too_large',
  'invalid_vat_rate',
  'invalid_line_items',
  'payment_listed_twice',
];

// The one code the client answers without a line: it asks Day/month or
// Month/day and sends the file again.
const ANSWERED_BY_THE_DIALOG = ['date_order_ambiguous'];

const refusal = (over: Record<string, unknown>) => ({
  status: 400,
  code: '',
  message: 'the server says',
  ...over,
});
const line = (over: Record<string, unknown>, ctx = {}) => refusalOf(refusal(over), ctx).text;

test.describe('#12300 refusals: every code has a sentence', () => {
  test('each code the invoicing routes answer has an entry', () => {
    const missing = SERVER_CODES.filter((code) => !(code in SENTENCES));
    expect(missing).toEqual([]);
    const silent = SERVER_CODES.filter((code) => SENTENCES[code] === null);
    expect(silent).toEqual(ANSWERED_BY_THE_DIALOG);
  });

  test('a code the client does not know reads the fallback, never the server', () => {
    expect(line({ code: 'brand_new_code', message: 'brand_new_code happened' })).toBe(
      'This could not be saved.'
    );
    expect(FALLBACK).toBe('This could not be saved.');
    // A known code with nothing ze can do differently reads it too.
    expect(line({ code: 'unknown_field', message: 'unknown field "x"' })).toBe(FALLBACK);
  });

  test("a code or field named like an Object.prototype member is unknown too", () => {
    for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const r = refusalOf(refusal({ code }));
      expect(r.text).toBe(FALLBACK);
      expect(r.field).toBe('');
      expect(r.known).toBe(false);
      expect(n26FileLine({ code })).toBe(n26FileLine({ code: 'brand_new_code' }));
    }
    // The dialogs read their own field tables through it too.
    const table = { name: 'name', paid_on: 'paid_on' };
    expect(ownEntry(table, 'paid_on')).toBe('paid_on');
    for (const key of ['constructor', 'toString', '__proto__', '', undefined, null, 7]) {
      expect(ownEntry(table, key as never)).toBeUndefined();
    }
    expect(line({ code: 'empty_file', field: 'constructor' })).toBe('This file is empty.');
    expect(line({ code: 'too_large', field: 'toString', limit: 5 })).toBe(
      'This file is larger than 5 MB.'
    );
  });

  test('no answer at all, and the two 413s', () => {
    expect(refusalOf({ status: 0, code: '', message: '' }).text).toBe(
      'The server could not be reached. Try again.'
    );
    expect(
      line({ status: 413, code: 'too_large', message: 'This file is larger than 5 MB.' })
    ).toBe('This file is larger than 5 MB.');
    expect(line({ status: 413, code: '' })).toBe('This file is too large to send.');
    expect(line({ status: 413, code: 'internal_error' }, { files: 3 })).toBe(
      'These files are too large to send together. Send fewer at a time.'
    );
  });
});

test.describe('#12300 ruling 2: the table, at its field', () => {
  test('dates', () => {
    expect(line({ code: 'date_too_early', field: 'paid_on', limit: 2000 })).toBe(
      'Check the year. The date must be 2000 or later.'
    );
    expect(line({ code: 'date_in_future', field: 'paid_on' }, { form: 'payment' })).toBe(
      'This date is in the future. Enter the day the money was received.'
    );
    expect(line({ code: 'date_in_future', field: 'paid_on' }, { form: 'expense' })).toBe(
      'This date is in the future. Enter the day the expense was paid.'
    );
  });

  test("lengths, with the server's numbers", () => {
    expect(line({ code: 'too_long', field: 'reference', limit: 100 })).toBe(
      'Keep the reference to one line of at most 100 characters.'
    );
    expect(line({ code: 'too_long', field: 'payee', limit: 200 })).toBe(
      'Keep the name to one line of at most 200 characters.'
    );
    expect(line({ code: 'too_long', field: 'sender_name', limit: 200 })).toBe(
      'Keep the name to one line of at most 200 characters.'
    );
    expect(line({ code: 'too_long', field: 'note', limit: 1000 })).toBe(
      'Keep this to 1,000 characters at most.'
    );
    expect(line({ code: 'too_long', field: 'notes', limit: 5000 })).toBe(
      'Keep the notes to 5,000 characters at most.'
    );
    expect(line({ code: 'too_long', field: 'new_client_address', limit: 500 })).toBe(
      'Keep the address to 500 characters at most.'
    );
    expect(line({ code: 'too_long', field: 'address', limit: 200, lines: 10 })).toBe(
      'Keep the address to 10 lines of at most 200 characters each.'
    );
    expect(line({ code: 'address_too_long', field: 'address', limit: 200, lines: 10 })).toBe(
      'Keep the address to 10 lines of at most 200 characters each.'
    );
    expect(line({ code: 'full_name_too_long', field: 'full_name', limit: 200 })).toBe(
      'Keep the name to one line of at most 200 characters.'
    );
    expect(line({ code: 'too_long', field: 'category', limit: 100 })).toBe(
      'Keep the category to one line of at most 100 characters.'
    );
    expect(line({ code: 'too_long', field: 'name', limit: 60 })).toBe(
      'Keep the name to one line of at most 60 characters.'
    );
    // A changed limit changes the line.
    expect(line({ code: 'too_long', field: 'reference', limit: 120 })).toBe(
      'Keep the reference to one line of at most 120 characters.'
    );
  });

  test('a hidden character is not a length', () => {
    expect(line({ code: 'hidden_characters', field: 'note' })).toBe(
      'Remove the hidden characters: retype this by hand.'
    );
    expect(line({ code: 'no_letter_or_digit', field: 'new_client_name' })).toBe(
      'Use at least one letter or digit in the name.'
    );
  });

  test('amounts, emails and the profile', () => {
    expect(line({ code: 'amount_too_large', field: 'gross_cents' })).toBe(
      'This amount is too large. Check the figure.'
    );
    expect(line({ code: 'invalid_email', field: 'email' })).toBe('Not a valid email address.');
    expect(line({ code: 'invalid_email', field: 'paypal_email' })).toBe(
      'Not a valid email address.'
    );
    expect(line({ code: 'required', field: 'full_name' })).toBe(
      'Enter your full name. It is printed on every invoice.'
    );
    expect(line({ code: 'required', field: 'address' })).toBe(
      'Enter your address. It is printed on every invoice.'
    );
    expect(line({ code: 'invalid_prefix', field: 'invoice_number_prefix', limit: 20 })).toBe(
      'Use 1 to 20 letters, digits or hyphens.'
    );
    expect(line({ code: 'number_too_small', field: 'next_invoice_number', limit: 1 })).toBe(
      'Enter 1 or more.'
    );
    expect(line({ code: 'invalid_vat_rate', field: 'vat_rate_bp' })).toBe(
      'Enter a rate from 0 to 100, with at most one decimal.'
    );
  });

  test('the field comes from the answer, and from the code for those that have none', () => {
    expect(refusalOf(refusal({ code: 'too_long', field: 'reference', limit: 100 })).field).toBe(
      'reference'
    );
    expect(refusalOf(refusal({ code: 'invalid_phone' })).field).toBe('phone');
    expect(refusalOf(refusal({ code: 'invalid_iban' })).field).toBe('iban');
    expect(refusalOf(refusal({ code: 'invalid_phone' })).text).toBe(
      'Use digits, spaces and + - ( ) / . only, at most 40 characters.'
    );
    // The prefix's hyphens come without a field too (system_3 #12272).
    expect(refusalOf(refusal({ code: 'prefix_ends_with_hyphen' }))).toMatchObject({
      field: 'invoice_number_prefix',
      text: 'The prefix cannot end with a hyphen: the app adds one before the number.',
    });
    expect(refusalOf(refusal({ code: 'prefix_starts_with_hyphen' }))).toMatchObject({
      field: 'invoice_number_prefix',
      text: 'The prefix cannot start with a hyphen.',
    });
    expect(refusalOf(refusal({ code: 'prefix_double_hyphen' }))).toMatchObject({
      field: 'invoice_number_prefix',
      text: 'The prefix cannot hold two hyphens in a row.',
    });
  });

  test('a draft line, by its 1-based number', () => {
    expect(line({ code: 'below_zero', field: 'quantity_milli', item: 2 })).toBe(
      'Line 2: enter a quantity and a unit price of 0 or more.'
    );
    expect(
      line({ code: 'quantity_too_large', field: 'quantity_milli', item: 2, limit: 10000 })
    ).toBe('Line 2: the quantity is too large. Use at most 10,000.');
    expect(line({ code: 'amount_too_large', field: 'unit_price_cents', item: 2 })).toBe(
      'Line 2: the unit price is too large. Check the figure.'
    );
  });

  test('the logo and a receipt', () => {
    expect(line({ code: 'unsupported_type', field: 'logo' })).toBe(
      'The logo must be a PNG or JPEG image.'
    );
    expect(line({ code: 'too_large', field: 'logo', limit: 5 })).toBe(
      'The logo is larger than 5 MB.'
    );
    expect(line({ code: 'empty_file', field: 'logo' })).toBe('The logo is empty.');
    expect(line({ code: 'no_visible_pixels', field: 'logo' })).toBe(
      'The logo has no visible pixels. Choose an image with something on it.'
    );
    expect(line({ code: 'unreadable_image', field: 'logo' })).toBe(
      'The logo could not be read. Save it again as PNG or JPEG and choose that file.'
    );
    expect(line({ code: 'image_too_large', field: 'logo', width: 9000, height: 6000 })).toBe(
      'The logo is 9000 × 6000 pixels. Use an image of at most 8000 pixels a side and 25 megapixels in all.'
    );
    expect(line({ code: 'too_large', field: 'receipt', limit: 5 })).toBe(
      'The receipt is larger than 5 MB.'
    );
    expect(line({ code: 'empty_file', field: 'receipt' })).toBe('The receipt is empty.');
    expect(line({ code: 'unsupported_type', field: 'receipt' })).toBe(
      'The receipt must be a PDF, JPEG or PNG file.'
    );
  });

  test('a PayPal file, with the line ze can find', () => {
    expect(line({ code: 'empty_file', field: 'file' })).toBe('PayPal file: this file is empty.');
    expect(line({ code: 'not_paypal_export', field: 'file' })).toBe(
      "PayPal file: this is not PayPal's activity export. Choose the CSV or Excel export from PayPal's activity download."
    );
    expect(line({ code: 'xls_unsupported' })).toBe(
      'PayPal file: this is an Excel 97-2003 (.xls) file. Save it as .xlsx or CSV and choose that file.'
    );
    expect(line({ code: 'date_orders_disagree', field: 'file' })).toBe(
      'PayPal file: the dates in this file are written in two orders. Download the export again.'
    );
    expect(line({ code: 'too_many_decimals', field: 'file', line: 14, value: '12,345' })).toBe(
      'PayPal file, line 14: the amount “12,345” has more than two decimals.'
    );
    expect(line({ code: 'invalid_date', field: 'file', line: 14, value: '31.02.2026' })).toBe(
      'PayPal file, line 14: “31.02.2026” is not a date.'
    );
    expect(line({ code: 'invalid_currency', field: 'file', line: 14, value: 'EURO' })).toBe(
      'PayPal file, line 14: “EURO” is not a currency code.'
    );
    for (const code of ['invalid_csv', 'invalid_xlsx']) {
      expect(line({ code, field: 'file' })).toBe(
        'PayPal file: this file could not be read as a CSV or Excel file. Download the export again and choose that file.'
      );
    }
  });

  test('the N26 files, each on its row', () => {
    expect(line({ code: 'too_many_files', field: 'files', limit: 10 })).toBe(
      'Choose at most 10 files at a time.'
    );
    expect(n26FileLine({ code: 'too_large', message: 'the file is larger than 5 MB' })).toBe(
      'This file is larger than 5 MB.'
    );
    expect(n26FileLine({ code: 'empty_file', message: 'the file is empty' })).toBe(
      'This file is empty.'
    );
    expect(n26FileLine({ code: 'not_a_pdf' })).toBe('This is not a PDF or an N26 CSV export.');
    expect(n26FileLine({ code: 'not_n26_document' })).toBe(
      'This is not an N26 transfer confirmation or account statement.'
    );
    expect(n26FileLine({ code: 'csv_headers_unrecognised' })).toBe(
      "The columns of this CSV are not N26's."
    );
    expect(n26FileLine({ code: 'extract_failed' })).toBe('This file could not be read.');
    expect(
      n26FileLine({
        code: 'parse_failed',
        message: 'read as statement but a field is missing: strconv',
      })
    ).toBe('This file could not be read.');
    expect(n26FileLine({ code: 'something_new', message: 'go error text' })).toBe(
      'This file could not be read.'
    );
  });

  test('a review row is named by its payer and day, never "row 0" (ruling 3)', () => {
    const rows = [
      { sender_name: 'Mara Esempio', paid_on: '2026-08-19' },
      { sender_name: 'Dragan Petrovic', paid_on: '2026-08-20T00:00:00Z' },
    ];
    const rowName = reviewRowName(rows, 2, (r: { sender_name: string }) => r.sender_name);
    expect(rowName).toBe('Dragan Petrovic, 2026-08-20');
    expect(
      line(
        { code: 'invalid_row', field: 'rows', item: 2, message: 'row 1: currency must be EUR' },
        { rowName }
      )
    ).toBe('Dragan Petrovic, 2026-08-20: this could not be imported.');
    const paypal = reviewRowName(
      [{ sender_name: 'PayPal', paid_on: '2026-08-20' }],
      1,
      (r: { sender_name: string }) => r.sender_name
    );
    expect(line({ code: 'paypal_transfer_row', field: 'rows', item: 1 }, { rowName: paypal })).toBe(
      'PayPal, 2026-08-20: this is a transfer from PayPal, and the PayPal import already counts it.'
    );
    expect(line({ code: 'too_many_rows', field: 'rows', limit: 500 })).toBe(
      'Import at most 500 at a time.'
    );
    // No row to name: the fallback, not the index.
    expect(
      line(
        { code: 'invalid_row', field: 'rows', item: 9 },
        { rowName: reviewRowName(rows, 9, () => '') }
      )
    ).toBe(FALLBACK);
  });

  test('conflicts, and a screen that went stale', () => {
    expect(
      refusalOf({
        ...refusal({ code: 'client_exists', field: 'new_client_name' }),
        clientName: 'Galerie Nord',
      }).text
    ).toBe(
      '“Galerie Nord” is already in your client book. Pick it from the list, or use another name.'
    );
    expect(line({ code: 'duplicate_payment', field: 'reference' })).toBe(
      'A PayPal payment with this transaction id is already in your book.'
    );
    expect(line({ code: 'private_never_counts' })).toBe('Private expenses never count.');
    expect(line({ code: 'paypal_transfer_not_paid_work', field: 'category' })).toBe(
      'This is a transfer from PayPal. Its PayPal payments are the paid work, so it cannot be paid work too.'
    );
    expect(line({ code: 'builtin_preset_name', field: 'name' })).toBe(
      "“Work only” is the built-in preset's name. Choose another name."
    );
    expect(line({ code: 'duplicate_preset', field: 'name' }, { name: 'Jobcenter' })).toBe(
      'A preset named “Jobcenter” already exists. Choose another name.'
    );
    for (const code of [
      'not_found',
      'already_removed',
      'not_removed',
      'not_a_draft',
      'payment_on_issued_invoice',
      'payment_on_invoice',
      'builtin_preset',
      'no_such_client',
      'payer_stale',
      'removed_category',
    ]) {
      expect(line({ code }), code).toBe(STALE);
    }
    expect(STALE).toBe(
      'This was changed since the page loaded. Reload the page to see it as it is now.'
    );
  });
});
