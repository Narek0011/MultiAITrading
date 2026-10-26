import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** One post to one news channel. (day, slot, channel) is unique so a slot is never posted twice to a channel, even across restarts. */
@Entity('news_posts')
@Unique(['day', 'slot', 'channel'])
export class NewsPost {
  @PrimaryGeneratedColumn()
  id: number;

  /** YYYY-MM-DD in the news timezone. */
  @Column({ type: 'varchar', length: 10 })
  day: string;

  /** Slot time "HH:MM", or "now-HH:MM:SS" for a manual post. */
  @Column({ type: 'varchar', length: 16 })
  slot: string;

  /** Key of the channel in news settings ("main" for the legacy single channel). */
  @Column({ type: 'varchar', length: 32, default: 'main' })
  channel: string;

  @Column({ type: 'varchar', length: 10 })
  type: string;

  /** story | bullets | levels | calendar | movers | quick */
  @Column({ type: 'varchar', length: 16, nullable: true })
  format: string | null;

  @Column({ type: 'text', default: '' })
  text: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pair: string | null;

  /** pending → posted | failed */
  @Column({ type: 'varchar', length: 10, default: 'pending' })
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', nullable: true })
  telegramMessageId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
