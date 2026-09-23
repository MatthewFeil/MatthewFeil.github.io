/* Four parametric bands shared by the response editor and playback graph. */
(() => {
  'use strict';
  const defaults = () => [100, 400, 1600, 6400].map(frequency => ({frequency, gain: 0, q: 1}));
  let bands = defaults(), nodes = [], context = null;
  const graph = document.getElementById('transcribe-eq-graph');
  const container = document.getElementById('transcribe-eq-bands');
  const cuts = ['highpass', 'lowpass'].map(id => document.getElementById(`transcribe-${id}`));
  const colors = ['#d97706', '#16a370', '#3988ef', '#b65cda'];
  const ranges = {frequency: [20, 20000], gain: [-18, 18], q: [0.1, 18]};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const x = f => 30 + Math.log(f / 20) / Math.log(1000) * 276;
  const y = g => 92 - g / 18 * 78;
  const ns = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, label) {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (label !== undefined) el.textContent = label;
    graph.append(el);
    return el;
  }
  for (const gain of [-18, -9, 0, 9, 18]) {
    svg('line', {x1: 30, x2: 306, y1: y(gain), y2: y(gain), class: 'eq-grid'});
    svg('text', {x: 25, y: y(gain) + 3, 'text-anchor': 'end'}, gain > 0 ? `+${gain}` : gain);
  }
  for (const frequency of [20, 100, 1000, 10000, 20000]) {
    svg('line', {x1: x(frequency), x2: x(frequency), y1: 14, y2: 170, class: 'eq-grid'});
    svg('text', {x: x(frequency), y: 187, 'text-anchor': 'middle'}, frequency >= 1000 ? `${frequency / 1000}k` : frequency);
  }
  svg('text', {x: 30, y: 204}, 'Hz');
  const response = svg('path', {fill: 'none', stroke: 'currentColor', 'stroke-width': 2});
  const points = bands.map((band, index) => {
    const point = svg('g', {tabindex: 0, role: 'button', 'aria-label': `Band ${index + 1}`, 'data-tooltip': '', class: 'eq-point'});
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('r', 5); circle.setAttribute('fill', colors[index]); point.append(circle);
    let dragging = false;
    const move = event => {
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(graph.getScreenCTM().inverse());
      bands[index].frequency = Math.round(20 * 1000 ** clamp((p.x - 30) / 276, 0, 1));
      bands[index].gain = Math.round(clamp((92 - p.y) * 18 / 78, -18, 18) * 10) / 10;
      update();
    };
    point.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); dragging = true; point.focus(); point.setPointerCapture(event.pointerId); move(event);
    });
    point.addEventListener('pointermove', event => { if (dragging) move(event); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) point.addEventListener(name, () => { dragging = false; });
    point.addEventListener('wheel', event => {
      event.preventDefault();
      bands[index].q = Math.round(clamp(bands[index].q * (event.deltaY < 0 ? 1.1 : 1 / 1.1), .1, 18) * 100) / 100;
      update();
    }, {passive: false});
    point.addEventListener('keydown', event => {
      const b = bands[index];
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') b.frequency = Math.round(clamp(b.frequency * (event.key === 'ArrowRight' ? 1.05 : 1 / 1.05), 20, 20000));
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') b.gain = clamp(b.gain + (event.key === 'ArrowUp' ? .5 : -.5), -18, 18);
      else return;
      event.preventDefault(); update();
    });
    return point;
  });
  const cutPoints = cuts.map((input, index) => {
    const name = index === 0 ? 'Low cut' : 'High cut';
    const guide = svg('line', {y1: 14, y2: 170, class: 'eq-cut-guide'});
    const point = svg('g', {tabindex: 0, role: 'slider', 'aria-label': name, 'data-tooltip': '',
      'aria-valuemin': 20, 'aria-valuemax': 20000, 'aria-orientation': 'horizontal',
      class: 'eq-point eq-cut-point'});
    const box = document.createElementNS(ns, 'rect');
    for (const [key, value] of Object.entries({x: -5, y: -8, width: 10, height: 16})) box.setAttribute(key, value);
    point.append(box);
    const setFrequency = frequency => {
      input.value = Math.round(clamp(frequency, 20, 20000));
      // Use the existing filter listener so dragging updates playback and saved settings.
      input.dispatchEvent(new Event('change', {bubbles: true}));
    };
    let dragging = false;
    const move = event => {
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(graph.getScreenCTM().inverse());
      setFrequency(20 * 1000 ** clamp((p.x - 30) / 276, 0, 1));
    };
    point.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); dragging = true; point.focus(); point.setPointerCapture(event.pointerId); move(event);
    });
    point.addEventListener('pointermove', event => { if (dragging) move(event); });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) point.addEventListener(name, () => { dragging = false; });
    point.addEventListener('wheel', event => {
      event.preventDefault(); setFrequency(Number(input.value) * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    }, {passive: false});
    point.addEventListener('keydown', event => {
      if (event.key === 'Home') setFrequency(20);
      else if (event.key === 'End') setFrequency(20000);
      else if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
        setFrequency(Number(input.value) * (['ArrowRight', 'ArrowUp'].includes(event.key) ? 1.05 : 1 / 1.05));
      } else return;
      event.preventDefault();
    });
    return {point, guide};
  });
  const table = document.createElement('table');
  table.className = 'transcribe-eq-table';
  table.setAttribute('aria-label', 'EQ bands');
  const header = table.createTHead().insertRow();
  for (const title of ['Band', 'Hz', 'dB', 'Q']) {
    const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = title; header.append(cell);
  }
  const body = table.createTBody(); container.append(table);
  const inputs = bands.map((band, index) => {
    const row = body.insertRow(); row.style.setProperty('--eq-band-color', colors[index]);
    const identity = document.createElement('th'); identity.scope = 'row'; identity.setAttribute('aria-label', `Band ${index + 1}`);
    const badge = document.createElement('span'); badge.className = 'transcribe-eq-swatch'; badge.setAttribute('aria-hidden', 'true'); identity.append(badge); row.append(identity);
    const fields = {};
    for (const [key, title, step] of [['frequency', 'Hz', 1], ['gain', 'dB', .1], ['q', 'Q', .01]]) {
      const cell = row.insertCell();
      const input = document.createElement('input'); input.type = 'number';
      [input.min, input.max] = ranges[key]; input.step = step;
      input.setAttribute('aria-label', `Band ${index + 1} ${key === 'q' ? 'Q' : key}`);
      input.addEventListener('input', () => {
        if (!input.validity.valid || input.value === '') return;
        bands[index][key] = Number(input.value); update(input);
      });
      input.addEventListener('change', () => {
        if (input.value !== '' && Number.isFinite(Number(input.value))) bands[index][key] = clamp(Number(input.value), ...ranges[key]);
        update();
      });
      cell.append(input); fields[key] = input;
    }
    return fields;
  });
  // Disconnected filters compute the same digital response without opening an audio device.
  const previewContext = new OfflineAudioContext(1, 1, 48000);
  let preview = Array.from({length: 6}, () => previewContext.createBiquadFilter());
  const frequencies = Float32Array.from({length: 277}, (_, i) => 20 * 1000 ** (i / 276));
  const magnitude = new Float32Array(277), phase = new Float32Array(277);
  function update(editing) {
    cuts.forEach((input, index) => {
      const frequency = Number(input.value), {point, guide} = cutPoints[index];
      point.setAttribute('transform', `translate(${x(frequency)} 170)`);
      point.setAttribute('aria-valuenow', frequency);
      const off = frequency === (index === 0 ? 20 : 20000);
      point.setAttribute('aria-valuetext', off ? 'Off' : `${frequency} Hz`);
      point.dataset.tooltip = `${index === 0 ? 'Low cut' : 'High cut'} · ${off ? 'Off' : `${frequency} Hz`} · Drag to adjust`;
      point.dispatchEvent(new Event('transcribe-tooltip-update', {bubbles: true}));
      point.classList.toggle('is-off', off);
      guide.style.visibility = off ? 'hidden' : '';
      guide.setAttribute('x1', x(frequency)); guide.setAttribute('x2', x(frequency));
    });
    bands.forEach((b, index) => {
      for (const key of Object.keys(ranges)) if (inputs[index][key] !== editing) inputs[index][key].value = b[key];
      points[index].setAttribute('transform', `translate(${x(b.frequency)} ${y(b.gain)})`);
      points[index].setAttribute('aria-label', `Band ${index + 1}: ${b.frequency} Hz, ${b.gain} dB, Q ${b.q}. Arrow keys adjust frequency and gain.`);
      points[index].dataset.tooltip = `Band ${index + 1} · ${b.frequency} Hz · ${b.gain > 0 ? '+' : ''}${b.gain} dB · Q ${b.q}`;
      points[index].dispatchEvent(new Event('transcribe-tooltip-update', {bubbles: true}));
      if (nodes[index]) for (const [param, value] of [['frequency', b.frequency], ['gain', b.gain], ['Q', b.q]]) nodes[index][param].setTargetAtTime(value, context.currentTime, .01);
    });
    const total = new Float32Array(277);
    preview.forEach((node, index) => {
      if (index < 2 && Number(cuts[index].value) === (index === 0 ? 20 : 20000)) return;
      node.type = index < 2 ? ['highpass', 'lowpass'][index] : 'peaking';
      node.frequency.value = index < 2 ? Number(cuts[index].value) : bands[index - 2].frequency;
      // Web Audio low/high-pass Q is in dB; this gives a flat Butterworth passband.
      node.Q.value = index < 2 ? 20 * Math.log10(Math.SQRT1_2) : bands[index - 2].q;
      node.gain.value = index < 2 ? 0 : bands[index - 2].gain;
      node.getFrequencyResponse(frequencies, magnitude, phase);
      magnitude.forEach((value, i) => { total[i] += 20 * Math.log10(Math.max(value, 1e-9)); });
    });
    response.setAttribute('d', Array.from(total, (gain, i) => `${i ? 'L' : 'M'}${30 + i},${y(clamp(gain, -18, 18))}`).join(' '));
  }
  cuts.forEach(input => input.addEventListener('change', () => {
    input.value = Math.round(clamp(Number(input.value) || Number(input.defaultValue), 20, 20000)); update();
  }));
  window.TranscribeEQ = {
    settings: () => bands.map(b => ({...b})),
    valid: value => Array.isArray(value) && value.length === 4 && value.every(b => b && Object.entries(ranges).every(([key, [min, max]]) => Number.isFinite(b[key]) && b[key] >= min && b[key] <= max)),
    restore(value) { bands = this.valid(value) ? value.map(b => ({...b})) : defaults(); update(); },
    connect(audioContext) {
      context = audioContext;
      nodes = bands.map(() => { const node = context.createBiquadFilter(); node.type = 'peaking'; return node; });
      nodes.forEach((node, i) => { if (i) nodes[i - 1].connect(node); });
      preview = Array.from({length: 6}, () => context.createBiquadFilter());
      update(); return nodes;
    }
  };
  document.getElementById('transcribe-eq-reset').addEventListener('click', () => {
    bands = defaults(); cuts.forEach(input => { input.value = input.defaultValue; input.dispatchEvent(new Event('change')); }); update();
  });
  update();
})();
