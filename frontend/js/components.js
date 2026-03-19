/**
 * Component list view - the step between project selection and the workspace.
 */
const ComponentList = (() => {
  let _projectId = null;
  let _allComponents = [];

  async function renderList(projectId) {
    _projectId = projectId;
    await refresh();
  }

  // back-compat alias
  async function show(projectId) { return renderList(projectId); }

  async function refresh() {
    _allComponents = await API.getComponents(_projectId);
    applyFilters();
  }

  function applyFilters() {
    const search = (document.getElementById('component-search')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('component-type-filter')?.value || '';
    const sort = document.getElementById('component-sort')?.value || 'name-asc';

    let items = _allComponents.filter(c => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (search && !c.name.toLowerCase().includes(search) && !c.description.toLowerCase().includes(search)) return false;
      return true;
    });

    if (sort === 'name-asc') items.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'name-desc') items.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === 'type') items.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    const el = document.getElementById('component-list-items');
    if (!_allComponents.length) {
      el.innerHTML = '<p class="text-secondary">No components yet. Create one to get started.</p>';
      return;
    }
    if (!items.length) {
      el.innerHTML = '<p class="text-secondary">No components match your search.</p>';
      return;
    }
    el.innerHTML = items.map(c => _cardHtml(c)).join('');
  }

  function _statusDot(c) {
    const running = typeof Jobs !== 'undefined' && Jobs.hasRunningJob(c.id);
    if (running) return '<span class="comp-status-dot comp-status-writing" title="AI is writing this component"></span>';
    if (c.last_run_ok === true)  return '<span class="comp-status-dot comp-status-ok"      title="Last run succeeded"></span>';
    if (c.last_run_ok === false) return '<span class="comp-status-dot comp-status-error"    title="Last run failed"></span>';
    return '<span class="comp-status-dot comp-status-none" title="Never run"></span>';
  }

  function _cardHtml(c) {
    return `
      <div class="list-card d-flex justify-content-between align-items-center"
           id="comp-card-${c.id}" onclick="App.openComponent('${c.id}')">
        <div class="flex-grow-1 pointer">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="component-badge badge-${c.type}">${c.type}</span>
            <span class="fw-semibold">${escapeHtml(c.name)}</span>
            ${_statusDot(c)}
          </div>
          <div class="text-secondary small">${escapeHtml(c.description)}</div>
        </div>
        <button class="btn btn-sm btn-outline-danger ms-3"
                onclick="event.stopPropagation(); ComponentList.deleteComponent('${c.id}')">✕</button>
      </div>`;
  }

  // Called by Jobs module when a job starts/ends, or by Workspace after a run.
  // freshComponent (optional) updates the cached component data before re-rendering the dot.
  function refreshCard(componentId, freshComponent) {
    const idx = _allComponents.findIndex(x => x.id === componentId);
    if (idx === -1) return;
    if (freshComponent) _allComponents[idx] = freshComponent;
    const c = _allComponents[idx];
    const card = document.getElementById(`comp-card-${componentId}`);
    if (!card) return;
    const dot = card.querySelector('.comp-status-dot');
    if (dot) dot.outerHTML = _statusDot(c);
  }

  function showCreateModal() {
    // Reset to step 1
    document.getElementById('wizard-step-1').classList.remove('d-none');
    document.getElementById('wizard-step-2').classList.add('d-none');
    document.getElementById('new-component-name').value = '';
    document.getElementById('new-component-type').value = '';
    document.getElementById('create-modal-title').textContent = 'New component';
    document.getElementById('wizard-footer').innerHTML = '';
    new bootstrap.Modal(document.getElementById('create-component-modal')).show();
  }

  function selectType(type) {
    document.getElementById('new-component-type').value = type;
    document.getElementById('wizard-type-label').textContent = type;
    const titles = { etl: 'New ETL component', model: 'New Model component', visualisation: 'New Visualisation' };
    document.getElementById('create-modal-title').textContent = titles[type] || 'New component';
    document.getElementById('wizard-step-1').classList.add('d-none');
    document.getElementById('wizard-step-2').classList.remove('d-none');
    document.getElementById('wizard-footer').innerHTML = `
      <button class="btn btn-outline-secondary btn-sm" onclick="ComponentList.backToTypeStep()">Back</button>
      <button class="btn btn-primary btn-sm" onclick="ComponentList.createComponent()">Create</button>`;
    setTimeout(() => document.getElementById('new-component-name').focus(), 50);
  }

  function backToTypeStep() {
    document.getElementById('wizard-step-2').classList.add('d-none');
    document.getElementById('wizard-step-1').classList.remove('d-none');
    document.getElementById('create-modal-title').textContent = 'New component';
    document.getElementById('wizard-footer').innerHTML = '';
  }

  async function createComponent() {
    const name = document.getElementById('new-component-name').value.trim();
    const type = document.getElementById('new-component-type').value;
    if (!name || !type) return;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      document.getElementById('new-component-name-error').textContent =
        'Only letters, digits and underscores allowed. Must start with a letter or _.';
      return;
    }
    if (_allComponents.some(c => c.name === name)) {
      document.getElementById('new-component-name-error').textContent =
        `A component named "${name}" already exists.`;
      return;
    }
    document.getElementById('new-component-name-error').textContent = '';
    bootstrap.Modal.getInstance(document.getElementById('create-component-modal'))?.hide();
    const c = await API.createComponent(_projectId, name, type);
    App.openComponent(c.id);
  }

  async function deleteComponent(componentId) {
    const dependents = _allComponents.filter(c => c.depends_on?.includes(componentId));
    let msg = 'Delete this component?';
    if (dependents.length) {
      const names = dependents.map(c => c.name).join(', ');
      msg = `The following components depend on this one and will break if it is deleted:\n\n  ${names}\n\nDelete anyway?`;
    }
    if (!confirm(msg)) return;
    await API.deleteComponent(_projectId, componentId);
    refresh();
  }

  return { show, renderList, refresh, applyFilters, refreshCard, showCreateModal, selectType, backToTypeStep, createComponent, deleteComponent };
})();
