import { ref } from 'vue';
import axios from 'axios';

export function useGoalNodes(treeId) {
  const nodes = ref([]);
  const edges = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchNodes() {
    loading.value = true;
    error.value = null;
    try {
      const resp = await axios.get(`/api/goals/trees/${treeId.value}/nodes`);
      const items = resp.data.items || resp.data || [];
      nodes.value = items;
      edges.value = items
        .filter((n) => n.parent_id)
        .map((n) => ({ from_id: n.parent_id, to_id: n.id }));
    } catch (err) {
      error.value = err.response?.data?.error?.message || err.message;
    }
    loading.value = false;
  }

  async function createNode(payload) {
    const resp = await axios.post(`/api/goals/trees/${treeId.value}/nodes`, payload);
    await fetchNodes();
    return resp.data;
  }

  async function updateNode(nodeId, payload) {
    const resp = await axios.patch(`/api/goals/trees/${treeId.value}/nodes/${nodeId}`, payload);
    await fetchNodes();
    return resp.data;
  }

  async function deleteNode(nodeId) {
    await axios.delete(`/api/goals/trees/${treeId.value}/nodes/${nodeId}`);
    await fetchNodes();
  }

  async function completeNode(nodeId) {
    const resp = await axios.post(`/api/goals/trees/${treeId.value}/nodes/${nodeId}/complete`);
    await fetchNodes();
    return resp.data;
  }

  async function uncompleteNode(nodeId) {
    const resp = await axios.post(`/api/goals/trees/${treeId.value}/nodes/${nodeId}/uncomplete`);
    await fetchNodes();
    return resp.data;
  }

  async function updateSortOrder(nodeId, sortOrder) {
    return updateNode(nodeId, { sort_order: sortOrder });
  }

  return {
    nodes,
    edges,
    loading,
    error,
    fetchNodes,
    createNode,
    updateNode,
    deleteNode,
    completeNode,
    uncompleteNode,
    updateSortOrder,
  };
}
