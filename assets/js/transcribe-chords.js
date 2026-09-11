/* Chord hypotheses from harmonic-suppressed note evidence; no audio or FFT duplication. */
(() => {
  const names = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const templates = [];
  function add(suffix, required, optional = [7]) {
    templates.push({ suffix, required, tones: [...new Set([0, ...required, ...optional])] });
  }
  add('', [4]); add('m', [3]); add('dim', [3,6], []); add('aug', [4,8], []);
  add('sus2', [2,7], []); add('sus4', [5,7], []);
  add('6', [4,9]); add('m6', [3,9]); add('6/9', [4,9,2]); add('m6/9', [3,9,2]);
  for (const [suffix, third, seventh] of [['maj',4,11], ['',4,10], ['m',3,10], ['mMaj',3,11]]) {
    add(suffix + '7', [third,seventh]);
    add(suffix + '9', [third,seventh,2]);
    add(suffix + '11', [third,seventh,2,5]);
    add(suffix + '13', [third,seventh,9], [7,2]);
  }
  add('ø7', [3,6,10], []); add('ø9', [3,6,10,2], []); add('dim7', [3,6,9], []);
  add('add9', [4,2]); add('m(add9)', [3,2]); add('add11', [4,5]);
  add('maj7♯11', [4,11,6]); add('maj9♯11', [4,11,2,6]); add('maj13♯11', [4,11,9,6], [7,2]);
  add('7sus4', [5,10]); add('9sus4', [5,10,2]); add('13sus4', [5,10,9], [7,2]);
  for (const [label, fifth] of [['♭5',6], ['♯5',8]]) {
    add('7' + label, [4,10,fifth], []); add('maj7' + label, [4,11,fifth], []);
  }
  for (const [ninthLabel, ninth] of [['',null], ['♭9',1], ['♯9',3], ['9',2]]) {
    for (const [colorLabel, color] of [['',null], ['♯11',6], ['♭13',8], ['13',9]]) {
      if (!ninthLabel && !colorLabel) continue;
      const suffix = (colorLabel === '13' ? '13' : ninthLabel === '9' ? '9' : '7')
        + (ninthLabel && ninthLabel !== '9' ? ninthLabel : '')
        + (colorLabel && colorLabel !== '13' ? colorLabel : '');
      add(suffix, [4,10,...(ninth === null ? [] : [ninth]),...(color === null ? [] : [color])], color === 8 ? [] : [7]);
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
      if (bassPC !== null) score += bassPC === root ? .65 : t.tones.includes((bassPC-root+12)%12) ? .1 : -.3;
      const label = names[root] + t.suffix + (bassPC !== null && bassPC !== root ? '/' + names[bassPC] : '');
      results.push({label,score});
    }
    return results.sort((a,b) => b.score-a.score || a.label.localeCompare(b.label))
      .filter((r,i,all) => all.findIndex(x => x.label === r.label) === i).slice(0,12);
  }
  class Tracker {
    reset() { this.notes = null; this.time = null; this.winner = null; }
    update(notes, time, continuous) {
      const dt = time - this.time;
      if (!continuous || !this.notes || dt <= 0 || dt > .35) this.reset();
      if (this.notes && notes.length) {
        const old = new Map(this.notes.map(n => [n.midi,n]));
        // Only retain currently supported notes: no trailing chord across a change.
        notes = notes.map(n => ({...n,score:n.score*.65+(old.get(n.midi)?.score || n.score)*.35}));
      }
      this.notes = notes; this.time = time;
      const ranked = rank(notes);
      const previous = ranked.find(r => r.label === this.winner);
      if (previous && ranked[0].score - previous.score < .25) ranked.splice(0,0,...ranked.splice(ranked.indexOf(previous),1));
      this.winner = ranked[0]?.label;
      return ranked.slice(0,3).map(r => r.label);
    }
  }
  globalThis.TranscribeChords = { rank, Tracker, templates };
})();
