// Where focus goes after a refused Save (system_3 #12298 ruling 3): to the
// field the refusal is about, which the browser scrolls into view, or back
// to the button ze pressed. Never to the page body, where a loading button
// drops it (AspButton disables itself while it loads).
//
// `target` is a template ref: a design-system field or button, which expose
// focus() or render the control as their root, or a plain element. Called
// after the render that ends the loading state.
export function focusAfterRefusal(vm, refName) {
  vm.$nextTick(() => {
    const ref = vm.$refs[refName];
    const target = Array.isArray(ref) ? ref[0] : ref;
    if (!target) return;
    if (typeof target.focus === 'function') {
      target.focus();
      return;
    }
    // A component without focus(): its own control, or the first one in it.
    const el = target.$el;
    if (!el || !el.querySelector) return;
    const control = el.matches('input, textarea, select, button') ? el : el.querySelector('input, textarea, select, button');
    if (control) control.focus();
  });
}
