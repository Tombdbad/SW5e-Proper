# AUDIT 05: Phone checklist (things only a real phone over Tailscale can judge)

## Plain-English summary
- The automated phone runs used a **simulated** phone (a 390 x 844 browser window with touch turned on, on a PC with software graphics). That can show layout and broken buttons, but it cannot tell how the game **feels** on a real phone: speed, heat, battery, touch accuracy, sound.
- This list is for you to tick off on your own phone, on the game opened through your Tailscale address (https, so the microphone is allowed). Use a **normal build**, not the test copy.
- Spend about 15 minutes. Write the phone model and browser at the top, and note anything odd next to the box.

Phone model: ______________  Browser and version: ______________  Date: ______________

## 1. First load
- [ ] The Home page opens within about 10 seconds on Wi-Fi.
- [ ] The first 3D map appears (not a blank or black screen) within about 30 seconds. Time it: ______ s
- [ ] After closing the tab and reopening it, the second load is faster.
- [ ] Nothing asks you to install or update anything.

## 2. Touch targets and text
- [ ] Every button on Home, character creation and the Play screen can be tapped without hitting the wrong one next to it.
- [ ] The creation tab strip (Details, Species, Class, Abilities, Background ...) can be scrolled sideways to reach the last tabs. In the simulated phone the last tab was cut off at the edge.
- [ ] Text is readable without zooming: body text, the HUD numbers (HP, credits), the exits list.
- [ ] Small buttons (Walk, Crouch, Prone, Jump, the HUD tabs) are not too small for a thumb.
- [ ] Pinch-zooming the page does not break the layout (or is blocked on purpose).

## 3. Taps on the 3D map
- [ ] One tap on the floor walks the character there.
- [ ] A **double tap** on a door, sign, person or ship opens it, and a single tap only picks it out. Try it ten times; note how many times it works: ____ / 10.
- [ ] A double tap does not also zoom the page.
- [ ] The on-screen stick (walking) is easy to find and does not swallow other taps.
- [ ] The Jump button works with the thumb while walking.

## 4. Scrolling
- [ ] The Play side panel (HUD) scrolls with a finger without moving the 3D map.
- [ ] The map can be dragged to look around without scrolling the page.
- [ ] Long lists (inventory, the trade stock, species list) scroll smoothly.
- [ ] Pulling down at the top of the page does not reload the game by accident.

## 5. Rotation
- [ ] **Portrait:** the whole Play screen is usable, nothing is off the screen, the bottom buttons are reachable above the phone's own gesture bar.
- [ ] **Landscape:** the map is bigger and the HUD still fits; turning the phone does not lose your place or restart the scene.
- [ ] Turning the phone back and forth three times does not freeze the game.

## 6. Speed, heat and battery (after 5 minutes of play)
- [ ] Walking around a town feels smooth. Rate it (1 slideshow ... 5 smooth): ____
- [ ] A fight (tabletop) feels responsive; the buttons answer within a second.
- [ ] A **shooter** fight feels playable: aiming, firing, no long freezes. Rate: ____
- [ ] The phone is not uncomfortably hot after 5 minutes. Rate (1 cool ... 5 hot): ____
- [ ] Battery drop after 5 minutes: ____ %
- [ ] The game does not get killed by the browser after 10 minutes in the background (switch away for a minute, then come back).

## 7. Sound
- [ ] Spoken lines from people play out loud (not only subtitles). Different people sound different.
- [ ] The voice does not start late by more than a few seconds.
- [ ] Sound plays after the first tap (some phones block sound until you touch the screen).
- [ ] The silent switch / volume buttons behave as you expect.
- [ ] Droid beeps, growls and the "cue" sounds (laugh, sigh) are audible.

## 8. Microphone (talking to people by voice)
- [ ] The browser asks for the microphone once, and remembers your answer.
- [ ] Speaking a sentence is turned into text, and the person answers.
- [ ] If you say no to the microphone, the game says so plainly and still works by typing.
- [ ] This only works on the https Tailscale address; on plain `http://` over Wi-Fi it should say the microphone is unavailable (check that it does, and that it does not crash).

## 9. Playing with a friend (co-op)
- [ ] The host sees a four-letter code; a friend on another phone enters it on the join page and picks a character.
- [ ] You each see the other's name in the Co-op panel.
- [ ] When one of you waits until evening, the other's clock changes too.
- [ ] If one phone loses signal for 20 seconds and comes back, it rejoins without a restart.

## 10. Saving and coming back
- [ ] Reloading the page puts you back in the same place with the same HP, credits and items.
- [ ] Locking the phone for a minute and unlocking it keeps the game going.
- [ ] Opening the game on two devices at once does not corrupt the character (note what happens).

## 11. Things to look for with your own eyes
- [ ] Textures: no stretched or missing patches on floors, walls or people.
- [ ] Big flat black shapes where rooms or booths should have detail (the first screenshots of the 3D map on the simulated phone and on the desktop showed solid black blocks around the player's room; check whether a real phone's graphics show the same).
- [ ] Text overlapping in the HUD (the exits list lines sit close together).
- [ ] In the **shooter**: the compass does not sit on top of the Aim and Grenade buttons, no message is cut off at the left edge, and the keyboard hints ([G], [Z], [T]) are not shown on a touch screen (the simulated phone showed all three problems).
- [ ] The Pazaak table is solid enough to read: the HUD tab names should not show through it.
- [ ] Using a Medpac from the Inventory tab heals you (the simulated run saw no change; you may need to choose who to use it on).
- [ ] The compass, the buttons along the top ("Galaxy", "Options", "Co-op", "View: Overhead") do not overlap each other.

## UNVERIFIED:
- Everything above: none of it was tested on a real phone.
- Whether the black shapes are a real fault or only the software graphics used by the audit PC.

## REMAINING:
- Run this list on the owner's phone, then record the model, browser and ticks in a copy of this file.
