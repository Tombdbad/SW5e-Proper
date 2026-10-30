---
name: septabee
description: Making the game's music, sound effects and voice sounds with SeptaBee (the free modular DAW in C:\Users\Admin\Desktop\SW5E\windows-native) and bringing them into the game. Use when the user wants new music, sound effects, droid or creature sounds, non-verbal voice cues (breaths, sighs, chuckles, bleeps), impulse responses for helmets, masks and comlinks, or asks how to do something in SeptaBee.
---

# SeptaBee for SW5E sound

SeptaBee is a free, "violently unfinished" (its author's words) modular DAW by LostRobot, released September 2026
([Sonicstate](https://sonicstate.com/news/2026/09/04/septabee-a-free-daw/)). Its website (septabee.nekoweb.org) has almost no text and
there is no manual. **Everything below about its insides was read from the program's own files on 2026-10-30** (its help texts and
labels); where a part's purpose is a guess, it says so. Check in the program before telling the user a guess as fact.

## What Claude can and cannot do with it

- SeptaBee is a GUI program (Vulkan 1.2). It has **no command line, no scripting interface and no text project format**: projects are
  compressed binary `.bee` files. Claude cannot build, edit or render a project, and must not try (do not run `septabee.exe`, do not write
  or patch `.bee` files; the user may have it open, and it keeps a recovery copy of the open project).
- So the work is split: **Claude writes the recipe** (what to build, which devices, which settings, how long, what to export, where to put
  it) and **the user builds and exports it in SeptaBee**; then **Claude brings the files into the game** (folders, manifest, code, tests)
  and checks them in the browser.
- Claude can inspect exported audio files with `tools/soundlab.mjs inspect` and should, before wiring them in.

## The harness (what runs without SeptaBee)

SeptaBee has no hook to attach to (checked 2026-10-30 in `septabee.exe` and `septabee-sounds.exe`: `CommandLineToArgvW` is there but no
flags, no MIDI input, no OSC, no socket or pipe; the two processes share memory). So the harness sits around it, in `tools/soundlab.mjs`
(Node, no packages, tests in `tests/world/soundlab.test.ts`):

- `node tools/soundlab.mjs render <preset|recipe.json> out.wav`: renders a **recipe** (oscillator, noise, envelope, filters, bitcrush,
  drive, repeats; or an impulse response from a filter chain) with the same parts a SeptaBee rack would have. Claude can make and judge
  cues, bleeps, growls, static and the helmet/mask/comms IRs alone. `presets` lists the 21 first drafts (one or more per cue).
- `inspect file.wav...`: rate, length, peak, RMS, leading silence, clipping, DC, and what to fix.
- `import in.wav <bank>/<cue>` (or `ir/<helmet|mask|comms>`): **the way a SeptaBee export enters the game**. Mixed to mono, resampled to
  48 kHz, DC removed, trimmed (30 ms before, 20 after), peak -3 dBFS, 10 ms fade, saved as the next take
  `client/public/audio/voice/nonverbal/<bank>/<cue>-<n>.wav`, and listed in `manifest.json`. Export **WAV** from SeptaBee (FLAC and
  Ogg are not read; WAV decodes in every browser).
- `bank <bank> <cue> [takes]` and `ir <name>`: render varied takes of a preset and install them (replaces the in-code sound for that cue
  with the draft, so listen first: Claude cannot hear it).
- Drop-folder habit for the user: export to one folder, e.g. `C:\Users\Admin\Documents\Septabee\exports\<bank>-<cue>.wav`, and tell Claude;
  Claude runs `inspect` then `import` on each.

SeptaBee work that stays with the user: music, designed sound effects and anything recorded. Claude's part is the recipe beforehand and
the import and wiring after. Driving the window with computer use is possible (screenshots and clicks, needs the user's permission and
patience: custom Vulkan UI, no accessibility tree), but nothing here depends on it.

## What would make SeptaBee reachable (suggestions for its author, LostRobot, or for the user to ask for)

In order of value for a scripted workflow:
1. **A render command**: `septabee --render project.bee --out file.wav [--seconds N] [--no-gui]`. It has a Vulkan headless surface in its
   dependencies and a separate audio process already; this alone lets Claude edit-by-recipe and render without the window.
2. **A text project format** (JSON, TOML or Lua) beside binary `.bee`, or `--dump project.bee` to text and `--build text -> .bee`. Then
   projects can be written, diffed and reviewed in git.
3. **A control port**: OSC, JSON over a local socket, or stdin commands: add device, set parameter, play, stop, export. Loopback only.
4. **A text form of Mangosteen and Pomegranate modules** (their bubble graphs are already compiled by an LLVM JIT, so a textual source
   exists in principle): then synth patches are code Claude can write.
5. **MIDI in** (a virtual port, or a MIDI file import) so notes can be played from outside; today notes come from the mouse, the computer
   keyboard or the Waggleboard.
6. **An accessibility tree** (AccessKit is a common choice for custom-drawn UIs) and written shortcut list, so a screen reader or an
   agent can name the buttons.
7. **Small things**: a documented export folder and file-name template, a "re-export on save" option, deterministic output (no random
   seeds unless asked), a loudness readout on export.

Without any of those, the user can still help: keep **one template project** (a sampler or Mangosteen rack on a track, a Master chain
ending in a limiter at -3 dBFS, the export folder set), save each sound as its own clip, and name exports `<bank>-<cue>-<n>.wav`.

## Where things are

| What | Where |
| --- | --- |
| The program | `C:\Users\Admin\Desktop\SW5E\windows-native\septabee.exe` (also `septabee-sounds.exe`, the separate audio process, and `septabee-watchdawg.exe`, which restarts it) |
| Theme | `windows-native\theme.bee` (plain text: colours and sizes per panel) |
| Settings | `%APPDATA%\Septabee\settings.bee` (plain text), `filebrowser.yummers` (the file browser's places) |
| Projects | `C:\Users\Admin\Documents\Septabee` (its file browser's default); the open project's recovery copy is `%APPDATA%\Septabee\recovery-project.bee` |
| Installed builds | `%LOCALAPPDATA%\Septabee\installations.txt` (a project remembers the build that saved it and asks for it) |

## Its parts (names as the program uses them)

- **Beehive**: the arrangement: tracks and their clips over time (create, split, glue, duplicate and reverse clips, audio clip markers,
  loop start and end). **Note tracks**, **audio tracks**, **automation tracks**, **buses**.
- **Waggleboard**: the note editor (a piano roll). Its grid is set by prime numbers: boxes for 2, 3, 5, 7, 11, 13, 17, 19 and 23 (scroll
  the second for triplets, the third for quintuplets; hold a number key and scroll; "A" in the first box follows the zoom). It works in
  any tuning: the keyboard's **equave** (the interval that repeats, an octave by default) can be changed, with an equave guide and
  "rainbow pitch colours". Good for alien music that does not sit in twelve notes.
- **Rack and slots**: each track has a rack of slots; audio and note signals pass from top to bottom, skipping slots that do not use
  them. A **send** feeds one track's output into another's input. Nothing is heard until it reaches the end of the **Master** bus's rack.
- **Honeycomb**: the patching view, with ports (round ports for audio; note signals come out of triangle-shaped ports).
- **Mangosteen**: the main instrument and processor. Monophonic (one signal, processed for ever) or polyphonic (a voice per note sent in,
  a chosen number at once, no cost for setting it high); a **gate** sets how long a voice goes on after its volume falls below the
  threshold. Inside it the signal is made by **bubbles**, run clockwise from the output port: *unary* bubbles change the value (e.g.
  remap [-1, 1) to [0, 1)), *binary* bubbles combine it with another value (one is the current note's parameters, e.g. its frequency).
  Play it from the computer keyboard: Caps Lock on, click the Mangosteen until "(K)" shows in its name.
- Other devices seen: **Sampler**, **Wavetable**, **Filter**, **Envelope Generator**, **Envelope Follower**, **Bitcrush**,
  **Oscilloscope** and **Visualizer** (display only), **Watermelon** (outputs the channel index as a signal), **Pomegranate Module**
  (a module of its own; guess: a user-built device, compiled by the LLVM-based JIT runtime in `stuffs\septabee-jit-runtime.dll`).
  "Spatial Pan" and "Binaural Pan" are named but not implemented yet.
- **Plugins**: hosts **VST3** and **LV2** plugins (crashes and NaNs from a plugin are caught; the **explode** button restarts the audio
  process to clear NaNs from a runaway feedback loop, without touching the project).
- **Export Audio**: has a FLAC compression setting (affects size and speed, not quality); Ogg/Opus and FLAC code is built in. Check what
  the export dialog offers; the game wants **WAV or FLAC out of SeptaBee**, converted below.

## The game's sound folders and formats

```
client/public/audio/
  voice/
    manifest.json            # what lib/voice.ts may use (below); a file not listed is never fetched
    nonverbal/<bank>/<cue>-<n>.ogg
    ir/<name>.wav            # impulse responses: helmet, mask, comms
  music/<place-or-mood>-<n>.ogg
  sfx/<thing>-<action>-<n>.ogg
client/public/sounds/        # the three old Howler sounds (useAudio.tsx); leave them
```

- Banks (`<bank>`): `human`, `droid`, `wookiee`, `small` (Jawas, Ewoks, Ugnaughts), `large` (Hutts, Besalisks, Gamorreans).
- Cues (`<cue>`), exactly these (server/dialogue.ts `CUES`): `chuckle laugh sigh breath groan cough wheeze hmm gasp growl beep whistle
  static`. A bank falls back to `human` for a cue it lacks, then to the sound made in code.
- `manifest.json`:
  ```json
  { "nonverbal": { "droid/beep": ["nonverbal/droid/beep-1.ogg", "nonverbal/droid/beep-2.ogg"] },
    "ir": { "helmet": "ir/helmet.wav", "mask": "ir/mask.wav", "comms": "ir/comms.wav" } }
  ```
  Paths are relative to `client/public/audio/voice/`. Several takes of a cue are picked among by speaker, so one person keeps theirs.
- Format: 48 kHz; cues and IRs **mono**; music and ambience stereo. Ship **Ogg (Vorbis or Opus, ~96 kbps)**, IRs as 16- or 24-bit WAV.
  No ffmpeg on this PC and none needed: `tools/soundlab.mjs import` takes **WAV** and the game plays WAV (manifest paths may end .wav); Ogg only if a converter is installed later (ask the user first).
- Levels: cues peak at -3 dBFS, no limiter pumping, 30 ms of silence at most before the sound (they are scheduled tight); music about
  -18 LUFS integrated with peaks under -1 dBTP so voices sit over it; loops cut on a zero crossing at a bar line.
- Only the user's own work or properly licensed material goes in. No sounds ripped from the films or games.

## How the game plays voice sounds (so recipes fit)

`client/src/lib/voice.ts`: each speaker's voice (`voiceOf`) is one of the speech engine's voices played higher or lower, three EQ bands,
a gravel waveshaper, then effects: `droid` (ring modulation 40-90 Hz), `metal` (a 4.5 ms comb), `helmet` and `masked` (convolution with
the `helmet` / `mask` IR, then a band-pass), `comms` (high-pass 450 Hz, low-pass 3.1 kHz, a stepped waveshaper, the `comms` IR if listed,
static before and after), `breath` between sentences for respirators. A cue sample is played through the same chain at the voice's
pitch (droid cues at their own pitch). **So cue samples should be dry**: no helmet, comms or room on them.

## Recipes

### Impulse responses (helmet, mask, comlink)
Only the **linear** part of a sound (EQ, filters, resonances, short rooms) can be an IR; distortion, bitcrush and ring modulation stay in
code. In SeptaBee: an audio track with a single-sample click (a one-sample full-scale impulse, or a Mangosteen bubble chain that outputs 1
for one sample) at the start; on its rack the effect chain (Filter for the plastic band, short resonant peaks for a helmet's shell, a tiny
room); export 0.1-0.3 s mono. A helmet: band around 900-2500 Hz with two narrow resonances; a mask: duller, around 400-1500 Hz; comms:
300-3400 Hz with a small speaker's honk at about 1.5 kHz. Name `ir/helmet.wav` etc. and list them in the manifest.

### Non-verbal takes
3-5 takes of each cue per bank, 0.2-1.2 s, dry, mono. Human breaths, sighs, coughs and laughs are best **recorded by the user** (any
microphone) and cleaned in SeptaBee (Filter to cut rumble below 80 Hz, a gate, a fade out). Droid `beep`/`whistle`: a Mangosteen with a
sine or square oscillator, pitch slides by envelope, 3-8 quick tones; vary the takes. `static`: filtered noise with crackles (Bitcrush
on noise, gated). Wookiee and large-creature `growl`: a low saw through a resonant Filter swept by an Envelope Generator, with noise.

### Droid speech banks (later)
Astromech "words" (`bleeps` tongue) are made in code; a bank of 20-30 short phrases (`droid/phrase-<n>.ogg`) would sound better. If the user
makes one, add a `phrase` cue to the code first: it is not in `CUES` yet.

### Music
Short loops per place and moment: cantina band (`music/cantina-<n>.ogg`), spaceport, wilderness by biome, travel, tension, combat, the
convoy and dogfight minigames, victory and defeat stingers (2-6 s). Microtonal scales from the Waggleboard suit alien music (a 5-limit or
7-limit just scale, or a non-octave equave). There is no music player in the game yet; wiring one in (Howler is installed, see
`client/src/lib/stores/useAudio.tsx`) is code work to plan with the user.

### Sound effects
Blasters, sabers, speeder and ship engines, doors, UI clicks. No game code plays most of these yet; add them with the code that needs them,
listed by name in the code that plays them.

## Steps after the user exports

1. `node tools/soundlab.mjs inspect <exports>` and say what is off (too long, clipped, leading silence); then `import` each one
   (it conforms the file, puts it in the folders above with the right name and adds it to the manifest).
2. Music and sound effects (not voice cues) are added to the code that plays them.
3. Check in the browser on the dev server (`window` import of `/src/lib/voice.ts`, `speak(...)`), then `npm test`.
4. Note what was added in REVIVAL_NOTES.md ("Voices") and commit with the work.
