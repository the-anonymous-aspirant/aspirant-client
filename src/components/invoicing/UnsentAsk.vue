<template>
  <!-- The footer's ask (system_3 #11632, §3.166, cited as #11629): one line
       and two buttons in place of the dialog's own actions. The line is
       announced when it appears; focus goes to "Keep editing". -->
  <div class="unsent-ask" data-test="unsent-ask">
    <p class="unsent-ask__line" role="alert" data-test="unsent-ask-line">
      Close without saving? What is not saved yet will be lost.
    </p>
    <ModalActions>
      <template #destructive>
        <AspButton variant="destructive" data-test="unsent-discard" @click="$emit('discard')">Discard changes</AspButton>
      </template>
      <AspButton ref="keep" variant="primary" data-test="unsent-keep" @click="$emit('keep')">Keep editing</AspButton>
    </ModalActions>
  </div>
</template>

<script>
  import { AspButton } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';

  export default {
    name: 'UnsentAsk',
    components: { AspButton, ModalActions },
    emits: ['keep', 'discard'],
    mounted() {
      this.$nextTick(() => {
        const keep = this.$el.querySelector('[data-test="unsent-keep"]');
        if (keep) keep.focus();
      });
    },
  };
</script>

<style scoped>
  .unsent-ask {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    width: 100%;
  }

  .unsent-ask__line {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
