# HYBRID OS — interactive desktop concept

A clickable, animated prototype of the HYBRID desktop environment: the visual blueprint for a
future custom Windows 11 shell. Everything runs in the browser and is simulated; nothing touches
Windows or your files.

Open `dist/hybrid-os.html` (published as a Claude artifact), or rebuild it:

```
npm install
npm run build      # → dist/hybrid-os.html (React from cdnjs) + build/test.html (self-contained)
```

## What works
- **Two desktop modes**: HYBRID (menu bar, floating dock, widgets) and a Windows 11 simulation
  (taskbar, Start menu, Quick Settings, desktop shortcuts). Switch with **Ctrl+Alt+M**, the
  Control Center, the HYBRID menu, the Windows Start power menu, or the HYBRID taskbar button.
- **Window manager**: open, focus, drag, 8-way resize, snap by dragging to the left/right/top edge.
  Maximize in HYBRID mode is true full screen: the menu bar and dock tuck away and return when the
  pointer rests on the top or bottom edge. Also minimize to the dock/taskbar, close. Windows persist across modes.
- **Dock**: hidden until the pointer rests on the bottom edge (turn off auto-hide to pin it), cosine-falloff magnification, tooltips, running indicators, bounce on launch,
  right-click menus, auto-hide, left/bottom/right placement.
- **Spotlight** (Ctrl+Space or Ctrl+K): apps, files, projects and system commands, keyboard nav.
- **Control Center**: Wi-Fi, Bluetooth, Focus, dark/light, night light, airplane, brightness,
  volume, live performance, theme, accent, wallpaper, glass transparency, animation intensity, dock.
- **Themes**: Aurora, Stealth, Daylight, plus 6 accents. **Wallpapers**: four photos embedded from `src/assets/`; the Windows bloom is drawn on canvas.
- **Apps**: File Explorer, Terminal (help, neofetch, ls/cd, theme, mode, open…), HYBRID Settings,
  Edge (new-tab mock), VS Code (highlighted samples), Discord, Spotify (shared with the widget),
  Blender (orbitable 3D rocket), About.
- **Rocky AI**: desktop companion orb and chat panel. Replies are scripted, but commands like
  “stealth theme” or “open terminal” really drive the prototype.

## Simulated
Files, performance numbers, weather, battery, music, chat, web pages and Rocky's replies are demo data.

## Layout
- `src/os/` — state store + window reducer, themes, app registry, mock data, search, live sims
- `src/hybrid/` — menu bar, dock, widgets, launcher
- `src/windows/` — taskbar, Start menu, Quick Settings, desktop icons
- `src/shell/` — desktop composition, window layer, Spotlight, Control Center, Rocky, overlays
- `src/apps/` — window contents
- `src/components/` — wallpaper renderer, icons, shared controls
