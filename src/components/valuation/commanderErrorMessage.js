// system_3 #9439: the Värdeutlåtande view's error handling read
// `err.response.data.error.message`, a shape some OTHER commander routes use
// (notes/tasks' `_error()` helper), but `valuation_statement`'s own endpoints
// raise FastAPI's plain `HTTPException`, whose body is `{"detail": ...}`. That
// mismatch meant every real validation message — including the deliberate,
// helpful 422 when the signing appraiser's identity isn't set yet — silently
// fell through to the generic "Servern svarade inte" fallback, which an
// operator read as a network failure rather than an actionable instruction.
//
// A request made with `{ responseType: 'blob' }` (the two /generate calls)
// wraps even an error body in a Blob rather than parsing it as JSON, so that
// case is unwrapped first.

/** The server's own message for a failed request, or `fallback` when none is
 *  present. Reads both commander error shapes: `{error:{message}}` and
 *  FastAPI's `{detail}` (a string or, for a pydantic validation error, an
 *  array of `{msg}` entries — joined for display). */
export async function commanderErrorMessage(err, fallback) {
  let data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      data = JSON.parse(await data.text());
    } catch (_) {
      return fallback;
    }
  }
  if (!data || typeof data !== 'object') return fallback;
  if (data.error?.message) return data.error.message;
  if (typeof data.detail === 'string' && data.detail) return data.detail;
  if (Array.isArray(data.detail) && data.detail.length) {
    const msgs = data.detail.map((d) => d?.msg).filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  return fallback;
}
