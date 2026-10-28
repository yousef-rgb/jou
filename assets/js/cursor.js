/* ==========================================================================
   Custom cursor: a charcoal arrow with an orange glow underneath, tracking 1:1.
   States: default · link (glow strengthens) · view (labelled) · hint (3D form)
   Only for fine pointers that can hover; touch keeps the native cursor.
   ========================================================================== */
(function () {
  "use strict";

  const mm = (q) => matchMedia(q).matches;
  // Custom cursors ignore OS pointer-size settings: opt out for high contrast / forced colours
  if (!mm("(hover: hover) and (pointer: fine)") || mm("(forced-colors: active)") || mm("(prefers-contrast: more)")) return;

  const html = document.documentElement;

  const el = document.createElement("div");
  el.className = "cursor";
  el.setAttribute("aria-hidden", "true");
  el.dataset.state = "default";
  // Classic pointer shape; its tip (3, 2) is the hotspot
  el.innerHTML =
    '<div class="cursor-pos">' +
    '<svg class="cursor-arrow" viewBox="0 0 24 24"><path d="M3 2v17.2l4.7-4.3 3.1 6.7 2.9-1.3-3-6.6h6.6z"/></svg>' +
    '<span class="cursor-label"></span></div>';
  document.body.appendChild(el);

  const pos = el.querySelector(".cursor-pos");
  const label = el.querySelector(".cursor-label");
  // The arrow follows the pointer 1:1 (no easing), like a normal cursor
  const place = (x, y) => { pos.style.transform = `translate3d(${x}px,${y}px,0)`; };

  const INTERACTIVE = "[data-cursor], a[href], button, [role='button'], label, summary";
  const t = (key, fallback) => {
    const d = window.I18N && window.I18N[html.lang];
    return (d && d[key]) || fallback;
  };

  let shown = false;
  let hint = null; // label requested by the 3D scene while hovering the form
  let hoverState = { state: "default", label: "" };

  function apply() {
    const s = hoverState.state !== "default" ? hoverState : hint ? { state: "hint", label: hint } : hoverState;
    el.dataset.state = s.state;
    label.textContent = s.label || "";
  }

  function resolve(target) {
    const node = target instanceof Element ? target.closest(INTERACTIVE) : null;
    if (!node) return { state: "default", label: "" };
    const kind = node.dataset.cursor;
    if (kind === "view") return { state: "view", label: t(node.dataset.cursorLabel || "cursor.view", "View") };
    if (kind === "none") return { state: "default", label: "" };
    return { state: "link", label: "" };
  }

  let mx = -100, my = -100;
  const hide = () => { el.dataset.visible = "false"; shown = false; html.classList.remove("has-cursor"); };

  // A modal <dialog> lives in the top layer, above any z-index: hand back the native cursor while it is open
  const dlg = document.getElementById("pdlg");
  const dialogOpen = () => !!(dlg && dlg.open);
  if (dlg) new MutationObserver(() => { if (dlg.open) hide(); }).observe(dlg, { attributes: true, attributeFilter: ["open"] });

  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || dialogOpen()) { if (shown) hide(); return; }
    const x = (mx = e.clientX), y = (my = e.clientY);
    place(x, y);
    if (!shown) {
      // hide the native cursor only once ours is actually tracking
      el.dataset.visible = "true";
      html.classList.add("has-cursor");
      shown = true;
    }
  }, { passive: true });

  document.addEventListener("pointerover", (e) => { hoverState = resolve(e.target); apply(); }, { passive: true });
  addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") hide(); else el.toggleAttribute("data-pressed", true); }, { passive: true });
  addEventListener("pointerup", () => el.toggleAttribute("data-pressed", false), { passive: true });
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) hide(); });
  addEventListener("blur", hide);

  // Smooth scrolling moves content under a still pointer without a pointermove: re-resolve
  let raf = 0;
  addEventListener("scroll", () => {
    if (raf || !shown) return;
    raf = requestAnimationFrame(() => { raf = 0; hoverState = resolve(document.elementFromPoint(mx, my)); apply(); });
  }, { passive: true });

  /* Public hook: the 3D scene asks for a hint label while the form is hovered */
  window.Cursor = {
    hint(on) {
      const next = on ? t("cursor.play", "Play") : null;
      if (next === hint) return;
      hint = next;
      apply();
    },
    refresh() {
      // re-translate labels after a language switch, even if the pointer has not moved
      hoverState = resolve(document.elementFromPoint(mx, my));
      if (hint) hint = t("cursor.play", "Play");
      apply();
    },
  };
})();
