# Site preferences

- Keyboard navigation and visible focus treatment are **opt-in**, off by default everywhere on matthewfeil.com. Do not reintroduce unconditional focus outlines, rings, focus border/color changes, focus-only reveals, or focus-triggered tooltips.
- Scope positive CSS focus selectors beneath `:root[data-keyboard-navigation="on"]`. Reuse `_includes/keyboard-navigation.html` on all layouts, including standalone pages. Its toggle and Alt+Shift+K (Option+Shift+K on Mac) enable Tab/Shift+Tab navigation with visible indicators and a persistent preference.
- Preserve app keyboard shortcuts in both modes. Preserve native pointer focus, text editing, semantic controls, and focus-return behavior. Do not remove focusability or ARIA to hide focus styling.
- These user preferences take precedence over generic design-skill focus guidance. See DESIGN.md and PRODUCT.md.
- Preserve unrelated working-tree changes; do not commit or publish unless asked.

# Local previews

Identify the active preview server's port and exact destination directory first. Rebuild that exact directory, not just `_site`, and verify the live URL serves the changed markup or asset before claiming the preview is updated.
