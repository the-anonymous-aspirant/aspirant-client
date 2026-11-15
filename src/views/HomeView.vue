<script setup lang="js">
  import axios from 'axios';
  import { ref, onMounted } from 'vue';
  import { AspButton } from '@aspirant/design-system';
  import { debugMode, toggleDebugMode } from '../global_state_manager.js';
  import assetManager from '../asset_manager.js';

  // The doors (UX walk AP1, system_3 #10977). Below 768px the sidebar is a
  // closed drawer, so the page itself offered nothing to do: the sign-in form
  // and the links to Applications and Support sat behind an unlabelled tap.
  // The page now shows those doors above the picture at phone width; from 768px
  // the sidebar shows them and the row is not rendered (CSS below).
  //
  // Read once: the page remounts on sign-in and sign-out (App.vue keys the
  // router-view on authVersion), as MemberView and GameHub rely on too. A cached
  // name is display state, not a credential (router.js guard comment).
  const signedOut = !localStorage.getItem('user_name');

  const status = ref(null);
  const version = ref(null);
  const source = ref(null);
  const aspiringHandTransperancy = ref(1);
  const aspiringHandImageUrl = ref('');

  const aspiringHandClickHandler = () => {
    console.log('You clicked it!');
    aspiringHandTransperancy.value = aspiringHandTransperancy.value === 1 ? 0 : 1;
  };

  onMounted(async () => {
    // Load aspiring hand image independently of health check
    try {
      aspiringHandImageUrl.value = await assetManager.getAsset('aspiring_hand');
    } catch (error) {
      console.error('Error loading aspiring hand image:', error);
    }

    // No localhost fallback (system_3 #9132): on the deployed site it asked
    // every visitor's browser for http://localhost:8081, which a content
    // policy must then either allow or report. Local development reaches the
    // server through the dev proxy at the same /api/health path.
    try {
      const response = await axios.get('/api/health');
      status.value = response.data.status;
      version.value = response.data.commit;
      source.value = 'Production';
    } catch (error) {
      console.error('Error with server', error);
      status.value = 'Error';
      version.value = 'Error';
      source.value = 'None';
    }
  });

  // #5330: an `onBeforeUnmount` here released `aspiring_hand` on every
  // navigation away from `/`. Unlike the dead Vue 2 hooks #5324 removed, this
  // one is spelled correctly and RAN — and `aspiring_hand` is also the
  // sidebar's logo. AssetManager has no reference counting, so the release
  // revoked the object URL the permanently-mounted sidebar was still pointing
  // at, leaving it on a dangling blob URL. Measured: alive:true on `/`,
  // alive:false after one in-app navigation, same DOM node, never recovering.
  //
  // The cache is bounded by assetMap and lives for the page session; that is
  // the correct lifetime for it while a single flat hash -> objectURL map is
  // shared by every consumer.

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
</script>

<template>
  <div class="home page">
    <h1>The Aspirant</h1>
    <h2 class="page-subtitle">Just my little slice of the internet - feel free to look around :) </h2>
    <nav class="home-doors" aria-label="Where to go" data-test="home-doors">
      <AspButton v-if="signedOut" variant="primary" to="/login" data-test="home-door-sign-in">Sign in</AspButton>
      <AspButton variant="secondary" to="/applications" data-test="home-door-applications">Applications</AspButton>
      <AspButton variant="secondary" to="/support" data-test="home-door-support">Support</AspButton>
    </nav>
    <img
      :src="aspiringHandImageUrl"
      alt="A hand reaching for a circle"
      @click="aspiringHandClickHandler"
      :style="{ opacity: aspiringHandTransperancy, transition: 'opacity 1s' }"
      class="aspiring-hand"
    />
    <div v-if="aspiringHandTransperancy === 0">
    </div>
    <div v-else>
    </div>
    <div v-if="debugMode" class="system-health">
      <p>Connection: {{ source }}</p>
      <p>Health: {{ status }}</p>
      <p>Version: {{ version && version.substring(0, 7) }}</p>
    </div>
  </div>
</template>

<style scoped>
  /* Left-aligned at the shell's gutter (#9192, §3.114): no inset, no
     vertical centring, so the title starts at the one title y. */
  .home {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    color: var(--text-on-light);
  }

  .home h1 {
    margin-bottom: var(--space-xs);
  }

  .home h2 {
    margin-bottom: var(--space-xl);
  }

  .system-health {
    margin-top: var(--space-xl);
    padding: var(--space-md);
    border: 3px solid var(--surface-card);
    border-radius: var(--radius-lg);
    color: var(--text-on-fixed-light);
    background-color: var(--brand-primary);
  }

  .aspiring-hand {
    cursor: pointer;
    max-width: 40%;
    height: auto;
  }

  /* The hero is black stipple ink on a TRANSPARENT ground, drawn to sit on a
     light page. Activating dark (#4245) put it on --surface-page #1a1a1a and
     measured it invisible: over the hero region the rendered luminance ran
     0..26 against a page of 26 — the art's brightest pixel equalled the
     background, ~1.2:1 at best, where the same region spans 0..228 in light.

     Inverting is the correct treatment rather than swapping in a second asset:
     the ink is monochrome and the ground is alpha, so invert(1) flips the ink
     to white and leaves the transparency untouched, reproducing the light
     theme's polarity instead of approximating it. Scoped-CSS note: the
     [data-theme] attribute lives on <html>, outside this component, and Vue
     hashes only the LAST selector — this compiles to
     `[data-theme='dark'] .aspiring-hand[data-v-…]`, which is what we want. */
  [data-theme='dark'] .aspiring-hand {
    filter: invert(1);
  }

  /* The doors exist for the phone, where the sidebar is a closed drawer. From
     768px the sidebar shows the same three, so a second set would be two homes
     for one action (D5). display:none also takes them out of the
     accessibility tree there. */
  .home-doors {
    display: none;
  }

  @media (max-width: 767.98px) {
    .aspiring-hand {
      max-width: 70%;
    }

    /* One row that wraps as a group rather than clipping (§3.122 P3). The
       sentence above keeps its own bottom margin, so the doors sit under it
       and above the picture. */
    .home-doors {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      margin-bottom: var(--space-xl);
    }
  }
</style>
