"""Which of this computer's sound devices a name means.

On Windows every microphone is listed several times, once per audio system PortAudio speaks (MME, DirectSound,
WASAPI, WDM-KS), under the same name. Asked for that name, sounddevice finds them all and refuses to choose
("Multiple input devices found"), so a mic picked in the dashboard was never opened: Ears fell back to the default
and reported the chosen one as unplugged. Here a name that matches only copies of one device picks the copy on the
default audio system (MME on Windows, which converts to the 16 kHz the ears ask for), else the next best. Names that
match different devices are left as they were, so sounddevice says so as before. A Mac lists each device once:
nothing changes there.
"""

from __future__ import annotations

# The audio systems to prefer, after the default one: the first two convert any sample rate for us.
_PREFERRED = ("MME", "Windows DirectSound", "Windows WASAPI", "Windows WDM-KS")


def input_device(wanted, devices=None, hostapis=None, default_hostapi=None):
    """The device index to open for `wanted` (a name, or part of one), or `wanted` unchanged when it isn't a name,
    matches nothing, or matches more than one different device (sounddevice then reports it, as it always has)."""
    if not isinstance(wanted, str) or not wanted.strip():
        return wanted
    if devices is None or hostapis is None or default_hostapi is None:
        import sounddevice as sd
        devices = sd.query_devices() if devices is None else devices
        hostapis = sd.query_hostapis() if hostapis is None else hostapis
        default_hostapi = sd.default.hostapi if default_hostapi is None else default_hostapi
    name = wanted.strip().lower()
    inputs = [(i, d) for i, d in enumerate(devices) if d["max_input_channels"] > 0]
    pool = [(i, d) for i, d in inputs if d["name"].strip().lower() == name] \
        or [(i, d) for i, d in inputs if name in d["name"].lower()]
    if not pool or len({d["name"].strip().lower() for _, d in pool}) > 1:
        return wanted
    if len(pool) == 1:
        return pool[0][0]

    def rank(item):
        api = item[1]["hostapi"]
        if api == default_hostapi:
            return -1
        api_name = hostapis[api]["name"] if 0 <= api < len(hostapis) else ""
        return _PREFERRED.index(api_name) if api_name in _PREFERRED else len(_PREFERRED)

    return min(pool, key=rank)[0]


def input_names(devices, default_device, default_hostapi) -> list[dict]:
    """This computer's mics for the dashboard's picker, each once: [{"name", "default"}]. A device listed under
    several audio systems (Windows) shows the copy on the default one."""
    out, seen = [], set()
    ordered = sorted(enumerate(devices), key=lambda x: x[1]["hostapi"] != default_hostapi)
    for i, d in ordered:
        if d["max_input_channels"] <= 0:
            continue
        key = d["name"].strip().lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": d["name"], "default": i == default_device})
    return out
