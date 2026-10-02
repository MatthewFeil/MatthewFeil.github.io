const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const origin = 'https://matthewfeil.github.io';

function element() {
  const classes = new Set();
  return {
    value: '', hidden: true, dataset: {}, listeners: {},
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }
    },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute() {}, focus() {}
  };
}

async function signIn(source, next, { fail = false, session = false } = {}) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const app = element();
  app.dataset.dashboardMode = 'preview';
  const location = {
    origin, href: origin + '/personal/',
    search: next === null ? '' : '?next=' + encodeURIComponent(next)
  };
  let attempts = 0;
  const window = {
    location, clearTimeout() {}, setTimeout() {},
    PersonalAuth: {
      async session() { return session ? {} : null; },
      async signIn() { attempts++; if (fail) throw new Error('Invalid login'); },
      async signOut() {}
    }
  };
  vm.runInNewContext(source, {
    window, URL, URLSearchParams, Intl,
    document: {
      getElementById: get,
      querySelector: selector => selector === '[data-personal-app]' ? app : get(selector)
    }
  });
  // Allow the asynchronous boot session check to finish before submitting.
  await new Promise(resolve => setImmediate(resolve));
  if (!session) await get('personal-unlock-form').listeners.submit({ preventDefault() {} });
  return { location, workspace: get('personal-workspace'), status: get('personal-status'), attempts };
}

(async () => {
  for (const file of ['assets/js/personal.js', '_site/assets/js/personal.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const rejected = [
      '/\\attacker.example', '//attacker.example', '/\t/attacker.example',
      '/\n/attacker.example', '/\r/attacker.example', '/\\attacker.example@evil.example',
      'https://attacker.example/', 'javascript:alert(1)', 'portfolio/', '/\\[', '', null
    ];
    for (const next of rejected) {
      const result = await signIn(source, next);
      assert.equal(result.location.href, origin + '/personal/', `${file}: reject ${JSON.stringify(next)}`);
      assert.equal(result.workspace.hidden, false, 'Rejected return paths still show the signed-in workspace');
      assert.equal(result.attempts, 1);
    }
    for (const next of [
      '/portfolio/', '/lifting/?date=2026-09-29#log', '/portfolio/?q=%2F%5Cexample#summary',
      '/a/..//attacker.example', '/%2f%2fattacker.example', '/http://['
    ]) {
      const result = await signIn(source, next);
      const destination = new URL(result.location.href, origin + '/personal/');
      assert.equal(destination.origin, origin, `${file}: internal path stays on origin`);
      assert.equal(destination.href, new URL(next, origin).href, `${file}: preserve internal path/query/hash`);
      assert.equal(result.attempts, 1);
    }
    const failed = await signIn(source, '/portfolio/', { fail: true });
    assert.equal(failed.location.href, origin + '/personal/');
    assert.equal(failed.workspace.hidden, true);
    assert.equal(failed.status.textContent, 'Incorrect email or password.');
    const existing = await signIn(source, '/\\attacker.example', { session: true });
    assert.equal(existing.location.href, origin + '/personal/');
    assert.equal(existing.workspace.hidden, false);
    assert.equal(existing.attempts, 0);
    console.log(`${file}: redirect bypasses blocked; internal routes, workspace fallback and auth lifecycle preserved.`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
