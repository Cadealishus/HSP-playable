// Audio (STUB — owned by the UI/audio agent). Contract: docs/CONTRACTS.md#audio
export function createAudio() {
  return {
    name: 'audio',
    alwaysUpdate: true,
    async init() {},
    // Resume the AudioContext after a user gesture.
    unlock() {},
    play() {},
  };
}
