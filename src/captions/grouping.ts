// Caption grouping shared by the burned-in subtitles and the SRT export, so
// both always show the same words at the same times. No runtime imports:
// Node can load this file directly (type stripping) for scripts.

export type Word = { text: string; startMs: number; endMs: number };
export type CaptionGroup = { text: string; startMs: number; endMs: number; words: Word[] };
export type GroupingRules = { wordsMin: number; wordsMax: number; gapBreakMs: number };

const word = (c: Word) => c.text.trim();
const endsClause = (text: string) => /[.,?!]$/.test(text);

// Cuts a clause into n groups whose on-screen times are as even as possible
// (fast speech should not leave a group up for a fraction of a second), while
// keeping every group between wordsMin and wordsMax words when the clause allows.
function splitByTime(clause: Word[], n: number, rules: GroupingRules): Word[][] {
  if (n <= 1) return [clause];
  const minW = Math.min(rules.wordsMin, Math.floor(clause.length / n));
  const start = clause[0].startMs;
  const total = clause[clause.length - 1].endMs - start;
  const chunks: Word[][] = [];
  let from = 0;
  for (let k = 1; k < n; k++) {
    const remainingGroups = n - k;
    const target = start + (total * k) / n;
    let best = -1;
    for (let i = from + minW; i <= clause.length - remainingGroups * minW; i++) {
      // This piece and every remaining piece must fit within wordsMax.
      if (i - from > rules.wordsMax || clause.length - i > remainingGroups * rules.wordsMax) continue;
      if (best === -1 || Math.abs(clause[i].startMs - target) < Math.abs(clause[best].startMs - target)) best = i;
    }
    if (best === -1) best = Math.min(clause.length - remainingGroups, from + Math.ceil((clause.length - from) / (remainingGroups + 1)));
    chunks.push(clause.slice(from, best));
    from = best;
  }
  chunks.push(clause.slice(from));
  return chunks;
}

// Splits words into 3-6 word groups: clauses end at the speaker's punctuation
// or a real pause, tiny clauses merge forward, and long clauses split evenly
// so no group is left with a single orphaned word.
export function groupCaptions(words: Word[], rules: GroupingRules): CaptionGroup[] {
  const clauses: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && prev && w.startMs - prev.endMs >= rules.gapBreakMs) {
      clauses.push(cur);
      cur = [];
    }
    cur.push(w);
    if (endsClause(word(w))) {
      clauses.push(cur);
      cur = [];
    }
  });
  if (cur.length) clauses.push(cur);

  // Tiny clauses never stand alone when the speech flows on:
  // a lead-in ("Actually,", "So,") joins the clause after it, and a short
  // sentence ending ("everything.", "di ba?") joins the clause before it.
  const endsSentence = (c: Word[]) => /[.?!]$/.test(word(c[c.length - 1]));
  const merged: { words: Word[]; allowOneOver: boolean }[] = [];
  for (const clause of clauses) {
    const last = merged[merged.length - 1];
    const gap = last ? clause[0].startMs - last.words[last.words.length - 1].endMs : Infinity;
    const flows = last && gap < rules.gapBreakMs && !endsSentence(last.words);
    // A lead-in shorter than wordsMin joins the next clause even across a
    // hesitation of up to 1.5 s ("Yung … Claude na yung nag-unit test").
    const leadIn = last && !endsSentence(last.words) && last.words.length < rules.wordsMin && gap < 1500;
    if (leadIn || (flows && last.words.length < rules.wordsMin)) {
      last.words.push(...clause);
    } else if (flows && clause.length < rules.wordsMin && endsSentence(clause) && last.words.length + clause.length <= rules.wordsMax + 1) {
      last.words.push(...clause);
      last.allowOneOver = true;
    } else {
      merged.push({ words: [...clause], allowOneOver: false });
    }
  }

  const groups: CaptionGroup[] = [];
  for (const { words: clause, allowOneOver } of merged) {
    // A tag question may make one group a word longer; otherwise long clauses
    // split into the fewest groups of at most wordsMax words.
    const n = allowOneOver && clause.length <= rules.wordsMax + 1 ? 1 : Math.ceil(clause.length / rules.wordsMax);
    for (const chunk of splitByTime(clause, n, rules)) {
      groups.push({
        // Trailing commas and periods dropped; ? and ! kept.
        text: chunk.map(word).join(" ").replace(/[.,]+$/, ""),
        startMs: chunk[0].startMs,
        endMs: chunk[chunk.length - 1].endMs,
        words: chunk,
      });
    }
  }
  return groups;
}
