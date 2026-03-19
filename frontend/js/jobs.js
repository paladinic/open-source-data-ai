/**
 * Global job tracker.
 *
 * Tracks two kinds of activity:
 *   AI jobs   — Jobs.add(jobId, componentId) / Jobs.remove(jobId)
 *   Executions — Jobs.startExecution(componentId) / Jobs.endExecution(componentId)
 *
 * Both kinds:
 *   - light up the spinning dot on the component's card in the home list
 *   - increment the navbar badge
 *   - show the "Running…" toast
 */
const Jobs = (() => {
  // internal key → componentId  (AI job: the jobId; execution: 'exec:'+componentId)
  const _jobs = new Map();
  // componentId → Set<key>
  const _byComponent = new Map();

  // ── Internal helpers ────────────────────────────────────────────────────

  function _add(key, componentId) {
    _jobs.set(key, componentId || null);
    if (componentId) {
      if (!_byComponent.has(componentId)) _byComponent.set(componentId, new Set());
      _byComponent.get(componentId).add(key);
    }
    _render();
    _notifyComponentList(componentId);
  }

  function _remove(key) {
    const componentId = _jobs.get(key);
    _jobs.delete(key);
    if (componentId && _byComponent.has(componentId)) {
      _byComponent.get(componentId).delete(key);
      if (_byComponent.get(componentId).size === 0) _byComponent.delete(componentId);
    }
    _render();
    _notifyComponentList(componentId);
  }

  function _render() {
    const total = _jobs.size;

    // Navbar badge
    const badge = document.getElementById('jobs-badge');
    const countEl = document.getElementById('jobs-count');
    if (badge) {
      if (total === 0) {
        badge.style.display = 'none';
      } else {
        if (countEl) countEl.textContent = total;
        badge.style.display = '';
      }
    }

    // Toast
    const toast = document.getElementById('running-toast');
    if (toast) {
      if (total === 0) {
        toast.classList.remove('running-toast-visible');
      } else {
        toast.classList.add('running-toast-visible');
      }
    }
  }

  function _notifyComponentList(componentId) {
    if (componentId && typeof ComponentList !== 'undefined') {
      ComponentList.refreshCard(componentId);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Track an AI chat job (job_id returned by backend). */
  function add(jobId, componentId) { _add(jobId, componentId); }
  function remove(jobId)           { _remove(jobId); }

  /** Track a manual/auto component execution. */
  function startExecution(componentId) { _add(`exec:${componentId}`, componentId); }
  function endExecution(componentId)   { _remove(`exec:${componentId}`); }

  function hasRunningJob(componentId) {
    return _byComponent.has(componentId) && _byComponent.get(componentId).size > 0;
  }

  function count() { return _jobs.size; }

  return { add, remove, startExecution, endExecution, hasRunningJob, count };
})();
