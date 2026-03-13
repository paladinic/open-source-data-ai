/**
 * Chat panel — scoped to a single component thread.
 */
const Chat = (() => {
  let _projectId = null;
  let _componentId = null;

  function init(projectId, componentId) {
    _projectId = projectId;
    _componentId = componentId;
    loadHistory();

    const input = document.getElementById('chat-input');
    // Remove any old listeners by replacing the element
    const fresh = input.cloneNode(true);
    input.parentNode.replaceChild(fresh, input);
    fresh.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    fresh.focus();
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
