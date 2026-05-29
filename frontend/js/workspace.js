/**
 * Component workspace - notebook-style editor.
 * Each component stores an ordered array of cells [{id, source}].
 * Cells run top-to-bottom in a shared namespace; `inputs` dict is injected.
 */
const Workspace = (() => {
  let _projectId = null;
  let _component = null;
  let _cells = [];        // [{id, source}]
  let _editors = {};      // {cellId: monacoEditor}
  let _cellViz = {};      // {cellId: {renderer, instance}}
  let _cellOutputs = {};  // {cellId: result} - persisted across _renderCells re-draws
  // Outputs survive component switches (keyed by componentId → cellId)
  const _globalOutputCache = {};
  let _monacoReady = false;
  let _autoSaveTimer = null;
  let _commandCellId = null;
  let _completionsRegistered = false;
  const _applyingRemote = new Set();
  const _remoteDecorations = {};
  const _broadcastTimers = {};

  function _debouncedBroadcast(cellId, editor) {
    clearTimeout(_broadcastTimers[cellId]);
    _broadcastTimers[cellId] = setTimeout(() => {
      Collab.broadcastCellChange(cellId, editor.getValue());
    }, 350);
  }

  function _throttle(fn, ms) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...args); }
    };
  }

  // ── Public entry point ────────────────────────────────────────────────────

  async function open(projectId, component) {
    _projectId = projectId;
    _component = component;

    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById('view-workspace').classList.remove('d-none');

    document.getElementById('ws-component-name').textContent = component.name;
    Collab.join(component.id, App.getUserEmail());
    document.getElementById('ws-component-type').textContent = component.type;
    document.getElementById('ws-component-type').className = `component-badge badge-${component.type}`;
    document.getElementById('ws-autosave-status').textContent = '';
    document.getElementById('chat-messages').innerHTML = '';

    _loadCells(component);
    _initNotebook();
    Chat.init(projectId, component.id);
  }

  function _loadCells(component) {
    // Restore any outputs from a previous visit to this component this session
    _cellOutputs = { ...(_globalOutputCache[component.id] || {}) };
    if (component.cells && component.cells.length) {
      _cells = component.cells.map(c => ({ id: c.id, source: c.source || '' }));
    } else if (component.code) {
      _cells = [{ id: _uid(), source: component.code }];
    } else {
      _cells = [{ id: _uid(), source: '' }];
    }
  }

  function _uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  // ── Monaco initialization ─────────────────────────────────────────────────

  function _initNotebook() {
    Object.values(_editors).forEach(e => { try { e.dispose(); } catch (_) {} });
    _editors = {};
    _cellViz = {};

    if (typeof require === 'undefined' || !_monacoReady) {
      require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs' } });
      require(['vs/editor/editor.main'], () => {
        _monacoReady = true;
        _registerPythonCompletions();
        _renderCells();
      });
    } else {
      _renderCells();
    }
  }

  // ── Cell rendering ────────────────────────────────────────────────────────

  function _renderCells() {
    _commandCellId = null;
    // Sync any in-flight editor content to _cells before disposing
    Object.entries(_editors).forEach(([id, ed]) => {
      const cell = _cells.find(c => c.id === id);
      if (cell) cell.source = ed.getValue();
    });
    Object.values(_editors).forEach(e => { try { e.dispose(); } catch (_) {} });
    _editors = {};

    const container = document.getElementById('notebook-cells');
    container.innerHTML = '';
    _cells.forEach((cell, i) => {
      container.appendChild(_addBar(cell.id));
      container.appendChild(_cellEl(cell, i));
    });
    container.appendChild(_addBar(null));
    _cells.forEach(cell => {
      _mountEditor(cell);
      // Re-hydrate output if this cell has a stored result (survive re-renders)
      if (_cellOutputs[cell.id]) _showCellOutput(cell.id, _cellOutputs[cell.id]);
    });
  }

  function _addBar(afterId) {
    const bar = document.createElement('div');
    bar.className = 'nb-add-bar';
    bar.onclick = () => addCell(afterId);
    bar.innerHTML = '<span>+ cell</span>';
    return bar;
  }

  function _cellEl(cell) {
    const el = document.createElement('div');
    el.className = 'nb-cell';
    el.id = `nc-${cell.id}`;
    el.innerHTML = `
      <div class="nb-cell-gutter">
        <button class="nb-run-btn" title="Run cell (runs all cells up to here)" onclick="Workspace.runCell('${cell.id}')">▶</button>
      </div>
      <div class="nb-cell-main">
        <div class="nb-cell-actions">
          <button class="nb-action-btn" title="Move up"   onclick="Workspace.moveCell('${cell.id}',-1)">↑</button>
          <button class="nb-action-btn" title="Move down" onclick="Workspace.moveCell('${cell.id}',1)">↓</button>
          <button class="nb-action-btn nb-action-delete" title="Delete cell" onclick="Workspace.deleteCell('${cell.id}')">✕</button>
        </div>
        <div class="nb-editor-wrap" id="ce-${cell.id}"></div>
        <div class="nb-cell-output d-none" id="co-${cell.id}"></div>
      </div>`;
    return el;
  }

  function _mountEditor(cell) {
    const container = document.getElementById(`ce-${cell.id}`);
    if (!container || _editors[cell.id]) return;

    const editor = monaco.editor.create(container, {
      value: cell.source,
      language: 'python',
      theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'vs' : 'vs-dark',
      fontSize: 13,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      scrollbar: { vertical: 'hidden', alwaysConsumeMouseWheel: false },
      overviewRulerLanes: 0,
      automaticLayout: true,
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      padding: { top: 8, bottom: 8 },
      quickSuggestions: { other: true, comments: false, strings: false },
      suggestOnTriggerCharacters: true,
    });

    const updateHeight = () => {
      const h = Math.max(editor.getContentHeight(), 40);
      container.style.height = `${h}px`;
      editor.layout();
    };
    editor.onDidContentSizeChange(updateHeight);
    updateHeight();

    editor.onDidChangeModelContent(() => {
      cell.source = editor.getValue();
      _scheduleAutoSave();
      if (!_applyingRemote.has(cell.id)) {
        _debouncedBroadcast(cell.id, editor);
      }
    });

    editor.onDidChangeCursorPosition(
      _throttle(({ position }) => {
        Collab.broadcastCursor(cell.id, position.lineNumber, position.column);
      }, 80)
    );

    // editor.onKeyDown fires inside Monaco's own event pipeline — before Monaco
    // dispatches any command. DOM capture listeners on container are unreliable
    // because Monaco registers its own capture listeners higher up (on document).
    editor.onKeyDown(e => {
      const enter = e.keyCode === monaco.KeyCode.Enter;
      if (enter && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Shift+Enter: run this cell
        e.preventDefault();
        e.stopPropagation();
        runCell(cell.id);
      } else if (enter && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        // Ctrl/Cmd+Enter: run in background, immediately advance to next or create cell
        e.preventDefault();
        e.stopPropagation();
        const idx = _cells.findIndex(c => c.id === cell.id);
        runCell(cell.id);
        if (idx >= 0 && idx < _cells.length - 1) {
          setTimeout(() => _editors[_cells[idx + 1].id]?.focus(), 10);
        } else {
          addCell(cell.id);
        }
      } else if (e.keyCode === monaco.KeyCode.Escape && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Escape: enter command mode
        _enterCommandMode(cell.id);
      }
    });

    // Exit command mode when user clicks back into editor
    editor.onDidFocusEditorText(() => _exitCommandMode(cell.id));

    // Cell element keyboard handler for command mode
    const cellEl = document.getElementById(`nc-${cell.id}`);
    if (cellEl) {
      cellEl.setAttribute('tabindex', '0');
      cellEl.addEventListener('keydown', (e) => {
        if (_commandCellId !== cell.id) return;
        const idx = _cells.findIndex(c => c.id === cell.id);
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            _exitCommandMode(cell.id);
            editor.focus();
            break;
          case 'a':
            e.preventDefault();
            _addCellAt(idx);
            break;
          case 'b':
            e.preventDefault();
            addCell(cell.id);
            break;
          case 'd': case 'x':
            e.preventDefault();
            deleteCell(cell.id);
            break;
          case 'ArrowUp': case 'k':
            e.preventDefault();
            if (idx > 0) _enterCommandMode(_cells[idx - 1].id);
            break;
          case 'ArrowDown': case 'j':
            e.preventDefault();
            if (idx < _cells.length - 1) _enterCommandMode(_cells[idx + 1].id);
            break;
        }
      });
    }

    _editors[cell.id] = editor;
  }

  // ── Command mode ──────────────────────────────────────────────────────────

  function _enterCommandMode(cellId) {
    if (_commandCellId && _commandCellId !== cellId) {
      document.getElementById(`nc-${_commandCellId}`)?.classList.remove('nb-cell-command');
    }
    _commandCellId = cellId;
    const cellEl = document.getElementById(`nc-${cellId}`);
    if (cellEl) { cellEl.classList.add('nb-cell-command'); cellEl.focus(); }
    _editors[cellId]?.getDomNode()?.blur();
  }

  function _exitCommandMode(cellId) {
    if (_commandCellId !== cellId) return;
    _commandCellId = null;
    document.getElementById(`nc-${cellId}`)?.classList.remove('nb-cell-command');
  }

  // Insert a new empty cell at array index idx (i.e. above the cell currently at idx)
  function _addCellAt(idx) {
    const newCell = { id: _uid(), source: '' };
    _cells.splice(idx, 0, newCell);
    _renderCells();
    setTimeout(() => _enterCommandMode(newCell.id), 50);
    _scheduleAutoSave();
  }

  // ── Python autocomplete ────────────────────────────────────────────────────

  function _registerPythonCompletions() {
    if (_completionsRegistered) return;
    _completionsRegistered = true;

    const METHODS = {
      pd:  ['DataFrame','Series','read_csv','read_excel','read_json','read_sql','read_parquet',
             'concat','merge','pivot_table','get_dummies','to_datetime','date_range',
             'cut','qcut','notnull','isnull','isna','notna','NA','NaT','Index'],
      np:  ['array','zeros','ones','arange','linspace','mean','std','sum','max','min',
             'reshape','concatenate','stack','vstack','hstack','random','dot',
             'where','unique','argmax','argmin','sqrt','log','log2','exp','abs',
             'ceil','floor','round','inf','nan','pi','e','newaxis'],
      df:  ['head','tail','describe','info','shape','columns','dtypes','index','values',
             'groupby','sort_values','sort_index','fillna','dropna','rename','merge',
             'join','pivot','melt','apply','map','filter','query','nlargest','nsmallest',
             'reset_index','set_index','value_counts','nunique','isnull','notnull',
             'astype','to_dict','to_csv','to_json','to_excel','loc','iloc','at','iat',
             'sample','copy','drop','assign','rolling','resample','agg','aggregate',
             'transform','cumsum','cumprod','cummax','cummin','diff','shift',
             'corr','cov','skew','kurt','quantile','clip','abs','round','T','pipe'],
      plt: ['figure','plot','scatter','bar','barh','hist','boxplot','violinplot',
             'xlabel','ylabel','title','legend','show','savefig','subplot','subplots',
             'tight_layout','xlim','ylim','grid','xticks','yticks','colorbar','imshow'],
      sns: ['scatterplot','lineplot','barplot','boxplot','violinplot','heatmap',
             'pairplot','histplot','kdeplot','set_theme','set_style','despine'],
    };
    const IMPORTS = [
      'pandas','numpy','sklearn','sklearn.linear_model','sklearn.preprocessing',
      'sklearn.model_selection','sklearn.metrics','sklearn.ensemble','sklearn.svm',
      'matplotlib','matplotlib.pyplot','seaborn','scipy','scipy.stats',
      'plotly','plotly.express','statsmodels','xgboost','lightgbm',
      'tensorflow','torch','PIL','cv2','datetime','os','sys','re','json','math',
    ];

    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      provideCompletionItems(model, position) {
        const before = model.getLineContent(position.lineNumber).substring(0, position.column - 1);
        const m = before.match(/(\w+)\.$/);
        if (!m) return { suggestions: [] };
        const methods = METHODS[m[1]];
        if (!methods) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                        startColumn: word.startColumn, endColumn: word.endColumn };
        return { suggestions: methods.map(name => ({
          label: name, kind: monaco.languages.CompletionItemKind.Method,
          insertText: name, range,
        })) };
      },
    });

    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: [' '],
      provideCompletionItems(model, position) {
        const before = model.getLineContent(position.lineNumber).substring(0, position.column - 1);
        if (!before.match(/^(?:import|from)\s+\w*$/)) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
                        startColumn: word.startColumn, endColumn: word.endColumn };
        return { suggestions: IMPORTS.map(pkg => ({
          label: pkg, kind: monaco.languages.CompletionItemKind.Module,
          insertText: pkg, range,
        })) };
      },
    });
  }

  // ── Refresh after Chat AI update ──────────────────────────────────────────

  async function refreshEditor() {
    _component = await API.getComponent(_projectId, _component.id);
    Object.values(_editors).forEach(e => { try { e.dispose(); } catch (_) {} });
    _editors = {};
    _cellViz = {};
    _loadCells(_component);
    _renderCells();
  }

  // ── Cell CRUD ─────────────────────────────────────────────────────────────

  function addCell(afterId) {
    const newCell = { id: _uid(), source: '' };
    if (afterId === null) {
      _cells.push(newCell);
    } else {
      const idx = _cells.findIndex(c => c.id === afterId);
      _cells.splice(idx === -1 ? _cells.length : idx + 1, 0, newCell);
    }
    _renderCells();
    setTimeout(() => _enterCommandMode(newCell.id), 50);
    _scheduleAutoSave();
  }

  function deleteCell(cellId) {
    if (_cells.length <= 1) return;
    const idx = _cells.findIndex(c => c.id === cellId);
    const focusId = idx > 0 ? _cells[idx - 1].id : _cells[idx + 1]?.id;
    _editors[cellId]?.dispose();
    delete _editors[cellId];
    delete _cellViz[cellId];
    delete _cellOutputs[cellId];
    if (_component) delete (_globalOutputCache[_component.id] || {})[cellId];
    _cells = _cells.filter(c => c.id !== cellId);
    _renderCells();
    if (focusId) setTimeout(() => _enterCommandMode(focusId), 50);
    _scheduleAutoSave();
  }

  function moveCell(cellId, direction) {
    const idx = _cells.findIndex(c => c.id === cellId);
    const newIdx = idx + direction;
    if (idx === -1 || newIdx < 0 || newIdx >= _cells.length) return;
    [_cells[idx], _cells[newIdx]] = [_cells[newIdx], _cells[idx]];
    _renderCells();
    _scheduleAutoSave();
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  async function runCell(cellId) {
    const idx = _cells.findIndex(c => c.id === cellId);
    if (idx === -1) return;

    const outputEl = document.getElementById(`co-${cellId}`);
    const runBtn = document.querySelector(`#nc-${cellId} .nb-run-btn`);
    outputEl.classList.remove('d-none');
    outputEl.innerHTML = '<span class="text-secondary small">Running…</span>';
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = '…'; }

    try {
      await _autoSaveNow();
      const result = await API.executeCell(_projectId, _component.id, idx);
      _showCellOutput(cellId, result);
    } catch (e) {
      outputEl.innerHTML = `<p class="text-danger small">${escapeHtml(e.message)}</p>`;
    } finally {
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶'; }
    }
  }

  // Run all cells sequentially (also used by Chat after AI updates)
  async function run() {
    if (_component && typeof Jobs !== 'undefined') Jobs.startExecution(_component.id);
    try {
      for (const cell of _cells) {
        await runCell(cell.id);
      }
    } finally {
      if (_component && typeof Jobs !== 'undefined') Jobs.endExecution(_component.id);
    }
    // Refresh status dot in component list (last_run_ok may have changed in backend)
    if (_component) {
      const fresh = await API.getComponent(_projectId, _component.id);
      if (fresh) {
        _component.last_run_ok = fresh.last_run_ok;
        _component.last_error  = fresh.last_error;
        if (typeof ComponentList !== 'undefined') ComponentList.refreshCard(_component.id, fresh);
      }
    }
  }

  function _showCellOutput(cellId, result) {
    _cellOutputs[cellId] = result;
    // Also write to the cross-component cache so outputs survive navigation away and back
    if (_component) {
      if (!_globalOutputCache[_component.id]) _globalOutputCache[_component.id] = {};
      _globalOutputCache[_component.id][cellId] = result;
    }
    _editors[cellId]?.layout();   // ensure editor doesn't collapse when output expands
    const outputEl = document.getElementById(`co-${cellId}`);
    if (!outputEl) return;
    outputEl.classList.remove('d-none');

    // Destroy existing viz
    const existing = _cellViz[cellId];
    if (existing) {
      try {
        if (existing.renderer === 'plotly') Plotly.purge(existing.instance);
        else existing.instance.destroy();
      } catch (_) {}
      delete _cellViz[cellId];
    }

    if (!result.success) {
      outputEl.innerHTML = `<pre class="nb-output-error">${escapeHtml(result.error)}</pre>`;
      return;
    }

    let html = '';
    if (result.stdout) {
      html += `<pre class="nb-output-stdout">${escapeHtml(result.stdout)}</pre>`;
    }

    if (result.chart_config) {
      outputEl.innerHTML = html;
      _renderCellViz(cellId, outputEl, result.chart_config);
    } else if (result.raw_output_type) {
      outputEl.innerHTML = html + `<span class="text-secondary small nb-output-type">${escapeHtml(result.raw_output_type)}</span>`;
    } else if (result.rows && result.rows.length) {
      const csvBtn = `<button class="nb-csv-btn" onclick="Workspace.downloadCSV('${cellId}')">⬇ CSV</button>`;
      if (result.columns && result.columns.length) {
        html += `<div class="nb-output-meta">${csvBtn}<span class="small text-success">Columns: ${result.columns.map(escapeHtml).join(', ')}</span></div>`;
      } else {
        html += `<div class="nb-output-meta">${csvBtn}</div>`;
      }
      html += _renderTable(result.rows, 10);
      outputEl.innerHTML = html;
    } else {
      outputEl.innerHTML = html || '<span class="text-secondary small">✓ (no output)</span>';
    }
  }

  // Convert string-form JS functions back into real functions so Chart.js callbacks work.
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

  function _renderCellViz(cellId, outputEl, config) {
    const renderer = config.renderer || 'chartjs';
    if (renderer === 'plotly') {
      const div = document.createElement('div');
      div.style.cssText = 'width:100%;height:300px';
      outputEl.appendChild(div);
      const layout = { autosize: true, margin: { l: 40, r: 20, t: 30, b: 40 }, ...config.layout };
      Plotly.newPlot(div, config.data || [], layout, { responsive: true, ...(config.config || {}) });
      _cellViz[cellId] = { renderer: 'plotly', instance: div };
    } else if (renderer === 'tabulator') {
      const div = document.createElement('div');
      outputEl.appendChild(div);
      const instance = new Tabulator(div, config);
      _cellViz[cellId] = { renderer: 'tabulator', instance };
    } else {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;height:300px';
      const canvas = document.createElement('canvas');
      wrap.appendChild(canvas);
      outputEl.appendChild(wrap);
      const ctx = canvas.getContext('2d');
      const cfg = _reviveFunctions(config);
      if (cfg.options?.plugins?.datalabels) {
        cfg.plugins = [...(cfg.plugins || []), ChartDataLabels];
      }
      const instance = new Chart(ctx, cfg);
      _cellViz[cellId] = { renderer: 'chartjs', instance };
    }
  }

  // ── Import / Export .ipynb ────────────────────────────────────────────────

  function importNotebook() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ipynb,application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const nb = JSON.parse(await file.text());
        const imported = (nb.cells || [])
          .filter(c => c.cell_type === 'code')
          .map(c => ({
            id: _uid(),
            source: Array.isArray(c.source) ? c.source.join('') : (c.source || ''),
          }))
          .filter(c => c.source.trim());
        if (!imported.length) { alert('No code cells found in this notebook.'); return; }
        Object.values(_editors).forEach(e => { try { e.dispose(); } catch (_) {} });
        _editors = {};
        _cellViz = {};
        _cells = imported;
        _renderCells();
        _scheduleAutoSave();
      } catch (err) {
        alert(`Failed to parse notebook: ${err.message}`);
      }
    };
    input.click();
  }

  async function renamePrompt() {
    if (!_component) return;
    const newName = prompt('Rename component:', _component.name);
    if (!newName || newName === _component.name) return;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      alert('Only letters, digits and underscores allowed. Must start with a letter or _.');
      return;
    }
    const updated = await API.updateComponent(_projectId, _component.id, { name: newName });
    _component = updated;
    document.getElementById('ws-component-name').textContent = updated.name;
    ComponentList.refresh();
  }

  async function exportNotebook() {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`/projects/${_projectId}/execute/${_component.id}/notebook`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { alert('Export failed'); return; }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const filename = cd.match(/filename="([^"]+)"/)?.[1] || `${_component.name}_pipeline.ipynb`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadCSV(cellId) {
    const result = _cellOutputs[cellId];
    if (!result?.rows?.length) return;
    const cols = result.columns?.length ? result.columns : Object.keys(result.rows[0]);
    const lines = [
      cols.join(','),
      ...result.rows.map(r => cols.map(c => {
        const s = String(r[c] ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${_component?.name || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  function _scheduleAutoSave() {
    clearTimeout(_autoSaveTimer);
    const statusEl = document.getElementById('ws-autosave-status');
    if (statusEl) statusEl.textContent = '';
    _autoSaveTimer = setTimeout(_autoSaveNow, 1500);
  }

  async function _autoSaveNow() {
    if (!_projectId || !_component) return;
    clearTimeout(_autoSaveTimer);
    const statusEl = document.getElementById('ws-autosave-status');
    try {
      if (statusEl) statusEl.textContent = 'Saving…';
      await API.updateComponent(_projectId, _component.id, { cells: _cells });
      _component = await API.getComponent(_projectId, _component.id);
      if (statusEl) statusEl.textContent = '✓';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Save failed';
    }
  }

  // kept for backward compat
  async function save() { await _autoSaveNow(); }

  // ── Render helpers ────────────────────────────────────────────────────────

  function _renderTable(rows, maxRows = 10) {
    const cols = Object.keys(rows[0]);
    const header = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const body = rows.slice(0, maxRows).map(row =>
      `<tr>${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`
    ).join('');
    return `
      <div class="table-responsive">
        <table class="table table-sm table-bordered small mb-0">
          <thead class="table-light"><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
        ${rows.length > maxRows ? `<p class="text-secondary small mt-1">Showing ${maxRows} of ${rows.length} rows</p>` : ''}
      </div>`;
  }

  // public alias kept for any external callers
  function renderTable(rows) { return _renderTable(rows, 100); }

  // ── Resize handle ─────────────────────────────────────────────────────────

  const _LS_CHAT_WIDTH = 'ws-chat-width';

  function _initResize() {
    const layout = document.querySelector('.workspace-layout');
    const saved = localStorage.getItem(_LS_CHAT_WIDTH);
    if (saved) layout.style.gridTemplateColumns = `1fr 5px ${saved}px`;

    const handle = document.getElementById('ws-resize-handle');
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      handle.classList.add('dragging');
      const startX = e.clientX;
      const startWidth = document.querySelector('.ws-chat').offsetWidth;

      function onMove(e) {
        const newWidth = Math.max(260, Math.min(640, startWidth - (e.clientX - startX)));
        layout.style.gridTemplateColumns = `1fr 5px ${newWidth}px`;
        localStorage.setItem(_LS_CHAT_WIDTH, newWidth);
      }
      function onUp() {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _initResize();

  // ── Collab: remote cell & cursor application ──────────────────────────────

  function _ensureUserStyle(email, color) {
    const id = `rcs-${email.replace(/[^a-z0-9]/gi, '_')}`;
    if (document.getElementById(id)) return;
    const label = email.split('@')[0].slice(0, 12).replace(/[<>"']/g, '');
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      .rc-caret-${id} { border-left: 2px solid ${color}; margin-left: -1px; }
      .rc-label-${id}::before {
        content: "${label}";
        background: ${color}; color: #fff;
        font-size: 10px; font-style: normal;
        padding: 0 4px; border-radius: 2px 2px 2px 0;
        white-space: nowrap; pointer-events: none;
        position: absolute; top: -16px; left: -1px;
      }
    `;
    document.head.appendChild(style);
  }

  // Called by Collab when a remote user edits a cell
  function applyRemoteCellChange(cellId, content, _email) {
    const editor = _editors[cellId];
    if (!editor) return;
    if (editor.getValue() === content) return;
    _applyingRemote.add(cellId);
    const model = editor.getModel();
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null);
    _applyingRemote.delete(cellId);
    // Keep _cells in sync
    const cell = _cells.find(c => c.id === cellId);
    if (cell) cell.source = content;
  }

  // Called by Collab when a remote user moves their cursor
  function applyRemoteCursor(cellId, line, col, email, color) {
    const editor = _editors[cellId];
    if (!editor || typeof monaco === 'undefined') return;
    _ensureUserStyle(email, color);
    const styleId = `rcs-${email.replace(/[^a-z0-9]/gi, '_')}`;
    if (!_remoteDecorations[email]) _remoteDecorations[email] = {};
    if (!_remoteDecorations[email][cellId]) {
      _remoteDecorations[email][cellId] = editor.createDecorationsCollection([]);
    }
    _remoteDecorations[email][cellId].set([{
      range: new monaco.Range(line, col, line, col),
      options: {
        className: `rc-caret-${styleId}`,
        beforeContentClassName: `rc-label-${styleId}`,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        zIndex: 10,
      }
    }]);
  }

  // Called by Collab when a user leaves the channel
  function clearRemoteCursors(email) {
    const byCell = _remoteDecorations[email];
    if (!byCell) return;
    Object.values(byCell).forEach(coll => coll.clear());
    delete _remoteDecorations[email];
  }

  return { open, refreshEditor, save, run, runCell, addCell, deleteCell, moveCell, renamePrompt, importNotebook, exportNotebook, downloadCSV, renderTable, applyRemoteCellChange, applyRemoteCursor, clearRemoteCursors };
})();
