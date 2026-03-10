<template>
  <div class="messageBoard">
    <div class="messageboard-content">
      <div class="messageboard-header">
        <h1>Anything to say?</h1>
        <v-form @submit.prevent="submitForm" class="message-form">
          <v-text-field v-model="newMessage" label="New Message"></v-text-field>
          <v-btn type="submit" color="var(--brand-primary)" class="submit-btn" rounded="l">Submit</v-btn>
        </v-form>
      </div>

      <div class="messages-container">
        <v-list class="messageboard-list">
          <v-list-item
            v-for="(message, index) in messages"
            :key="index"
            :prepend-avatar="messageUserIconUrl"
            class="rounded-list-item spaced-list-item message-item"
          >
            <div>
              <div class="text-h6">{{ message.Content }}</div>
              <div class="text-subtitle-2">
                <span class="sender-info">{{ formatSender(message.SenderID) }}</span> •
                {{ formatDate(message.SentAt) }}
              </div>
            </div>
            <v-divider inset></v-divider>
          </v-list-item>
        </v-list>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref, onMounted } from 'vue';
  import axios from 'axios';
  import assetManager from '../asset_manager.js';

  export default {
    setup() {
      const messages = ref([]);
      const newMessage = ref('');
      const usersMap = ref({});
      const messageUserIconUrl = ref('');

      const fetchAllUsers = async () => {
        try {
          const response = await axios.get('/api/data_models/users');
          const users = response.data.data || [];

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
          messages.value = response.data.data;
        } catch (error) {
          console.error('Error fetching messages:', error);
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

      const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString();
      };

      const formatSender = (senderId) => {
        if (senderId === 0) return 'Anonymous';

        const user = usersMap.value[senderId];

        if (user) {
          const username = user.username;
          return username || `User ${senderId}`;
        }

        console.log(`No user found for ID: ${senderId}`);
        return `User ${senderId}`;
      };

      onMounted(async () => {
        // Load the message user icon
        try {
          messageUserIconUrl.value = await assetManager.getAsset('message_user_icon');
        } catch (error) {
          console.error('Error loading message user icon:', error);
        }
        
        await fetchAllUsers();
        await fetchMessages();
      });

      return {
        messages,
        newMessage,
        messageUserIconUrl,
        submitForm,
        formatDate,
        formatSender,
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

  .message-item :deep(.v-avatar) {
    width: 30px !important;
    height: 30px !important;
  }

  .message-item :deep(.v-avatar img) {
    width: 30px !important;
    height: 30px !important;
  }

  .sender-info {
    font-weight: 600;
    color: var(--brand-primary);
  }
</style>
