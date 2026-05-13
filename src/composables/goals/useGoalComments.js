import { ref } from 'vue';
import axios from 'axios';

export function useGoalComments(nodeId) {
  const comments = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchComments() {
    if (!nodeId.value) return;
    loading.value = true;
    error.value = null;
    try {
      const resp = await axios.get(`/api/goals/nodes/${nodeId.value}/comments`);
      comments.value = resp.data || [];
    } catch (err) {
      error.value = err.response?.data?.error?.message || err.message;
    }
    loading.value = false;
  }

  async function addComment(body) {
    const resp = await axios.post(`/api/goals/nodes/${nodeId.value}/comments`, { body });
    await fetchComments();
    return resp.data;
  }

  async function updateComment(commentId, body) {
    const resp = await axios.patch(`/api/goals/comments/${commentId}`, { body });
    await fetchComments();
    return resp.data;
  }

  async function deleteComment(commentId) {
    await axios.delete(`/api/goals/comments/${commentId}`);
    await fetchComments();
  }

  return {
    comments,
    loading,
    error,
    fetchComments,
    addComment,
    updateComment,
    deleteComment,
  };
}
