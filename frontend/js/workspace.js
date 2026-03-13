/**
 * Component workspace — Monaco editor + run results panel.
 * Opened when the user selects a component from the component list.
 */
const Workspace = (() => {
  let _projectId = null;
  let _component = null;
  let _editor = null;
  let _monacoReady = false;

  // ── Public entry point ────────────────────────────────────────────────────

  async function open(projectId, component) {
    _projectId = projectId;
    _component = component;

    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById('view-workspace').classList.remove('d-none');

    document.getElementById('ws-component-name').textContent = component.name;
    document.getElementById('ws-component-type').textContent = component.type;
    document.getElementById('ws-component-type').className = `component-badge badge-${component.type}`;

    document.getElementById('run-result').innerHTML = '';
    document.getElementById('chat-messages').innerHTML = '';

    _initMonaco(component);
    Chat.init(projectId, component.id);
  }

  // ── Monaco ────────────────────────────────────────────────────────────────

  function _editorContent(component) {
    if (component.type === 'visualisation') {
      return component.config && Object.keys(component.config).length
        ? JSON.stringify(component.config, null, 2)
        : '{\n  "type": "line",\n  "data": {},\n  "options": {}\n}';
    }
    return component.code || '';
  }

  function _editorLanguage(component) {
    return component.type === 'visualisation' ? 'json' : 'python';
  }

  function _initMonaco(component) {
    const container = document.getElementById('monaco-editor');

    if (_editor) {
      _editor.dispose();
      _editor = null;
    }

    if (typeof require === 'undefined' || !_monacoReady) {
      require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.47.0/min/vs' } });
      require(['vs/editor/editor.main'], () => {
        _monacoReady = true;
        _createEditor(container, component);
      });
    } else {
      _createEditor(container, component);
    }
  }

  function _createEditor(container, component) {
    _editor = monaco.editor.create(container, {
      value: _editorContent(component),
      language: _editorLanguage(component),
      theme: 'vs-dark',
      fontSize: 13,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
    });
  }

  // Called by Chat after AI updates the component
  async function refreshEditor() {
    _component = await API.getComponent(_projectId, _component.id);
    if (_editor) {
      _editor.setValue(_editorContent(_component));
    }
  }

  // ── Save (manual edits) ───────────────────────────────────────────────────

  async function save() {
    if (!_editor) return;
    const value = _editor.getValue();
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      if (_component.type === 'visualisation') {
        const config = JSON.parse(value);
        await API.updateComponent(_projectId, _component.id, { config });
      } else {
        await API.updateComponent(_projectId, _component.id, { code: value });
      }
      _component = await API.getComponent(_projectId, _component.id);
      btn.textContent = 'Saved ✓';
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1500);
    } catch (e) {
      btn.textContent = 'Save';
      btn.disabled = false;
      document.getElementById('run-result').innerHTML =
        `<p class="text-danger small">Save error: ${escapeHtml(e.message)}</p>`;
    }
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  async function run() {
    const resultEl = document.getElementById('run-result');
    resultEl.innerHTML = '<p class="text-secondary small">Running…</p>';
    document.getElementById('btn-run').disabled = true;

    try {
      const result = await API.execute(_projectId, _component.id);
      if (result.success) {
        let html = '';
        if (result.columns.length) {
          html += `<p class="small text-success mb-1">Columns: ${result.columns.map(escapeHtml).join(', ')}</p>`;
        }
        if (result.rows.length) {
          html += renderTable(result.rows);
        } else {
          html += '<p class="text-success small">Ran successfully (no rows returned).</p>';
        }
        if (result.stdout) {
          html += `<pre class="small text-secondary mt-2">${escapeHtml(result.stdout)}</pre>`;
        }
        resultEl.innerHTML = html;

        // Schema cached — refresh component so chat context is up to date
        if (result.columns.length) {
          _component = await API.getComponent(_projectId, _component.id);
        }
      } else {
        resultEl.innerHTML = `<pre class="text-danger small">${escapeHtml(result.error)}</pre>`;
      }
    } catch (e) {
      resultEl.innerHTML = `<p class="text-danger small">${escapeHtml(e.message)}</p>`;
    } finally {
      document.getElementById('btn-run').disabled = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function renderTable(rows) {
    const cols = Object.keys(rows[0]);
    const header = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
    const body = rows.slice(0, 100).map(row =>
      `<tr>${cols.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>`
    ).join('');
    return `
      <div class="table-responsive">
        <table class="table table-sm table-bordered small mb-0">
          <thead class="table-light"><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
        ${rows.length > 100 ? `<p class="text-secondary small mt-1">Showing 100 of ${rows.length} rows</p>` : ''}
      </div>`;
  }

  return { open, refreshEditor, save, run };
})();
