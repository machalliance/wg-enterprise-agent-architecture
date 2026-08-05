# From Orchestration to Autonomy — working notes

## Source of truth

The numbered `NN-*.md` files in this directory are the book. Edit those. Never edit anything in `dist/` by hand.

## Rebuilding dist

`dist/draft-from-orchestration-to-autonomy.md` is a plain concatenation of every `[0-9]*.md` file in this directory, in `sort` order, joined by exactly two blank lines. Nothing is inserted: the Part One / Part Two / Part Three dividers live at the top of `10-`, `20-`, and `32-` respectively — if one of those files is ever cut, its divider has to move to whatever file now opens that part.

Files named `standalone-*.md` are deliberately outside the number sequence so the build skips them. They are pieces pulled out of the book to publish on their own.

Rebuild it after any source edit:

```bash
out=dist/draft-from-orchestration-to-autonomy.md
: > "$out"
first=1
for f in $(ls [0-9]*.md | sort); do
  [ $first -eq 0 ] && printf '\n\n' >> "$out"
  cat "$f" >> "$out"
  first=0
done
```

Verify by diffing against the previous build: the only differences should be the edits you just made. Any extra blank-line churn at file boundaries means the join separator is wrong.

`dist/draft-insights-hub-article-*.md` is a separate hand-written piece, not generated. Leave it alone unless asked.

## Conventions to hold

- **Enterprises and organizations are not in an archetype — solutions are.** Never write "most enterprises are in archetype 2". Write "most solutions in production sit in archetypes 1 and 2".
- **Archetype, not level or maturity stage.** No ladder, no top, no trophy for moving up. More autonomy is a different bill, not more value.
- The framing questions are "does this work need an agent at all?" and then "which archetypes does the solution need, and are we resourced for each one?" Nobody is *at* an archetype. Don't set this up by quoting the bad version of the question back at the reader — state the good questions directly.
- Archetype 1 is *LLM-assisted*, explicitly below the agency line. Keep that distinction sharp; the whole model rests on it.
- Diagnostics and the when-not-to-build test run **per component**, not per solution. A "no" is usually a "not this part".
- Every archetype chapter follows the same shape: What changes here · Running example · Architecture · Policy · Other examples that fit · Readiness checklist · Bridging to the next archetype. Readiness checklists are split into *Minimum to launch* and *Required at scale*.
- Running example across Part Two is Meridian Outfitters (fictional retailer, spring outdoor line launch). Part Three's ladder is procurement.
- en-US spelling. No emoji. No LLM writing tells (see commit `ed286b2` for what got scrubbed).

## Current state

- The degrees-of-agency diagram was dropped (2026-08-04); a replacement needs to be created and re-referenced in `13-five-archetypes-at-a-glance.md`. The old alt text is in git history at commit `ed286b2` if the new diagram matches the old content.
- Order is title (`01-`) → executive summary (`03-`) → contents (`05-`) → Part One. Front matter is deliberately thin: title, subtitle, byline, rule. The old "About this book" section was cut as duplicative of the executive summary, which now carries the how-to-read-the-parts guidance and closes with "A note on terms".
