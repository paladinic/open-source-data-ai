/**
 * Chat panel — scoped to a single component thread.
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
    fresh.addEventListener('input', _onInput);
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

  async function send() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;

    appendMessage('user', text);
    const typing = appendTyping();

    try {
      const res = await API.sendMessage(_projectId, _componentId, text);
      typing.remove();
      appendMessage('assistant', res.reply);
      if (res.component_updated) {
        await Workspace.refreshEditor();
        Workspace.run();  // auto-run without blocking the chat response
      }
    } catch (e) {
      typing.remove();
      appendMessage('assistant', `Error: ${e.message}`);
    } finally {
      input.disabled = false;
      document.getElementById('chat-input').focus();
      scrollBottom();
    }
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
    return appendMessage('assistant', '…');
  }

  function scrollBottom() {
    const el = document.getElementById('chat-messages');
    el.scrollTop = el.scrollHeight;
  }

  return { init, send };
})();
