/**
 * App state and navigation: projects → component list → workspace
 */
const App = (() => {
  let _projectId = null;
  let _projectName = '';

  async function init() {
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

    try { await API.health(); }
    catch { alert('Cannot reach backend. Make sure uvicorn is running.'); return; }
    showProjects();
  }

  async function logout() {
    try { await API.logout(); } catch {}
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.replace('/login');
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  function _updateNav(activeId) {
    ['nav-home', 'nav-components', 'nav-dashboard'].forEach(id => {
      const btn = document.getElementById(id);
      btn.classList.toggle('active', id === activeId);
      if (id !== 'nav-home') btn.disabled = !_projectId;
    });
  }

  async function showProjects() {
    _projectId = null;
    _projectName = '';
    setBreadcrumb('');
    _updateNav('nav-home');
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
    showComponents();
  }

  function showComponents() {
    if (!_projectId) return;
    setBreadcrumb(`<span class="pointer" onclick="App.showProjects()">Projects</span> › ${escapeHtml(_projectName)}`);
    _updateNav('nav-components');
    ComponentList.show(_projectId);
  }

  function showDashboardList() {
    setBreadcrumb(`<span class="pointer" onclick="App.showProjects()">Projects</span> › \
<span class="pointer" onclick="App.showComponents()">${escapeHtml(_projectName)}</span> › Dashboards`);
    _updateNav('nav-dashboard');
    Dashboard.showList(_projectId);
  }

  function showDashboard() { showDashboardList(); }

  // ── Workspace entry point ─────────────────────────────────────────────────

  async function openComponent(componentId) {
    const c = await API.getComponent(_projectId, componentId);
    setBreadcrumb(`<span class="pointer" onclick="App.showProjects()">Projects</span> › \
<span class="pointer" onclick="App.showComponents()">${escapeHtml(_projectName)}</span> › \
${escapeHtml(c.name)}`);
    _updateNav('nav-components');
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

  return { init, showProjects, createProject, deleteProject, openProject, showComponents, openComponent, showDashboard, showDashboardList, logout };
})();

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(str) {
  return String(str).replace(/'/g,"\\'");
}
