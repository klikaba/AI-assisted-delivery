# Client Profile Template

This folder is a template for creating a client/team profile that is:

- **Repo-by-repo configurable** (copy into each client repo, then edit)
- **Safe to upgrade** (use conformance tests to catch breakages)

## How To Use

1. Copy this folder to a new profile directory (either in `.agency/profiles/<client>` in the platform repo, or into a host repo as `.agency-profile/`):

```bash
cp -R .agency/profiles/_template .agency-profile
```

2. Edit `.agency-profile/.agency-project.json` to match the repo's reality.

3. Run deterministic conformance checks (no network):

```bash
./.agency/bin/agency test --profile .agency-profile
```

4. Optional: run live checks (requires auth and network):

```bash
AGENCY_DOCTOR_LIVE=1 ./.agency/bin/agency doctor
```

## Notes

- Treat `.agency-project.json` as the contract surface. Prefer config over prompt edits.
- If you must fork prompts per client, do it intentionally and add conformance tests for the forked prompt set.

