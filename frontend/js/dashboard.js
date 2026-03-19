/**
 * Dashboard - list of named dashboards per project, each with a free-form
 * canvas of visualisation components. Cards are draggable/resizable via interact.js.
 *
 * Position format (new): { xPct, y, wPct, h }
 *   xPct / wPct - % of grid container width  → cards scale with window width
 *   y    / h    - absolute pixels             → vertical scrolling works normally
 *
 * Legacy format { x, y, w, h } is auto-converted on first load.
 *
 * Filter format: { id, label, key, type: 'select'|'range', options?, min?, max?, step?, defaultValue? }
 *   key - the inputs key injected into Python: inputs['key']
 */
const Dashboard = (() => {
  let _projectId = null;
  let _dashboard = null;
  let _vizInstances = {};  // { [id]: { renderer, instance } }
  let _filterValues = {};  // { [filterId]: currentValue }
  let _selectedIds  = new Set();  // card IDs currently selected
  let _wasDragging  = false;      // flag to suppress click-select after drag
  let _guideEls     = [];         // active guide line elements

  const DEFAULT_W_PCT = 35;   // % of container width
  const DEFAULT_H     = 300;  // px
  const GAP           = 20;   // px - must equal SNAP so default positions are on-grid
  const SNAP          = 20;   // px grid snap

  // ── Position helpers ──────────────────────────────────────────────────────

  function _gridW() {
    return document.getElementById('dashboard-grid')?.offsetWidth || 1200;
  }

  /** Return normalised position for id, or a sensible 2-column default. */
  function _pos(id, index) {
    const stored = (_dashboard.positions || {})[id];
    if (stored) {
      if ('xPct' in stored) return stored;          // new format
      // Legacy px → convert x/w to % using current container width
      const gw = _gridW();
      return { xPct: (stored.x || 0) / gw * 100, y: stored.y || 0,
               wPct: (stored.w || 420) / gw * 100, h: stored.h || DEFAULT_H };
    }
    const gw  = _gridW();
    const col = index % 2;
    const row = Math.floor(index / 2);
    return {
      xPct: (GAP + col * (gw * DEFAULT_W_PCT / 100 + GAP)) / gw * 100,
      y:    GAP + row * (DEFAULT_H + GAP),
      wPct: DEFAULT_W_PCT,
      h:    DEFAULT_H,
    };
  }

  // ── Dashboard list ────────────────────────────────────────────────────────

  async function renderList(projectId) {
    _projectId = projectId;
    await _refreshList();
  }

  async function showList(projectId) { return renderList(projectId); }

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
    _filterValues = {};
    _selectedIds.clear();
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById('view-dashboard').classList.remove('d-none');
    document.getElementById('dashboard-title').textContent = _dashboard.name;
    _renderFilterStrip();
    await _render();
  }

  // ── Filter management ─────────────────────────────────────────────────────

  /** Returns the current filter values as an inputs dict (omits "all" / unset values). */
  function _getFilterInputs() {
    const inputs = {};
    (_dashboard.filters || []).forEach(f => {
      let value;
      if (f.type === 'numrange') {
        const lo = _filterValues[f.id + '_lo'] !== undefined ? Number(_filterValues[f.id + '_lo']) : f.min;
        const hi = _filterValues[f.id + '_hi'] !== undefined ? Number(_filterValues[f.id + '_hi']) : f.max;
        if (lo !== f.min || hi !== f.max) value = [lo, hi];
      } else if (f.type === 'daterange') {
        const from = _filterValues[f.id + '_from'];
        const to   = _filterValues[f.id + '_to'];
        if (from || to) value = [from || f.minDate || '', to || f.maxDate || ''];
      } else {
        const val = _filterValues[f.id];
        if (val !== undefined && val !== '__all__') value = val;
      }
      if (value !== undefined) {
        if (f.targets?.length) {
          // New format: each target gets "component_name.column" key
          f.targets.forEach(t => { inputs[`${t.component_name}.${t.column}`] = value; });
        } else if (f.key) {
          // Legacy format: bare column key
          inputs[f.key] = value;
        }
      }
    });
    return inputs;
  }

  function _renderFilterStrip() {
    const strip = document.getElementById('dashboard-filters');
    if (!strip) return;
    const filterDefs = _dashboard.filters || [];
    if (!filterDefs.length) {
      strip.classList.add('d-none');
      strip.innerHTML = '';
      return;
    }
    strip.classList.remove('d-none');
    strip.innerHTML = filterDefs.map(f => {
      if (f.type === 'numrange') {
        const lo = _filterValues[f.id + '_lo'] !== undefined ? _filterValues[f.id + '_lo'] : f.min;
        const hi = _filterValues[f.id + '_hi'] !== undefined ? _filterValues[f.id + '_hi'] : f.max;
        const range = f.max - f.min || 1;
        const loPct = (lo - f.min) / range * 100;
        const hiPct = (hi - f.min) / range * 100;
        return `
          <div class="dash-filter-item">
            <label class="dash-filter-label">${escapeHtml(f.label)}</label>
            <div class="dual-range-wrap">
              <div class="dual-range" id="drange-${f.id}">
                <div class="dual-range-track">
                  <div class="dual-range-fill" id="drange-fill-${f.id}"
                       style="left:${loPct}%;width:${hiPct - loPct}%"></div>
                </div>
                <input type="range" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${lo}"
                       oninput="Dashboard._dualRangeInput('${f.id}','lo',this)"
                       onchange="Dashboard._dualRangeCommit('${f.id}')" />
                <input type="range" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${hi}"
                       oninput="Dashboard._dualRangeInput('${f.id}','hi',this)"
                       onchange="Dashboard._dualRangeCommit('${f.id}')" />
              </div>
              <div class="dual-range-vals">
                <span id="drange-lo-${f.id}">${lo}</span>
                <span id="drange-hi-${f.id}">${hi}</span>
              </div>
            </div>
            <button class="dash-filter-edit" title="Edit filter"
                    onclick="Dashboard._showEditFilter('${f.id}')">✎</button>
            <button class="dash-filter-remove" title="Remove filter"
                    onclick="Dashboard._removeFilter('${f.id}')">✕</button>
          </div>`;
      }

      if (f.type === 'daterange') {
        const from = _filterValues[f.id + '_from'] || '';
        const to   = _filterValues[f.id + '_to'] || '';
        return `
          <div class="dash-filter-item">
            <label class="dash-filter-label">${escapeHtml(f.label)}</label>
            <div class="d-flex align-items-center gap-1">
              <input type="date" class="form-control form-control-sm dash-filter-date"
                     value="${from}" min="${f.minDate || ''}" max="${f.maxDate || ''}"
                     onchange="Dashboard._filterRangeChanged('${f.id}', 'from', this.value)" />
              <span class="text-muted small px-1">–</span>
              <input type="date" class="form-control form-control-sm dash-filter-date"
                     value="${to}" min="${f.minDate || ''}" max="${f.maxDate || ''}"
                     onchange="Dashboard._filterRangeChanged('${f.id}', 'to', this.value)" />
            </div>
            <button class="dash-filter-edit" title="Edit filter"
                    onclick="Dashboard._showEditFilter('${f.id}')">✎</button>
            <button class="dash-filter-remove" title="Remove filter"
                    onclick="Dashboard._removeFilter('${f.id}')">✕</button>
          </div>`;
      }

      // select (categorical)
      const selVal = _filterValues[f.id] !== undefined ? _filterValues[f.id] : '__all__';
      return `
        <div class="dash-filter-item">
          <label class="dash-filter-label">${escapeHtml(f.label)}</label>
          <select class="form-select form-select-sm dash-filter-select"
                  onchange="Dashboard._filterChanged('${f.id}', this.value)">
            <option value="__all__"${selVal === '__all__' ? ' selected' : ''}>All</option>
            ${(f.options || []).map(o =>
              `<option value="${escapeHtml(o)}"${selVal === o ? ' selected' : ''}>${escapeHtml(o)}</option>`
            ).join('')}
          </select>
          <button class="dash-filter-edit" title="Edit filter"
                  onclick="Dashboard._showEditFilter('${f.id}')">✎</button>
          <button class="dash-filter-remove" title="Remove filter"
                  onclick="Dashboard._removeFilter('${f.id}')">✕</button>
        </div>`;
    }).join('');
  }

  async function _filterChanged(filterId, value) {
    _filterValues[filterId] = value;
    await _rerunAllCharts();
  }

  async function _filterRangeChanged(filterId, side, value) {
    _filterValues[filterId + '_' + side] = value;
    await _rerunAllCharts();
  }

  /** Live update of dual-knob slider - updates fill bar and value labels, enforces lo ≤ hi. */
  function _dualRangeInput(filterId, side, input) {
    const wrap    = document.getElementById('drange-' + filterId);
    if (!wrap) return;
    const [loInput, hiInput] = wrap.querySelectorAll('input[type=range]');
    let lo = parseFloat(loInput.value);
    let hi = parseFloat(hiInput.value);

    if (side === 'lo' && lo > hi) { lo = hi; loInput.value = lo; }
    if (side === 'hi' && hi < lo) { hi = lo; hiInput.value = hi; }

    const f = (_dashboard.filters || []).find(f => f.id === filterId);
    if (f) {
      const range = (f.max - f.min) || 1;
      const fill  = document.getElementById('drange-fill-' + filterId);
      if (fill) {
        fill.style.left  = ((lo - f.min) / range * 100) + '%';
        fill.style.width = ((hi - lo) / range * 100) + '%';
      }
    }
    const loLabel = document.getElementById('drange-lo-' + filterId);
    const hiLabel = document.getElementById('drange-hi-' + filterId);
    if (loLabel) loLabel.textContent = lo;
    if (hiLabel) hiLabel.textContent = hi;

    _filterValues[filterId + '_lo'] = lo;
    _filterValues[filterId + '_hi'] = hi;
  }

  /** Triggered on mouseup/touch end - fires the actual chart re-run. */
  async function _dualRangeCommit(filterId) {
    await _rerunAllCharts();
  }

  /** Show a small overlay to view/edit a filter's configuration. */
  function _showEditFilter(filterId) {
    document.getElementById('dash-filter-edit-picker')?.remove();
    const f = (_dashboard.filters || []).find(f => f.id === filterId);
    if (!f) return;

    const typeLabel = f.type === 'numrange' ? 'Numeric range'
                    : f.type === 'daterange' ? 'Date range'
                    : 'Dropdown';

    let configHtml = '';
    if (f.type === 'numrange') {
      configHtml = `
        <div class="mb-2 d-flex gap-2">
          <div><label class="form-label small fw-semibold">Min</label>
            <input id="ef-min" type="number" class="form-control form-control-sm" value="${f.min}" style="width:90px" /></div>
          <div><label class="form-label small fw-semibold">Max</label>
            <input id="ef-max" type="number" class="form-control form-control-sm" value="${f.max}" style="width:90px" /></div>
          <div><label class="form-label small fw-semibold">Step</label>
            <input id="ef-step" type="number" class="form-control form-control-sm" value="${f.step || 1}" style="width:70px" /></div>
        </div>`;
    } else if (f.type === 'daterange') {
      configHtml = `
        <div class="mb-2 d-flex gap-2">
          <div><label class="form-label small fw-semibold">Min date</label>
            <input id="ef-min-date" type="date" class="form-control form-control-sm" value="${f.minDate || ''}" /></div>
          <div><label class="form-label small fw-semibold">Max date</label>
            <input id="ef-max-date" type="date" class="form-control form-control-sm" value="${f.maxDate || ''}" /></div>
        </div>`;
    } else {
      configHtml = `
        <div class="mb-2">
          <label class="form-label small fw-semibold">Options <span class="text-secondary fw-normal">(comma-separated)</span></label>
          <textarea id="ef-options" class="form-control form-control-sm" rows="3">${(f.options || []).join(', ')}</textarea>
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'dash-filter-edit-picker';
    overlay.className = 'dash-picker-overlay';
    overlay.innerHTML = `
      <div class="dash-picker-box">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <strong>Edit filter</strong>
          <button class="btn-close" onclick="document.getElementById('dash-filter-edit-picker').remove()"></button>
        </div>
        <div class="mb-3">
          <label class="form-label small fw-semibold">Filter name</label>
          <input id="ef-label" class="form-control form-control-sm" value="${escapeHtml(f.label)}" />
        </div>
        <div class="mb-3">
          <label class="form-label small fw-semibold">Targets</label>
          <div class="form-control form-control-sm h-auto py-1">
            ${(f.targets || (f.key ? [{ component_name: '', column: f.key }] : [])).map(t =>
              `<div class="small">${t.component_name ? `<span class="text-muted">${escapeHtml(t.component_name)} / </span>` : ''}${escapeHtml(t.column)}</div>`
            ).join('')}
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label small fw-semibold">Type</label>
          <input class="form-control form-control-sm" value="${typeLabel}" disabled />
        </div>
        ${configHtml}
        <button class="btn btn-primary btn-sm w-100"
                onclick="Dashboard._saveEditFilter('${filterId}')">Save</button>
      </div>`;
    document.body.appendChild(overlay);
  }

  async function _saveEditFilter(filterId) {
    const filters = (_dashboard.filters || []).map(f => {
      if (f.id !== filterId) return f;
      const updated = { ...f, label: document.getElementById('ef-label').value.trim() || f.label };
      if (f.type === 'numrange') {
        updated.min  = parseFloat(document.getElementById('ef-min').value)  ?? f.min;
        updated.max  = parseFloat(document.getElementById('ef-max').value)  ?? f.max;
        updated.step = parseFloat(document.getElementById('ef-step').value) ?? f.step;
      } else if (f.type === 'daterange') {
        updated.minDate = document.getElementById('ef-min-date').value || f.minDate;
        updated.maxDate = document.getElementById('ef-max-date').value || f.maxDate;
      } else {
        updated.options = document.getElementById('ef-options').value
          .split(',').map(s => s.trim()).filter(Boolean);
      }
      return updated;
    });
    document.getElementById('dash-filter-edit-picker')?.remove();
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, { filters });
    _renderFilterStrip();
  }

  async function _rerunAllCharts() {
    const filterInputs = _getFilterInputs();
    for (const id of _dashboard.layout) {
      const el = document.getElementById(`dash-viz-${id}`);
      if (el) {
        el.innerHTML = `
          <div class="dash-loading">
            <div class="spinner-border spinner-border-sm text-secondary" role="status">
              <span class="visually-hidden">Loading…</span>
            </div>
          </div>`;
      }
      try {
        const result = await API.execute(_projectId, id, filterInputs);
        if (result.success && result.chart_config) {
          _renderDashViz(id, result.chart_config);
        } else {
          if (el) el.innerHTML = `<p class="text-danger small p-2">${escapeHtml(result.error || 'No chart config.')}</p>`;
        }
      } catch (e) {
        if (el) el.innerHTML = `<p class="text-danger small p-2">${escapeHtml(e.message)}</p>`;
      }
    }
  }

  // _filterPickerMatching - flat list of {component_id, component_name, column, colInfo}
  // for columns matching the currently-selected metric type in the add-filter modal.
  let _filterPickerMatching = [];

  async function showAddFilterModal() {
    document.getElementById('dash-filter-picker')?.remove();
    _filterPickerMatching = [];

    const overlay = document.createElement('div');
    overlay.id = 'dash-filter-picker';
    overlay.className = 'dash-picker-overlay';
    overlay.innerHTML = `
      <div class="dash-picker-box">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <strong>Add a filter</strong>
          <button class="btn-close" onclick="document.getElementById('dash-filter-picker').remove()"></button>
        </div>
        <div class="mb-3">
          <label class="form-label small fw-semibold">Filter name</label>
          <input id="filter-label-input" class="form-control form-control-sm" placeholder="e.g. Date range" />
        </div>
        <div class="mb-3">
          <label class="form-label small fw-semibold d-block mb-2">Metric type</label>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-secondary filter-type-btn" data-ftype="daterange"
                    onclick="Dashboard._filterTypeSelected('daterange')">Date</button>
            <button class="btn btn-sm btn-outline-secondary filter-type-btn" data-ftype="numrange"
                    onclick="Dashboard._filterTypeSelected('numrange')">Numeric</button>
            <button class="btn btn-sm btn-outline-secondary filter-type-btn" data-ftype="select"
                    onclick="Dashboard._filterTypeSelected('select')">Category</button>
          </div>
        </div>
        <div id="filter-col-list" class="mb-3"></div>
        <button class="btn btn-primary btn-sm w-100" id="filter-save-btn"
                disabled onclick="Dashboard._saveFilter()">Add filter</button>
      </div>`;
    document.body.appendChild(overlay);
  }

  async function _filterTypeSelected(type) {
    document.querySelectorAll('.filter-type-btn').forEach(b => {
      b.classList.toggle('btn-secondary', b.dataset.ftype === type);
      b.classList.toggle('btn-outline-secondary', b.dataset.ftype !== type);
    });
    const list = document.getElementById('filter-col-list');
    list.innerHTML = '<div class="text-secondary small">Loading columns…</div>';
    document.getElementById('filter-save-btn').disabled = true;

    try {
      const components = await API.getComponents(_projectId);
      const dataSources = components.filter(c => c.type === 'etl' || c.type === 'model');
      if (!dataSources.length) {
        list.innerHTML = '<p class="text-danger small">No ETL or Model components found. Build one first.</p>';
        return;
      }

      const results = await Promise.allSettled(
        dataSources.map(async c => {
          const cols = await API.inspectColumns(_projectId, c.id);
          return { component_id: c.id, component_name: c.name, columns: cols };
        })
      );

      const dtypeMap = { daterange: 'date', numrange: 'number', select: 'string' };
      const targetDtype = dtypeMap[type];

      _filterPickerMatching = [];
      results.filter(r => r.status === 'fulfilled').forEach(r => {
        const etl = r.value;
        etl.columns.filter(c => c.dtype === targetDtype).forEach(col => {
          _filterPickerMatching.push({
            component_id: etl.component_id,
            component_name: etl.component_name,
            column: col.name,
            colInfo: col,
          });
        });
      });

      if (!_filterPickerMatching.length) {
        const typeName = type === 'daterange' ? 'date' : type === 'numrange' ? 'numeric' : 'categorical';
        list.innerHTML = `<p class="text-secondary small">No ${typeName} columns found across your ETL components.</p>`;
        return;
      }

      list.innerHTML = `
        <label class="form-label small fw-semibold">Apply to columns</label>
        <div class="filter-col-checklist">
          ${_filterPickerMatching.map((m, i) => `
            <label class="filter-col-check-item">
              <input type="checkbox" checked
                     data-comp-id="${m.component_id}"
                     data-comp-name="${escapeHtml(m.component_name)}"
                     data-col="${escapeHtml(m.column)}"
                     data-col-idx="${i}"
                     onchange="Dashboard._filterCheckChanged()" />
              <span class="filter-col-etl-name">${escapeHtml(m.component_name)}</span>
              <span class="text-muted">/</span>
              <span>${escapeHtml(m.column)}</span>
            </label>`).join('')}
        </div>`;
      document.getElementById('filter-save-btn').disabled = false;
    } catch (e) {
      list.innerHTML = `<p class="text-danger small">Error: ${escapeHtml(e.message)}</p>`;
    }
  }

  function _filterCheckChanged() {
    const anyChecked = document.querySelectorAll('#filter-col-list input[type=checkbox]:checked').length > 0;
    document.getElementById('filter-save-btn').disabled = !anyChecked;
  }

  async function _saveFilter() {
    const label = document.getElementById('filter-label-input').value.trim();
    if (!label) { alert('Filter name is required.'); return; }

    const activeBtn = document.querySelector('.filter-type-btn.btn-secondary');
    if (!activeBtn) { alert('Please select a metric type.'); return; }
    const type = activeBtn.dataset.ftype;

    const checked = [...document.querySelectorAll('#filter-col-list input[type=checkbox]:checked')];
    if (!checked.length) { alert('Please select at least one column.'); return; }

    const targets = checked.map(cb => ({
      component_id:   cb.dataset.compId,
      component_name: cb.dataset.compName,
      column:         cb.dataset.col,
    }));

    const selectedInfos = checked.map(cb => _filterPickerMatching[parseInt(cb.dataset.colIdx)]?.colInfo).filter(Boolean);
    const filter = { id: crypto.randomUUID(), label, type, targets };

    if (type === 'numrange') {
      filter.min  = Math.min(...selectedInfos.map(c => c.min ?? 0));
      filter.max  = Math.max(...selectedInfos.map(c => c.max ?? 100));
      const range = filter.max - filter.min || 1;
      filter.step = range > 1000 ? Math.round(range / 100) : range > 100 ? 1 : range > 10 ? 0.1 : 0.01;
    } else if (type === 'daterange') {
      const allDates = selectedInfos.flatMap(c => c.unique_values || []).filter(Boolean).sort();
      filter.minDate = allDates[0] || '';
      filter.maxDate = allDates[allDates.length - 1] || '';
    } else {
      filter.options = [...new Set(selectedInfos.flatMap(c => c.unique_values || []))].sort();
    }

    document.getElementById('dash-filter-picker')?.remove();
    const filters = [...(_dashboard.filters || []), filter];
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, { filters });
    _renderFilterStrip();
  }

  async function _removeFilter(filterId) {
    const filters = (_dashboard.filters || []).filter(f => f.id !== filterId);
    delete _filterValues[filterId];
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, { filters });
    _renderFilterStrip();
    await _rerunAllCharts();
  }

  // ── Add / remove charts ───────────────────────────────────────────────────

  async function addChart() {
    const components = await API.getComponents(_projectId);
    const available = components.filter(
      c => c.type === 'visualisation' && c.code && !_dashboard.layout.includes(c.id)
    );
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
        ${items.length ? items.map(c => `
          <div class="list-card pointer d-flex align-items-center gap-2 mb-2"
               onclick="Dashboard._pickComponent('${c.id}')">
            <span class="component-badge badge-visualisation">viz</span>
            <span>${escapeHtml(c.name)}</span>
          </div>`).join('') : '<p class="text-secondary small">All visualisations already added.</p>'}
        <hr class="my-3" />
        <button class="btn btn-sm btn-outline-primary w-100" onclick="Dashboard._newChartFromPicker()">+ New chart</button>
      </div>`;
    document.body.appendChild(overlay);
  }

  function _newChartFromPicker() {
    document.getElementById('dash-picker')?.remove();
    ComponentList.showCreateModal();
    // Pre-select visualisation type after modal animates in
    setTimeout(() => ComponentList.selectType('visualisation'), 60);
  }

  async function _pickComponent(componentId) {
    document.getElementById('dash-picker')?.remove();
    if (_dashboard.layout.includes(componentId)) return;
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, {
      layout: [..._dashboard.layout, componentId],
    });
    await _render();
  }

  function _destroyDashViz(id) {
    const viz = _vizInstances[id];
    if (!viz) return;
    try {
      if (viz.renderer === 'plotly') Plotly.purge(document.getElementById(`dash-viz-${id}`));
      else viz.instance.destroy();
    } catch (_) {}
  }

  function _reviveFunctions(obj) {
    if (typeof obj === 'string') {
      const s = obj.trim();
      if (s.startsWith('function') || s.match(/^\(.*\)\s*=>/)) {
        try { return new Function('return (' + s + ')')(); } catch (_) {}
      }
      return obj;
    }
    if (Array.isArray(obj)) return obj.map(_reviveFunctions);
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const k of Object.keys(obj)) out[k] = _reviveFunctions(obj[k]);
      return out;
    }
    return obj;
  }

  function _renderDashViz(id, config) {
    _destroyDashViz(id);
    const el = document.getElementById(`dash-viz-${id}`);
    if (!el) return;
    el.innerHTML = '';  // clear spinner
    const renderer = config.renderer || 'chartjs';

    if (renderer === 'plotly') {
      try {
        const layout = { autosize: true, margin: {l:40, r:20, t:30, b:40}, ...config.layout };
        Plotly.newPlot(el, config.data || [], layout, { responsive: true, ...(config.config || {}) });
        _vizInstances[id] = { renderer: 'plotly', instance: el };
      } catch (e) {
        el.innerHTML = `<p class="text-danger small p-2">Plotly error: ${escapeHtml(e.message)}</p>`;
      }
    } else if (renderer === 'tabulator') {
      try {
        const instance = new Tabulator(el, config);
        _vizInstances[id] = { renderer: 'tabulator', instance };
      } catch (e) {
        el.innerHTML = `<p class="text-danger small p-2">Tabulator error: ${escapeHtml(e.message)}</p>`;
      }
    } else {
      el.innerHTML = '<canvas style="width:100%;height:100%"></canvas>';
      const ctx = el.querySelector('canvas').getContext('2d');
      const cfg = _reviveFunctions({
        ...config,
        options: { responsive: true, maintainAspectRatio: false, ...config.options },
      });
      try {
        if (cfg.options?.plugins?.datalabels) {
          cfg.plugins = [...(cfg.plugins || []), ChartDataLabels];
        }
        const instance = new Chart(ctx, cfg);
        _vizInstances[id] = { renderer: 'chartjs', instance };
      } catch (e) {
        el.innerHTML = `<p class="text-danger small p-2">Chart error: ${escapeHtml(e.message)}</p>`;
      }
    }
  }

  async function _removeChart(componentId) {
    const layout = _dashboard.layout.filter(id => id !== componentId);
    const positions = { ...(_dashboard.positions || {}) };
    delete positions[componentId];
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, { layout, positions });
    _destroyDashViz(componentId);
    delete _vizInstances[componentId];
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
    App.showProjectHome();
  }

  // ── Render canvas ─────────────────────────────────────────────────────────

  // ResizeObserver - resizes chart instances when the container grows/shrinks
  const _resizeObserver = new ResizeObserver(() => {
    Object.entries(_vizInstances).forEach(([id, viz]) => {
      if (viz.renderer === 'plotly') {
        try { Plotly.Plots.resize(document.getElementById(`dash-viz-${id}`)); } catch (_) {}
      } else if (viz.renderer === 'chartjs') {
        try { viz.instance.resize(); } catch (_) {}
      }
      // Tabulator handles its own resize
    });
  });

  async function _render() {
    const grid = document.getElementById('dashboard-grid');
    Object.keys(_vizInstances).forEach(id => _destroyDashViz(id));
    _vizInstances = {};
    _resizeObserver.disconnect();

    if (!_dashboard.layout.length) {
      grid.innerHTML = '<p class="text-secondary p-3">No charts yet. Click "+ Add chart" to get started.</p>';
      return;
    }

    // Clear selection on grid background click
    grid.onclick = e => { if (!e.target.closest('.dash-card')) { _selectedIds.clear(); _updateSelectionStyles(); } };

    grid.innerHTML = _dashboard.layout.map((id, i) => {
      const p = _pos(id, i);
      return `
        <div class="dash-card" id="dash-card-${id}"
             onclick="Dashboard._cardClick(event,'${id}')"
             style="left:${p.xPct}%;top:${p.y}px;width:${p.wPct}%;height:${p.h}px">
          <div class="dash-card-header">
            <span class="dash-drag-handle">⠿</span>
            <span class="dash-card-name" id="dash-name-${id}">Loading…</span>
            <button class="dash-card-action ms-auto" title="Edit" onclick="App.openComponent('${id}')">✎</button>
            <button class="dash-card-action" title="Remove" onclick="Dashboard._removeChart('${id}')">✕</button>
          </div>
          <div class="dash-card-body">
            <div id="dash-viz-${id}" class="dash-viz-container">
              <div class="dash-loading">
                <div class="spinner-border spinner-border-sm text-secondary" role="status">
                  <span class="visually-hidden">Loading…</span>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    _dashboard.layout.forEach(id => _initInteract(id));
    _updateGridSize();
    _resizeObserver.observe(grid);

    if (Settings.isSafeMode()) {
      // Safe mode: fetch component names but don't execute; show a run button instead
      for (const id of _dashboard.layout) {
        try {
          const component = await API.getComponent(_projectId, id);
          document.getElementById(`dash-name-${id}`).textContent = component.name;
        } catch (_) {}
        const el = document.getElementById(`dash-viz-${id}`);
        if (el) el.innerHTML = `
          <div class="dash-safe-placeholder">
            <p class="text-secondary small mb-2">🔒 Safe mode - not auto-executed</p>
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="Dashboard._runSingleChart('${id}')">▶ Run</button>
          </div>`;
      }
      return;
    }

    const filterInputs = _getFilterInputs();
    for (const id of _dashboard.layout) {
      try {
        const component = await API.getComponent(_projectId, id);
        document.getElementById(`dash-name-${id}`).textContent = component.name;
        const result = await API.execute(_projectId, id, filterInputs);
        if (result.success && result.chart_config) {
          _renderDashViz(id, result.chart_config);
        } else {
          const el = document.getElementById(`dash-viz-${id}`);
          if (el) el.innerHTML = `<p class="text-danger small p-2">${escapeHtml(result.error || 'No chart config.')}</p>`;
        }
      } catch (e) {
        const el = document.getElementById(`dash-viz-${id}`);
        if (el) el.innerHTML = `<p class="text-danger small p-2">${escapeHtml(e.message)}</p>`;
      }
    }
  }

  async function _runSingleChart(id) {
    const el = document.getElementById(`dash-viz-${id}`);
    if (el) el.innerHTML = `
      <div class="dash-loading">
        <div class="spinner-border spinner-border-sm text-secondary" role="status"></div>
      </div>`;
    try {
      const filterInputs = _getFilterInputs();
      const result = await API.execute(_projectId, id, filterInputs);
      if (result.success && result.chart_config) {
        _renderDashViz(id, result.chart_config);
      } else {
        if (el) el.innerHTML = `<p class="text-danger small p-2">${escapeHtml(result.error || 'No chart config.')}</p>`;
      }
    } catch (e) {
      if (el) el.innerHTML = `<p class="text-danger small p-2">${escapeHtml(e.message)}</p>`;
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  function _cardClick(e, id) {
    if (e.target.closest('.dash-card-action')) return;
    if (_wasDragging) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      if (_selectedIds.has(id)) _selectedIds.delete(id);
      else _selectedIds.add(id);
    } else {
      _selectedIds.clear();
      _selectedIds.add(id);
    }
    _updateSelectionStyles();
  }

  function _updateSelectionStyles() {
    document.querySelectorAll('.dash-card').forEach(card => {
      const id = card.id.replace('dash-card-', '');
      card.classList.toggle('dash-card-selected', _selectedIds.has(id));
    });
  }

  // ── Alignment guides ──────────────────────────────────────────────────────

  function _clearGuides() {
    _guideEls.forEach(el => el.remove());
    _guideEls = [];
  }

  /**
   * Show edge-alignment guides and size-match badges.
   * mode: 'drag' | 'resize'
   */
  function _showGuides(activeId, mode) {
    _clearGuides();
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;
    const active = document.getElementById(`dash-card-${activeId}`);
    if (!active) return;

    const aL = parseFloat(active.style.left)   || 0;
    const aT = parseFloat(active.style.top)    || 0;
    const aW = parseFloat(active.style.width)  || 0;
    const aH = parseFloat(active.style.height) || 0;
    const aR = aL + aW;
    const aB = aT + aH;

    const TPCT = 1.2;   // % threshold for horizontal (x/w) alignment
    const TPX  = 6;     // px threshold for vertical (y/h) alignment

    const vGuides = new Set();  // % positions - vertical lines
    const hGuides = new Set();  // px positions - horizontal lines

    _dashboard.layout.forEach(id => {
      if (id === activeId) return;
      const card = document.getElementById(`dash-card-${id}`);
      if (!card) return;
      const bL = parseFloat(card.style.left)   || 0;
      const bT = parseFloat(card.style.top)    || 0;
      const bW = parseFloat(card.style.width)  || 0;
      const bH = parseFloat(card.style.height) || 0;
      const bR = bL + bW;
      const bB = bT + bH;

      if (mode === 'drag') {
        // Edge alignment guides
        if (Math.abs(aL - bL) < TPCT) vGuides.add(bL);
        if (Math.abs(aR - bR) < TPCT) vGuides.add(bR);
        if (Math.abs(aL - bR) < TPCT) vGuides.add(bR);
        if (Math.abs(aR - bL) < TPCT) vGuides.add(bL);
        if (Math.abs(aT - bT) < TPX)  hGuides.add(bT);
        if (Math.abs(aB - bB) < TPX)  hGuides.add(bB);
        if (Math.abs(aT - bB) < TPX)  hGuides.add(bB);
        if (Math.abs(aB - bT) < TPX)  hGuides.add(bT);
      } else {
        // Size-match badges on cards that share width or height
        if (Math.abs(aW - bW) < TPCT) {
          _addSizeBadge(grid, card, `↔ ${bW.toFixed(1)}%`);
          _addSizeBadge(grid, active, `↔ ${aW.toFixed(1)}%`);
        }
        if (Math.abs(aH - bH) < TPX) {
          _addSizeBadge(grid, card, `↕ ${Math.round(bH)}px`);
          _addSizeBadge(grid, active, `↕ ${Math.round(aH)}px`);
        }
      }
    });

    vGuides.forEach(pct => {
      const line = document.createElement('div');
      line.className = 'dash-guide-v';
      line.style.left = pct + '%';
      grid.appendChild(line);
      _guideEls.push(line);
    });
    hGuides.forEach(px => {
      const line = document.createElement('div');
      line.className = 'dash-guide-h';
      line.style.top = px + 'px';
      grid.appendChild(line);
      _guideEls.push(line);
    });
  }

  function _addSizeBadge(grid, card, text) {
    // Deduplicate - don't add two badges with same text to same card
    const existing = [..._guideEls].find(
      el => el.dataset.cardId === card.id && el.dataset.text === text
    );
    if (existing) return;
    const badge = document.createElement('div');
    badge.className = 'dash-guide-badge';
    badge.textContent = text;
    badge.dataset.cardId = card.id;
    badge.dataset.text   = text;
    // Position badge at bottom-centre of the card; stack upward if multiple badges exist
    const l = parseFloat(card.style.left)   || 0;
    const t = parseFloat(card.style.top)    || 0;
    const w = parseFloat(card.style.width)  || 0;
    const h = parseFloat(card.style.height) || 0;
    const stackOffset = _guideEls.filter(
      el => el.classList.contains('dash-guide-badge') && el.dataset.cardId === card.id
    ).length * 22;
    badge.style.left = `calc(${l}% + ${w / 2}% - 28px)`;
    badge.style.top  = (t + h - 22 - stackOffset) + 'px';
    grid.appendChild(badge);
    _guideEls.push(badge);
  }

  // ── interact.js - drag + resize ───────────────────────────────────────────

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
          start(e) {
            _wasDragging = true;
            e.target.classList.add('dragging');
            // If dragging an unselected card, select only it
            if (!_selectedIds.has(id)) { _selectedIds.clear(); _selectedIds.add(id); _updateSelectionStyles(); }
          },
          move(e) {
            const gw   = _gridW();
            const dxPct = e.dx / gw * 100;
            // Move dragged card
            const curL = parseFloat(e.target.style.left) || 0;
            const curT = parseFloat(e.target.style.top)  || 0;
            e.target.style.left = Math.max(0, curL + dxPct) + '%';
            e.target.style.top  = Math.max(0, curT + e.dy)  + 'px';
            // Move all other selected cards by same delta
            for (const selId of _selectedIds) {
              if (selId === id) continue;
              const card = document.getElementById(`dash-card-${selId}`);
              if (!card) continue;
              card.style.left = Math.max(0, (parseFloat(card.style.left) || 0) + dxPct) + '%';
              card.style.top  = Math.max(0, (parseFloat(card.style.top)  || 0) + e.dy)  + 'px';
            }
            _showGuides(id, 'drag');
          },
          end(e) {
            e.target.classList.remove('dragging');
            // Save positions for all moved cards
            for (const selId of _selectedIds) _saveCardPos(selId);
            _clearGuides();
            _updateGridSize();
            setTimeout(() => { _wasDragging = false; }, 50);
          },
        },
      })
      .resizable({
        edges: { left: true, right: true, bottom: true },
        modifiers: [
          interact.modifiers.restrictSize({ min: { width: 200, height: 150 } }),
          interact.modifiers.snapSize({
            targets: [interact.snappers.grid({ width: SNAP, height: SNAP })],
          }),
        ],
        listeners: {
          start(e) { e.target.classList.add('resizing'); },
          move(e) {
            const gw = _gridW();
            const curL = parseFloat(e.target.style.left) || 0;
            const curT = parseFloat(e.target.style.top) || 0;
            e.target.style.left   = Math.max(0, curL + e.deltaRect.left / gw * 100) + '%';
            e.target.style.top    = Math.max(0, curT + e.deltaRect.top) + 'px';
            e.target.style.width  = (e.rect.width  / gw  * 100) + '%';
            e.target.style.height = e.rect.height + 'px';
            _showGuides(id, 'resize');
          },
          end(e) {
            e.target.classList.remove('resizing');
            _saveCardPos(id);
            _clearGuides();
            _updateGridSize();
            const viz = _vizInstances[id];
            if (viz) {
              if (viz.renderer === 'plotly') Plotly.Plots.resize(document.getElementById(`dash-viz-${id}`));
              else if (viz.renderer === 'chartjs') viz.instance.resize();
            }
          },
        },
      });
  }

  function _saveCardPos(id) {
    const card = document.getElementById(`dash-card-${id}`);
    if (!card) return;
    const gw = _gridW();
    // Quantize to SNAP grid before converting to % - prevents float drift
    // so all saved positions are exactly on the same grid.
    const snap = v => Math.round(v / SNAP) * SNAP;
    const xPx = snap(parseFloat(card.style.left) * gw / 100);
    const wPx = snap(parseFloat(card.style.width) * gw / 100);
    const pos = {
      xPct: Math.max(0, xPx) / gw * 100,
      y:    Math.max(0, snap(parseFloat(card.style.top)    || 0)),
      wPct: Math.max(200, wPx) / gw * 100,
      h:    Math.max(150, snap(parseFloat(card.style.height) || DEFAULT_H)),
    };
    const positions = { ...(_dashboard.positions || {}), [id]: pos };
    _dashboard = { ..._dashboard, positions };
    _persistPositions(positions);
  }

  /** Grow the grid container to always fit all cards (enables vertical scrolling). */
  function _updateGridSize() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;
    let maxBottom = 400;
    _dashboard.layout.forEach((id, i) => {
      const p = (_dashboard.positions || {})[id] || _pos(id, i);
      const y = p.y ?? 0;
      const h = p.h ?? DEFAULT_H;
      maxBottom = Math.max(maxBottom, y + h + GAP);
    });
    grid.style.minHeight = maxBottom + 'px';
  }

  // ── Persist ───────────────────────────────────────────────────────────────

  async function _persistPositions(positions) {
    _dashboard = await API.updateDashboard(_projectId, _dashboard.id, { positions });
  }

  // ── Presentation mode ─────────────────────────────────────────────────────

  function present() {
    document.body.classList.add('presenting');
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  function exitPresent() {
    document.body.classList.remove('presenting');
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    }
  }

  // Sync presenting class when user exits fullscreen via Esc
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) document.body.classList.remove('presenting');
  });
  document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement) document.body.classList.remove('presenting');
  });

  return {
    showList, renderList, showCreateModal,
    addChart, showAddFilterModal, renamePrompt, deleteCurrentDashboard,
    present, exitPresent,
    _openById, _pickComponent, _removeChart, _newChartFromPicker,
    _cardClick,
    _filterChanged, _filterRangeChanged, _dualRangeInput, _dualRangeCommit,
    _filterTypeSelected, _filterCheckChanged, _saveFilter, _removeFilter,
    _showEditFilter, _saveEditFilter, _runSingleChart,
  };
})();
