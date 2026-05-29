/**
 * App state and navigation: projects → component list → workspace
 */
const App = (() => {
  let _projectId = null;
  let _projectName = '';
  let _workspaceId = null;
  let _userEmail = '';

  let _liteMode = false;

  async function init() {
    // Check auth config first — this also tells us if we're in lite mode.
    let config = {};
    try {
      config = await API.authConfig();
    } catch {
      alert('Cannot reach backend. Make sure it is running.');
      return;
    }

    _liteMode = !!config.lite;

    if (_liteMode) {
      localStorage.setItem('auth_token', 'lite-mode');
      const liteBadge = document.getElementById('nav-lite-badge');
      if (liteBadge) liteBadge.style.display = 'inline';
      const emailEl = document.getElementById('nav-user-email');
      if (emailEl) emailEl.style.display = 'none';
      const logoutBtn = document.getElementById('nav-logout-btn');
      if (logoutBtn) logoutBtn.style.display = 'none';
    } else {
      document.getElementById('nav-logout-btn')?.style.setProperty('display', '', 'important');
      // Full mode: validate token via Supabase session
      let token = localStorage.getItem('auth_token');
      if (!token) { window.location.replace('/login'); return; }

      try {
        // Refresh session via Supabase client if available
        if (typeof supabase !== 'undefined' && config.supabase_url) {
          const sb = supabase.createClient(config.supabase_url, config.supabase_anon_key);
          const { data: { session } } = await sb.auth.getSession();
          if (!session) { window.location.replace('/login'); return; }
          token = session.access_token;
          localStorage.setItem('auth_token', token);
        }

        const user = await API.me();
        if (!user?.id) { window.location.replace('/login'); return; }

        _userEmail = user.email || '';
        const emailEl = document.getElementById('nav-user-email');
        if (emailEl) emailEl.textContent = _userEmail;

        // Init real-time collaboration
        Collab.init(config.supabase_url, config.supabase_anon_key, token);

        // Load workspace switcher
        await _refreshWorkspaceSwitcher();
      } catch {
        window.location.replace('/login');
        return;
      }
    }

    Settings.initModelSelect();
    showProjects();
  }

  async function logout() {
    if (_liteMode) return;
    try {
      // Sign out from Supabase client side too
      const config = await API.authConfig().catch(() => ({}));
      if (config.supabase_url && typeof supabase !== 'undefined') {
        const sb = supabase.createClient(config.supabase_url, config.supabase_anon_key);
        await sb.auth.signOut().catch(() => {});
      }
      await API.logout();
    } catch {}
    localStorage.removeItem('auth_token');
    window.location.replace('/login');
  }

  // ── Workspace switcher ────────────────────────────────────────────────────

  async function _refreshWorkspaceSwitcher() {
    try {
      const workspaces = await API.getWorkspaces();
      if (!workspaces.length) return;
      if (!_workspaceId) _workspaceId = workspaces[0].id;
      const current = workspaces.find(w => w.id === _workspaceId) || workspaces[0];
      const menu = document.getElementById('nav-workspace-menu');
      const others = workspaces.filter(w => w.id !== _workspaceId);
      // Detect duplicate names so we can show slug as disambiguator
      const nameCounts = {};
      workspaces.forEach(w => { nameCounts[w.name] = (nameCounts[w.name] || 0) + 1; });
      const _label = w => nameCounts[w.name] > 1 ? `${escapeHtml(w.name)} <span class="text-secondary small">${escapeHtml(w.slug)}</span>` : escapeHtml(w.name);
      document.getElementById('nav-workspace-name').textContent =
        nameCounts[current.name] > 1 ? `${current.name} (${current.slug})` : current.name;
      menu.innerHTML = others.map(w =>
        `<li><a class="dropdown-item" href="#" onclick="App.switchWorkspace('${w.id}');return false">${_label(w)}</a></li>`
      ).join('');
      if (others.length) menu.innerHTML += '<li><hr class="dropdown-divider"></li>';
      menu.innerHTML += `<li><a class="dropdown-item" href="#" onclick="App.showSettings('workspaces');return false">Manage team…</a></li>
        <li><a class="dropdown-item" href="#" onclick="App.promptNewWorkspace();return false">+ New workspace</a></li>`;
      document.getElementById('nav-workspace-dropdown').style.display = '';
    } catch { /* non-fatal */ }
  }

  async function switchWorkspace(workspaceId) {
    _workspaceId = workspaceId;
    _projectId = null;
    _projectName = '';
    await _refreshWorkspaceSwitcher();
    showProjects();
  }

  async function promptNewWorkspace() {
    const name = prompt('New workspace name:');
    if (!name || !name.trim()) return;
    try {
      await API.createWorkspace(name.trim());
      await _refreshWorkspaceSwitcher();
    } catch (e) {
      alert(e.message);
    }
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  function _setProjectContext(show) {
    document.getElementById('nav-project-dropdown').style.display = show ? '' : 'none';
    document.getElementById('nav-components-btn').style.display = show ? '' : 'none';
    document.getElementById('nav-pipeline-btn').style.display = show ? '' : 'none';
    document.getElementById('nav-new-btn').style.display = show ? '' : 'none';
  }

  async function _refreshProjectDropdown() {
    const projects = await API.getProjects(_workspaceId);
    const menu = document.getElementById('nav-project-menu');
    menu.innerHTML = projects.map(p =>
      p.id === _projectId
        ? `<li><a class="dropdown-item disabled text-secondary" aria-disabled="true">${escapeHtml(p.name)}</a></li>`
        : `<li><a class="dropdown-item" href="#" onclick="App.openProject('${p.id}','${escapeAttr(p.name)}');return false">${escapeHtml(p.name)}</a></li>`
    ).join('');
    menu.innerHTML += `<li><hr class="dropdown-divider"></li>
      <li><a class="dropdown-item" href="#" onclick="App.showProjects();return false">All projects…</a></li>`;
  }

  function showHome() {
    if (_projectId) showProjectHome();
    else showProjects();
  }

  async function showProjects() {
    _projectId = null;
    _projectName = '';
    setBreadcrumb('');
    _setProjectContext(false);
    showView('view-projects');

    const projects = await API.getProjects(_workspaceId);
    const el = document.getElementById('project-list');
    if (!projects.length) {
      el.innerHTML = '<p class="text-secondary">No projects yet.</p>';
      return;
    }
    el.innerHTML = projects.map(p => `
      <div class="list-card d-flex justify-content-between align-items-center">
        <div onclick="App.openProject('${p.id}','${escapeAttr(p.name)}')" class="flex-grow-1 pointer">
          <div class="fw-semibold">${escapeHtml(p.name)}</div>
          <div class="text-secondary small">${escapeHtml(p.description)}</div>
        </div>
        <button class="btn btn-sm btn-outline-danger ms-2" onclick="App.deleteProject('${p.id}')">✕</button>
      </div>
    `).join('');
  }

  async function createProject() {
    const input = document.getElementById('new-project-name');
    const name = input.value.trim();
    if (!name) return;
    try {
      await API.createProject(name, '', _workspaceId);
      input.value = '';
      showProjects();
    } catch (e) {
      alert(e.message);
    }
  }

  async function deleteProject(projectId) {
    if (!confirm('Delete this project?')) return;
    await API.deleteProject(projectId);
    showProjects();
  }

  async function openProject(projectId, projectName) {
    _projectId = projectId;
    _projectName = projectName;
    showProjectHome();
  }

  function showProjectHome() {
    if (!_projectId) return;
    document.getElementById('nav-project-name').textContent = _projectName;
    _setProjectContext(true);
    _refreshProjectDropdown();
    setBreadcrumb('');
    showView('view-project-home');
    ComponentList.renderList(_projectId);
    Dashboard.renderList(_projectId);
  }

  function showPipeline() {
    if (!_projectId) return;
    setBreadcrumb('Pipeline');
    _setProjectContext(true);
    Pipeline.render(_projectId);
  }

  // kept for back-compat (dashboard toolbar "back" etc.)
  function showComponents() { showProjectHome(); }

  // ── Workspace entry point ─────────────────────────────────────────────────

  async function openComponent(componentId) {
    const c = await API.getComponent(_projectId, componentId);
    setBreadcrumb(`<span class="pointer" onclick="App.showProjectHome()">${escapeHtml(c.name)}</span>`);
    Workspace.open(_projectId, c);
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  function showSettings(section) {
    if (!_projectId) {
      _setProjectContext(false);
      setBreadcrumb('<a href="#" class="text-secondary" onclick="App.showProjects();return false">Projects</a> / Settings');
    } else {
      setBreadcrumb('Settings');
    }
    showView('view-settings');
    Settings.load(section || 'ai');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showView(viewId) {
    const wasWorkspace = !document.getElementById('view-workspace').classList.contains('d-none');
    const wasSettings = !document.getElementById('view-settings').classList.contains('d-none');
    if (wasWorkspace && viewId !== 'view-workspace') Collab.leave();
    if (wasSettings && viewId !== 'view-settings' && Settings.isDirty()) {
      if (!confirm('You have unsaved changes in Settings. Leave without saving?')) return;
    }
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById(viewId).classList.remove('d-none');
  }

  function setBreadcrumb(html) {
    document.getElementById('breadcrumb').innerHTML = html;
  }

  document.addEventListener('DOMContentLoaded', init);

  function getWorkspaceId() { return _workspaceId; }
  function getUserEmail() { return _userEmail; }

  return { init, showHome, showProjects, showProjectHome, showPipeline, showSettings, createProject, deleteProject, openProject, showComponents, openComponent, logout, switchWorkspace, promptNewWorkspace, getWorkspaceId, getUserEmail };
})();

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(str) {
  return String(str).replace(/'/g,"\\'");
}
