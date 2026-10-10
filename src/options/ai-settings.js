// AI provider card: pick a provider preset, paste a key, connect. Models come
// from the provider's /models endpoint and a sensible default is preselected.
import { normalizeBaseUrl } from '../library/ai.js';
import { aiPermissions } from '../library/ai-permissions.js';
import { PROVIDERS, findProvider, pickDefaultModel } from '../library/ai-providers.js';
import { createDropdown } from './dropdown.js';
import { esc, icon } from './ui.js';

const PROVIDER_OPTIONS = PROVIDERS.map((p) => ({ value: p.id, label: p.label }));

// One control for both states: unchecked keeps the key for this browser session only.
const rememberToggle = (checked, attrs = '') => `
  <label class="check-row">
    <input class="check" type="checkbox" name="remember" ${checked ? 'checked' : ''} ${attrs}>
    <span>Remember on this device<small>Stored encrypted in this browser. Never synced or exported.</small></span>
  </label>`;

/** What Enter/submit does on the AI form. Pure helper for tests. */
export function aiFormSubmitAction(connected, hasModelField) {
  if (!connected) return 'connect';
  if (hasModelField) return 'save-model';
  return 'noop';
}

export function createAISettings(ctx, container) {
  const ui = {
    provider: ctx.ai.provider || PROVIDERS[0].id,
    customUrl: ctx.ai.provider === 'custom' ? ctx.ai.endpoint : '',
    models: null, // null = not loaded yet; [] = provider returned no list
    status: { text: '', tone: '' }
  };
  const provider = () => findProvider(ui.provider);
  const endpointFor = () => (provider().id === 'custom' ? ui.customUrl : provider().baseUrl);
  const connectedHere = () => {
    if (!ctx.ai.connected || ctx.ai.provider !== ui.provider) return false;
    return provider().id !== 'custom' || ctx.ai.endpoint === ui.customUrl;
  };

  function setStatus(text, tone = '') {
    ui.status = { text, tone };
    const line = container.querySelector('#aiStatus');
    if (!line) return;
    line.textContent = text;
    line.dataset.tone = tone;
  }

  const fail = (error) => setStatus(error.message, 'error');

  function keyFields() {
    const { keyUrl } = provider();
    return `
      ${provider().id === 'custom' ? `<label class="field"><span>API base URL</span><input class="input" name="endpoint" type="url" placeholder="https://api.example.com/v1" value="${esc(ui.customUrl)}"></label>` : ''}
      <label class="field">
        <span class="field-label">API key${keyUrl ? `<a href="${esc(keyUrl)}" target="_blank" rel="noopener noreferrer">Get a key${icon('external', 12)}</a>` : ''}</span>
        <input class="input" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your API key">
      </label>
      ${rememberToggle(ctx.ai.remember)}
      <div class="inline-actions start"><button class="btn btn-primary" type="submit">Connect</button></div>`;
  }

  function modelFields() {
    const listed = ui.models?.length;
    return `
      <div class="field"><span>Model</span>
        ${
          listed || ui.models === null
            ? '<div id="modelPicker"></div>'
            : `<div class="inline-input"><input class="input" name="model" placeholder="Model ID" value="${esc(ctx.ai.model)}"><button class="btn btn-secondary" type="button" data-action="save-model">Save</button></div>
             <span class="hint">This provider did not list its models. Enter one from its documentation.</span>`
        }
      </div>
      <div class="inline-actions start">
        <button class="btn btn-secondary" type="button" data-action="test" ${ctx.ai.model ? '' : 'disabled'}>Test</button>
        <button class="btn btn-ghost-danger" type="button" data-action="forget">Remove key</button>
      </div>
      ${rememberToggle(ctx.ai.remember, 'data-action="remember"')}`;
  }

  function render() {
    const connected = connectedHere();
    container.innerHTML = `
      <div class="card-head">
        <h2>AI suggestions</h2>
        <span class="badge ${ctx.ai.configured ? 'badge-on' : ''}">${ctx.ai.configured ? 'On' : 'Off'}</span>
      </div>
      <p class="subtle">Optional. Suggests tags and a short summary for a bookmark.</p>
      <form class="form" id="aiForm">
        <div class="field"><span>Provider</span><div id="providerPicker"></div></div>
        ${connected ? modelFields() : keyFields()}
        <p class="status-line" id="aiStatus" role="status" data-tone="${ui.status.tone}">${esc(ui.status.text)}</p>
      </form>`;
    createDropdown(container.querySelector('#providerPicker'), {
      ariaLabel: 'Provider',
      options: PROVIDER_OPTIONS,
      value: ui.provider,
      onSelect: (id) => {
        ui.provider = id;
        ui.models = null;
        setStatus('');
        render();
      }
    });
    bind(container.querySelector('#aiForm'));
    if (connected) mountModelPicker();
  }

  async function mountModelPicker() {
    const slot = container.querySelector('#modelPicker');
    if (!slot) return;
    const picker = createDropdown(slot, {
      ariaLabel: 'Model',
      options: ui.models?.map((id) => ({ value: id, label: id })) || [
        { value: '', label: 'Loading models…' }
      ],
      value: ctx.ai.model,
      onSelect: (model) => saveModel(model).catch(fail)
    });
    if (ui.models !== null) return;
    picker.setDisabled(true);
    try {
      ui.models = await ctx.rpc('ai:models');
    } catch (error) {
      ui.models = [];
      fail(error);
    }
    render();
  }

  async function connect(form) {
    if (provider().id === 'custom') ui.customUrl = form.endpoint.value.trim();
    const endpoint = normalizeBaseUrl(endpointFor());
    const key = form.key.value.trim();
    if (!key) throw new Error('Paste your API key.');
    // The permission prompt must open within the click, before any other await.
    const granted = await chrome.permissions.request(aiPermissions(endpoint));
    if (!granted) throw new Error('Permission declined. AI stays off.');
    setStatus('Connecting…');
    const remember = form.remember.checked;
    ctx.ai = await ctx.rpc('ai:configure', {
      provider: ui.provider,
      endpoint,
      key,
      model: '',
      remember
    });
    if (provider().id === 'custom') ui.customUrl = endpoint;
    try {
      ui.models = await ctx.rpc('ai:models');
    } catch {
      ui.models = [];
    }
    const model = pickDefaultModel(provider(), ui.models);
    if (model) ctx.ai = await ctx.rpc('ai:configure', { provider: ui.provider, endpoint, model });
    setStatus(
      model ? `Connected. Using ${model}.` : 'Connected. Enter a model to finish.',
      'success'
    );
    render();
  }

  async function saveModel(model) {
    if (!model.trim()) throw new Error('Enter a model ID.');
    ctx.ai = await ctx.rpc('ai:configure', {
      provider: ui.provider,
      endpoint: ctx.ai.endpoint,
      model
    });
    setStatus(`Using ${ctx.ai.model}.`, 'success');
    render();
  }

  async function setRemember(remember) {
    ctx.ai = await ctx.rpc('ai:remember', { remember });
    setStatus(
      remember ? 'Key remembered on this device.' : 'Key kept for this browser session only.',
      'success'
    );
  }

  async function testAI() {
    setStatus('Testing…');
    await ctx.rpc('ai:test', { requestId: crypto.randomUUID() });
    setStatus('Connection works.', 'success');
  }

  async function forgetAI() {
    const endpoint = ctx.ai.endpoint;
    await ctx.rpc('ai:forget');
    if (endpoint) await chrome.permissions.remove(aiPermissions(endpoint));
    ctx.ai = await ctx.rpc('ai:status');
    ui.models = null;
    setStatus('Key removed.');
    render();
  }

  function bind(form) {
    form.onsubmit = (event) => {
      event.preventDefault();
      const action = aiFormSubmitAction(connectedHere(), Boolean(form.elements.model));
      if (action === 'connect') connect(form.elements).catch(fail);
      else if (action === 'save-model') saveModel(form.elements.model.value).catch(fail);
    };
    form.onclick = (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'save-model') saveModel(form.elements.model.value).catch(fail);
      if (action === 'test') testAI().catch(fail);
      if (action === 'forget') forgetAI().catch(fail);
    };
    form.onchange = (event) => {
      if (event.target.dataset.action !== 'remember') return;
      setRemember(event.target.checked).catch(fail);
    };
  }

  render();
}
