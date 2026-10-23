# Rocky on the Windows desktop (beta)

Rocky without the robot: a small Rocky on your desktop (see-through around him, above other windows, draggable)
and a control window, both driven by the same brain as the physical robot. His personality, his Fish Audio voice
(`TTS_VOICE_ID 6dd07916890445e59c5f019ad0fc7879`), the model (Claude Haiku via OpenRouter) and his face packs are
the originals, untouched. A robot that connects later still works: the pet then mirrors it.

## Quick start: double-click

1. Install **Python 3.13** from python.org (tick "Add python.exe to PATH").
2. Double-click **`server\Start-Rocky.bat`**. The first run makes `server\.venv`, installs everything (a few
   minutes), and if there's no `server\.env` yet it copies `.env.example` and opens it in Notepad. It never
   overwrites an existing `.env`.
3. Put your keys in `server\.env`: `LLM_API_KEY` (OpenRouter), and `FISH_AUDIO_API_KEY` for his own voice.
4. Say **"hey Rocky"**. His first start downloads about 160 MB of speech models.

Leave the black console window open while he runs. Quit from his right-click menu or the tray icon.

## Or by hand, in PowerShell

```powershell
cd path\to\desk-robot\server
py -3.13 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt -r requirements-desktop.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }   # never overwrites yours
notepad .env                                                # LLM_API_KEY=..., FISH_AUDIO_API_KEY=...
.\.venv\Scripts\python desktop.py
```

Options: `--size small|medium|large|huge`, `--opaque`, `--no-brain`, `--open`, `--port 8770`.
In a browser instead: `.\.venv\Scripts\python launcher.py`, then <http://localhost:8766/> and
<http://localhost:8766/pet>.

## Using him

- **Drag** him anywhere. **Double-click** opens the control window. **Right-click**: microphone on/off, sleep or
  wake, always on top, size, hide, quit. The tray icon has the same menu, and its tooltip says how he is.
- Under his base, a small mark shows the microphone: "hearing you", or "mic off" when it's off.
- The control window is the dashboard: the conversation, Talk, the **Mic on/off** button, and **Voice** in the
  status row: "his own (Fish Audio)" or, in red, "computer's (fallback)" with the reason. The fallback is never
  passed off as his voice.
- His voice plays on Windows' default playback device.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Black box around him | `.\.venv\Scripts\python desktop.py --opaque`, or update your graphics driver |
| He never hears you | Settings > Privacy > Microphone > "Let desktop apps access your microphone". Pick the mic under Settings > "He listens through" in the control window |
| "Voice: computer's (fallback)" | `FISH_AUDIO_API_KEY` missing or wrong in `server\.env`; the reason is shown next to it |
| "Brain has no key" | `LLM_API_KEY` empty in `server\.env` |
| Windows Firewall asks about Python | That's the port the physical robot uses. Deny it if you have no robot: the desktop doesn't need it |
| Port 8766 is taken | `desktop.py --port 8770` |
| Something else | The control window's **Log** tab has the brain's output |

## What changed for Windows (and why)

- The dashboard is read as UTF-8 (Windows' default code page couldn't read it).
- The brain's output is UTF-8 through the launcher's pipe (a reply with an unusual character could fail mid-reply).
- The built-in fallback voice gets its file path through an environment variable (with `-Command`, PowerShell
  ignored the argument, so it never spoke).
- A mic picked by name opens once: Windows lists each mic under several audio systems with the same name, and
  sounddevice refused to choose.

Not yet tested on a real Windows PC: the see-through window, the tray, and microphone and speaker playback.
Built and checked on Linux with the real brain and the Qt windows offscreen.
