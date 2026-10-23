import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pairs')
export class Pair {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  symbol: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastSignalAt: Date | null;
}
