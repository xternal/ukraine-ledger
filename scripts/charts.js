// Zoom, hover and tooltips for the home page's charts (scripts/charts.ts draws them). Without this file the charts are
// complete: static SVG, a native tooltip on every mark, the centre's list, the sizing switch in CSS and the table
// below. The geometry is read from each SVG's data-geometry, so no number here repeats one in charts.ts; only the
// drawing rules do.
(() => {
  const TAU = 2 * Math.PI;
  const fx = (n) => String(Math.round(n * 100) / 100);

  function ringBounds(g, depth) {
    const w = g.weights.slice(depth);
    const total = w.reduce((a, b) => a + b, 0);
    const edges = [g.centre];
    for (const x of w) edges.push(edges[edges.length - 1] + ((g.outer - g.centre) * x) / total);
    return (ring) => [edges[ring - depth - 1], edges[ring - depth]];
  }

  function geometry(c) {
    const pt = (r, a) => `${fx(c + r * Math.sin(a))} ${fx(c - r * Math.cos(a))}`;
    return {
      arc(a0, a1, ri, ro) {
        if (a1 - a0 >= TAU - 1e-9)
          return `M${pt(ro, 0)}A${fx(ro)} ${fx(ro)} 0 1 1 ${pt(ro, Math.PI)}A${fx(ro)} ${fx(ro)} 0 1 1 ${pt(ro, 0)}ZM${pt(ri, 0)}A${fx(ri)} ${fx(ri)} 0 1 0 ${pt(ri, Math.PI)}A${fx(ri)} ${fx(ri)} 0 1 0 ${pt(ri, 0)}Z`;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        return `M${pt(ro, a0)}A${fx(ro)} ${fx(ro)} 0 ${large} 1 ${pt(ro, a1)}L${pt(ri, a1)}A${fx(ri)} ${fx(ri)} 0 ${large} 0 ${pt(ri, a0)}Z`;
      },
      // Where a ring's name goes: along the curve, left to right in either half; or along the radius; or nowhere.
      labelPlan(g, a0, a1, ri, ro, full, short) {
        const need = (s) => s.length * g.font * 0.6 + 14;
        const along = (a1 - a0) * ((ri + ro) / 2);
        const deep = ro - ri;
        const mid = (a0 + a1) / 2;
        if (deep >= g.font + 6)
          for (const text of [full, short])
            if (text && along >= need(text)) {
              const r = (ri + ro) / 2;
              const span = Math.min(a1 - a0, TAU - 0.02);
              const s = mid - span / 2;
              const e = mid + span / 2;
              const large = span > Math.PI ? 1 : 0;
              const d = Math.cos(mid) < 0 ? `M${pt(r, e)}A${fx(r)} ${fx(r)} 0 ${large} 0 ${pt(r, s)}` : `M${pt(r, s)}A${fx(r)} ${fx(r)} 0 ${large} 1 ${pt(r, e)}`;
              return { text, d };
            }
        if ((a1 - a0) * ri >= g.font + 4)
          for (const text of [full, short])
            if (text && deep >= need(text) - 6) return { text, d: Math.sin(mid) >= 0 ? `M${pt(ri, mid)}L${pt(ro, mid)}` : `M${pt(ro, mid)}L${pt(ri, mid)}` };
        return null;
      },
    };
  }

  // Tooltips: each mark's <title> becomes its accessible name and a tooltip that follows the pointer or focus.
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.setAttribute("aria-hidden", "true");
  tip.hidden = true;
  document.body.append(tip);
  const usd = document.getElementById("cur-usd");
  const show = (el, x, y) => {
    tip.textContent = usd?.checked && el.dataset.tipUsd ? el.dataset.tipUsd : el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - r.width - 8)) + scrollX}px`;
    tip.style.top = `${Math.max(8, y - r.height - 14) + scrollY}px`;
  };
  const hide = () => (tip.hidden = true);
  for (const t of document.querySelectorAll(".sb-svg title, .tl-svg title")) {
    const owner = t.parentElement;
    const target = owner.closest("a") ?? owner;
    target.dataset.tip = t.textContent;
    if (owner.dataset.tipUsd) target.dataset.tipUsd = owner.dataset.tipUsd;
    target.setAttribute("aria-label", owner.getAttribute("aria-label") ? `${owner.getAttribute("aria-label")}. ${t.textContent}` : t.textContent);
    if (target !== owner) owner.removeAttribute("aria-label");
    t.remove();
    target.addEventListener("pointermove", (e) => show(target, e.clientX, e.clientY));
    target.addEventListener("pointerleave", hide);
    target.addEventListener("focus", () => {
      const r = target.getBoundingClientRect();
      show(target, r.left + r.width / 2, r.top);
    });
    target.addEventListener("blur", hide);
  }
  addEventListener("keydown", (e) => e.key === "Escape" && hide());
  addEventListener("scroll", hide, { passive: true });

  // The rings: zoom (a segment becomes the centre, in both sizing modes at once), the list beside them, and hover,
  // which lights a segment with everything inside it and the way back to the centre.
  for (const fig of document.querySelectorAll(".sb")) {
    const svgs = [...fig.querySelectorAll(".sb-svg")];
    const crumbs = fig.querySelector(".sb-crumbs");
    const panels = new Map([...fig.querySelectorAll("[data-panel]")].map((p) => [p.dataset.panel, p]));
    let current = "all";

    const seg = (svg, id) => (id === "all" ? svg.querySelector(".sb-centre") : svg.querySelector(`[data-kind="seg"][data-node="${CSS.escape(id)}"]`));
    const anySeg = (id) => (id === "all" ? fig.querySelector(".sb-centre") : fig.querySelector(`[data-kind="seg"][data-node="${CSS.escape(id)}"]`));
    const trailOf = (id) => (id === "all" ? ["all"] : [...anySeg(id).dataset.path.split(" "), id]);

    function showPanel(id, row) {
      // A commitment has no list of its own: show its parent's, with its row marked.
      const el = anySeg(id);
      const own = panels.has(id) ? id : el ? el.dataset.path.split(" ").pop() : current;
      for (const [k, p] of panels) p.hidden = k !== own;
      for (const li of fig.querySelectorAll("[data-row]")) li.classList.toggle("is-current", li.dataset.row === (row ?? id));
    }

    function draw(svg, id) {
      const g = JSON.parse(svg.dataset.geometry);
      const geo = geometry(g.size / 2);
      let node = seg(svg, id);
      // A segment with no amount is not in the amount view: zoom that view to the nearest segment it has.
      if (!node) {
        id = [...trailOf(id)].reverse().find((p) => seg(svg, p)) ?? "all";
        node = seg(svg, id);
      }
      const A0 = id === "all" ? 0 : Number(node.dataset.a0);
      const A1 = id === "all" ? TAU : Number(node.dataset.a1);
      const ring = ringBounds(g, id === "all" ? 0 : Number(node.dataset.r1));
      for (const el of svg.querySelectorAll("[data-kind]")) {
        const inside = el.dataset.path.split(" ").includes(id);
        const box = el.closest("a") ?? el;
        if (el.dataset.kind === "lpath") continue;
        box.style.display = inside ? "" : "none";
        if (!inside) continue;
        const a0 = ((Number(el.dataset.a0) - A0) / (A1 - A0)) * TAU;
        const a1 = ((Number(el.dataset.a1) - A0) / (A1 - A0)) * TAU;
        const ri = ring(Number(el.dataset.r0))[0];
        const ro = ring(Number(el.dataset.r1))[1];
        const kind = el.dataset.kind;
        if (kind === "seg") el.setAttribute("d", geo.arc(a0, a1, ri, ro));
        else if (kind === "band") el.setAttribute("d", geo.arc(a0, a1, ro - g.band, ro));
        else {
          const plan = geo.labelPlan(g, a0, a1, ri, ro - g.band, el.dataset.full, el.dataset.short);
          el.setAttribute("visibility", plan ? "visible" : "hidden");
          if (plan) {
            svg.getElementById(el.dataset.for).setAttribute("d", plan.d);
            el.firstElementChild.textContent = plan.text;
          }
        }
      }
      const centre = svg.querySelector(".sb-centre");
      centre.querySelector(".sb-centre__label").textContent = node.dataset.centreLabel;
      centre.querySelector(".sb-centre__value").textContent = node.dataset.centreValue;
      centre.querySelector(".sb-centre__unit").textContent = node.dataset.centreUnit;
      centre.classList.toggle("sb-centre--zoomed", id !== "all");
    }

    function zoom(id) {
      current = id;
      for (const svg of svgs) draw(svg, id);
      showPanel(id);
      const trail = trailOf(id);
      crumbs.replaceChildren(
        ...trail.map((t, i) => {
          const label = anySeg(t).dataset.centreLabel;
          if (i === trail.length - 1) {
            const here = document.createElement("span");
            here.setAttribute("aria-current", "location");
            here.textContent = label;
            return here;
          }
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = label;
          b.addEventListener("click", () => zoom(t));
          return b;
        }),
      );
      crumbs.hidden = id === "all";
    }

    function light(id) {
      for (const svg of svgs) {
        svg.classList.toggle("is-hovering", !!id);
        if (!id) continue;
        const trail = new Set(trailOf(id));
        for (const el of svg.querySelectorAll('[data-kind="seg"]')) el.classList.toggle("is-lit", trail.has(el.dataset.node) || el.dataset.path.split(" ").includes(id));
      }
    }

    fig.addEventListener("pointerover", (e) => {
      const s = e.target.closest('[data-kind="seg"]');
      if (!s) return;
      light(s.dataset.node);
      showPanel(s.dataset.node);
    });
    fig.querySelector(".sb-rings").addEventListener("pointerleave", () => {
      light(null);
      showPanel(current);
    });
    fig.addEventListener("focusin", (e) => {
      const s = e.target.closest('[data-kind="seg"], .sb-link');
      if (s) showPanel((s.dataset.node ? s : s.querySelector("[data-node]")).dataset.node);
    });
    fig.addEventListener("click", (e) => {
      const z = e.target.closest("[data-zoom]");
      if (z) return zoom(z.dataset.zoom);
      const s = e.target.closest(".sb-seg--inner");
      if (s) return zoom(s.dataset.node);
      if (e.target.closest(".sb-centre") && current !== "all") zoom(trailOf(current).at(-2));
    });
    fig.addEventListener("keydown", (e) => {
      const s = e.target.closest(".sb-seg--inner");
      if (s && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        zoom(s.dataset.node);
      }
    });
    fig.classList.add("sb--live");
    zoom("all");
  }
})();
