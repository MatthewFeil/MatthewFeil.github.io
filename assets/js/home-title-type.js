document.addEventListener("DOMContentLoaded", () => {
  const title = document.getElementById("home-title");
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  if (!title || motionQuery?.matches || document.hidden) return;

  const lines = Array.from(title.querySelectorAll(".home-title-line"));
  const words = lines.map((line) => line.textContent.trim()).filter(Boolean);
  const label = words.join(" ");

  if (!label || words.length !== lines.length) return;

  const timers = new Set();
  let cursor = null;
  let fallbackTimer = null;
  let isComplete = false;

  const cancelPendingTimers = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();

    if (fallbackTimer !== null) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const restoreStaticTitle = () => {
    cancelPendingTimers();
    cursor?.remove();
    lines.forEach((line, index) => {
      line.textContent = words[index];
      line.removeAttribute("aria-hidden");
    });
    title.removeAttribute("aria-label");
    title.removeAttribute("data-typing-active");
  };

  const schedule = (callback, delay) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);

      try {
        callback();
      } catch {
        restoreStaticTitle();
      }
    }, delay);
    timers.add(timer);
  };

  const addCharacter = (character) => {
    const letter = document.createElement("span");
    letter.className = "home-title-character";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = character;
    cursor.before(letter);
  };

  let wordIndex = 0;
  let characterIndex = 0;
  const typeNext = () => {
    const word = words[wordIndex];

    if (characterIndex < word.length) {
      addCharacter(word[characterIndex]);
      characterIndex += 1;
      schedule(typeNext, 135);
      return;
    }

    wordIndex += 1;
    characterIndex = 0;

    if (wordIndex < words.length) {
      lines[wordIndex].append(cursor);
      schedule(typeNext, 220);
      return;
    }

    isComplete = true;
    window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
    schedule(() => cursor?.remove(), 360);
  };

  try {
    title.dataset.typingActive = "true";
    title.setAttribute("aria-label", label);
    lines.forEach((line) => {
      line.setAttribute("aria-hidden", "true");
      line.replaceChildren();
    });

    cursor = document.createElement("span");
    cursor.className = "home-title-cursor";
    cursor.setAttribute("aria-hidden", "true");
    lines[0].append(cursor);

    fallbackTimer = window.setTimeout(restoreStaticTitle, 3200);
    window.requestAnimationFrame(() => {
      try {
        typeNext();
      } catch {
        restoreStaticTitle();
      }
    });
  } catch {
    restoreStaticTitle();
    return;
  }

  motionQuery?.addEventListener?.("change", (event) => {
    if (event.matches) restoreStaticTitle();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !isComplete) restoreStaticTitle();
  }, { once: true });
  window.addEventListener("pagehide", restoreStaticTitle, { once: true });
});
