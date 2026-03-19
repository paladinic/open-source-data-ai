/**
 * All backend communication routes through here.
 */
const API = (() => {
  const BASE = '/';

  async function request(method, path, body, signal) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const token = localStorage.getItem('auth_token');
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) opts.body = JSON.stringify(body);
    if (signal) opts.signal = signal;
    const res = await fetch(BASE + path, opts);
    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.replace('/login');
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    health:          ()                           => request('GET',    'health'),

    // Auth
    authConfig:      ()                           => request('GET',    'api/auth/config'),
    me:              ()                           => request('GET',    'api/auth/me'),
    logout:          ()                           => request('POST',   'api/auth/logout'),
    createUser:      (email, password, role)      => request('POST',   'api/auth/users', { email, password, role }),

    // Projects
    getProjects:     ()                           => request('GET',    'projects/'),
    createProject:   (name, desc)                 => request('POST',   'projects/', { name, description: desc }),
    deleteProject:   (id)                         => request('DELETE', `projects/${id}`),

    // Components
    getComponents:   (pid)                        => request('GET',    `projects/${pid}/components/`),
    createComponent: (pid, name, type)            => request('POST',   `projects/${pid}/components/`, { name, type }),
    getComponent:    (pid, cid)                   => request('GET',    `projects/${pid}/components/${cid}`),
    updateComponent: (pid, cid, data)             => request('PATCH',  `projects/${pid}/components/${cid}`, data),
    deleteComponent: (pid, cid)                   => request('DELETE', `projects/${pid}/components/${cid}`),

    // Chat (per-component)
    getHistory:      (pid, cid)                   => request('GET',    `projects/${pid}/components/${cid}/chat/`),
    sendMessage:     (pid, cid, msg, signal)       => request('POST',   `projects/${pid}/components/${cid}/chat/`, { message: msg }, signal),
    getJobStatus:    (pid, cid, jobId)            => request('GET',    `projects/${pid}/components/${cid}/chat/jobs/${jobId}`),

    // Execute
    execute:         (pid, cid, inputs)           => request('POST',   `projects/${pid}/execute/${cid}`, { inputs: inputs || {} }),
    executeCell:     (pid, cid, cellIndex)        => request('POST',   `projects/${pid}/execute/${cid}/cell`, { cell_index: cellIndex, inputs: {} }),
    inspectColumns:  (pid, cid)                   => request('POST',   `projects/${pid}/execute/${cid}/columns`),

    // Settings
    getSettings:     ()                           => request('GET',    'settings/'),
    updateSettings:  (data)                       => request('PUT',    'settings/', data),

    // Dashboards
    getDashboards:   (pid)                        => request('GET',    `projects/${pid}/dashboards/`),
    createDashboard: (pid, name)                  => request('POST',   `projects/${pid}/dashboards/`, { name }),
    getDashboard:    (pid, did)                   => request('GET',    `projects/${pid}/dashboards/${did}`),
    updateDashboard: (pid, did, data)             => request('PATCH',  `projects/${pid}/dashboards/${did}`, data),
    deleteDashboard: (pid, did)                   => request('DELETE', `projects/${pid}/dashboards/${did}`),
  };
})();
