# Bookoo scale support: plan

Seven steps, ordered so the biggest unknowns get tested on the real scale first. They are called steps because "Stage 2" already means the analysis work in `concept.md`.

## Feature

- Scales are managed in Equipment, like grinders and drippers.
- The app tries to connect when opened, then every 20 seconds.
- Pours are planned with typed values as usual; the brew log records the actual pours from the scale.
- With scale data, the adjustments use the ratio from the measured total water, rounded to 0.1.
- When a scale is detected, a card appears under Pours with the scale's name, a green dot and a blue (`#56ABFA`) Enter button in the primary button style.
- Enter opens and centres the card and waits for pour 0. Pours advance one by one, showing the live reading and target (`0.0g > 45.0g`).
- A pour that stops within 4 g under, or any amount over, counts down to the next pour.
- The app's time follows the scale's timer.

## Decisions

- **Phone:** iPhone, running the app in the Bluefy browser. Safari has no Web Bluetooth.
- **Scale:** Themis Ultra.
- **Total time:** ends when the dripper is lifted off the scale, with a Stop button as backup. With the server on the scale, drawdown doesn't change the weight.
- **Planned and measured pours:** keep both, so the next brew's placeholders come from the plan and don't drift.

## Unknowns to prove on the hardware

- **Auto-connect:** a page reload may need one tap to reconnect. `getDevices()` was still behind a Chrome flag in the latest docs found, and nothing was found on Bluefy.
- **Dripper lift:** Bookoo's "filter removed" stop condition may not fire when a dripper is lifted. If it doesn't, the app can detect the weight drop and send Stop itself.
- **Timer commands:** Bookoo's checksum rule gives `0D` for start, but Beanconqueror sends `0A`. Stop, reset and tare+start differ too.

## Steps

### 1. Connection and protocol test

- **Build:** a tested packet decoder and command builder, a swappable Bluetooth layer, and a hidden debug page showing live values, raw bytes and a button per command. Bluefy has no known dev tools, so the page has to show everything.
- **Setup:** Web Bluetooth needs HTTPS, so test through a tunnel to the dev server.
- **Done when:** we know the update rate, sign bytes, correct checksums, whether `03 0D` events arrive, and whether Bluefy can reconnect without a tap or keep the screen on. Firmware needs to be V4.0.0 or later.

### 2. Recording real brews

- **Build:** a record button on the debug page that exports the data as JSON.
- **Capture:** 5–10 brews with normal pours, pulse pours, swirls, kettle knocks, over-pours and dripper lifts.
- **Done when:** the recordings show how far flow lags weight, and whether the Ultra timer survives the gaps between pours.

### 3. Pour detector, tested offline

- **Build:** a pure state machine that replays those recordings in Vitest, with all thresholds in one place.
- **Done when:** it finds every pour start and end in the recordings, with no false triggers.

### 4. Scales in Equipment and auto-connect

- **Build:** a `scales` table and an Equipment section matching drippers, plus an app-wide connection in the root layout.
- **Pairing:** stored per phone rather than per account, because Bluetooth IDs are per browser.
- **Retry:** every 20 seconds, with no overlapping attempts, paused while the app is hidden.
- **Done when:** turning the scale on mid-session connects it, and a simulated scale drives the Playwright tests.

### 5. Brew card, read-only

- **Build:** the card under Pours with name, green dot and `#56ABFA` Enter button, on new brews only. Enter opens and centres it, tares the scale, and shows `0.0g > 45.0g`.
- **Button text:** dark, as on the primary button, because white on that blue is hard to read.
- **Done when:** the live reading is right and nothing is written to the form.

### 6. Guided pours

- **Build:** the detector wired in, pours advancing one by one, the countdown running on the scale's timer, the screen kept awake, and a manual Next and Stop.
- **Done when:** a real brew can be completed hands-free, then the thresholds tuned at the kettle.

### 7. Saving measured data

- **Build:** measured values fill the pour rows and Total time. `pours` gains nullable planned grams, planned start and pour duration, and `brews` gains `scale_id`. The next brew's placeholders use the plan, and the CSV export gets the new columns.
- **Ratio:** the adjustments need no new logic, since they already use the pour total rounded to 0.1.
- **Done when:** a saved brew shows measured values and the next brew's placeholders still read 45 g at 0:45.

## Detecting the end of a pour

Start from a persistent zero flow reading, with a short timeout, recording the stop from the first zero reading. Four changes to test against the recordings:

- **Threshold, not zero:** use something like under 0.3 g/s, since a smoothed reading may never hit exactly zero and can go negative when the stream stops.
- **Back-dating:** record the stop from the first low reading, corrected by the lag measured in step 2.
- **Final weight:** read it after the hold, once the scale has settled.
- **Bump rejection:** ignore implausible spikes from swirls and knocks, and require a sustained rise before starting the next pour.

## Defaults assumed

- An over-pour keeps the running targets, so the total still lands on plan.
- Stopping more than 4 g short waits on that pour until topped up or Next is tapped.
- A lost connection keeps what's recorded so far and the rest is typed.
- The full flow curve isn't stored for now, though the recordings would make it easy to add later.

## Sources

- [Bookoo Themis Ultra protocol](https://raw.githubusercontent.com/BooKooCode/OpenSource/main/bookoo_ultra_scale/protocols.md)
- [Bookoo Themis Mini protocol](https://raw.githubusercontent.com/BooKooCode/OpenSource/main/bookoo_mini_scale/protocols.md)
- [Beanconqueror Bookoo driver](https://raw.githubusercontent.com/graphefruit/Beanconqueror/master/src/classes/devices/bokooScale.ts)
- [Web Bluetooth implementation status](https://raw.githubusercontent.com/WebBluetoothCG/web-bluetooth/main/implementation-status.md)
- [MDN browser compatibility data for `Bluetooth`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Bluetooth.json)
- [MDN: `getDevices()`](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/getDevices)
- [Bluefy on the App Store](https://apps.apple.com/jp/app/bluefy/id1492822055)
