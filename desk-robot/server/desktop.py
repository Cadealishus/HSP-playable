"""Rocky on the desktop: the desk robot without the robot, for Windows (it runs on macOS and Linux too).

    .venv\\Scripts\\python desktop.py            (from server/, after pip install -r requirements-desktop.txt)

Two windows around the same brain:
  - the pet: Rocky's V2 body, small, see-through around him, above other windows, draggable. His face and moves come
    from the brain exactly as the robot would get them (brain/pet.html, brain/virtual_body.py). Right-click him for
    the menu; double-click opens the control window. He never takes keyboard focus.
  - the control window: the dashboard (brain/dashboard.html, the launcher's page): talk, the conversation, his
    microphone, which voice is speaking, settings, personalities, face packs and the log.

Nothing about Rocky lives here. This file starts the launcher's web server (launcher.py) and the brain
(`python -m brain.main`, as the launcher's Start button does) and shows their pages; quitting stops both. If a
launcher is already running on the port, it uses that one. A physical robot still connects the usual way, and then
the pet mirrors it.

Options: --size small|medium|large|huge, --opaque (a dark box instead of a see-through window, if your graphics
driver shows black around him), --no-brain (don't start the brain), --port N.

The pet's place, size and "always on top" are kept with Qt's settings (QSettings: the registry on Windows), not in
server/settings.json: they're about this desktop, not about Rocky.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import launcher  # noqa: E402  (standard library only; also loads server/.env into this process, never writes it)

SIZES = {"small": 0.5, "medium": 0.75, "large": 1.0, "huge": 1.5}   # x the page's 270 x 404 drawing
PET_W, PET_H = 270, 404


# ── talking to the launcher (plain HTTP on this computer, like the dashboard page does) ──────────────────────────

class Server:
    def __init__(self, port: int) -> None:
        self.port = port
        self.base = f"http://127.0.0.1:{port}"

    def get(self, path: str, timeout: float = 3.0):
        req = urllib.request.Request(self.base + path, headers={"Host": f"localhost:{self.port}"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")

    def post(self, path: str, body: dict | None = None, timeout: float = 10.0):
        req = urllib.request.Request(self.base + path, data=json.dumps(body or {}).encode(), method="POST",
                                     headers={"Host": f"localhost:{self.port}", "X-Rocky-Console": "1",
                                              "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")

    def post_soon(self, path: str, body: dict | None = None) -> None:
        """Fire and forget, off the UI thread (the brain may take a moment)."""
        def go():
            try:
                self.post(path, body)
            except Exception as e:   # the server stopped, or said no: the page and the log say why
                print(f"(desktop: {path} failed: {e})")
        threading.Thread(target=go, daemon=True).start()


def start_servers(port: int, start_brain: bool) -> tuple[Server, object | None]:
    """The launcher's web server on `port` (or the one already there), and the brain. Returns the server handle and
    the http server we started (None if one was running already)."""
    srv = None
    try:
        srv = launcher.make_server(port)
    except OSError:
        try:
            Server(port).get("/launcher/state")
            print(f"a launcher is already running on port {port}: using it")
        except Exception:
            raise SystemExit(f"port {port} is taken by something else: try --port 8770")
    if srv is not None:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        print(f"{launcher.config.ROBOT_NAME} dashboard: http://localhost:{port}/  (this computer only)")
    if start_brain:
        if srv is not None:
            print(f"starting the brain: {launcher.brain.start()}")
        else:
            try:
                Server(port).post("/launcher/start")
            except Exception as e:
                print(f"(couldn't start the brain through the running launcher: {e})")
    return Server(port), srv


def preflight() -> list[str]:
    """What's missing for Rocky to think and to speak in his own voice. Names only: a key's value is never read
    out or printed."""
    problems = []
    if not launcher.config._ENV_FILE.is_file():
        problems.append("server\\.env is missing: copy .env.example to .env and add your keys")
    if not launcher.env_value("LLM_API_KEY"):
        problems.append("LLM_API_KEY is empty in server\\.env: Rocky can't think until it's set")
    if not launcher.env_value("FISH_AUDIO_API_KEY"):
        problems.append("FISH_AUDIO_API_KEY is empty: this computer's voice stands in for Rocky's own")
    return problems


# ── the windows ─────────────────────────────────────────────────────────────────────────────────────────────────

def run(args) -> int:
    from PySide6.QtCore import QPoint, QSettings, Qt, QTimer, QUrl, QStandardPaths
    from PySide6.QtGui import QAction, QActionGroup, QColor, QDesktopServices, QIcon, QPainter, QPixmap
    from PySide6.QtWebEngineCore import QWebEnginePage
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWidgets import QApplication, QMainWindow, QMenu, QSystemTrayIcon, QVBoxLayout, QWidget

    server, httpd = start_servers(args.port, not args.no_brain)
    page_url = f"http://localhost:{args.port}"
    name = launcher.config.ROBOT_NAME

    app = QApplication(sys.argv)
    app.setApplicationName(f"{name} desktop")
    app.setOrganizationName("desk-robot")
    app.setQuitOnLastWindowClosed(False)       # closing the control window leaves the pet; Quit ends it all
    prefs = QSettings()

    def rocky_icon() -> QIcon:
        """His head, small: the black box and two white eyes (for the tray and the window)."""
        pm = QPixmap(64, 64)
        pm.fill(Qt.transparent)
        p = QPainter(pm)
        p.setRenderHint(QPainter.Antialiasing)
        p.setBrush(QColor("#17181a")); p.setPen(Qt.NoPen)
        p.drawRoundedRect(2, 12, 60, 40, 4, 4)
        p.setBrush(QColor("#050506")); p.drawRect(14, 18, 44, 28)
        p.setBrush(QColor("#eef1f3"))
        p.drawRoundedRect(20, 23, 14, 17, 5, 5); p.drawRoundedRect(38, 23, 14, 17, 5, 5)
        p.end()
        return QIcon(pm)

    icon = rocky_icon()
    app.setWindowIcon(icon)

    class Page(QWebEnginePage):
        """Only our own pages inside; links to anywhere else open in the normal browser."""
        def acceptNavigationRequest(self, url, nav_type, is_main_frame):
            if url.host() in ("localhost", "127.0.0.1") and url.port() == args.port:
                return True
            if url.scheme() in ("http", "https"):
                QDesktopServices.openUrl(url)
            return False

        def createWindow(self, _type):      # target=_blank: a page whose first navigation goes to the browser (above)
            return Page(self.profile(), self)

    # ── the control window: the dashboard ──
    class Control(QMainWindow):
        def __init__(self) -> None:
            super().__init__()
            self.setWindowTitle(f"{name} · desk robot")
            self.resize(1180, 860)
            self.view = QWebEngineView(self)
            self.view.setPage(Page(self.view))
            self.view.page().profile().downloadRequested.connect(self._download)   # Export a pack or a personality
            self.view.load(QUrl(page_url + "/"))
            self.setCentralWidget(self.view)
            self.told_tray = False

        def _download(self, item) -> None:
            folder = QStandardPaths.writableLocation(QStandardPaths.DownloadLocation)
            item.setDownloadDirectory(folder)
            item.accept()
            tray.showMessage(name, f"Saved {item.downloadFileName()} in {folder}", icon, 4000)

        def open(self) -> None:
            self.show(); self.raise_(); self.activateWindow()

        def closeEvent(self, ev) -> None:   # hide, don't quit: the pet stays; Quit is in its menu and the tray
            ev.ignore(); self.hide()
            if not self.told_tray:
                self.told_tray = True
                tray.showMessage(name, f"{name} is still on your desktop. Right-click him, or this icon, to quit.",
                                 icon, 4000)

    # ── the pet: a see-through window with his body in it ──
    class Pet(QWidget):
        def __init__(self) -> None:
            super().__init__(None)
            self.on_top = prefs.value("pet/on_top", True, type=bool)
            self.size_name = args.size or prefs.value("pet/size", "medium", type=str)
            if self.size_name not in SIZES:
                self.size_name = "medium"
            self._flags()
            if not args.opaque:
                self.setAttribute(Qt.WA_TranslucentBackground)
            self.setAttribute(Qt.WA_ShowWithoutActivating)   # appearing never takes the keyboard from you
            self.view = QWebEngineView(self)
            self.view.setPage(Page(self.view))
            self.view.page().setBackgroundColor(QColor("#202124") if args.opaque else Qt.transparent)
            self.view.setAttribute(Qt.WA_TransparentForMouseEvents)   # drags and clicks come to this window
            self.view.setContextMenuPolicy(Qt.NoContextMenu)
            lay = QVBoxLayout(self); lay.setContentsMargins(0, 0, 0, 0); lay.addWidget(self.view)
            self.view.load(QUrl(page_url + "/pet"))
            self._press: QPoint | None = None
            self._dragged = False
            self.resize_to(self.size_name, keep_feet=False)
            self._place()

        def _flags(self) -> None:
            f = Qt.FramelessWindowHint | Qt.Tool | Qt.WindowDoesNotAcceptFocus | Qt.NoDropShadowWindowHint
            if self.on_top:
                f |= Qt.WindowStaysOnTopHint
            self.setWindowFlags(f)

        def _place(self) -> None:
            pos = prefs.value("pet/pos")
            screen = app.primaryScreen().availableGeometry()
            if isinstance(pos, QPoint) and any(s.availableGeometry().contains(pos + QPoint(self.width() // 2, self.height() // 2))
                                               for s in app.screens()):
                self.move(pos)
            else:   # bottom right, standing on the taskbar
                self.move(screen.right() - self.width() - 24, screen.bottom() - self.height() + 1)

        def resize_to(self, size_name: str, keep_feet: bool = True) -> None:
            s = SIZES[size_name]
            old = self.geometry()
            self.size_name = size_name
            self.setFixedSize(round(PET_W * s), round(PET_H * s))
            if keep_feet and self.isVisible():   # grow or shrink around where he stands
                self.move(old.center().x() - self.width() // 2, old.bottom() - self.height() + 1)
            prefs.setValue("pet/size", size_name)

        def set_on_top(self, on: bool) -> None:
            self.on_top = on
            prefs.setValue("pet/on_top", on)
            visible = self.isVisible()
            self._flags()
            if visible:
                self.show()

        # dragging him around, without ever focusing him
        def mousePressEvent(self, ev) -> None:
            if ev.button() == Qt.LeftButton:
                self._press = ev.globalPosition().toPoint() - self.frameGeometry().topLeft()
                self._dragged = False

        def mouseMoveEvent(self, ev) -> None:
            if self._press is not None and ev.buttons() & Qt.LeftButton:
                self.move(ev.globalPosition().toPoint() - self._press)
                self._dragged = True

        def mouseReleaseEvent(self, ev) -> None:
            if self._press is not None and self._dragged:
                prefs.setValue("pet/pos", self.pos())
            self._press = None

        def mouseDoubleClickEvent(self, ev) -> None:
            control.open()

        def contextMenuEvent(self, ev) -> None:
            self._menu = fill_menu(QMenu())      # kept until the next one: Qt must not lose it while it's open
            self._menu.exec(ev.globalPos())

    control = Control()
    control.setWindowIcon(icon)
    pet = Pet()

    # ── the menu (the pet's right-click and the tray icon share it) ──
    state = {"status": {}, "warned": set()}

    def fill_menu(m: QMenu) -> QMenu:
        s = state["status"]
        m.clear()
        m.addAction(f"Open {name}…", control.open)
        m.addSeparator()
        listening = bool(s.get("listening"))
        mic = m.addAction("Microphone on" if not listening else "Microphone off (stop listening)")
        mic.triggered.connect(lambda: server.post_soon("/api/listen", {"on": not listening}))
        awake = bool(s.get("awake"))
        m.addAction("Go to sleep" if awake else "Wake up",
                    lambda: server.post_soon("/api/sleep", {"on": awake}))
        m.addSeparator()
        top = QAction("Always on top", m, checkable=True, checked=pet.on_top)
        top.toggled.connect(pet.set_on_top)
        m.addAction(top)
        sizes = m.addMenu("Size")
        group = QActionGroup(sizes)
        for key in SIZES:
            a = QAction(key.capitalize(), sizes, checkable=True, checked=key == pet.size_name)
            a.triggered.connect(lambda _=False, k=key: pet.resize_to(k))
            group.addAction(a); sizes.addAction(a)
        m.addAction("Hide (the tray icon brings him back)" if pet.isVisible() else "Show on the desktop",
                    lambda: pet.hide() if pet.isVisible() else pet.show())
        m.addSeparator()
        m.addAction("Quit", quit_all)
        return m

    tray = QSystemTrayIcon(icon)
    tray.setToolTip(name)
    tray.activated.connect(lambda reason: control.open() if reason in (QSystemTrayIcon.Trigger, QSystemTrayIcon.DoubleClick) else None)
    tray_menu = QMenu()
    tray_menu.aboutToShow.connect(lambda: fill_menu(tray_menu))
    tray.setContextMenu(tray_menu)
    tray.show()

    # ── keeping an eye on the brain: the tray's tooltip, and a word when something needs you ──
    def refresh() -> None:
        def go():
            try:
                s = server.get("/status", timeout=2)
            except Exception:
                s = {"stopped": True}
            state["status"] = s
        threading.Thread(target=go, daemon=True).start()
        s = state["status"]
        if s.get("stopped") or s.get("error"):
            tip = f"{name}: the brain is stopped"
        else:
            ears = "mic off" if not s.get("listening") else ("hearing you" if s.get("hearing") else "listening")
            v = (s.get("voice_out") or {})
            voice = "his own voice" if (v.get("last") or {}).get("engine") == "fish" or (v.get("fish_ready") and not (v.get("last") or {}).get("engine")) \
                else "computer's voice (fallback)"
            mood = "asleep" if not s.get("awake") else s.get("emotion", "")
            tip = f"{name}: {mood} · {ears} · {voice}"
            last = (v.get("last") or {})
            if last.get("engine") in ("builtin", "none") and "voice" not in state["warned"]:
                state["warned"].add("voice")
                tray.showMessage(name, f"Not {name}'s own voice: {last.get('reason') or 'Fish Audio unavailable'}. "
                                       "This computer's voice is speaking instead.", icon, 6000)
        tray.setToolTip(tip[:120])

    timer = QTimer(); timer.timeout.connect(refresh); timer.start(1000)

    def quit_all() -> None:
        prefs.setValue("pet/pos", pet.pos())
        tray.hide()
        if launcher.brain.running():
            launcher.brain.stop()
        if httpd is not None:
            threading.Thread(target=httpd.shutdown, daemon=True).start()
        app.quit()

    pet.show()
    if args.open or not prefs.value("seen", False, type=bool):
        control.open()           # the first time, the control window too, so there's no guessing where he went
        prefs.setValue("seen", True)
    problems = preflight()
    for problem in problems:
        print("note:", problem)
    if problems:
        tray.showMessage(name, "\n".join(problems), icon, 8000)
    app.aboutToQuit.connect(lambda: launcher.brain.running() and launcher.brain.stop())
    return app.exec()


def main() -> None:
    ap = argparse.ArgumentParser(description="Rocky on the desktop: the pet and the control window.")
    ap.add_argument("--size", choices=list(SIZES), help="the pet's size (remembered)")
    ap.add_argument("--opaque", action="store_true", help="a dark box behind him, if the see-through window shows black")
    ap.add_argument("--no-brain", action="store_true", help="don't start the brain (start it from the control window)")
    ap.add_argument("--open", action="store_true", help="open the control window at start")
    ap.add_argument("--port", type=int, default=launcher.PORT, help="the dashboard's port (default 8766)")
    args = ap.parse_args()
    try:
        import PySide6  # noqa: F401
    except ImportError:
        raise SystemExit("PySide6 isn't installed: pip install -r requirements-desktop.txt "
                         f"(or use the dashboard in a browser: python launcher.py, then http://localhost:{args.port}/ "
                         f"and http://localhost:{args.port}/pet)")
    sys.exit(run(args))


if __name__ == "__main__":
    main()
