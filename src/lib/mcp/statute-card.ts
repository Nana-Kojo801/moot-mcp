// MCP Apps view for list_laws: a small Statute Book card that supporting hosts render
// inline next to the tool result. Self-contained HTML (no external requests), so it
// works under the default MCP Apps content security policy.

export const STATUTE_CARD_URI = "ui://moot/statute-book";

export const STATUTE_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Statute Book</title>
<style>
  :root { --bench:#1E4D3B; --paper:#E6EDE8; --ink:#101A16; --rule:rgba(16,26,22,.18); --dim:rgba(16,26,22,.68); --stamp:#C0262C; --brass:#C9A227; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.45 system-ui, sans-serif; }
  main { padding: 14px 16px 16px; border-top: 6px solid var(--bench); }
  h1 { font: 700 1.25rem/1.2 "Zilla Slab", Rockwell, "Roboto Slab", Georgia, serif; margin: 0 0 2px; }
  .intro { margin: 0 0 8px; color: var(--dim); font-size: .85rem; }
  .act { display: grid; grid-template-columns: 3.6rem 1fr; gap: 2px 6px; padding: 10px 0; border-top: 1px solid var(--rule); }
  .no { font: 500 .8rem ui-monospace, "Spline Sans Mono", monospace; color: var(--dim); padding-top: 3px; }
  .gone .no { text-decoration: line-through; }
  .title { font: 700 1.02rem/1.25 "Zilla Slab", Rockwell, "Roboto Slab", Georgia, serif; }
  .meta, .penalty { grid-column: 2; font-size: .8rem; color: var(--dim); margin: 0; }
  .text { grid-column: 2; margin: 2px 0 0; font-size: .88rem; max-width: 62ch; }
  .empty { color: var(--dim); }
</style>
</head>
<body>
<main>
  <h1>The Statute Book</h1>
  <p class="intro" id="intro">Waiting for the Clerk…</p>
  <div id="acts"></div>
</main>
<script>
(function () {
  var nextId = 0, pending = {};
  function send(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = ++nextId;
    send({ jsonrpc: "2.0", id: id, method: method, params: params });
    return new Promise(function (resolve) { pending[id] = resolve; });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function render(result) {
    var data = result && result.structuredContent;
    if (!data && result && result.content) {
      try { data = JSON.parse(result.content.map(function (c) { return c.text || ""; }).join("")); } catch (e) { data = null; }
    }
    var laws = (data && data.laws) || [];
    var acts = document.getElementById("acts");
    acts.textContent = "";
    document.getElementById("intro").textContent = laws.length
      ? laws.length + (laws.length === 1 ? " act" : " acts") + ", newest first."
      : "No acts on the books yet.";
    laws.forEach(function (l) {
      var row = el("div", "act" + (l.status && l.status !== "in_force" ? " gone" : ""));
      row.appendChild(el("span", "no", "Act " + l.number));
      row.appendChild(el("span", "title", l.title));
      var bits = [l.schedule, "Enacted " + l.enacted_on];
      if (l.status === "expired") bits.push("Lapsed");
      else if (l.status === "repealed") bits.push("Repealed");
      else if (l.expires_on) bits.push("Lapses " + l.expires_on);
      row.appendChild(el("p", "meta", bits.filter(Boolean).join(" · ")));
      if (l.statute_text) row.appendChild(el("p", "text", l.statute_text));
      if (l.penalty) row.appendChild(el("p", "penalty", "Penalty: " + l.penalty));
      acts.appendChild(row);
    });
  }
  window.addEventListener("message", function (event) {
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && pending[m.id] && !m.method) { pending[m.id](m.result); delete pending[m.id]; return; }
    if (m.method === "ui/notifications/tool-result") render(m.params);
    if (m.method === "ui/resource-teardown" && m.id != null) send({ jsonrpc: "2.0", id: m.id, result: {} });
  });
  request("ui/initialize", {
    appInfo: { name: "moot-statute-book", version: "0.1.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26"
  }).then(function () {
    send({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
  });
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      send({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: document.documentElement.scrollHeight } });
    }).observe(document.body);
  }
})();
</script>
</body>
</html>`;
