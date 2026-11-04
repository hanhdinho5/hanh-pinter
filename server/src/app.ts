import { config, type AppConfig } from './config.js';
import { createBus, type Bus } from './events/bus.js';
import { EventHandler } from './events/eventHandler.js';
import { PrinterEngine } from './printer/printerEngine.js';
import { SheetManager } from './printer/sheetManager.js';
import { PrintQueue } from './queue/printQueue.js';

export interface Core {
    bus: Bus;
    queue: PrintQueue;
    sheets: SheetManager;
    engine: PrinterEngine;
    handler: EventHandler;
}

/** Lắp ráp lõi (không có HTTP/socket) để dùng cho app thật và test. */
export const createCore = (cfg: AppConfig = config): Core => {
    const bus = createBus();
    const queue = new PrintQueue(bus, cfg.historyLimit);
    const sheets = new SheetManager(cfg.printer.sheetCapacity);
    const engine = new PrinterEngine(queue, sheets, bus, cfg.printer);
    const handler = new EventHandler(queue, sheets, engine, bus, cfg.gift);
    return { bus, queue, sheets, engine, handler };
};
