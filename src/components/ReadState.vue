<template>
  <!-- loading -->
  <!-- inheritAttrs is off (the ready state renders the caller's own slot), so
       each state's root takes the caller's class and data attributes itself;
       before, a `data-test` on <ReadState> was silently dropped (#11025). -->
  <div v-if="state === 'loading'" class="read-state" data-testid="read-state-loading" v-bind="$attrs">
    <AspSkeleton
      :variant="skeleton"
      :lines="lines"
      :height="height"
      :rows="rows"
      :columns="columns"
    />
    <span class="read-state__sr" role="status">{{ loadingLabel }}</span>
  </div>

  <!-- failed -->
  <div v-else-if="state === 'failed'" class="read-state read-state__failed" data-testid="read-state-failed" role="alert" v-bind="$attrs">
    <AspEmptyState :heading="heading || 'That did not load'" :message="message" variant="empty">
      <template #icon>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" aria-hidden="true">
          <path
            d="M12 3.5 21.5 20H2.5L12 3.5Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <path d="M12 10v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <circle cx="12" cy="17" r="0.9" fill="currentColor" />
        </svg>
      </template>
    </AspEmptyState>
    <!-- The line that separates a page which is down from a page which is
         partly down. It is optional because it is a claim: only a caller that
         knows something still works should make it. -->
    <p v-if="stillWorks" class="read-state__still-works" data-testid="read-state-still-works">
      {{ stillWorks }}
    </p>
    <!-- Only where retry can actually work. A button on a 403 is a button that
         teaches people the product is broken. -->
    <AspButton
      v-if="canRetry"
      variant="secondary"
      size="sm"
      data-testid="read-state-retry"
      @click="$emit('retry')"
    >
      {{ retryLabel }}
    </AspButton>
  </div>

  <!-- refused: the read was answered, and the answer is "not yours". Trying
       again cannot change it, so there is never a retry here, whatever the
       caller binds (system_3 #11025; the Invoices app's words, #8367). -->
  <AspEmptyState
    v-else-if="state === 'refused'"
    class="read-state"
    data-testid="read-state-refused"
    v-bind="$attrs"
    :heading="heading || 'This app belongs to another account'"
    :message="message || 'Only its owner and an administrator can open it.'"
    variant="empty"
  />

  <!-- signed-out: the session ended (a 401). Not a refusal, which would tell
       them they lost access, and not a failure a retry can fix: the door is
       signing in again, back to this page (design_agent c68306 on #11025). -->
  <div
    v-else-if="state === 'signed-out'"
    class="read-state"
    data-testid="read-state-signed-out"
    role="alert"
    v-bind="$attrs"
  >
    <AspEmptyState
      :heading="heading || 'Your session has ended'"
      :message="message || 'Sign in again.'"
      variant="empty"
    />
    <AspButton variant="primary" size="sm" :href="signInHref" data-testid="read-state-sign-in">
      {{ signInLabel }}
    </AspButton>
  </div>

  <!-- empty -->
  <AspEmptyState
    v-else-if="state === 'empty'"
    data-testid="read-state-empty"
    v-bind="$attrs"
    :heading="heading"
    :message="message"
    :variant="filtered ? 'filtered' : 'empty'"
  />

  <!-- ready: the caller's own content -->
  <slot v-else />
</template>

<script setup>
  /**
   * ReadState — one vocabulary for the three things a read can be doing, so a
   * page that is loading, a page that failed and a page with nothing in it stop
   * looking like each other (system_3 #5302, from the #5260 cohesion walk,
   * finding B1).
   *
   * Before this, the client shipped three different grammars for one condition:
   * raw axios strings as page bodies ("Request failed with status code 401"),
   * honest bespoke prose on two pages, and — worst — nothing at all, where
   * `MessageBoardView` caught every failure into `console.error` and left an
   * empty rectangle that a genuinely empty thread also produces.
   *
   * # What this owns, and what it does not
   *
   * It owns the SHAPE: which state renders, what each looks like, that a retry
   * appears only where retry can work. The caller owns the WORDS, because
   * "could not load your game profile — you can still set one below" is
   * knowledge about that page which no shared component has. A component that
   * wrote the copy would produce six pages apologising identically.
   *
   * It also does not fetch. A composable owning fetch lifecycle is a larger
   * idea and a separate argument; the defect being closed here is that three
   * conditions rendered indistinguishably, not that six pages each wrote their
   * own `try/catch`.
   */
  import { computed, getCurrentInstance, watchEffect } from 'vue'
  import { AspButton, AspEmptyState, AspSkeleton } from '@aspirant/design-system'

  defineOptions({ inheritAttrs: false })

  /**
   * Shapes a transport error takes on its way to a screen. Not an attempt at
   * completeness — it is the set that actually reached users, plus the two
   * spellings axios and fetch produce on a dead connection.
   */
  const TRANSPORT_SHAPE = /status code|Network Error|ECONN|AxiosError|Failed to fetch|XMLHttpRequest/i

  const props = defineProps({
    /**
     * `ready` renders the default slot; the other three replace it entirely.
     * Deliberately one prop rather than three booleans: a page cannot be
     * loading and failed at once, and modelling it as booleans is how a page
     * ends up rendering two states stacked.
     */
    state: {
      type: String,
      default: 'ready',
      validator: (v) => ['ready', 'loading', 'failed', 'refused', 'signed-out', 'empty'].includes(v),
    },
    heading: { type: String, default: '' },
    /**
     * What to say. For `failed` this is required in practice — a failed state
     * with no words is the silent void this component exists to end.
     */
    message: { type: String, default: '' },
    /** `failed` only — one line naming what still works despite the failure. */
    stillWorks: { type: String, default: '' },
    /** `empty` only — an empty result caused by a filter reads differently. */
    filtered: { type: Boolean, default: false },
    /** `loading` — the skeleton shape; a table and a paragraph are not the
     *  same rectangle, and a skeleton that lies about the shape of what is
     *  coming is worse than a spinner. */
    skeleton: {
      type: String,
      default: 'text',
      validator: (v) => ['text', 'block', 'row'].includes(v),
    },
    lines: { type: Number, default: 3 },
    height: { type: String, default: '8rem' },
    rows: { type: Number, default: 3 },
    columns: { type: Number, default: 3 },
    /** Announced to a screen reader while the skeleton is up. */
    loadingLabel: { type: String, default: 'Loading' },
    retryLabel: { type: String, default: 'Try again' },
    /** `signed-out` only — the sign-in link's words. */
    signInLabel: { type: String, default: 'Sign in' },
  })

  defineEmits(['retry'])

  const instance = getCurrentInstance()

  // A retry button appears when, and only when, someone is listening for it.
  // Binding @retry is the caller saying "retrying can help here"; a 403 or a
  // 404 should not get one, and this makes that the default rather than
  // something each page has to remember not to do.
  const canRetry = computed(() => Boolean(instance?.vnode?.props?.onRetry))

  // Back to this page after signing in; `expired=1` makes the sign-in page say
  // the session ended (#5925). LoginView only follows a same-origin redirect.
  const signInHref = computed(() => {
    const here = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search
    return `/login?expired=1&redirect=${encodeURIComponent(here)}`
  })

  /**
   * The dev-time guard that keeps the class closed.
   *
   * B2 adds a test that fails when a view renders a transport string directly.
   * That test cannot see a string which arrives here as a prop at runtime, and
   * this warning cannot see one a page renders without going through this
   * component. Together they cover both doors; either alone leaves one open.
   */
  if (import.meta.env?.DEV) {
    watchEffect(() => {
      if (props.state === 'failed' && TRANSPORT_SHAPE.test(props.message)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[ReadState] message looks like a transport error and will be shown to a person: ${JSON.stringify(
            props.message,
          )}. Say what failed in words they recognise; log the original instead.`,
        )
      }
    })
  }
</script>

<style scoped>
  .read-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    width: 100%;
  }

  .read-state__still-works {
    margin: 0;
    color: var(--text-muted);
    text-align: center;
    max-width: 46ch;
  }

  /* The skeleton has its own announcement; the visual is decorative. */
  .read-state__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
