<template>
  <div class="wikipedia-view" :style="viewStyle">
    <div class="wikipedia-toolbar">
      <button class="toolbar-btn" title="Home" @click="goHome">
        <span class="toolbar-icon">&#x1F3E0;</span>
      </button>
      <button class="toolbar-btn" title="Random article" @click="goRandom">
        <span class="toolbar-icon">&#x1F3B2;</span>
      </button>
      <div class="search-wrapper">
        <input
          ref="searchInput"
          v-model="searchQuery"
          class="search-input"
          type="text"
          placeholder="Search Wikipedia..."
          @input="onSearchInput"
          @keydown.down.prevent="moveSuggestion(1)"
          @keydown.up.prevent="moveSuggestion(-1)"
          @keydown.enter.prevent="onEnter"
          @keydown.escape="closeSuggestions"
          @blur="onBlur"
        />
        <ul v-if="suggestions.length" class="suggestions-list">
          <li
            v-for="(s, i) in suggestions"
            :key="s.path"
            :class="{ active: i === selectedIndex }"
            @mousedown.prevent="goToArticle(s.path)"
          >
            {{ s.value }}
          </li>
          <li class="suggestion-search" :class="{ active: selectedIndex === suggestions.length }" @mousedown.prevent="doSearch">
            Search for "{{ searchQuery }}"
          </li>
        </ul>
      </div>
    </div>
    <div v-if="!ready" class="loading-text">Loading Wikipedia...</div>
    <div v-if="error" class="error-text">{{ error }}</div>
    <iframe
      ref="contentFrame"
      :src="iframeSrc"
      class="wikipedia-frame"
      @load="onFrameLoad"
    ></iframe>
  </div>
</template>

<script>
import { sidebarWidth } from '../../global_state_manager.js';

const ZIM = 'wikipedia_en_all_maxi_2026-02';
const CONTENT_BASE = `/api/wikipedia/content/${ZIM}`;

export default {
  data() {
    return {
      ready: false,
      error: null,
      iframeSrc: '',
      searchQuery: '',
      suggestions: [],
      selectedIndex: -1,
      debounceTimer: null,
    };
  },
  computed: {
    viewStyle() {
      return {
        left: sidebarWidth.value,
      };
    },
  },
  methods: {
    onFrameLoad() {
      this.ready = true;
    },
    goHome() {
      this.$refs.contentFrame.src = `${CONTENT_BASE}/Main_Page`;
    },
    goRandom() {
      this.$refs.contentFrame.src = `/api/wikipedia/random?content=${ZIM}`;
    },
    goToArticle(path) {
      this.$refs.contentFrame.src = `${CONTENT_BASE}/${encodeURI(path)}`;
      this.searchQuery = '';
      this.closeSuggestions();
    },
    doSearch() {
      if (!this.searchQuery.trim()) return;
      const q = encodeURIComponent(this.searchQuery.trim());
      this.$refs.contentFrame.src = `/api/wikipedia/search?books.name=${ZIM}&pattern=${q}`;
      this.closeSuggestions();
    },
    onEnter() {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length) {
        this.goToArticle(this.suggestions[this.selectedIndex].path);
      } else {
        this.doSearch();
      }
    },
    onSearchInput() {
      this.selectedIndex = -1;
      clearTimeout(this.debounceTimer);
      if (!this.searchQuery.trim()) {
        this.suggestions = [];
        return;
      }
      this.debounceTimer = setTimeout(() => this.fetchSuggestions(), 200);
    },
    async fetchSuggestions() {
      const term = this.searchQuery.trim();
      if (!term) return;
      try {
        const url = `/api/wikipedia/suggest?content=${ZIM}&term=${encodeURIComponent(term)}&limit=8`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const data = await resp.json();
        this.suggestions = data.filter((s) => s.kind === 'path').slice(0, 8);
      } catch {
        this.suggestions = [];
      }
    },
    moveSuggestion(dir) {
      const max = this.suggestions.length; // includes "Search for" item
      this.selectedIndex = Math.max(-1, Math.min(max, this.selectedIndex + dir));
    },
    closeSuggestions() {
      this.suggestions = [];
      this.selectedIndex = -1;
    },
    onBlur() {
      setTimeout(() => this.closeSuggestions(), 150);
    },
  },
  mounted() {
    const token = localStorage.getItem('user_token');
    if (token) {
      document.cookie = `auth_token=${token}; path=/; SameSite=Strict; max-age=86400`;
    }
    this.iframeSrc = `${CONTENT_BASE}/Main_Page`;
    this.ready = true;
  },
};
</script>

<style scoped>
.wikipedia-view {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  z-index: 1;
}

.wikipedia-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  background-color: var(--surface-card);
  border-bottom: 1px solid var(--border-card);
  flex-shrink: 0;
}

.toolbar-btn {
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-2xs) var(--space-xs);
  cursor: pointer;
  color: var(--text-on-dark);
  font-size: var(--text-base);
  transition: background-color var(--transition-base);
}

.toolbar-btn:hover {
  background-color: var(--surface-card-inner);
}

.toolbar-icon {
  display: inline-block;
  line-height: 1;
}

.search-wrapper {
  position: relative;
  flex: 1;
  max-width: 500px;
}

.search-input {
  width: 100%;
  padding: var(--space-2xs) var(--space-sm);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  outline: none;
  transition: border-color var(--transition-base);
}

.search-input:focus {
  border-color: var(--brand-primary);
}

.search-input::placeholder {
  color: var(--text-on-dark);
  opacity: 0.5;
}

.suggestions-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  background-color: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  z-index: 10;
  max-height: 320px;
  overflow-y: auto;
}

.suggestions-list li {
  padding: var(--space-xs) var(--space-sm);
  cursor: pointer;
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  border-bottom: 1px solid var(--border-subtle);
}

.suggestions-list li:last-child {
  border-bottom: none;
}

.suggestions-list li:hover,
.suggestions-list li.active {
  background-color: var(--surface-card-inner);
}

.suggestion-search {
  font-style: italic;
  opacity: 0.7;
}

.loading-text {
  color: var(--text-muted);
  font-size: var(--text-lg);
  text-align: center;
  padding: var(--space-2xl);
}

.error-text {
  color: var(--feedback-error);
  text-align: center;
  padding: var(--space-lg);
}

.wikipedia-frame {
  flex: 1;
  width: 100%;
  border: none;
}

@media (max-width: 767px) {
  .wikipedia-toolbar {
    padding: var(--space-2xs) var(--space-xs);
  }

  .search-wrapper {
    max-width: none;
  }
}
</style>
