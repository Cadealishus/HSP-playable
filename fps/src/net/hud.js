/**
 * NET — the in-game party overlay: the teammate list (health, downed, host),
 * the centre notice ("HOST LEFT — MIGRATING"), and the downed card.
 *
 * Plain DOM over the HUD, same type and palette as src/ui (Barlow Condensed /
 * Inter, the amber accent). Built once; `render(view)` only writes text and
 * widths when they change, so it costs nothing per frame.
 */

const CSS = `
.fo-net { position:fixed; inset:0; pointer-events:none; z-index:40; font-family:"Barlow Condensed","Inter",system-ui,sans-serif;
  color:#e9e4d6; text-transform:uppercase; letter-spacing:.06em; }
.fo-net-party { position:absolute; left:18px; top:34%; min-width:190px; display:none; }
.fo-net-head { font-size:12px; font-weight:600; color:#c9a24a; margin-bottom:6px; text-shadow:0 1px 2px #000a; }
.fo-net-row { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:600; margin:3px 0; text-shadow:0 1px 2px #000c; }
.fo-net-row .nm { flex:0 0 auto; max-width:120px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.fo-net-row .bar { flex:1 1 auto; height:4px; background:#0008; min-width:50px; position:relative; }
.fo-net-row .bar i { position:absolute; left:0; top:0; bottom:0; background:#7fb2ff; }
.fo-net-row .tag { font-size:11px; color:#c9a24a; }
.fo-net-row.down .nm { color:#ff7a5c; }
.fo-net-row.down .bar i { background:#ff7a5c; }
.fo-net-row.me .nm { color:#fff; }
.fo-net-note { position:absolute; left:50%; top:16%; transform:translateX(-50%); font-size:22px; font-weight:700; color:#ffcf6a;
  background:#000a; padding:6px 16px; display:none; text-shadow:0 1px 3px #000; white-space:nowrap; }
.fo-net-down { position:absolute; left:50%; top:58%; transform:translateX(-50%); text-align:center; display:none; }
.fo-net-down b { display:block; font-size:34px; font-weight:700; color:#ff7a5c; text-shadow:0 2px 6px #000; }
.fo-net-down span { display:block; font-size:15px; font-weight:600; color:#e9e4d6; margin-top:4px; text-shadow:0 1px 3px #000; }
`;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export class NetHud {
  constructor() {
    this.ok = typeof document !== 'undefined';
    if (!this.ok) return;
    const st = el('style', null, document.head);
    st.textContent = CSS;
    this.root = el('div', 'fo-net', document.body);
    this.party = el('div', 'fo-net-party', this.root);
    this.head = el('div', 'fo-net-head', this.party);
    this.rows = [];
    for (let i = 0; i < 4; i++) {
      const r = el('div', 'fo-net-row', this.party);
      r._nm = el('span', 'nm', r);
      const bar = el('span', 'bar', r);
      r._bar = el('i', null, bar);
      r._tag = el('span', 'tag', r);
      r.style.display = 'none';
      this.rows.push(r);
    }
    this.note = el('div', 'fo-net-note', this.root);
    this.down = el('div', 'fo-net-down', this.root);
    this.downTitle = el('b', null, this.down);
    this.downSub = el('span', null, this.down);
    this._cache = new Map();
  }

  _set(node, key, value, fn) {
    const k = node;
    let c = this._cache.get(k);
    if (!c) this._cache.set(k, (c = {}));
    if (c[key] === value) return;
    c[key] = value;
    fn(value);
  }

  /**
   * view = { show, head, players:[{name, hp, down, host, me, tag}], note, downed:{title, sub}|null }
   */
  render(view) {
    if (!this.ok) return;
    this._set(this.party, 'd', view.show ? '' : 'none', (v) => (this.party.style.display = v || 'block'));
    if (view.show) {
      this._set(this.head, 't', view.head, (v) => (this.head.textContent = v));
      for (let i = 0; i < this.rows.length; i++) {
        const r = this.rows[i];
        const p = view.players[i];
        this._set(r, 'd', p ? 'flex' : 'none', (v) => (r.style.display = v));
        if (!p) continue;
        this._set(r, 'n', p.name, (v) => (r._nm.textContent = v));
        this._set(r, 'h', Math.round(p.hp * 100), (v) => (r._bar.style.width = `${v}%`));
        this._set(r, 'g', p.tag, (v) => (r._tag.textContent = v));
        this._set(r, 'c', `fo-net-row${p.down ? ' down' : ''}${p.me ? ' me' : ''}`, (v) => (r.className = v));
      }
    }
    this._set(this.note, 't', view.note || '', (v) => {
      this.note.textContent = v;
      this.note.style.display = v ? 'block' : 'none';
    });
    const d = view.downed;
    this._set(this.down, 't', d ? `${d.title}|${d.sub}` : '', () => {
      this.down.style.display = d ? 'block' : 'none';
      if (d) {
        this.downTitle.textContent = d.title;
        this.downSub.textContent = d.sub;
      }
    });
  }

  dispose() {
    this.root?.remove();
  }
}
