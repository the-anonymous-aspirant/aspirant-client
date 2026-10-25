import { onBeforeUnmount, ref } from 'vue';

// system_3 #8753 (D2 U1): the app's two layout thresholds as reactive flags.
// `narrow` is the §3.114 shared threshold (under 640 px, where a toolbar
// strip collapses to a select); `belowMd` is under 768 px, where the card
// editors and the review default their zoom to 50 %. SSR- and test-safe: with
// no `matchMedia` both read false.
export const NARROW_QUERY = '(max-width: 639px)';
export const BELOW_MD_QUERY = '(max-width: 767px)';

export function useViewport() {
  const narrow = ref(false);
  const belowMd = ref(false);
  const stops = [];
  function watch(query, target) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    target.value = mql.matches;
    const onChange = (e) => { target.value = e.matches; };
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
    else if (typeof mql.addListener === 'function') mql.addListener(onChange);
    stops.push(() => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange);
      else if (typeof mql.removeListener === 'function') mql.removeListener(onChange);
    });
  }
  watch(NARROW_QUERY, narrow);
  watch(BELOW_MD_QUERY, belowMd);
  onBeforeUnmount(() => stops.forEach((s) => s()));
  return { narrow, belowMd };
}
