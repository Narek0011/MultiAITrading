import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('settings')
export class Setting {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'jsonb' })
  value: Record<string, unknown>;

  @UpdateDateColumn()
  updatedAt: Date;
}
