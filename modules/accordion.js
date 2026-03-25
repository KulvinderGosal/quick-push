// modules/accordion.js

export function initAccordions(container = document) {
  container.querySelectorAll('[data-accordion]').forEach(el => {
    const header = el.querySelector('.accordion-header');
    if (!header) return;
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('tabindex', '0');

    const toggle = () => {
      if (el.getAttribute('data-locked') === 'true') return;
      const body = el.querySelector('.accordion-body');
      const isOpen = el.classList.contains('accordion-open');
      if (isOpen) {
        // Closing
        el.classList.remove('accordion-open');
        header.setAttribute('aria-expanded', 'false');
        body.classList.add('hidden');
      } else {
        // Opening
        body.classList.remove('hidden');
        el.classList.add('accordion-open');
        header.setAttribute('aria-expanded', 'true');
      }
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

export function lockAccordion(name, message) {
  const el = document.querySelector(`[data-accordion="${name}"]`);
  if (!el) return;
  el.setAttribute('data-locked', 'true');
  const lock = el.querySelector('.accordion-lock');
  if (lock) lock.classList.remove('hidden');
  const body = el.querySelector('.accordion-body');
  if (!body) return;
  body.classList.remove('hidden');
  body.textContent = '';
  const nudge = document.createElement('div');
  nudge.className = 'upgrade-nudge';
  const msg = document.createElement('p');
  msg.textContent = message;
  nudge.appendChild(msg);
  const link = document.createElement('a');
  link.href = 'https://app.pushengage.com/account/billing?utm_source=extension&utm_medium=upgrade-nudge&utm_campaign=feature-locked';
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'btn btn-upgrade';
  link.textContent = 'Upgrade Plan';
  nudge.appendChild(link);
  body.appendChild(nudge);
}

export function openAccordion(name) {
  const el = document.querySelector(`[data-accordion="${name}"]`);
  if (el && !el.classList.contains('accordion-open')) el.querySelector('.accordion-header')?.click();
}
