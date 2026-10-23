import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type SignalStatus = 'OPEN' | 'TP1' | 'TP2' | 'SL' | 'BE' | 'EXPIRED';

@Entity('signals')
export class Signal {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  pair: string;

  @Column({ type: 'varchar', length: 4 })
  direction: 'BUY' | 'SELL';

  @Column({ type: 'double precision' })
  entry: number;

  @Column({ type: 'double precision' })
  stopLoss: number;

  @Column({ type: 'double precision' })
  takeProfit1: number;

  @Column({ type: 'double precision' })
  takeProfit2: number;

  @Column({ type: 'int' })
  confidence: number;

  @Column({ type: 'varchar', length: 6 })
  mode: 'AI' | 'CUSTOM';

  @Column({ type: 'varchar', length: 8 })
  timeframe: string;

  @Column({ type: 'text', default: '' })
  reasoning: string;

  @Column({ type: 'varchar', nullable: true })
  imageFile: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: { to: (v) => v, from: (v) => (v == null ? null : Number(v)) } })
  telegramMessageId: number | null;

  @Index()
  @Column({ type: 'varchar', length: 8, default: 'OPEN' })
  status: SignalStatus;

  @Column({ default: false })
  tp1Hit: boolean;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;
}
