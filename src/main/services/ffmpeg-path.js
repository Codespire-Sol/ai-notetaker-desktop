// Resolve the bundled ffmpeg binary.
//
// In a packaged build the app is inside an asar archive, and you CANNOT execute a
// binary from inside an asar. package.json therefore unpacks ffmpeg-static (see
// `asarUnpack`), so the real file lives at:
//
//   resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg.exe
//
// but `ffmpeg-static` still reports the in-asar path. Node's fs transparently maps
// asar paths, however child_process.spawn does NOT — so we remap it ourselves.
// In development the path has no "app.asar" segment and is returned untouched.
import ffmpegStatic from 'ffmpeg-static'

export const ffmpegPath = (ffmpegStatic || '').replace('app.asar', 'app.asar.unpacked')

export default ffmpegPath
