# CAH Deck Format — Specification

A JSON format for representing Cards Against Humanity–style decks in a form a game
engine can consume directly, plus the conventions an engine uses to select decks for
a draw and to configure default gameplay behavior.

Design goals:

- **One file per expansion.** Each file is self-contained and independently loadable.
- **Explicit placeholders.** Blanks are numbered (`{1}`, `{2}`), so the engine knows
  both *how many* cards to draw and *where each one goes* — including the case where
  the same card is played into two different spots.
- **Light formatting.** A small Markdown subset covers newlines and emphasis

---

## 1. File structure

One JSON object per file, UTF-8 encoded.

```json
{
  "deckName": "Main (v1.7)",
  "parentSet": "Cards Against Humanity",
  "cards": {
    "black": [],
    "white": []
  }
}
```

### Header fields

| Field | Required | Description |
|---|---|---|
| `deckName` | yes | Deck/expansion name. |
| `deckNumber` | no | Ordinal position of the deck within its parent set (e.g. `2` for the second expansion). Can omit when the deck name alone is unambiguous, e.g. a set's `"Base"` deck. |
| `parentSet` | yes | Name of the parent set, when the deck belongs to a series. |
| `cards` | yes | Object with `black` and `white` arrays. Either may be empty. |

---

## 2. Card objects

### White cards

```json
{ "id": 0, "text": "Drilling farts into the mattress" }
```

| Field | Required | Description |
|---|---|---|
| `id` | yes | Integer, unique among white cards in the deck. Number sequentially starting at 0. |
| `text` | yes | Card text. May contain formatting (§4). |

### Black cards

```json
{ "id": 0, "text": "No {1} November" }
```

| Field | Required | Description |
|---|---|---|
| `id` | yes | Integer, unique among black cards in the deck. Number sequentially starting at 0. |
| `text` | yes | Card text, with placeholders (§3). |

`id` values need only be unique within their own card type (black or white) in a
single deck.

---

## 3. Placeholders

### 3.1 Syntax

A placeholder is `{` followed by a positive integer followed by `}`: `{1}`, `{2}`,
`{3}`.

Numbering starts at 1 and must be contiguous — a card using `{1}` and `{3}` but not
`{2}` is invalid.


```json
{ "id": 5, "text": "{1}er? I hardly know 'er!" }
```

**Escaping.** To include a literal `{`, write `\{`.

### 3.2 Repeated placeholders

The same number may appear more than once. Every occurrence is filled with **the same
white card**:

```json
{
  "id": 6,
  "text": "I always remember \"{1}\" using the convenient mnemonic \"{1}\""
}
```

Distinct numbers mean **distinct white cards**:

```json
{
  "id": 7,
  "text": "I think it's pretty intuitive why {1} is ok but {2} is not."
}
```

### 3.3 Pick count

The number of white cards a black card requires is always derived: it's the count of
*distinct* placeholder numbers in `text`.

Black cards with no placeholders are also allowed - these are generally assumed to be
question-and-answer-style cards to which the white card would be appended.

---

## 4. Formatting

Card text supports a deliberately small Markdown subset:

| Syntax | Meaning |
|---|---|
| `*text*` | Italic |
| `**text**` | Bold |
| `\n` | Line break |

Emphasis uses **asterisks only**. Underscores are always literal, since black card
blanks are represented by placeholders. Each formatting character should be possible
to escape with a backslash, e.g. `\*`.

Everything else (links, headings, code, tables, blockquotes, lists) is out of scope. A
renderer encountering unsupported syntax should display it literally rather than
erroring. Since an implementation may use general-purpose Markdown parser / rendering
tools, it may be better to assume these features are supported (as well as proactively
using escape characters like `\_` for intentional underscores when creating decks.)

Example using both:

```json
{
  "id": 10,
  "text": "Myth: {1}\nFact: *Who cares?*"
}
```

---

## 5. Validation rules

A conforming deck satisfies all of:

1. `deckName`, `parentSet`, and `cards` are present.
2. All `id` values are unique within their card type (black or white) in the deck.
3. Every card has non-empty `text`.
4. Placeholder numbers on a black card are contiguous starting from 1.

---

## 6. Deck filtering

Decks loaded by an engine are identified for filtering purposes by a **qualified
name**: `<parentSet>[ <deckNumber>]: <deckName>` — the deck number is included only
when the deck defines one. This is the same string an engine should show as the
source of a drawn card.

A **pattern** matches a deck if it is a case-insensitive substring of that deck's
qualified name. A single pattern can therefore match several decks at once.

Two independent filters can be applied to a draw, each a comma-separated list of
patterns (a card qualifies if it matches *any* one of them — the patterns are
unioned, not intersected):

- **`allFrom`** — every card in the draw (the black card and all white cards) must
  come from a deck matched by one of the patterns.
- **`oneFrom`** — the draw as a whole must include at least one card, black or
  white, from a deck matched by one of the patterns. The remaining cards may come
  from anywhere `allFrom` allows.

An empty filter (no patterns, or omitted entirely) applies no restriction.

As one possible simple implementation, an engine could satisfy `oneFrom` by drawing a
normal hand and checking the condition afterward, retrying up to a bounded number of
attempts, and failing the draw if none of the attempts qualify. An unsatisfiable
combination — e.g. `oneFrom` naming a deck that `allFrom` already excludes — could simply exhaust the retry budget and fail accordingly.

---

## 7. Runtime configuration (config.json)

A `config.json` file alongside the deck files sets default values for the filters
described in §6, so a draw request doesn't have to specify them every time:

```json
{
  "allFrom": "",
  "oneFrom": ""
}
```

| Field | Required | Description |
|---|---|---|
| `allFrom` | no | Default `allFrom` pattern list, used when a draw request doesn't specify one explicitly. Defaults to `""` (no restriction). |
| `oneFrom` | no | Default `oneFrom` pattern list, used when a draw request doesn't specify one explicitly. Defaults to `""` (no restriction). |

**Loading.** An engine scanning a directory for deck files should skip `config.json`
rather than attempting to parse it as a deck. By convention, template/example files
meant to be copied rather than loaded — such as `config-sample.json` and
`sample-deck.json` — are also skipped.

---

## 8. Complete minimal example

```json
{
  "deckName": "Mini Example",
  "deckNumber": 2,
  "parentSet": "Cards Against Humanity",
  "cards": {
    "black": [
      { "id": 0, "text": "No {1} November" },
      { "id": 1, "text": "I think it's pretty intuitive why {1} is ok but {2} is not." },
      { "id": 2, "text": "What's the worst thing to find in your {1}?" },
      { "id": 3, "text": "What’s a good way to kill some time between the cradle and the grave?" }
    ],
    "white": [
      { "id": 0, "text": "Food UX" },
      { "id": 1, "text": "Personal attacks" }
    ]
  }
}
```
