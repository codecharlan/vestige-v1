# Changelog

## 1.1.0

### Fixed the IDE freezes (IntelliJ)

The cause was uncancellable work holding the read lock. A keystroke needs the write
lock, and the write lock waits for every read action to release — which only happens
at a cancellation check. The plugin contained three, and several `catch` blocks were
swallowing `ProcessCanceledException` outright, so "background" analysis blocked
typing for its full duration.

Three things ran inside that lock:

- A duplicate-code scan comparing every extracted pattern against every line window
  of every other file, recompiling four regexes in the inner loop. Rewritten as an
  indexed clone detector: linear to build, fast to query, bounded, and cancellable.
- `generateOnboardingTour` ran a full tree diff for **every commit pair** — Kotlin's
  `filter` is eager, so `.take(3)` applied afterwards. It fired on every tab switch
  and every save. The diffs were also redundant: the path-filtered log already
  guaranteed what the predicate tested.
- Health scoring issued roughly 250 git calls from a panel constructor. It now
  samples once and runs as a visible, cancellable background task.

Also fixed: a `decorate → analyze → refresh → decorate` loop that could not terminate
once the cache began evicting; an access-order map read from the UI thread while
background threads wrote it; and a 3-second timer against a 60-second wall-clock cache
that guaranteed a fresh multi-second analysis every minute on a completely idle IDE.
Cache validity is now keyed on the file's modification stamp.

### Fixed: co-change analysis never worked

`getCoupledFiles` used `git log --name-only -- <path>`. Supplying a pathspec makes
`--name-only` list only the names matching that pathspec, so the single file returned
was the file itself, which was then discarded as self-coupling. **Co-change returned
an empty list for every file in every repository.** Every unit test passed throughout,
because the suite stubs git to return empty strings — indistinguishable from a
repository with no history.

There is now a real-git integration suite that builds repositories with known answers
and asserts the values.

### New

- **Files that change together.** After a save, the files git history shows usually
  change alongside this one — at most three, once per file per session, with the
  shared-commit count as evidence. Off via `vestige.coupledFileSuggestions`.
- **History of the selected lines** (`Ctrl/Cmd+Shift+L`), using `git log -L`.
- **CODEOWNERS audit.** Reports owners who never committed, owners inactive for six
  months, and lines the platform silently skips.
- **Who to ask.** Surfaces low-history contributors and names the file's main author.
- **AI without a key.** Uses an existing GitHub Copilot subscription where available;
  a stored key is the fallback. `vestige.disableAI` makes AI paths unreachable rather
  than idle.

### Removed

- **The leaderboard**, on both platforms. Ranking colleagues on git-derived statistics
  is not something this tool should do.
- **Invented numbers.** The "estimated remediation cost" was a score multiplied by a
  hardcoded hourly rate. A dashboard percentage and a "from last week" trend had no
  data behind them at all.
- **XP gating.** Features the extension advertises no longer refuse to run until you
  have earned enough credits.
- **Dead subsystems** with no reachable callers, including one with unbounded recursion.

### Security

- Command injection in the Time Travel panel: a webview-supplied commit hash was
  interpolated into a shell string. Now `execFile` with an argument vector and hash
  validation.
- The Time Machine wrote historical file contents to a temp directory and executed
  them with `node`. It no longer executes anything.
- Unescaped git data (author names, commit messages) in script-enabled webviews, with
  no Content-Security-Policy anywhere. All escaped; CSP on every panel.

### Interface

Both platforms now derive colour and type from the host editor's own theme and fonts
rather than a hardcoded dark palette that was unreadable on light themes. CodeLens
defaults to `risk-only`: at most one annotation per function, and only where history
indicates something.
