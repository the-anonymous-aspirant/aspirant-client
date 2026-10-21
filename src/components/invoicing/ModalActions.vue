<template>
  <div class="modal-actions">
    <div v-if="$slots.destructive" class="modal-actions__destructive"><slot name="destructive" /></div>
    <div class="modal-actions__main"><slot /></div>
  </div>
</template>

<script>
  // One footer for every modal in the Invoices app (#8399 spec §7,
  // §3.114 decision 7). The default slot takes the secondary action(s) and
  // then the primary one, in that DOM order, so keyboard focus follows what a
  // wide screen shows: destructive alone at the left edge, the rest at the
  // right edge with the primary last. Below 640px the same DOM stacks in
  // reverse: primary, secondary, then the destructive action set apart.
  export default {
    name: 'ModalActions',
  };
</script>

<style scoped>
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
