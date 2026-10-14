#!/usr/bin/env bash
# Copies the finished Fiverr gig films and gallery images into the website,
# compressed for the web the same way as the existing showreel.
#
#   bash tools/prep-gig-media.sh [FiverrVideo folder]
#
# Default source: E:\Business\FiverrVideo (Git Bash path /e/Business/FiverrVideo).
# Needs ffmpeg on PATH. Writes to assets/gigs/gig1..gig4/:
#   promo-480.mp4 / promo-720.mp4 / promo-1080.mp4   (gigs 2-4; gig 1's film is the showreel)
#   poster.webp + poster.jpg                         (first frame after the hook)
#   gallery-N.webp (1920 px, lightbox) + gallery-N-thumb.webp (720 px, page)
#
# Afterwards: commit + push, then put that commit's hash in YN_MEDIA in
# index.html so the new files are served from jsDelivr.
set -euo pipefail

SRC="${1:-/e/Business/FiverrVideo}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/gigs"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found on PATH" >&2; exit 1; }

need() { [[ -f "$1" ]] || { echo "Missing: $1" >&2; exit 1; }; }

# Gallery: prefer the lossless PNG render, fall back to the JPEG.
gallery() {   # gallery <gig> <source base without extension> <n>
  local gig="$1" base="$2" n="$3" in
  if [[ -f "$base.png" ]]; then in="$base.png"; else in="$base.jpg"; fi
  need "$in"
  mkdir -p "$OUT/$gig"
  ffmpeg -v error -y -i "$in" -vf "scale=1920:-2:flags=lanczos" -c:v libwebp -quality 86 -compression_level 6 "$OUT/$gig/gallery-$n.webp"
  ffmpeg -v error -y -i "$in" -vf "scale=720:-2:flags=lanczos"  -c:v libwebp -quality 82 -compression_level 6 "$OUT/$gig/gallery-$n-thumb.webp"
  echo "  $gig gallery-$n  <- $(basename "$in")"
}

# Film: same x264 settings as assets/video/showreel-*.mp4 (CRF 27-28,
# veryslow, 1 s keyframes for snappy seeking, faststart for streaming).
film() {      # film <gig> <source mp4> <poster time in seconds>
  local gig="$1" in="$2" at="$3"
  need "$in"
  mkdir -p "$OUT/$gig"
  local enc=(-c:v libx264 -preset veryslow -profile:v high -pix_fmt yuv420p -g 30 -movflags +faststart)
  ffmpeg -v error -y -i "$in" -vf "scale=-2:480:flags=lanczos"  "${enc[@]}" -crf 28 -c:a aac -b:a 64k  "$OUT/$gig/promo-480.mp4"
  ffmpeg -v error -y -i "$in" -vf "scale=-2:720:flags=lanczos"  "${enc[@]}" -crf 27 -c:a aac -b:a 96k  "$OUT/$gig/promo-720.mp4"
  ffmpeg -v error -y -i "$in" -vf "scale=-2:1080:flags=lanczos" "${enc[@]}" -crf 28 -c:a aac -b:a 112k "$OUT/$gig/promo-1080.mp4"
  ffmpeg -v error -y -ss "$at" -i "$in" -frames:v 1 -vf "scale=1280:-2:flags=lanczos" -c:v libwebp -quality 80 "$OUT/$gig/poster.webp"
  ffmpeg -v error -y -ss "$at" -i "$in" -frames:v 1 -vf "scale=1280:-2:flags=lanczos" -q:v 4 "$OUT/$gig/poster.jpg"
  echo "  $gig film     <- $(basename "$in") ($(du -h "$OUT/$gig/promo-720.mp4" | cut -f1) at 720p)"
}

echo "Gig 1 - Gym equipment design -> manufacturing"
for n in 1 2 3; do gallery gig1 "$SRC/renders/gig1-gallery-$n" "$n"; done

echo "Gig 2 - Rapid SOLIDWORKS 3D modeling + drawings"
for n in 1 2 3; do gallery gig2 "$SRC/Gig2/renders/gig2-gallery-$n" "$n"; done
film gig2 "$SRC/Gig2/renders/gig2-promo-final-v2.mp4" 6

echo "Gig 3 - Sheet metal + DXF for laser cutting"
for n in 1 2 3; do gallery gig3 "$SRC/Gig3/renders/gig3-gallery-$n" "$n"; done
film gig3 "$SRC/Gig3/renders/gig3-promo-final.mp4" 6

echo "Gig 4 - Dumbbells, kettlebells, weight plates"
for n in 1 2 3; do gallery gig4 "$SRC/Gig4/renders/dumbbell-gig-gallery-$n" "$n"; done
film gig4 "$SRC/Gig4/renders/gig4-promo-final.mp4" 4

echo
du -sh "$OUT"
echo "Done. Check the posters (assets/gigs/*/poster.webp); if one lands on a"
echo "transition, re-run film() for that gig with a different time."
