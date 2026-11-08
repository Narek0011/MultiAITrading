import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One page view of the public website (kept 90 days), for Admin → Visitors. */
@Entity('visits')
export class Visit {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  ip: string;

  /** 2-letter country code, or null when unknown (e.g. localhost). */
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @Column()
  path: string;

  /** Site the visitor came from (host only, e.g. "t.me"); null = typed / bookmark / app. */
  @Column({ type: 'varchar', nullable: true })
  referrer: string | null;

  /** Where the visitor arrived from: tiktok, instagram, direct, a custom link tag…; 'self' = opened from our own site; null = saved before sources existed. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  source: string | null;

  @Column({ type: 'varchar', length: 8 })
  device: 'mobile' | 'desktop';

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
