# Handoff (overwrite this file; see CLAUDE.md "Handoff")

Written 2026-10-30 (Windows PC), branch `main`. Commits today: 2434b7d (seats, gunners, convoy, water list), then the voices commit. Nothing is pushed.
The user's own `client/src/components/ui/Alert.tsx` is still modified: leave it unless told.

## 2026-10-30, voices (REVIVAL_NOTES "Spoken dialogue" > "Voices")
- Gemma 4 E2B gives text only (audio is input only). The prompt now asks for speech alone with [cue] sounds; `speechOnly` in server/dialogue.ts strips narration.
- server/speech.ts: Windows OneCore voices (George, Hazel, Susan) through a resident PowerShell worker; optional Piper (env PIPER_EXE, PIPER_MODEL; not installed); WAV cache in `.cache/speech` (gitignored).
- client/src/lib/voice.ts: per-speaker voice from id/species/role (deterministic), mood, cues (manifest samples or made in code), droid/helmet/mask/comms effects, Wookiee growls, astromech bleeps, Jawa chatter. TalkPanel: Voice and Subtitles checkboxes.
- `.claude/skills/septabee/SKILL.md`: SeptaBee is GUI-only (no CLI, binary .bee projects, VST3 and LV2 hosting); the user builds and exports, Claude wires files into `client/public/audio/...` and `voice/manifest.json`.
- Tests: tests/world/voice.test.ts; full suite 490 pass, 3 skipped.

## 2026-10-30, SeptaBee harness
- `tools/soundlab.mjs` (+ tests/world/soundlab.test.ts): render recipes and presets, `inspect`, `import` a SeptaBee WAV export into voice/nonverbal or ir with its manifest entry, `bank`, `ir`. Nothing installed into client/public yet (cues are still made in code); run `bank` only once the user can listen.
- SeptaBee has no CLI, MIDI, OSC or socket hook; suggestions for its author are in the skill.

- Piper is installed (user said yes): ../rhasspy-piper-38917ff/release/piper/piper.exe and voices/en_US-libritts_r-medium.onnx (904 speakers). server/speech.ts `findPiper` finds them; resident processes per pace. The server needs a restart to use it. Remove the Piper folders and the Windows voices speak again.
- `soundlab look` makes spectrogram PNGs: how Claude "hears".

## Open questions for the user
- Piper voices are random per person (seed), not matched to gender or species: should the model's speakers be sorted into low/high voices so a Hutt or a woman gets a fitting one? (needs listening)
- People met have no gender in the world data, so their voice's register is by seed.
- The game clock (a minute a second) makes holding one's breath last a few real seconds (from the water batch).

## Running
- No dev server of mine is running. 5002 (test copy) is an OLD build; the user restarts it (`deploy\windows-start.ps1 -Mode test -Lan`). A server restart is needed for the new dialogue prompt and /api/speech.

## Learned
- PowerShell 5.1 can drive WinRT speech: `[Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices` is static; await IAsyncOperation with `WindowsRuntimeSystemExtensions.AsTask`. System.Speech ignores SSML pitch (rate works as a multiplier).
- No `strings`, ffmpeg or Piper on this PC; a scratchpad Node script reads strings out of a binary.
- A heredoc with an apostrophe breaks the Bash tool's quoting: write patch scripts with the Write tool.
- The browser pane throttles timers when hidden: audio scheduling loops run slow there.
