// Accessible dropdown used for both value pickers ("select" mode, listbox
// semantics, shows a check on the chosen option) and action menus ("menu"
// mode, menu semantics). Styled with the Library's own button and panel tokens.
import { esc, icon } from './ui.js';

const GAP = 6;
let nextId = 0;

// Pure keyboard helpers, exported for tests.
export function moveIndex(index, key, count) {
  if (!count) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return index < 0 ? 0 : (index + 1) % count;
  if (key === 'ArrowUp') return index < 0 ? count - 1 : (index - 1 + count) % count;
  return index;
}

export function typeaheadIndex(labels, start, char) {
  const needle = char.toLowerCase();
  for (let step = 1; step <= labels.length; step++) {
    const index = (start + step) % labels.length;
    if (labels[index].toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

/**
 * @param {HTMLElement} container empty element to mount into
 * @param {object} config
 * @param {'select'|'menu'} [config.mode]
 * @param {{value: string, label: string}[]} config.options
 * @param {string} [config.value] selected value (select mode)
 * @param {string} [config.label] trigger text (menu mode)
 * @param {string} [config.iconName] leading trigger icon
 * @param {string} [config.ariaLabel]
 * @param {'start'|'end'} [config.align] panel edge aligned with the trigger
 * @param {'primary'|'secondary'} [config.variant] trigger button style
 * @param {(value: string) => void} config.onSelect
 */
export function createDropdown(container, config) {
  const mode = config.mode || 'select';
  const id = `dropdown-${++nextId}`;
  const state = {
    options: config.options || [],
    value: config.value ?? '',
    label: config.label || '',
    active: -1
  };

  container.classList.add('dropdown');
  container.innerHTML = `
    <button type="button" class="btn btn-${config.variant || 'secondary'} dropdown-trigger"
      aria-haspopup="${mode === 'select' ? 'listbox' : 'menu'}" aria-expanded="false" aria-controls="${id}"
      ${config.ariaLabel ? `aria-label="${esc(config.ariaLabel)}"` : ''}>
      ${config.iconName ? icon(config.iconName) : ''}
      <span class="dropdown-label"></span>
      <span class="dropdown-chevron">${icon('chevron', 14)}</span>
    </button>
    <div class="dropdown-panel" id="${id}" role="${mode === 'select' ? 'listbox' : 'menu'}" tabindex="-1"
      data-align="${config.align || 'start'}" hidden></div>`;
  const trigger = container.querySelector('.dropdown-trigger');
  const panel = container.querySelector('.dropdown-panel');
  const isOpen = () => !panel.hidden;
  const selectedIndex = () => state.options.findIndex((option) => option.value === state.value);

  function renderTrigger() {
    const text = mode === 'select' ? state.options[selectedIndex()]?.label || '' : state.label;
    container.querySelector('.dropdown-label').textContent = text;
    // Keep the current value audible: "Filter by tag: design".
    if (config.ariaLabel) {
      trigger.setAttribute(
        'aria-label',
        mode === 'select' ? `${config.ariaLabel}: ${text}` : config.ariaLabel
      );
    }
  }

  function renderOptions() {
    const role = mode === 'select' ? 'option' : 'menuitem';
    panel.innerHTML = state.options
      .map((option, index) => {
        const selected = mode === 'select' && option.value === state.value;
        return `
          <div class="dropdown-option ${index === state.active ? 'is-active' : ''}" id="${id}-${index}"
            role="${role}" data-index="${index}" ${mode === 'select' ? `aria-selected="${selected}"` : ''}>
            ${mode === 'select' ? `<span class="dropdown-check">${icon('check', 14)}</span>` : ''}
            <span>${esc(option.label)}</span>
          </div>`;
      })
      .join('');
    panel.setAttribute('aria-activedescendant', state.active >= 0 ? `${id}-${state.active}` : '');
  }

  function setActive(index) {
    state.active = index;
    panel
      .querySelectorAll('.dropdown-option')
      .forEach((element, i) => element.classList.toggle('is-active', i === index));
    panel.setAttribute('aria-activedescendant', index >= 0 ? `${id}-${index}` : '');
    panel.querySelector(`#${id}-${index}`)?.scrollIntoView({ block: 'nearest' });
  }

  // Opens downward unless the panel would overflow the viewport and fits above.
  function place() {
    panel.dataset.placement = 'bottom';
    const rect = trigger.getBoundingClientRect();
    const height = panel.offsetHeight;
    const overflowsBelow = rect.bottom + GAP + height > window.innerHeight;
    if (overflowsBelow && rect.top > height + GAP) panel.dataset.placement = 'top';
  }

  function onOutsidePointer(event) {
    if (!container.contains(event.target)) close(false);
  }

  function open() {
    if (isOpen() || trigger.disabled || !state.options.length) return;
    state.active = mode === 'select' ? Math.max(0, selectedIndex()) : 0;
    renderOptions();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    place();
    panel.focus();
    setActive(state.active);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    window.addEventListener('resize', closeQuietly);
  }

  function close(returnFocus) {
    if (!isOpen()) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    window.removeEventListener('resize', closeQuietly);
    if (returnFocus) trigger.focus();
  }

  function closeQuietly() {
    close(false);
  }

  function choose(index) {
    const option = state.options[index];
    if (!option) return;
    if (mode === 'select') {
      state.value = option.value;
      renderTrigger();
    }
    close(true);
    config.onSelect?.(option.value);
  }

  trigger.addEventListener('click', () => (isOpen() ? close(true) : open()));
  trigger.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });
  panel.addEventListener('keydown', (event) => {
    const { key } = event;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      setActive(moveIndex(state.active, key, state.options.length));
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      choose(state.active);
    } else if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (key === 'Tab') {
      close(false);
    } else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const index = typeaheadIndex(
        state.options.map((option) => option.label),
        state.active,
        key
      );
      if (index >= 0) setActive(index);
    }
  });
  panel.addEventListener('pointermove', (event) => {
    const index = Number(event.target.closest('.dropdown-option')?.dataset.index);
    if (Number.isInteger(index) && index !== state.active) setActive(index);
  });
  panel.addEventListener('click', (event) => {
    const option = event.target.closest('.dropdown-option');
    if (option) choose(Number(option.dataset.index));
  });

  renderTrigger();

  return {
    setOptions(options, value = state.value) {
      state.options = options;
      state.value = options.some((option) => option.value === value)
        ? value
        : (options[0]?.value ?? '');
      renderTrigger();
      if (isOpen()) renderOptions();
      return state.value;
    },
    setLabel(label) {
      state.label = label;
      renderTrigger();
    },
    setDisabled(disabled) {
      if (disabled) close(false);
      trigger.disabled = disabled;
    },
    close: () => close(false)
  };
}
