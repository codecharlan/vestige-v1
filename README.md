# Vestige

**Know what you're about to break.** Vestige reads your git history and answers the questions that matter right before you change code: what else changes with this file, who actually knows it, and what decisions already constrain it.

It runs entirely on your local git history. No account, no sign-in, no telemetry, and nothing is computed until you ask for it.

---

## What it's for

Most git tooling answers a *spatial* question — "who wrote each line of this file". That's already built into VS Code and IntelliJ, and GitLens does it for 52 million people. Vestige answers the questions those tools don't:

### Files that change together

When you save a file, Vestige tells you which files git history says usually change with it:

> `auth-service.ts` usually changes with this file — 11 shared commits (73%).

This is the feature to try first. Co-change analysis is well-established in research and shipped commercially, but there is essentially no in-editor implementation of it. It's a suggestion, not an alarm: at most three files, once per file per session, always with the shared-commit count so you can judge it yourself.

`Vestige: Files That Change With This One` · disable with `vestige.coupledFileSuggestions`

### Who to ask

If you're about to change a file you have almost no history with, Vestige says so and names the person who does:

> You've authored 3% of this file; Alice has 80%.

This is the one ownership signal with strong empirical support — the count of contributors with a small share of a file's history predicted defects better than any other metric Microsoft measured across Windows Vista and 7. It's framed as a review suggestion, never as a score about a person.

`Vestige: Find Experts for This File`

### History of a selection

Select a few lines and get the history of *those lines* — not the whole file:

`Ctrl+Shift+L` / `Cmd+Shift+L`

Blame tells you who touched a line last. This tells you how the block got to look the way it does, using `git log -L`.

### CODEOWNERS that tells the truth

Your CODEOWNERS file is hand-maintained and nothing validates it. GitHub silently skips malformed lines, stops loading the file entirely past 3MB, and never checks whether an owner has ever committed or has since left. Vestige compares it against real history:

`Vestige: Audit CODEOWNERS Against History`

### Recovering deleted code

Browse files deleted from the repository and restore them. IntelliJ's Local History covers the last five days; this covers anything git remembers.

`Vestige: Show Code Graveyard`

### Decisions in the gutter

If you keep architectural decision records, Vestige links them to the code they constrain and surfaces them where the change is being made.

---

## Also included

| Feature | What it does |
|---|---|
| **File timeline** | Commit history with coupling, epochs, and bus factor for one file |
| **Code Historian** | Ask a question about a file; answers are shown *with the commits they're based on* |
| **Zombie detection** | Code that hasn't moved while the file around it did |
| **Documentation drift** | Docs whose sibling code has moved on without them |
| **Hot potato files** | Unusually high author turnover |
| **Debt ranking** | A relative churn × size × age ordering, to decide what to open first |
| **Architecture map** | Emergent modules from co-change clustering across the repo |
| **Time travel** | Scrub a file through its revisions |

---

## Honest limits

Worth knowing before you rely on any number here:

- **The debt score is a ranking, not a measurement.** It orders files within one repository. It is not comparable across repositories and is never shown as money or hours — converting an arbitrary score into a dollar figure produces a confident number with no basis behind it.
- **Co-change is a suggestion.** Published precision is around 0.26–0.30, but the top-three hit rate is 64–70% and the false-alarm rate is about 2%. Useful for "also look here", not for gating anything. It degrades on fast-growing codebases.
- **Bus factor is deliberately de-emphasised.** Published estimators have a mean error above 5 on a small-integer quantity, and roughly 44% of what people know lives in channels git cannot see. Vestige reports minor-contributor risk instead, which has real support.
- **Blame is poisoned by reformatting.** A whitespace commit or a squash-merge can make history attribute code to whoever ran the formatter. Treat authorship near such commits with suspicion.
- **AI answers are shown with their sources.** The specific failure of AI code comprehension is inventing a plausible, wrong reason code exists. Every answer is displayed next to the commits and decisions it was drawn from so you can check it.

There is no leaderboard and no per-person productivity metric, and there won't be. Vestige reports facts about the codebase, not facts about people.

---

## Setup

```bash
npm install
npm run compile
# Press F5 in VS Code to launch the Extension Development Host
```

### AI features (optional)

Everything above except the Historian, Archaeologist and Resurrection Mode works without AI.

If you have **GitHub Copilot**, AI features use it automatically — no key needed. Otherwise run **`Vestige: Set OpenAI API Key`**, which stores the key in VS Code Secret Storage rather than settings.

To turn AI off completely, set `vestige.disableAI`. That makes every AI path unreachable rather than merely idle, for environments where an installed AI component is itself the problem.

---

## Configuration

```json
{
  "vestige.coupledFileSuggestions": true,
  "vestige.coupledFileThreshold": 50,
  "vestige.codeLensMode": "risk-only",
  "vestige.disableAI": false,
  "vestige.fossilThreshold": 365,
  "vestige.churnThreshold": 10,
  "vestige.zombieAgeDays": 365,
  "vestige.driftDays": 30,
  "vestige.hotPotatoAuthors": 5,
  "vestige.collabWebhookUrl": ""
}
```

`codeLensMode` defaults to `risk-only`: at most one annotation per function, and only where history indicates something — a recorded decision, a churn hotspot, long stagnation, or concentrated ownership. Set `detailed` for author and age above every function, or `off` for none.

### Keybindings

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd+Shift+L` | History of the selected lines |
| `Ctrl/Cmd+Shift+H` | Ask the Code Historian |

---

## Development

```bash
npm run test:unit   # unit tests
npm run lint        # eslint
```

The `intellij/` directory contains the IntelliJ IDEA plugin (Kotlin + JGit). See [SETUP.md](SETUP.md) for build instructions — note it must be verified with a clean build, as incremental compilation has previously masked a file that never compiled.

---

## License

See [LICENSE.md](LICENSE.md).
