import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { startBuild, getJob } from '../apkBuilder.js';
import type { BuildConfig } from '../apkBuilder.js';

const router = Router();

/* POST /api/apk/build */
router.post('/build', async (req, res) => {
  try {
    const jobId = await startBuild(req.body as BuildConfig);
    res.json({ jobId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* GET /api/apk/status/:jobId */
router.get('/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  res.json({ status: job });
});

/* GET /api/apk/download/:jobId */
router.get('/download/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job || job.stage !== 'done' || !job.outputPath) {
    res.status(404).json({ error: 'APK not ready' }); return;
  }
  if (!fs.existsSync(job.outputPath)) {
    res.status(404).json({ error: 'APK file missing' }); return;
  }
  res.download(job.outputPath, path.basename(job.outputPath));
});

export default router;
