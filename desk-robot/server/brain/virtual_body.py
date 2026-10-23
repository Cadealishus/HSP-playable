"""A body on the computer screen: the desktop pet (server/desktop.py, brain/pet.html).

It gets the same messages the robot gets (docs/protocol.md), so it shows what the brain decided and nothing else:
the face the reply's emotion tag picked, sleep and wake, the head's pan and tilt (body language, `look`, a dance),
the mouth's loudness while his voice plays on this computer, and the face pack. Nothing here decides anything.

Any number of pages can watch at once (the pet, the dashboard). Each gets a queue; the brain's server streams it to
the page as server-sent events (eyes.py, /events). While at least one watches, the brain treats it as a body: body
language and dancing play on it as they would on the robot. The robot, when it connects, gets everything as before.
"""

from __future__ import annotations

import queue
import threading
import time

# What a screen body can show. Everything else for the robot (audio, camera, clock settings, volume) isn't for it.
KINDS = ("emotion", "asleep", "pan", "tilt", "mouth", "face", "motion")
MAX_BACKLOG = 200   # a page that stops reading (closed, frozen) is dropped instead of piling up messages


class VirtualBody:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._watchers: set[queue.Queue] = set()
        # the latest of each kind, so a page that connects now starts where the robot would be
        self.state: dict = {"emotion": "neutral", "asleep": True, "pan": 0.0, "tilt": 0.0, "mouth": -1.0,
                            "face": None}
        self.sent = 0

    @property
    def attached(self) -> bool:
        """A pet (or another page) is watching."""
        with self._lock:
            return bool(self._watchers)

    def send(self, payload: dict) -> bool:
        """A message for the robot. Shown if it's for a screen body; True if anyone was watching."""
        kind = payload.get("type")
        if kind not in KINDS:
            return False
        msg = {k: v for k, v in payload.items() if k != "save"}
        with self._lock:
            if kind == "emotion":
                self.state["emotion"] = msg.get("name", self.state["emotion"])
            elif kind == "asleep":
                self.state["asleep"] = bool(msg.get("on"))
            elif kind in ("pan", "tilt"):
                self.state[kind] = msg.get("deg", self.state[kind])
            elif kind == "mouth":
                self.state["mouth"] = msg.get("level", -1.0)
            elif kind == "face":
                self.state["face"] = msg.get("pack")
            watchers = list(self._watchers)
            self.sent += 1
        for q in watchers:
            if q.qsize() > MAX_BACKLOG:
                self.detach(q)
                continue
            q.put(msg)
        return bool(watchers)

    def attach(self) -> queue.Queue:
        """A new watcher: its queue starts with a `hello` holding the current state."""
        q: queue.Queue = queue.Queue()
        with self._lock:
            q.put({"type": "hello", "at": time.time(), **self.state})
            self._watchers.add(q)
        return q

    def detach(self, q: queue.Queue) -> None:
        with self._lock:
            self._watchers.discard(q)

    def watchers(self) -> int:
        with self._lock:
            return len(self._watchers)
