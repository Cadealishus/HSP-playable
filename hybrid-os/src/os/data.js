// Mock data for the prototype. Nothing here touches the real file system.

const f = (name, size, modified, extra = {}) => ({ name, type: 'file', size, modified, ...extra });
const d = (name, children, extra = {}) => ({ name, type: 'folder', children, ...extra });

export const FS = d('Home', [
  d('Desktop', [f('HYBRID moodboard.png', '4.2 MB', 'Today 09:12'), f('todo.md', '2 KB', 'Yesterday')]),
  d('Documents', [
    f('HYBRID OS — Design Brief.pdf', '2.8 MB', 'Today 08:40'),
    f('Rocky Personality Spec.md', '14 KB', 'Yesterday'),
    f('Orbital Mechanics Notes.md', '22 KB', 'Oct 21'),
    f('Delta-v budget.xlsx', '88 KB', 'Oct 18'),
    d('Receipts', [f('GPU upgrade.pdf', '120 KB', 'Sep 30')]),
  ]),
  d('Downloads', [
    f('blender-4.2-windows-x64.zip', '312 MB', 'Oct 24'),
    f('neon-wallpaper-pack.zip', '96 MB', 'Oct 22'),
    f('Screenshot 2026-10-26 214512.png', '1.9 MB', 'Yesterday'),
    f('three.js-r170.zip', '41 MB', 'Oct 12'),
  ]),
  d('Projects', [
    d('HSP Lab', [
      d('parts', [f('manifest.json', '18 KB', 'Today 10:02'), d('models', [f('mk1-pod.glb', '640 KB', 'Oct 25'), f('lv-t45.glb', '1.1 MB', 'Oct 25')])]),
      f('index.html', '312 KB', 'Today 10:05'),
      f('orbit.js', '9 KB', 'Today 09:58'),
      f('vab.js', '24 KB', 'Yesterday'),
      f('README.md', '1 KB', 'Oct 26'),
    ], { project: 'hsp' }),
    d('Rocky Assistant', [
      d('src', [f('RockyBrain.cs', '12 KB', 'Yesterday'), f('OrbAvatar.xaml', '6 KB', 'Oct 23'), f('Hotkeys.cs', '3 KB', 'Oct 20')]),
      f('Rocky.sln', '2 KB', 'Oct 19'),
      f('personality.json', '4 KB', 'Yesterday'),
    ], { project: 'rocky' }),
    d('HYBRID Shell', [
      f('HybridShell.csproj', '3 KB', 'Today 11:20'),
      f('DockMagnifier.cs', '7 KB', 'Today 11:18'),
      f('App.xaml', '2 KB', 'Today 10:44'),
      f('README.md', '3 KB', 'Today 10:40'),
    ], { project: 'hybrid' }),
    d('Planet Forge', [f('terrain.glsl', '6 KB', 'Oct 22'), f('noise.js', '5 KB', 'Oct 22'), f('main.js', '11 KB', 'Oct 21'), f('package.json', '1 KB', 'Oct 14')], { project: 'planet' }),
  ]),
  d('Pictures', [
    f('Mun landing.png', '3.4 MB', 'Oct 20'),
    f('Aurora over lake.jpg', '6.1 MB', 'Oct 17'),
    f('Rocket render v3.png', '5.2 MB', 'Oct 15'),
    d('Wallpapers', [f('midnight-lake.png', '8.4 MB', 'Today'), f('nebula-rift.png', '7.9 MB', 'Today')]),
  ]),
  d('Music', [f('Night Drive — HYBRID Mix.m3u', '1 KB', 'Oct 12')]),
  d('Videos', [f('Booster catch replay.mp4', '220 MB', 'Oct 16'), f('HYBRID concept walkthrough.mp4', '480 MB', 'Today')]),
]);

export const RECYCLE = d('Recycle Bin', []);

export function nodeAt(path) {
  let node = FS;
  for (const seg of path) {
    const next = node.children && node.children.find((c) => c.name === seg && c.type === 'folder');
    if (!next) return null;
    node = next;
  }
  return node;
}

export function allFiles() {
  const out = [];
  const walk = (node, path) => {
    for (const c of node.children || []) {
      if (c.type === 'folder') {
        out.push({ ...c, path, isFolder: true });
        walk(c, [...path, c.name]);
      } else out.push({ ...c, path });
    }
  };
  walk(FS, []);
  return out;
}

export const RECENT_FILES = [
  { name: 'DockMagnifier.cs', path: ['Projects', 'HYBRID Shell'], when: '12 min ago' },
  { name: 'orbit.js', path: ['Projects', 'HSP Lab'], when: '1 hr ago' },
  { name: 'HYBRID OS — Design Brief.pdf', path: ['Documents'], when: 'Today' },
  { name: 'RockyBrain.cs', path: ['Projects', 'Rocky Assistant', 'src'], when: 'Yesterday' },
  { name: 'Mun landing.png', path: ['Pictures'], when: 'Oct 20' },
  { name: 'terrain.glsl', path: ['Projects', 'Planet Forge'], when: 'Oct 22' },
];

export const PROJECTS = [
  { id: 'hsp', name: 'HSP Lab', desc: 'Human Space Program · VAB + orbits', lang: 'JavaScript · Three.js', color: '#ff9d42', file: 'orbit.js', path: ['Projects', 'HSP Lab'], when: '1 hr ago', branch: 'main' },
  { id: 'hybrid', name: 'HYBRID Shell', desc: 'Windows 11 desktop environment', lang: 'C# · WinUI 3', color: '#5ef0ff', file: 'DockMagnifier.cs', path: ['Projects', 'HYBRID Shell'], when: '12 min ago', branch: 'dock-physics' },
  { id: 'rocky', name: 'Rocky Assistant', desc: 'Desktop AI companion', lang: 'C# · WPF', color: '#a47cff', file: 'RockyBrain.cs', path: ['Projects', 'Rocky Assistant'], when: 'Yesterday', branch: 'main' },
  { id: 'planet', name: 'Planet Forge', desc: 'Procedural planets in GLSL', lang: 'GLSL · Three.js', color: '#34e2a0', file: 'terrain.glsl', path: ['Projects', 'Planet Forge'], when: 'Oct 22', branch: 'biomes' },
];

export const TRACKS = [
  { title: 'Neon Horizon', artist: 'Kaito Arcs', album: 'Glasswave', dur: 222, art: ['#4fe3ff', '#7a3cff', '#0b0f36'] },
  { title: 'Low Orbit Lullaby', artist: 'Vela Drift', album: 'Apoapsis', dur: 245, art: ['#ff7ad9', '#6b4dff', '#140a2e'] },
  { title: 'Glass Mountains', artist: 'Lumen & Hale', album: 'Northlight', dur: 198, art: ['#9cf1ff', '#2a6bff', '#06132e'] },
  { title: 'Midnight Lake', artist: 'Aster Field', album: 'Still Water', dur: 271, art: ['#5affc8', '#2a8cff', '#03162a'] },
  { title: 'Gravity Assist', artist: 'Halcyon Run', album: 'Slingshot', dur: 236, art: ['#ffc06b', '#ff4f7b', '#2a0b1e'] },
  { title: 'Signal Lost', artist: 'Kaito Arcs', album: 'Glasswave', dur: 204, art: ['#c5a8ff', '#3d8bff', '#0d0b26'] },
];

export const CODE = {
  'orbit.js': `// HSP Lab — Keplerian propagation for on-rails craft
import { Vector3 } from 'three';

const MU_KERBOL = 1.1723328e18; // m^3/s^2

export function propagate(orbit, t) {
  const n = Math.sqrt(orbit.mu / orbit.a ** 3);
  let M = orbit.M0 + n * (t - orbit.epoch);
  let E = M; // solve Kepler's equation
  for (let i = 0; i < 8; i++) {
    E -= (E - orbit.e * Math.sin(E) - M) / (1 - orbit.e * Math.cos(E));
  }
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + orbit.e) * Math.sin(E / 2),
    Math.sqrt(1 - orbit.e) * Math.cos(E / 2)
  );
  const r = orbit.a * (1 - orbit.e * Math.cos(E));
  return new Vector3(r * Math.cos(nu), 0, r * Math.sin(nu))
    .applyEuler(orbit.rotation);
}

export const deltaV = (isp, wet, dry) => isp * 9.80665 * Math.log(wet / dry);`,
  'DockMagnifier.cs': `// HYBRID Shell — dock magnification, ported from the web concept
namespace Hybrid.Shell.Dock;

public sealed class DockMagnifier
{
    public double BaseSize { get; set; } = 52;
    public double Strength { get; set; } = 0.6;   // 0..1 from Control Center
    public double Range { get; set; } = 2.6;      // in icon widths

    public double ScaleFor(double iconCenter, double pointer)
    {
        var range = BaseSize * Range;
        var d = Math.Abs(pointer - iconCenter);
        if (d >= range) return 1.0;
        var falloff = (Math.Cos(Math.PI * d / range) + 1) / 2;
        return 1.0 + Strength * 0.9 * falloff;
    }

    // Native integration lives behind an interface so the
    // concept UI never touches the real Windows shell.
    public IShellBridge? Bridge { get; init; }
}`,
  'RockyBrain.cs': `// Rocky Assistant — intent routing (local, no cloud calls)
namespace Rocky.Core;

public record Intent(string Name, double Confidence);

public class RockyBrain
{
    private readonly Dictionary<string, string[]> _patterns = new()
    {
        ["open_app"]   = ["open", "launch", "start"],
        ["set_theme"]  = ["theme", "dark", "light", "stealth"],
        ["focus_mode"] = ["focus", "do not disturb", "quiet"],
        ["status"]     = ["cpu", "gpu", "performance", "ram"],
    };

    public Intent Classify(string text)
    {
        var lower = text.ToLowerInvariant();
        foreach (var (name, words) in _patterns)
            if (words.Any(lower.Contains))
                return new Intent(name, 0.82);
        return new Intent("smalltalk", 0.4);
    }
}`,
  'terrain.glsl': `// Planet Forge — ridged multifractal terrain
uniform float uSeed;
uniform float uSeaLevel;
varying vec3 vNormal;

float ridged(vec3 p) {
  float sum = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 6; i++) {
    float n = 1.0 - abs(snoise(p * freq + uSeed));
    sum += n * n * amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  float h = ridged(normalize(vNormal) * 1.6);
  vec3 sea = vec3(0.04, 0.18, 0.42);
  vec3 rock = mix(vec3(0.32, 0.28, 0.25), vec3(0.95), smoothstep(0.7, 0.9, h));
  gl_FragColor = vec4(h < uSeaLevel ? sea : rock, 1.0);
}`,
};

export const WEATHER = {
  city: 'Seattle',
  temp: 54,
  cond: 'Clear night',
  hi: 58,
  lo: 47,
  hours: [
    { t: 'Now', icon: 'moon', v: 54 },
    { t: '11P', icon: 'cloudmoon', v: 52 },
    { t: '12A', icon: 'cloud', v: 51 },
    { t: '1A', icon: 'rain', v: 49 },
    { t: '2A', icon: 'rain', v: 48 },
  ],
};
