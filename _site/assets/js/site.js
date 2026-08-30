document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const themeNames = {
    system: "System",
    light: "Light",
    dark: "Dark",
  };
  const nextTheme = {
    system: "light",
    light: "dark",
    dark: "system",
  };

  const getSavedTheme = () => {
    try {
      const savedTheme = localStorage.getItem("site-theme");

      return themeNames[savedTheme] ? savedTheme : "system";
    } catch {
      return "system";
    }
  };

  const setTheme = (theme, shouldPersist = false) => {
    const normalizedTheme = themeNames[theme] ? theme : "system";

    document.documentElement.toggleAttribute("data-theme", normalizedTheme !== "system");

    if (normalizedTheme !== "system") {
      document.documentElement.dataset.theme = normalizedTheme;
    }

    if (shouldPersist) {
      try {
        if (normalizedTheme === "system") {
          localStorage.removeItem("site-theme");
        } else {
          localStorage.setItem("site-theme", normalizedTheme);
        }
      } catch {
        // The current page can still use the selected theme without storage.
      }
    }

    if (!themeToggle) {
      return;
    }

    const next = nextTheme[normalizedTheme];
    const currentName = themeNames[normalizedTheme];
    const nextName = themeNames[next].toLowerCase();

    themeToggle.dataset.theme = normalizedTheme;
    themeToggle.setAttribute("aria-label", `Theme: ${currentName}. Activate to switch to ${nextName} mode.`);
    themeToggle.title = `Theme: ${currentName}. Activate to switch to ${nextName} mode.`;

  };

  setTheme(getSavedTheme());
  themeToggle?.addEventListener("click", () => {
    setTheme(nextTheme[themeToggle.dataset.theme || "system"], true);
  });

  const nav = document.querySelector(".site-nav");
  const navToggle = nav?.querySelector(".nav-toggle");
  const navPanel = nav?.querySelector(".trigger");
  const navLinks = nav?.querySelectorAll("a");
  const navGroups = nav?.querySelectorAll(".nav-group");
  const navSectionLinks = nav?.querySelectorAll("[data-nav-section]");
  const navRouteLinks = nav?.querySelectorAll("[data-nav-route]");
  const header = nav?.closest(".site-header");
  const mobileNavQuery = window.matchMedia("(max-width: 1040px)");

  if (!nav || !navToggle || !navPanel || !navLinks || !navGroups || !navSectionLinks || !navRouteLinks) {
    return;
  }

  const getPathKey = (path) => {
    const cleanPath = path.replace(/\/index\.html$/, "/").replace(/\/$/, "");
    return cleanPath || "/";
  };

  const currentPathKey = getPathKey(window.location.pathname);
  const routePaths = {
    personal: "/personal",
    playlists: "/playlists.html",
  };
  let currentNavFrame = null;
  let scrollingStateTimeout = null;

  const setScrollingState = () => {
    document.documentElement.classList.add("is-scrolling");
    window.clearTimeout(scrollingStateTimeout);
    scrollingStateTimeout = window.setTimeout(() => {
      document.documentElement.classList.remove("is-scrolling");
    }, 100);
  };

  const syncHeaderHeight = () => {
    const height = header?.getBoundingClientRect().height;

    if (height) {
      document.documentElement.style.setProperty("--nav-header-height", `${Math.ceil(height)}px`);
    }
  };

  const clearCurrentLinks = () => {
    nav.querySelectorAll(".page-link[aria-current]").forEach((link) => {
      link.removeAttribute("aria-current");
    });
  };

  const updateCurrentLink = () => {
    clearCurrentLinks();

    const routeLink = Array.from(navRouteLinks).find((link) => {
      return routePaths[link.dataset.navRoute] === currentPathKey;
    });

    if (routeLink) {
      routeLink.setAttribute("aria-current", "page");
      return;
    }

    if (currentPathKey !== "/") {
      return;
    }

    const headerHeight = nav.closest(".site-header")?.getBoundingClientRect().height ?? 0;
    const aboutLink = Array.from(navSectionLinks).find((link) => link.dataset.navSection === "about");
    const aboutSection = aboutLink ? document.getElementById("about") : null;
    const aboutBounds = aboutSection?.getBoundingClientRect();
    const isAboutFullyVisible = aboutBounds
      && aboutBounds.top >= headerHeight
      && aboutBounds.bottom <= window.innerHeight;

    if (isAboutFullyVisible) {
      aboutLink.setAttribute("aria-current", "location");
      return;
    }

    const activationPoint = window.scrollY + headerHeight + Math.min(window.innerHeight * 0.18, 144);
    let currentLink = null;

    navSectionLinks.forEach((link) => {
      if (link === aboutLink) {
        return;
      }

      const section = document.getElementById(link.dataset.navSection);

      if (!section) {
        return;
      }

      const sectionTop = section.getBoundingClientRect().top + window.scrollY;

      if (sectionTop <= activationPoint) {
        currentLink = link;
      }
    });

    const isAtPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;

    if (isAtPageEnd && navSectionLinks.length > 0) {
      currentLink = navSectionLinks[navSectionLinks.length - 1];
    }

    currentLink?.setAttribute("aria-current", "location");
  };

  const scheduleCurrentLinkUpdate = () => {
    if (currentNavFrame !== null) {
      return;
    }

    currentNavFrame = window.requestAnimationFrame(() => {
      currentNavFrame = null;
      updateCurrentLink();
    });
  };

  const closeGroups = (exceptGroup = null) => {
    navGroups.forEach((group) => {
      if (group === exceptGroup) {
        return;
      }

      group.classList.remove("is-open");
      group.querySelector(".nav-group-trigger")?.setAttribute("aria-expanded", "false");
      const menu = group.querySelector(".nav-group-menu");
      menu?.setAttribute("aria-hidden", "true");

      if (menu) {
        menu.inert = true;
      }
    });
  };

  const syncNavPanelAccessibility = () => {
    const isHiddenMobileMenu = mobileNavQuery.matches && !nav.classList.contains("is-open");

    navPanel.inert = isHiddenMobileMenu;
    navPanel.toggleAttribute("aria-hidden", isHiddenMobileMenu);
    document.documentElement.classList.toggle(
      "site-nav-open",
      mobileNavQuery.matches && nav.classList.contains("is-open"),
    );
  };

  const closeNav = () => {
    nav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    closeGroups();
    if (mobileNavQuery.matches) {
      navPanel.scrollTop = 0;
    }
    syncNavPanelAccessibility();
  };

  const setGroupOpen = (group, shouldOpen) => {
    const trigger = group.querySelector(".nav-group-trigger");
    const menu = group.querySelector(".nav-group-menu");

    closeGroups(shouldOpen ? group : null);
    group.classList.toggle("is-open", shouldOpen);
    trigger?.setAttribute("aria-expanded", String(shouldOpen));
    menu?.setAttribute("aria-hidden", String(!shouldOpen));

    if (menu) {
      menu.inert = !shouldOpen;
    }
  };

  const positionOpenMenu = (group) => {
    if (mobileNavQuery.matches) {
      group.style.removeProperty("--nav-menu-left");
      group.style.removeProperty("--nav-menu-top");
      return;
    }

    const trigger = group.querySelector(".nav-group-trigger");
    const menu = group.querySelector(".nav-group-menu");

    if (!trigger || !menu) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menuWidth = menu.getBoundingClientRect().width;
    const headerRect = nav.closest(".site-header")?.getBoundingClientRect();
    const viewportGutter = 16;
    const left = Math.min(
      Math.max(triggerRect.right - menuWidth, viewportGutter),
      window.innerWidth - menuWidth - viewportGutter,
    );

    group.style.setProperty("--nav-menu-left", `${left}px`);
    const top = Math.max(triggerRect.bottom, headerRect?.bottom ?? 0) + 8;

    group.style.setProperty("--nav-menu-top", `${top}px`);
  };

  const refreshOpenMenuPosition = () => {
    const openGroup = nav.querySelector(".nav-group.is-open");

    if (openGroup) {
      positionOpenMenu(openGroup);
    }
  };

  const scrollToHashTarget = (hash) => {
    const target = document.getElementById(hash.slice(1));

    if (!target) {
      return false;
    }

    const rootStyles = window.getComputedStyle(document.documentElement);
    const scrollPadding = parseFloat(rootStyles.scrollPaddingTop);
    const offset = Number.isFinite(scrollPadding) ? scrollPadding : 16;
    const top = target.getBoundingClientRect().top + window.pageYOffset - offset;

    window.scrollTo({ top, behavior: "smooth" });
    window.history.pushState(null, "", hash);

    return true;
  };

  const waitForMenuCollapse = (wasOpen) => {
    if (!wasOpen || !mobileNavQuery.matches) {
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
        if (event.target === navPanel && event.propertyName === "transform") {
          finish();
        }
      };

      navPanel.addEventListener("transitionend", handleTransitionEnd);
      window.setTimeout(finish, 360);
    });
  };

  navToggle.addEventListener("click", () => {
    const shouldOpen = !nav.classList.contains("is-open");

    nav.classList.toggle("is-open", shouldOpen);
    navToggle.setAttribute("aria-expanded", String(shouldOpen));
    syncNavPanelAccessibility();

    if (!shouldOpen) {
      closeGroups();
    }
  });

  navGroups.forEach((group) => {
    const trigger = group.querySelector(".nav-group-trigger");

    trigger?.addEventListener("click", () => {
      const shouldOpen = !group.classList.contains("is-open");

      if (shouldOpen) {
        positionOpenMenu(group);
      }

      setGroupOpen(group, shouldOpen);
    });
  });

  document.addEventListener("pointerdown", (event) => {
    if (!nav.contains(event.target)) {
      closeNav();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const openTrigger = nav.querySelector(".nav-group.is-open .nav-group-trigger");
      const wasOpen = nav.classList.contains("is-open") || Boolean(openTrigger);

      closeNav();

      if (wasOpen) {
        (openTrigger || navToggle).focus();
      }
    }
  });

  document.addEventListener("focusin", (event) => {
    if (!nav.contains(event.target)) {
      closeNav();
      return;
    }

    const openGroup = nav.querySelector(".nav-group.is-open");

    if (openGroup && !openGroup.contains(event.target)) {
      setGroupOpen(openGroup, false);
    }
  });

  if (mobileNavQuery.addEventListener) {
    mobileNavQuery.addEventListener("change", closeNav);
  } else {
    mobileNavQuery.addListener(closeNav);
  }
  window.addEventListener("resize", () => {
    syncHeaderHeight();
    refreshOpenMenuPosition();
    scheduleCurrentLinkUpdate();
  });
  window.addEventListener("scroll", () => {
    setScrollingState();
    refreshOpenMenuPosition();
    scheduleCurrentLinkUpdate();
  }, { passive: true });
  window.addEventListener("hashchange", scheduleCurrentLinkUpdate);

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const url = new URL(link.href, window.location.href);
      const samePage = getPathKey(url.pathname) === getPathKey(window.location.pathname);
      const wasOpen = nav.classList.contains("is-open");

      closeNav();

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

  syncNavPanelAccessibility();
  syncHeaderHeight();
  document.fonts?.ready?.then(syncHeaderHeight);
  updateCurrentLink();
});
