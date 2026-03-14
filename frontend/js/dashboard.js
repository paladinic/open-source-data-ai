/**
 * Dashboard — list of named dashboards per project, each with a free-form
 * canvas of visualisation components. Cards are draggable/resizable via interact.js.
 */
const Dashboard = (() => {
  let _projectId = null;
  let _dashboard = null;
  let _charts = {};

  const DEFAULT_W = 420;
  const DEFAULT_H = 300;
  const GAP = 16;

  /** Return stored position for id, or a sensible default based on index. */
  function _pos(id, index) {
    const stored = (_dashboard.positions || {})[id];
    if (stored) return stored;
    const col = index % 2;
    const row = Math.floor(index / 2);
    return { x: GAP + col * (DEFAULT_W + GAP), y: GAP + row * (DEFAULT_H + GAP), w: DEFAULT_W, h: DEFAULT_H };
  }

  // ── Dashboard list ────────────────────────────────────────────────────────

  async function showList(projectId) {
    _projectId = projectId;
    _dashboard = null;
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById('view-dashboard-list').classList.remove('d-none');
    await _refreshList();
  }

  async function _refreshList() {
    const dashboards = await API.getDashboards(_projectId);
    const el = document.getElementById('dashboard-list-items');
    if (!dashboards.length) {
      el.innerHTML = '<p class="text-secondary">No dashboards yet. Create one to get started.</p>';
      return;
    }
    el.innerHTML = dashboards.map(d => `
      <div class="list-card d-flex justify-content-between align-items-center">
        <div class="flex-grow-1 pointer" onclick="Dashboard._openById('${d.id}')">
          <div class="fw-semibold">${escapeHtml(d.name)}</div>
          <div class="text-secondary small">${d.layout.length} chart${d.layout.length !== 1 ? 's' : ''}</div>
        </div>
        <button class="btn btn-sm btn-outline-danger ms-3"
                onclick="event.stopPropagation(); Dashboard._deleteFromList('${d.id}')">✕</button>
      </div>`).join('');
  }

  function showCreateModal() {
    const name = prompt('Dashboard name:');
    if (!name?.trim()) return;
    _createDashboard(name.trim());
  }

  async function _createDashboard(name) {
    const d = await API.createDashboard(_projectId, name);
    await _openById(d.id);
  }

  async function _deleteFromList(dashboardId) {
    if (!confirm('Delete this dashboard?')) return;
    await API.deleteDashboard(_projectId, dashboardId);
    _refreshList();
  }

  // ── Open a dashboard ──────────────────────────────────────────────────────

  async function _openById(dashboardId) {
    _dashboard = await API.getDashboard(_projectId, dashboardId);
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById('view-dashboard').classList.remove('d-none');
    document.getElementById('dashboard-title').textContent = _dashboard.name;
    await _render();
  }

  // ── Add / remove charts ───────────────────────────────────────────────────

  async function addChart() {
    const components = await API.getComponents(_projectId);
    const available = components.filter(
      c => c.type === 'visualisation' && c.code && !_dashboard.layout.includes(c.id)
    );
    if (!available.length) {
      alert('No unused visualisation components available. Build one first, or all are already added.');
      return;
    }
    _showPicker(available);
  }

  function _showPicker(items) {
    document.getElementById('dash-picker')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'dash-picker';
    overlay.className = 'dash-picker-overlay';
    overlay.innerHTML = `
      <div class="dash-picker-box">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <strong>Add a chart</strong>
          <button class="btn-close" onclick="document.getElementById('dash-picker').remove()"></button>
        </div>
        ${items.map(c => `
          <div class="list-card pointer d-flex align-items-center gap-2 mb-2"
               onclick="Dashboard._pickComponent('${c.id}')">
            <span class="component-badge badge-visualisation">viz</span>
            <span>${escapeHtml(c.name)}</span>
          </div>`).join('')}
      </div>`;
    document.body.appendChild(overlay);
  }

  async function _pickComponent(componentId) {
    document.getElementById('dash-picker')?.remove();
    if (_dashboard.layout.includes(componentId)) return;
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, {
      layout: [..._dashboard.layout, componentId],
    });
    await _render();
  }

  async function _removeChart(componentId) {
    const layout = _dashboard.layout.filter(id => id !== componentId);
    const positions = { ...(_dashboard.positions || {}) };
    delete positions[componentId];
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, { layout, positions });
    _charts[componentId]?.destroy();
    delete _charts[componentId];
    document.getElementById(`dash-card-${componentId}`)?.remove();
    if (!_dashboard.layout.length) _render();
    _updateGridSize();
  }

  // ── Rename / delete ───────────────────────────────────────────────────────

  async function renamePrompt() {
    const name = prompt('New name:', _dashboard.name);
    if (!name?.trim() || name.trim() === _dashboard.name) return;
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, { name: name.trim() });
    document.getElementById('dashboard-title').textContent = _dashboard.name;
  }

  async function deleteCurrentDashboard() {
    if (!confirm(`Delete dashboard "${_dashboard.name}"?`)) return;
    await API.deleteDashboard(_projectId, _dashboard.id);
    App.showDashboardList();
  }

  // ── Render canvas ─────────────────────────────────────────────────────────

  async function _render() {
    const grid = document.getElementById('dashboard-grid');
    Object.values(_charts).forEach(c => c.destroy());
    _charts = {};

    if (!_dashboard.layout.length) {
      grid.innerHTML = '<p class="text-secondary p-3">No charts yet. Click "+ Add chart" to get started.</p>';
      return;
    }

    grid.innerHTML = _dashboard.layout.map((id, i) => {
      const p = _pos(id, i);
      return `
        <div class="dash-card" id="dash-card-${id}"
             style="width:${p.w}px;height:${p.h}px;transform:translate(${p.x}px,${p.y}px)"
             data-x="${p.x}" data-y="${p.y}">
          <div class="dash-card-header">
            <span class="dash-drag-handle">⠿</span>
            <span class="dash-card-name" id="dash-name-${id}">Loading…</span>
            <button class="dash-card-action ms-auto" title="Edit" onclick="App.openComponent('${id}')">✎</button>
            <button class="dash-card-action" title="Remove" onclick="Dashboard._removeChart('${id}')">✕</button>
          </div>
          <div class="dash-card-body">
            <canvas id="dash-canvas-${id}"></canvas>
          </div>
        </div>`;
    }).join('');

    _dashboard.layout.forEach(id => _initInteract(id));
    _updateGridSize();

    for (const id of _dashboard.layout) {
      try {
        const component = await API.getComponent(_projectId, id);
        document.getElementById(`dash-name-${id}`).textContent = component.name;
        const result = await API.execute(_projectId, id);
        if (result.success && result.chart_config) {
          const ctx = document.getElementById(`dash-canvas-${id}`).getContext('2d');
          // Force responsive + no fixed aspect ratio so chart fills card
          const config = {
            ...result.chart_config,
            options: {
              responsive: true,
              maintainAspectRatio: false,
              ...result.chart_config.options,
            },
          };
          _charts[id] = new Chart(ctx, config);
        } else {
          const body = document.getElementById(`dash-card-${id}`)?.querySelector('.dash-card-body');
          if (body) body.innerHTML = `<p class="text-danger small p-2">${escapeHtml(result.error || 'No chart config.')}</p>`;
        }
      } catch (e) {
        const body = document.getElementById(`dash-card-${id}`)?.querySelector('.dash-card-body');
        if (body) body.innerHTML = `<p class="text-danger small p-2">${escapeHtml(e.message)}</p>`;
      }
    }
  }

  // ── interact.js — drag + resize ───────────────────────────────────────────

  const SNAP = 20;  // grid snap size in px

  function _initInteract(id) {
    interact(`#dash-card-${id}`)
      .draggable({
        allowFrom: '.dash-card-header',
        ignoreFrom: '.dash-card-action',
        modifiers: [
          interact.modifiers.snap({
            targets: [interact.snappers.grid({ x: SNAP, y: SNAP })],
            range: Infinity,
            relativePoints: [{ x: 0, y: 0 }],
          }),
          interact.modifiers.restrict({
            restriction: 'parent',
            elementRect: { top: 0, left: 0, bottom: 1, right: 1 },
          }),
        ],
        listeners: {
          start(e) { e.target.classList.add('dragging'); },
          move(e) {
            const x = (parseFloat(e.target.getAttribute('data-x')) || 0) + e.dx;
            const y = (parseFloat(e.target.getAttribute('data-y')) || 0) + e.dy;
            e.target.style.transform = `translate(${x}px, ${y}px)`;
            e.target.setAttribute('data-x', x);
            e.target.setAttribute('data-y', y);
          },
          end(e) {
            e.target.classList.remove('dragging');
            _saveCardPos(id);
            _updateGridSize();
          },
        },
      })
      .resizable({
        edges: { left: true, right: true, bottom: true },
        modifiers: [
          interact.modifiers.restrictSize({ min: { width: 220, height: 160 } }),
          interact.modifiers.snapSize({
            targets: [interact.snappers.grid({ width: SNAP, height: SNAP })],
          }),
        ],
        listeners: {
          start(e) { e.target.classList.add('resizing'); },
          move(e) {
            // left edge: shift the transform origin to compensate
            const x = (parseFloat(e.target.getAttribute('data-x')) || 0) + e.deltaRect.left;
            const y = (parseFloat(e.target.getAttribute('data-y')) || 0) + e.deltaRect.top;
            e.target.style.transform = `translate(${x}px, ${y}px)`;
            e.target.style.width = `${e.rect.width}px`;
            e.target.style.height = `${e.rect.height}px`;
            e.target.setAttribute('data-x', x);
            e.target.setAttribute('data-y', y);
          },
          end(e) {
            e.target.classList.remove('resizing');
            _saveCardPos(id);
            _updateGridSize();
            if (_charts[id]) _charts[id].resize();
          },
        },
      });
  }

  function _saveCardPos(id) {
    const card = document.getElementById(`dash-card-${id}`);
    if (!card) return;
    const pos = {
      x: Math.round(parseFloat(card.getAttribute('data-x')) || 0),
      y: Math.round(parseFloat(card.getAttribute('data-y')) || 0),
      w: Math.round(card.offsetWidth),
      h: Math.round(card.offsetHeight),
    };
    const positions = { ...(_dashboard.positions || {}), [id]: pos };
    _persistPositions(positions);
  }

  /** Grow the grid container to always fit all cards (enables scrolling). */
  function _updateGridSize() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;
    let maxBottom = 400, maxRight = 500;
    _dashboard.layout.forEach((id, i) => {
      const p = (_dashboard.positions || {})[id] || _pos(id, i);
      maxBottom = Math.max(maxBottom, p.y + p.h + GAP);
      maxRight  = Math.max(maxRight,  p.x + p.w + GAP);
    });
    grid.style.minHeight = maxBottom + 'px';
    grid.style.minWidth  = maxRight  + 'px';
  }

  // ── Persist ───────────────────────────────────────────────────────────────

  async function _persistPositions(positions) {
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, { positions });
  }

  return {
    showList, showCreateModal,
    addChart, renamePrompt, deleteCurrentDashboard,
    _openById, _pickComponent, _removeChart,
  };
})();
