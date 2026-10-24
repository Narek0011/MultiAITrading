import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type AccessStatus = 'none' | 'awaiting_id' | 'pending' | 'approved' | 'rejected';

/** A person who started the bot in a private chat. */
@Entity('bot_users')
export class BotUser {
  /** Telegram user id (fits in bigint; kept as string to avoid precision issues). */
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  @Column({ type: 'varchar', default: '' })
  firstName: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  language: 'en' | 'ru' | 'es' | null;

  @Column({ type: 'varchar', length: 16, default: 'none' })
  accessStatus: AccessStatus;

  /** Pocket Option trader id the user sent us. */
  @Column({ type: 'varchar', nullable: true })
  pocketId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  requestedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  /** When their join request to the channel was approved. */
  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
