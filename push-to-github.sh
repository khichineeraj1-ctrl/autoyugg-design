#!/bin/bash
cd "$(dirname "$0")"

# Remove stale lock if exists
rm -f .git/index.lock 2>/dev/null

# Make sure remote is set
git remote remove origin 2>/dev/null
git remote add origin git@github.com:khichineeraj1-ctrl/autoyugg-design.git

# Stage all files
git add -A

# Commit
git commit -m "Latest: all-brands theme fix, editor pages, AI assistant, lead form enhancements"

# Push (force if repo was just created)
git branch -M main
git push -u origin main

echo ""
echo "✅ Done! Check https://github.com/khichineeraj1-ctrl/autoyugg-design"
