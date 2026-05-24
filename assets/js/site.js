document.addEventListener("DOMContentLoaded", () => {
  const navTrigger = document.getElementById("nav-trigger");
  const navLinks = document.querySelectorAll(".site-nav .page-link");

  if (!navTrigger || navLinks.length === 0) {
    return;
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navTrigger.checked = false;
    });
  });
});
