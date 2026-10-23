import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './setting.entity';
import { DEFAULT_SETTINGS } from './settings.defaults';
import { AppSettings, SECRET_FIELDS, SETTINGS_GROUPS, SettingsGroup } from './settings.types';

const MASK = '••••';

@Injectable()
export class SettingsService implements OnModuleInit {
  /** Emits 'changed' with the group name after every save. */
  readonly events = new EventEmitter();
  private cache: AppSettings = structuredClone(DEFAULT_SETTINGS);

  constructor(@InjectRepository(Setting) private readonly repo: Repository<Setting>) {}

  async onModuleInit() {
    const rows = await this.repo.find();
    for (const group of SETTINGS_GROUPS) {
      const row = rows.find((r) => r.key === group);
      // Merge so settings added in newer versions get their defaults.
      (this.cache as any)[group] = { ...DEFAULT_SETTINGS[group], ...(row?.value ?? {}) };
      if (!row) await this.repo.save({ key: group, value: this.cache[group] as any });
    }
  }

  get<G extends SettingsGroup>(group: G): AppSettings[G] {
    return this.cache[group];
  }

  all(): AppSettings {
    return this.cache;
  }

  /** Settings safe to send to the admin UI: secrets reduced to the last 4 chars. */
  masked(): AppSettings {
    const copy = structuredClone(this.cache);
    for (const [group, fields] of Object.entries(SECRET_FIELDS)) {
      for (const field of fields!) {
        const value = (copy as any)[group][field] as string;
        (copy as any)[group][field] = value ? MASK + value.slice(-4) : '';
      }
    }
    return copy;
  }

  async update<G extends SettingsGroup>(group: G, patch: Partial<AppSettings[G]>): Promise<AppSettings[G]> {
    if (!SETTINGS_GROUPS.includes(group)) throw new BadRequestException(`Unknown settings group: ${group}`);
    const current = this.cache[group] as Record<string, any>;
    const defaults = DEFAULT_SETTINGS[group] as Record<string, any>;
    const next: Record<string, any> = { ...current };

    for (const [field, raw] of Object.entries(patch ?? {})) {
      if (!(field in defaults)) continue;
      // A masked secret coming back unchanged means "keep the stored value".
      if (SECRET_FIELDS[group]?.includes(field) && typeof raw === 'string' && raw.startsWith(MASK)) continue;
      next[field] = coerce(raw, defaults[field], field);
    }

    (this.cache as any)[group] = next;
    await this.repo.save({ key: group, value: next });
    this.events.emit('changed', group);
    return next as AppSettings[G];
  }
}

function coerce(value: unknown, sample: unknown, field: string): unknown {
  if (typeof sample === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new BadRequestException(`${field} must be a number`);
    return n;
  }
  if (typeof sample === 'boolean') return value === true || value === 'true' || value === 'on';
  if (Array.isArray(sample)) return Array.isArray(value) ? value.map(String) : [];
  return value == null ? '' : String(value).trim();
}
