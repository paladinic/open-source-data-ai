/**
 * App state and navigation: projects → component list → workspace
 */
const App = (() => {
  let _projectId = null;
  let _projectName = '';

  async function init() {
    try { await API.health(); }
    catch { alert('Cannot reach backend. Make sure uvicorn is running.'); return; }
    showProjects();
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async function showProjects() {
    _projectId = null;
    _projectName = '';
    setBreadcrumb('');
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
    setBreadcrumb(`<span class="pointer" onclick="App.showProjects()">Projects</span> › ${escapeHtml(projectName)}`);
    await ComponentList.show(projectId);
  }

  // ── Workspace entry point ─────────────────────────────────────────────────

  async function openComponent(componentId) {
    const c = await API.getComponent(_projectId, componentId);
    setBreadcrumb(`<span class="pointer" onclick="App.showProjects()">Projects</span> › \
<span class="pointer" onclick="App.openProject('${_projectId}','${escapeAttr(_projectName)}')">${escapeHtml(_projectName)}</span> › \
${escapeHtml(c.name)}`);
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

  return { init, showProjects, createProject, deleteProject, openProject, openComponent };
})();

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(str) {
  return String(str).replace(/'/g,"\\'");
}
