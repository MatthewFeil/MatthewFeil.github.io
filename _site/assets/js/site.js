document.addEventListener("DOMContentLoaded", () => {
  const navTrigger = document.getElementById("nav-trigger");
  const navPanel = document.querySelector(".site-nav .trigger");
  const navLinks = document.querySelectorAll(".site-nav a.page-link");
  const navDropdowns = document.querySelectorAll(".site-nav .nav-dropdown");
  const mobileNavQuery = window.matchMedia("(max-width: 1040px)");

  if (!navTrigger || navLinks.length === 0) {
    return;
  }

  const getPathKey = (path) => {
    const cleanPath = path.replace(/\/index\.html$/, "/").replace(/\/$/, "");
    return cleanPath || "/";
  };

  const closeNavDropdowns = (exceptDropdown = null) => {
    navDropdowns.forEach((dropdown) => {
      if (dropdown === exceptDropdown) {
        return;
      }

      dropdown.classList.remove("is-open");
      dropdown.querySelector(".nav-dropdown-summary")?.setAttribute("aria-expanded", "false");
    });
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

  const waitForMenuCollapse = (wasOpen) => {
    const isMobileNav = mobileNavQuery.matches;

    if (!wasOpen || !isMobileNav || !navPanel) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let finished = false;

      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        navPanel.removeEventListener("transitionend", handleTransitionEnd);
        resolve();
      };

      const handleTransitionEnd = (event) => {
        if (event.target === navPanel && event.propertyName === "max-height") {
          finish();
        }
      };

      navPanel.addEventListener("transitionend", handleTransitionEnd);
      window.setTimeout(finish, 360);
    });
  };

  navDropdowns.forEach((dropdown) => {
    const button = dropdown.querySelector(".nav-dropdown-summary");

    if (!button) {
      return;
    }

    button.setAttribute("aria-expanded", "false");

    button.addEventListener("click", (event) => {
      if (!mobileNavQuery.matches) {
        return;
      }

      event.preventDefault();

      const isOpen = !dropdown.classList.contains("is-open");
      closeNavDropdowns(dropdown);
      dropdown.classList.toggle("is-open", isOpen);
      button.setAttribute("aria-expanded", String(isOpen));
    });
  });

  if (navDropdowns.length > 0) {
    navTrigger.addEventListener("change", () => {
      if (!navTrigger.checked) {
        closeNavDropdowns();
      }
    });

    mobileNavQuery.addEventListener("change", (event) => {
      if (!event.matches) {
        closeNavDropdowns();
      }
    });
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const url = new URL(link.href, window.location.href);
      const samePage = getPathKey(url.pathname) === getPathKey(window.location.pathname);
      const wasOpen = navTrigger.checked;

      navTrigger.checked = false;
      closeNavDropdowns();

      if (!url.hash || !samePage) {
        return;
      }

      event.preventDefault();

      waitForMenuCollapse(wasOpen).then(() => {
        window.requestAnimationFrame(() => {
          scrollToHashTarget(url.hash);
        });
      });
    });
  });
});
