//
//  MicProbe.swift
//  Codespire Notetaker — macOS microphone-usage probe.
//
//  A standalone Swift command-line executable (compiled with swiftc, see
//  mac/build.sh). It runs ONCE, prints its findings, and exits — the Electron
//  main process spawns it on a poll interval to detect meetings.
//
//  What it prints (stdout, one entry per line):
//    * macOS 14+ : the bundle identifier of every process CURRENTLY capturing
//      microphone input, e.g. "com.microsoft.teams2". The caller filters out our
//      own app; anything left means a call/meeting is live. Because this is
//      PER-APP, the caller can tell "Teams let go of the mic" apart from "we're
//      still recording", which is exactly what auto-STOP needs — the same
//      capability Windows gets from its per-app registry data.
//
//    * macOS < 14: the per-process Core Audio API does not exist, so we fall back
//      to a single GLOBAL check and print "system-input" if ANY process is using
//      the default input device. That is enough to auto-START a recording, but
//      the caller cannot separate our own recording from the call — so reliable
//      auto-STOP requires macOS 14+.
//
//  No output  => the microphone is idle (no meeting).
//  Exit code is always 0; errors just yield no output (treated as "idle").
//
//  Uses only the built-in CoreAudio system framework — no Apple Developer
//  account, no paid entitlement, and no extra permission prompt (it reads
//  read-only audio metadata, it does not capture anything).
//

import Foundation
import CoreAudio

let systemObject = AudioObjectID(kAudioObjectSystemObject)

// MARK: - Generic Core Audio property helpers

func hasProperty(_ obj: AudioObjectID, _ selector: AudioObjectPropertySelector) -> Bool {
    var addr = AudioObjectPropertyAddress(mSelector: selector,
                                          mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    return AudioObjectHasProperty(obj, &addr)
}

func uint32Prop(_ obj: AudioObjectID, _ selector: AudioObjectPropertySelector) -> UInt32? {
    var addr = AudioObjectPropertyAddress(mSelector: selector,
                                          mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    var value: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    let status = AudioObjectGetPropertyData(obj, &addr, 0, nil, &size, &value)
    return status == noErr ? value : nil
}

func stringProp(_ obj: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
    var addr = AudioObjectPropertyAddress(mSelector: selector,
                                          mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    var value: CFString? = nil
    var size = UInt32(MemoryLayout<CFString?>.size)
    let status = AudioObjectGetPropertyData(obj, &addr, 0, nil, &size, &value)
    if status == noErr, let s = value { return s as String }
    return nil
}

// MARK: - Per-app path (macOS 14+)

@available(macOS 14.0, *)
func processObjects() -> [AudioObjectID] {
    var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyProcessObjectList,
                                          mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(systemObject, &addr, 0, nil, &size) == noErr, size > 0 else { return [] }
    let count = Int(size) / MemoryLayout<AudioObjectID>.size
    var ids = [AudioObjectID](repeating: 0, count: count)
    guard AudioObjectGetPropertyData(systemObject, &addr, 0, nil, &size, &ids) == noErr else { return [] }
    return ids
}

@available(macOS 14.0, *)
func micInputUsers() -> [String] {
    var users: [String] = []
    for obj in processObjects() {
        // kAudioProcessPropertyIsRunningInput == 1 while the process captures the mic.
        guard let running = uint32Prop(obj, kAudioProcessPropertyIsRunningInput), running != 0 else { continue }
        let bundle = stringProp(obj, kAudioProcessPropertyBundleID) ?? ""
        users.append(bundle.isEmpty ? "unknown" : bundle)
    }
    return users
}

// MARK: - Global fallback (any macOS)

func defaultInputRunningSomewhere() -> Bool {
    guard let devID = uint32Prop(systemObject, kAudioHardwarePropertyDefaultInputDevice) else { return false }
    // kAudioDevicePropertyDeviceIsRunningSomewhere == 1 if ANY process uses the device.
    if let running = uint32Prop(AudioObjectID(devID), kAudioDevicePropertyDeviceIsRunningSomewhere), running != 0 {
        return true
    }
    return false
}

// MARK: - Entry point

if #available(macOS 14.0, *), hasProperty(systemObject, kAudioHardwarePropertyProcessObjectList) {
    for id in micInputUsers() { print(id) }
} else {
    if defaultInputRunningSomewhere() { print("system-input") }
}
exit(0)
