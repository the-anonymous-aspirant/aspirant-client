import { test, expect } from '@playwright/test';
import { namesAreClose, namesAreSame, matchPayer, tidyName, looksLikeCardPaymentOrService, lookAlikePairs } from '../../src/components/invoicing/payerMatch.js';

/** §3.142 Decision 4 (design_agent c65348 on #10539): "the same" and "close"
 *  are defined once, for both hand entry (#10549) and the payers dialog
 *  (#10536/#10550). These are the design's own acceptance pairs — logic-only,
 *  no page needed, since the rule is pure JS shared by both surfaces. */

test.describe('§3.142 Decision 4 — payer name matching', () => {
  test('the same: normalised names equal, case/space/punctuation aside', () => {
    expect(namesAreSame('Mara Esempio', 'Mara Esempio')).toBe(true);
    expect(namesAreSame('MARA ESEMPIO', 'Mara  Esempio')).toBe(true);
    expect(namesAreSame('', 'Mara Esempio')).toBe(false);
    expect(namesAreSame('', '')).toBe(false);
  });

  test('close (a): the same words in another order', () => {
    expect(namesAreClose('Esempio Mara', 'Mara Esempio')).toBe(true);
  });

  test('close (b): each word of the shorter name prefixes the word in the same place, one whole match of 2+ letters', () => {
    expect(namesAreClose('Mara E.', 'Mara Esempio')).toBe(true);
    expect(namesAreClose('M. Esempio', 'Mara Esempio')).toBe(true);
  });

  test('close (c): 6+ letters, at most 2 edits', () => {
    expect(namesAreClose('Mara Esmepio', 'Mara Esempio')).toBe(true);
  });

  test('not close: a shared first name alone is not a match', () => {
    expect(namesAreClose('Mara Rossi', 'Mara Esempio')).toBe(false);
    expect(namesAreSame('Mara Rossi', 'Mara Esempio')).toBe(false);
  });

  test('close is never true of names that are the same', () => {
    expect(namesAreClose('Mara Esempio', 'Mara Esempio')).toBe(false);
  });

  test('matchPayer: empty, same (nothing asked), close (ranked, capped at 3), new', () => {
    const clients = [
      { id: 1, name: 'Mara Esempio' },
      { id: 2, name: 'Mara Esmepio' }, // close (c) to the typed name below
      { id: 3, name: 'M. Esempio' }, // close (b)
      { id: 4, name: 'Someone Else' },
    ];
    expect(matchPayer('', clients)).toEqual({ state: 'empty' });
    expect(matchPayer('   ', clients)).toEqual({ state: 'empty' });
    expect(matchPayer('Mara Esempio', clients)).toEqual({ state: 'same', client: clients[0] });
    const close = matchPayer('Mara Esempio ', clients.slice(1)); // no exact match now
    expect(close.state).toBe('close');
    expect(close.candidates.map((c: any) => c.id)).toEqual([3, 2]); // prefix match (b) ranks before edit-distance (c)
    expect(matchPayer('Totally Different Person', clients)).toEqual({ state: 'new' });
  });

  test('matchPayer caps close candidates at 3, closest first', () => {
    // Four close (c) matches to "Mara Esempio" at increasing edit distance:
    // two at distance 1 (one changed letter each), two at distance 2 (two
    // changed letters each). None hits (a) or (b), so this isolates (c)'s
    // own ranking and the cap.
    const clients = [
      { id: 1, name: 'Nara Esempio' }, // distance 1 (first letter)
      { id: 2, name: 'Mara Esempia' }, // distance 1 (last letter)
      { id: 3, name: 'Mara Esmepio' }, // distance 2 (the design's own example)
      { id: 4, name: 'Nara Esempia' }, // distance 2 (both letters)
    ];
    const result = matchPayer('Mara Esempio', clients);
    expect(result.state).toBe('close');
    expect(result.candidates).toHaveLength(3);
    // Closest (smallest edit distance) first; among a tie, the book's own
    // order breaks it, so the last, equally-distant id 4 is the one the cap
    // drops.
    expect(result.candidates.map((c: any) => c.id)).toEqual([1, 2, 3]);
  });
});

test.describe('§3.142 Decision 6 — tidying a new payer name', () => {
  test('all caps or all lower is capitalised word by word', () => {
    expect(tidyName('MARA ESEMPIO')).toBe('Mara Esempio');
    expect(tidyName('mara esempio')).toBe('Mara Esempio');
  });

  test('mixed case is kept exactly as written', () => {
    expect(tidyName('maRA eSEMPIO')).toBe('maRA eSEMPIO');
  });

  test('trims and collapses spaces either way', () => {
    expect(tidyName('  MARA   ESEMPIO  ')).toBe('Mara Esempio');
  });
});

// system_3 #11507 (Design ack c71154, amending §3.142 Decision 4): rule (d),
// and the hint for a payer that is not a client. Logic only, as above.
test.describe('#11507 a middle name, and a payer that is not a client', () => {
  test('close (d): the first and last words match and the longer name has words between them', () => {
    // A first and last name, and the same name with a middle name added.
    expect(namesAreClose('Renée Fittizio', 'Renee Carla Fittizio')).toBe(true);
    expect(namesAreClose('Renee Carla Fittizio', 'Renée Fittizio')).toBe(true);
    expect(namesAreClose('Mara Esempio', 'Mara Lucia Anna Esempio')).toBe(true);
    // A middle name the shorter one carries must be among the longer one's.
    expect(namesAreClose('Ana Maria Beispiel', 'Ana Maria Lucia Beispiel')).toBe(true);
    expect(namesAreClose('Ana Clara Beispiel', 'Ana Maria Lucia Beispiel')).toBe(false);
  });

  test('not close under (d): a shared first name alone, a shared last name alone, or one word', () => {
    expect(namesAreClose('Mara Rossi', 'Mara Lucia Esempio')).toBe(false);
    expect(namesAreClose('Lia Esempio', 'Mara Lucia Esempio')).toBe(false);
    expect(namesAreClose('Fittizio', 'Renee Carla Fittizio')).toBe(false);
  });

  test('matchPayer asks about a middle-name match, ranked with the other word matches', () => {
    const clients = [{ id: 1, name: 'Renee Carla Fittizio' }, { id: 2, name: 'Someone Else' }];
    const m = matchPayer('Renée Fittizio', clients);
    expect(m.state).toBe('close');
    expect(m.candidates.map((c: any) => c.id)).toEqual([1]);
  });

  test('a web domain or a code of letters and digits looks like a card payment or an online service', () => {
    for (const name of ['Musterplatz.io 7c4e1a9b', 'Musterplatz.io', 'ZAHLUNG *MUSTERDIENST.COM', 'Kartenzahlung 9f3a71bc', 'musterladen.de', 'Bestellung x7k2m9p4 Shop']) {
      expect(looksLikeCardPaymentOrService(name), name).toBe(true);
    }
  });

  test('a person, a company, an initial with a dot and a name with a number are not flagged', () => {
    for (const name of ['Mara Esempio', 'Galerie Nord', 'Studio Erfunden GmbH', 'Dr.Beispiel', 'M. Esempio', 'St.Gallen Atelier', 'Studio54', 'Haus 12', 'Agentur 2000 Berlin', '', '   ']) {
      expect(looksLikeCardPaymentOrService(name), JSON.stringify(name)).toBe(false);
    }
  });

  test('lookAlikePairs: each look-alike pair once, in the book\'s order, and nothing for a book with none', () => {
    const book = [
      { id: 1, name: 'Renée Fittizio' },
      { id: 2, name: 'Galerie Nord' },
      { id: 3, name: 'Renee Carla Fittizio' },
      { id: 4, name: 'Mara Esempio' },
      { id: 5, name: 'Mara Esmepio' },
    ];
    expect(lookAlikePairs(book).map(([a, b]: any[]) => [a.id, b.id])).toEqual([[1, 3], [4, 5]]);
    expect(lookAlikePairs([book[0], book[1], book[3]])).toEqual([]);
    expect(lookAlikePairs([])).toEqual([]);
  });
});
