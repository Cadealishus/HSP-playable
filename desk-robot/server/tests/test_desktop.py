"""The desktop version: the pet as a body, mouth sync with the computer's speaker, the Windows mic and voice fixes,
and Rocky himself left exactly as he was. No audio devices, no Qt, no network."""

import asyncio
import hashlib
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from brain import audio_devices, config, faces, main, mouth, personality
from brain.virtual_body import VirtualBody

SERVER = Path(__file__).resolve().parent.parent


class VirtualBodyTests(unittest.TestCase):
    def test_a_watcher_gets_the_current_state_then_what_the_robot_is_told(self):
        body = VirtualBody()
        body.send({"type": "emotion", "name": "happy"})
        q = body.attach()
        hello = q.get_nowait()
        self.assertEqual((hello["type"], hello["emotion"]), ("hello", "happy"))
        self.assertTrue(body.send({"type": "pan", "deg": 20}))
        self.assertEqual(q.get_nowait(), {"type": "pan", "deg": 20})

    def test_only_what_a_screen_can_show(self):
        body = VirtualBody()
        q = body.attach(); q.get_nowait()
        for msg in ({"type": "volume", "level": 1}, {"type": "speak_begin"}, {"type": "settings"}, {"type": "stream"}):
            self.assertFalse(body.send(msg))
        self.assertTrue(q.empty())

    def test_every_emotion_and_the_face_pack_get_through(self):
        body = VirtualBody()
        q = body.attach(); q.get_nowait()
        for e in faces.EMOTIONS:
            body.send({"type": "emotion", "name": e})
            self.assertEqual(q.get_nowait()["name"], e)
        body.send(faces.robot_message(faces.load("rocky")))
        msg = q.get_nowait()
        self.assertEqual(msg["type"], "face")
        self.assertNotIn("save", msg)
        self.assertEqual(body.state["face"]["emotions"], faces.load("rocky")["emotions"])

    def test_a_page_that_stops_reading_is_dropped(self):
        body = VirtualBody()
        body.attach()
        for _ in range(250):
            body.send({"type": "mouth", "level": 0.1})
        self.assertFalse(body.attached)


class BrainWithoutRobotTests(unittest.TestCase):
    def setUp(self):
        self.saved = (main.robot_socket, main.virtual)
        main.robot_socket = None
        main.virtual = VirtualBody()

    def tearDown(self):
        main.robot_socket, main.virtual = self.saved

    def test_the_pet_counts_as_a_body(self):
        self.assertFalse(main.body_connected())
        main.virtual.attach()
        self.assertTrue(main.body_connected())

    def test_the_robots_messages_reach_the_pet_without_a_robot(self):
        q = main.virtual.attach(); q.get_nowait()
        asyncio.run(main.send_to_robot({"type": "emotion", "name": "curious"}))
        self.assertEqual(q.get_nowait(), {"type": "emotion", "name": "curious"})
        self.assertEqual(main.current_emotion, "curious")

    def test_the_mouth_moves_with_the_computers_speaker(self):
        q = main.virtual.attach(); q.get_nowait()
        pcm = (bytes(range(256)) * 250)[:32000]          # one second of sound

        async def run():
            reply = main.SpokenReply(asyncio.get_running_loop(), main.Timeline(time.time()))
            reply.audio.put(main.SpokenReply.BREAK)
            reply.audio.put(None)
            with patch.object(mouth, "play", lambda b: time.sleep(len(b) / 32000)):
                await reply._play_mac(pcm)

        asyncio.run(run())
        levels = []
        while not q.empty():
            levels.append(q.get_nowait()["level"])
        self.assertGreater(len(levels), 15)              # ~25 a second, as the robot gets them
        self.assertEqual(levels[-1], -1)                 # and shut when he's done


class WindowsMicTests(unittest.TestCase):
    APIS = [{"name": "MME"}, {"name": "Windows DirectSound"}, {"name": "Windows WASAPI"}]

    def dev(self, name, api, ins=2):
        return {"name": name, "hostapi": api, "max_input_channels": ins}

    def test_one_mic_listed_by_every_audio_system_opens_once(self):
        devs = [self.dev("Microphone (Realtek)", 0), self.dev("Microphone (Realtek)", 1),
                self.dev("Microphone (Realtek)", 2), self.dev("Speakers", 0, ins=0)]
        self.assertEqual(audio_devices.input_device("Microphone (Realtek)", devs, self.APIS, 0), 0)
        self.assertEqual(audio_devices.input_device("realtek", devs, self.APIS, 2), 2)   # the default system first

    def test_two_different_mics_stay_ambiguous_as_before(self):
        devs = [self.dev("USB Mic A", 0), self.dev("USB Mic B", 0)]
        self.assertEqual(audio_devices.input_device("USB", devs, self.APIS, 0), "USB")

    def test_the_picker_shows_each_mic_once(self):
        devs = [self.dev("Mic", 1), self.dev("Mic", 0), self.dev("Line In", 0)]
        names = audio_devices.input_names(devs, default_device=1, default_hostapi=0)
        self.assertEqual([m["name"] for m in names], ["Mic", "Line In"])


class VoiceTests(unittest.TestCase):
    def test_the_windows_voice_gets_its_file_from_the_environment(self):
        self.assertIn("$env:ROCKY_TTS_WAV", mouth._WINDOWS_TTS)
        self.assertNotIn("$args", mouth._WINDOWS_TTS)

    def test_the_fallback_voice_is_reported_as_the_fallback(self):
        with patch.dict("os.environ", {"FISH_AUDIO_API_KEY": ""}), \
             patch.object(mouth, "_synthesize_builtin", lambda t: b"\x00\x01" * 800):
            list(mouth.stream("Hello, friend."))
        self.assertEqual(mouth.last_voice["engine"], "builtin")
        self.assertIn("FISH_AUDIO_API_KEY", mouth.last_voice["reason"])
        self.assertNotIn("FISH_AUDIO_API_KEY=", str(mouth.voice_status()))

    def test_resampling_keeps_the_length_in_time(self):
        import numpy as np
        out = mouth.resample_pcm(np.zeros(16000, np.int16), 48000)
        self.assertEqual(len(out), 48000)


class RockyIsStillRockyTests(unittest.TestCase):
    """The desktop version changes how he's shown, never who he is. If you change these on purpose, update them."""

    def test_voice_and_model_settings(self):
        if config.CHARACTER:
            self.skipTest("another personality is active")
        self.assertEqual(config.TTS_VOICE_ID, "6dd07916890445e59c5f019ad0fc7879")
        self.assertEqual((config.TTS_MODEL, config.TTS_ACTING, config.TTS_TEMPERATURE, config.TTS_TOP_P),
                         ("", False, 0.4, 0.6))
        self.assertEqual(config.REPLY_MAX_SENTENCES, 3)

    def test_the_personality_thinking_and_turn_taking_files_are_untouched(self):
        want = {   # SHA-256 of the V2 originals
            "brain/personality.py": "a8630845a94f506ee23f817dd8ed46fa814c55ddca5e7e58391f35f58da83912",
            "brain/config.py": "d484e35a6e53edf95874075256dcdbdf55df4d02187b143111297cf70788c805",
            "brain/thinking.py": "bbad97bef50fb91b65b9adbe2fbe2d8b45f5d1a9b04c06d4e14cc46adb304ea1",
            "brain/turn.py": "63261d797413e27f644bd1ead8a19c9dae484fbeda5f6ee6ebfb0781d53c9b77",
        }
        for rel, sha in want.items():
            got = hashlib.sha256((SERVER / rel).read_bytes()).hexdigest()
            self.assertEqual(got, sha, f"{rel} changed")
        self.assertTrue(personality.ROCKY_PROMPT.startswith("You are Rocky, the Eridian engineer"))

    def test_the_pet_draws_with_the_dashboards_own_face_code(self):
        sys.path.insert(0, str(SERVER))
        import launcher
        js = launcher.facekit_js().decode()
        self.assertIn("class Sim", js)
        self.assertTrue(js.rstrip().endswith("window.FaceKit = FaceKit;"))
        pet = (SERVER / "brain" / "pet.html").read_text(encoding="utf-8")
        self.assertIn('src="/facekit.js"', pet)
        self.assertNotIn("class Sim", pet)              # no second copy of the face


if __name__ == "__main__":
    unittest.main()
