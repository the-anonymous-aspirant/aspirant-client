<template>
  <div class="advisor-view">
    <h1>Advisor</h1>
    <h2 class="page-subtitle">Ask questions about your contracts, insurance, and legal documents</h2>

    <!-- Source Registry -->
    <div class="sources-card">
      <h3>Knowledge Base</h3>
      <div v-if="sourcesLoading" class="loading-text">Loading sources...</div>
      <div v-else-if="sourcesError" class="error-text">{{ sourcesError }}</div>
      <template v-else>
        <div class="sources-stats">
          <span>{{ sources.total_documents }} documents</span>
          <span class="stat-sep">|</span>
          <span>{{ sources.total_chunks }} chunks indexed</span>
        </div>
        <div class="domains-grid">
          <div
            v-for="domain in sources.domains"
            :key="domain.name"
            class="domain-wrapper"
          >
            <div
              class="domain-badge"
              :class="{ empty: !domain.has_content, active: domain.has_content, expanded: expandedDomain === domain.name }"
              :title="domain.description"
              @click="domain.has_content && toggleDomain(domain.name)"
              :style="{ cursor: domain.has_content ? 'pointer' : 'default' }"
            >
              <span class="domain-icon">{{ domainIcons[domain.icon] || '&#128196;' }}</span>
              <span class="domain-name">{{ domain.display_name }}</span>
              <span class="domain-count">{{ domain.document_count }}</span>
              <span v-if="domain.has_content" class="domain-chevron">{{ expandedDomain === domain.name ? '\u25B2' : '\u25BC' }}</span>
            </div>
            <div v-if="expandedDomain === domain.name && domain.documents" class="domain-docs-dropdown">
              <div v-for="doc in domain.documents" :key="doc.id" class="domain-doc-item">
                <span class="domain-doc-title">{{ doc.title }}</span>
                <span class="domain-doc-meta">{{ doc.doc_type }} &middot; {{ doc.chunk_count }} chunks</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Chat Interface -->
    <div class="chat-card">
      <h3>Ask a Question</h3>

      <div class="chat-messages" ref="chatMessages">
        <div v-if="messages.length === 0" class="empty-chat">
          <p>Ask about your insurance coverage, employment benefits, rental rights, or anything else in your uploaded documents.</p>
        </div>
        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          class="chat-message"
          :class="msg.role"
        >
          <div class="message-content">
            <div class="message-text" v-html="formatMessage(msg.text)"></div>
            <div v-if="msg.citations && msg.citations.length" class="citations">
              <div class="citations-header">Sources</div>
              <div
                v-for="(cite, ci) in msg.citations"
                :key="ci"
                class="citation"
              >
                <div class="cite-header">
                  <span class="cite-doc">{{ cite.document_title }}</span>
                  <span v-if="cite.section_title" class="cite-section">{{ cite.section_title }}</span>
                  <span v-if="cite.page_number" class="cite-page">p. {{ cite.page_number }}</span>
                </div>
                <div v-if="cite.text" class="cite-quote">{{ truncateQuote(cite.text) }}</div>
              </div>
            </div>
            <div v-if="msg.chunks_used !== undefined" class="message-meta">
              {{ msg.chunks_used }} chunks retrieved
            </div>
          </div>
        </div>
        <div v-if="querying" class="chat-message assistant">
          <div class="message-content">
            <div class="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>

      <div class="chat-input-area">
        <!-- A wrapper, not a class on the component, and the reason is
             AspTextarea's inheritAttrs: false — `class` travels in $attrs, and
             AspTextarea binds $attrs to the real <textarea> INSIDE its root, so
             a class passed here lands on a node this file's data-v attribute
             cannot reach. Measured: the field came out 190px in a 784px row.
             Finance's .search-field wrapper exists for the same reason. The
             wrapper carries flex: 1 and nothing else — the box is the DS's. -->
        <div class="chat-input">
          <AspTextarea
            v-model="question"
            placeholder="Ask a question..."
            :rows="2"
            :max-rows="6"
            :disabled="querying"
            maxlength="2000"
            @keydown.enter.exact.prevent="askQuestion"
          />
        </div>
        <AspButton
          variant="primary"
          @click="askQuestion"
          :disabled="querying || !question.trim()"
        >
          <span v-if="querying">Thinking...</span>
          <span v-else>Send</span>
        </AspButton>
      </div>
    </div>

    <!-- Document Management (Admin only) -->
    <div v-if="isAdmin" class="documents-card">
      <h3>Document Management</h3>

      <!-- Upload -->
      <div class="upload-section">
        <h4>Upload Document</h4>
        <div class="upload-form">
          <div class="form-row">
            <div class="form-group">
              <label>Domain</label>
              <AspSelect
                v-model="uploadDomain"
                :options="domainOptions"
                placeholder="Select domain"
                aria-label="Domain"
                :disabled="uploading"
              />
            </div>
            <div class="form-group">
              <label>Access Level</label>
              <AspSelect
                v-model="uploadAccess"
                :options="accessOptions"
                aria-label="Access Level"
                :disabled="uploading"
              />
            </div>
          </div>
          <div class="form-group">
            <label>Files (PDF, DOCX, TXT)</label>
            <input
              type="file"
              ref="fileInput"
              accept=".pdf,.docx,.txt"
              :disabled="uploading"
              multiple
              @change="onFilesSelected"
            />
          </div>
          <AspButton
            class="btn-upload"
            variant="primary"
            @click="uploadDocuments"
            :disabled="uploading || selectedFiles.length === 0 || !uploadDomain"
          >
            <span v-if="uploading">Uploading {{ uploadProgress }}...</span>
            <span v-else>Upload{{ selectedFiles.length > 1 ? ` (${selectedFiles.length} files)` : '' }}</span>
          </AspButton>
          <div v-if="uploadMessage" class="upload-message" :class="uploadMessageClass">
            {{ uploadMessage }}
          </div>
        </div>
      </div>

      <!-- Document List -->
      <div class="docs-list-section">
        <h4>Uploaded Documents</h4>
        <div v-if="docsLoading" class="loading-text">Loading...</div>
        <div v-else-if="documents.length === 0" class="empty-text">No documents uploaded yet.</div>
        <div v-else class="docs-table">
          <div v-for="doc in documents" :key="doc.id" class="doc-row">
            <div class="doc-info">
              <span class="doc-name">{{ doc.filename }}</span>
              <span class="doc-domain">{{ doc.domain }}</span>
              <span class="doc-access">{{ doc.access_level }}</span>
              <span class="doc-chunks">{{ doc.chunk_count }} chunks</span>
            </div>
            <div class="doc-actions">
              <AspButton variant="destructive" size="sm" @click="deleteDocument(doc.id)" :disabled="deleting === doc.id">
                {{ deleting === doc.id ? '...' : 'Delete' }}
              </AspButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { AspButton, AspSelect, AspTextarea } from '@aspirant/design-system';

export default {
  components: {
    AspButton,
    AspSelect,
    AspTextarea,
  },
  data() {
    return {
      // Sources
      sources: null,
      sourcesLoading: true,
      sourcesError: null,
      expandedDomain: null,

      // Chat
      messages: [],
      question: '',
      querying: false,

      // Documents
      documents: [],
      docsLoading: true,
      uploading: false,
      uploadDomain: '',
      uploadAccess: 'admin',
      selectedFiles: [],
      uploadMessage: null,
      uploadMessageClass: '',
      uploadProgress: '',
      deleting: null,

      domainIcons: {
        shield: '\u{1F6E1}',
        briefcase: '\u{1F4BC}',
        home: '\u{1F3E0}',
        receipt: '\u{1F9FE}',
        scale: '\u{2696}',
        globe: '\u{1F30D}',
        'piggy-bank': '\u{1F4B0}',
        heart: '\u{2764}',
        file: '\u{1F4C4}',
      },
    };
  },
  computed: {
    isAdmin() {
      return localStorage.getItem('user_role') === 'Admin';
    },
    domainList() {
      return this.sources?.domains || [];
    },
    // AspSelect takes `[{value,label}]` where the natives took <option> markup.
    // The domain select's old `<option value="" disabled>Select domain</option>`
    // becomes the `placeholder` prop rather than a disabled first entry: the
    // placeholder is exactly a non-selectable prompt shown while modelValue
    // matches no option, which is what that disabled option was standing in for.
    domainOptions() {
      return this.domainList.map(d => ({ value: d.name, label: d.display_name }));
    },
    accessOptions() {
      return [
        { value: 'admin', label: 'Admin only' },
        { value: 'family', label: 'Family' },
        { value: 'public', label: 'Public' },
      ];
    },
  },
  methods: {
    truncateQuote(text) {
      if (!text) return '';
      const max = 200;
      return text.length > max ? text.slice(0, max) + '...' : text;
    },

    toggleDomain(name) {
      this.expandedDomain = this.expandedDomain === name ? null : name;
    },

    async fetchSources() {
      try {
        const resp = await axios.get('/api/advisor/sources');
        this.sources = resp.data;
        this.sourcesError = null;
      } catch (err) {
        this.sourcesError = 'Failed to load sources: ' + (err.response?.data?.detail || err.message);
      }
      this.sourcesLoading = false;
    },

    async fetchDocuments() {
      if (!this.isAdmin) return;
      try {
        const resp = await axios.get('/api/advisor/documents');
        this.documents = resp.data.items || resp.data;
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
      this.docsLoading = false;
    },

    async askQuestion() {
      const q = this.question.trim();
      if (!q || this.querying) return;

      this.messages.push({ role: 'user', text: q });
      this.question = '';
      this.querying = true;

      this.$nextTick(() => this.scrollToBottom());

      try {
        const role = localStorage.getItem('user_role') === 'Admin' ? 'admin' : 'family';
        const resp = await axios.post('/api/advisor/query', {
          question: q,
          role: role,
          top_k: 8,
        });
        this.messages.push({
          role: 'assistant',
          text: resp.data.answer,
          citations: resp.data.citations,
          chunks_used: resp.data.chunks_used,
        });
      } catch (err) {
        this.messages.push({
          role: 'assistant',
          text: 'Sorry, I encountered an error: ' + this.formatError(err),
        });
      }

      this.querying = false;
      this.$nextTick(() => this.scrollToBottom());
    },

    formatMessage(text) {
      // Simple markdown: bold, newlines
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    },

    scrollToBottom() {
      const el = this.$refs.chatMessages;
      if (el) el.scrollTop = el.scrollHeight;
    },

    onFilesSelected(event) {
      this.selectedFiles = Array.from(event.target.files || []);
    },

    formatError(err) {
      const detail = err.response?.data?.detail;
      if (!detail) return err.message;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        return detail.map(d => d.msg || JSON.stringify(d)).join('; ');
      }
      return JSON.stringify(detail);
    },

    async uploadDocuments() {
      if (this.selectedFiles.length === 0 || !this.uploadDomain) return;
      this.uploading = true;
      this.uploadMessage = null;

      const results = [];
      const errors = [];

      for (let i = 0; i < this.selectedFiles.length; i++) {
        const file = this.selectedFiles[i];
        this.uploadProgress = `(${i + 1}/${this.selectedFiles.length}) ${file.name}`;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('domain', this.uploadDomain);
        formData.append('access_level', this.uploadAccess);

        try {
          const resp = await axios.post('/api/advisor/documents', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
          });
          results.push(`${resp.data.filename} (${resp.data.chunk_count} chunks)`);
        } catch (err) {
          errors.push(`${file.name}: ${this.formatError(err)}`);
        }
      }

      if (errors.length === 0) {
        this.uploadMessage = `Uploaded: ${results.join(', ')}`;
        this.uploadMessageClass = 'success';
      } else if (results.length > 0) {
        this.uploadMessage = `Uploaded: ${results.join(', ')}. Errors: ${errors.join('; ')}`;
        this.uploadMessageClass = 'error';
      } else {
        this.uploadMessage = `Upload failed: ${errors.join('; ')}`;
        this.uploadMessageClass = 'error';
      }

      this.selectedFiles = [];
      this.uploadProgress = '';
      if (this.$refs.fileInput) this.$refs.fileInput.value = '';
      await Promise.all([this.fetchSources(), this.fetchDocuments()]);
      this.uploading = false;
    },

    async deleteDocument(id) {
      if (!confirm('Delete this document and all its chunks?')) return;
      this.deleting = id;
      try {
        await axios.delete(`/api/advisor/documents/${id}`);
        await Promise.all([this.fetchSources(), this.fetchDocuments()]);
      } catch (err) {
        alert('Delete failed: ' + (err.response?.data?.detail || err.message));
      }
      this.deleting = null;
    },
  },

  mounted() {
    this.fetchSources();
    this.fetchDocuments();
  },
};
</script>

<style scoped>
.advisor-view {
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
  text-align: center;
}

.loading-text,
.empty-text,
.empty-chat {
  color: var(--text-muted);
  font-size: var(--text-sm);
  padding: var(--space-lg) 0;
  text-align: center;
}

.error-text {
  color: var(--feedback-error);
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
}

/* Sources Card */
.sources-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.sources-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-sm) 0;
}

.sources-stats {
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin-bottom: var(--space-md);
  display: flex;
  gap: var(--space-xs);
}

.stat-sep {
  color: var(--border-card);
}

.domains-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.domain-badge {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 500;
  transition: opacity var(--transition-fast);
}

.domain-badge.empty {
  background-color: var(--surface-card-inner);
  color: var(--text-muted);
  opacity: 0.5;
  border: 1px dashed var(--text-muted);
}

.domain-badge.active {
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  border: 1px solid var(--brand-primary);
}

.domain-icon {
  font-size: var(--text-sm);
}

.domain-count {
  background-color: rgba(255, 255, 255, 0.1);
  padding: 0 var(--space-2xs);
  border-radius: var(--radius-sm);
  font-size: 0.65rem;
}

.domain-chevron {
  font-size: 0.5rem;
  margin-left: var(--space-2xs);
  opacity: 0.6;
}

.domain-badge.expanded {
  border-color: var(--brand-accent);
}

.domain-wrapper {
  position: relative;
}

.domain-docs-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  margin-top: var(--space-2xs);
  background-color: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: var(--space-xs);
  min-width: 250px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.domain-doc-item {
  display: flex;
  flex-direction: column;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
}

.domain-doc-item:hover {
  background-color: var(--surface-card-inner);
}

.domain-doc-title {
  font-size: var(--text-xs);
  color: var(--text-on-dark);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.domain-doc-meta {
  font-size: 0.65rem;
  color: var(--text-muted);
}

/* Chat Card */
.chat-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.chat-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.chat-messages {
  max-height: 500px;
  overflow-y: auto;
  margin-bottom: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  scrollbar-width: thin;
  scrollbar-color: var(--brand-accent) var(--surface-card);
}

.chat-message {
  display: flex;
}

.chat-message.user {
  justify-content: flex-end;
}

.chat-message.user .message-content {
  background-color: var(--brand-primary);
  color: var(--text-on-fixed-light);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg);
  max-width: 80%;
}

.chat-message.assistant .message-content {
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm);
  max-width: 90%;
}

.message-content {
  padding: var(--space-sm) var(--space-md);
}

.message-text {
  font-size: var(--text-sm);
  line-height: 1.6;
  word-break: break-word;
}

.message-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-xs);
  font-style: italic;
}

/* Citations */
.citations {
  margin-top: var(--space-sm);
  padding-top: var(--space-xs);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.citations-header {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: var(--space-2xs);
  font-weight: 600;
}

.citation {
  font-size: var(--text-xs);
  padding: var(--space-xs) var(--space-sm);
  margin-bottom: var(--space-xs);
  background-color: rgba(255, 255, 255, 0.03);
  border-left: 2px solid var(--brand-primary);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.cite-header {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
  margin-bottom: var(--space-2xs);
}

.cite-quote {
  font-style: italic;
  color: var(--text-muted);
  font-size: 0.7rem;
  line-height: 1.4;
  opacity: 0.8;
}

.cite-doc {
  color: var(--brand-primary);
  font-weight: 600;
}

.cite-section {
  color: var(--text-muted);
}

.cite-page {
  color: var(--text-muted);
  font-style: italic;
}

/* Typing indicator */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: var(--space-xs) 0;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--text-muted);
  animation: typing 1.4s infinite both;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Chat Input */
.chat-input-area {
  display: flex;
  gap: var(--space-sm);
  align-items: flex-end;
}

/* Was `.chat-input-area textarea`, hand-painting the box. AspTextarea paints
   it now (--surface-elevated fill, --text-body ink, --border-control at the
   WCAG 1.4.11 3:1 floor), and this file's scoped attribute cannot reach the
   real <textarea> inside it anyway. What is left is the one thing the DS
   cannot know: this control shares its row with a Send button and takes the
   remaining width. The near-white control on this dark card is §3.86, the same
   call GoalTreeCanvas's dialog records — an always-live data-entry control
   adopts the DS control fill rather than the card's inner fill. */
.chat-input {
  flex: 1;
  /* AspTextarea's own root is a block-level flex column, so it fills this. */
  min-width: 0;
}

/* .btn-send/.btn-upload/.btn-small/.btn-danger visuals now come from AspButton
   (primary / primary / destructive size="sm"); only .btn-upload's layout
   (align-self) is kept below. */

/* Documents Card */
.documents-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
}

.documents-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.documents-card h4 {
  color: var(--text-on-dark);
  font-size: var(--text-base);
  margin: var(--space-lg) 0 var(--space-sm) 0;
}

/* Upload Form */
.upload-section {
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.upload-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.form-row {
  display: flex;
  gap: var(--space-md);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  flex: 1;
}

.form-group label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

/* `.form-group select` has left this selector: both selects are AspSelect now,
   which renders its own trigger past this file's data-v attribute and paints
   the §3.86 control box itself. The `file` input stays native — no DS
   component covers it, and AspInput's §3.85 allowlist excludes the type — so
   it keeps the card-inner box it has always had. */
.form-group input[type="file"] {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
}

/* Layout only — visuals from AspButton (variant="primary"). */
.btn-upload {
  align-self: flex-start;
}

.upload-message {
  font-size: var(--text-sm);
}

.upload-message.success {
  color: var(--feedback-success);
}

.upload-message.error {
  color: var(--feedback-error);
}

/* Document List */
.doc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm);
  background-color: var(--surface-card-inner);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-xs);
}

.doc-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.doc-name {
  color: var(--text-on-dark);
  font-weight: 600;
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 250px;
}

.doc-domain,
.doc-access,
.doc-chunks {
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-xs);
  border-radius: var(--radius-sm);
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
}

/* Mobile */
@media (max-width: 768px) {
  .advisor-view {
    padding: var(--space-md) var(--space-sm);
  }

  .form-row {
    flex-direction: column;
  }

  .doc-info {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2xs);
  }

  .chat-message.user .message-content,
  .chat-message.assistant .message-content {
    max-width: 95%;
  }
}
</style>
