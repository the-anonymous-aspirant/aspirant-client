<template>
  <transition name="panel-slide">
    <div v-if="node" class="panel-overlay" @click.self="$emit('close')">
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title-row">
            <span class="type-badge" :class="node.type">{{ typeLabel }}</span>
            <h2 class="panel-title">{{ node.name }}</h2>
          </div>
          <button class="btn-close" @click="$emit('close')">&times;</button>
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
            <button
              v-if="node.color"
              class="btn-clear-color"
              @click="clearColor"
              title="Revert to inherited color"
            >&times;</button>
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
              <label class="completion-label">
                <input
                  type="checkbox"
                  :checked="!!node.completed_at"
                  @change="toggleCompletion"
                  :disabled="isAutoCompleted"
                />
                <span>{{ completionText }}</span>
              </label>
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
              <button class="btn-toggle-edit" @click="toggleEdit">
                {{ editing ? 'Preview' : 'Edit' }}
              </button>
            </div>
            <div v-if="editing" class="edit-mode">
              <textarea
                v-model="editBody"
                class="description-textarea"
                rows="12"
                @keydown.ctrl.enter="saveDescription"
                @keydown.meta.enter="saveDescription"
              ></textarea>
              <div class="edit-actions">
                <button class="btn-cancel" @click="cancelEdit">Cancel</button>
                <button class="btn-confirm" @click="saveDescription" :disabled="saving">
                  {{ saving ? 'Saving...' : 'Save' }}
                </button>
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
                  <textarea
                    v-model="editCommentBody"
                    rows="3"
                    class="comment-textarea"
                  ></textarea>
                  <div class="comment-edit-actions">
                    <button class="btn-cancel btn-sm" @click="cancelCommentEdit">Cancel</button>
                    <button
                      class="btn-confirm btn-sm"
                      @click="saveCommentEdit(comment.id)"
                      :disabled="!editCommentBody.trim()"
                    >Save</button>
                  </div>
                </div>
                <div v-else>
                  <div class="comment-body" v-html="renderComment(comment.body)"></div>
                  <div class="comment-meta">
                    <span class="comment-date">{{ formatDate(comment.created_at) }}</span>
                    <button class="btn-link" @click="startCommentEdit(comment)">edit</button>
                    <button class="btn-link btn-danger" @click="removeComment(comment.id)">delete</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Add comment -->
            <div class="add-comment">
              <textarea
                v-model="newCommentBody"
                placeholder="Add a comment..."
                rows="2"
                class="comment-textarea"
              ></textarea>
              <button
                class="btn-confirm btn-sm"
                @click="submitComment"
                :disabled="!newCommentBody.trim()"
              >Post</button>
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
import { useGoalComments } from '../../composables/goals/useGoalComments.js';

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  if (!text) return '<p class="empty-text">No description.</p>';
  return DOMPurify.sanitize(marked.parse(text));
}

export default {
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
        payload[field] = value || null;
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

.btn-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.btn-close:hover { color: var(--text-on-dark); }

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

.btn-clear-color {
  background: none;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.btn-clear-color:hover {
  color: var(--feedback-error);
  border-color: var(--feedback-error);
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
.completion-label {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  cursor: pointer;
}
.completion-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
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
.btn-toggle-edit {
  background: none;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  padding: 2px 10px;
  cursor: pointer;
  font-size: var(--text-xs, 0.75rem);
}
.btn-toggle-edit:hover { color: var(--text-on-dark); border-color: var(--text-on-dark); }

.description-textarea {
  width: 100%;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  font-family: monospace;
  resize: vertical;
  box-sizing: border-box;
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

.comment-textarea {
  width: 100%;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  resize: vertical;
  box-sizing: border-box;
  line-height: 1.4;
}

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
.add-comment .comment-textarea { width: 100%; }

.btn-sm {
  padding: 2px 10px;
  font-size: var(--text-xs, 0.75rem);
}

.btn-cancel {
  background: none;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  padding: var(--space-xs) var(--space-md);
  cursor: pointer;
  font-size: var(--text-sm);
}
.btn-cancel:hover { color: var(--text-on-dark); border-color: var(--text-on-dark); }

.btn-confirm {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
}
.btn-confirm:hover:not(:disabled) { filter: brightness(1.15); }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

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
