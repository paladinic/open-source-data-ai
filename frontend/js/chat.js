/**
 * Chat panel - scoped to a single component thread.
 */
const Chat = (() => {
  let _projectId = null;
  let _componentId = null;
  let _components = [];   // all project components for @ autocomplete

  async function init(projectId, componentId) {
    _projectId = projectId;
    _componentId = componentId;
    _components = await API.getComponents(projectId);
    loadHistory();

    const input = document.getElementById('chat-input');
    // Remove any old listeners by replacing the element
    const fresh = input.cloneNode(true);
    input.parentNode.replaceChild(fresh, input);
    fresh.addEventListener('keydown', e => {
      if (_handleAutocompleteKey(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    fresh.addEventListener('input', () => { _onInput(); _autoGrow(fresh); });
    fresh.addEventListener('blur', () => setTimeout(_hideAutocomplete, 150));
    fresh.focus();
  }

  // ── @ Autocomplete ────────────────────────────────────────────────────────

  function _atQuery(input) {
    const before = input.value.slice(0, input.selectionStart);
    const m = before.match(/@(\w*)$/);
    return m ? { query: m[1].toLowerCase(), atIndex: m.index } : null;
  }

  function _onInput() {
    const input = document.getElementById('chat-input');
    const hit = _atQuery(input);
    if (!hit) { _hideAutocomplete(); return; }
    const filtered = _components.filter(c =>
      c.id !== _componentId && c.name.toLowerCase().includes(hit.query)
    );
    filtered.length ? _showAutocomplete(filtered) : _hideAutocomplete();
  }

  function _showAutocomplete(items) {
    let menu = document.getElementById('at-autocomplete');
    if (!menu) {
      menu = document.createElement('ul');
      menu.id = 'at-autocomplete';
      menu.className = 'at-autocomplete';
      document.getElementById('chat-input').closest('.ws-chat-input-row').appendChild(menu);
    }
    menu.innerHTML = items.map((c, i) => `
      <li class="at-ac-item${i === 0 ? ' active' : ''}" data-name="${escapeHtml(c.name)}">
        <span class="component-badge badge-${c.type} me-1">${c.type}</span>${escapeHtml(c.name)}
      </li>`).join('');
    menu.querySelectorAll('.at-ac-item').forEach(li =>
      li.addEventListener('mousedown', () => _selectAutocomplete(li.dataset.name))
    );
  }

  function _hideAutocomplete() {
    document.getElementById('at-autocomplete')?.remove();
  }

  function _handleAutocompleteKey(e) {
    const menu = document.getElementById('at-autocomplete');
    if (!menu) return false;
    const items = [...menu.querySelectorAll('.at-ac-item')];
    const activeIdx = items.findIndex(i => i.classList.contains('active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[activeIdx]?.classList.remove('active');
      items[(activeIdx + 1) % items.length]?.classList.add('active');
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[activeIdx]?.classList.remove('active');
      items[(activeIdx - 1 + items.length) % items.length]?.classList.add('active');
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const active = menu.querySelector('.at-ac-item.active');
      if (active) { e.preventDefault(); _selectAutocomplete(active.dataset.name); return true; }
    }
    if (e.key === 'Escape') { _hideAutocomplete(); return true; }
    return false;
  }

  function _selectAutocomplete(name) {
    const input = document.getElementById('chat-input');
    const hit = _atQuery(input);
    if (!hit) return;
    const before = input.value.slice(0, hit.atIndex);
    const after = input.value.slice(input.selectionStart);
    input.value = before + '@' + name + ' ' + after;
    input.selectionStart = input.selectionEnd = before.length + name.length + 2;
    _hideAutocomplete();
    input.focus();
  }

  async function loadHistory() {
    const messages = await API.getHistory(_projectId, _componentId);
    const el = document.getElementById('chat-messages');
    el.innerHTML = '';
    messages.forEach(m => appendMessage(m.role, m.content));
    scrollBottom();
  }

  function _autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  async function send() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';

    appendMessage('user', text);
    const typing = appendTyping();

    let jobData;
    try {
      jobData = await API.sendMessage(_projectId, _componentId, text);
    } catch (e) {
      typing._clearTimers?.();
      typing.remove();
      appendMessage('assistant', `Error: ${e.message}`);
      scrollBottom();
      return;
    }

    const { job_id } = jobData;
    Jobs.add(job_id, `${_componentId}`);

    // Re-enable input immediately — user can do other things while job runs
    input.focus();

    // Poll until done
    const poll = async () => {
      try {
        const status = await API.getJobStatus(_projectId, _componentId, job_id);
        if (status.status === 'pending') {
          setTimeout(poll, 2000);
          return;
        }
        Jobs.remove(job_id);
        typing._clearTimers?.();
        typing.remove();
        if (status.status === 'done' && status.result) {
          appendMessage('assistant', status.result.reply);
          if (status.result.component_updated) {
            await Workspace.refreshEditor();
            Workspace.run();
          }
        } else {
          appendMessage('assistant', `Error: ${status.error || 'Unknown error'}`);
        }
        scrollBottom();
      } catch (e) {
        Jobs.remove(job_id);
        typing._clearTimers?.();
        typing.remove();
        appendMessage('assistant', `Error: ${e.message}`);
        scrollBottom();
      }
    };
    setTimeout(poll, 2000);
  }

  function appendMessage(role, content) {
    const el = document.getElementById('chat-messages');
    const wrapper = document.createElement('div');
    wrapper.className = `d-flex ${role === 'user' ? 'justify-content-end' : 'justify-content-start'} mb-2`;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = content;
    wrapper.appendChild(bubble);
    el.appendChild(wrapper);
    scrollBottom();
    return wrapper;
  }

  function appendTyping() {
    const el = document.getElementById('chat-messages');
    const wrapper = document.createElement('div');
    wrapper.className = 'd-flex justify-content-start mb-2';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant';

    const dots = '<div class="dot-wave" aria-label="Loading" role="status"><span></span><span></span><span></span></div>';
    const setStatus = msg => {
      bubble.innerHTML = `${dots}<span class="chat-status-text">${msg}</span>`;
      scrollBottom();
    };
    bubble.innerHTML = dots;

    // Timed status hints - purely cosmetic, zero extra tokens
    const stages = [
      [5000,  'Generating code…'],
      [12000, 'Testing code…'],
      [20000, 'Fixing issues…'],
      [30000, 'Almost done…'],
    ];
    const timers = stages.map(([delay, msg]) => setTimeout(() => setStatus(msg), delay));
    wrapper._clearTimers = () => timers.forEach(clearTimeout);

    wrapper.appendChild(bubble);
    el.appendChild(wrapper);
    scrollBottom();
    return wrapper;
  }

  function scrollBottom() {
    const el = document.getElementById('chat-messages');
    el.scrollTop = el.scrollHeight;
  }

  return { init, send };
})();
