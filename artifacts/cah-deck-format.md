# CAH Deck Format — Specification

A JSON format for representing Cards Against Humanity–style decks in a form a game
engine can consume directly.

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

Every black card must contain at least one placeholder — a black card with no
placeholders is invalid.

---

## 4. Formatting

Card text supports a deliberately small Markdown subset:

| Syntax | Meaning |
|---|---|
| `*text*` | Italic |
| `**text**` | Bold |
| `\n` | Line break |

Emphasis uses **asterisks only**. Underscores are always literal, since black card
blanks are represented by placeholders.

Everything else (links, headings, code, tables, blockquotes, lists) is out of scope. A
renderer encountering unsupported syntax should display it literally rather than
erroring.

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
4. Every black card contains at least one placeholder, and placeholder numbers are
   contiguous starting from 1.

---

## 7. Complete minimal example

```json
{
  "deckName": "Mini Example",
  "cards": {
    "black": [
      { "id": 0, "text": "No {1} November" },
      { "id": 1, "text": "I think it's pretty intuitive why {1} is ok but {2} is not." },
      { "id": 2, "text": "What's the worst thing to find in your {1}?" }
    ],
    "white": [
      { "id": 0, "text": "Food UX" },
      { "id": 1, "text": "Personal attacks" }
    ]
  }
}
```
