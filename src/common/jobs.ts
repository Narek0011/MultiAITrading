import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

const JOB_TTL_MS = 10 * 60_000;

/** A slow admin action (AI, uploads) running in the background; the browser polls it so requests never hit the proxy timeout. */
export interface JobState {
  status: 'running' | 'done' | 'failed';
  startedAt: number;
  result?: unknown;
  error?: string;
  /** What it is doing right now, shown next to the timer. */
  note?: string;
}

/** In-memory background jobs; expire after 10 minutes and are lost on restart. */
export class JobRunner {
  private readonly jobs = new Map<string, JobState>();

  start(run: (onNote: (note: string) => void) => Promise<unknown>) {
    const now = Date.now();
    for (const [id, j] of this.jobs) if (now - j.startedAt > JOB_TTL_MS) this.jobs.delete(id);
    const id = randomUUID();
    const job: JobState = { status: 'running', startedAt: now };
    this.jobs.set(id, job);
    run((note) => (job.note = note)).then(
      (result) => Object.assign(job, { status: 'done', result }),
      (err: any) => Object.assign(job, { status: 'failed', error: err?.message ?? String(err) }),
    );
    return { jobId: id };
  }

  get(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('This job has expired — please try again');
    return { ...job, seconds: Math.round((Date.now() - job.startedAt) / 1000) };
  }
}
