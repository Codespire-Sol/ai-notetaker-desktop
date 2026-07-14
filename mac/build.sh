#!/usr/bin/env bash
#
# Build the macOS system-audio capture helper as a universal (arm64 + x86_64)
# binary at mac/build/SystemAudioCapture.
#
# Run from the repository root:
#     bash mac/build.sh
#
# Requirements: macOS with Xcode / Command Line Tools (swiftc, lipo, xcrun).
#
set -euo pipefail

# Resolve paths relative to this script, so the script works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/SystemAudioCapture.swift"
BUILD_DIR="$SCRIPT_DIR/build"
OUT="$BUILD_DIR/SystemAudioCapture"

ARM_BIN="$BUILD_DIR/SystemAudioCapture-arm64"
X86_BIN="$BUILD_DIR/SystemAudioCapture-x86_64"

if [ ! -f "$SRC" ]; then
  echo "error: source not found: $SRC" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

SWIFT_FLAGS=(
  -O
  -swift-version 5
  -sdk "$SDK_PATH"
  -framework ScreenCaptureKit
  -framework AVFoundation
  -framework CoreMedia
)

echo "==> Compiling arm64 slice"
swiftc "${SWIFT_FLAGS[@]}" -target arm64-apple-macos13.0 -o "$ARM_BIN" "$SRC"

echo "==> Compiling x86_64 slice"
swiftc "${SWIFT_FLAGS[@]}" -target x86_64-apple-macos13.0 -o "$X86_BIN" "$SRC"

echo "==> Creating universal binary"
lipo -create -output "$OUT" "$ARM_BIN" "$X86_BIN"
chmod +x "$OUT"

# Drop the per-arch temporaries; only the universal binary ships.
rm -f "$ARM_BIN" "$X86_BIN"

lipo -info "$OUT"
echo "==> Built universal binary: $OUT"
