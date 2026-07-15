#!/usr/bin/env bash
#
# Build the macOS native helpers as universal (arm64 + x86_64) binaries into
# mac/build/. Both are ad-hoc signed so macOS 15+ will spawn them.
#
#   SystemAudioCapture  — ScreenCaptureKit system-audio capture (records the
#                         other participants).
#   MicProbe            — Core Audio per-app microphone-usage probe (meeting
#                         auto-detection / auto-stop).
#
# Run from the repository root:
#     bash mac/build.sh
#
# Requirements: macOS with Xcode / Command Line Tools (swiftc, lipo, xcrun,
# codesign). The per-app symbols in MicProbe need the macOS 14 SDK to COMPILE
# (GitHub's macos-latest runner has it); MicProbe still RUNS on macOS 13 via its
# global fallback.
#
set -euo pipefail

# Resolve paths relative to this script, so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
mkdir -p "$BUILD_DIR"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

# build_universal <source.swift> <out-name> [framework ...]
build_universal() {
  local src="$1"; local name="$2"; shift 2
  local frameworks=("$@")

  if [ ! -f "$src" ]; then
    echo "error: source not found: $src" >&2
    exit 1
  fi

  local out="$BUILD_DIR/$name"
  local arm="$BUILD_DIR/$name-arm64"
  local x86="$BUILD_DIR/$name-x86_64"

  local flags=(-O -swift-version 5 -sdk "$SDK_PATH")
  local fw
  for fw in "${frameworks[@]}"; do flags+=(-framework "$fw"); done

  echo "==> [$name] compiling arm64 slice"
  swiftc "${flags[@]}" -target arm64-apple-macos13.0 -o "$arm" "$src"

  echo "==> [$name] compiling x86_64 slice"
  swiftc "${flags[@]}" -target x86_64-apple-macos13.0 -o "$x86" "$src"

  echo "==> [$name] creating universal binary"
  lipo -create -output "$out" "$arm" "$x86"
  chmod +x "$out"

  # Ad-hoc sign (macOS 15+ can refuse to spawn an unsigned executable). `-` =
  # ad-hoc identity, no Apple Developer account needed. electron-builder does
  # NOT re-sign extraResources, so this signature is what ships in the .dmg.
  echo "==> [$name] ad-hoc signing"
  codesign --force --sign - "$out"
  codesign --verify --strict "$out" && echo "    signature OK"

  # Drop the per-arch temporaries; only the universal binary ships.
  rm -f "$arm" "$x86"
  lipo -info "$out"
  echo "==> [$name] done: $out"
  echo
}

build_universal "$SCRIPT_DIR/SystemAudioCapture.swift" "SystemAudioCapture" ScreenCaptureKit AVFoundation CoreMedia
build_universal "$SCRIPT_DIR/MicProbe.swift"           "MicProbe"           CoreAudio
