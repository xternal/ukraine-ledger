// Zoom and tooltips for the home page's charts (scripts/charts.ts draws them). Without this file the charts are
// complete: static SVG, a native tooltip on every mark, the sizing switch in CSS and the table below. The geometry is
// read from each SVG's data-geometry, so no number here repeats one in charts.ts; only the drawing rules do.
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

  function arc(c, a0, a1, ri, ro) {
    const pt = (r, a) => `${fx(c + r * Math.sin(a))} ${fx(c - r * Math.cos(a))}`;
    if (a1 - a0 >= TAU - 1e-9)
      return `M${pt(ro, 0)}A${fx(ro)} ${fx(ro)} 0 1 1 ${pt(ro, Math.PI)}A${fx(ro)} ${fx(ro)} 0 1 1 ${pt(ro, 0)}ZM${pt(ri, 0)}A${fx(ri)} ${fx(ri)} 0 1 0 ${pt(ri, Math.PI)}A${fx(ri)} ${fx(ri)} 0 1 0 ${pt(ri, 0)}Z`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${pt(ro, a0)}A${fx(ro)} ${fx(ro)} 0 ${large} 1 ${pt(ro, a1)}L${pt(ri, a1)}A${fx(ri)} ${fx(ri)} 0 ${large} 0 ${pt(ri, a0)}Z`;
  }

  const labelFits = (g, a0, a1, ri, ro, chars) => {
    const room = a1 - a0 >= Math.PI ? ri + ro : (ri + ro) * Math.sin((a1 - a0) / 2);
    return ro - ri >= g.font + 4 && room >= chars * g.font * 0.56 + 8;
  };
  const labelTurn = (a) => {
    const deg = (a * 180) / Math.PI;
    return deg > 90 && deg < 270 ? deg - 180 : deg;
  };

  // Tooltips: each mark's <title> becomes its accessible name and a tooltip that follows the pointer or focus.
  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.setAttribute("aria-hidden", "true");
  tip.hidden = true;
  document.body.append(tip);
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(x + 12, innerWidth - r.width - 8)) + scrollX}px`;
    tip.style.top = `${Math.max(8, y - r.height - 12) + scrollY}px`;
  };
  const hide = () => (tip.hidden = true);
  for (const t of document.querySelectorAll(".sb-svg title, .tl-svg title")) {
    const owner = t.parentElement;
    const target = owner.closest("a") ?? owner;
    target.dataset.tip = t.textContent;
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

  // Zoom: a ring segment becomes the centre and what is inside it fills the rings, in both sizing modes at once.
  for (const fig of document.querySelectorAll(".sb")) {
    const svgs = [...fig.querySelectorAll(".sb-svg")];
    const crumbs = fig.querySelector(".sb-crumbs");
    let current = "all";

    const nodeIn = (svg, id) => (id === "all" ? svg.querySelector(".sb-centre") : svg.querySelector(`[data-kind="seg"][data-node="${CSS.escape(id)}"]`));

    function draw(svg, id) {
      const g = JSON.parse(svg.dataset.geometry);
      const c = g.size / 2;
      let node = nodeIn(svg, id);
      // A segment with no amount is not in the amount view: zoom that view to the nearest segment it has.
      if (!node) {
        const any = fig.querySelector(`[data-node="${CSS.escape(id)}"]`);
        const up = any ? any.dataset.path.split(" ").reverse() : [];
        id = up.find((p) => nodeIn(svg, p)) ?? "all";
        node = nodeIn(svg, id);
      }
      const A0 = id === "all" ? 0 : Number(node.dataset.a0);
      const A1 = id === "all" ? TAU : Number(node.dataset.a1);
      const depth = id === "all" ? 0 : Number(node.dataset.r1);
      const ring = ringBounds(g, depth);
      for (const el of svg.querySelectorAll("[data-kind]")) {
        const inside = el.dataset.path.split(" ").includes(id);
        const box = el.closest("a") ?? el;
        box.style.display = inside ? "" : "none";
        if (!inside) continue;
        const a0 = ((Number(el.dataset.a0) - A0) / (A1 - A0)) * TAU;
        const a1 = ((Number(el.dataset.a1) - A0) / (A1 - A0)) * TAU;
        const ri = ring(Number(el.dataset.r0))[0];
        const ro = ring(Number(el.dataset.r1))[1];
        if (el.dataset.kind === "seg") el.setAttribute("d", arc(c, a0, a1, ri, ro));
        else if (el.dataset.kind === "band") el.setAttribute("d", arc(c, a0, a1, ro - g.band, ro));
        else {
          const mid = (a0 + a1) / 2;
          const rm = (ri + ro - g.band) / 2;
          const x = fx(c + rm * Math.sin(mid));
          const y = fx(c - rm * Math.cos(mid));
          el.setAttribute("x", x);
          el.setAttribute("y", y);
          el.setAttribute("transform", `rotate(${fx(labelTurn(mid))} ${x} ${y})`);
          el.setAttribute("visibility", labelFits(g, a0, a1, ri, ro - g.band, Number(el.dataset.chars)) ? "visible" : "hidden");
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
      const el = fig.querySelector(`[data-node="${CSS.escape(id)}"]`);
      const trail = id === "all" ? ["all"] : [...el.dataset.path.split(" "), id];
      crumbs.replaceChildren(
        ...trail.map((t, i) => {
          const label = (t === "all" ? fig.querySelector(".sb-centre") : fig.querySelector(`[data-kind="seg"][data-node="${CSS.escape(t)}"]`)).dataset.centreLabel;
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
      crumbs.hidden = false;
    }

    fig.addEventListener("click", (e) => {
      const seg = e.target.closest(".sb-seg--inner");
      if (seg) return zoom(seg.dataset.node);
      if (e.target.closest(".sb-centre") && current !== "all") {
        const el = fig.querySelector(`[data-kind="seg"][data-node="${CSS.escape(current)}"]`);
        zoom(el ? el.dataset.path.split(" ").pop() : "all");
      }
    });
    fig.addEventListener("keydown", (e) => {
      const seg = e.target.closest(".sb-seg--inner");
      if (seg && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        zoom(seg.dataset.node);
      }
    });
    zoom("all");
  }
})();
