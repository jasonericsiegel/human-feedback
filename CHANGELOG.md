# Changelog

## 1.163.0 (2026-11-25)

- Your agent can suggest reactions that fit each message, including the question mark. Suggested icons stay bright and the others dim. All six reactions remain available.
- When you reopen the picker, your selected reaction shows its sticker colors at the same size as a hovered icon.
- Agent questions are bold again. Explanations and replies stay in regular type.

## 1.162.0 (2026-11-24)

- Threads that need the same answer can share one conversation and one Reply box. The original messages and dates stay visible.

## 1.161.1 (2026-11-24)

- Your agent can't mark a review Done while a question on it has no answer. It's told which questions are still open.
- Copied feedback ends with a "Still open" line naming the questions you haven't answered, so your agent doesn't have to guess.
- Updated and New notices sit beside the changed words. Select one to reply or react. One you leave alone doesn't count as an open thread.
- Ask a question on a notice, and it becomes a thread waiting for your agent's reply.
- Typing dots, your agent's messages, and your replies grow from their pointed corner. With Reduce Motion on, they appear without moving.
- Done clears the open-questions count.
- Fixed: a question you answered with a note could come back in a later round after its heading changed.
- Fixed: on a version already Done when it opened, your agent's cursor clicked Done in from off the window. It now clicks at the top of the notes.
- When a page is refused for missing its opening proof, your agent is told which template to copy.
- Fixed: a part named inside an HTML comment was counted as part of the page.

## 1.159.3 (2026-11-24)

- "Update available" also shows on reviews opened at a local web address (`127.0.0.1`). It used to show only on pages opened as files.
- Each review page opens with your ask, what you agreed to, and what your agent checked. A page missing any of that won't open for review until your agent adds it.
- Words you select in a note stay selected, so you can copy them.
- Fixed: a message from your agent could show `\n\n` instead of starting a new bubble.

## 1.158.1 (2026-11-23)

- A new round opens left to right. Your agent's cursor brings in the Outline and the page, then turns the round number, then types its messages.
- Each of your agent's clicks bursts two circles from the click point, in the notes too.
- Fixed: at Done, your agent's cursor sat above the dots it was typing.

## 1.157.0 (2026-11-23)

- Settled threads stop coming back. If you answered a question somewhere else, or a change made it moot, your agent closes it instead of carrying it into the next round.
- When a new version drops a part of the page, earlier threads on that part go with it.
- "Update available" shows only on a page made after the newer version came out. Older pages no longer say you're behind when you've already updated.
- The tab bar stays in view below the page's title bar as you scroll. Tabs inside a tab stick under the outer ones.
- Outline jumps land below the tab bar.
- Fixed: turning on notes could squeeze a list row into its first column.
- Fixed: a link in your agent's message could split it into two bubbles.
- Fixed: a link to a section now wraps with its sentence.
- Fixed: a long file path in the Done summary pushed the notes sideways.
- Fixed: a question that was already settled could stop your agent from marking a review Done.

## 1.153.8 (2026-11-20)

- The first opening shows a quiet page skeleton while it waits. The same agent cursor clicks, then wipes the page and Outline downward into place.
- The opening waits until you're looking at the page, so a tab opened in the background no longer starts it early or freezes partway.
- A later version of a page drawn by its own script opens on the skeleton, not on an empty copy of the version before.
- Pointing at the final agent bubble opens its emoji choices in the same place as pointing at its sticker circle.
- When you correct a page in chat instead of pasting notes, your agent marks it Received and Updating too.
- New marks a section or part your agent added in response to your notes. Updated marks changed content. Questions keep their open dot without a New label.
- Each item in a numbered list of proposed changes counts separately toward the three-question review trigger.
- Current agent messages use a lighter grey, and a thread stays fully visible while its emoji choices are open.
- Outline jumps keep headings below the page’s title bar.
- The Outline and notes have Auto, Light and Dark on every page, at the bottom of the Outline.
- The Overall box shows up to five lines and scrolls the rest.
- Pages your agent opens no longer pull you off the Chrome tab you're using.
- Your agent marks a review Done only when the work is finished. If you say it goes on, your agent makes a new version and leaves the review open. A Done marked by mistake can be undone.
- When your agent marks a review Done, the threads slide down under the summary, and the summary types itself in one section at a time.
- Replay stays in the bar after Done.
- Under Done, "N open" scrolls to the open thread.
- When your agent's cursor starts a thread, a line joins it to its words on the page, the same as when you select text.
- Later rounds show placeholders while they load instead of a blank page.
- Every approval or choice gets its own thread for your answer, even when its options take reactions.
- Your agent also opens a page when it asks you to approve a list, setting or rule it proposes, even as one yes or no.
- On a Mac, a new version shares unchanged pictures with the round before, so it takes far less disk space.

## 1.151.4 (2026-11-18)

- When a review is finished, your notes column shows a summary at the top: what your agent did, the final file, and next steps. Every thread from that round stays listed under it. Unlock opens the page for notes again.
- Your agent can mark the main changes it made from your notes. Each one is a thread with a green Updated label and a line on what changed. React or reply to check it off.
- Finished work your agent shows you, with nothing left to decide, opens already marked Done.
- Your agent also opens a page when it has three or more questions for you, or when it finishes a document or design for you.
- Your agent's questions have a dot while they wait for your answer.
- Messages in a thread are grouped by day. Point at a date to see the full date, time, and time zone.
- Once you scroll past the page's heading, its title stays at the top of the reading column. Point at it to see where the file is saved.
- Tooltips show as soon as you point at a control.
- Fixed: a review whose folder moved couldn't open its next round.
- Fixed: your agent's answer to a follow-up question showed under your earlier note, not under the question you asked.
- Fixed: the notes column jumping when you closed the last open thread.
- Fixed: a live preview inside a page could lose its own outline and notes.
- Fixed: the selection pill showing at the top left of the window, away from the words, on some pages.
- Smaller fixes to spacing and alignment in the notes column and outline.

## 1.147.8 (2026-11-12)

- Fixed the Round header growing taller while it shows Received and Updating. Your agent's cursor now points at the spinner, so its name stays clear of the thread controls.
- When deslop-writing isn't installed, your agent now says where to get it: github.com/jasonericsiegel/deslop-writing.

## 1.147.7 (2026-11-12)

First public release.

- Leave notes beside the parts of an HTML page you want to discuss: comment, react with an emoji, highlight, or rewrite words in place.
- Copy your notes to your agent and review its next version, with its answers under your questions.
- Step back through every version and the notes you left on it.
- Check whether the skill can save and open a page in your setup.
- Report a problem or idea from the About card, which also lists what's coming next.
- Sends no usage counts.
