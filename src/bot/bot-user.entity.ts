import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
