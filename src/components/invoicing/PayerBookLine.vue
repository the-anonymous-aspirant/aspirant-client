<template>
  <!-- §3.142 Decision 3: before saving, say what the save will do with the
       name. Shared by the hand-entry dialog and the payers dialog (§3.47). -->
  <p v-if="line" class="payer-line" :data-test="`${testPrefix}-line`">{{ line }}</p>
  <!-- system_3 #12319: a later row of a name a row above adds can still be
       a second person, without changing the name the invoice prints. -->
  <div v-if="repeat === 'joined'" class="payer-choices" :data-test="`${testPrefix}-choices`">
    <AspButton variant="ghost" size="sm" :data-test="`${testPrefix}-add-second`" @click="$emit('add-second')">
      Add as a second {{ name.trim() }}
    </AspButton>
  </div>
  <div v-else-if="choosing" class="payer-choices" :data-test="`${testPrefix}-choices`">
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
      // "Add “…” as a new client" was chosen for a close name: the choice is
      // shown as made and its buttons go, as after "Use" (system_3 #12319,
      // ruling 5). Typing in the field opens it again (the parent resets it).
      asNew: { type: Boolean, default: false },
      // In "Add payers": 'joined' when an earlier ticked row adds the same new
      // name, so one client is added for both; 'second' when ze chose "Add as
      // a second …" on such a row. '' otherwise.
      repeat: { type: String, default: '' },
      // A joined row whose PayPal email differs from the one the client keeps.
      keepsFirstEmail: { type: Boolean, default: false },
    },
    emits: ['use', 'add-new', 'add-second'],
    computed: {
      choosing() {
        return this.match.state === 'close' && !this.asNew && !this.repeat;
      },
      line() {
        if (this.repeat === 'joined') {
          const line = 'Same name as a row above: one client is added for all of them.';
          return this.keepsFirstEmail ? `${line} The client keeps the first row's PayPal email.` : line;
        }
        if (this.repeat === 'second') return `Save adds a second “${this.name.trim()}”.`;
        if (this.match.state === 'close' && this.asNew) return `Save adds “${this.name.trim()}” as a new client.`;
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
