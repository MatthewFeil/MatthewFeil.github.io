document.addEventListener("DOMContentLoaded", () => {
  const navTrigger = document.getElementById("nav-trigger");
  const navLinks = document.querySelectorAll(".site-nav .page-link");

  if (!navTrigger || navLinks.length === 0) {
    return;
  }

  const getPathKey = (path) => {
    const cleanPath = path.replace(/\/index\.html$/, "/").replace(/\/$/, "");
    return cleanPath || "/";
  };

  const scrollToHashTarget = (hash) => {
    const target = document.getElementById(hash.slice(1));

    if (!target) {
      return false;
    }

    const rootStyles = window.getComputedStyle(document.documentElement);
    const scrollPadding = parseFloat(rootStyles.scrollPaddingTop);
    const fallbackPadding = 16;
    const offset = Number.isFinite(scrollPadding) ? scrollPadding : fallbackPadding;
    const top = target.getBoundingClientRect().top + window.pageYOffset - offset;

    window.scrollTo({
      top,
      behavior: "smooth",
    });

    window.history.pushState(null, "", hash);

    return true;
  };

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const url = new URL(link.href, window.location.href);
      const samePage = getPathKey(url.pathname) === getPathKey(window.location.pathname);

      navTrigger.checked = false;

      if (!url.hash || !samePage) {
        return;
      }

      event.preventDefault();

      window.requestAnimationFrame(() => {
        scrollToHashTarget(url.hash);
      });
    });
  });
});
