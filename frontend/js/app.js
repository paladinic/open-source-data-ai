/**
 * App state and navigation: projects → component list → workspace
 */
const App = (() => {
  let _projectId = null;
  let _projectName = '';

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
      // Lite mode: set a dummy token so API calls include an Authorization header,
      // hide the sign-out button and user email (not meaningful without auth).
      localStorage.setItem('auth_token', 'lite-mode');
      document.getElementById('nav-user-email')?.style.setProperty('display', 'none', 'important');
      document.getElementById('nav-logout-btn')?.style.setProperty('display', 'none', 'important');
    } else {
      const token = localStorage.getItem('auth_token');
      if (!token) { window.location.replace('/login'); return; }
      try {
        const user = await API.me();
        const el = document.getElementById('nav-user-email');
        if (el) el.textContent = user.email;
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
    try { await API.logout(); } catch {}
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.replace('/login');
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  function _setProjectContext(show) {
    document.getElementById('nav-project-dropdown').style.display = show ? '' : 'none';
    document.getElementById('nav-components-btn').style.display = show ? '' : 'none';
    document.getElementById('nav-pipeline-btn').style.display = show ? '' : 'none';
    document.getElementById('nav-new-btn').style.display = show ? '' : 'none';
  }

  async function _refreshProjectDropdown() {
    const projects = await API.getProjects();
    const menu = document.getElementById('nav-project-menu');
    menu.innerHTML = projects
      .filter(p => p.id !== _projectId)
      .map(p => `<li><a class="dropdown-item" href="#" onclick="App.openProject('${p.id}','${escapeAttr(p.name)}');return false">${escapeHtml(p.name)}</a></li>`)
      .join('');
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

    const projects = await API.getProjects();
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
    await API.createProject(name, '');
    input.value = '';
    showProjects();
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById(viewId).classList.remove('d-none');
  }

  function setBreadcrumb(html) {
    document.getElementById('breadcrumb').innerHTML = html;
  }

  document.addEventListener('DOMContentLoaded', init);

  return { init, showHome, showProjects, showProjectHome, showPipeline, createProject, deleteProject, openProject, showComponents, openComponent, logout };
})();

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(str) {
  return String(str).replace(/'/g,"\\'");
}
