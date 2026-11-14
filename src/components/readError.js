// What a failed read means, for a person (system_3 #11025, UX walk AM8).
//
// `kind` picks the ReadState: `refused` for a 403, where the answer is "not
// yours" and trying again cannot help; `signed-out` for a 401, where the
// session ended and the door is signing in again; `failed` for everything
// else. `reason`
// is one sentence in plain words for the failed state. It never carries the
// server's own message, which is how internal service names and "Insufficient
// permissions" reached the page before; log the error itself if it is needed.
//
// English by default; a page in another language passes its own `words`.
export const READ_ERROR_WORDS_EN = {
  serviceDown: 'The service behind this page is not running right now. This is usually temporary.',
  serverError: (status) => `The server answered with an error (${status}).`,
  noAnswer: 'The server did not answer. This is usually temporary.',
  unreadable: 'The answer could not be read.',
};

export const READ_ERROR_WORDS_SV = {
  serviceDown: 'Tjänsten bakom sidan är inte igång just nu. Det är oftast tillfälligt.',
  serverError: (status) => `Servern svarade med ett fel (${status}).`,
  noAnswer: 'Servern svarade inte. Det är oftast tillfälligt.',
  unreadable: 'Svaret gick inte att läsa.',
};

export function readError(err, words = READ_ERROR_WORDS_EN) {
  const status = err?.response?.status ?? (typeof err?.status === 'number' ? err.status : undefined);
  if (status === 403) return { kind: 'refused', reason: '' };
  if (status === 401) return { kind: 'signed-out', reason: '' };
  if (status === 502 || status === 503 || status === 504) return { kind: 'failed', reason: words.serviceDown };
  if (status) return { kind: 'failed', reason: words.serverError(status) };
  if (err?.request || err instanceof TypeError) return { kind: 'failed', reason: words.noAnswer };
  return { kind: 'failed', reason: words.unreadable };
}
