import { saveSession, DIFFICULTY, DIFFICULTIES, SETTINGS_KEY } from '../game/session.js';

/**
 * LAUNCHER — the pre-boot menu. Plain DOM, shown BEFORE the engine initialises,
 * so the player picks mode → map → options in a second instead of waiting for
 * the default map, the AI nav and every shader to build first. Confirm stores
 * the session as `pending` and reloads; the next boot builds only that map and
 * shows the deploy card (one click: pointer lock needs a user gesture).
 *
 * "Full menu" boots the classic in-game menu (online party, loadout, settings).
 */
const MODES = [
  { id: 'survival', kind: 'survival', label: 'SURVIVAL', blurb: 'Hold out against escalating waves. Command expects you to win eventually.' },
  { id: 'tdm', kind: 'mp', label: 'TEAM DEATHMATCH', blurb: 'ESF against hostiles, bots on both sides. First team to the limit.' },
  { id: 'dom', kind: 'mp', label: 'DOMINATION', blurb: 'Hold A, B and C. Standing on a letter is the strategy.' },
  { id: 'hp', kind: 'mp', label: 'HARDPOINT', blurb: 'One rotating zone. Be inside it, alive.' },
  { id: 'sd', kind: 'mp', label: 'SEARCH & DESTROY', blurb: 'Plant or defuse. One life per round.' },
  { id: 'ffa', kind: 'mp', label: 'FREE FOR ALL', blurb: 'Everyone is hostile. Doug finds this clarifying.' },
  { id: 'kc', kind: 'mp', label: 'KILL CONFIRMED', blurb: 'Kills only count once you collect the tag.' },
  { id: 'gun', kind: 'mp', label: 'GUN GAME', blurb: 'Every kill swaps your gun. Knife kills set the victim back.' },
  { id: 'mission', kind: 'mission', label: 'SPECIAL OPS', blurb: 'Scripted single-player missions with their own maps.' },
];
const MISSIONS = [
  { id: 'underground', label: 'LAST TRAIN', map: 'underground', blurb: 'Subway complex. Restore power, clear the platforms, extract.' },
  { id: 'flight717', label: 'FLIGHT 717', map: 'airport', blurb: 'A hijacked airliner on the apron. Mind the passengers.' },
  { id: 'hostage', label: 'HOSTAGE TAKER', map: 'estate', blurb: 'Night compound. One precise shot, then get the VIP out.' },
];
const QUALITY = [
  { id: 'low', label: 'LOW', blurb: 'Half-size textures, fastest load' },
  { id: 'medium', label: 'MEDIUM', blurb: '¾ textures' },
  { id: 'high', label: 'HIGH', blurb: 'Full textures' },
  { id: 'ultra', label: 'ULTRA', blurb: 'Full textures, all effects' },
];

export function launcherWanted(params, session) {
  if (session.pending || session.autostart) return false;
  if (params.get('capture') === '1' || params.get('launcher') === '0') return false;
  if (params.has('map') || params.has('mode') || params.has('mission')) return false;
  try {
    if (localStorage.getItem('flopops.party')) return false; // resuming an online party
    if (sessionStorage.getItem('flopops.fullmenu') === '1') {
      sessionStorage.removeItem('flopops.fullmenu');
      return false;
    }
  } catch {}
  return true;
}

/** Show the launcher. Resolves only for "full menu"; a match launch reloads. */
export function showLauncher({ session, maps }) {
  injectStyle();
  const bootEl = document.getElementById('boot');
  if (bootEl) bootEl.style.visibility = 'hidden';
  const root = document.createElement('div');
  root.id = 'launcher';
  document.body.append(root);

  const st = {
    mode: MODES.some((m) => m.id === session.mode) ? session.mode : 'survival',
    map: session.map,
    mission: session.mission ?? 'underground',
    difficulty: session.difficulty ?? 'regular',
    quality: readQuality(),
    step: 0,
  };
  const modeDef = () => MODES.find((m) => m.id === st.mode);
  const mapsFor = (mode) => maps.filter((m) => !m.missionOnly && (m.modes ?? []).includes(mode));

  return new Promise((resolve) => {
    const render = () => {
      const md = modeDef();
      const isMission = md.kind === 'mission';
      const avail = isMission ? [] : mapsFor(st.mode);
      if (!isMission && !avail.some((m) => m.id === st.map)) st.map = avail[0]?.id ?? 'town';
      const mapName = isMission ? MISSIONS.find((x) => x.id === st.mission)?.label : maps.find((m) => m.id === st.map)?.name;
      root.innerHTML = `
        <div class="lx-wrap">
          <header class="lx-head"><div class="lx-brand">FLOP OPS</div><div class="lx-sub">EXTRA SPECIAL FORCES · MATCH SETUP</div></header>
          <nav class="lx-steps">${['MODE', isMission ? 'MISSION' : 'MAP', 'OPTIONS'].map((s, i) => `<button class="lx-step${st.step === i ? ' on' : ''}" data-step="${i}">${i + 1}. ${s}</button>`).join('')}</nav>
          <section class="lx-body">${[stepMode, stepMap, stepOptions][st.step](isMission, avail)}</section>
          <footer class="lx-foot">
            <div class="lx-summary">${md.label} · ${mapName ?? '—'} · ${DIFFICULTY[st.difficulty].label} · ${st.quality.toUpperCase()}</div>
            <button class="lx-ghost" data-act="full">FULL MENU (ONLINE · LOADOUT · SETTINGS)</button>
            ${st.step < 2 ? '<button class="lx-go" data-act="next">NEXT</button>' : '<button class="lx-go" data-act="deploy">CONFIRM &amp; LOAD</button>'}
          </footer>
          <p class="lx-note">Only the selected map and mode load after you confirm.</p>
        </div>`;
      root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { st.step = +b.dataset.step; render(); }));
      root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
        st[b.dataset.pick] = b.dataset.id;
        if (b.dataset.pick === 'mode' || b.dataset.pick === 'map' || b.dataset.pick === 'mission') st.step = Math.min(2, st.step + 1);
        render();
      }));
      root.querySelector('[data-act=next]')?.addEventListener('click', () => { st.step++; render(); });
      root.querySelector('[data-act=deploy]')?.addEventListener('click', () => launch());
      root.querySelector('[data-act=full]').addEventListener('click', () => {
        root.remove();
        if (bootEl) bootEl.style.visibility = '';
        resolve('full');
      });
    };

    const stepMode = () => `<div class="lx-grid">${MODES.map((m) => card('mode', m.id, m.label, m.blurb, st.mode === m.id)).join('')}</div>`;
    const stepMap = (isMission, avail) =>
      isMission
        ? `<div class="lx-grid">${MISSIONS.map((m) => card('mission', m.id, m.label, m.blurb, st.mission === m.id)).join('')}</div>`
        : `<div class="lx-grid">${avail.map((m) => card('map', m.id, m.name, `${m.subtitle ?? ''}`, st.map === m.id)).join('')}</div>`;
    const stepOptions = () => `
      <h3 class="lx-h">DIFFICULTY</h3>
      <div class="lx-grid four">${DIFFICULTIES.map((d) => card('difficulty', d, DIFFICULTY[d].label, DIFFICULTY[d].blurb, st.difficulty === d)).join('')}</div>
      <h3 class="lx-h">GRAPHICS QUALITY</h3>
      <div class="lx-grid four">${QUALITY.map((q) => card('quality', q.id, q.label, q.blurb, st.quality === q.id)).join('')}</div>`;

    const launch = () => {
      const md = modeDef();
      const mission = md.kind === 'mission' ? MISSIONS.find((x) => x.id === st.mission) : null;
      const next = {
        ...session,
        kind: md.kind,
        mode: md.kind === 'mission' ? null : md.id,
        mission: mission?.id ?? null,
        map: mission?.map ?? st.map,
        difficulty: st.difficulty,
        pending: true,
      };
      writeQuality(st.quality);
      saveSession(next);
      root.querySelector('.lx-wrap').innerHTML = '<div class="lx-brand">LOADING</div><div class="lx-sub">Building only what this match needs…</div>';
      location.reload();
    };
    render();
  });
}

function card(pick, id, title, blurb, on) {
  return `<button class="lx-card${on ? ' on' : ''}" data-pick="${pick}" data-id="${id}"><span class="lx-t">${title}</span><span class="lx-b">${blurb ?? ''}</span></button>`;
}

function readQuality() {
  try {
    const q = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').quality;
    return ['low', 'medium', 'high', 'ultra'].includes(q) ? q : 'high';
  } catch {
    return 'high';
  }
}
function writeQuality(q) {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    s.quality = q;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

/** "Full menu" boots the classic in-game menu once (the online lobby lives there). */
export function requestFullMenu() {
  try { sessionStorage.setItem('flopops.fullmenu', '1'); } catch {}
}

function injectStyle() {
  if (document.getElementById('launcher-css')) return;
  const s = document.createElement('style');
  s.id = 'launcher-css';
  s.textContent = `
  #launcher{position:fixed;inset:0;z-index:50;overflow:auto;background:radial-gradient(120% 90% at 30% 0%,#2a2620 0%,#121212 55%,#0b0b0b 100%);color:#ece6da;font:15px/1.45 'Barlow',system-ui,sans-serif}
  .lx-wrap{max-width:1100px;margin:0 auto;padding:clamp(18px,4vw,48px) 16px;display:grid;gap:18px}
  .lx-brand{font:700 clamp(34px,6vw,64px)/0.95 'Barlow Condensed','Arial Narrow',sans-serif;letter-spacing:.04em}
  .lx-sub{font:600 13px 'Barlow Condensed',sans-serif;letter-spacing:.3em;color:#a39e94}
  .lx-steps{display:flex;gap:6px;flex-wrap:wrap}
  .lx-step{background:none;border:0;border-bottom:2px solid #333;color:#a39e94;font:600 15px 'Barlow Condensed',sans-serif;letter-spacing:.14em;padding:8px 12px;cursor:pointer}
  .lx-step.on{color:#ece6da;border-color:#e2a23b}
  .lx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
  .lx-grid.four{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
  .lx-card{display:grid;gap:4px;text-align:left;background:rgba(22,22,20,.86);border:1px solid rgba(255,255,255,.09);border-top:3px solid rgba(255,255,255,.12);color:#ece6da;padding:14px;cursor:pointer;font:inherit}
  .lx-card:hover{border-color:rgba(226,162,59,.6)}
  .lx-card.on{border-color:#e2a23b;background:rgba(40,34,24,.92)}
  .lx-t{font:600 21px 'Barlow Condensed',sans-serif;letter-spacing:.06em}
  .lx-b{font-size:13.5px;color:#a39e94}
  .lx-h{font:600 14px 'Barlow Condensed',sans-serif;letter-spacing:.24em;color:#a39e94;margin:6px 0 0}
  .lx-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:center;border-top:1px solid #2b2b2b;padding-top:14px}
  .lx-summary{flex:1 1 280px;font:600 15px 'Barlow Condensed',sans-serif;letter-spacing:.12em}
  .lx-go,.lx-ghost{font:700 16px 'Barlow Condensed',sans-serif;letter-spacing:.14em;padding:11px 18px;cursor:pointer;border:1px solid #e2a23b}
  .lx-go{background:#e2a23b;color:#141210}
  .lx-ghost{background:none;color:#ece6da;border-color:#444;font-size:13px}
  .lx-note{font-size:12.5px;color:#7d786f;margin:0}
  .lx-card:focus-visible,.lx-go:focus-visible,.lx-ghost:focus-visible,.lx-step:focus-visible{outline:2px solid #e2a23b;outline-offset:2px}`;
  document.head.append(s);
}
