# Done

Read by SKILL.md step 8 once the loop has converged.

```bash
python3 "$SKILL_DIR/scripts/add_notes.py" <page.html> --converged \
  --what-changed "We picked A, the short list, and dropped B and C." --what-changed "We darkened the header." \
  --what-changed "We kept the sans headline, since Gmail swaps a serif for Times." \
  --next-step "You send it to the team." --next-step "Your agent wires up the real data."
```

- Run it after `--received` on their last paste, on any one version (the same path as `--received`). It writes a hidden `.<page file>.done.js` beside every version, which their open page reads within seconds.
- Small fixes the user asked for along with their approval → make them in a final version first (step 5, through its follow-up run), run `--converged`, then show it (step 3): the user opens it to Done, with Unlock if anything's off.
- `--what-changed`: the What we did bullets, 3 to 5 across every version from the first, each a short sentence starting "We". Only changes that matter to the user, never housekeeping ("We dropped the options you passed over" is too small). A note of theirs you didn't carry out, or did differently, gets one too, with why. At least one.
- `--next-step`: one per thing that happens now the review is done, starting with who does it: "You …" for the user, "Your agent …" for you. Leave it out when nothing's next.
- The script warns on a bullet that doesn't start with "We", on more than 5, and on a next step that doesn't start with "You" or "Your". Fix the words and re-run.
- Put them all through the plain-words pass first (step 6).
- Their page: your cursor (parked beside Updating, else flying in) clicks the bar's state, and the bar turns green and reads Done, with a circled check, beside the round's number, and a summary covers their notes: What we did (rounds, notes and your bullets), Final file, and Next steps. The Overall box and Copy give way to Unlock until the user unlocks. It plays once, when it lands or the next time the user looks. Their Unlock reopens the loop: carry on from step 4 with their next paste. A new version or `--next-round` takes the done back.
- Then tell the user in one chat line that you've called it done, and that Unlock reopens it.
