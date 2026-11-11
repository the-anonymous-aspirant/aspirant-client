<template>
  <!-- §3.142 Decision 3: before saving, say what the save will do with the
       name. Shared by the hand-entry dialog and the payers dialog (§3.47). -->
  <p v-if="line" class="payer-line" :data-test="`${testPrefix}-line`">{{ line }}</p>
  <div v-if="match.state === 'close'" class="payer-choices" :data-test="`${testPrefix}-choices`">
    <AspButton
      v-for="c in match.candidates"
      :key="c.id"
      variant="ghost"
      size="sm"
      :data-test="`${testPrefix}-use-${c.id}`"
      @click="$emit('use', c)"
    >
      Use {{ c.name }}
    </AspButton>
    <AspButton variant="ghost" size="sm" :data-test="`${testPrefix}-add-new`" @click="$emit('add-new')">
      Add “{{ name.trim() }}” as a new client
    </AspButton>
  </div>
</template>

<script>
  import { AspButton } from '@aspirant/design-system';

  export default {
    name: 'PayerBookLine',
    components: { AspButton },
    props: {
      // matchPayer()'s result for `name` against the book (payerMatch.js).
      match: { type: Object, required: true },
      name: { type: String, default: '' },
      // The new-name line names the surface's own save act.
      newLine: { type: String, default: 'Not in your client book yet: Save adds it.' },
      testPrefix: { type: String, default: 'payer' },
    },
    emits: ['use', 'add-new'],
    computed: {
      line() {
        switch (this.match.state) {
          case 'same':
            return 'In your client book.';
          case 'new':
            return this.newLine;
          case 'close':
            return 'Close to a client in your book:';
          default:
            return '';
        }
      },
    },
  };
</script>

<style scoped>
  .payer-line {
    margin: var(--space-2xs) 0 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .payer-choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
  }
</style>
