/**
 * Component list view — the step between project selection and the workspace.
 */
const ComponentList = (() => {
  let _projectId = null;

  async function show(projectId) {
    _projectId = projectId;
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById('view-component-list').classList.remove('d-none');
    await refresh();
  }

  async function refresh() {
    const components = await API.getComponents(_projectId);
    const el = document.getElementById('component-list-items');
    if (!components.length) {
      el.innerHTML = '<p class="text-secondary">No components yet. Create one to get started.</p>';
      return;
    }
    el.innerHTML = components.map(c => `
      <div class="list-card d-flex justify-content-between align-items-center"
           onclick="App.openComponent('${c.id}')">
        <div class="flex-grow-1 pointer">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="component-badge badge-${c.type}">${c.type}</span>
            <span class="fw-semibold">${escapeHtml(c.name)}</span>
          </div>
          <div class="text-secondary small">${escapeHtml(c.description)}</div>
        </div>
        <button class="btn btn-sm btn-outline-danger ms-3"
                onclick="event.stopPropagation(); ComponentList.deleteComponent('${c.id}')">✕</button>
      </div>
    `).join('');
  }

  function showCreateModal() {
    document.getElementById('new-component-name').value = '';
    document.getElementById('new-component-type').value = 'connector';
    new bootstrap.Modal(document.getElementById('create-component-modal')).show();
  }

  async function createComponent() {
    const name = document.getElementById('new-component-name').value.trim();
    const type = document.getElementById('new-component-type').value;
    if (!name) return;
    bootstrap.Modal.getInstance(document.getElementById('create-component-modal'))?.hide();
    const c = await API.createComponent(_projectId, name, type);
    App.openComponent(c.id);
  }

  async function deleteComponent(componentId) {
    if (!confirm('Delete this component?')) return;
    await API.deleteComponent(_projectId, componentId);
    refresh();
  }

  return { show, refresh, showCreateModal, createComponent, deleteComponent };
})();
