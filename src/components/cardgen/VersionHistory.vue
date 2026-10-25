<template>
  <section class="version-history" data-test="version-history">
    <h3>History</h3>
    <p v-if="error" class="load-error" data-test="history-error">{{ error }}</p>
    <p v-else-if="!versions" class="muted">Reading versions…</p>
    <ol v-else class="versions">
      <li v-for="v in versions" :key="v.version_no" class="version" :data-test="`version-${v.version_no}`">
        <span class="version-no">v{{ v.version_no }}</span>
        <AspBadge v-if="v.version_no === currentVersionNo" status="positive" size="sm" data-test="version-current">current</AspBadge>
        <span class="version-note">{{ v.note || 'no note' }}</span>
        <span class="muted"><time :datetime="v.created_at" :title="v.created_at">{{ relativeTime(v.created_at) }}</time> · {{ actorLabel(v.created_by_user_id, undefined, v.created_by_name) }}</span>
        <AspButton
          v-if="v.version_no !== currentVersionNo"
          variant="secondary"
          size="sm"
          type="button"
          :loading="restoring === v.version_no"
          :data-test="`restore-${v.version_no}`"
          @click="restore(v.version_no)"
        >
          Restore
        </AspButton>
      </li>
    </ol>
    <p v-if="restoreError" class="load-error" data-test="restore-error">{{ restoreError }}</p>
  </section>
</template>

<script>
// system_3 #8634 / #8650: the version list of a template (or, in C2, a card)
// with Restore on every non-current row. The owner supplies the two calls, so
// the component knows nothing about which table it lists.
import { AspBadge, AspButton } from '@aspirant/design-system';
import { actorLabel, relativeTime } from '@/lib/cardgen/format.js';

export default {
  name: 'VersionHistory',
  components: { AspBadge, AspButton },
  props: {
    /** () => Promise<{versions, current_version_no?, error}> */
    load: { type: Function, required: true },
    /** (n) => Promise<{version, error}> */
    restorer: { type: Function, required: true },
    currentVersionNo: { type: Number, default: 0 },
    /** Bump to make the list reload (the owner saved). */
    reloadKey: { type: Number, default: 0 },
  },
  emits: ['restored'],
  data() {
    return { versions: null, error: null, restoring: 0, restoreError: null };
  },
  watch: {
    reloadKey: 'refresh',
  },
  mounted() {
    this.refresh();
  },
  methods: {
    actorLabel,
    relativeTime,
    async refresh() {
      const { versions, error } = await this.load();
      this.error = error;
      this.versions = error ? [] : [...versions].sort((a, b) => b.version_no - a.version_no);
    },
    async restore(n) {
      this.restoring = n;
      this.restoreError = null;
      const { version, error } = await this.restorer(n);
      this.restoring = 0;
      if (error) {
        this.restoreError = error;
        return;
      }
      this.$emit('restored', version);
      await this.refresh();
    },
  },
};
</script>

<style scoped>
.version-history h3 {
  font-size: var(--text-md, 1rem);
  margin: 0 0 var(--space-2, 8px);
}
.versions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2, 8px);
}
.version {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  align-items: center;
}
.version-no {
  font-weight: 600;
  min-width: 2.5em;
}
.muted {
  color: var(--text-muted);
  font-size: var(--text-sm);
}
.load-error {
  color: var(--status-negative, currentColor);
}
</style>
