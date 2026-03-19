/**
 * Pipeline view - renders project components and dashboards as a DAG.
 * Layers: ETL sources → transformed ETLs → Visualisations → Dashboards
 * Bezier curves show data flow left → right.
 */
const Pipeline = (() => {
  let _projectId = null;
  let _allNodes  = [];   // unified node list (components + dashboards)
  let _filters   = { etl: true, model: true, visualisation: true, dashboard: true };

  const NODE_W = 190;
  const NODE_H = 62;
  const GAP_X  = 110;
  const GAP_Y  = 18;
  const PAD    = 40;

  // ── Entry point ───────────────────────────────────────────────────────────

  async function render(projectId) {
    _projectId = projectId;
    const [components, dashboards] = await Promise.all([
      API.getComponents(projectId),
      API.getDashboards(projectId),
    ]);

    // Build unified node list
    // Component nodes: { id, name, nodeType: 'etl'|'visualisation', depends_on }
    // Dashboard nodes: { id, name, nodeType: 'dashboard', depends_on: layout[] }
    _allNodes = [
      ...components.map(c => ({ id: c.id, name: c.name, nodeType: c.type, depends_on: c.depends_on || [] })),
      ...dashboards.map(d => ({ id: d.id, name: d.name, nodeType: 'dashboard', depends_on: d.layout || [] })),
    ];

    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById('view-pipeline').classList.remove('d-none');
    _renderToolbar();
    _draw();
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────

  function _renderToolbar() {
    const tb = document.getElementById('pipeline-toolbar');
    if (!tb) return;
    const types = [
      { key: 'etl',           label: 'ETL',          badge: 'badge-etl',           text: 'etl'   },
      { key: 'model',         label: 'Model',         badge: 'badge-model',         text: 'model' },
      { key: 'visualisation', label: 'Visualisation', badge: 'badge-visualisation', text: 'viz'   },
      { key: 'dashboard',     label: 'Dashboard',     badge: 'badge-dashboard',     text: 'dash'  },
    ];
    tb.innerHTML = `
      <span class="small text-muted me-1">Show:</span>
      <div class="dropdown">
        <button class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown"
                aria-expanded="false" id="pipeline-filter-btn">
          ${_filterSummary()}
        </button>
        <ul class="dropdown-menu" onclick="event.stopPropagation()">
          ${types.map(t => `
            <li>
              <label class="dropdown-item d-flex align-items-center gap-2 user-select-none" style="cursor:pointer">
                <input type="checkbox" ${_filters[t.key] ? 'checked' : ''}
                       onchange="Pipeline._toggleFilter('${t.key}', this.checked)" />
                <span class="component-badge ${t.badge} flex-shrink-0">${t.text}</span>
                ${t.label}
              </label>
            </li>`).join('')}
        </ul>
      </div>
      <span class="small text-muted ms-2" id="pipeline-node-count"></span>`;
  }

  function _filterSummary() {
    const on = Object.entries(_filters).filter(([, v]) => v).map(([k]) => k);
    if (on.length === 3) return 'All types';
    if (on.length === 0) return 'None';
    return on.map(k => k === 'visualisation' ? 'Viz' : k.charAt(0).toUpperCase() + k.slice(1)).join(', ');
  }

  function _toggleFilter(key, value) {
    _filters[key] = value;
    // Update button label without closing the dropdown
    const btn = document.getElementById('pipeline-filter-btn');
    if (btn) btn.textContent = _filterSummary() + ' ▾';
    _draw();
  }

  // ── Depth / layer computation ─────────────────────────────────────────────

  function _computeDepths(nodes) {
    const byId     = Object.fromEntries(nodes.map(n => [n.id, n]));
    const depth    = {};
    const visiting = new Set();

    function getDepth(id) {
      if (id in depth) return depth[id];
      if (visiting.has(id)) return 0;
      visiting.add(id);
      const n = byId[id];
      if (!n || !n.depends_on?.length) {
        depth[id] = 0;
      } else {
        const dd = n.depends_on.filter(d => d in byId).map(getDepth);
        depth[id] = dd.length ? Math.max(...dd) + 1 : 0;
      }
      visiting.delete(id);
      return depth[id];
    }

    nodes.forEach(n => getDepth(n.id));
    return depth;
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  function _draw() {
    const container = document.getElementById('pipeline-canvas');

    // Positions are computed over ALL nodes so layout is stable when filtering
    if (!_allNodes.length) {
      container.innerHTML = '<p class="text-secondary p-4">No components yet.</p>';
      return;
    }

    const depths  = _computeDepths(_allNodes);
    const layers  = {};
    _allNodes.forEach(n => {
      const d = depths[n.id] ?? 0;
      (layers[d] = layers[d] || []).push(n);
    });

    Object.values(layers).forEach(nodes => nodes.sort((a, b) => {
      const order = { etl: 0, model: 1, visualisation: 2, dashboard: 3 };
      const od = (order[a.nodeType] ?? 1) - (order[b.nodeType] ?? 1);
      return od !== 0 ? od : a.name.localeCompare(b.name);
    }));

    const layerNums   = Object.keys(layers).map(Number).sort((a, b) => a - b);
    const maxPerLayer = Math.max(...layerNums.map(l => layers[l].length));
    const canvasW     = PAD * 2 + layerNums.length * (NODE_W + GAP_X) - GAP_X;
    const canvasH     = PAD * 2 + maxPerLayer * (NODE_H + GAP_Y) - GAP_Y;

    const pos = {};
    layerNums.forEach((layerIdx, li) => {
      const nodes  = layers[layerIdx];
      const layerH = nodes.length * (NODE_H + GAP_Y) - GAP_Y;
      const startY = PAD + (canvasH - PAD * 2 - layerH) / 2;
      nodes.forEach((n, ni) => {
        const x = PAD + li * (NODE_W + GAP_X);
        const y = startY + ni * (NODE_H + GAP_Y);
        pos[n.id] = { x, y, cy: y + NODE_H / 2 };
      });
    });

    // Apply filter - visible node set
    const visibleIds = new Set(_allNodes.filter(n => _filters[n.nodeType]).map(n => n.id));

    // Update count badge
    const countEl = document.getElementById('pipeline-node-count');
    if (countEl) countEl.textContent = `${visibleIds.size} of ${_allNodes.length} nodes`;

    // SVG edges - only between visible nodes
    let pathsHtml = '';
    _allNodes.forEach(n => {
      if (!visibleIds.has(n.id)) return;
      (n.depends_on || []).forEach(depId => {
        if (!visibleIds.has(depId)) return;
        const src = pos[depId];
        const tgt = pos[n.id];
        if (!src || !tgt) return;
        const x1 = src.x + NODE_W, y1 = src.cy;
        const x2 = tgt.x,          y2 = tgt.cy;
        const mx = (x1 + x2) / 2;
        pathsHtml += `<path class="pipeline-edge" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" marker-end="url(#pl-arrow)" />`;
      });
    });

    // Node HTML - only visible nodes
    const nodesHtml = _allNodes.map(n => {
      if (!visibleIds.has(n.id)) return '';
      const p = pos[n.id];
      if (!p) return '';
      const badgeText  = n.nodeType === 'visualisation' ? 'viz' : n.nodeType === 'dashboard' ? 'dash' : n.nodeType === 'model' ? 'model' : 'etl';
      const clickAction = n.nodeType === 'dashboard'
        ? `Dashboard._openById('${n.id}')`
        : `App.openComponent('${n.id}')`;
      return `
        <div class="pipeline-node pipeline-node-${n.nodeType}"
             style="left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px"
             onclick="${clickAction}">
          <span class="component-badge badge-${n.nodeType} flex-shrink-0">${badgeText}</span>
          <span class="pipeline-node-name">${escapeHtml(n.name)}</span>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="pipeline-wrap" style="width:${canvasW}px;min-height:${canvasH}px">
        <svg class="pipeline-svg" width="${canvasW}" height="${canvasH}">
          <defs>
            <marker id="pl-arrow" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9 Z" class="pipeline-arrowhead" />
            </marker>
          </defs>
          ${pathsHtml}
        </svg>
        ${nodesHtml}
      </div>`;
  }

  return { render, _toggleFilter };
})();
