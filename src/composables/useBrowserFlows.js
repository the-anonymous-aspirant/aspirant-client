import axios from 'axios';

const API_BASE = '/api/browser-flows';

function extractError(err, fallback) {
  return (
    err.response?.data?.error?.message ||
    err.response?.data?.detail ||
    err.message ||
    fallback
  );
}

export function useBrowserFlows() {
  async function listFlows() {
    try {
      const resp = await axios.get(API_BASE);
      return { flows: resp.data || [], error: null };
    } catch (err) {
      return { flows: [], error: extractError(err, 'Could not fetch flows') };
    }
  }

  async function listRuns(flowId, { limit = 20, offset = 0 } = {}) {
    try {
      const resp = await axios.get(`${API_BASE}/${flowId}/runs`, {
        params: { limit, offset },
      });
      return {
        runs: resp.data.runs || [],
        total: resp.data.total ?? 0,
        limit: resp.data.limit ?? limit,
        offset: resp.data.offset ?? offset,
        error: null,
      };
    } catch (err) {
      return {
        runs: [],
        total: 0,
        limit,
        offset,
        error: extractError(err, 'Could not fetch runs'),
      };
    }
  }

  async function triggerRun(flowId) {
    try {
      const resp = await axios.post(`${API_BASE}/${flowId}/run`);
      return { run: resp.data, error: null };
    } catch (err) {
      return { run: null, error: extractError(err, 'Could not trigger run') };
    }
  }

  async function cancelRun(flowId, runId) {
    try {
      const resp = await axios.post(`${API_BASE}/${flowId}/runs/${runId}/cancel`);
      return { run: resp.data, error: null };
    } catch (err) {
      return { run: null, error: extractError(err, 'Could not cancel run') };
    }
  }

  async function getFlowHealth(flowId, { window: healthWindow = 20 } = {}) {
    try {
      const resp = await axios.get(`${API_BASE}/${flowId}/health`, {
        params: { window: healthWindow },
      });
      return { health: resp.data, error: null };
    } catch (err) {
      return { health: null, error: extractError(err, 'Could not fetch flow health') };
    }
  }

  return { listFlows, listRuns, triggerRun, cancelRun, getFlowHealth };
}
