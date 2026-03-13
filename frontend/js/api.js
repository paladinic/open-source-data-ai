/**
 * All backend communication routes through here.
 */
const API = (() => {
  const BASE = '/';

  async function request(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  return {
    health:          ()                    => request('GET',    'health'),

    // Projects
    getProjects:     ()                    => request('GET',    'projects/'),
    createProject:   (name, desc)          => request('POST',   'projects/', { name, description: desc }),
    deleteProject:   (id)                  => request('DELETE', `projects/${id}`),

    // Components
    getComponents:   (pid)                 => request('GET',    `projects/${pid}/components/`),
    createComponent: (pid, name, type)     => request('POST',   `projects/${pid}/components/`, { name, type }),
    getComponent:    (pid, cid)            => request('GET',    `projects/${pid}/components/${cid}`),
    updateComponent: (pid, cid, data)      => request('PATCH',  `projects/${pid}/components/${cid}`, data),
    deleteComponent: (pid, cid)            => request('DELETE', `projects/${pid}/components/${cid}`),

    // Chat (per-component)
    getHistory:      (pid, cid)            => request('GET',    `projects/${pid}/components/${cid}/chat/`),
    sendMessage:     (pid, cid, msg)       => request('POST',   `projects/${pid}/components/${cid}/chat/`, { message: msg }),

    // Execute
    execute:         (pid, cid, inputs)    => request('POST',   `projects/${pid}/execute/${cid}`, { inputs: inputs || {} }),
  };
})();
