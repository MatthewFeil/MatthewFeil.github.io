(() => {
  function parse(value) {
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
    if (!match) return null;
    const [, monthText, dayText, yearText] = match;
    const [month, day, year] = [monthText, dayText, yearText].map(Number);
    if (year < 1) return null;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  function formatLocal(date) {
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getFullYear()).padStart(4, '0')}`;
  }

  // Keep the full template in a real text input so pointer selection, the
  // native caret, copying, and assistive technology share one editing value.
  const template = 'MM-DD-YYYY';
  const slots = [0, 1, 3, 4, 6, 7, 8, 9];

  function mask(input, onEdit) {
    let previousValue = input.value || template;
    const wrapper = document.createElement('span');
    wrapper.className = 'investment-date-mask';
    const ink = document.createElement('span');
    ink.className = 'investment-date-ink';
    ink.setAttribute('aria-hidden', 'true');
    input.before(wrapper);
    wrapper.append(input, ink);

    function syncInk() {
      ink.replaceChildren(...Array.from(input.value, character => {
        const span = document.createElement('span');
        span.textContent = character;
        if (!/\d/.test(character)) span.className = 'is-placeholder';
        return span;
      }));
    }

    // Defaults are populated by the calculator immediately after binding.
    queueMicrotask(syncInk);
    const undo = [];
    const redo = [];

    function render(value, position) {
      input.value = value;
      previousValue = value;
      syncInk();
      input.setSelectionRange(position, position);
      onEdit();
    }

    function edit(data = '', direction = '') {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      const value = previousValue.split('');
      undo.push({ value: previousValue, start, end });
      redo.length = 0;
      slots.filter(slot => slot >= start && slot < end).forEach(slot => { value[slot] = template[slot]; });
      let position = start;
      if (direction && start === end) {
        const slot = direction === 'backward'
          ? slots.findLast(slot => slot < start)
          : slots.find(slot => slot >= start);
        if (slot !== undefined) {
          value[slot] = template[slot];
          position = slot;
        }
      }
      for (const digit of data.replace(/\D/g, '')) {
        const slot = slots.find(slot => slot >= position);
        if (slot === undefined) break;
        value[slot] = digit;
        position = slots.find(next => next > slot) ?? 10;
      }
      render(value.join(''), position);
    }

    function restore(from, to) {
      const entry = from.pop();
      if (!entry) return;
      to.push({ value: previousValue, start: input.selectionStart, end: input.selectionEnd });
      render(entry.value, entry.start);
      input.setSelectionRange(entry.start, entry.end);
    }

    input.value = previousValue;
    input.addEventListener('click', () => {
      // Clicking anywhere starts a new date; keep the previous value available
      // through Undo and move the native caret past no template characters.
      if (input.value !== template) {
        undo.push({ value: input.value, start: 0, end: 10 });
        redo.length = 0;
      }
      render(template, 0);
    });
    input.addEventListener('beforeinput', event => {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        if (event.inputType === 'historyUndo') restore(undo, redo);
        else restore(redo, undo);
      } else if (event.inputType.startsWith('delete')) {
        event.preventDefault();
        edit('', event.inputType.includes('Backward') ? 'backward' : 'forward');
      } else if (event.inputType.startsWith('insert') && event.data !== null) {
        event.preventDefault();
        if (/^[\d\s/.-]+$/.test(event.data) && /\d/.test(event.data)) edit(event.data);
      }
    });
    input.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text') || '';
      event.preventDefault();
      if (/^[\d\s/.-]+$/.test(text) && /\d/.test(text)) edit(text);
    });
    input.addEventListener('cut', event => {
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? start;
      if (start === end || !event.clipboardData) return;
      event.clipboardData.setData('text/plain', input.value.slice(start, end));
      event.preventDefault();
      edit();
    });
    input.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) restore(redo, undo);
          else restore(undo, redo);
        } else if (event.key.toLowerCase() === 'y') {
          event.preventDefault();
          restore(redo, undo);
        }
      }
    });
    // Autofill and browser input methods may bypass beforeinput. Normalize
    // those values, retaining the same complete-date validation below.
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 8);
      const value = template.split('');
      digits.split('').forEach((digit, index) => { value[slots[index]] = digit; });
      undo.push({ value: previousValue, start: 0, end: 10 });
      redo.length = 0;
      render(value.join(''), slots[digits.length] ?? 10);
    });
    input.addEventListener('focus', () => {
      previousValue = input.value || template;
      input.value = previousValue;
      syncInk();
    });
  }

  function bind({ startInput, endInput, allowFuture, setFieldInvalid, setStatus, status }) {
    const inputs = [startInput, endInput];
    let lastMessage = '';
    const touched = new Set();

    function validate(force = false) {
      let message = '';
      inputs.forEach((input) => setFieldInvalid(input, false));
      const dates = inputs.map((input) => parse(input.value));
      const today = parse(formatLocal(new Date()));
      inputs.forEach((input, index) => {
        const shouldCheck = force || touched.has(input) || /^[0-9]{2}-[0-9]{2}-[0-9]{4}$/.test(input.value);
        if (!dates[index] && shouldCheck) {
          setFieldInvalid(input, true);
          message ||= `Enter a valid ${index === 0 ? 'start' : 'end'} date in MM-DD-YYYY format.`;
        } else if (dates[index] && !allowFuture && dates[index] > today) {
          setFieldInvalid(input, true);
          message ||= 'Stock return dates must be today or earlier.';
        }
      });
      if (!message && dates.every(Boolean) && dates[1] < dates[0]) {
        setFieldInvalid(endInput, true);
        message = 'End date is before start date. Enter an end date on or after the start date.';
      }
      if (message) setStatus(message, 'error');
      else if (lastMessage && status.textContent === lastMessage) setStatus('', '');
      lastMessage = message;
      return !message && dates.every(Boolean);
    }

    inputs.forEach((input) => {
      mask(input, () => {
        // Allow an incomplete replacement while the user is still typing.
        touched.delete(input);
        validate();
      });
      input.addEventListener('blur', () => { touched.add(input); validate(); });
      input.addEventListener('change', () => { touched.add(input); validate(); });
      input.addEventListener('invalid', (event) => { event.preventDefault(); validate(true); });
    });
    return validate;
  }

  window.CalculatorDates = { parse, formatLocal, bind };
})();
