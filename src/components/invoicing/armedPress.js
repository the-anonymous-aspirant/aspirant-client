// A button that arms does not answer a press that begins less than
// ARM_DEAF_MS after it armed (system_3 #12313 ruling 1): a double-click's
// second press comes within about 500 ms, and ze cannot have read the line
// in that time either. The button looks armed at once; it is only deaf for
// that first moment. Meant as one piece for every such button (D5):
// #12295's "Save as a second payment" and "... expense" use it. Add
// client's "Add a second X" (#12264) still keeps its own ASK_DEAF_MS in
// ClientsPanel.vue, of the same 600 ms.

export const ARM_DEAF_MS = 600;

// The moment a button arms, on the clock a press is compared with.
export function armedNow() {
  return Date.now();
}

// True while a press at `now` would come too soon after `armedAt`.
export function pressTooSoon(armedAt, now = Date.now()) {
  return armedAt != null && now - armedAt < ARM_DEAF_MS;
}
