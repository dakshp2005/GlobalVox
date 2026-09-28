// Downloads the small offline speech-recognition models used by the
// "Offline (on-device)" call mode into public/models/ (one-time, needs internet).
// After this, speech recognition works with no network at all.
//
//   node scripts/download-vosk-models.js          -> English + Hindi + Gujarati
//   node scripts/download-vosk-models.js en hi    -> only the listed languages

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const MODELS = {
  en: { name: "vosk-model-small-en-us-0.15", url: "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip" },
  hi: { name: "vosk-model-small-hi-0.22", url: "https://alphacephei.com/vosk/models/vosk-model-small-hi-0.22.zip" },
  gu: { name: "vosk-model-small-gu-0.42", url: "https://alphacephei.com/vosk/models/vosk-model-small-gu-0.42.zip" },
};

const outDir = path.join(__dirname, "..", "public", "models");
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MODELS);

function extractZip(zip, dest) {
  // bsdtar (Windows 10+, macOS) reads zip files; fall back to unzip on Linux.
  // Relative names + cwd: GNU tar treats "C:\..." as a remote host name.
  const opts = { cwd: dest, stdio: "ignore" };
  try {
    execFileSync("tar", ["-xf", path.basename(zip)], opts);
  } catch {
    execFileSync("unzip", ["-q", path.basename(zip)], opts);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const lang of wanted) {
    const m = MODELS[lang];
    if (!m) {
      console.error(`Unknown language "${lang}". Use: ${Object.keys(MODELS).join(", ")}`);
      process.exit(1);
    }
    const target = path.join(outDir, `${m.name}.tar.gz`);
    if (fs.existsSync(target)) {
      console.log(`${lang}: already downloaded`);
      continue;
    }
    console.log(`${lang}: downloading ${m.url}`);
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${m.url}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vosk-"));
    const zip = path.join(tmp, "model.zip");
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    extractZip(zip, tmp);
    // vosk-browser loads a .tar.gz whose top-level folder is the model folder.
    execFileSync("tar", ["-czf", path.basename(target), "-C", tmp, m.name], { cwd: outDir });
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`${lang}: saved ${path.relative(process.cwd(), target)}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
