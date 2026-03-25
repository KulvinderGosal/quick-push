// modules/modal.js
// All content set via textContent — never innerHTML with untrusted data

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function confirm({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', confirmClass = 'btn-primary' }) {
  return new Promise(resolve => {
    const overlay = createEl('div', 'modal-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    const card = createEl('div', 'modal-card');
    card.appendChild(createEl('div', 'modal-title', title));
    card.appendChild(createEl('div', 'modal-body', body));

    const actions = createEl('div', 'modal-actions');
    const cancelBtn = createEl('button', 'btn btn-secondary', cancelText);
    cancelBtn.type = 'button';
    const confirmBtn = createEl('button', `btn ${confirmClass}`, confirmText);
    confirmBtn.type = 'button';
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    card.appendChild(actions);
    overlay.appendChild(card);

    const close = (result) => { overlay.remove(); resolve(result); };
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

    document.body.appendChild(overlay);
    confirmBtn.focus();
  });
}

export function alert({ title, body, okText = 'OK' }) {
  return new Promise(resolve => {
    const overlay = createEl('div', 'modal-overlay');
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);

    const card = createEl('div', 'modal-card');
    card.appendChild(createEl('div', 'modal-title', title));
    card.appendChild(createEl('div', 'modal-body', body));

    const actions = createEl('div', 'modal-actions');
    const okBtn = createEl('button', 'btn btn-primary', okText);
    okBtn.type = 'button';
    actions.appendChild(okBtn);
    card.appendChild(actions);
    overlay.appendChild(card);

    okBtn.addEventListener('click', () => { overlay.remove(); resolve(); });
    document.body.appendChild(overlay);
    okBtn.focus();
  });
}
