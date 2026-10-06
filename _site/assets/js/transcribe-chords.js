/* Chord hypotheses from harmonic-suppressed note evidence; no audio or FFT duplication. */
(() => {
  const names = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const templates = [];
  function add(suffix, required, optional = [7], extensions = []) {
    templates.push({ suffix, required, extensions, optionalExtensions: optional.filter(i => i !== 7), tones: [...new Set([0, ...required, ...optional])] });
  }
  add('', [4]); add('m', [3]); add('dim', [3,6], []); add('aug', [4,8], []);
  add('sus2', [2,7], []); add('sus4', [5,7], []);
  add('6', [4,9], [7], [9]); add('m6', [3,9], [7], [9]);
  add('6/9', [4,9,2], [7], [9,2]); add('m6/9', [3,9,2], [7], [9,2]);
  for (const [suffix, third, seventh] of [['maj',4,11], ['',4,10], ['m',3,10], ['mMaj',3,11]]) {
    add(suffix + '7', [third,seventh]);
    add(suffix + '9', [third,seventh,2], [7], [2]);
    add(suffix + '11', [third,seventh,2,5], [7], [2,5]);
    add(suffix + '13', [third,seventh,9], [7,2], [9]);
  }
  add('ø7', [3,6,10], []); add('ø9', [3,6,10,2], [], [2]); add('dim7', [3,6,9], []);
  add('add9', [4,2], [7], [2]); add('m(add9)', [3,2], [7], [2]); add('add11', [4,5], [7], [5]);
  add('maj7♯11', [4,11,6], [7], [6]); add('maj9♯11', [4,11,2,6], [7], [2,6]); add('maj13♯11', [4,11,9,6], [7,2], [9,6]);
  add('7sus4', [5,10]); add('9sus4', [5,10,2], [7], [2]); add('13sus4', [5,10,9], [7,2], [9]);
  for (const [label, fifth] of [['♭5',6], ['♯5',8]]) {
    add('7' + label, [4,10,fifth], [], [fifth]); add('maj7' + label, [4,11,fifth], [], [fifth]);
  }
  for (const [ninthLabel, ninth] of [['',null], ['♭9',1], ['♯9',3], ['9',2]]) {
    for (const [colorLabel, color] of [['',null], ['♯11',6], ['♭13',8], ['13',9]]) {
      if (!ninthLabel && !colorLabel) continue;
      const suffix = (colorLabel === '13' ? '13' : ninthLabel === '9' ? '9' : '7')
        + (ninthLabel && ninthLabel !== '9' ? ninthLabel : '')
        + (colorLabel && colorLabel !== '13' ? colorLabel : '');
      const extensions = [...(ninth === null ? [] : [ninth]),...(color === null ? [] : [color])];
      add(suffix, [4,10,...extensions], color === 8 ? [] : [7], extensions);
    }
  }
  const pc = midi => ((Math.round(midi) % 12) + 12) % 12;
  function rank(notes) {
    if (!notes.length) return [];
    const max = Math.max(...notes.map(n => n.score));
    if (!(max > 0)) return [];
    const evidence = notes.filter(n => n.score / max >= .13);
    const chroma = Array(12).fill(0);
    for (const n of evidence) chroma[pc(n.midi)] = Math.max(chroma[pc(n.midi)], Math.sqrt(n.score / max));
    if (chroma.filter(v => v > .3).length < 3) return [];
    const bass = [...evidence].filter(n => n.fundamental !== false && n.score / max >= .25).sort((a,b) => a.midi-b.midi)[0];
    const bassPC = bass ? pc(bass.midi) : null;
    const total = chroma.reduce((a,b) => a+b,0);
    const results = [];
    for (let root = 0; root < 12; root++) for (const t of templates) {
      const at = interval => chroma[(root+interval)%12];
      const explained = t.tones.reduce((sum,i) => sum+at(i),0);
      const missing = t.required.reduce((sum,i) => sum + (1-at(i)),0);
      // Defining tones outweigh root presence; an absent fifth costs nothing.
      let score = explained * 1.6 - (total-explained) * 2.2 - missing * 1.5;
      score += at(0) * .3 - (at(0) < .2 ? .35 : 0);
      score -= Math.max(0,t.required.length-2) * .12;
      // Prefer familiar qualities when color tones are faint or ambiguous.
      // Clear extensions still earn more from explaining notes than this costs.
      score -= t.extensions.reduce((sum,i) => sum + .4 + (1-at(i) ** 2) * 4, 0);
      score -= t.optionalExtensions.filter(i => at(i) > 0)
        .reduce((sum,i) => sum + .4 + (1-at(i) ** 2) * 4, 0);
      // A colorful reinterpretation also needs a convincing underlying chord.
      if (t.extensions.length) {
        score -= (1-Math.max(.5, at(0) ** 2)) * 8;
        score -= t.required.filter(i => !t.extensions.includes(i))
          .reduce((sum,i) => sum + (1-Math.min(1, at(i) ** 2 / .65)) * 8, 0);
      }
      if (bassPC !== null) score += bassPC === root ? .65 : t.tones.includes((bassPC-root+12)%12) ? .1 : -.3;
      const label = names[root] + t.suffix + (bassPC !== null && bassPC !== root ? '/' + names[bassPC] : '');
      results.push({label,score});
    }
    return results.sort((a,b) => b.score-a.score || a.label.localeCompare(b.label))
      .filter((r,i,all) => all.findIndex(x => x.label === r.label) === i).slice(0,12);
  }
  class Tracker {
    reset() {
      this.notes = null; this.time = null; this.now = null; this.winner = null;
      this.pending = null; this.pendingSince = null; this.publishedAt = null;
      this.silentSince = null; this.display = [];
    }
    update(notes, time, continuous, now = time * 1000) {
      const sourceDelta = time - this.time;
      if (!continuous || !this.notes || sourceDelta < 0 || sourceDelta > .5 || now - this.now > 500) this.reset();
      const dt = this.now === null ? 33 : Math.max(0, now - this.now);
      if (this.notes && notes.length) {
        const old = new Map(this.notes.map(n => [n.midi,n]));
        // Smooth currently supported evidence in real time at any playback speed.
        // Absent notes are removed rather than accumulated into phantom chords.
        const retention = Math.exp(-dt / 180);
        notes = notes.map(n => ({...n,score:n.score*(1-retention)+(old.get(n.midi)?.score || n.score)*retention}));
      }
      this.notes = notes; this.time = time; this.now = now;
      const ranked = rank(notes);
      const previous = ranked.find(r => r.label === this.winner);
      if (previous && ranked[0].score - previous.score < .3) ranked.splice(0,0,...ranked.splice(ranked.indexOf(previous),1));
      const guesses = ranked.slice(0,3).map(r => r.label);
      if (!continuous) {
        this.winner = guesses[0]; this.display = guesses; this.publishedAt = now;
        return [...this.display];
      }
      if (!guesses.length) {
        this.pending = null; this.pendingSince = null;
        if (this.silentSince === null) this.silentSince = now;
        if (now - this.silentSince >= 120) {
          this.display = []; this.winner = null; this.publishedAt = null;
        }
        return [...this.display];
      }
      this.silentSince = null;
      if (guesses[0] !== this.pending) {
        this.pending = guesses[0]; this.pendingSince = now;
      }
      // Confirm the winner across observations, then publish at most every 300 ms.
      // Alternatives update with the winner, so the full readout stays readable.
      if (now - this.pendingSince >= 200 && (this.publishedAt === null || now - this.publishedAt >= 300)) {
        this.winner = guesses[0]; this.display = guesses; this.publishedAt = now;
      }
      return [...this.display];
    }
  }
  globalThis.TranscribeChords = { rank, Tracker, templates };
})();
