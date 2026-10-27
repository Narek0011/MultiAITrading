import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { SocialSlide } from '../charts/social-card-renderer.service';

export interface TikTokMedia {
  /** File name inside storage/tiktok/<mediaKey>/ */
  file: string;
  kind: 'image' | 'video';
  mime: string;
  size: number;
}

/** A TikTok post: a draft while it is being made, then its publishing result. */
@Entity('tiktok_posts')
export class TikTokPost {
  @PrimaryGeneratedColumn()
  id: number;

  /** Random folder name for the media, so public image URLs can't be guessed. */
  @Column({ type: 'varchar', length: 40 })
  mediaKey: string;

  /** video | photo */
  @Column({ type: 'varchar', length: 10 })
  contentType: string;

  /** direct = publish now, draft = send to the TikTok inbox */
  @Column({ type: 'varchar', length: 10, default: 'direct' })
  postMode: string;

  /** manual | ai */
  @Column({ type: 'varchar', length: 10, default: 'manual' })
  source: string;

  @Column({ type: 'varchar', length: 5, default: 'ru' })
  language: string;

  /** Photo title (≤90 chars); unused for video. */
  @Column({ type: 'varchar', length: 200, default: '' })
  title: string;

  /** Video caption / photo description, hashtags included. */
  @Column({ type: 'text', default: '' })
  caption: string;

  @Column({ type: 'varchar', length: 30, default: '' })
  privacy: string;

  @Column({ default: true })
  allowComments: boolean;

  @Column({ default: true })
  allowDuet: boolean;

  @Column({ default: true })
  allowStitch: boolean;

  @Column({ default: false })
  brandContent: boolean;

  @Column({ default: false })
  brandOrganic: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  media: TikTokMedia[];

  /** AI slides behind the images, kept so one slide can be regenerated. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  slides: SocialSlide[];

  /** draft → publishing → published | in_inbox | processing | failed */
  @Column({ type: 'varchar', length: 12, default: 'draft' })
  status: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  publishId: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  postedAt: Date | null;
}
