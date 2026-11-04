import { EventEmitter } from 'node:events';
import type { RealtimeEventMap } from '../types/index.js';

export type Bus = EventEmitter<RealtimeEventMap>;

export const createBus = (): Bus => new EventEmitter<RealtimeEventMap>();
