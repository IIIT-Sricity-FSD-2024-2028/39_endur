# Releasing Endur

Every version that goes live gets a git tag, a [CHANGELOG.md](CHANGELOG.md) entry and a
[GitHub Release](https://github.com/IIIT-Sricity-FSD-2024-2028/39_endur/releases) with the
built app attached. So for any version you can see what changed, what code it was, and
redeploy it.

## Version numbers

[Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`, tagged with a lowercase `v`.

| Bump  | When                                                              | Example           |
| ----- | ----------------------------------------------------------------- | ----------------- |
| MAJOR | A rewrite, or a change that breaks existing data, URLs or the API | `3.0.0` → `4.0.0` |
| MINOR | New features that keep everything else working                    | `3.0.1` → `3.1.0` |
| PATCH | Bug fixes only                                                    | `3.1.0` → `3.1.1` |

## Branches

- `main` is always deployable. Nothing is committed to it directly; everything arrives by PR.
- Work happens on short-lived branches named for what they do: `feat/…`, `fix/…`,
  `chore/…`, `docs/…`.
- While working, add a line for each user-visible change under `## [Unreleased]` in
  CHANGELOG.md, in the same PR.

## Making a release

1. **Release PR.** From an up-to-date `main`, create a branch `release/vX.Y.Z` and:
   - In CHANGELOG.md, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a new empty
     `## [Unreleased]` above it, and update the compare links at the bottom.
   - Bump the version without tagging: `npm version X.Y.Z --no-git-tag-version`
   - Commit as `chore(release): vX.Y.Z`, open a PR, and merge it.
2. **Deploy** from the merged `main`:
   ```bash
   git checkout main && git pull
   bash scripts/deploy-azure.sh            # add --migrate if the release has new migrations
   ```
3. **Tag** the deployed commit and push the tag:
   ```bash
   git tag -a vX.Y.Z -m "Endur vX.Y.Z"
   git push origin vX.Y.Z
   ```
4. **Release.** The tag starts [.github/workflows/release.yml](.github/workflows/release.yml),
   which builds that commit, checks the tag matches `package.json` and has a changelog
   entry, and publishes the GitHub Release with `endur-vX.Y.Z.zip` attached. Check it on
   the repository's Actions tab.

## Rolling back

Redeploy the previous tag:

```bash
git checkout vX.Y.Z
bash scripts/deploy-azure.sh
git checkout main
```

This only works if the newer release did not change the database in a way the older code
cannot handle. For that reason, database changes are made in two releases
(expand/contract): first ship code that no longer needs the old column or table, and remove
it from the database in a later release.

## Running a release zip by hand

The zip attached to each release is the built app with its runtime packages. Unzip it, set
the environment variables listed in `.env.example`, and run:

```bash
cd src/backend && node --conditions=compiled dist/server.js
```
