<template>
  <div class="modal-footer">
    <!-- A refusal about no single field (system_3 #12298 ruling 2): one
         full-width line above the buttons, which never scroll away. It
         wraps and is never clamped; it is announced when it appears. -->
    <p v-if="refusal" class="modal-footer__refusal" role="alert" :data-test="refusalTest">{{ refusal }}</p>
    <div class="modal-actions">
      <div v-if="$slots.destructive" class="modal-actions__destructive"><slot name="destructive" /></div>
      <div class="modal-actions__main"><slot /></div>
    </div>
  </div>
</template>

<script>
  // One footer for every modal in the Invoices app (#8399 spec §7,
  // §3.114 decision 7). The default slot takes the secondary action(s) and
  // then the primary one, in that DOM order, so keyboard focus follows what a
  // wide screen shows: destructive alone at the left edge, the rest at the
  // right edge with the primary last. Below 640px the same DOM stacks in
  // reverse: primary, secondary, then the destructive action set apart.
  //
  // `refusal`: the dialog's line for a refused Save that names no field of
  // the form. While the "Close without saving?" ask shows, the dialog draws
  // the ask in place of this footer, so the line is not drawn; "Keep
  // editing" brings it back (§3.166 Decision 3).
  export default {
    name: 'ModalActions',
    props: {
      refusal: { type: String, default: '' },
      // The line's data-test: each dialog keeps the one its error had.
      refusalTest: { type: String, default: 'footer-refusal' },
    },
  };
</script>

<style scoped>
  .modal-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: 100%;
  }

  .modal-footer__refusal {
    margin: 0;
    color: var(--feedback-error);
    overflow-wrap: anywhere;
  }

  .modal-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    width: 100%;
  }

  .modal-actions__main {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-left: auto;
  }

  @media (max-width: 640px) {
    .modal-actions,
    .modal-actions__main {
      flex-direction: column-reverse;
      align-items: stretch;
      gap: var(--space-xs);
    }

    .modal-actions__main {
      margin-left: 0;
    }

    .modal-actions__destructive {
      display: flex;
      flex-direction: column;
      margin-top: var(--space-md);
    }

    .modal-actions :deep(button) {
      width: 100%;
    }
  }
</style>
