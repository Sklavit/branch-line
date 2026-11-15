# Branch Line: developer handoff

As of 2026-11-15. Describes the code at commit `c1b2a60` on `main`.

Branch Line is a calm idle railway game for the browser: link neighbouring stations, trains carry passengers on their own, and you fit parts drawn at random quality from a workshop. It is a static site with no build step and no dependencies. It works and is deployed, but balance and sound have not been checked by a person.

## Where things are

| What | Where |
| --- | --- |
| Live game | https://sklavit.github.io/branch-line/ (GitHub Pages, `main` / root) |
| Repository | https://github.com/Sklavit/branch-line (public, default branch `main`) |
| Claude artifact copy | https://claude.ai/artifact/1QZmkU1KwbXQsXD2bGPYbQ (private to the owner, same code, separate save) |

To run locally, open `index.html` in a desktop browser, or serve the folder with any static server (`python3 -m http.server`). To deploy, push to `main`; Pages publishes the root.

iOS does not run local HTML files from the Files app, so on a phone use the Pages URL.

## Files

| File | Size | What it holds |
| --- | --- | --- |
| `index.html` | 70 lines | Markup only: header, map canvas, parts panel, two dialogs. Loads `audio.js` then `game.js`. |
| `css/style.css` | 143 lines | All styles. Colours are CSS custom properties with light and dark values; the canvas reads them too. |
| `js/game.js` | 436 lines | Everything else: constants, state, economy, workshop, simulation, UI, canvas rendering, save and boot. One IIFE, no modules. |
| `js/audio.js` | 50 lines | Generated music and train sounds (Web Audio). Exposes `window.Snd`. |
| `fonts/` | 6 files, about 130 KB | Barlow and Barlow Condensed, latin subset, SIL Open Font License. |

There are no tests, no linter and no package manifest in the repo.

## How the code works

All game state lives in one object, `S`, in `game.js`. Everything else is derived from it or is throwaway animation state.

One frame, driven by `requestAnimationFrame` in `start()`:

1. `step(dt)` advances the simulation. `dt` is clamped to 0.1 s.
2. Inside `step`: stations spawn passengers, the café pays out every 3 s, each train runs `stepTrain`, and effect timers age.
3. `draw()` repaints the whole canvas.

Separately, a 300 ms interval calls `tokens()` (re-reads CSS colours, so theme changes apply) and `ui()` (rewrites the DOM panel). A 5 s interval calls `save()`.

Main functions in `game.js`, in file order:

| Function | Job |
| --- | --- |
| `DEL` (constant) | Allowed rail links: Delaunay edges of the 14 stations, minus edges longer than 440 map units. 30 links. |
| `rebuild()` | Derives `conn` (linked stations) and `adj` (adjacency) from `S.edges`, calls `geo()`, and creates trains up to `1 + S.depot`. Call it after any change to `S.edges` or `S.depot`. |
| `bfs(a, b)` | Shortest path by distance (Dijkstra, despite the name). |
| `cands()` | Links that can be built now, each with its cost, cheapest first. |
| `build(g)`, `buy(k)` | Spend coins on a link or a depot level. |
| `drawPart()`, `showPart()`, `sellPart()` | Workshop: draw a random part, show the compare dialog, sell for coins and XP. |
| `stepTrain(tr, dt)`, `arrive(tr)`, `load(tr)` | Train state machine: `dwell` at a station or `move` along one link. |
| `goalDef(i)` | The i-th goal: text, progress, target, reward. |
| `ui()` | Writes every number and button state into the DOM. |
| `flyCoins()`, `rankUp()` | DOM effects outside the canvas. Both are skipped under `prefers-reduced-motion`. |
| `LAND`, `renderLand()` | Landscape. Generated once from a fixed seed, painted to an offscreen canvas, repainted only on resize or theme change. |
| `geo()`, `trailStep()`, `along()` | Station orientation and bridges; the breadcrumb trail that carriages follow behind the engine. |
| `drawStation()`, `draw()` | Canvas rendering, including the 6-minute day and night cycle. |
| `ser()`, `save()`, `away()`, `start()` | Save, offline earnings, load with validation, boot. |

How trains choose where to go: a train with passengers heads for its first passenger's destination by the shortest path, unloading and loading at every stop on the way. An empty train goes to the station with the most people waiting, discounting stations other trains are already heading for.

`audio.js` exposes `Snd.start()`, `Snd.setOn(bool)`, `Snd.clack()` and `Snd.whistle()`. Browsers only allow sound after a user gesture, so `game.js` calls `Snd.start()` on the first tap or key press. If `audio.js` is missing, `game.js` falls back to a silent stub.

The last three lines of `game.js` use `window.claude.hot`. That is a hook for the Claude artifact copy and does nothing anywhere else.

## Rules and formulas

Three currencies:

| Currency | Earned from | Spent on |
| --- | --- | --- |
| Coins | Fares, café, selling parts, goals, offline earnings | Rail links, depot, workshop levels |
| Tokens | 1 per 5 passengers delivered; a new game starts with 3 | Building a part (1 token each) |
| XP | 1 per passenger delivered; selling a part gives XP equal to its coin value | Fills the line rank bar |

Line rank: rank `L` needs `floor(15 × L^1.5)` XP. Each rank above 1 adds 5% to fares, and new parts follow rank.

Parts. There are seven slots, one part each. A part has a level and a quality. Its power is `e = level × quality multiplier`. An empty slot has `e = 0`.

| Quality | Salvaged | Standard | Fine | Express | Pullman | Royal |
| --- | --- | --- | --- | --- | --- | --- |
| Multiplier | 0.6 | 1.0 | 1.4 | 1.9 | 2.5 | 3.3 |

| Slot | Effect of power `e` |
| --- | --- |
| Engine | Train speed `70 × (1 + 0.08e)` map units per second. Shown as km/h at ×0.8. |
| Carriages | Seats per train `4 + round(1.5e)`. |
| Tickets | Base fare `(1 + 0.2e) × rank bonus`. |
| Platforms | A passenger appears at each station every `3.2 / (1 + 0.1e)` s, ±30%. Platform holds `6 + round(1.5e)`. |
| Signals | Stop time `max(0.25, 0.9 × 0.93^e)` s. |
| Station café | Every 3 s each station pays `0.05 × e × base fare` per waiting passenger. |
| Dining car | Long-trip bonus `h = 0.25 + 0.06e`. |

Fare for one passenger: `base fare × (1 + h × max(0, d / 230 − 1))`, where `d` is the straight-line distance from origin to destination. It does not depend on the route taken.

Workshop. Building a part costs 1 token. The slot is uniform random over the seven. The level is the line rank plus a random −2 to +1, minimum 1. Quality is rolled from this table (percent):

| Workshop level | Salvaged | Standard | Fine | Express | Pullman | Royal |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 70 | 30 | 0 | 0 | 0 | 0 |
| 2 | 50 | 42 | 8 | 0 | 0 | 0 |
| 3 | 30 | 50 | 18 | 2 | 0 | 0 |
| 4 | 15 | 48 | 30 | 7 | 0 | 0 |
| 5 | 5 | 40 | 38 | 15 | 2 | 0 |
| 6 | 0 | 30 | 40 | 23 | 6 | 1 |
| 7 | 0 | 18 | 40 | 30 | 10 | 2 |
| 8 | 0 | 8 | 35 | 35 | 17 | 5 |

A part sells for `max(1, round(3 × level^1.2 × quality multiplier))` coins and the same XP. Fitting a new part sells the old one. With "Sell weaker parts without asking" on, a drawn part whose power is not higher than the fitted one is sold at once.

Coin prices:

| Purchase | Cost |
| --- | --- |
| Rail link | `ceil(40 × 1.85^(linked stations − 2) × length / 250)`. A link between two already-linked stations costs 60% of that. |
| Depot (one more train) | `ceil(120 × 2.6^depot level)` |
| Workshop upgrade | `150 × 4^(workshop level − 1)`, up to level 8 |

Goals cycle through four kinds: link N stations, carry N passengers, run N trains, reach rank N. Goal `i` pays `max(40 × 1.4^i, 2 minutes of current income)`.

Offline earnings: when the page comes back after more than 45 s, it pays 50% of the recent income rate for the time away, capped at 4 hours.

## Save data

The save is one JSON object in `localStorage` under the key `branch-line-v1`, written every 5 s and after every purchase.

| Field | Meaning |
| --- | --- |
| `coins`, `tokens` | Balances. |
| `tokP` | Passengers delivered toward the next token (0 to 4). |
| `xp`, `level` | XP inside the current rank, and the rank. |
| `items` | Fitted parts by slot: `{engine: {q, lv}, ...}`. `q` is the quality index 0 to 5. Slot keys: `engine`, `cars`, `tickets`, `platforms`, `signals`, `cafe`, `dining`. |
| `pending` | A drawn part waiting in the compare dialog: `{k, q, lv}`, or `null`. |
| `depot` | Extra trains bought. Trains running is `1 + depot`. |
| `works` | Workshop level, 1 to 8. |
| `edges` | Built links as pairs of station indexes. A new game has `[[0, 1]]`. |
| `delivered` | Total passengers delivered. |
| `goal` | Index of the current goal. |
| `rate` | Smoothed income in coins per second, used for offline earnings and goal rewards. |
| `auto`, `sound` | The two settings. |
| `t` | Timestamp of the save, for offline earnings. |

Not saved: waiting passengers, train positions and passengers on board. A reload starts trains empty at stations.

`start()` validates a loaded save and also converts an older format that had a `lv` object of upgrade levels instead of `items`.

## Decisions made by the owner

These were explicit requests, so do not change them without asking.

- The main view must be meaningful and not aggressive: no combat, no fail state.
- Rails are only allowed between stations whose Voronoi cells touch. Any such link may be built, so loops are possible.
- Parts are drawn at random quality from a pool, and a workshop level shifts the odds.
- Parts are bought with tokens, not coins.
- Parts are sold for coins and the same amount of XP.
- When a new part replaces an old one, the old one is sold.
- The station café earns money.
- Hosted on GitHub as separate files, not a single file.
- Sound is ambient music plus train sounds. Event chimes were offered and not chosen.

## Testing and known issues

What was tested: the page was loaded in headless Chrome (Playwright) at 390×800 and 1200×760, light and dark, with a seeded mid-game save and a simulated night. No console errors, fonts loaded, trains ran and income rose. The live Pages URL was fetched once and served the page.

What was not tested:

- Nobody has played it through. Every number in the formulas above is a first guess.
- The sound has never been heard. Volume, the music and the train sounds are unchecked.
- No real phone or Safari run.

Known issues:

- Selling parts gives far more XP than delivering passengers, so rank rises mainly from selling. Part levels follow rank, which feeds back.
- The simulation only runs while the tab is visible. Offline earnings are an estimate from the recent rate.
- Passengers and train positions are lost on reload.
- The map is fixed at 14 stations and 30 links. Once all are built and the workshop is at level 8, the only coin sink left is the depot.
- Trains do not block each other and can overlap on the same track.
- The map gets crowded on a phone once most stations are linked.
- `game.js` is dense: long one-line functions and short names. It is hard to review in a diff.

To repeat the browser check, seed a save before the page scripts run:

```python
await page.add_init_script(
    "localStorage.setItem('branch-line-v1', JSON.stringify(%s))" % json.dumps(save))
await page.goto("file:///path/to/branch-line/index.html")
```

Collect `pageerror` and console errors, wait about 10 s, and check that the text of `#st-carried` goes up.

## Suggested next steps

In rough order of value:

1. Play it for an hour on a phone and tune the numbers, starting with XP from selling parts.
2. Listen to the sound and adjust levels in `audio.js` (`music.gain`, `sfx.gain`).
3. Commit a Playwright smoke test so the browser check is repeatable.
4. Save waiting passengers and train state, or accept the reset and say so in the UI.
5. Reformat `game.js` and split it into modules (state, economy, render, UI) before adding features.
6. Add a late-game goal or coin sink.

Ideas discussed and not built: several stats per part as in the reference game, separate screens with bottom navigation, an installable PWA with offline support.
