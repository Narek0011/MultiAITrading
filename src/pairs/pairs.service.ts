import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pair } from './pair.entity';

export const DEFAULT_PAIRS = [
  'USD/CHF', 'CAD/JPY', 'AUD/USD', 'USD/JPY', 'GBP/CAD', 'AUD/CAD', 'AUD/JPY', 'CAD/CHF', 'GBP/USD',
  'GBP/AUD', 'EUR/CHF', 'EUR/GBP', 'EUR/USD', 'USD/CAD', 'AUD/CHF', 'EUR/JPY', 'GBP/JPY',
];

@Injectable()
export class PairsService implements OnModuleInit {
  constructor(@InjectRepository(Pair) private readonly repo: Repository<Pair>) {}

  async onModuleInit() {
    if ((await this.repo.count()) > 0) return;
    await this.repo.save(DEFAULT_PAIRS.map((symbol, i) => ({ symbol, enabled: true, sortOrder: i })));
  }

  list() {
    return this.repo.find({ order: { sortOrder: 'ASC' } });
  }

  enabled() {
    return this.repo.find({ where: { enabled: true }, order: { sortOrder: 'ASC' } });
  }

  async get(id: number) {
    const pair = await this.repo.findOneBy({ id });
    if (!pair) throw new NotFoundException('Pair not found');
    return pair;
  }

  async setEnabled(id: number, enabled: boolean) {
    await this.get(id);
    await this.repo.update({ id }, { enabled });
    return this.get(id);
  }

  async setAllEnabled(enabled: boolean) {
    await this.repo.createQueryBuilder().update().set({ enabled }).execute();
    return this.list();
  }

  touch(id: number) {
    return this.repo.update({ id }, { lastSignalAt: new Date() });
  }
}
