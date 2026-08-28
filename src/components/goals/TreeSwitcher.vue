<template>
  <div class="tree-switcher" ref="switcherRef">
    <!-- Ported from a hand-painted native <button> (#4513). The native set
         --surface-card-inner / --border-card / --text-on-dark by hand, which is
         a consumer-side re-draw of variant="secondary" — so the port hands the
         paint back to the DS and keeps only the 240px cap, which is layout the
         DS cannot know. The disclosure arrow rides #iconRight (the DS slot for
         exactly this), so `.btn__label` still owns the name and the arrow stays
         out of the accessible name. The port also ADDS aria-haspopup and
         aria-expanded: the native announced nothing about the menu it opens. -->
    <AspButton
      variant="secondary"
      class="switcher-trigger"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      @click="toggleDropdown"
    >
      {{ activeTreeName || 'Select tree' }}
      <template #iconRight>
        <span class="trigger-arrow" :class="{ open: isOpen }">&#9662;</span>
      </template>
    </AspButton>

    <div v-if="isOpen" class="switcher-dropdown">
      <div class="dropdown-list">
        <div
          v-for="tree in trees"
          :key="tree.id"
          class="dropdown-item"
          :class="{ active: tree.id === activeTreeId }"
          @click="switchTree(tree)"
        >
          <span class="item-name">{{ tree.name }}</span>
          <div class="item-actions" @click.stop>
            <AspTooltip content="Rename">
              <AspButton variant="ghost" size="icon" aria-label="Rename" @click="startRename(tree)">&#9998;</AspButton>
            </AspTooltip>
            <AspTooltip content="Delete">
              <AspButton variant="ghost" size="icon" aria-label="Delete" @click="startDelete(tree)">&#10005;</AspButton>
            </AspTooltip>
          </div>
        </div>
        <div v-if="trees.length === 0 && !loadingTrees" class="dropdown-empty">
          No trees yet
        </div>
        <div v-if="loadingTrees" class="dropdown-empty">Loading...</div>
      </div>
      <!-- HELD native, and the reason is the box, not the label (#4513). This
           is the footer row of .dropdown-list: full-bleed, left-aligned, and
           separated by a border-top from the rows above it — a menu affordance,
           the same shape as ValuationStatement's .row-menu-item set. AspButton
           is a centred inline-flex pill with its own radius and padding; every
           one of its four variants draws that box (the variant validator is a
           closed set, AspButton.vue:8), so the port would put a pill inside a
           list of rows. The DS has no menu/menuitem primitive — that gap, not
           this call site, is what has to close first. -->
      <button class="btn-new-tree" @click="startCreate">+ New Tree</button>
    </div>

    <!-- Rename dialog -->
    <div v-if="showRename" v-overlay-history="cancelRename" class="dialog-overlay" @click.self="cancelRename">
      <div class="dialog">
        <h3>Rename Tree</h3>
        <!-- The ref stays exactly as it was, and that is the point: with
             AspInput's defineExpose (#4303) `renameInput.value.focus()` and
             `.select()` reach the inner <input> unchanged. Without it the ref
             would resolve to the component instance and both calls would be
             silent no-ops — the caret would simply stop landing here, and no
             assertion in this repo would have noticed. There is one now. -->
        <AspInput
          ref="renameInput"
          v-model="renameValue"
          placeholder="New name"
          maxlength="100"
          @keyup.enter="submitRename"
          @keyup.escape="cancelRename"
        />
        <div v-if="renameError" class="error-text">{{ renameError }}</div>
        <div class="dialog-actions">
          <AspButton variant="secondary" @click="cancelRename">Cancel</AspButton>
          <AspButton
            variant="primary"
            @click="submitRename"
            :disabled="renaming || !renameValue.trim()"
          >
            {{ renaming ? 'Saving...' : 'Rename' }}
          </AspButton>
        </div>
      </div>
    </div>

    <!-- Create dialog -->
    <div v-if="showCreate" v-overlay-history="cancelCreate" class="dialog-overlay" @click.self="cancelCreate">
      <div class="dialog">
        <h3>New Tree</h3>
        <AspInput
          ref="createInput"
          v-model="createValue"
          placeholder="Tree name"
          maxlength="100"
          @keyup.enter="submitCreate"
          @keyup.escape="cancelCreate"
        />
        <div v-if="createError" class="error-text">{{ createError }}</div>
        <div class="dialog-actions">
          <AspButton variant="secondary" @click="cancelCreate">Cancel</AspButton>
          <AspButton
            variant="primary"
            @click="submitCreate"
            :disabled="creating || !createValue.trim()"
          >
            {{ creating ? 'Creating...' : 'Create' }}
          </AspButton>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div v-if="showDelete" v-overlay-history="cancelDelete" class="dialog-overlay" @click.self="cancelDelete">
      <div class="dialog">
        <h3>Delete Tree</h3>
        <p class="dialog-message">
          Delete <strong>{{ deleteTarget?.name }}</strong>? All nodes and comments will be removed.
        </p>
        <div v-if="deleteError" class="error-text">{{ deleteError }}</div>
        <div class="dialog-actions">
          <AspButton variant="secondary" @click="cancelDelete">Cancel</AspButton>
          <AspButton variant="destructive" @click="submitDelete" :disabled="deleting">
            {{ deleting ? 'Deleting...' : 'Delete' }}
          </AspButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { AspInput } from '@aspirant/design-system';

import axios from 'axios';
import { AspButton, AspTooltip } from '@aspirant/design-system';

export default {
  components: { AspButton, AspInput, AspTooltip },
  props: {
    activeTreeId: { type: String, default: null },
  },
  emits: ['tree-switched', 'tree-renamed', 'tree-created', 'tree-deleted'],
  setup(props, { emit }) {
    const router = useRouter();
    const switcherRef = ref(null);

    const isOpen = ref(false);
    const trees = ref([]);
    const loadingTrees = ref(false);
    const activeTreeName = ref('');

    const showRename = ref(false);
    const renameTarget = ref(null);
    const renameValue = ref('');
    const renaming = ref(false);
    const renameError = ref(null);
    const renameInput = ref(null);

    const showCreate = ref(false);
    const createValue = ref('');
    const creating = ref(false);
    const createError = ref(null);
    const createInput = ref(null);

    const showDelete = ref(false);
    const deleteTarget = ref(null);
    const deleting = ref(false);
    const deleteError = ref(null);

    async function fetchTrees() {
      loadingTrees.value = true;
      try {
        const resp = await axios.get('/api/goals/trees');
        trees.value = resp.data || [];
        updateActiveTreeName();
      } catch (err) {
        trees.value = [];
      }
      loadingTrees.value = false;
    }

    function updateActiveTreeName() {
      const active = trees.value.find((t) => t.id === props.activeTreeId);
      activeTreeName.value = active?.name || '';
    }

    function toggleDropdown() {
      isOpen.value = !isOpen.value;
      if (isOpen.value) fetchTrees();
    }

    function handleClickOutside(e) {
      if (switcherRef.value && !switcherRef.value.contains(e.target)) {
        isOpen.value = false;
      }
    }

    function switchTree(tree) {
      if (tree.id === props.activeTreeId) {
        isOpen.value = false;
        return;
      }
      isOpen.value = false;
      router.push(`/member/shared/goals/${tree.id}`);
      emit('tree-switched', tree.id);
    }

    // Rename
    function startRename(tree) {
      renameTarget.value = tree;
      renameValue.value = tree.name;
      renameError.value = null;
      showRename.value = true;
      isOpen.value = false;
      nextTick(() => {
        renameInput.value?.focus();
        renameInput.value?.select();
      });
    }

    async function submitRename() {
      if (!renameValue.value.trim() || !renameTarget.value) return;
      renaming.value = true;
      renameError.value = null;
      try {
        await axios.patch(`/api/goals/trees/${renameTarget.value.id}`, {
          name: renameValue.value.trim(),
        });
        showRename.value = false;
        await fetchTrees();
        emit('tree-renamed', renameTarget.value.id, renameValue.value.trim());
        renameTarget.value = null;
        renameValue.value = '';
      } catch (err) {
        renameError.value = err.response?.data?.error?.message || err.message;
      }
      renaming.value = false;
    }

    function cancelRename() {
      showRename.value = false;
      renameTarget.value = null;
      renameValue.value = '';
      renameError.value = null;
    }

    // Create
    function startCreate() {
      createValue.value = '';
      createError.value = null;
      showCreate.value = true;
      isOpen.value = false;
      nextTick(() => createInput.value?.focus());
    }

    async function submitCreate() {
      if (!createValue.value.trim()) return;
      creating.value = true;
      createError.value = null;
      try {
        const resp = await axios.post('/api/goals/trees', { name: createValue.value.trim() });
        showCreate.value = false;
        createValue.value = '';
        await fetchTrees();
        const newTree = resp.data;
        router.push(`/member/shared/goals/${newTree.id}`);
        emit('tree-created', newTree.id);
      } catch (err) {
        createError.value = err.response?.data?.error?.message || err.message;
      }
      creating.value = false;
    }

    function cancelCreate() {
      showCreate.value = false;
      createValue.value = '';
      createError.value = null;
    }

    // Delete
    function startDelete(tree) {
      deleteTarget.value = tree;
      deleteError.value = null;
      showDelete.value = true;
      isOpen.value = false;
    }

    async function submitDelete() {
      if (!deleteTarget.value) return;
      deleting.value = true;
      deleteError.value = null;
      try {
        await axios.delete(`/api/goals/trees/${deleteTarget.value.id}`);
        const deletedId = deleteTarget.value.id;
        showDelete.value = false;
        deleteTarget.value = null;
        await fetchTrees();
        emit('tree-deleted', deletedId);
        if (deletedId === props.activeTreeId) {
          if (trees.value.length > 0) {
            router.push(`/member/shared/goals/${trees.value[0].id}`);
          } else {
            router.push('/member/shared/goals');
          }
        }
      } catch (err) {
        deleteError.value = err.response?.data?.error?.message || err.message;
      }
      deleting.value = false;
    }

    function cancelDelete() {
      showDelete.value = false;
      deleteTarget.value = null;
      deleteError.value = null;
    }

    watch(() => props.activeTreeId, updateActiveTreeName);

    onMounted(() => {
      document.addEventListener('click', handleClickOutside);
      fetchTrees();
    });

    onBeforeUnmount(() => {
      document.removeEventListener('click', handleClickOutside);
    });

    return {
      switcherRef,
      isOpen,
      trees,
      loadingTrees,
      activeTreeName,
      toggleDropdown,
      switchTree,

      showRename,
      renameTarget,
      renameValue,
      renaming,
      renameError,
      renameInput,
      startRename,
      submitRename,
      cancelRename,

      showCreate,
      createValue,
      creating,
      createError,
      createInput,
      startCreate,
      submitCreate,
      cancelCreate,

      showDelete,
      deleteTarget,
      deleting,
      deleteError,
      startDelete,
      submitDelete,
      cancelDelete,
    };
  },
};
</script>

<style scoped>
.tree-switcher {
  position: relative;
}

/* Layout only — the paint left with the native (#4513). AspButton
   variant="secondary" brings an opaque --surface-elevated fill and --text-body
   ink, so it resolves in both themes on its own and needs nothing from here;
   what it cannot know is that a tree name is user-entered and unbounded, hence
   the cap. .btn is inline-flex and .btn__label carries no DS rule at all, so
   the ellipsis has to be set on that span: a flex item will not shrink below
   its content without min-width: 0, and without the shrink there is nothing
   for text-overflow to clip. `.trigger-label` is gone with it — the name now
   rides the default slot, i.e. .btn__label itself. */
.switcher-trigger {
  max-width: 240px;
}

.switcher-trigger :deep(.btn__label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-arrow {
  font-size: var(--text-xs);
  color: var(--text-muted);
  transition: transform var(--transition-moderate);
}

.trigger-arrow.open {
  transform: rotate(180deg);
}

.switcher-dropdown {
  /* Dark card on a light page — declare the ink polarity so the DS's
     currentColor-relative components resolve light. Without it AspButton
     variant="ghost" mixes brand-primary-800 into DARK inherited ink and the
     row actions render at 1.08:1, i.e. invisible. See .timeline-filter. #4443 */
  color: var(--text-on-dark);
  position: absolute;
  top: calc(100% + var(--space-xs));
  left: 0;
  min-width: 260px;
  max-width: 320px;
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 100;
  overflow: hidden;
}

.dropdown-list {
  max-height: 280px;
  overflow-y: auto;
  padding: var(--space-xs);
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-moderate);
}

.dropdown-item:hover {
  background-color: var(--surface-card-inner);
}

.dropdown-item.active {
  background-color: var(--surface-card-inner);
  border-left: 3px solid var(--brand-primary);
  padding-left: calc(var(--space-md) - 3px);
}

.item-name {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.dropdown-item.active .item-name {
  color: var(--brand-primary);
  font-weight: 600;
}

.item-actions {
  display: flex;
  gap: var(--space-2xs);
  opacity: 0;
  transition: opacity var(--transition-moderate);
}

.dropdown-item:hover .item-actions {
  opacity: 1;
}

/* The rename/delete row actions are AspButton variant="ghost" size="icon" —
   DS-owned paint, hover and 44px square. Deliberately NOT restyled locally: a
   scoped rule here would reach the DS root element and override the size pin.
   The delete action loses its local red hover; destructive intent is carried
   by the AspTooltip label and the confirm dialog, not by a hover tint. */

.dropdown-empty {
  color: var(--text-muted);
  font-size: var(--text-sm);
  padding: var(--space-md);
  text-align: center;
}

.btn-new-tree {
  display: block;
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: none;
  border: none;
  border-top: 1px solid var(--border-card);
  color: var(--brand-primary);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--transition-moderate);
}

.btn-new-tree:hover {
  background-color: var(--surface-card-inner);
}

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 90%;
  max-width: 400px;
}

.dialog h3 {
  color: var(--text-heading-card);
  font-size: var(--text-lg);
  margin: 0 0 var(--space-md) 0;
}

/* §3.86: an always-live data-entry control on a dark card adopts the DS control
   fill. Both fields are AspInput now, so the rule that painted this dialog's
   well by hand is gone rather than retuned — there is no native <input> left in
   the dialog for it to reach.

   What actually changes, measured on the built page rather than assumed: the
   old box was a 1px --border-card (#ffb300, amber) around a translucent
   --surface-card-inner well; the new one is the DS control, --surface-elevated
   behind --text-body. Both clear the WCAG 1.4.11 3:1 non-text floor, and they
   clear it by DIFFERENT mechanisms in each theme — in light the near-white fill
   carries the boundary against the #424242 card at 9.55:1 while the border
   alone is 2.21:1; in dark the fill goes to 1.14:1 and the #cccccc border
   carries it at 8.94:1. So this is a design-of-record adoption, not a contrast
   fix: the old boundary was legible too. Value ink measures 9.55:1 light /
   9.57:1 dark either way. */

.dialog-message {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  margin: 0 0 var(--space-md) 0;
  line-height: 1.5;
}

.error-text {
  color: var(--feedback-error);
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}


</style>
