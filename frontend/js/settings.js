/**
 * Settings modal - API keys, active model, system instructions.
 */
const Settings = (() => {
  const PROVIDERS = {
    anthropic: {
      label: 'Anthropic',
      models: [
        { id: 'claude-opus-4-6',          label: 'Claude Opus 4.6' },
        { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' },
        { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      ],
    },
    openai: {
      label: 'OpenAI',
      models: [
        { id: 'gpt-4o',      label: 'GPT-4o' },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { id: 'o3-mini',     label: 'o3 Mini' },
      ],
    },
    gemini: {
      label: 'Google',
      models: [
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      ],
    },
  };

  let _current = null;
  let _dirty = false;
  let _listenersAttached = false;

  function _markDirty() {
    _dirty = true;
    const badge = document.getElementById('settings-unsaved-badge');
    if (badge) badge.style.display = '';
  }

  function _markClean() {
    _dirty = false;
    const badge = document.getElementById('settings-unsaved-badge');
    if (badge) badge.style.display = 'none';
  }

  function isDirty() { return _dirty; }

  function _attachDirtyListeners() {
    if (_listenersAttached) return;
    _listenersAttached = true;
    const ids = [
      'settings-anthropic-key', 'settings-openai-key', 'settings-gemini-key',
      'settings-instructions', 'settings-max-retries',
    ];
    ids.forEach(id => {
      document.getElementById(id)?.addEventListener('input', _markDirty);
    });
    ['settings-dark-mode', 'settings-safe-mode'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', _markDirty);
    });
  }

  function applyTheme(dark) {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('bi-theme', theme); } catch (_) {}
    if (typeof monaco !== 'undefined') {
      monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
    }
  }

  // ── Model selector (chat panel) ───────────────────────────────────────────

  function buildModelSelect(settings) {
    _current = settings;
    const sel = document.getElementById('chat-model-select');
    if (!sel) return;
    sel.innerHTML = '';

    const hasKey = {
      anthropic: settings.has_anthropic_key,
      openai:    settings.has_openai_key,
      gemini:    settings.has_gemini_key,
    };

    let hasAny = false;
    for (const [provId, prov] of Object.entries(PROVIDERS)) {
      if (!hasKey[provId]) continue;
      hasAny = true;
      const grp = document.createElement('optgroup');
      grp.label = prov.label;
      for (const m of prov.models) {
        const opt = document.createElement('option');
        opt.value = `${provId}::${m.id}`;
        opt.textContent = m.label;
        if (settings.active_provider === provId && settings.active_model === m.id) {
          opt.selected = true;
        }
        grp.appendChild(opt);
      }
      sel.appendChild(grp);
    }

    if (!hasAny) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No API keys configured - open ⚙ Settings';
      sel.appendChild(opt);
    }

    sel.onchange = async () => {
      const [prov, model] = sel.value.split('::');
      await API.updateSettings({ active_provider: prov, active_model: model });
    };
  }

  async function initModelSelect() {
    try {
      const s = await API.getSettings();
      buildModelSelect(s);
      applyTheme(s.dark_mode);
    } catch (_) {}
  }

  // ── Settings page view ────────────────────────────────────────────────────

  function showSection(name) {
    const sections = ['ai', 'appearance', 'safemode', 'prompt', 'workspaces'];
    sections.forEach(s => {
      const el = document.getElementById(`settings-section-${s}`);
      if (el) el.classList.toggle('d-none', s !== name);
    });
    document.querySelectorAll('.settings-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('onclick') === `Settings.showSection('${name}')`);
    });
    if (name === 'workspaces') _loadTeam();
  }

  async function load(section) {
    document.getElementById('settings-save-status').textContent = '';
    document.getElementById('settings-anthropic-key').value = '';
    document.getElementById('settings-openai-key').value = '';
    document.getElementById('settings-gemini-key').value = '';

    try {
      const s = await API.getSettings();
      _current = s;
      document.getElementById('settings-anthropic-status').textContent =
        s.has_anthropic_key ? '✓ Key saved' : 'No key stored';
      document.getElementById('settings-openai-status').textContent =
        s.has_openai_key ? '✓ Key saved' : 'No key stored';
      document.getElementById('settings-gemini-status').textContent =
        s.has_gemini_key ? '✓ Key saved' : 'No key stored';
      document.getElementById('settings-instructions').value = s.system_instructions;
      document.getElementById('settings-max-retries').value = s.max_auto_retries ?? 3;
      document.getElementById('settings-dark-mode').checked = s.dark_mode ?? false;
      document.getElementById('settings-safe-mode').checked = s.safe_mode ?? false;
    } catch (e) {
      document.getElementById('settings-save-status').textContent = `Load error: ${e.message}`;
    }

    _markClean();
    _attachDirtyListeners();
    showSection(section || 'ai');
  }

  function open() {
    App.showSettings();
  }

  async function deleteWorkspace() {
    const wsId = App.getWorkspaceId();
    if (!wsId) return;
    if (!confirm('Delete this workspace? This will permanently delete all its projects and data. This cannot be undone.')) return;
    try {
      await API.deleteWorkspace(wsId);
      window.location.replace('/');  // re-init; workspace is gone
    } catch (e) {
      alert(e.message);
    }
  }

  async function _loadTeam() {
    const section = document.getElementById('settings-section-workspaces');
    try {
      const { workspace, members, role } = await API.getMyWorkspace(App.getWorkspaceId());
      if (!workspace) { return; }
      document.getElementById('settings-workspace-name').textContent = workspace.name;
      const canManage = role === 'owner' || role === 'admin';
      const list = document.getElementById('settings-members-list');
      list.innerHTML = (members || []).map(m => `
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="flex-grow-1 small">${escapeHtml(m.email || m.user_id)}</span>
          <span class="badge bg-secondary">${m.role}</span>
          ${canManage && m.role !== 'owner' ? `
            <select class="form-select form-select-sm" style="width:auto"
                    onchange="Settings.changeMemberRole('${m.user_id}', this.value)">
              <option value="member" ${m.role==='member'?'selected':''}>Member</option>
              <option value="admin"  ${m.role==='admin'?'selected':''}>Admin</option>
            </select>
            <button class="btn btn-sm btn-outline-danger" onclick="Settings.removeMember('${m.user_id}')">✕</button>
          ` : ''}
        </div>`).join('');
    } catch {
      // non-fatal; team section simply shows nothing
    }
  }

  async function inviteMember() {
    const email = document.getElementById('invite-email').value.trim();
    const role  = document.getElementById('invite-role').value;
    const statusEl = document.getElementById('invite-status');
    if (!email) return;
    statusEl.textContent = 'Sending invite…';
    try {
      const result = await API.inviteMember(email, role, App.getWorkspaceId());
      statusEl.textContent = result.added_directly ? `Added to workspace` : `Invite sent to ${email}`;
      document.getElementById('invite-email').value = '';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
      _loadTeam();
    } catch (e) {
      statusEl.textContent = `Error: ${e.message}`;
    }
  }

  async function changeMemberRole(userId, role) {
    try { await API.updateMember(userId, role); _loadTeam(); } catch (e) { alert(e.message); }
  }

  async function removeMember(userId) {
    if (!confirm('Remove this member?')) return;
    try { await API.removeMember(userId); _loadTeam(); } catch (e) { alert(e.message); }
  }

  async function save() {
    const statusEl = document.getElementById('settings-save-status');
    statusEl.textContent = 'Saving…';

    const retries = parseInt(document.getElementById('settings-max-retries').value, 10);
    const body = {
      system_instructions: document.getElementById('settings-instructions').value,
      max_auto_retries: isNaN(retries) ? 3 : Math.max(1, Math.min(10, retries)),
      dark_mode: document.getElementById('settings-dark-mode').checked,
      safe_mode: document.getElementById('settings-safe-mode').checked,
    };
    const ak = document.getElementById('settings-anthropic-key').value.trim();
    const ok = document.getElementById('settings-openai-key').value.trim();
    const gk = document.getElementById('settings-gemini-key').value.trim();
    if (ak) body.anthropic_api_key = ak;
    if (ok) body.openai_api_key = ok;
    if (gk) body.gemini_api_key = gk;

    try {
      const s = await API.updateSettings(body);
      _markClean();
      statusEl.textContent = 'Saved ✓';
      buildModelSelect(s);
      applyTheme(s.dark_mode);
      // clear key fields and refresh status indicators
      document.getElementById('settings-anthropic-key').value = '';
      document.getElementById('settings-openai-key').value = '';
      document.getElementById('settings-gemini-key').value = '';
      document.getElementById('settings-anthropic-status').textContent = s.has_anthropic_key ? '✓ Key saved' : 'No key stored';
      document.getElementById('settings-openai-status').textContent = s.has_openai_key ? '✓ Key saved' : 'No key stored';
      document.getElementById('settings-gemini-status').textContent = s.has_gemini_key ? '✓ Key saved' : 'No key stored';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } catch (e) {
      statusEl.textContent = `Error: ${e.message}`;
    }
  }

  function isSafeMode() { return _current?.safe_mode ?? false; }

  return { open, load, showSection, save, initModelSelect, applyTheme, isSafeMode, isDirty, inviteMember, changeMemberRole, removeMember, deleteWorkspace, PROVIDERS };
})();
