// modules/segments.js
// Segment Manager screen — URL pattern intelligence, create/update segments

import { getState, setState } from './state.js';
import * as api from './api.js';
import { canWriteSegment } from './permissions.js';
import { hasAiCredits } from './permissions.js';
import { suggestSegmentName } from './ai.js';
import { setText, escapeHtml } from './sanitize.js';

// ── Helpers ────────────────────────────────────────────────────────────

function showToast(message, type = 'success', duration = 3000) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = message;
    el.className = type === 'error' ? 'toast toast--error' : 'toast toast--success';
    el.classList.remove('hidden');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add('hidden'), duration);
    return;
  }
  // Fallback: create ephemeral toast
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed', 'top:20px', 'right:20px',
    `background:${type === 'error' ? 'var(--pe-red)' : 'var(--pe-green)'}`,
    'color:white', 'padding:12px 20px', 'border-radius:8px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.15)', 'font-size:13px',
    'font-weight:600', 'z-index:10000'
  ].join(';');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function generatePatterns(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const patterns = [];

    // Exact page
    patterns.push({ label: 'Exact page', rule: 'exact', value: parsed.pathname });

    // Topic (second-to-last segment)
    if (pathParts.length >= 2) {
      const topic = '/' + pathParts.slice(0, -1).join('/') + '/';
      patterns.push({ label: 'This topic (recommended)', rule: 'contains', value: topic });
    }

    // Broad category (first segment)
    if (pathParts.length >= 1) {
      patterns.push({ label: 'Broad category', rule: 'contains', value: '/' + pathParts[0] + '/' });
    }

    return patterns;
  } catch {
    return [];
  }
}

function autoNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      // Use the topic (second-to-last) segment
      const topic = parts[parts.length - 2];
      return topic.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    if (parts.length === 1) {
      return parts[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return '';
  } catch {
    return '';
  }
}

function segmentOverlaps(segment, patterns) {
  const criteria = segment.segment_criteria;
  if (!criteria || !criteria.include || criteria.include.length === 0) return false;
  return criteria.include.some(rule => {
    return patterns.some(p => {
      if (rule.rule === 'contains' && p.rule === 'contains') {
        return rule.value.includes(p.value) || p.value.includes(rule.value);
      }
      if (rule.rule === 'exact' && p.rule === 'exact') {
        return rule.value === p.value;
      }
      if (rule.rule === 'contains') return p.value.includes(rule.value);
      if (p.rule === 'contains') return rule.value.includes(p.value);
      return false;
    });
  });
}

// ── DOM references ─────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

// ── Render existing segments list ──────────────────────────────────────

function renderSegmentList(segments, patterns) {
  const list = $('segment-mgr-list');
  if (!list) return;

  // Clear existing children
  while (list.firstChild) list.removeChild(list.firstChild);

  if (!segments || segments.length === 0) {
    const li = document.createElement('li');
    li.className = 'segment-mgr-item';
    const span = document.createElement('span');
    span.className = 'segment-mgr-item-name';
    span.textContent = 'No segments found.';
    li.appendChild(span);
    list.appendChild(li);
    return;
  }

  // Sort by subscriber count descending (API field is 'subscribers', not 'subscriber_count')
  const sorted = [...segments].sort((a, b) => (b.subscribers || 0) - (a.subscribers || 0));

  sorted.forEach(seg => {
    const li = document.createElement('li');
    li.className = 'segment-mgr-item';
    li.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid var(--pe-gray-200);border-radius:8px;margin-bottom:8px;background:var(--pe-white);';

    // Row 1: name + subscriber count
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';

    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-weight:600;font-size:13px;color:var(--pe-navy);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nameSpan.textContent = seg.segment_name || 'Unnamed';
    nameSpan.title = seg.segment_name || '';
    topRow.appendChild(nameSpan);

    const countBadge = document.createElement('span');
    countBadge.style.cssText = 'font-size:11px;color:var(--pe-gray-500);white-space:nowrap;background:var(--pe-gray-100);padding:2px 8px;border-radius:12px;';
    const count = seg.subscribers != null ? seg.subscribers.toLocaleString() : '0';
    countBadge.textContent = count + ' subs';
    topRow.appendChild(countBadge);

    li.appendChild(topRow);

    // Row 2: rules summary (truncated)
    if (seg.segment_criteria && seg.segment_criteria.include && seg.segment_criteria.include.length > 0) {
      const rulesSpan = document.createElement('span');
      rulesSpan.style.cssText = 'font-size:11px;color:var(--pe-gray-400);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;';
      const ruleTexts = seg.segment_criteria.include.slice(0, 2).map(r => r.value);
      rulesSpan.textContent = ruleTexts.join(', ') + (seg.segment_criteria.include.length > 2 ? ' +' + (seg.segment_criteria.include.length - 2) + ' more' : '');
      rulesSpan.title = seg.segment_criteria.include.map(r => r.rule + ': ' + r.value).join(', ');
      li.appendChild(rulesSpan);
    }

    // Row 3: Add button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'margin-top:4px;padding:4px 12px;font-size:11px;font-weight:600;color:var(--pe-white);background:var(--pe-blue);border:none;border-radius:6px;cursor:pointer;align-self:flex-start;';
    btn.textContent = '+ Add URL Pattern';
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--pe-blue-hover)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--pe-blue)'; });
    btn.addEventListener('click', () => handleAddToExisting(seg, patterns));
    li.appendChild(btn);

    list.appendChild(li);
  });
}

// ── Get selected pattern from radios ───────────────────────────────────

function getSelectedPattern(patterns) {
  const radios = document.querySelectorAll('input[name="segment-rule"]');
  let selectedValue = 'exact';
  for (const r of radios) {
    if (r.checked) { selectedValue = r.value; break; }
  }

  if (selectedValue === 'custom') {
    const customInput = $('segment-custom-pattern');
    const customVal = customInput ? customInput.value.trim() : '';
    return { rule: 'contains', value: customVal };
  }

  // Map radio value to pattern
  if (selectedValue === 'exact' && patterns.length > 0) {
    return { rule: patterns[0].rule, value: patterns[0].value };
  }
  if (selectedValue === 'topic') {
    const topicPattern = patterns.find(p => p.label.includes('topic'));
    if (topicPattern) return { rule: topicPattern.rule, value: topicPattern.value };
  }
  if (selectedValue === 'broad') {
    const broadPattern = patterns.find(p => p.label.includes('Broad'));
    if (broadPattern) return { rule: broadPattern.rule, value: broadPattern.value };
  }

  // Fallback to exact
  if (patterns.length > 0) return { rule: patterns[0].rule, value: patterns[0].value };
  return { rule: 'exact', value: '/' };
}

// ── Add pattern to existing segment ────────────────────────────────────

async function handleAddToExisting(segment, patterns) {
  const siteId = getState('activeSiteId');
  if (!siteId) return;

  const selected = getSelectedPattern(patterns);
  if (!selected.value) {
    showToast('Please select or enter a URL pattern.', 'error');
    return;
  }

  try {
    const criteria = segment.segment_criteria || { include: [], exclude: [] };
    if (!criteria.include) criteria.include = [];
    if (!criteria.exclude) criteria.exclude = [];
    criteria.include.push({ rule: selected.rule, value: selected.value });

    await api.updateSegment(siteId, segment.segment_id, { segment_criteria: criteria });
    showToast('URL pattern added to "' + (segment.segment_name || 'segment') + '"');
    await refreshSegments(patterns);
  } catch (err) {
    showToast(err.message || 'Failed to update segment.', 'error');
  }
}

// ── Refresh segments from API ──────────────────────────────────────────

async function refreshSegments(patterns) {
  const siteId = getState('activeSiteId');
  if (!siteId) return;

  try {
    const result = await api.listSegments(siteId, { limit: 100, expand: 'subscriber_analytics' });
    const segments = result?.data?.data || result?.data || [];
    setState('segmentsList', segments);

    const overlapping = segments.filter(seg => segmentOverlaps(seg, patterns));
    renderSegmentList(overlapping.length > 0 ? overlapping : segments, patterns);
  } catch (err) {
    showToast('Failed to load segments.', 'error');
  }
}

// ── Main export ────────────────────────────────────────────────────────

export function initSegments() {
  // Permission check
  if (!canWriteSegment()) {
    const list = $('segment-mgr-list');
    if (list) {
      while (list.firstChild) list.removeChild(list.firstChild);
      const li = document.createElement('li');
      li.className = 'segment-mgr-item';
      const span = document.createElement('span');
      span.className = 'segment-mgr-item-name';
      span.textContent = 'Segment management requires a Growth plan or above.';
      li.appendChild(span);
      list.appendChild(li);
    }
    // Disable create button
    const createBtn = $('btn-create-segment');
    if (createBtn) createBtn.disabled = true;
    return;
  }

  // Current page URL
  const pageData = getState('pageData');
  const currentUrl = pageData ? pageData.url : '';
  const urlDisplay = $('segment-mgr-current-url');
  if (urlDisplay) {
    setText(urlDisplay, currentUrl || 'No page URL available');
  }

  // Generate patterns from URL
  const patterns = generatePatterns(currentUrl);

  // Populate radio labels with pattern details
  const radios = document.querySelectorAll('input[name="segment-rule"]');
  radios.forEach(radio => {
    const label = radio.closest('label');
    if (!label) return;
    const labelSpan = label.querySelector('.segment-item-label');
    if (!labelSpan) return;

    if (radio.value === 'exact' && patterns.length > 0) {
      setText(labelSpan, 'Exact page (' + patterns[0].value + ')');
    } else if (radio.value === 'topic') {
      const topicP = patterns.find(p => p.label.includes('topic'));
      if (topicP) {
        setText(labelSpan, 'This topic — recommended (' + topicP.value + ')');
        radio.checked = true; // Default to recommended
      }
    } else if (radio.value === 'broad') {
      const broadP = patterns.find(p => p.label.includes('Broad'));
      if (broadP) setText(labelSpan, 'Broad category (' + broadP.value + ')');
    }
    // Custom stays as-is
  });

  // Show/hide custom pattern input based on radio selection
  const customGroup = $('segment-custom-pattern-group');
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (customGroup) {
        if (radio.value === 'custom' && radio.checked) {
          customGroup.classList.remove('hidden');
        } else {
          customGroup.classList.add('hidden');
        }
      }
    });
  });

  // Auto-generate segment name from URL or page title, deduplicate if needed
  const nameInput = $('segment-mgr-new-name');
  const existingNamesList = (getState('segmentsList') || []).map(s => s.segment_name || '');
  const existingNamesSet = new Set(existingNamesList.map(n => n.toLowerCase()));
  let autoName = autoNameFromUrl(currentUrl) || (pageData?.title ? pageData.title.split(/[|\-–—]/).map(s => s.trim()).filter(Boolean)[0] || '' : '');
  if (nameInput && autoName) {
    if (existingNamesSet.has(autoName.toLowerCase())) {
      let i = 2;
      while (existingNamesSet.has((autoName + '_v' + i).toLowerCase())) i++;
      autoName = autoName + '_v' + i;
    }
    nameInput.value = autoName;
  }

  // AI segment name suggestion button
  const aiNameBtn = $('btn-ai-segment-name');
  if (aiNameBtn && nameInput) {
    if (!hasAiCredits()) {
      aiNameBtn.disabled = true;
      aiNameBtn.title = 'No AI credits';
    }
    aiNameBtn.addEventListener('click', async () => {
      if (!currentUrl) { showToast('No page URL to analyze', 'error'); return; }
      aiNameBtn.disabled = true;
      aiNameBtn.textContent = '...';
      try {
        const names = await suggestSegmentName(currentUrl, existingNamesList);
        if (names.length > 0) {
          // Show suggestions as clickable chips below the input
          let container = nameInput.parentElement.querySelector('.ai-suggestions');
          if (container) container.remove();
          container = document.createElement('div');
          container.className = 'ai-suggestions';
          names.forEach(name => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'ai-suggestion-chip';
            chip.textContent = name;
            chip.addEventListener('click', () => {
              nameInput.value = name;
              container.remove();
            });
            container.appendChild(chip);
          });
          nameInput.parentElement.appendChild(container);
        }
      } catch (err) {
        showToast(err.message || 'AI suggestion failed', 'error');
      } finally {
        aiNameBtn.disabled = false;
        aiNameBtn.textContent = 'AI';
      }
    });
  }

  // Load and render existing segments (with overlap filtering)
  const existingSegments = getState('segmentsList') || [];
  const overlapping = existingSegments.filter(seg => segmentOverlaps(seg, patterns));
  renderSegmentList(overlapping.length > 0 ? overlapping : existingSegments, patterns);

  // Also refresh from API in background
  refreshSegments(patterns);

  // Search filter
  const searchInput = $('segment-mgr-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      const allSegments = getState('segmentsList') || [];
      if (!query) {
        const filtered = allSegments.filter(seg => segmentOverlaps(seg, patterns));
        renderSegmentList(filtered.length > 0 ? filtered : allSegments, patterns);
        return;
      }
      const matched = allSegments.filter(seg =>
        (seg.segment_name || '').toLowerCase().includes(query)
      );
      renderSegmentList(matched, patterns);
    });
  }

  // Create Segment button
  const createBtn = $('btn-create-segment');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const siteId = getState('activeSiteId');
      if (!siteId) {
        showToast('No active site selected.', 'error');
        return;
      }

      const nameVal = nameInput ? nameInput.value.trim() : '';
      if (!nameVal) {
        showToast('Please enter a segment name.', 'error');
        if (nameInput) nameInput.focus();
        return;
      }

      // Check for duplicate name
      const existing = (getState('segmentsList') || []).find(
        s => (s.segment_name || '').toLowerCase() === nameVal.toLowerCase()
      );
      if (existing) {
        showToast('Segment "' + nameVal + '" already exists. Use "Add URL Pattern" instead.', 'error');
        return;
      }

      const selected = getSelectedPattern(patterns);
      if (!selected.value) {
        showToast('Please select or enter a URL pattern.', 'error');
        return;
      }

      const autoAddCheckbox = $('segment-auto-add');
      const autoAddChecked = autoAddCheckbox ? autoAddCheckbox.checked : false;

      createBtn.disabled = true;
      setText(createBtn, 'Creating...');

      try {
        await api.createSegment(siteId, {
          segment_name: nameVal,
          segment_criteria: {
            include: [{ rule: selected.rule, value: selected.value }],
            exclude: []
          },
          add_segment_on_page_load: autoAddChecked ? 1 : 0
        });

        showToast('Segment "' + nameVal + '" created successfully!');
        if (nameInput) nameInput.value = '';
        await refreshSegments(patterns);
      } catch (err) {
        showToast(err.message || 'Failed to create segment.', 'error');
      } finally {
        createBtn.disabled = false;
        setText(createBtn, 'Create Segment');
      }
    });
  }

  // Back button
  const backBtn = $('btn-back-segments');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      setState('currentScreen', 'compose');
    });
  }
}
