<template>
  <div class="voice-commander">
    <h1>Voice Commander</h1>
    <h2 class="page-subtitle">Record voice commands and manage extracted tasks</h2>

    <!-- Record Card -->
    <div class="record-card">
      <h3>Record</h3>
      <div class="record-controls">
        <AspButton
          class="btn-record"
          :disabled="recordState === 'uploading'"
          :variant="recordState === 'recording' ? 'destructive' : 'primary'"
          @click="toggleRecording"
        >
          <span v-if="recordState === 'idle'">Start Recording</span>
          <span v-else-if="recordState === 'recording'">Stop & Send</span>
          <span v-else-if="recordState === 'uploading'">Uploading...</span>
        </AspButton>
        <AspButton
          v-if="recordState === 'recording'"
          class="btn-cancel-record"
          variant="secondary"
          @click="cancelRecording"
        >Cancel</AspButton>
        <span v-if="recordState === 'recording'" class="recording-indicator">
          <span class="pulse-dot"></span>
          {{ recordingDuration }}s
        </span>
        <span v-if="recordError" class="error-text">{{ recordError }}</span>
      </div>
    </div>

    <!-- Recent Messages Card -->
    <div class="messages-card">
      <h3>Recent Messages</h3>
      <div v-if="messagesLoading && messages.length === 0" class="loading-text">Loading messages...</div>
      <div v-else-if="messagesError" class="error-text">{{ messagesError }}</div>
      <div v-else-if="messages.length === 0" class="empty-text">No voice messages yet.</div>
      <AspDataTable v-else class="messages-table" :columns="messageColumns" :rows="recentMessages" row-key="id">
        <template #cell-date="{ row }">{{ formatDate(row.created_at) }}</template>
        <template #cell-time="{ row }">{{ formatTime(row.created_at) }}</template>
        <template #cell-status="{ row }">
          <span class="status-badge" :class="row.status">{{ row.status }}</span>
        </template>
        <template #cell-transcription="{ row }">
          <span class="transcription-cell">{{ row.transcription || '—' }}</span>
        </template>
        <template #cell-actions="{ row }">
          <AspTooltip content="Delete">
            <AspButton variant="ghost" size="icon" aria-label="Delete" @click="deleteMessage(row.id)">
              &times;
            </AspButton>
          </AspTooltip>
        </template>
      </AspDataTable>
    </div>

    <!-- Filter Bar -->
    <div class="filter-card">
      <h3>Filters</h3>
      <div class="filter-controls">
        <!-- The two captions here are <span>s, not <label for>s, and that is a
             constraint AspSelect imposes rather than a preference. It leaves
             inheritAttrs on and binds nothing to its trigger, so an `id` passed
             from here lands on its wrapper <div> — a <label for> pointing at it
             would reference a non-labelable element and associate with nothing.
             The accessible name therefore rides `aria-label`, and the visible
             caption is a span sharing the row's caption rule so all three
             captions still read alike (the mixed-caption regression #4296
             forbids). AspInput below keeps its real <label for>, because
             AspInput does set inheritAttrs false and puts `id` on the real
             <input>. -->
        <div class="filter-group">
          <span class="filter-caption">Status</span>
          <AspSelect
            :model-value="statusFilter"
            :options="statusOptions"
            aria-label="Status"
            @update:model-value="v => { statusFilter = v; resetAndFetch() }"
          />
        </div>
        <div class="filter-group">
          <span class="filter-caption">Priority</span>
          <AspSelect
            :model-value="priorityFilter"
            :options="priorityOptions"
            aria-label="Priority"
            @update:model-value="v => { priorityFilter = v; resetAndFetch() }"
          />
        </div>
        <div class="filter-group">
          <label for="label-filter">Label</label>
          <!-- Kept as `text` rather than `search`, unlike Finance's field: the
               `search` type renders a leading magnifier, which reads as a
               second caption under a control the row already captions "LABEL".
               Finance's field has no caption and a "Search..." placeholder, so
               there the glyph is the affordance rather than a duplicate. -->
          <AspInput
            id="label-filter"
            v-model="labelFilter"
            type="text"
            placeholder="Filter by label..."
            @input="debouncedFetch"
          />
        </div>
        <AspButton class="btn-process" variant="primary" @click="processNow" :disabled="processing">
          <span v-if="processing">Processing...</span>
          <span v-else>Process Now</span>
        </AspButton>
      </div>
    </div>

    <!-- Tasks Table -->
    <div class="tasks-card">
      <h3>Tasks</h3>
      <div v-if="tasksLoading && tasks.length === 0" class="loading-text">Loading tasks...</div>
      <div v-else-if="tasksError" class="error-text">{{ tasksError }}</div>
      <div v-else-if="tasks.length === 0" class="empty-text">No commander tasks yet.</div>
      <table v-else class="tasks-table">
        <thead>
          <tr>
            <th class="id-col">#</th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Label</th>
            <th>Due Date</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(task, index) in tasks" :key="task.id">
            <tr class="task-row" :class="{ expanded: expandedTaskId === task.id }" @click="toggleExpand(task.id)">
              <td class="id-cell">{{ taskVoiceId(index) }}</td>
              <td class="title-cell">{{ task.title }}</td>
              <td>
                <span class="status-badge" :class="task.status">{{ formatStatus(task.status) }}</span>
              </td>
              <td>
                <span class="priority-badge" :class="task.priority">{{ task.priority }}</span>
              </td>
              <td>{{ task.label || '—' }}</td>
              <td>{{ formatDate(task.due_date) }}</td>
              <td>{{ formatDate(task.created_at) }}</td>
              <td class="actions-cell" @click.stop>
                <AspTooltip v-if="task.status !== 'closed'" content="Close task">
                  <AspButton
                    variant="ghost"
                    size="icon"
                    aria-label="Close task"
                    @click="closeTask(task.id)"
                  >
                    &#10003;
                  </AspButton>
                </AspTooltip>
                <AspTooltip v-if="task.status === 'closed'" content="Reopen task">
                  <AspButton
                    variant="ghost"
                    size="icon"
                    aria-label="Reopen task"
                    @click="reopenTask(task.id)"
                  >
                    &#8634;
                  </AspButton>
                </AspTooltip>
                <AspTooltip content="Delete">
                  <AspButton variant="ghost" size="icon" aria-label="Delete" @click="deleteTask(task.id)">
                    &times;
                  </AspButton>
                </AspTooltip>
              </td>
            </tr>
            <tr v-if="expandedTaskId === task.id" class="detail-row">
              <td colspan="8">
                <div class="task-detail">
                  <div class="detail-field" v-if="task.description">
                    <strong>Description</strong>
                    <p>{{ task.description }}</p>
                  </div>
                  <div class="detail-field" v-if="task.voice_message_id">
                    <strong>Voice Message Reference</strong>
                    <p>{{ task.voice_message_id }}</p>
                  </div>
                  <div class="detail-timestamps">
                    <div class="detail-field">
                      <strong>Created</strong>
                      <p>{{ formatDateTime(task.created_at) }}</p>
                    </div>
                    <div class="detail-field" v-if="task.updated_at">
                      <strong>Updated</strong>
                      <p>{{ formatDateTime(task.updated_at) }}</p>
                    </div>
                    <div class="detail-field" v-if="task.closed_at">
                      <strong>Closed</strong>
                      <p>{{ formatDateTime(task.closed_at) }}</p>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pagination">
        <AspButton variant="secondary" size="sm" :disabled="page <= 1" @click="goToPage(page - 1)">&laquo; Prev</AspButton>
        <span class="page-info">Page {{ page }} of {{ totalPages }}</span>
        <AspButton variant="secondary" size="sm" :disabled="page >= totalPages" @click="goToPage(page + 1)">Next &raquo;</AspButton>
      </div>
    </div>

    <!-- Notes Card -->
    <div class="notes-card">
      <h3>Notes</h3>
      <div v-if="notesLoading && notes.length === 0" class="loading-text">Loading notes...</div>
      <div v-else-if="notesError" class="error-text">{{ notesError }}</div>
      <div v-else-if="notes.length === 0" class="empty-text">No diary notes yet.</div>
      <div v-else class="notes-list">
        <div v-for="note in notes" :key="note.id" class="note-entry" @click="toggleNoteExpand(note.id)">
          <div class="note-header">
            <div class="note-meta">
              <span class="note-date">{{ formatDateTime(note.created_at) }}</span>
              <span v-if="note.mood" class="mood-badge" :class="note.mood">{{ note.mood }}</span>
              <span v-if="note.tag" class="tag-badge">{{ note.tag }}</span>
            </div>
            <AspTooltip content="Delete">
              <AspButton variant="ghost" size="icon" aria-label="Delete" @click.stop="deleteNote(note.id)">
                &times;
              </AspButton>
            </AspTooltip>
          </div>
          <div class="note-title" v-if="note.title">{{ note.title }}</div>
          <div class="note-content" :class="{ expanded: expandedNoteId === note.id }">
            {{ note.content }}
          </div>
          <div v-if="note.noted_at" class="note-noted-at">
            Noted for: {{ formatDate(note.noted_at) }}
          </div>
        </div>
      </div>

      <!-- Notes Pagination -->
      <div v-if="notesTotalPages > 1" class="pagination">
        <AspButton variant="secondary" size="sm" :disabled="notesPage <= 1" @click="goToNotesPage(notesPage - 1)">&laquo; Prev</AspButton>
        <span class="page-info">Page {{ notesPage }} of {{ notesTotalPages }}</span>
        <AspButton variant="secondary" size="sm" :disabled="notesPage >= notesTotalPages" @click="goToNotesPage(notesPage + 1)">Next &raquo;</AspButton>
      </div>
    </div>

    <!-- Vocabulary Reference -->
    <div class="vocabulary-card">
      <h3>Command Vocabulary Reference</h3>
      <div v-if="vocabularyLoading" class="loading-text">Loading vocabulary...</div>
      <div v-else-if="vocabularyError" class="error-text">{{ vocabularyError }}</div>
      <div v-else-if="!vocabulary" class="empty-text">No vocabulary data available.</div>
      <div v-else class="vocabulary-content">

        <!-- Grammar -->
        <div class="vocab-section" v-if="vocabulary.grammar">
          <div class="vocab-section-header">Grammar</div>
          <p class="vocab-description">Commands follow a flat CRUD pattern. No end delimiter needed — commands end at the next COMMAND keyword or end of input.</p>
          <code class="vocab-syntax">{{ vocabulary.grammar }}</code>
        </div>

        <!-- Operations -->
        <div class="vocab-section" v-if="vocabulary.operations">
          <div class="vocab-section-header">Operations</div>
          <div class="vocab-badges">
            <span v-for="op in vocabulary.operations" :key="op" class="status-badge open">{{ op }}</span>
          </div>
        </div>

        <!-- Tables & Dimensions -->
        <div class="vocab-section" v-if="vocabulary.tables">
          <div class="vocab-section-header">Tables & Dimensions</div>
          <div v-for="(info, tableName) in vocabulary.tables" :key="tableName" class="vocab-table-group">
            <div class="vocab-table-name">{{ tableName }}</div>
            <p class="vocab-description" v-if="info.notes">{{ info.notes }}</p>
            <div class="vocab-badges" v-if="info.dimensions">
              <span v-for="dim in info.dimensions" :key="dim" class="tag-badge">{{ dim }}</span>
            </div>
          </div>
        </div>

        <!-- Priorities -->
        <div class="vocab-section" v-if="vocabulary.priorities">
          <div class="vocab-section-header">Priorities</div>
          <div class="vocab-badges">
            <span v-for="p in vocabulary.priorities" :key="p" class="priority-badge" :class="p">{{ p }}</span>
          </div>
        </div>

        <!-- Examples -->
        <div class="vocab-section" v-if="vocabulary.examples && vocabulary.examples.length">
          <div class="vocab-section-header">Examples</div>
          <div class="vocab-examples">
            <code v-for="(ex, i) in vocabulary.examples" :key="i" class="vocab-example">{{ ex }}</code>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script>
import { AspInput, AspButton, AspSelect, AspTooltip, AspDataTable } from '@aspirant/design-system';
import axios from 'axios';

export default {
  components: { AspInput, AspButton, AspSelect, AspTooltip, AspDataTable },
  data() {
    return {
      // #4278-A2: the recent-messages table is a uniform read, so it rides the
      // DS AspDataTable. Date/Time/Status/Transcription/actions render through
      // cell slots; no column sorts (the list is already newest-first).
      messageColumns: [
        { key: 'date', label: 'Date', sortable: false },
        { key: 'time', label: 'Time', sortable: false },
        { key: 'status', label: 'Status', sortable: false },
        { key: 'transcription', label: 'Transcription', sortable: false },
        { key: 'actions', label: '', sortable: false },
      ],

      // Recording state
      recordState: 'idle', // idle | recording | uploading
      recordError: null,
      recordingDuration: 0,
      mediaRecorder: null,
      audioChunks: [],
      durationTimer: null,

      // Messages state
      messages: [],
      messagesLoading: true,
      messagesError: null,
      recentMessageLimit: 5,

      // Tasks state
      tasks: [],
      tasksLoading: true,
      tasksError: null,
      processing: false,
      statusFilter: '',
      priorityFilter: '',
      labelFilter: '',
      page: 1,
      pageSize: 20,
      totalTasks: 0,
      totalPages: 1,
      expandedTaskId: null,

      // Notes state
      notes: [],
      notesLoading: true,
      notesError: null,
      notesPage: 1,
      notesPageSize: 20,
      notesTotalPages: 1,
      expandedNoteId: null,

      // Vocabulary state
      vocabulary: null,
      vocabularyLoading: true,
      vocabularyError: null,

      // Timers
      messagesRefreshTimer: null,
      tasksRefreshTimer: null,
      notesRefreshTimer: null,
      debounceTimer: null,
    };
  },
  computed: {
    recentMessages() {
      return this.messages.slice(0, this.recentMessageLimit);
    },
    // AspSelect takes `[{value,label}]` where the natives took <option> markup.
    // '' stays a real option, not the `placeholder` prop: it is the value the
    // filters refetch on, and a placeholder is not selectable.
    statusOptions() {
      return [
        { value: '', label: 'All' },
        { value: 'open', label: 'Open' },
        { value: 'in_progress', label: 'In Progress' },
        { value: 'closed', label: 'Closed' },
      ];
    },
    priorityOptions() {
      return [
        { value: '', label: 'All' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'critical', label: 'Critical' },
      ];
    },
  },
  methods: {
    // --- Recording methods ---

    async toggleRecording() {
      if (this.recordState === 'recording') {
        this.stopRecording();
      } else {
        await this.startRecording();
      }
    },

    async startRecording() {
      this.recordError = null;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
          // Stop all tracks to release the microphone
          stream.getTracks().forEach(t => t.stop());
          this.uploadRecording();
        };

        this.mediaRecorder.start();
        this.recordState = 'recording';
        this.recordingDuration = 0;
        this.durationTimer = setInterval(() => {
          this.recordingDuration++;
        }, 1000);
      } catch (err) {
        this.recordError = 'Microphone access denied or unavailable.';
      }
    },

    stopRecording() {
      clearInterval(this.durationTimer);
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
    },

    cancelRecording() {
      clearInterval(this.durationTimer);
      if (this.mediaRecorder) {
        // Remove the onstop handler so it doesn't upload
        this.mediaRecorder.onstop = () => {
          this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        };
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop();
        }
      }
      this.audioChunks = [];
      this.recordState = 'idle';
      this.recordingDuration = 0;
    },

    async uploadRecording() {
      this.recordState = 'uploading';
      try {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');

        await axios.post('/api/voice-messages', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        await this.fetchMessages();
      } catch (err) {
        this.recordError = 'Upload failed: ' + (err.response?.data?.error || err.message);
      }
      this.recordState = 'idle';
    },

    // --- Messages methods ---

    async fetchMessages() {
      try {
        const resp = await axios.get('/api/voice-messages');
        this.messages = resp.data.items || [];
        this.messagesError = null;
      } catch (err) {
        if (this.messages.length === 0) {
          this.messagesError = 'Failed to load messages: ' + (err.response?.data?.error || err.message);
        }
      }
      this.messagesLoading = false;
    },

    async deleteMessage(id) {
      try {
        await axios.delete(`/api/voice-messages/${id}`);
        this.messages = this.messages.filter(m => m.id !== id);
      } catch (err) {
        this.messagesError = 'Delete failed: ' + (err.response?.data?.error || err.message);
      }
    },

    startMessagesAutoRefresh() {
      this.messagesRefreshTimer = setInterval(() => {
        const hasPending = this.messages.some(
          m => m.status === 'pending' || m.status === 'processing'
        );
        if (hasPending) {
          this.fetchMessages();
        }
      }, 10000);
    },

    // --- Tasks methods ---

    async fetchTasks() {
      try {
        const params = new URLSearchParams();
        if (this.statusFilter) params.append('status', this.statusFilter);
        if (this.priorityFilter) params.append('priority', this.priorityFilter);
        if (this.labelFilter) params.append('label', this.labelFilter);
        params.append('page', this.page);
        params.append('page_size', this.pageSize);

        const resp = await axios.get(`/api/commander/tasks?${params}`);
        this.tasks = resp.data.items || [];
        this.totalTasks = resp.data.total || 0;
        this.totalPages = Math.ceil(this.totalTasks / this.pageSize) || 1;
        this.tasksError = null;
      } catch (err) {
        if (this.tasks.length === 0) {
          this.tasksError = 'Failed to load tasks: ' + (err.response?.data?.error || err.message);
        }
      }
      this.tasksLoading = false;
    },

    async processNow() {
      this.processing = true;
      try {
        await axios.post('/api/commander/process');
        await this.fetchTasks();
      } catch (err) {
        this.tasksError = 'Process failed: ' + (err.response?.data?.error || err.message);
      }
      this.processing = false;
    },

    async closeTask(id) {
      try {
        await axios.patch(`/api/commander/tasks/${id}`, { status: 'closed' });
        await this.fetchTasks();
      } catch (err) {
        this.tasksError = 'Close failed: ' + (err.response?.data?.error || err.message);
      }
    },

    async reopenTask(id) {
      try {
        await axios.patch(`/api/commander/tasks/${id}`, { status: 'open' });
        await this.fetchTasks();
      } catch (err) {
        this.tasksError = 'Reopen failed: ' + (err.response?.data?.error || err.message);
      }
    },

    async deleteTask(id) {
      try {
        await axios.delete(`/api/commander/tasks/${id}`);
        this.tasks = this.tasks.filter(t => t.id !== id);
      } catch (err) {
        this.tasksError = 'Delete failed: ' + (err.response?.data?.error || err.message);
      }
    },

    resetAndFetch() {
      this.page = 1;
      this.fetchTasks();
    },

    debouncedFetch() {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.page = 1;
        this.fetchTasks();
      }, 300);
    },

    goToPage(p) {
      this.page = p;
      this.fetchTasks();
    },

    taskVoiceId(index) {
      // Tasks display newest-first, but voice IDs are 1-based oldest-first
      return this.totalTasks - ((this.page - 1) * this.pageSize + index);
    },

    toggleExpand(id) {
      this.expandedTaskId = this.expandedTaskId === id ? null : id;
    },

    startTasksAutoRefresh() {
      this.tasksRefreshTimer = setInterval(() => {
        this.fetchTasks();
      }, 15000);
    },

    // --- Notes methods ---

    async fetchNotes() {
      try {
        const params = new URLSearchParams();
        params.append('page', this.notesPage);
        params.append('page_size', this.notesPageSize);

        const resp = await axios.get(`/api/commander/notes?${params}`);
        this.notes = resp.data.items || [];
        this.notesTotalPages = resp.data.total_pages || 1;
        this.notesError = null;
      } catch (err) {
        if (this.notes.length === 0) {
          this.notesError = 'Failed to load notes: ' + (err.response?.data?.error || err.message);
        }
      }
      this.notesLoading = false;
    },

    async deleteNote(id) {
      try {
        await axios.delete(`/api/commander/notes/${id}`);
        this.notes = this.notes.filter(n => n.id !== id);
      } catch (err) {
        this.notesError = 'Delete failed: ' + (err.response?.data?.error || err.message);
      }
    },

    toggleNoteExpand(id) {
      this.expandedNoteId = this.expandedNoteId === id ? null : id;
    },

    goToNotesPage(p) {
      this.notesPage = p;
      this.fetchNotes();
    },

    startNotesAutoRefresh() {
      this.notesRefreshTimer = setInterval(() => {
        this.fetchNotes();
      }, 15000);
    },

    // --- Vocabulary methods ---

    async fetchVocabulary() {
      try {
        const resp = await axios.get('/api/commander/vocabulary');
        this.vocabulary = resp.data;
        this.vocabularyError = null;
      } catch (err) {
        this.vocabularyError = 'Failed to load vocabulary: ' + (err.response?.data?.error || err.message);
      }
      this.vocabularyLoading = false;
    },

    // --- Formatting helpers ---

    formatDate(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleDateString();
    },

    formatTime(ts) {
      if (!ts) return '—';
      return new Date(ts).toLocaleTimeString();
    },

    formatDateTime(ts) {
      if (!ts) return '—';
      const d = new Date(ts);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    },

    formatStatus(status) {
      if (!status) return '—';
      return status.replace(/_/g, ' ');
    },

    formatVocabCategory(category) {
      if (!category) return '';
      return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },
  },

  mounted() {
    this.fetchMessages();
    this.fetchTasks();
    this.fetchNotes();
    this.fetchVocabulary();
    this.startMessagesAutoRefresh();
    this.startTasksAutoRefresh();
    this.startNotesAutoRefresh();
  },

  beforeUnmount() {
    clearInterval(this.messagesRefreshTimer);
    clearInterval(this.tasksRefreshTimer);
    clearInterval(this.notesRefreshTimer);
    clearInterval(this.durationTimer);
    clearTimeout(this.debounceTimer);
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  },
};
</script>

<style scoped>
.voice-commander {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  color: var(--text-on-light);
}

.page-subtitle {
  color: var(--text-muted);
  font-weight: normal;
  margin-bottom: var(--space-xl);
}

.loading-text,
.empty-text {
  color: var(--text-muted);
  font-size: var(--text-lg);
  padding: var(--space-xl) 0;
  text-align: center;
}

.error-text {
  color: var(--feedback-error);
  font-size: var(--text-sm);
}

/* Record Card */
.record-card {
  background-color: var(--surface-card);
  /* Declares its ink: --surface-card is dark in BOTH themes, so the ambient
     light-theme ink would land ~#424242 on #424242 (#2415 / §3.18, #4483). */
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.record-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.record-controls {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

/* .btn-record/.btn-cancel-record visuals now come from AspButton
   (:variant="recordState === 'recording' ? 'destructive' : 'primary'" / secondary). */

.recording-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--feedback-error);
  font-weight: 600;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background-color: var(--feedback-error);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Messages Card */
.messages-card {
  background-color: var(--surface-card);
  /* Declares its ink: --surface-card is dark in BOTH themes, so the ambient
     light-theme ink would land ~#424242 on #424242 (#2415 / §3.18, #4483). */
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.messages-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

/* The recent-messages table's own th/td styling is retired — AspDataTable
   (#4278-A2) owns the table, header and cell treatment now. Only the cell
   CONTENT styles below (transcription clamp, status badge) survive, applied to
   the spans inside the cell slots. */
.transcription-cell {
  display: inline-block;
  max-width: 400px;
  word-break: break-word;
}

/* Status Badge */
.status-badge {
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.status-badge.pending {
  background-color: var(--text-muted);
  color: var(--text-on-dark);
}

.status-badge.processing {
  background-color: var(--brand-primary);
  color: var(--text-on-fixed-light);
}

.status-badge.completed {
  background-color: var(--feedback-success);
  color: var(--text-on-dark);
}

.status-badge.failed {
  background-color: var(--feedback-error);
  color: var(--text-on-dark);
}

.status-badge.open {
  background-color: #3b82f6;
  color: var(--text-on-dark);
}

.status-badge.in_progress {
  background-color: #eab308;
  color: #1a1a1a;
}

.status-badge.closed {
  background-color: var(--feedback-success);
  color: var(--text-on-dark);
}

/* Filter Card */
/* This card declares a background, so it declares the ink that goes on it —
   #2415 / §3.18. --surface-card is #424242 in BOTH themes, but without this
   line the card inherits the ambient ink, which in the LIGHT theme is also
   #424242. --text-muted is `color-mix(currentColor 88%, transparent)`, so the
   three filter captions resolved to #424242 at 88% on a #424242 card and
   measured 1.00:1 — invisible in the default theme, legible in dark, which is
   why only a both-themes walk finds it. Measured on the built page: the
   captions go 1.00:1 -> 8.23:1 in light, and 8.77:1 -> 11.44:1 in dark, where
   the ambient ink was already light but not this card's own. The defect
   predates this task; it is fixed here because the row it sits on is the row
   this task rebuilt. Five sibling cards in this file set --surface-card with
   no paired ink the same way — see #4483, which carries the measurements. */
.filter-card {
  background-color: var(--surface-card);
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.filter-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.filter-controls {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

/* .filter-caption joins the selector because the two select captions had to
   stop being <label for>s when their controls became AspSelect (see the
   template note). Same declarations, so the three captions stay identical. */
.filter-group label,
.filter-caption {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

/* `.filter-group input` and `.filter-group select` have both left this file.
   Neither was tidied away: AspInput and AspSelect each render their real
   control inside their own root, where this file's data-v scope attribute does
   not reach, so neither selector could still match. The 34px / --radius-md /
   --border-control box they used to hand-paint is what AspSelect's trigger
   already paints, which is why nothing replaces them. */

/* Layout only — visuals from AspButton (variant="primary"). */
.btn-process {
  margin-left: auto;
}

/* Tasks Card */
.tasks-card {
  background-color: var(--surface-card);
  /* Declares its ink: --surface-card is dark in BOTH themes, so the ambient
     light-theme ink would land ~#424242 on #424242 (#2415 / §3.18, #4483). */
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.tasks-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.tasks-table {
  width: 100%;
  border-collapse: collapse;
}

.tasks-table th {
  text-align: left;
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 2px solid var(--surface-card-inner);
}

.tasks-table td {
  padding: var(--space-sm);
  border-bottom: 1px solid var(--surface-card-inner);
  font-size: var(--text-sm);
  color: var(--text-on-dark);
  vertical-align: top;
}

.task-row {
  cursor: pointer;
  transition: background-color var(--transition-moderate);
}

.task-row:hover {
  background-color: var(--surface-card-inner);
}

.task-row.expanded {
  background-color: var(--surface-card-inner);
}

.id-col {
  width: 40px;
}

.id-cell {
  font-weight: 700;
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.title-cell {
  max-width: 200px;
  word-break: break-word;
}

/* Priority Badge */
.priority-badge {
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.priority-badge.low {
  background-color: var(--text-muted);
  color: var(--text-on-dark);
}

.priority-badge.medium {
  background-color: #3b82f6;
  color: var(--text-on-dark);
}

.priority-badge.high {
  background-color: #f97316;
  color: var(--text-on-dark);
}

.priority-badge.critical {
  background-color: var(--feedback-error);
  color: var(--text-on-dark);
}

/* Detail Row */
.detail-row td {
  padding: 0;
  border-bottom: 2px solid var(--surface-card-inner);
}

.task-detail {
  padding: var(--space-md) var(--space-lg);
  background-color: var(--surface-card-inner);
}

.detail-field {
  margin-bottom: var(--space-sm);
}

.detail-field strong {
  display: block;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: var(--space-2xs);
}

.detail-field p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-on-dark);
}

.detail-timestamps {
  display: flex;
  gap: var(--space-xl);
  flex-wrap: wrap;
  margin-top: var(--space-sm);
}

/* Action Buttons */
.actions-cell {
  white-space: nowrap;
}

/* The row actions (message delete, task close/reopen/delete, note delete) are
   AspButton variant="ghost" size="icon" — the DS owns paint, hover, focus ring
   and the 44px square target, so the former .btn-action / .btn-close-task /
   .btn-reopen-task / .btn-delete rules are deleted rather than reduced: a
   scoped rule here lands on the DS root and overrides the component the port
   just adopted. Two resting hues go with them — --feedback-success on close
   and a hardcoded #3b82f6 on reopen (off-token, which is its own reason to
   drop it). Whether an icon button should carry a semantic tone at all is the
   DS question filed from this task. */

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  margin-top: var(--space-lg);
}

/* .btn-page visuals now come from AspButton (variant="secondary" size="sm"). */

.page-info {
  font-size: var(--text-sm);
  color: var(--text-muted);
  font-weight: 600;
}

/* Notes Card */
.notes-card {
  background-color: var(--surface-card);
  /* Declares its ink: --surface-card is dark in BOTH themes, so the ambient
     light-theme ink would land ~#424242 on #424242 (#2415 / §3.18, #4483). */
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.notes-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.note-entry {
  background-color: var(--surface-card-inner);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  cursor: pointer;
  transition: background-color var(--transition-moderate);
}

.note-entry:hover {
  filter: brightness(1.05);
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xs);
}

.note-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.note-date {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: 600;
}

.note-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-on-dark);
  margin-bottom: var(--space-xs);
}

.note-content {
  font-size: var(--text-sm);
  color: var(--text-on-dark);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.note-content.expanded {
  -webkit-line-clamp: unset;
  overflow: visible;
}

.note-noted-at {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-xs);
  font-style: italic;
}

/* Mood Badge */
.mood-badge {
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-weight: 600;
  text-transform: uppercase;
  white-space: nowrap;
}

.mood-badge.positive,
.mood-badge.grateful,
.mood-badge.excited {
  background-color: var(--feedback-success);
  color: var(--text-on-dark);
}

.mood-badge.neutral,
.mood-badge.reflective {
  background-color: #3b82f6;
  color: var(--text-on-dark);
}

.mood-badge.negative,
.mood-badge.frustrated,
.mood-badge.anxious {
  background-color: #f97316;
  color: var(--text-on-dark);
}

/* Tag Badge */
.tag-badge {
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-sm);
  background-color: var(--surface-card);
  color: var(--text-on-dark);
  font-weight: 500;
  border: 1px solid var(--border-card);
}

/* Vocabulary Card */
.vocabulary-card {
  background-color: var(--surface-card);
  /* Declares its ink: --surface-card is dark in BOTH themes, so the ambient
     light-theme ink would land ~#424242 on #424242 (#2415 / §3.18, #4483). */
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
}

.vocabulary-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.vocabulary-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.vocab-section {
  border-bottom: 1px solid var(--surface-card-inner);
  padding-bottom: var(--space-md);
}

.vocab-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.vocab-section-header {
  font-size: var(--text-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-on-dark);
  margin-bottom: var(--space-xs);
}

.vocab-description {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0 0 var(--space-sm) 0;
  line-height: 1.4;
}

.vocab-syntax {
  display: block;
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-family: monospace;
  margin-bottom: var(--space-sm);
  word-break: break-word;
}

.vocab-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.vocab-field {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  background-color: var(--surface-card-inner);
}

.vocab-field-name {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-on-dark);
  min-width: 80px;
  flex-shrink: 0;
}

.vocab-field-syntax {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: monospace;
}

.vocab-table-group {
  margin-bottom: var(--space-md);
}

.vocab-table-group:last-child {
  margin-bottom: 0;
}

.vocab-table-name {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-on-dark);
  text-transform: capitalize;
  margin-bottom: var(--space-xs);
}

.vocab-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.vocab-examples {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.vocab-example {
  display: block;
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-family: monospace;
  line-height: 1.5;
  word-break: break-word;
}

/* Mobile */
@media (max-width: 768px) {
  .voice-commander {
    padding: var(--space-md);
  }

  .filter-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .btn-process {
    margin-left: 0;
  }

  .messages-table th:nth-child(2),
  .messages-table td:nth-child(2) {
    display: none;
  }

  .transcription-cell {
    max-width: 200px;
  }

  .tasks-table th:nth-child(4),
  .tasks-table td:nth-child(4),
  .tasks-table th:nth-child(5),
  .tasks-table td:nth-child(5) {
    display: none;
  }

  .title-cell {
    max-width: 120px;
  }

  .detail-timestamps {
    flex-direction: column;
    gap: var(--space-sm);
  }
}
</style>
