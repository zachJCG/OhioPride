#!/usr/bin/env bash
# =============================================================================
# Ohio Pride PAC — deploy this PR bundle to the live repo.
# -----------------------------------------------------------------------------
# What this does:
#   1. Clones https://github.com/zachJCG/OhioPride.git to /tmp/OhioPride-deploy
#      (or reuses an existing checkout you point at with --repo PATH)
#   2. Copies admin/, supabase/migrations/, and scripts/ from this bundle in
#   3. Runs scripts/patch-admin-pages.mjs to wire responsive overlay everywhere
#   4. Creates a branch, commits, and (with --push) pushes to GitHub
#   5. Reminds you to apply the two SQL migrations in Supabase
#
# Usage:
#   bash deploy.sh                        # dry-run into /tmp, no push
#   bash deploy.sh --push                 # commit + push branch to origin
#   bash deploy.sh --repo ~/code/OhioPride --push    # use your existing checkout
# =============================================================================
set -euo pipefail

REPO_PATH=""
DO_PUSH=0
BRANCH="seed-bills-scorecard-admin-mobile"
BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO_PATH="$2"; shift 2;;
    --push) DO_PUSH=1; shift;;
    --branch) BRANCH="$2"; shift 2;;
    -h|--help) sed -n '2,20p' "$0"; exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [ -z "$REPO_PATH" ]; then
  REPO_PATH="/tmp/OhioPride-deploy"
  echo "→ Cloning fresh into $REPO_PATH ..."
  rm -rf "$REPO_PATH"
  git clone --depth 1 https://github.com/zachJCG/OhioPride.git "$REPO_PATH"
fi

cd "$REPO_PATH"
echo "→ Using repo at $(pwd)"
git checkout -B "$BRANCH"

echo "→ Copying admin/ ..."
cp "$BUNDLE_DIR/admin/admin-responsive.css"        admin/
cp "$BUNDLE_DIR/admin/admin-responsive.js"         admin/
cp "$BUNDLE_DIR/admin/bills/index.html"            admin/bills/index.html
cp "$BUNDLE_DIR/admin/legislators/index.html"      admin/legislators/index.html

echo "→ Copying supabase/migrations/ ..."
mkdir -p supabase/migrations
cp "$BUNDLE_DIR/supabase/migrations/20260519010000_seed_bills_and_legislators.sql" supabase/migrations/
cp "$BUNDLE_DIR/supabase/migrations/20260519020000_admin_write_policies_bills_scorecard.sql" supabase/migrations/

echo "→ Copying scripts/ ..."
mkdir -p scripts
cp "$BUNDLE_DIR/scripts/seed-from-static.mjs"      scripts/
cp "$BUNDLE_DIR/scripts/patch-admin-pages.mjs"     scripts/

echo "→ Patching every admin page to include the responsive overlay ..."
node scripts/patch-admin-pages.mjs --root "$REPO_PATH"

echo "→ Staging changes ..."
git add admin/ supabase/migrations/ scripts/

if git diff --staged --quiet; then
  echo ""
  echo "Nothing to commit — repo already matches the bundle."
  exit 0
fi

echo "→ Committing ..."
git commit -m "Seed bills + scorecard, /admin CRUD, mobile /admin

- Replace /admin/bills and /admin/legislators stubs with full CRUD pages
  (list, filter, add, edit, delete, plus per-bill pipeline grid and
  per-legislator sponsorship management with live score/grade recompute).
- Seed migration: 25 bills (with denorm fields), 132 legislators, 18
  sponsorships, 59 pipeline-step rows. Idempotent.
- RLS migration: lets users with ('bills','write') or ('legislators','write')
  edit from the browser. Super admins already have both.
- Mobile responsiveness pass on every /admin/* page (breakpoints at
  1100 / 820 / 600 / 380; tables stack into cards, drawer becomes a
  bottom sheet on phones, 40px+ tap targets, no iOS Safari zoom-on-focus)."

git log --oneline -1

if [ "$DO_PUSH" -eq 1 ]; then
  echo "→ Pushing branch $BRANCH ..."
  git push -u origin "$BRANCH"
  echo ""
  echo "✅ Pushed. Open a PR at:"
  echo "   https://github.com/zachJCG/OhioPride/pull/new/$BRANCH"
else
  echo ""
  echo "ℹ️  Dry run complete. Re-run with --push to send the branch to GitHub."
  echo "    Or cd $REPO_PATH and 'git push -u origin $BRANCH' yourself."
fi

cat <<EOF

----------------------------------------------------------------------
DON'T FORGET THE TWO SQL MIGRATIONS

In your Supabase project (dashboard → SQL editor, or via the CLI),
run these in order:

  1. supabase/migrations/20260519010000_seed_bills_and_legislators.sql
  2. supabase/migrations/20260519020000_admin_write_policies_bills_scorecard.sql

Both are idempotent. Re-running them is safe.
After the seed runs, /issues and /scorecard will show the live data
on next page load (Netlify function cache is ~5 min).
----------------------------------------------------------------------
EOF
