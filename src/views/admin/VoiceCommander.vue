<template>
  <div class="voice-commander">
    <h1>Voice Commander</h1>
    <h2 class="page-subtitle">Record voice commands and manage extracted tasks</h2>

    <!-- Record Card -->
    <div class="record-card">
      <h3>Record</h3>
      <div class="record-controls">
        <button
          class="btn-record"
          :class="{ recording: recordState === 'recording' }"
          :disabled="recordState === 'uploading'"
          @click="toggleRecording"
        >
          <span v-if="recordState === 'idle'">Start Recording</span>
          <span v-else-if="recordState === 'recording'">Stop & Send</span>
          <span v-else-if="recordState === 'uploading'">Uploading...</span>
        </button>
        <button
          v-if="recordState === 'recording'"
          class="btn-cancel-record"
          @click="cancelRecording"
        >Cancel</button>
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
      <table v-else class="messages-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Status</th>
            <th>Transcription</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="msg in recentMessages" :key="msg.id">
            <td>{{ formatDate(msg.created_at) }}</td>
            <td>{{ formatTime(msg.created_at) }}</td>
            <td>
              <span class="status-badge" :class="msg.status">{{ msg.status }}</span>
            </td>
            <td class="transcription-cell">
              {{ msg.transcription || '—' }}
            </td>
            <td>
              <button class="btn-delete" @click="deleteMessage(msg.id)" title="Delete">
                &times;
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Filter Bar -->
    <div class="filter-card">
      <h3>Filters</h3>
      <div class="filter-controls">
        <div class="filter-group">
          <label for="status-filter">Status</label>
          <select id="status-filter" v-model="statusFilter" @change="resetAndFetch">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="priority-filter">Priority</label>
          <select id="priority-filter" v-model="priorityFilter" @change="resetAndFetch">
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div class="filter-group">
          <label for="label-filter">Label</label>
          <input
            id="label-filter"
            v-model="labelFilter"
            type="text"
            placeholder="Filter by label..."
            @input="debouncedFetch"
          />
        </div>
        <button class="btn-process" @click="processNow" :disabled="processing">
          <span v-if="processing">Processing...</span>
          <span v-else>Process Now</span>
        </button>
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
                <button
                  v-if="task.status !== 'closed'"
                  class="btn-action btn-close-task"
                  @click="closeTask(task.id)"
                  title="Close task"
                >
                  &#10003;
                </button>
                <button
                  v-if="task.status === 'closed'"
                  class="btn-action btn-reopen-task"
                  @click="reopenTask(task.id)"
                  title="Reopen task"
                >
                  &#8634;
                </button>
                <button class="btn-delete" @click="deleteTask(task.id)" title="Delete">
                  &times;
                </button>
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
        <button class="btn-page" :disabled="page <= 1" @click="goToPage(page - 1)">&laquo; Prev</button>
        <span class="page-info">Page {{ page }} of {{ totalPages }}</span>
        <button class="btn-page" :disabled="page >= totalPages" @click="goToPage(page + 1)">Next &raquo;</button>
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
            <button class="btn-delete" @click.stop="deleteNote(note.id)" title="Delete">
              &times;
            </button>
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
        <button class="btn-page" :disabled="notesPage <= 1" @click="goToNotesPage(notesPage - 1)">&laquo; Prev</button>
        <span class="page-info">Page {{ notesPage }} of {{ notesTotalPages }}</span>
        <button class="btn-page" :disabled="notesPage >= notesTotalPages" @click="goToNotesPage(notesPage + 1)">Next &raquo;</button>
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
import axios from 'axios';

export default {
  data() {
    return {
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

.btn-record {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-base);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.btn-record:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-record:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-record.recording {
  background-color: var(--feedback-success);
  color: var(--text-on-dark);
}

.btn-cancel-record {
  background-color: transparent;
  color: var(--text-muted);
  font-weight: 600;
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-card);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate), color var(--transition-moderate), border-color var(--transition-moderate);
}

.btn-cancel-record:hover {
  color: var(--feedback-error);
  border-color: var(--feedback-error);
}

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

.messages-table {
  width: 100%;
  border-collapse: collapse;
}

.messages-table th {
  text-align: left;
  color: var(--text-muted);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 2px solid var(--surface-card-inner);
}

.messages-table td {
  padding: var(--space-sm);
  border-bottom: 1px solid var(--surface-card-inner);
  font-size: var(--text-sm);
  color: var(--text-on-dark);
  vertical-align: top;
}

.transcription-cell {
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
  color: var(--text-on-light);
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
.filter-card {
  background-color: var(--surface-card);
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

.filter-group label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

.filter-group select,
.filter-group input {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
}

.btn-process {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-xs) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
  margin-left: auto;
}

.btn-process:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-process:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Tasks Card */
.tasks-card {
  background-color: var(--surface-card);
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

.btn-action {
  background: none;
  border: none;
  font-size: var(--text-lg);
  cursor: pointer;
  padding: 0 var(--space-xs);
  line-height: 1;
  transition: color var(--transition-moderate);
}

.btn-close-task {
  color: var(--feedback-success);
}

.btn-close-task:hover {
  color: var(--text-on-dark);
}

.btn-reopen-task {
  color: #3b82f6;
}

.btn-reopen-task:hover {
  color: var(--text-on-dark);
}

.btn-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: var(--text-xl);
  cursor: pointer;
  padding: 0 var(--space-xs);
  line-height: 1;
  transition: color var(--transition-moderate);
}

.btn-delete:hover {
  color: var(--feedback-error);
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  margin-top: var(--space-lg);
}

.btn-page {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.btn-page:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-page:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: var(--text-sm);
  color: var(--text-muted);
  font-weight: 600;
}

/* Notes Card */
.notes-card {
  background-color: var(--surface-card);
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
