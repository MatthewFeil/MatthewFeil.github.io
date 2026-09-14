(() => {
  const core = TranscribeStemAudio;
  const scriptUrl = document.currentScript.src;
  // Keep all markers and timeline coordinates in original-track seconds while
  // the native media element plays only the selected mix. Native speed/pitch
  // preservation and the existing Web Audio effects still use the same element.
  class Transport {
    constructor(audio, originalUrl, onError) {
      this.audio = audio; this.originalUrl = originalUrl; this.onError = onError;
      this.range = null; this.url = null; this.pending = null; this.revision = 0;
    }
    get currentTime() { return this.pending ? this.pending.position : this.audio.currentTime + (this.range?.start || 0); }
    set currentTime(value) {
      const position = this.range ? Math.max(this.range.start, Math.min(this.range.end, value)) : Math.max(0, value);
      if (this.pending) this.pending.position = position;
      else this.audio.currentTime = position - (this.range?.start || 0);
    }
    switchSource(blob, range) {
      const position = this.currentTime;
      const resume = this.pending ? this.pending.resume : !this.audio.paused;
      const rate = this.audio.playbackRate, pitchLock = this.audio.preservesPitch;
      this.cancelPending();
      this.audio.pause();
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = blob ? URL.createObjectURL(blob) : null;
      this.range = range;
      const revision = ++this.revision;
      const pending = { position: range ? Math.max(range.start, Math.min(range.end, position)) : position, resume };
      this.pending = pending;
      const ready = () => {
        if (revision !== this.revision) return;
        this.removeListeners(); this.pending = null;
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration || 0, pending.position - (range?.start || 0)));
        this.audio.playbackRate = rate; this.audio.preservesPitch = pitchLock;
        if (pending.resume) this.audio.play().catch(error => { if (revision === this.revision && error.name !== 'AbortError') this.onError('Press Play to resume the selected audio.'); });
      };
      const failed = () => {
        if (revision !== this.revision) return;
        this.removeListeners(); this.pending = null;
        this.onError('The selected audio could not be played. Turn Stems off to return to the recording.');
      };
      this.removeListeners = () => { this.audio.removeEventListener('loadedmetadata', ready); this.audio.removeEventListener('error', failed); };
      this.audio.addEventListener('loadedmetadata', ready);
      this.audio.addEventListener('error', failed);
      this.audio.src = this.url || this.originalUrl();
      this.audio.playbackRate = rate; this.audio.preservesPitch = pitchLock;
      this.audio.load();
    }
    cancelPending() { this.revision++; this.removeListeners?.(); this.pending = null; }
    reset() {
      this.cancelPending();
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = null; this.range = null;
    }
  }

  class Panel {
    constructor({ buffer, selection, apply, changed }) {
      this.buffer = buffer; this.selection = selection; this.apply = apply; this.changed = changed;
      this.result = null; this.range = null; this.enabled = false; this.flags = core.names.map(() => true);
      this.job = null; this.generation = 0;
      this.panel = document.getElementById('transcribe-stems-panel');
      this.toggle = document.getElementById('transcribe-stems-toggle');
      this.toggleProgress = document.getElementById('transcribe-stems-toggle-progress');
      this.fraction = 0;
      this.master = document.getElementById('transcribe-stems-enabled');
      this.status = document.getElementById('transcribe-stems-status');
      this.progress = document.getElementById('transcribe-stems-progress');
      this.banner = document.getElementById('transcribe-stems-banner');
      this.bannerMessage = document.getElementById('transcribe-stems-banner-message');
      this.bannerProgress = document.getElementById('transcribe-stems-banner-progress');
      document.getElementById('transcribe-stems-banner-dismiss').addEventListener('click', () => { this.banner.hidden = true; });
      this.rangeLabel = document.getElementById('transcribe-stems-range');
      this.rows = [...this.panel.querySelectorAll('[data-stem]')];
      this.toggle.addEventListener('click', () => {
        this.panel.hidden = !this.panel.hidden;
        this.toggle.setAttribute('aria-expanded', String(!this.panel.hidden));
        if (!this.panel.hidden) {
          document.getElementById('transcribe-controls-panel').hidden = true;
          document.getElementById('transcribe-controls-toggle').setAttribute('aria-expanded', 'false');
        }
        this.refresh();
      });

      this.master.addEventListener('click', () => {
        if (this.job) { this.stop(); this.setStatus('Separation canceled.'); return; }
        if (!this.result) { this.separate(); return; }
        this.enabled = !this.enabled; this.applyMix(); this.refresh(); this.changed();
      });
      this.rows.forEach(row => row.querySelector('button').addEventListener('click', () => {
        const i = core.names.indexOf(row.dataset.stem);
        this.flags[i] = !this.flags[i];
        if (this.enabled) this.applyMix();
        this.refresh(); this.changed();
      }));
      this.refresh();
    }
    close() { this.panel.hidden = true; this.toggle.setAttribute('aria-expanded', 'false'); }
    setStatus(text) { this.status.textContent = text; }
    reportProgress(text, value = null) {
      const fraction = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      this.fraction = fraction;
      this.updateToggleProgress();
      const percentage = Math.floor(fraction * 100);
      this.setStatus(`${text} · ${percentage}%`);
      this.progress.value = fraction;
      this.bannerProgress.value = fraction;
      this.bannerMessage.textContent = `Splitting segment · ${percentage}% — ${text}`;
    }
    updateToggleProgress() {
      this.toggleProgress.hidden = !this.job;
      this.toggleProgress.style.width = `${this.fraction * 100}%`;
      this.toggle.querySelector('strong').textContent = this.job ? `${Math.floor(this.fraction * 100)}%` : this.enabled ? 'On' : 'Off';
    }
    refresh() {
      const range = this.selection(), duration = range ? range.end - range.start : 0;
      this.rangeLabel.textContent = !range ? '' : duration > core.maxSeconds ? 'Choose a highlight of 60 seconds or less.' : '';
      this.rangeLabel.hidden = !this.rangeLabel.textContent;
      this.master.disabled = !this.job && !this.result && (!this.buffer() || !range || duration > core.maxSeconds);
      if (this.result) this.master.setAttribute('aria-pressed', String(this.enabled));
      else this.master.removeAttribute('aria-pressed');
      this.master.textContent = this.job ? 'Cancel' : this.result ? (this.enabled ? 'On' : 'Off') : 'Separate';
      this.master.setAttribute('aria-label', this.result ? 'Stems' : this.job ? 'Cancel separation' : 'Separate highlighted segment');
      this.master.classList.toggle('is-active', this.enabled);
      this.updateToggleProgress();
      this.progress.hidden = !this.job;
      this.rows.forEach(row => {
        const i = core.names.indexOf(row.dataset.stem), button = row.querySelector('button');
        button.disabled = !this.result;
        button.setAttribute('aria-pressed', String(this.flags[i]));
        button.textContent = this.flags[i] ? 'On' : 'Off';
        button.classList.toggle('is-active', this.flags[i] && Boolean(this.result));
        row.querySelector('[data-stem-activity]').textContent = !this.result ? 'Not analyzed' : this.result.activity[i].quiet ? 'Very little audio detected' : 'Audio detected';
        row.classList.toggle('is-quiet', Boolean(this.result?.activity[i].quiet));
      });
    }
    stop() { this.banner.hidden = true; this.generation++; this.job?.terminate(); this.job = null; this.refresh(); }
    reset(restore = true) {
      this.stop();
      const wasEnabled = this.enabled;
      this.enabled = false; this.result = null; this.range = null; this.flags = core.names.map(() => true);
      if (restore && wasEnabled) this.apply(null, null, null);
      this.setStatus(''); this.refresh();
    }
    selectionChanged() {
      const range = this.selection();
      if (this.range && (!range || Math.abs(range.start - this.range.start) > 0.00001 || Math.abs(range.end - this.range.end) > 0.00001)) {
        this.reset(); this.setStatus('Highlight changed. Separate this passage to use stems.');
      }
      this.refresh();
    }
    async separate() {
      const buffer = this.buffer(), range = this.selection();
      if (!buffer || !range || range.end - range.start > core.maxSeconds || this.job) return;
      const flags = this.flags.slice();
      this.reset(); this.flags = flags; this.range = { ...range };
      const generation = ++this.generation;
      // A temporary job marker also permits cancellation while resampling.
      this.job = { terminate() {} }; this.refresh();
      this.bannerProgress.hidden = false; this.banner.hidden = false;
      this.reportProgress('Preparing highlighted audio…');
      try {
        const length = Math.max(1, Math.round((range.end - range.start) * core.sampleRate));
        const offline = new OfflineAudioContext(2, length, core.sampleRate);
        const first = Math.round(range.start * buffer.sampleRate);
        const last = Math.min(buffer.length, Math.round(range.end * buffer.sampleRate));
        const cropped = offline.createBuffer(2, Math.max(1, last - first), buffer.sampleRate);
        for (let c = 0; c < 2; c++) cropped.copyToChannel(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)).subarray(first, last), c);
        const source = offline.createBufferSource(); source.buffer = cropped; source.connect(offline.destination); source.start();
        const rendered = await offline.startRendering();
        if (generation !== this.generation) return;
        const channels = [rendered.getChannelData(0).slice(), rendered.getChannelData(1).slice()];
        const worker = new Worker(new URL('transcribe-stems-worker.js?v=20260912-highlight-only', scriptUrl));
        this.job = worker;
        const failed = text => {
          if (generation !== this.generation) return;
          this.stop(); this.setStatus(text);
        };
        worker.onerror = event => { event.preventDefault(); failed('Separation could not start. Try again in a desktop browser.'); };
        worker.onmessage = ({ data }) => {
          if (generation !== this.generation) return;
          if (data.type === 'progress') {
            this.reportProgress(data.text, data.value);
          } else if (data.type === 'error') failed(data.text);
          else if (data.type === 'complete') {
            this.result = { stems: data.stems, activity: data.activity }; this.job = null;
            this.enabled = true; this.applyMix(); this.refresh(); this.changed();
            this.setStatus('Ready. Stems play only this highlight. Turn Stems off for the original recording.');
            this.bannerMessage.textContent = 'Segment splitting complete. Your stems are ready.';
            this.bannerProgress.hidden = true;
            this.banner.hidden = false;
          }
        };
        worker.postMessage({ type: 'separate', channels }, channels.map(c => c.buffer));
      } catch (error) {
        if (generation !== this.generation) return;
        this.stop(); this.setStatus(`Could not prepare this highlight. ${error.message}`);
      }
    }
    applyMix() {
      if (!this.enabled || !this.result) { this.apply(null, null, null); return; }
      const channels = core.mix(this.result.stems, this.flags);
      const mono = new Float32Array(channels[0].length);
      // Match analysis to the PCM playback, including clipping/quantization.
      for (let i = 0; i < mono.length; i++) mono[i] = (Math.max(-1, Math.min(1, channels[0][i])) + Math.max(-1, Math.min(1, channels[1][i]))) / 2;
      this.apply(new Blob([core.wav(channels)], { type: 'audio/wav' }), this.range, mono);
    }
    settings() { return { enabled: this.enabled, stems: Object.fromEntries(core.names.map((name, i) => [name, this.flags[i]])) }; }
    restore(settings) {
      // Configs carry preferences only; never start an expensive job on import.
      this.enabled = false;
      this.flags = core.names.map(name => settings?.stems?.[name] ?? true);
      this.refresh();
      if (settings?.enabled) this.setStatus('Saved stem choices restored. Separate the highlight to enable them.');
    }
  }
  globalThis.TranscribeStems = { Transport, Panel };
})();
