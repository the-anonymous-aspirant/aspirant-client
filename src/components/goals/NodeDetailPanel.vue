<template>
  <!-- #4518 (C11) sited hold — NOT ported to AspModal. This is an edge-anchored
       side sheet (node editor: colour, description, comments), not a centred
       dialog. AspModal's sizes are sm|md|lg|fullscreen — none an edge sheet —
       and overriding its teleported root to fake one is the #4447/#4448 anti-
       pattern (sixteen local override rules were deleted to escape it). Kept as
       the hand-rolled sheet with its v-overlay-history Back-close; the DS gap
       (an AspModal sheet/drawer variant) is filed as its own task. Rationale on
       task #4518. -->
  <transition name="panel-slide">
    <div v-if="node" v-overlay-history="() => $emit('close')" class="panel-overlay" @click.self="$emit('close')">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title-row">
            <span class="type-badge" :class="node.type">{{ typeLabel }}</span>
            <h2 class="panel-title">{{ node.name }}</h2>
          </div>
          <AspButton variant="ghost" size="icon" aria-label="Close" @click="$emit('close')">&times;</AspButton>
        </div>

        <div class="panel-body">
          <!-- Color picker -->
          <div class="field-row color-row">
            <label>Color</label>
            <input
              type="color"
              :value="displayColor"
              @change="onColorChange"
            />
            <span v-if="!node.color" class="inherited-badge">inherited</span>
            <AspTooltip v-if="node.color" content="Revert to inherited color">
              <AspButton variant="ghost" size="icon" aria-label="Revert to inherited color" @click="clearColor">&times;</AspButton>
            </AspTooltip>
          </div>

          <!-- Planned dates -->
          <div class="field-row">
            <label>Start</label>
            <input
              type="date"
              :value="node.planned_start || ''"
              @change="onFieldChange('planned_start', $event.target.value)"
            />
            <label>End</label>
            <input
              type="date"
              :value="node.planned_end || ''"
              @change="onFieldChange('planned_end', $event.target.value)"
            />
          </div>

          <!-- Completion status -->
          <div class="completion-section">
            <div class="completion-row">
              <!-- Ported, on a measurement rather than on the sibling's
                   decision. #4477 HELD a native checkbox on a near-white page
                   because AspCheckbox draws its box with --border-subtle, which
                   measures 1.26:1 there (DS defect #4482). This
                   control sits on --surface-card, dark in both themes, where the
                   native's #000 boundary measured 2.09:1 — under WCAG 1.4.11's
                   3:1 floor — and the DS box's near-white FILL carries the edge
                   instead of its border. The same component is wrong there and
                   right here; the surround decides, so each site is measured. -->
              <AspCheckbox
                class="completion-label"
                :model-value="!!node.completed_at"
                :label="completionText"
                :disabled="isAutoCompleted"
                @update:model-value="toggleCompletion"
              />
              <span v-if="isAutoCompleted" class="auto-badge">auto</span>
            </div>
            <p v-if="isAutoCompleted" class="completion-hint">
              Auto-completed because all children are done. Uncomplete a child to revert.
            </p>
          </div>

          <!-- Description: rendered markdown / edit mode -->
          <div class="description-section">
            <div class="description-header">
              <label>Description</label>
              <AspButton variant="secondary" size="sm" @click="toggleEdit">
                {{ editing ? 'Preview' : 'Edit' }}
              </AspButton>
            </div>
            <div v-if="editing" class="edit-mode">
              <!-- The wrapper carries the monospace, not the component: this
                   field holds Markdown source, and .field__textarea inherits its
                   font from AspTextarea's own .field root — so a rule here has
                   to reach past that, which :deep does and a class on the
                   component does not (AspTextarea sets inheritAttrs: false and
                   delivers class to the inner <textarea>, where no data-v from
                   this file lands). This is the one content property the DS
                   cannot know; the box is entirely the DS's. -->
              <div class="description-editor">
                <AspTextarea
                  v-model="editBody"
                  :rows="12"
                  :max-rows="30"
                  @keydown.ctrl.enter="saveDescription"
                  @keydown.meta.enter="saveDescription"
                />
              </div>
              <div class="edit-actions">
                <AspButton variant="secondary" @click="cancelEdit">Cancel</AspButton>
                <AspButton variant="primary" @click="saveDescription" :disabled="saving">
                  {{ saving ? 'Saving...' : 'Save' }}
                </AspButton>
              </div>
            </div>
            <div v-else class="markdown-body" v-html="renderedMarkdown"></div>
          </div>

          <!-- Comments -->
          <div class="comments-section">
            <h3>Comments ({{ comments.length }})</h3>
            <div v-if="commentsLoading" class="loading-text">Loading...</div>
            <div v-else-if="comments.length === 0" class="empty-text">No comments yet.</div>
            <div v-else class="comments-list">
              <div
                v-for="comment in comments"
                :key="comment.id"
                class="comment-item"
              >
                <div v-if="editingCommentId === comment.id" class="comment-edit">
                  <AspTextarea
                    v-model="editCommentBody"
                    :rows="3"
                    :max-rows="12"
                  />
                  <div class="comment-edit-actions">
                    <AspButton variant="secondary" size="sm" @click="cancelCommentEdit">Cancel</AspButton>
                    <AspButton
                      variant="primary"
                      size="sm"
                      @click="saveCommentEdit(comment.id)"
                      :disabled="!editCommentBody.trim()"
                    >Save</AspButton>
                  </div>
                </div>
                <div v-else>
                  <div class="comment-body" v-html="renderComment(comment.body)"></div>
                  <div class="comment-meta">
                    <span class="comment-date">{{ formatDate(comment.created_at) }}</span>
                    <!-- HELD native, both of them, and the gap is named rather
                         than worked around (#4513). These are text links, not
                         controls with a box: --text-muted ink at --text-xs,
                         padding: 0, underlined, sitting in the same run as the
                         date beside them. AspButton's variant validator is a
                         closed set — primary | secondary | ghost | destructive
                         (AspButton.vue:8) — and all four draw a padded box;
                         ghost is nearest and is still --space-2xs/--space-sm at
                         size="sm" with a --brand-primary-alpha hover fill. So
                         the port would swap two underlined words for two pills
                         inside a metadata line. What is missing is a `link`
                         variant in the DS — filed as DS gap #4514, so this
                         hold has an owner rather than being a note that stops
                         here. Until it lands this is a decision, not an
                         unfinished migration. The file's other five
                         controls ARE AspButton — see the Save above. -->
                    <button class="btn-link" @click="startCommentEdit(comment)">edit</button>
                    <button class="btn-link btn-danger" @click="removeComment(comment.id)">delete</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Add comment -->
            <div class="add-comment">
              <!-- Wrapper, because .add-comment is a flex column with
                   align-items: flex-end (to right-align Post). Cross-axis
                   alignment shrinks every item to its content width, and
                   AspTextarea's root is a flex item like any other — measured,
                   the composer came out 190px in a 430px panel. A class on the
                   component cannot fix it: inheritAttrs is false there and
                   class rides $attrs to the inner <textarea>. -->
              <div class="composer-field">
                <AspTextarea
                  v-model="newCommentBody"
                  placeholder="Add a comment..."
                  :rows="2"
                  :max-rows="10"
                />
              </div>
              <AspButton
                variant="primary"
                size="sm"
                @click="submitComment"
                :disabled="!newCommentBody.trim()"
              >Post</AspButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
import { ref, computed, watch } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { AspButton, AspCheckbox, AspTextarea, AspTooltip } from '@aspirant/design-system';
import { useGoalComments } from '../../composables/goals/useGoalComments.js';

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  if (!text) return '<p class="empty-text">No description.</p>';
  return DOMPurify.sanitize(marked.parse(text));
}

export default {
  components: { AspButton, AspCheckbox, AspTextarea, AspTooltip },
  props: {
    node: { type: Object, default: null },
    treeId: { type: [String, Number], required: true },
  },
  emits: ['close', 'node-updated'],
  setup(props, { emit }) {
    const editing = ref(false);
    const editBody = ref('');
    const saving = ref(false);

    const nodeIdRef = computed(() => props.node?.id);
    const { comments, loading: commentsLoading, fetchComments, addComment, updateComment, deleteComment } =
      useGoalComments(nodeIdRef);

    const newCommentBody = ref('');
    const editingCommentId = ref(null);
    const editCommentBody = ref('');

    const typeLabel = computed(() => {
      const labels = { goal: 'Goal', milestone: 'Milestone', step: 'Step' };
      return labels[props.node?.type] || props.node?.type || '';
    });

    const displayColor = computed(() => {
      return props.node?.color || props.node?.resolved_color || '#ffb300';
    });

    const isAutoCompleted = computed(() => {
      return !!props.node?.completed_at && !props.node?.manual_complete;
    });

    const completionText = computed(() => {
      if (!props.node?.completed_at) return 'Mark complete';
      if (props.node.manual_complete) return 'Completed (manual)';
      return 'Completed (auto)';
    });

    const renderedMarkdown = computed(() => renderMarkdown(props.node?.description));

    watch(() => props.node?.id, (newId) => {
      if (newId) {
        editing.value = false;
        fetchComments();
      }
    }, { immediate: true });

    function toggleEdit() {
      if (!editing.value) {
        editBody.value = props.node?.description || '';
        editing.value = true;
      } else {
        editing.value = false;
      }
    }

    function cancelEdit() {
      editing.value = false;
    }

    async function saveDescription() {
      saving.value = true;
      try {
        const axios = (await import('axios')).default;
        await axios.patch(
          `/api/goals/trees/${props.treeId}/nodes/${props.node.id}`,
          { description: editBody.value }
        );
        emit('node-updated');
        editing.value = false;
      } catch (err) {
        console.error('Failed to save description:', err);
      }
      saving.value = false;
    }

    async function onColorChange(event) {
      try {
        const axios = (await import('axios')).default;
        await axios.patch(
          `/api/goals/trees/${props.treeId}/nodes/${props.node.id}`,
          { color: event.target.value }
        );
        emit('node-updated');
      } catch (err) {
        console.error('Failed to save color:', err);
      }
    }

    async function clearColor() {
      try {
        const axios = (await import('axios')).default;
        await axios.patch(
          `/api/goals/trees/${props.treeId}/nodes/${props.node.id}`,
          { color: '' }
        );
        emit('node-updated');
      } catch (err) {
        console.error('Failed to clear color:', err);
      }
    }

    async function onFieldChange(field, value) {
      try {
        const axios = (await import('axios')).default;
        const payload = {};
        if ((field === 'planned_start' || field === 'planned_end') && value) {
          payload[field] = value + 'T00:00:00Z';
        } else {
          payload[field] = value || null;
        }
        await axios.patch(
          `/api/goals/trees/${props.treeId}/nodes/${props.node.id}`,
          payload
        );
        emit('node-updated');
      } catch (err) {
        console.error(`Failed to save ${field}:`, err);
      }
    }

    async function toggleCompletion() {
      try {
        const axios = (await import('axios')).default;
        if (props.node.completed_at) {
          await axios.post(
            `/api/goals/trees/${props.treeId}/nodes/${props.node.id}/uncomplete`
          );
        } else {
          await axios.post(
            `/api/goals/trees/${props.treeId}/nodes/${props.node.id}/complete`,
            { manual_complete: true }
          );
        }
        emit('node-updated');
      } catch (err) {
        console.error('Failed to toggle completion:', err);
      }
    }

    function renderComment(body) {
      return DOMPurify.sanitize(marked.parse(body || ''));
    }

    function formatDate(dateStr) {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    }

    async function submitComment() {
      if (!newCommentBody.value.trim()) return;
      await addComment(newCommentBody.value.trim());
      newCommentBody.value = '';
    }

    function startCommentEdit(comment) {
      editingCommentId.value = comment.id;
      editCommentBody.value = comment.body;
    }

    function cancelCommentEdit() {
      editingCommentId.value = null;
      editCommentBody.value = '';
    }

    async function saveCommentEdit(commentId) {
      if (!editCommentBody.value.trim()) return;
      await updateComment(commentId, editCommentBody.value.trim());
      editingCommentId.value = null;
      editCommentBody.value = '';
    }

    async function removeComment(commentId) {
      await deleteComment(commentId);
    }

    return {
      editing,
      editBody,
      saving,
      comments,
      commentsLoading,
      newCommentBody,
      editingCommentId,
      editCommentBody,
      typeLabel,
      displayColor,
      isAutoCompleted,
      completionText,
      renderedMarkdown,
      toggleEdit,
      cancelEdit,
      saveDescription,
      onColorChange,
      clearColor,
      onFieldChange,
      toggleCompletion,
      renderComment,
      formatDate,
      submitComment,
      startCommentEdit,
      cancelCommentEdit,
      saveCommentEdit,
      removeComment,
    };
  },
};
</script>

<style scoped>
.panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.panel {
  /* Dark card on a light page — declare the ink polarity for the DS's
     currentColor-relative components. See TimelineFilter.vue. #4443 */
  color: var(--text-on-dark);
  width: 480px;
  max-width: 90vw;
  height: 100vh;
  background-color: var(--surface-card);
  border-left: 2px solid var(--border-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-lg);
  border-bottom: 1px solid var(--border-card);
  flex-shrink: 0;
}

.panel-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  min-width: 0;
}

.panel-title {
  color: var(--text-on-dark);
  font-size: var(--text-lg);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.type-badge.goal { background: #ffb300; color: #1a1a1a; }
.type-badge.milestone { background: #7c4dff; color: #fff; }
.type-badge.step { background: #26a69a; color: #fff; }

/* The header close and the colour-revert control are AspButton
   variant="ghost" size="icon" — the DS owns their paint, hover, focus ring and
   the 44px square touch target (§3.23 rule-4). No local rule may target them:
   a scoped button rule lands on the DS root element and overrides it, the port
   hazard #4323 and #4324 both measured live. */

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.field-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.field-row label {
  color: var(--text-muted);
  font-size: var(--text-sm);
  min-width: 40px;
}
.field-row input[type="date"] {
  flex: 1;
  padding: var(--space-xs);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
}
.field-row input[type="color"] {
  width: 36px;
  height: 28px;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: 0;
}

.color-row {
  flex-wrap: wrap;
}

.inherited-badge {
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-muted);
  font-style: italic;
}


/* Completion */
.completion-section {
  padding: var(--space-sm) 0;
}
.completion-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
/* AspCheckbox is its own <label>, sets its own flex row, gap, --text-sm and
   pointer, and takes `color: inherit` — so the only declaration left with no DS
   equivalent is this panel's ink, which the component must inherit from
   somewhere. It rides the class AspCheckbox puts on its root (inheritAttrs is
   on there, unlike AspTextarea's).

   `.completion-label input[type="checkbox"]` is gone and had to be: it is an
   attribute selector, so it would still have matched the input AspCheckbox
   renders inside its own label and overridden .checkbox__box's 1rem sizing —
   a consumer rule silently outranking the DS on the very box being adopted. */
.completion-label {
  color: var(--text-on-dark);
}
.auto-badge {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-card-inner);
  color: var(--text-muted);
}
.completion-hint {
  color: var(--text-muted);
  font-size: var(--text-xs, 0.75rem);
  margin: var(--space-xs) 0 0 0;
}

/* Description */
.description-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.description-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.description-header label {
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

/* Was .description-textarea, hand-painting the box on --surface-card-inner.
   AspTextarea paints it now (--surface-elevated fill, --text-body ink,
   --border-control at the WCAG 1.4.11 3:1 floor) and this file's data-v cannot
   reach the real <textarea> in any case. Only the monospace survives, because
   it is what the field CONTAINS (Markdown source), not how the control looks. */
.description-editor :deep(.field__textarea) {
  font-family: monospace;
  line-height: 1.5;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.markdown-body {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  line-height: 1.6;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  background: var(--surface-card-inner);
  min-height: 60px;
  overflow-wrap: break-word;
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: var(--text-heading-card);
  margin: 0.8em 0 0.4em;
}
.markdown-body :deep(h1) { font-size: 1.2em; }
.markdown-body :deep(h2) { font-size: 1.1em; }
.markdown-body :deep(h3) { font-size: 1em; }
.markdown-body :deep(p) { margin: 0.4em 0; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) { padding-left: 1.5em; margin: 0.4em 0; }
.markdown-body :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
.markdown-body :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  overflow-x: auto;
}
.markdown-body :deep(a) { color: var(--brand-primary); }

/* Comments */
.comments-section {
  border-top: 1px solid var(--border-card);
  padding-top: var(--space-lg);
}
.comments-section h3 {
  color: var(--text-heading-card);
  font-size: var(--text-base);
  margin: 0 0 var(--space-md) 0;
}
.comments-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}
.comment-item {
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  background: var(--surface-card-inner);
}
.comment-body {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  line-height: 1.5;
}
.comment-body :deep(p) { margin: 0.2em 0; }
.comment-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}
.comment-date {
  color: var(--text-muted);
  font-size: var(--text-xs, 0.75rem);
}
.btn-link {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--text-xs, 0.75rem);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.btn-link:hover { color: var(--text-on-dark); }
.btn-link.btn-danger:hover { color: var(--feedback-error); }

/* .comment-textarea is gone with the two natives it painted — both composers
   are AspTextarea now and nothing here is left for a consumer to say. */

.comment-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.add-comment {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  align-items: flex-end;
}
/* `align-items: flex-end` above right-aligns the Post button, and it shrinks
   every other item in the column to its content width along with it — which is
   what the old `.comment-textarea { width: 100% }` was quietly undoing. The
   wrapper takes over that job for the DS control. */
.composer-field {
  width: 100%;
}

.loading-text, .empty-text {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* Transition */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform var(--transition-moderate), opacity var(--transition-moderate);
}
.panel-slide-enter-active .panel,
.panel-slide-leave-active .panel {
  transition: transform var(--transition-moderate);
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
}
.panel-slide-enter-from .panel,
.panel-slide-leave-to .panel {
  transform: translateX(100%);
}
</style>
