import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** A channel or group the bot was added to (or saw a post in) — used to pick the Channel ID in admin. */
@Entity('bot_chats')
export class BotChat {
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', default: '' })
  title: string;

  @Column({ type: 'varchar', length: 16 })
  type: string;

  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  /** administrator / member / left / kicked, or "seen" when only a post was observed. */
  @Column({ type: 'varchar', length: 16 })
  status: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
