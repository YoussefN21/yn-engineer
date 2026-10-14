#!/usr/bin/env bash
# Publishes the files served through window.YN_MEDIA (index.html) as a
# commit on the "media" branch and prints its hash for YN_MEDIA.
#
#   bash tools/push-media.sh
#
# Why: jsDelivr's /gh/ endpoint refuses any commit whose whole repo
# snapshot is over 50 MB, and the full site is bigger than that. The media
# commit holds only these paths (as committed, from the index), so it stays small.
# Add a path here if new code starts loading it through YN_MEDIA.
set -euo pipefail
cd "$(dirname "$0")/.."

PATHS=(assets/gigs assets/images/mfg assets/models 'assets/video/showreel*')

idx="$(mktemp)"; trap 'rm -f "$idx"' EXIT
rm -f "$idx"
git ls-files -s -- "${PATHS[@]}" | GIT_INDEX_FILE="$idx" git update-index --index-info
tree="$(GIT_INDEX_FILE="$idx" git write-tree)"
parent="$(git rev-parse -q --verify origin/media || true)"
commit="$(git commit-tree "$tree" ${parent:+-p "$parent"} -m "Media snapshot for jsDelivr (from $(git rev-parse --short HEAD))")"
git push -q origin "$commit:refs/heads/media"

size="$(git ls-tree -r -l "$commit" | awk '{s+=$4} END {printf "%.1f", s/1048576}')"
echo "media commit: $commit (${size} MB; jsDelivr limit 50 MB)"
echo "YN_MEDIA = https://cdn.jsdelivr.net/gh/YoussefN21/yn-engineer@$commit/"
