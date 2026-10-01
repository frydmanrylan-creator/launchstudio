// Project brief: 3-step form, client validation, server submission.
// Nothing is kept in localStorage; success is shown only after the server confirms delivery.

const form = document.getElementById('brief-form');
const steps = [...form.querySelectorAll('.step')];
const label = document.getElementById('step-label');
const bar = document.getElementById('progress-bar');
const summary = document.getElementById('error-summary');
const statusEl = document.getElementById('form-status');
const back = document.getElementById('back');
const next = document.getElementById('next');
const submit = document.getElementById('submit');
const success = document.getElementById('success');
const urlField = document.getElementById('url-field');
const STEP_NAMES = ['About you', 'Your business', 'Style and timing'];
let current = 0;
let token = '';
// On static hosting (GitHub Pages) there's no server: the brief opens as an email the visitor sends.
const STATIC = document.querySelector('meta[name="ls-mode"]')?.content === 'static';
const OWNER = 'launchstud0@gmail.com';

async function getToken() {
  if (STATIC) return;
  try {
    const r = await fetch('api/form-token', { cache: 'no-store' });
    if (r.ok) token = (await r.json()).token;
  } catch { /* retried on submit */ }
}
getToken();

function show(i, focus = true) {
  current = i;
  steps.forEach((s, n) => { s.hidden = n !== i; });
  label.textContent = `Step ${i + 1} of ${steps.length} · ${STEP_NAMES[i]}`;
  bar.style.width = `${((i + 1) / steps.length) * 100}%`;
  back.hidden = i === 0;
  next.hidden = i === steps.length - 1;
  submit.hidden = i !== steps.length - 1;
  clearErrors();
  if (focus) {
    const first = steps[i].querySelector('input:not([type=radio]):not([type=checkbox]), select, textarea, input');
    first?.focus({ preventScroll: true });
    form.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}

function fieldLabel(el) {
  const group = el.closest('.group');
  if (group) return group.querySelector('legend').firstChild.textContent.trim();
  if (el.id === 'f-consent') return 'Consent';
  return form.querySelector(`label[for="${el.id}"]`)?.firstChild.textContent.trim() || el.name;
}

function clearErrors() {
  summary.hidden = true;
  summary.innerHTML = '';
  form.querySelectorAll('.field-error').forEach(e => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach(e => { e.removeAttribute('aria-invalid'); e.removeAttribute('aria-describedby'); });
}

function markError(el, message) {
  const container = el.closest('.group') || el.closest('.field');
  const id = `err-${el.name}`;
  if (!document.getElementById(id)) {
    const p = document.createElement('p');
    p.className = 'field-error';
    p.id = id;
    p.textContent = message;
    container.appendChild(p);
  }
  const targets = el.type === 'radio' ? form.querySelectorAll(`[name="${el.name}"]`) : [el];
  targets.forEach(t => { t.setAttribute('aria-invalid', 'true'); t.setAttribute('aria-describedby', id); });
  return { id: el.type === 'radio' ? null : el.id, name: el.name, message, el };
}

function showSummary(errors) {
  summary.innerHTML = `<strong>Please fix ${errors.length === 1 ? 'this' : 'these'}:</strong><ul>${
    errors.map(e => `<li><a href="#${e.el.id || ''}" data-name="${e.name}">${e.message}</a></li>`).join('')}</ul>`;
  summary.hidden = false;
  summary.focus();
  summary.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    form.querySelector(`[name="${a.dataset.name}"]`)?.focus();
  }));
}

function messageFor(el) {
  const name = fieldLabel(el);
  if (el.validity.valueMissing) {
    if (el.type === 'radio') return `${name}: choose an option.`;
    if (el.type === 'checkbox') return 'Please confirm I can use these details to reply to you.';
    return `${name} is required.`;
  }
  if (el.validity.typeMismatch) return el.type === 'email' ? 'Enter a valid email address, like name@example.com.' : 'Enter a full web address starting with https://';
  if (el.validity.tooLong) return `${name} is too long.`;
  return `${name} is not valid.`;
}

function validateStep(i) {
  clearErrors();
  const seen = new Set();
  const errors = [];
  for (const el of steps[i].querySelectorAll('input, select, textarea')) {
    if (el.closest('[hidden]') && el.closest('[hidden]') !== steps[i]) continue;
    if (seen.has(el.name) || el.checkValidity()) continue;
    seen.add(el.name);
    errors.push(markError(el, messageFor(el)));
  }
  if (errors.length) showSummary(errors);
  return errors.length === 0;
}

form.querySelectorAll('[name="has_website"]').forEach(r => r.addEventListener('change', () => {
  urlField.hidden = form.elements.has_website.value !== 'Yes';
}));
form.querySelector('[name="assets"][value="None yet"]').addEventListener('change', e => {
  if (e.target.checked) form.querySelectorAll('[name="assets"]').forEach(c => { if (c !== e.target) c.checked = false; });
});
form.querySelectorAll('[name="assets"]:not([value="None yet"])').forEach(c => c.addEventListener('change', () => {
  if (c.checked) form.querySelector('[name="assets"][value="None yet"]').checked = false;
}));

next.addEventListener('click', () => { if (validateStep(current)) show(current + 1); });
back.addEventListener('click', () => show(current - 1));
form.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && current < steps.length - 1) {
    e.preventDefault();
    next.click();
  }
});

function payload() {
  const fd = new FormData(form);
  const data = {};
  for (const key of new Set(fd.keys())) {
    const all = fd.getAll(key);
    data[key] = all.length > 1 ? all.join(', ') : all[0];
  }
  if (data.has_website !== 'Yes') data.website_url = '';
  data.consent = form.elements.consent.checked;
  data.token = token;
  return data;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  for (let i = 0; i < steps.length; i++) {
    if (!validateStep(i)) { if (i !== current) { show(i, false); validateStep(i); } return; }
  }
  if (STATIC) { emailBrief(); return; }
  submit.disabled = true;
  submit.textContent = 'Sending…';
  statusEl.className = 'form-status';
  statusEl.textContent = '';
  try {
    if (!token) await getToken();
    const r = await fetch('api/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.ok) {
      form.hidden = true;
      success.hidden = false;
      success.focus();
      return;
    }
    if (body.fields) {
      const errors = [];
      let firstStep = null;
      clearErrors();
      for (const [name, message] of Object.entries(body.fields)) {
        const el = form.querySelector(`[name="${name}"]`);
        if (!el) continue;
        const idx = steps.indexOf(el.closest('.step'));
        if (firstStep === null || idx < firstStep) firstStep = idx;
        errors.push({ name, message, el, idx });
      }
      if (firstStep !== null && firstStep !== current) show(firstStep, false);
      showSummary(errors.filter(x => x.idx === current).map(x => markError(x.el, x.message)));
    } else {
      if (r.status === 400) getToken();
      throw new Error(body.error || 'Something went wrong.');
    }
  } catch (err) {
    statusEl.className = 'form-status err';
    statusEl.textContent = `${err.message && err.message !== 'Failed to fetch' ? err.message : 'Couldn’t reach the server. Check your connection.'} Your answers are still here, so you can try again.`;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Send my brief';
  }
});

const LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone', business: 'Business', business_type: 'Type of business',
  service_area: 'Service area', services: 'Services', customer_action: 'Visitors should first',
  has_website: 'Has a website now', website_url: 'Current website', assets: 'Can provide',
  style: 'Style / colors', examples: 'Sites I like', features: 'Features wanted', deadline: 'Timing',
  flexible: 'Timing flexible', notes: 'Notes', demo: 'Demo reference',
};

function briefText() {
  const data = payload();
  const lines = Object.entries(LABELS)
    .filter(([k]) => data[k])
    .map(([k, label]) => `${label}: ${data[k]}`);
  return `Hi Rylan,\n\nHere's my website brief.\n\n${lines.join('\n')}\n\nPlease send me the proposed scope and a delivery date.`;
}

function mailtoHref(text) {
  const subject = `Website brief: ${form.elements.business.value}`;
  return `mailto:${OWNER}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

function emailBrief() {
  const text = briefText();
  const panel = document.getElementById('success-email');
  document.getElementById('brief-text').value = text;
  document.getElementById('reopen-email').onclick = () => { location.href = mailtoHref(text); };
  document.getElementById('copy-brief').onclick = async () => {
    const status = document.getElementById('copy-status');
    try { await navigator.clipboard.writeText(text); status.textContent = 'Copied. Paste it into an email to ' + OWNER + '.'; }
    catch { document.getElementById('brief-text').select(); status.textContent = 'Select the text above and copy it.'; }
  };
  form.hidden = true;
  panel.hidden = false;
  panel.focus();
  location.href = mailtoHref(text);
}

// Arriving from a demo site: remember which demo, prefill the business name.
const params = new URLSearchParams(location.search);
if (/^[a-z0-9-]{3,60}$/.test(params.get('demo') || '')) {
  form.elements.demo.value = params.get('demo');
  if (params.get('b')) form.elements.business.value = params.get('b').slice(0, 160);
}

show(0, false);
