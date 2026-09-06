<template>
  <div class="messageBoard">
    <div class="messageboard-content">
      <div class="messageboard-header">
        <h1>Anything to say?</h1>
        <form @submit.prevent="submitForm" class="message-form">
          <AspInput v-model="newMessage" label="New Message" />
          <AspButton type="submit" class="submit-btn">Submit</AspButton>
        </form>
      </div>

      <div class="messages-container">
        <!-- Before #5302 this section had no states at all: every fetch failure
             went to console.error and left the same empty rectangle a thread
             with no messages produces. Loading, failed and empty are now three
             different things on screen. -->
        <ReadState
          :state="readState"
          :heading="readState === 'failed' ? 'The message board did not load' : 'Nothing here yet'"
          :message="
            readState === 'failed'
              ? 'We could not fetch the messages. This is usually temporary.'
              : 'Be the first to say something — the box above posts to everyone.'
          "
          :still-works="readState === 'failed' ? 'You can still post; your message will appear once the board loads.' : ''"
          skeleton="text"
          :lines="4"
          @retry="loadBoard"
        >
        <ul class="messageboard-list">
          <li
            v-for="(message, index) in messages"
            :key="index"
            class="rounded-list-item spaced-list-item message-item"
          >
            <UserAvatar
              class="message-avatar"
              :avatar-url="senderAvatarUrl(message.SenderID)"
              :name="formatSender(message.SenderID)"
              :size="40"
            />
            <div class="message-body">
              <div class="text-h6">{{ message.Content }}</div>
              <div class="text-subtitle-2">
                <span class="sender-info">{{ formatSender(message.SenderID) }}</span> •
                <AspTimeSince class="message-time" :datetime="message.SentAt" />
              </div>
            </div>
          </li>
        </ul>
        </ReadState>
      </div>
    </div>
  </div>
</template>

<script>
  import { computed, ref, onMounted } from 'vue';
  import axios from 'axios';
  import assetManager from '../../../asset_manager.js';
  import { AspTimeSince, AspInput, AspButton } from '@aspirant/design-system';
  import UserAvatar from '../../../components/UserAvatar.vue';
  import ReadState from '../../../components/ReadState.vue';

  export default {
    components: { UserAvatar, AspTimeSince, AspInput, AspButton, ReadState },
    setup() {
      const messages = ref([]);
      // Three-way, not a boolean: `failed` has to survive a reload that returns
      // no messages, or a broken board would quietly become an empty one.
      const loadFailed = ref(false);
      const loading = ref(true);
      const newMessage = ref('');
      const usersMap = ref({});
      const messageUserIconUrl = ref('');

      const fetchAllUsers = async () => {
        try {
          const response = await axios.get('/api/data_models/users');
          const users = response.data.items || response.data.data || [];

          // Create a map of users by ID for easy lookup
          users.forEach((user) => {
            // Make sure we use the correct property name for the ID
            const userId = user.ID || user.Id || user.id;
            usersMap.value[userId] = user;
          });

          console.log('Users fetched:', users.length);
        } catch (error) {
          console.error('Error fetching users:', error);
        }
      };

      const fetchMessages = async () => {
        try {
          const response = await axios.get('/api/data_models/message');
          messages.value = response.data.items || response.data.data;
        } catch (error) {
          // Logged AND recorded. The console line is for us; the flag is what
          // the page renders from. Before this, only the first existed.
          console.error('Error fetching messages:', error);
          throw error;
        }
      };

      const submitForm = async () => {
        if (newMessage.value.trim() === '') return;

        try {
          const response = await axios.post('/api/data_models/message', {
            Content: newMessage.value,
            SentAt: new Date().toISOString(),
          });

          if (response.status === 200) {
            // Optionally, you can add the new message to the messages array
            await fetchMessages();
            newMessage.value = ''; // Clear the input field
          }
        } catch (error) {
          console.error('Error submitting message:', error);
        }
      };

      const formatSender = (senderId) => {
        if (senderId === 0) return 'Anonymous';

        const user = usersMap.value[senderId];

        if (user) {
          // #4223 item 4: prefer the display name over the raw username; fall
          // back to username (then a generic label) so a user whose display
          // name the server hasn't sent yet still renders a name, not a blank.
          return user.display_name || user.username || `User ${senderId}`;
        }

        console.log(`No user found for ID: ${senderId}`);
        return `User ${senderId}`;
      };

      // The author's avatar URL (avatar_url on the public user DTO), or '' when
      // the sender is anonymous / unknown / has no picture — in which case
      // UserAvatar renders the initials placeholder, so no author strip is left
      // in a mixed state.
      const senderAvatarUrl = (senderId) => {
        if (senderId === 0) return '';
        const user = usersMap.value[senderId];
        return (user && user.avatar_url) || '';
      };

      // The board is the messages. A failure to resolve author names or the
      // icon degrades the render; a failure to fetch messages IS the failure,
      // which is why only that one sets the state.
      const loadBoard = async () => {
        loading.value = true;
        loadFailed.value = false;
        try {
          await fetchMessages();
        } catch {
          loadFailed.value = true;
        } finally {
          loading.value = false;
        }
      };

      const readState = computed(() => {
        if (loading.value) return 'loading';
        if (loadFailed.value) return 'failed';
        return messages.value.length ? 'ready' : 'empty';
      });

      onMounted(async () => {
        // Load the message user icon
        try {
          messageUserIconUrl.value = await assetManager.getAsset('message_user_icon');
        } catch (error) {
          console.error('Error loading message user icon:', error);
        }

        await fetchAllUsers();
        await loadBoard();
      });

      return {
        messages,
        newMessage,
        messageUserIconUrl,
        readState,
        loadBoard,
        submitForm,
        formatSender,
        senderAvatarUrl,
      };
    },
  };
</script>

<style scoped>
  .messageBoard {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100vh;
    color: var(--text-on-light);
    width: 100%;
    padding: var(--space-lg);
    overflow: hidden;
  }

  .messageboard-content {
    width: 100%;
    max-width: 800px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .messageboard-header {
    flex-shrink: 0;
    margin-bottom: var(--space-lg);
  }

  .messages-container {
    flex-grow: 1;
    overflow-y: auto;
    border: 2px solid var(--surface-card);
    border-radius: var(--radius-lg);
    padding: var(--space-sm);
    background-color: var(--surface-card);
    scrollbar-width: thin;
    scrollbar-color: var(--brand-accent) var(--surface-card);
  }

  .messages-container::-webkit-scrollbar {
    width: 8px;
  }

  .messages-container::-webkit-scrollbar-track {
    background: var(--surface-card);
    border-radius: var(--radius-sm);
  }

  .messages-container::-webkit-scrollbar-thumb {
    background-color: var(--brand-accent);
    border-radius: var(--radius-sm);
  }

  .messageboard-list {
    background-color: transparent;
    color: var(--text-on-light);
    text-align: left;
    /* Native <ul> reset (was a Vuetify <v-list>, #4294). */
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .message-form {
    padding: var(--space-md);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-lg);
    background-color: var(--surface-card);
    margin-bottom: var(--space-md);
    color: var(--text-on-dark);
  }

  .submit-btn {
    display: block;
    margin: var(--space-sm) auto 0;
  }

  .submit-btn:hover {
    background-color: var(--brand-accent) !important;
    color: var(--text-on-dark);
  }

  .spaced-list-item {
    margin-bottom: var(--space-xs);
    border-radius: var(--radius-md);
    border: 1px solid var(--surface-card);
    background-color: var(--surface-elevated);
  }

  /* #4294: native <li> row layout replaces v-list-item. The avatar sits left of
     the message body with a fixed gap. #4223 item 3 kept: the gap between the
     author avatar and the message text (previously the Vuetify
     .v-list-item__spacer, now a native flex gap). */
  .message-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-sm);
  }

  .sender-info {
    font-weight: 600;
    color: var(--brand-primary);
  }

  /* #4223 item 5: the relative timestamp (AspTimeSince) reads as secondary text
     in the author strip. */
  .message-time {
    color: var(--text-muted);
  }
</style>
