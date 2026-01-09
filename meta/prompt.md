# Gear Optimizer Implementation Agent Prompt

Copy and paste this prompt to hand off to an agent:

---

You are implementing a gear optimizer feature for the osrs-dps-calc project. This is an iterative task - previous agents may have made progress.

### Step 1: Understand Context

Read these files to understand the project and what needs to be done:

1. `/home/felix/projects/poc/meta/osrs-dps-calc/meta/optimizer-implementation-plan.md` - High-level implementation plan
2. `/home/felix/projects/poc/meta/osrs-dps-calc/meta/optimizer-features.json` - Feature requirements with pass/fail status
3. `/home/felix/projects/poc/meta/osrs-dps-calc/meta/optimizer-progress.md` - Progress log from previous agents (if it exists)

### Step 2: Assess Current State

1. Check which features in `optimizer-features.json` have `"passes": true` vs `"passes": false`
2. Read `optimizer-progress.md` to see what the last agent worked on and any notes they left
3. Run `git log --oneline -10` in `/home/felix/projects/poc/meta/osrs-dps-calc/` to see recent commits

If this is the first run, all features will be `passes: false` and no progress file will exist.

### Step 3: Explore the Codebase

Before implementing, read the relevant existing code in `/home/felix/projects/poc/meta/osrs-dps-calc/`:

- `src/lib/PlayerVsNPCCalc.ts` - DPS calculation engine
- `src/lib/Equipment.ts` - Equipment handling
- `src/types/Player.ts` - Player types
- `src/types/State.ts` - State types
- `src/state.tsx` - State management patterns
- `src/worker/worker.ts` - Worker architecture

### Step 4: Pick ONE Feature to Implement

**CRITICAL: Work on exactly ONE feature at a time.** Do not try to implement multiple features in one session.

Pick the next incomplete feature in priority order:

**Phase 1 - Core Algorithm:**

- filter-001: Equipment filtering by slot
- filter-002: Equipment filtering by combat style
- opt-001: Evaluate single item's DPS contribution
- opt-002: Find best item for single slot
- opt-003: Build complete optimized loadout
- opt-004: Two-handed weapon handling
- opt-005: Ammunition requirements

**Phase 2 - Constraints:**

- filter-003: Budget filtering
- filter-004: Blacklist filtering
- opt-008: Total budget constraint
- data-001: Price data

**Phase 3 - Worker Integration:**

- worker-001: Run in web worker

**Phase 4 - UI:**

- ui-001 through ui-012

**Phase 5 - Polish:**

- Remaining features

### Step 5: Implement the Feature

1. Write the code for the ONE feature you selected
2. Verify it works (run tests, check types, manual verification)
3. Ensure the codebase is in a clean, working state

### Step 6: Commit Your Progress

After implementing the feature, commit to git:

```bash
cd /home/felix/projects/poc/meta/osrs-dps-calc
git add -A
git commit -m "feat(optimizer): [feature-id] - description of what was implemented"
```

Example: `git commit -m "feat(optimizer): filter-001 - equipment filtering by slot"`

### Step 7: Update Feature Status

Update `/home/felix/projects/poc/meta/osrs-dps-calc/meta/optimizer-features.json`:

- Change `"passes": false` to `"passes": true` for the completed feature

**CRITICAL RULES:**

- It is unacceptable to remove or edit feature descriptions - only change the `passes` field
- Only mark a feature as passing when it is fully implemented and working
- If you could not complete the feature, leave it as `passes: false`

### Step 8: Update Progress Log

Append to `/home/felix/projects/poc/meta/osrs-dps-calc/meta/optimizer-progress.md`:

```markdown
## [Date/Time]

**Feature completed:** [feature-id] - [description]

**What was implemented:**
- [bullet points of what you did]

**Files changed:**
- [list of files]

**Commit:** [commit hash]

**Notes for next agent:**
- [any context, gotchas, or suggestions]

**Next feature to work on:** [feature-id]
```

If you could NOT complete the feature:

```markdown
## [Date/Time]

**Feature attempted:** [feature-id] - [description]

**What was done:**
- [bullet points]

**Blocker:**
- [why you couldn't complete it]

**Files changed:**
- [list of files, if any]

**Recovery:**
- [how to continue or revert if needed]
```

### Step 9: Stop

After completing ONE feature, stop and report back. Do not continue to the next feature.

### Guidelines

- Follow existing code patterns in the osrs-dps-calc codebase
- Keep the optimizer in new files where possible
- Use TypeScript with proper types
- Leave the codebase in a clean, buildable state
- If something breaks, use `git revert` or `git checkout` to recover
- Prefer simple implementations over complex ones

### File Locations for New Code

Create these files as needed in `/home/felix/projects/poc/meta/osrs-dps-calc/`:

- `src/lib/Optimizer.ts` - Core optimizer algorithm
- `src/types/Optimizer.ts` - Optimizer types
- `src/app/components/optimizer/` - UI components

---

## Usage

1. Copy everything between the `---` markers above
2. Paste to a new agent conversation
3. The agent reads context, implements ONE feature, commits, and reports
4. Repeat until all features pass

## Recovery

If an agent leaves the codebase in a broken state:

```bash
cd /home/felix/projects/poc/meta/osrs-dps-calc
git log --oneline -10  # find last good commit
git revert HEAD        # revert last commit, or
git reset --hard <hash> # reset to known good state
```
