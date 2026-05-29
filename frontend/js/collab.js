/**
 * Real-time collaboration: presence, prompt lock, cell sync, remote cursors.
 * Uses Supabase Realtime Presence + Broadcast. No-ops in lite mode.
 */
const Collab = (() => {
  let _sb = null;
  let _channel = null;
  let _userEmail = '';
  let _lockedBy = null;

  // ── Init (called once after auth) ────────────────────────────────────────

  function init(supabaseUrl, anonKey, token) {
    if (!supabaseUrl || typeof supabase === 'undefined') return;
    _sb = supabase.createClient(supabaseUrl, anonKey);
    _sb.realtime.setAuth(token);
  }

  // ── Channel lifecycle ─────────────────────────────────────────────────────

  async function join(componentId, userEmail) {
    if (!_sb) return;
    leave();
    _userEmail = userEmail || '';
    _lockedBy = null;

    _channel = _sb.channel(`component:${componentId}`, {
      config: { presence: { key: _userEmail } }
    });

    _channel
      .on('presence', { event: 'sync' }, () => {
        _renderPresence();
        _syncPresenceLeave();
      })
      .on('broadcast', { event: 'lock' }, ({ payload }) => {
        _lockedBy = payload.locked ? payload.email : null;
        _renderLock();
      })
      .on('broadcast', { event: 'cell' }, ({ payload }) => {
        if (payload.email === _userEmail) return;
        Workspace.applyRemoteCellChange?.(payload.cellId, payload.content, payload.email);
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (payload.email === _userEmail) return;
        Workspace.applyRemoteCursor?.(payload.cellId, payload.line, payload.col, payload.email, _emailColor(payload.email));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await _channel.track({ email: _userEmail, ts: Date.now() });
        }
      });
  }

  function leave() {
    if (!_channel) return;
    _channel.unsubscribe();
    _channel = null;
    _lockedBy = null;
    _renderPresence();
    _renderLock();
  }

  // Track who was present so we can detect leaves
  let _prevPresent = new Set();

  function _syncPresenceLeave() {
    if (!_channel) return;
    const state = _channel.presenceState();
    const nowPresent = new Set(
      Object.values(state).flat().map(p => p.email).filter(Boolean)
    );
    for (const email of _prevPresent) {
      if (!nowPresent.has(email) && email !== _userEmail) {
        Workspace.clearRemoteCursors?.(email);
      }
    }
    _prevPresent = nowPresent;
  }

  // ── Lock broadcast ────────────────────────────────────────────────────────

  function broadcastLock(locked) {
    _channel?.send({ type: 'broadcast', event: 'lock', payload: { locked, email: _userEmail } });
  }

  function isLockedByOther() {
    return !!_lockedBy && _lockedBy !== _userEmail;
  }

  // ── Cell content broadcast ────────────────────────────────────────────────

  function broadcastCellChange(cellId, content) {
    _channel?.send({ type: 'broadcast', event: 'cell', payload: { cellId, content, email: _userEmail } });
  }

  // ── Cursor broadcast ──────────────────────────────────────────────────────

  function broadcastCursor(cellId, line, col) {
    _channel?.send({ type: 'broadcast', event: 'cursor', payload: { cellId, line, col, email: _userEmail } });
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function _renderPresence() {
    const el = document.getElementById('ws-presence');
    if (!el) return;
    if (!_channel) { el.innerHTML = ''; return; }
    const state = _channel.presenceState();
    const others = [...new Set(
      Object.values(state).flat().map(p => p.email).filter(e => e && e !== _userEmail)
    )];
    el.innerHTML = others.map(email => {
      const initials = email.split('@')[0].slice(0, 2).toUpperCase();
      return `<span class="collab-avatar" title="${escapeHtml(email)}" style="background:${_emailColor(email)}">${initials}</span>`;
    }).join('');
  }

  function _renderLock() {
    const sendBtn = document.getElementById('chat-send-btn');
    const input = document.getElementById('chat-input');
    const notice = document.getElementById('ws-lock-notice');
    const locked = isLockedByOther();
    if (sendBtn) sendBtn.disabled = locked;
    if (input) input.disabled = locked;
    if (notice) {
      notice.textContent = locked ? `${_lockedBy} is running a prompt…` : '';
      notice.style.display = locked ? '' : 'none';
    }
  }

  function _emailColor(email) {
    let h = 0;
    for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    return `hsl(${Math.abs(h) % 360}, 55%, 42%)`;
  }

  return { init, join, leave, broadcastLock, isLockedByOther, broadcastCellChange, broadcastCursor };
})();
