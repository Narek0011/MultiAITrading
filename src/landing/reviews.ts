import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { toPostJpeg } from '../charts/raster';
import { LandingReview } from '../settings/settings.types';

/** Review screenshots, served publicly at /media/reviews/. */
export const REVIEWS_DIR = join(process.cwd(), 'storage', 'reviews');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_FILE = /^review-[a-z0-9-]+\.jpg$/;

/** Saves an uploaded screenshot as a JPEG and returns its file name. */
export async function saveReviewImage(file: { buffer: Buffer; mimetype: string; originalname: string }) {
  if (!IMAGE_TYPES.includes(file.mimetype)) throw new BadRequestException(`${file.originalname}: use a JPG, PNG or WebP image`);
  await fs.mkdir(REVIEWS_DIR, { recursive: true });
  const name = `review-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.jpg`;
  await fs.writeFile(join(REVIEWS_DIR, name), toPostJpeg(file.buffer, file.mimetype));
  return name;
}

/** Cleans the review list sent by the admin: trimmed, length-limited, only our own image files. */
export function cleanReviews(raw: unknown): LandingReview[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((r: any, i) => ({
      key: String(r?.key ?? '').trim().slice(0, 24) || `r${i + 1}`,
      name: String(r?.name ?? '').trim().slice(0, 60),
      text: String(r?.text ?? '').trim().slice(0, 600),
      image: IMAGE_FILE.test(String(r?.image ?? '')) ? String(r.image) : '',
      enabled: r?.enabled !== false && r?.enabled !== 'false',
    }))
    .filter((r) => (r.text || r.image) && !seen.has(r.key) && seen.add(r.key));
}

/** Deletes screenshots that no review uses any more (after a save). */
export async function pruneReviewImages(reviews: LandingReview[]) {
  const used = new Set(reviews.map((r) => r.image).filter(Boolean));
  const files = await fs.readdir(REVIEWS_DIR).catch(() => [] as string[]);
  await Promise.all(files.filter((f) => IMAGE_FILE.test(f) && !used.has(f)).map((f) => fs.rm(join(REVIEWS_DIR, f), { force: true })));
}
