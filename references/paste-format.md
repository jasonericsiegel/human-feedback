# The pasted notes

Read by SKILL.md step 4 on every paste. What each line of the copied text means.

On a plain page the copy looks like this:

```
Apply these notes using the human-feedback skill after reading its paste-format reference.

Notes on /path/to/project/pages/2026-10-19-icons.html (5)

1. [Option B · Calm] "the rounded corners"
   Too soft; try 6px.

2. [Everything together]
   Cut this card.
   Image: /path/to/project/.human-feedback/feedback-20261019-104107-Screenshot-2026-10-19-at-10.41.07.png

3. [Option A · Bold] 👍

4. [Headline] edited:
   was: Most teams skip the eval step.
   now: Most teams skip the eval step. Don't.

Overall:
   Closer. Keep the dark header.

Highlighted, no note (2):
   [Option A · Bold] «Bold headline»
   [Option B · Calm] «lighter header»
```

`Highlighted, no note` lists words the user only marked with the pop-up's Highlight (no comment, no row). A highlight is their own marking, for the user alone: never act on one, answer it, mark it done, ask about it, or carry it into the Done summary (step 8). Only their notes, edits, reactions, answers and Overall words ask anything of you.

When the page asked the user questions, a `Your questions` block comes right after the first line:

```
Your questions

Q1. [Option B · Calm] "the rounded corners" Should the cards match?
   Yes, match them.

Q2. Ship this round tonight?
   (no answer)
```

When the user answered one of your replies to their notes (step 7), a `Your replies` block follows:

```
Your replies

R1. [Option B · Calm] "the rounded corners"
   Note: do these match the buttons?
   You replied: They didn't. Both are 6px now.
   Answer: 👍 Good.
```

- The first line says how to read the paste: a fresh session loads the human-feedback skill and reads this file. Mid-session it asks nothing new.
- `Notes on <path>` names the page: its full path on a local page, its repo-relative name on one served over http.
- `[Label]` is the part. `"quote"` is the exact text the user selected in it; a long quote is clipped as `start … end`. No quote means the note is about the whole part.
- `(image shot-a.png)` after the label means their selection took in that picture: its file name, else its alt text, else `image N` (the Nth picture in the part). With a quote too, the note is about both; `(images a.png, b.png)` names several.
- `Image: <path>` under a note, an answer (`Qn.` or `Rn.`, after its `Answer:` lines; a picture alone answers it), or Overall is a picture the user attached (a screenshot, usually): a copy the page saved in your workspace's `human-feedback/attachments/` folder, which `add_notes.py` makes (step 2), so the path is absolute and readable; in a browser that can't, on a page served over http, or on a page tagged before 1.83.0, it's in their Downloads folder. On the page their pictures sit above their words, as in a messaging app; the copy still puts their `Image:` lines after their words. Read each one before acting on what it's under. `Image: (not saved)` means the user attached one but didn't let the page save it: if the note depends on it, ask the user for the picture.
- A ✅ ❓ 👍 👎 ❤️ 🎉 after the label or quote is a quick reaction in place of words. Read what it means from the thread it answers, not from a fixed list: a ✅ can mean OK or yes, and a 👍 usually means agreement. Never tell the user which reaction to use for an answer; any reaction or words will do (the user, 2026-11-08: "check could mean ok or yes depending on the context. thumbs up is generally agree. but that shoudl be left to the llm judgment, not embedded in the skill"). ❓ means the user has a question about those words. Answer in a Notes reply on the next version (SKILL.md step 7). Words under it go with it. Doubled (👍👍) means the user held it on big: the same reaction, stronger.
- `[Label] edited:` is a line, paragraph or other block of words in that part (a heading, a list item, a box of text such as a bio) the user rewrote themselves: `was:` is the page's words, to find in the source; `now:` their exact new words; `now: (cleared)` means the user emptied it. `[Label] edited N blocks:` is one change over several blocks in a row of that part (paragraphs, list items, headings, a sign-off): `was:` holds each block's page words on its own numbered line, `¶1`, `¶2` and on, in page order, and `now:` the same numbered lines with their words, `(removed)` for a block that goes. Apply it block by block: each block's words become its `now:` line, and a `(removed)` block's element is deleted. A picture or other non-text between them is not part of the edit and stays. `[Page] edited:` is one outside every part (the title, an intro line), with the same `was:` and `now:` lines.
- An edit inside a local iframe adds `Frame: <src>` beneath its heading. Resolve that source relative to the review page and apply the `was:` and `now:` lines in the framed file. A framed highlight lists its source in parentheses and follows the same rules as other highlights.
- `Overall:` is about the whole page.
- `Qn.` is one of your `--ask` questions, as you asked it, with their reply under it; `(no answer)` means the user left it; if the decision still needs their input, put the question in the relevant part of the page (SKILL.md step 6). `(answered by notes on this part)` means the user left no reply but left notes or reactions on that part, which closed the question: read the notes with that `[Label]` as the answer, and if they don't answer it, put the question in that part of the page. A reply can start with a reaction emoji (👍 or 👍👍), read the same way as on a note. The user replies once per thread: once the user has, the Reply box goes, and the user changes their reply by clicking it. A copy from before 1.83.0 can hold several, each its own `Answer:` line, oldest first.
- `[[Part label]]` in your own words (`Qn.` or `You replied:`) is a link you wrote to that part. Pass it back unchanged when a command asks for the question as asked.
- `Rn.` is one of your `--reply` answers: `Note:` is their note, `You replied:` your answer, and `Answer:` what the user said back (words, a reaction emoji, or both), one `Answer:` line (several only in a copy from before 1.83.0). Replies the user didn't answer aren't copied.

On a page with versions, the copied text gathers this round's notes from every version:

```
Apply these notes using the human-feedback skill after reading its paste-format reference.

Feedback on Video backgrounds: 2 notes on 2 of 3 versions. Latest is Round 3 "Floor plan".

Versions
Round 3 "Floor plan" (latest): /path/to/project/pages/backgrounds/round-3.html
Round 1 "Golden hour": /path/to/project/pages/backgrounds/round-1.html

Overall
Close. Bring back some of the warmth from round 1.

Notes on Round 3 "Floor plan" (latest)

1. [2 · Desk corner] "focused where your face will be" 👍

Notes on Round 1 "Golden hour"

2. [1 · City window] "Real golden hour is softer"
   I still like this light better than round 3.
```

- `Versions` names the file behind each heading. A note under `Notes on Round 1` is about that file: find its part and quote there, then carry what the user asks into the next version.
- `Overall` is about the whole round, not one version.
