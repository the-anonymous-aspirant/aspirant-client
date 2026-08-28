<template>
  <div 
    v-if="showBackButton" 
    class="back-button-container"
    :class="{ 'mobile': isMobile }"
  >
    <!-- The DS ships AspBackButton, and docs/COMPONENTS.md §9 names THIS file
         as the component it was ported from — so §3.13 build-in-DS-first says
         adopt it rather than re-port the inner button. position="inline"
         because the container below already owns the placement (and the two
         mobile insets the DS does not model); icon-only because the label was
         already an empty span here. Static tooltip content: the old title was
         computed from history at render time and went stale, which is why the
         DS deliberately ships none. -->
    <AspTooltip content="Back" position="right">
      <AspBackButton to="/" label="Back" position="inline" icon-only />
    </AspTooltip>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { AspBackButton, AspTooltip } from '@aspirant/design-system';
import { isMobile } from '@/global_state_manager.js';

export default {
  name: 'BackButton',
  components: { AspBackButton, AspTooltip },
  setup() {
    const route = useRoute();

    const showBackButton = computed(() => {
      // Don't show on home page
      return route.path !== '/';
    });

    // goBack and getBackButtonTitle are gone with the native button. Both were
    // built on `window.history.length > 1`, which counts forward entries and is
    // already > 1 on a tab that merely navigated within the app — so it answers
    // "has this tab navigated at all", not "is the previous entry ours", and
    // popping on it can walk the user out to the referring site. AspBackButton
    // reads `history.state.back` (what vue-router actually writes) and falls
    // back to a same-origin referrer check. Adopting the component is what
    // fixes that; re-porting the inner button would have carried the bug.
    return {
      showBackButton,
      isMobile
    };
  }
};
</script>

<style scoped>
/* The container owns placement AND the pill surface: AspBackButton sets no
   background on purpose, so it inherits polarity, and a control fixed over
   arbitrary scrolling content needs a surface of its own to stay legible.
   Painting it here rather than on the DS root is the whole distinction —
   a scoped rule on the component would override it (#4323/#4324).
   `color` is paired with that surface (#3027/§3.18): the DS ink is
   currentColor-derived, so a surface that declares none hands it the page's
   polarity and the glyph goes unreadable on the card. */
.back-button-container {
  position: fixed;
  top: var(--space-lg);
  right: var(--space-lg);
  z-index: 1000;
  display: inline-flex;
  padding: var(--space-2xs);
  background: var(--surface-card);
  color: var(--text-on-dark);
  border: 2px solid var(--brand-primary);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: all var(--transition-moderate);
}

.back-button-container.mobile {
  top: var(--space-md);
  right: var(--space-md);
}

/* .back-button, .back-icon, .back-text and their hover/active rules are gone
   with the native button. The DS owns the control's paint, its focus ring, its
   44px minimum target and the icon's nudge-left hover — which it also disables
   under prefers-reduced-motion, something this file never did. The container
   keeps the lift on hover, since that belongs to the pill, not the button. */
.back-button-container:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

/* Mobile styles */
/* The former mobile block only restated the 44px target, hid the (empty)
   label and resized the glyph. AspBackButton guarantees min-height 44px at
   every breakpoint and the label is clipped in the accessibility tree rather
   than display:none, so nothing here needs a mobile branch any more. */

/* Small screen adjustments */
@media (max-width: 480px) {
  .back-button-container {
    top: var(--space-sm);
    right: var(--space-sm);
  }

}

/* Ensure it doesn't interfere with mobile menu */
@media (max-width: 768px) {
  .back-button-container {
    z-index: 1000;
  }
}
</style>
