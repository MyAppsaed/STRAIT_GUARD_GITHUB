# GitHub Sync Status Banner

Add a dismissible banner to the game UI that appears after a revert (or any commit change), showing the current commit hash and whether that commit is synced to the linked GitHub repository.

## What will be built

1. Build-time commit injection
   - Extend `vite.config.ts` with a small inline plugin that runs `git rev-parse --short HEAD` and exposes it as `import.meta.env.VITE_GIT_COMMIT_HASH`.
   - Also expose the full message via `VITE_GIT_COMMIT_MESSAGE`.
   - If git is unavailable, fall back to a timestamp/build label so the banner never crashes.

2. `GitHubSyncBanner` component (`src/components/GitHubSyncBanner.tsx`)
   - Reads `VITE_GIT_COMMIT_HASH` on mount.
   - Compares it against the last-seen hash stored in `localStorage` (`sg_last_seen_commit`).
   - If the hash changed, the banner is shown automatically (this covers reverts and any other restore/reset).
   - If the hash is unchanged, the banner stays hidden unless the user opens it from a new Settings/About row.
   - Displays:
     - Commit short hash.
     - Commit message (truncated).
     - Sync status icon/label: checking → synced / out of sync / unavailable.
   - Dismiss button stores the current hash as "seen" and hides the banner.

3. GitHub sync check
   - Accept a repo identifier from an env var: `VITE_GITHUB_REPO` (format `owner/repo`).
   - On mount, fetch `https://api.github.com/repos/{owner}/{repo}/commits/{branch}` (branch = `main` or `VITE_GITHUB_BRANCH`).
   - Compare remote SHA with the build hash.
   - Show "Synced" when they match, "Out of sync" when different, and "Unable to check" on network/CORS/errors.
   - Cache the result in `sessionStorage` for the current load only; re-check on fresh app loads.

4. Localization
   - Add EN/AR strings in `src/game/StraitGuardGame.tsx` I18N map:
     - "Version restored", "Commit", "Sync status", "Synced", "Out of sync", "Checking...", "Dismiss".
   - Banner respects current language and RTL direction.

5. UI placement
   - Render the banner fixed at the top of `StraitGuardGame`, inside the safe-area wrapper so it never overlaps notches.
   - Use the existing navy/amber game palette (no hardcoded colors; reuse Tailwind semantic tokens or game utility classes).
   - Banner is non-blocking and dismissible; it does not intercept canvas input.

6. Settings integration
   - Add a small "Version / GitHub Sync" row in the settings/about panel so users can reopen the banner and see the hash on demand.

## Files to change

- `vite.config.ts` — add git-hash plugin.
- `src/components/GitHubSyncBanner.tsx` — new component.
- `src/game/StraitGuardGame.tsx` — mount banner, add I18N strings, add settings row.
- `src/styles.css` — no new tokens needed; reuse existing colors.

## Out of scope

- No backend or GitHub write operations.
- No polling; sync status is checked once per app load.
- Does not trigger Lovable/GitHub sync itself; it only reports the state.
