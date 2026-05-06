// modules/emoji-picker.js
// Lightweight emoji picker for title and message fields

const EMOJIS = [
  // Smileys & emotion
  '😀','😃','😄','😁','😆','😅','😂','🙂','😉','😊','😇','🥰','😍','🤩','😎',
  '😏','😮','😱','😢','😡','😤','🤔','🤗','🥳','😴','🤒','😷','🤢','🥺','😬',
  // Gestures & people
  '👍','👎','👌','✌️','🤞','✋','🙌','👏','🤝','🙏','💪','👋','🫶','❤️','💯',
  // Nature & sparkle
  '🌟','⭐','✨','💫','🔥','❄️','☀️','🌈','🌙','⚡','🌊','🍀','🌸','🌺','🌻',
  // Objects & tech
  '🔔','📣','📢','📱','💻','📧','📩','📬','🔗','🔒','🔑','💡','📷','🎥','📺',
  // Shopping & money
  '🛒','🛍️','💰','💵','💳','🏷️','🎁','🎀','📦','🏪','💎','🏆','🎯','🥇','🎖️',
  // Food & drink
  '☕','🍕','🍔','🍩','🍰','🎂','🍾','🥂','🍫','🍿','🧃','🍎','🍓','🧁','🎃',
  // Travel & activity
  '✈️','🚀','🚗','🏠','🏢','📍','⚽','🎮','🎵','🎶','🎤','🎬','🏋️','🤸','🎪',
  // Symbols & UI
  '✅','❌','⚠️','ℹ️','💬','🔴','🟡','🟢','⬆️','▶️','⏰','📅','📊','📈','🆕',
];

export function initEmojiPicker() {
  const panel = document.createElement('div');
  panel.id = 'emoji-panel';
  panel.className = 'emoji-panel hidden';
  panel.innerHTML = EMOJIS.map(e =>
    `<button class="emoji-item" type="button" data-emoji="${e}" title="${e}">${e}</button>`
  ).join('');
  document.body.appendChild(panel);

  let activeInput = null;

  // Remember which field was last focused
  ['campaign-title', 'campaign-message'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('focus', () => { activeInput = el; });
  });

  // Open/close panel for each emoji button
  ['emoji-btn-title', 'emoji-btn-message'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const fieldId = btnId === 'emoji-btn-title' ? 'campaign-title' : 'campaign-message';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeInput = document.getElementById(fieldId);
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.add('hidden');
      if (!isOpen) {
        positionPanel(panel, btn);
        panel.classList.remove('hidden');
      }
    });
  });

  // Insert emoji into the active input
  panel.addEventListener('click', (e) => {
    const item = e.target.closest('.emoji-item');
    if (!item || !activeInput) return;
    insertAtCursor(activeInput, item.dataset.emoji);
    panel.classList.add('hidden');
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Close panel when clicking anywhere outside
  document.addEventListener('click', () => panel.classList.add('hidden'));
}

function positionPanel(panel, anchor) {
  const rect = anchor.getBoundingClientRect();
  const panelW = 266;
  const left = Math.max(4, Math.min(rect.right - panelW, document.documentElement.clientWidth - panelW - 4));
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.left = `${left}px`;
}

function insertAtCursor(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  // Use text.length (code units) not [...text].length (code points) because
  // selectionStart is a code unit index — astral emoji are 2 code units each.
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
}
