<template>
  <!-- Starting a hunt asks when it ends (system_3 #11313, design ack on that
       task). The server's own default end lies in the past, so a start
       without a time opened a hunt that was already over. One form for the
       start between hunts and for a reset: no default time, a time after
       now, checked again at the press, and in the admin's own time zone. -->
  <!-- novalidate: the input's `min` would otherwise stop the press with the
       browser's own bubble, and the page's line would never show. -->
  <form class="hunt-end-form" :class="{ 'hunt-end-form--card': onCard }" :data-test="testId" novalidate @submit.prevent="submit">
    <h3 class="hunt-end-form__heading">{{ heading }}</h3>
    <p v-if="warning" class="hunt-end-form__warning" data-test="hunt-end-warning">{{ warning }}</p>
    <label class="hunt-end-form__label" :for="inputId">Ends at</label>
    <input
      :id="inputId"
      v-model="endsAt"
      type="datetime-local"
      class="hunt-end-form__input"
      :min="minValue"
      :aria-describedby="`${inputId}-zone`"
      data-test="hunt-ends-at"
    />
    <p :id="`${inputId}-zone`" class="hunt-end-form__note" data-test="hunt-ends-zone">In your time zone, {{ zone }}.</p>
    <p v-if="refusal" class="hunt-end-form__error" role="alert" data-test="hunt-ends-refusal">{{ refusal }}</p>
    <div class="hunt-end-form__actions">
      <AspButton v-if="cancellable" type="button" variant="secondary" :disabled="busy" data-test="hunt-end-cancel" @click="$emit('cancel')">Cancel</AspButton>
      <AspButton type="submit" :variant="variant" :loading="busy" :disabled="!endsAt" data-test="hunt-end-submit">{{ buttonLabel }}</AspButton>
    </div>
    <p v-if="!endsAt" class="hunt-end-form__note" data-test="hunt-ends-needed">Choose when the hunt ends.</p>
    <p v-if="failure" class="hunt-end-form__error" role="alert" data-test="hunt-end-failure">{{ failure }}</p>
  </form>
</template>

<script>
  import { AspButton } from '@aspirant/design-system';

  const pad = (n) => String(n).padStart(2, '0');

  // "YYYY-MM-DDTHH:MM" in local time, the shape a datetime-local input uses.
  export function localInputValue(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // The input's local value as RFC 3339 with the browser's offset for that
  // moment, e.g. "2026-11-22T18:00:00+01:00".
  export function lockAtFrom(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    return `${value.length === 16 ? `${value}:00` : value}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }

  let uid = 0;

  export default {
    name: 'HuntEndForm',
    components: { AspButton },
    props: {
      heading: { type: String, required: true },
      buttonLabel: { type: String, required: true },
      variant: { type: String, default: 'primary' },
      warning: { type: String, default: '' },
      cancellable: { type: Boolean, default: false },
      busy: { type: Boolean, default: false },
      // A refusal from the server, said under the button (not only in a
      // toast that leaves after three seconds).
      failure: { type: String, default: '' },
      testId: { type: String, default: 'hunt-end-form' },
      // Inside a dark card (the game's Admin panel): on-dark inks, and a
      // narrow column, so the buttons stack full width.
      onCard: { type: Boolean, default: false },
    },
    emits: ['submit', 'cancel'],
    data() {
      uid += 1;
      return {
        endsAt: '',
        refusal: '',
        inputId: `hunt-ends-at-${uid}`,
        minValue: localInputValue(new Date()),
      };
    },
    computed: {
      zone() {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your browser\'s zone';
        } catch {
          return 'your browser\'s zone';
        }
      },
    },
    watch: {
      endsAt() {
        this.refusal = '';
      },
    },
    methods: {
      submit() {
        if (!this.endsAt || this.busy) return;
        // Checked at the press: the time can pass while the form is open.
        const chosen = new Date(this.endsAt);
        if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) {
          this.refusal = 'Choose a time after now.';
          this.minValue = localInputValue(new Date());
          return;
        }
        this.$emit('submit', lockAtFrom(this.endsAt));
      },
    },
  };
</script>

<style scoped>
  .hunt-end-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    max-width: 22rem;
  }

  .hunt-end-form__heading {
    margin: 0;
  }

  .hunt-end-form__warning,
  .hunt-end-form__note,
  .hunt-end-form__error {
    margin: 0;
  }

  .hunt-end-form__note {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .hunt-end-form__error {
    color: var(--feedback-error-text);
  }

  .hunt-end-form__label {
    font-weight: var(--font-weight-medium);
  }

  /* The house field, as LuddeAnalytics' date-and-time field (system_3
     #11018): AspInput takes no datetime-local (§3.85). 16px or more on a
     phone (§3.122 P9). */
  .hunt-end-form__input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    max-width: 22rem;
    min-height: var(--asp-input-height, 2.75rem);
    padding: 0 var(--space-sm);
    font: inherit;
    font-size: max(16px, var(--text-base));
    color: var(--text-on-light);
    background: var(--surface-elevated);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
  }

  .hunt-end-form__input:focus-visible {
    outline: none;
    border-color: var(--text-body);
    box-shadow: var(--shadow-focus);
  }

  .hunt-end-form__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  /* 16px or more on a phone only (§3.122 P9); wider, the house's small
     size, so the field fits the game's 240px side panel. */
  @media (min-width: 641px) {
    .hunt-end-form__input {
      font-size: var(--text-sm);
    }
  }

  /* In the dark Admin card. The view's own card rules are scoped to it and
     do not reach in here. */
  .hunt-end-form--card {
    color: var(--text-on-dark);
  }

  .hunt-end-form--card .hunt-end-form__heading {
    color: var(--text-heading-card);
    font-size: var(--text-base);
  }

  .hunt-end-form--card .hunt-end-form__note {
    color: var(--text-on-dark);
  }

  .hunt-end-form--card .hunt-end-form__error {
    color: var(--feedback-error-text-on-dark);
  }

  .hunt-end-form--card .hunt-end-form__actions {
    flex-direction: column-reverse;
  }

  .hunt-end-form--card .hunt-end-form__actions :deep(button) {
    width: 100%;
    white-space: normal;
  }
</style>
