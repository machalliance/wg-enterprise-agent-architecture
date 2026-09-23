# Versions — why every dependency is pinned exactly

`requirements.txt` carries `==` pins, not `>=` ranges. A range means the next
person to run `pip install` gets a different program than the one that was
tested, and on a project whose whole output is a model's judgement over fetched
text, "it behaved differently and nobody changed anything" is the most expensive
class of bug to chase. An exact pin makes a dependency change a commit.

Pins follow archetype 5's **7-day publish quarantine** convention: nothing is
pinned to a release less than a week old, so a version yanked shortly after
publication never reaches anyone here. Versions below were chosen on
**2026-09-23** against that rule — where the newest release was inside the
quarantine window, the pin is the newest release outside it, and that is noted.

| Package | Pinned | Published | Why this version |
|---|---|---|---|
| `anthropic` | `1.6.0` | 2026-09-15 | The default provider's SDK. `1.8.0` was current but published 2026-09-22, inside the quarantine window. Used for `messages.create` with a `cache_control` system block, which is why the system prompt is passed as a list rather than a string. |
| `openai` | `3.14.1` | 2026-09-15 | Serves two providers: `AI_PROVIDER=openai` directly, and `AI_PROVIDER=vercel` against the AI Gateway's OpenAI-compatible endpoint. `3.19.0` was current but published 2026-09-23, inside the window. |
| `feedparser` | `6.0.14` | 2026-07-30 | RSS and Atom parsing. Fed from bytes rather than a URL so that `_fetch_bytes` owns the scheme allow-list and redirect cap — feedparser's own URL fetching would bypass both. |
| `beautifulsoup4` | `4.15.0` | 2026-06-07 | Article body extraction in Research Mode, on the stdlib `html.parser` backend so there is no `lxml` build dependency. |
| `requests` | `2.34.2` | 2026-05-14 | The only HTTP client. `_fetch_bytes` uses a `Session` rather than `requests.get` because the redirect cap is a session attribute. |

`pytest` is deliberately **not** in `requirements.txt` — it is a development
dependency, and the runtime image should not carry it. Install it alongside:
`.venv/bin/pip install pytest`. It was tested at **9.1.1** (2026-06-19).

## Python

Tested on **3.12**. The floor is 3.10, set by `anthropic`, `openai`, `feedparser`
and `requests` all declaring `requires_python >= 3.10`, and independently by this
project's own use of PEP 604 unions (`dict | list`, `str | None`) in annotations
that are evaluated at runtime.

## Upgrading

Change one pin at a time and run `./run.sh demo` after each. The demo exercises
the real scoring and claim-extraction calls against fixed fixtures, so a
provider SDK that changed its response shape fails there rather than silently on
a scheduled run three weeks later. The unit tests mock the LLM and will not
catch it.
