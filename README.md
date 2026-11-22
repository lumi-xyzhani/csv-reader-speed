# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/lumi-xyzhani/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/lumi-xyzhani/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0: it reads broken CSV files
and returns exactly the same `{columns, rows, errors}` answer, in far less
CPU time. Dependency-free, plain Node — no install step, no network.

## How it is fast

The reference reader walks the text one character at a time. This one
does not: a record whose line holds no quote is answered with a single
slice and split, and a record that holds a quote is read field by field
with `indexOf` jumps — to the next quote, the next comma, the next line
break — never a per-character loop on the common path. Quoted fields
still follow the reference policy exactly: doubled quotes collapse to
one, CR/LF inside quotes reads as LF, an unterminated quote is a literal
character with the text after it re-read as unquoted, junk after a
closing quote is appended as it stands, and every broken thing is
reported with the line its record starts on and its record's index.

## How to run it

Requires Node 22.18 or later (the harness runs Node 22.23.4).

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or
`$MAKEFUN_INPUT_DIR/cases.json` outside a container), answers each one
with `run()` from `solve.js`, and writes `/output/answers.json` (or
`$MAKEFUN_OUTPUT_DIR/answers.json`).

## Layout

- `solve.js` — the reader: `run({text, header})` returns
  `{columns, rows, errors}`.
- `main.ts` — the driver the harness runs.
- `LICENSE` — MIT.

## Verify it

Against the kit's practice set and the reference reader, the entry
answers all 6 practice cases identically and passes a 20,000-case
differential fuzz against csv-reader 1.0.0 with zero mismatches.

---

Built for the make.fun bounty — [make.fun](https://make.fun/?ref=7k0y1sqw)
