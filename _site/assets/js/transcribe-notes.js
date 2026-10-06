/* Local harmonic evidence and conservative note tracking. No audio leaves the device. */
(() => {
  const modes = {
    balanced: { low: 24, high: 95, limit: 6, threshold: [.12, .45] },
    bass: { low: 24, high: 48, limit: 1, threshold: [.16, .5] },
    chordal: { low: 36, high: 84, limit: 12, threshold: [.08, .25], admission: 120 },
    melody: { low: 48, high: 84, limit: 3, threshold: [.07, .20], admission: 30, release: 60 }
  };
  const defaults = () => ({ mode: 'balanced', ranges: Object.fromEntries(Object.entries(modes).map(([mode,v]) => [mode, {low:v.low, high:v.high}])) });
  function validate(value) {
    if (value === undefined) return defaults();
    if (!value || typeof value.mode !== 'string' || !Object.hasOwn(modes, value.mode) || !value.ranges || typeof value.ranges !== 'object') throw Error('Invalid note detection settings.');
    const ranges = {};
    for (const mode of Object.keys(modes)) {
      const r = value.ranges[mode];
      if (!r || !Number.isInteger(r.low) || !Number.isInteger(r.high) || r.low < 24 || r.high > 95 || r.low > r.high) throw Error('Invalid preferred note range.');
      ranges[mode] = {low:r.low, high:r.high};
    }
    return {mode:value.mode, ranges};
  }
  const midiToFrequency = midi => 440 * 2 ** ((midi - 69) / 12);
  function parseNoteName(value) {
    const match = String(value).trim().match(/^([a-g])\s*(#|♯|sharp|b|♭|flat|natural|♮)?\s*(-?\d+)$/i);
    if (!match) return null;
    const pitch = {c:0, d:2, e:4, f:5, g:7, a:9, b:11}[match[1].toLowerCase()];
    const accidental = (match[2] || '').toLowerCase();
    const offset = ['#', '♯', 'sharp'].includes(accidental) ? 1 : ['b', '♭', 'flat'].includes(accidental) ? -1 : 0;
    const midi = (Number(match[3]) + 1) * 12 + pitch + offset;
    return Number.isInteger(midi) && midi >= 0 && midi <= 127 ? midi : null;
  }
  function detect(profile, binsPerSemitone, minimumMidi, chordEvidence = false, tolerance = .45, voicingEvidence = false) {
    const maximum = Math.max(...profile);
    if (maximum < 0.00002) return [];
    const peaks = [];
    for (let row = 0; row < profile.length; row += 1) {
      const value = profile[row];
      if (value <= (profile[row - 1] || 0) || value < (profile[row + 1] || 0)) continue;
      const neighborhood = Array.from(profile.slice(Math.max(0, row - 48), row + 49)).sort((a, b) => a - b);
      const floor = neighborhood[Math.floor(neighborhood.length / 4)];
      if (value < Math.max(0.00002, maximum * (voicingEvidence ? .01 + tolerance * .02 : .015 + tolerance * .04), floor * 3)) continue;
      const preciseMidi = minimumMidi + row / binsPerSemitone;
      peaks.push({ preciseMidi, frequency: midiToFrequency(preciseMidi), value, floor });
    }
    // Score families jointly. Shared partials retain a small residual, so an
    // independently supported upper note can survive without lighting every overtone.
    const candidates = new Map();
    for (const peak of peaks) {
      for (let divisor = 1; divisor <= 6; divisor += 1) {
        const preciseMidi = peak.preciseMidi - 12 * Math.log2(divisor);
        const midi = Math.round(preciseMidi);
        if (midi < 24 || midi >= 96) continue;
        const frequency = midiToFrequency(preciseMidi);
        const matches = peaks.map((partial, index) => {
          const harmonic = Math.round(partial.frequency / frequency);
          const cents = Math.abs(1200 * Math.log2(partial.frequency / (frequency * harmonic)));
          return harmonic >= 1 && harmonic <= 10 && cents < 28 ? { index, harmonic } : null;
        }).filter(Boolean);
        const fundamental = matches.some((match) => match.harmonic === 1);
        if (!fundamental && (matches.length < 3 || !matches.some((match) => match.harmonic % 2))) continue;
        // Missing roots need a coherent descending run, otherwise a major
        // chord can masquerade as the partials of a nonexistent bass note.
        if (!fundamental) {
          const amplitude = (harmonic) => {
            const match = matches.find((item) => item.harmonic === harmonic);
            return match ? peaks[match.index].value : 0;
          };
          if (!amplitude(4) || amplitude(2) < amplitude(3) * 1.15 || amplitude(3) < amplitude(4) * 1.15) continue;
        }
        const score = matches.reduce((sum, match) => sum + peaks[match.index].value / Math.sqrt(match.harmonic), 0);
        if (score > (candidates.get(midi)?.score || 0)) candidates.set(midi, { midi, preciseMidi, matches, score, fundamental, fundamentalStrength: matches.filter(m => m.harmonic === 1).reduce((sum,m) => sum + peaks[m.index].value, 0) });
      }
    }
    const residual = peaks.map((peak) => peak.value);
    const selected = [];
    while (selected.length < (chordEvidence ? 24 : 8) && candidates.size) {
      let best = null;
      for (const candidate of candidates.values()) {
        const score = candidate.matches.reduce((sum, match) => sum + residual[match.index] / Math.sqrt(match.harmonic), 0);
        if (!best || score > best.score) best = { ...candidate, score };
      }
      if (!best || best.score < maximum * (chordEvidence ? 0.06 : 0.12 + tolerance * 0.45)) break;
      selected.push(best);
      candidates.delete(best.midi);
      const octave = candidates.get(best.midi + 12);
      const independentOctave = octave?.fundamental
        && octave.matches.some((match) => match.harmonic === 3)
        && octave.matches.some((match) => match.harmonic === 5)
        && !best.matches.some((match) => match.harmonic === 3 || match.harmonic === 5);
      for (const match of best.matches) {
        if (independentOctave && match.harmonic % 2 === 0) continue;
        const independentlySupported = voicingEvidence && [...candidates.values()].some(other =>
          other.fundamental && other.fundamentalStrength > best.fundamentalStrength * .6
          && other.matches.filter(partial => partial.harmonic >= 2).length >= 2
          && other.matches.some(partial => partial.index === match.index));
        // A quieter upper line may coincide with a bass harmonic. Preserve
        // it only when its own higher partials include evidence outside that
        // bass family; a bare overtone still receives ordinary suppression.
        const independentLine = voicingEvidence && [...candidates.values()].some(other =>
          other.fundamental && other.fundamentalStrength > best.fundamentalStrength * .12
          && other.matches.some(partial => partial.harmonic >= 2)
          && other.matches.some(partial => (partial.harmonic === 2 || (partial.harmonic >= 3 && partial.harmonic % 2 === 1))
            && !best.matches.some(rootPartial => rootPartial.index === partial.index))
          && other.matches.some(partial => partial.index === match.index));
        residual[match.index] *= independentLine ? .8 : independentlySupported ? .35 : .08;
      }
    }
    return selected.map((note) => ({
      midi: note.midi, preciseMidi: note.preciseMidi, score: note.score,
      fundamental: note.fundamental, fundamentalStrength: note.fundamentalStrength,
      prominence: Math.max(...note.matches.map(m => peaks[m.index].value / Math.max(.00002, peaks[m.index].floor))),
      harmonics: note.matches.map(m => ({ midi: peaks[m.index].preciseMidi, harmonic: m.harmonic })),
      confidence: Math.min(1, note.score / selected[0].score)
    }));
  }

  function extract(profile, binsPerSemitone, minimumMidi, tolerance = .45, recentProfile = null) {
    const peak = Math.max(...profile);
    const candidates = detect(profile, binsPerSemitone, minimumMidi, true, tolerance, true);
    if (recentProfile) for (const note of candidates) {
      note.recentFundamental = recentProfile[Math.round((note.preciseMidi - minimumMidi) * binsPerSemitone)] || 0;
      note.recentScore = note.harmonics.reduce((sum, partial) => {
        const row = Math.round((partial.midi - minimumMidi) * binsPerSemitone);
        return sum + (recentProfile[row] || 0) / Math.sqrt(partial.harmonic);
      }, 0);
    }
    return {peak, candidates};
  }

  class Tracker {
    constructor() { this.reset(); }
    reset() {
      this.active = new Map(); this.pending = new Map(); this.observed = new Map();
      this.background = new Map(); this.time = null; this.now = null; this.melodyPeak = 0;
    }
    update(evidence, settings, tolerance, sourceTime, now, live = true) {
      const elapsed = sourceTime - this.time;
      if (!live || (this.time !== null && (elapsed < 0 || elapsed > .5 || now - this.now > 250))) this.reset();
      const dt = this.now === null ? 33 : Math.max(0, now - this.now);
      this.time = sourceTime; this.now = now;
      const mode = modes[settings.mode], range = settings.ranges[settings.mode];
      const threshold = mode.threshold[0] + tolerance * mode.threshold[1];
      const candidates = evidence.candidates.slice(0, 24);
      const incumbents = [...this.active.values()].filter(n => n.lostAt === undefined);
      const inRange = candidates.filter(n => n.midi >= range.low && n.midi <= range.high);
      // Compare melody within its register, keeping a lower global evidence floor.
      const melodyReference = Math.max(.00002, evidence.peak * .35, ...candidates.map(n => n.score * .5), ...inRange.map(n => n.score));
      // Decay once per result, including rests and rejected results. Otherwise a
      // previous loud phrase can indefinitely prevent a softer phrase returning.
      if (settings.mode === 'melody') this.melodyPeak *= Math.exp(-dt / 800);
      const reference = settings.mode === 'bass'
        ? Math.max(.00002, evidence.peak * .35, ...candidates.filter(n => n.midi >= range.low && n.midi <= range.high).map(n => n.score))
        : Math.max(.00002, evidence.peak);
      const scored = candidates.map(note => {
        const distance = Math.max(range.low - note.midi, note.midi - range.high, 0);
        // Melody gives the chosen register a strong preference. Below-range
        // accompaniment loses support rapidly instead of retaining a flat floor.
        const registerWeight = settings.mode === 'melody' && distance > 0
          ? (note.midi < range.low ? .4 * Math.exp(-distance / 5) : .6 * Math.exp(-distance / 8))
          : Math.max(settings.mode === 'bass' ? .25 : .45, 1 - distance * (settings.mode === 'bass' ? .065 : .055));
        // Bare peaks retain the global floor; weaker admission needs harmonics.
        let rank = note.score / (settings.mode === 'melody' && distance === 0 && note.harmonics?.length !== 1 ? melodyReference : reference) * registerWeight;
        if (settings.mode === 'bass') rank *= (note.fundamental ? 1.15 : .8) * (distance === 0 ? 1.9 : 1);
        const previous = this.observed.get(note.midi);
        const strength = note.recentScore ?? note.score;
        const attackStrength = note.recentFundamental ?? note.fundamentalStrength ?? strength;
        // Compare a returning line with its accompaniment baseline as well as
        // the last result: a real attack may rise over several short updates.
        const backgroundRoot = this.background.get(note.midi);
        const attack = !previous || attackStrength > Math.max(.00002, previous.attackStrength * 1.4)
          || (backgroundRoot !== undefined && attackStrength > Math.max(.00002, backgroundRoot * 1.5));
        if (settings.mode === 'melody' && incumbents.length) {
          rank *= 1 + .10 * Math.exp(-Math.min(...incumbents.map(n => Math.abs(note.midi - n.midi))) / 5);
          if (attack && distance === 0) rank *= 1.18;
        }
        const retaining = this.active.has(note.midi) && this.active.get(note.midi).lostAt === undefined;
        const recentSupported = note.recentScore === undefined || strength > Math.max(.00002, note.score * .18, retaining ? this.melodyPeak * (distance === 0 ? .12 : .22) : 0);
        const independentRoot = settings.mode !== 'melody' || !note.fundamentalStrength || note.score >= note.fundamentalStrength * .35;
        const background = settings.mode === 'melody' && live && this.background.has(note.midi) && !retaining && !attack;
        return {...note, distance, rank, strength, attack, supported: independentRoot && !background && recentSupported && note.prominence >= 3 && rank >= threshold * (retaining ? .72 : 1)};
      }).filter(note => note.supported).sort((a,b) => b.rank - a.rank);

      let selected = scored.slice(0, mode.limit);
      if (settings.mode === 'melody') {
        // Allow a few independent lines of comparable current strength. A weaker
        // residual chord tone cannot become a new voice just because it remains.
        const preferred = scored.filter(n => n.distance === 0);
        const comparison = preferred.length ? preferred : scored;
        const currentFloor = Math.max(0, ...(preferred.length ? inRange : candidates).map(n => n.score)) * .55;
        const strongest = Math.max(0, ...comparison.map(n => n.strength));
        const strongestRoot = Math.max(0, ...comparison.map(n => n.recentFundamental ?? n.fundamentalStrength ?? n.strength));
        selected = scored.filter(n => (incumbents.some(v => v.midi === n.midi)
            && (n.recentFundamental ?? n.fundamentalStrength ?? n.strength) >= strongestRoot * .2)
          || (n.fundamental && (n.recentFundamental ?? n.fundamentalStrength ?? n.strength) >= strongestRoot * .35
            && n.strength >= Math.max(strongest * .35, currentFloor, live ? this.melodyPeak * (n.distance === 0 ? .18 : .55) : 0))).slice(0, mode.limit);
        if (live && !incumbents.length && this.melodyPeak > 0) selected = selected.filter(n => n.attack || n.strength >= this.melodyPeak * (n.distance === 0 ? .18 : .55));
      }
      // A convincing fresh attack can begin a new contour, including a note
      // that previously belonged to the accompaniment.
      if (settings.mode === 'melody') for (const n of selected) if (n.attack && n.strength > this.melodyPeak * .22) this.background.delete(n.midi);
      // Track observed accompaniment only from current evidence, never extrapolate it.
      const melodicNotes = new Set([...incumbents, ...selected].map(n => n.midi));
      if (settings.mode === 'melody' && live && incumbents.length) for (const n of candidates) {
        if (!melodicNotes.has(n.midi)
          // A nearby, supported transition may be waiting for the previous
          // note to fade. Do not permanently classify it as accompaniment.
          && !(n.midi >= range.low && n.midi <= range.high
            && incumbents.some(v => Math.abs(v.midi - n.midi) <= 5))
          && (n.recentScore ?? n.score) > Math.max(.00002, n.score * .18, this.melodyPeak * .15)) {
          if (!this.background.has(n.midi)) this.background.set(n.midi, n.recentFundamental ?? n.fundamentalStrength ?? n.score);
        }
      }
      const present = new Set(candidates.map(n => n.midi));
      for (const [midi, previous] of this.observed) if (!present.has(midi) && sourceTime - previous.time > .4) {
        this.observed.delete(midi); this.background.delete(midi);
      }
      for (const n of candidates) this.observed.set(n.midi, {strength:n.recentScore ?? n.score, attackStrength:n.recentFundamental ?? n.fundamentalStrength ?? n.score, time:sourceTime});
      // Keep history bounded even for dense, changing chords.
      while (this.observed.size > 48) { const midi = this.observed.keys().next().value; this.observed.delete(midi); this.background.delete(midi); }
      if (!live) {
        this.reset();
        return selected.map(n => ({...n, confidence: Math.min(.98, n.rank / (threshold * 2.5))}));
      }
      const wanted = new Set(selected.map(n => n.midi));
      for (const midi of this.pending.keys()) if (!wanted.has(midi)) this.pending.delete(midi);
      const alpha = 1 - Math.exp(-dt / (settings.mode === 'melody' ? 35 : 50));
      for (const n of selected) {
        let active = this.active.get(n.midi);
        if (!active) {
          if (!this.pending.has(n.midi)) this.pending.set(n.midi, now);
          // A clear current attack can light immediately; ordinary evidence
          // still needs confirmation, so noisy candidates cannot flicker on.
          const clearAttack = settings.mode === 'melody' && n.distance === 0 && n.attack
            && n.recentFundamental > .00002
            && n.recentFundamental >= Math.max(...selected.map(v => v.recentFundamental ?? 0)) * .6;
          const admission = settings.mode === 'melody' && n.distance > 0 ? 120 : mode.admission ?? 60;
          if (now - this.pending.get(n.midi) < (clearAttack ? 0 : admission)) continue;
          active = {...n, confidence:0, preciseMidi:n.preciseMidi}; this.active.set(n.midi, active);
        }
        delete active.lostAt; delete active.releaseStrength;
        active.confidence += (Math.min(.98, n.rank / (threshold * 2.5)) - active.confidence) * alpha;
        active.preciseMidi += (n.preciseMidi - active.preciseMidi) * alpha;
        active.rank = n.rank;
        if (settings.mode === 'melody') this.melodyPeak = Math.max(n.strength, this.melodyPeak);
      }
      // Single-note modes switch discrete pitches without an inter-note glide.
      const newlyActive = selected.find(n => this.active.has(n.midi));
      for (const [midi,n] of this.active) if (!wanted.has(midi)) {
        if (mode.limit === 1 && newlyActive) { this.active.delete(midi); continue; }
        if (n.lostAt === undefined) { n.lostAt = now; n.releaseStrength = n.confidence; n.releaseMs = mode.release ?? 80; }
        n.confidence = n.releaseStrength * Math.max(0, 1 - (now - n.lostAt) / n.releaseMs);
        if (now - n.lostAt >= n.releaseMs) this.active.delete(midi);
      }
      return [...this.active.values()].sort((a,b) => (a.lostAt !== undefined) - (b.lostAt !== undefined) || b.rank - a.rank)
        .slice(0, mode.limit).map(n => ({...n, releasing:n.lostAt !== undefined}));
    }
  }
  const highlightStrength = (note, now) => note.releasing
    ? note.releaseStrength * Math.max(0, 1 - (now - note.lostAt) / (note.releaseMs ?? 80)) : note.confidence;
  globalThis.TranscribeNotes = {modes, defaults, validate, parseNoteName, detect, extract, Tracker, highlightStrength};
  if (typeof module !== 'undefined') module.exports = globalThis.TranscribeNotes;
})();
