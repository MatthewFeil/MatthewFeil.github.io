/* Local measure annotations. All times are original recording seconds. */
(() => {
  const blank = () => ({ markers: [], numbering: 'section' });
  function rows(doc) {
    let section = -1, measure = 0;
    return [...doc.markers].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)).map((m, i) => {
      if (m.section || i === 0) { section++; measure = 0; }
      measure++;
      let n = section + 1, letter = '';
      while (n) { n--; letter = String.fromCharCode(65 + n % 26) + letter; n = Math.floor(n / 26); }
      return { ...m, section: m.section || i === 0, label: letter + (doc.numbering === 'continuous' ? i + 1 : measure), letter };
    });
  }
  function validate(value, identity, duration) {
    if (!value || value.version !== 1 || value.identity !== identity || !['section', 'continuous'].includes(value.numbering) || !Array.isArray(value.markers) || value.markers.length > 100000) throw Error('This annotation file does not match this recording or format.');
    const ids = new Set();
    const markers = value.markers.map(m => {
      if (!m || typeof m.id !== 'string' || !m.id || ids.has(m.id) || !Number.isFinite(m.time) || m.time < 0 || m.time > duration || typeof m.section !== 'boolean') throw Error('Invalid marker data.');
      ids.add(m.id); return { id: m.id, time: m.time, section: m.section };
    });
    const ordered = [...markers].sort((a,b) => a.time-b.time);
    if (ordered.some((m,i) => i && m.time === ordered[i-1].time)) throw Error('Markers must have distinct positions.');
    return { markers, numbering: value.numbering };
  }
  class Marks {
    constructor(host) {
      this.host = host; this.doc = blank(); this.undoStack = []; this.redoStack = []; this.generation = 0;
      this.root = document.getElementById('transcribe-marks');
      this.ruler = document.getElementById('transcribe-mark-ruler');
      this.list = this.root.querySelector('[data-list]');
      this.status = this.root.querySelector('[data-status]');
      this.fieldset = this.root.querySelector('fieldset');
      this.numbering = this.root.querySelector('[data-numbering]');
      this.measurePanel = document.getElementById('transcribe-measure-panel');
      this.measureButton = document.getElementById('transcribe-measures');
      this.goInput = document.getElementById('transcribe-go-measure');
      this.loopStartInput = this.measurePanel.querySelector('[data-loop-start]');
      this.loopEndInput = this.measurePanel.querySelector('[data-loop-end]');
      this.measurePanel.addEventListener('toggle', e => {
        this.measureButton.setAttribute('aria-expanded', String(e.newState === 'open'));
        if (e.newState === 'open') {
          this.positionMeasures();
          if (!this.measurePanel.contains(document.activeElement)) this.loopStartInput.focus();
        }
      });
      window.addEventListener('resize', () => this.positionMeasures());
      window.addEventListener('scroll', () => this.positionMeasures(), true);
      for (const input of [this.loopStartInput, this.loopEndInput]) input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.loopInputs(); }
      });
      document.getElementById('transcribe-go-form').addEventListener('submit', e => {
        e.preventDefault(); if (this.goTo(this.goInput.value)) this.measurePanel.hidePopover();
      });
      document.getElementById('transcribe-range-form').addEventListener('submit', e => {
        e.preventDefault(); this.loopInputs();
      });
      this.time = this.root.querySelector('[data-time]');
      this.section = this.root.querySelector('[data-section]');
      this.root.addEventListener('click', e => {
        const button = e.target.closest('button'); if (!button) return;
        if (button.dataset.id) { if (e.shiftKey || this.rangeAnchor) this.rangePoint(this.doc.markers.find(m => m.id === button.dataset.id).time, button.dataset.id); else this.select(button.dataset.id); return; }
        if (button.dataset.action === 'loop-range') { this.loopInputs(); return; }
        const actions = { measure: () => this.mark(false), section: () => this.mark(true), remove: () => this.remove(), undo: () => this.history(false), redo: () => this.history(true), previous: () => this.navigate(-1, true), next: () => this.navigate(1, true), loop: () => this.loop(false), 'loop-section': () => this.loop(true), export: () => this.export(), import: () => this.root.querySelector('[data-file]').click(), apply: () => this.importPending(), cancel: () => this.clearImport() };
        actions[button.dataset.action]?.();
      });
      this.numbering.addEventListener('change', () => this.change(() => { this.doc.numbering = this.numbering.value; }));
      this.time?.addEventListener('change', () => {
        const time = Number(this.time.value);
        if (!this.time.value || !Number.isFinite(time) || time < 0 || time > host.duration() || this.doc.markers.some(m => m.id !== this.selected && Math.abs(m.time-time) < 0.001)) { this.say('Enter a distinct time within this recording.'); this.edit(); return; }
        this.change(() => { this.doc.markers.find(m => m.id === this.selected).time = time; });
      });
      this.section?.addEventListener('change', () => this.change(() => { this.doc.markers.find(m => m.id === this.selected).section = this.section.checked; }));
      this.root.querySelector('[data-file]')?.addEventListener('change', async e => {
        const file = e.target.files[0], generation = this.generation; e.target.value = ''; if (!file) return;
        try {
          if (file.size > 20000000) throw Error('Annotation file is too large.');
          const text = await file.text(); if (generation !== this.generation) return;
          this.pending = validate(JSON.parse(text), this.identity, host.duration());
          this.root.querySelector('[data-preview]').hidden = false;
          this.root.querySelector('[data-preview-text]').textContent = `Replace ${this.doc.markers.length} marks with ${this.pending.markers.length} imported marks (${this.pending.numbering === 'section' ? 'restart each section' : 'continuous numbering'})?`;
        } catch (error) { this.say(error.message); }
      });
      this.ruler.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const rect = this.ruler.getBoundingClientRect();
        const near = rows(this.doc).filter(m => Math.abs(host.x(m.time, rect.width) - (e.clientX-rect.left)) < 12).sort((a,b) => Math.abs(host.x(a.time,rect.width)-(e.clientX-rect.left))-Math.abs(host.x(b.time,rect.width)-(e.clientX-rect.left)))[0];
        if ((e.shiftKey || this.rangeAnchor) && this.ready) {
          e.preventDefault();
          this.rangePoint(near?.time ?? host.time(e.clientX-rect.left, rect.width), near?.id);
          return;
        }
        if (!near) return;
        e.preventDefault(); this.select(near.id); this.ruler.focus(); this.ruler.setPointerCapture(e.pointerId);
        this.drag = { id: near.id, before: structuredClone(this.doc), x: e.clientX };
      });
      this.ruler.addEventListener('pointermove', e => {
        if (this.rangeAnchor) {
          const rect = this.ruler.getBoundingClientRect();
          const near = rows(this.doc).filter(m => Math.abs(host.x(m.time, rect.width) - (e.clientX - rect.left)) < 12).sort((a, b) => Math.abs(host.x(a.time, rect.width) - (e.clientX - rect.left)) - Math.abs(host.x(b.time, rect.width) - (e.clientX - rect.left)))[0];
          this.previewRange(near?.time ?? host.time(e.clientX - rect.left, rect.width));
          return;
        }
        if (!this.drag || Math.abs(e.clientX-this.drag.x) < 3) return;
        const rect = this.ruler.getBoundingClientRect(), time = Math.max(0, Math.min(host.duration(), host.time(e.clientX-rect.left, rect.width)));
        if (!this.doc.markers.some(m => m.id !== this.drag.id && Math.abs(m.time-time) < 0.001)) this.doc.markers.find(m => m.id === this.drag.id).time = time;
        this.draw(); this.edit();
      });
      const end = e => {
        if (!this.drag) return;
        const before = this.drag.before; this.drag = null;
        if (e.type === 'pointercancel') this.doc = before;
        else if (JSON.stringify(before) !== JSON.stringify(this.doc)) { this.undoStack.push(before); this.redoStack = []; this.save(); }
        this.refresh();
      };
      this.ruler.addEventListener('pointerup', end); this.ruler.addEventListener('pointercancel', end);
      this.refresh();
    }
    say(text) { this.status.textContent = text; if (this.measurePanel) { this.measurePanel.querySelector('[data-measure-status]').textContent = text; this.positionMeasures(); } }
    change(fn) { this.undoStack.push(structuredClone(this.doc)); this.redoStack = []; fn(); this.refresh(); this.save(); }
    select(id) { this.selected = id; this.refresh(); }
    mark(section) {
      if (!this.ready) return;
      const time = this.host.current();
      const near = this.doc.markers.find(m => Math.abs(m.time-time) <= 0.05);
      if (near && (!section || near.section)) { this.select(near.id); this.say('Existing measure selected.'); return; }
      this.change(() => {
        if (near) { near.section = true; this.selected = near.id; }
        else { const m = { id: crypto.randomUUID(), time, section: section || !this.doc.markers.length }; this.doc.markers.push(m); this.selected = m.id; }
      });
      this.say(`${section ? 'Section' : 'Measure'} ${rows(this.doc).find(m => m.id === this.selected).label} marked.`);
    }
    remove() {
      const index = this.doc.markers.findIndex(m => m.id === this.selected);
      if (index < 0) return;
      this.change(() => {
        // Stored order is addition order, independent of timeline position.
        this.doc.markers.splice(index, 1);
        this.selected = (this.doc.markers[index - 1] || this.doc.markers[index])?.id ?? null;
      });
    }
    history(redo) {
      const from = redo ? this.redoStack : this.undoStack, to = redo ? this.undoStack : this.redoStack;
      if (!from.length) return; to.push(structuredClone(this.doc)); this.doc = from.pop(); this.refresh(); this.save();
    }
    navigate(direction, section = false) {
      const candidates = rows(this.doc).filter(m => !section || m.section), now = this.host.current();
      const m = direction > 0 ? candidates.find(m => m.time > now + 0.001) : candidates.reverse().find(m => m.time < now - 0.001);
      if (m) { this.host.seek(m.time); this.select(m.id); } else this.say('No further marker in that direction.');
    }
    loop(section) {
      const candidates = rows(this.doc).filter(m => !section || m.section), now = this.host.current();
      const index = candidates.findLastIndex(m => m.time <= now + 0.001);
      const start = candidates[index]?.time, end = candidates[index+1]?.time ?? (section ? this.host.duration() : null);
      if (start == null || end == null || end-start < 0.04) { this.say('A complete marked passage is needed to loop.'); return; }
      this.host.loop(start, end);
    }
    openMeasures(go) {
      if (!this.ready) return;
      this.say('');
      if (!this.measurePanel.matches(':popover-open')) this.measurePanel.showPopover();
      this.positionMeasures();
      const input = go ? this.goInput : this.loopStartInput;
      input.focus(); input.select();
    }
    positionMeasures() {
      if (!this.measurePanel.matches(':popover-open')) return;
      const button = this.measureButton.getBoundingClientRect();
      const panel = this.measurePanel.getBoundingClientRect();
      this.measurePanel.style.left = `${Math.max(8, Math.min(button.right - panel.width, window.innerWidth - panel.width - 8))}px`;
      this.measurePanel.style.top = `${Math.max(8, button.top - panel.height - 8)}px`;
    }
    measureText(value) {
      return value.trim().toUpperCase().replace(/^(?:MEASURE|SECTION|MM?\.)\s*/, '')
        .replace(/[\s.:-]+/g, '').replace(/(^|[A-Z])0+(?=\d)/g, '$1');
    }
    resolveMeasure(value, all, context, end = false) {
      const text = this.measureText(value);
      if (/^[A-Z]+$/.test(text)) {
        const section = all.filter(m => m.letter === text);
        return end ? section.at(-1) : section[0];
      }
      const exact = all.find(m => m.label === text);
      if (exact) return exact;
      if (!/^\d+$/.test(text)) return;
      const candidates = all.filter(m => m.label.replace(/^[A-Z]+/, '') === text);
      return candidates.find(m => m.letter === context?.letter) ||
        candidates.find(m => m.time >= (context?.time ?? 0)) || candidates.at(-1);
    }
    goTo(value) {
      const all = rows(this.doc), current = all.findLast(m => m.time <= this.host.current()) || all[0];
      const found = this.resolveMeasure(value, all, current);
      if (!found) { this.say('Measure not found.'); return false; }
      this.host.seek(found.time); this.select(found.id); this.say(`At ${found.label}.`); return true;
    }
    loopInputs(repeat = true) {
      if (!this.ready) return;
      const all = rows(this.doc), current = all.findLast(m => m.time <= this.host.current()) || all[0];
      let first = this.resolveMeasure(this.loopStartInput.value, all, current);
      let last = this.resolveMeasure(this.loopEndInput.value.trim() || this.loopStartInput.value, all, first, true);
      if (!first || !last) { this.say('Measure or section not found.'); return; }
      if (last.time < first.time) [first, last] = [last, first];
      const end = all[all.indexOf(last)+1]?.time ?? this.host.duration();
      if (end-first.time < 0.04) { this.say('Choose a passage at least 0.04 seconds long.'); return; }
      this.rangeAnchor = null;
      this.loopStartInput.value = first.label; this.loopEndInput.value = last.label;
      if (repeat) this.host.loop(first.time, end);
      else this.host.selectRange(first.time, end);
      this.say(`${repeat ? 'Repeating' : 'Selected'} ${first.label} through ${last.label}.`);
      return true;
    }
    previewRange(time) {
      if (!this.rangeAnchor) return;
      this.host.preview?.(this.rangeAnchor.time, Math.max(0, Math.min(this.host.duration(), time)));
    }
    rangePoint(time, id) {
      if (!this.ready) return;
      const point = { time: Math.max(0, Math.min(this.host.duration(), time)), id };
      if (!this.rangeAnchor) {
        this.rangeAnchor = point;
        this.host.anchor?.(point.time);
        this.say('First endpoint set. Move the mouse and click to place the other endpoint.');
        return;
      }
      const ordered = [this.rangeAnchor, point].sort((a,b) => a.time-b.time);
      const end = ordered[1].time;
      if (end-ordered[0].time < 0.04) { this.say('Choose a different end point.'); return; }
      this.rangeAnchor = null;
      this.host.loop(ordered[0].time, end);
      this.say('Selected passage is looping. Shift-click to begin a new range.');
    }
    key(e) {
      if (!this.ready || e.defaultPrevented || e.isComposing) return false;
      const key = e.key.toLowerCase();
      let action;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && key === 'z') action = () => this.history(e.shiftKey);
      else if (!e.metaKey && !e.ctrlKey) {
        if (!e.altKey && key === 'g') action = () => this.openMeasures(true);
        if (!e.altKey && key === 'm' && !e.shiftKey) action = () => this.mark(false);
        if (!e.altKey && key === 's') action = () => e.shiftKey ? this.navigate(1,true) : this.mark(true);
        if (!e.altKey && key === 'n') action = () => this.navigate(e.shiftKey ? -1 : 1);
        if (key === 'l' && e.shiftKey) action = () => this.loop(e.altKey);
        if (!e.altKey && !e.shiftKey && ['delete', 'backspace'].includes(key) && this.selected) action = () => this.remove();
      }
      if (!action) return false; e.preventDefault(); if (!e.repeat) action(); return true;
    }
    edit() {
      if (!this.time) return;
      const m = this.doc.markers.find(m => m.id === this.selected);
      this.root.querySelector('[data-edit]').hidden = !m;
      if (m) { this.time.value = m.time.toFixed(3); this.time.max = this.host.duration(); this.section.checked = rows(this.doc).find(row => row.id === m.id).section; this.section.disabled = rows(this.doc)[0]?.id === m.id; }
    }
    refresh() {
      if (!this.doc.markers.some(m => m.id === this.selected)) this.selected = null;
      if (this.measureButton) this.measureButton.disabled = !this.ready;
      this.fieldset.disabled = !this.ready; this.numbering.value = this.doc.numbering;
      if (!this.list) { this.host.render(); return; }
      const focusedId = this.list.contains(document.activeElement) ? document.activeElement.dataset.id : null;
      this.list.replaceChildren();
      for (const m of rows(this.doc)) {
        const li = document.createElement('li'), button = document.createElement('button');
        button.type = 'button'; button.dataset.id = m.id; button.textContent = `${m.section ? 'Section ' + m.letter + ' · ' : ''}${m.label} · ${m.time.toFixed(3)} s`;
        button.setAttribute('aria-pressed', String(m.id === this.selected)); li.append(button); this.list.append(li);
      }
      if (focusedId) [...this.list.querySelectorAll('button')].find(button => button.dataset.id === focusedId)?.focus({ preventScroll: true });
      this.root.querySelector('[data-empty]').hidden = !!this.doc.markers.length;
      this.root.querySelector('[data-action="undo"]').disabled = !this.undoStack.length;
      this.root.querySelector('[data-action="redo"]').disabled = !this.redoStack.length;
      this.root.querySelector('[data-action="export"]').disabled = !this.identity;
      this.root.querySelector('[data-action="import"]').disabled = !this.identity;
      this.edit(); this.host.render();
    }
    draw() {
      const width = this.ruler.clientWidth, height = 32, ratio = window.devicePixelRatio || 1;
      this.ruler.width = Math.round(width*ratio); this.ruler.height = height*ratio;
      const theme = getComputedStyle(document.documentElement);
      const ink = theme.getPropertyValue('--tr-text').trim(), accent = theme.getPropertyValue('--tr-accent').trim(), muted = theme.getPropertyValue('--tr-muted').trim();
      const ctx = this.ruler.getContext('2d'); ctx.scale(ratio,ratio); ctx.font = '700 12px "Familjen Grotesk", Arial';
      if (this.rangeAnchor) {
        const x = this.host.x(this.rangeAnchor.time, width);
        ctx.fillStyle = accent; ctx.fillRect(x, 0, 2, height);
      }
      let right = -Infinity;
      for (const m of rows(this.doc)) {
        const x = this.host.x(m.time,width); if (x < 0 || x > width) continue;
        ctx.strokeStyle = m.id === this.selected ? accent : m.section ? ink : muted;
        ctx.beginPath(); ctx.moveTo(x+0.5,m.section ? 0 : 19); ctx.lineTo(x+0.5,32); ctx.stroke();
        if (x > right) { ctx.fillStyle = m.id === this.selected ? accent : ink; ctx.fillText(m.label,x+4,14); right = x+ctx.measureText(m.label).width+12; }
      }
    }
    overview(ctx,width,height,duration) {
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--tr-text').trim();
      ctx.save(); ctx.fillStyle = ink; ctx.font = '700 11px "Familjen Grotesk", Arial'; ctx.textBaseline = 'alphabetic'; let right = -Infinity;
      for (const m of rows(this.doc).filter(m => m.section)) { const x = m.time/duration*width; ctx.fillRect(x,height-12,1,12); if (x>right) {ctx.fillText(m.letter,x+3,height-3); right=x+ctx.measureText(m.letter).width+10;} }
      ctx.restore();
    }
    reset() { this.measurePanel?.hidePopover(); this.rangeAnchor = null; if (this.loopStartInput) this.loopStartInput.value = ''; if (this.loopEndInput) this.loopEndInput.value = ''; this.generation++; this.ready = false; this.identity = null; this.doc = blank(); this.selected = null; this.drag = null; this.undoStack = []; this.redoStack = []; this.clearImport(); this.say(''); this.refresh(); }
    async load(buffer) {
      const generation = this.generation; this.ready = true; this.refresh();
      try {
        const digest = await crypto.subtle.digest('SHA-256',buffer); if (generation !== this.generation) return;
        this.identity = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
        const identity = this.identity;
        await this.saveQueue;
        if (generation !== this.generation) return;
        const saved = await this.storage('readonly', store => store.get(identity));
        if (generation !== this.generation) return;
        if (saved) {
          const restored = validate(saved,identity,this.host.duration());
          if (!this.undoStack.length) this.doc = restored;
          else {
            const captured = this.doc;
            this.doc = restored; this.undoStack = []; this.redoStack = [];
            this.change(() => {
              for (const m of captured.markers) {
                const near = this.doc.markers.find(existing => Math.abs(existing.time-m.time) <= 0.05);
                if (near) near.section ||= m.section;
                else this.doc.markers.push(m);
              }
            });
          }
        } else if (this.undoStack.length) this.save();
        this.refresh();
      } catch { if (generation === this.generation) { this.say('Local restore unavailable. Export marks to keep a copy.'); this.refresh(); } }
    }
    storage(mode, operation) {
      return new Promise((resolve,reject) => {
        const request = indexedDB.open('transcribe-annotations',1);
        request.onupgradeneeded = () => request.result.createObjectStore('recordings');
        request.onerror = () => reject(request.error); request.onblocked = () => reject(Error('Storage blocked'));
        request.onsuccess = () => {
          const db = request.result;
          try { const tx = db.transaction('recordings',mode), result = operation(tx.objectStore('recordings')); tx.oncomplete = () => { db.close(); resolve(result.result); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); }; }
          catch (error) { db.close(); reject(error); }
        };
      });
    }
    document() { return { version: 1, identity: this.identity, ...structuredClone(this.doc) }; }
    save() {
      if (!this.identity) return;
      const value = this.document(), generation = this.generation;
      this.saveQueue = (this.saveQueue || Promise.resolve()).then(() => this.storage('readwrite', store => store.put(value,value.identity))).catch(() => { if (generation === this.generation) this.say('Could not autosave. Export marks to keep a copy.'); });
    }
    export() { if (!this.identity) return; const url = URL.createObjectURL(new Blob([JSON.stringify(this.document(),null,2)],{type:'application/json'})); const a = document.createElement('a'); a.href=url; a.download='transcribe-marks.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
    clearImport() { this.pending = null; const preview = this.root.querySelector('[data-preview]'); if (preview) preview.hidden = true; }
    importPending() { if (!this.pending) return; this.change(() => { this.doc = this.pending; this.selected = null; }); this.clearImport(); }
  }
  globalThis.TranscribeMarks = { Marks, rows, validate };
})();
