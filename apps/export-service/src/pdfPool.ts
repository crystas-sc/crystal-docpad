import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--font-render-hinting=none',
];

export interface PdfBrowserPoolOptions {
  maxConcurrent?: number;
  recycleAfterJobs?: number;
  executablePath?: string;
}

export interface AcquirePageOptions {
  deviceScaleFactor?: number;
  viewport?: { width: number; height: number };
}

function resolveChromiumExecutable(explicitPath?: string): string | undefined {
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }
  const envPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const defaultPath = chromium.executablePath();
  if (defaultPath && fs.existsSync(defaultPath)) {
    return defaultPath;
  }
  const fallbackHeadlessShell = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';
  if (fs.existsSync(fallbackHeadlessShell)) {
    return fallbackHeadlessShell;
  }
  return undefined;
}

export class PdfBrowserPool {
  private readonly maxConcurrent: number;
  private readonly recycleAfterJobs: number;
  private readonly explicitExecutablePath?: string;

  private browser: Browser | null = null;
  private initPromise: Promise<Browser> | null = null;
  private activeCount = 0;
  private jobsSinceLaunch = 0;
  private totalJobs = 0;
  private recycling = false;
  private waitQueue: Array<() => void> = [];
  private closed = false;

  constructor(options: PdfBrowserPoolOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 4;
    this.recycleAfterJobs = options.recycleAfterJobs ?? 300;
    this.explicitExecutablePath = options.executablePath;
  }

  public getStats() {
    return {
      ready: Boolean(this.browser?.isConnected()),
      activePages: this.activeCount,
      queuedJobs: this.waitQueue.length,
      jobsSinceLaunch: this.jobsSinceLaunch,
      totalJobs: this.totalJobs,
      maxConcurrent: this.maxConcurrent,
      recycleAfterJobs: this.recycleAfterJobs,
    };
  }

  public async init(): Promise<void> {
    this.closed = false;
    await this.ensureBrowser();
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.closed) {
      throw new Error('PdfBrowserPool has been closed');
    }
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const executablePath = resolveChromiumExecutable(this.explicitExecutablePath);
      const browser = await chromium.launch({
        headless: true,
        args: LAUNCH_ARGS,
        ...(executablePath ? { executablePath } : {}),
      });
      this.browser = browser;
      this.jobsSinceLaunch = 0;
      return browser;
    })();

    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeCount < this.maxConcurrent && !this.recycling) {
      this.activeCount += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    if (!this.recycling && this.waitQueue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.waitQueue.shift();
      next?.();
    }
  }

  private async maybeRecycleBrowser(): Promise<void> {
    if (this.jobsSinceLaunch < this.recycleAfterJobs || this.recycling || this.closed) {
      return;
    }
    if (this.activeCount > 0) {
      return;
    }

    this.recycling = true;
    try {
      const oldBrowser = this.browser;
      this.browser = null;
      if (oldBrowser) {
        await oldBrowser.close().catch(() => {});
      }
      await this.ensureBrowser();
    } finally {
      this.recycling = false;
      while (this.waitQueue.length > 0 && this.activeCount < this.maxConcurrent) {
        const next = this.waitQueue.shift();
        next?.();
      }
    }
  }

  public async withPage<T>(
    task: (page: Page) => Promise<T>,
    options: AcquirePageOptions = {},
  ): Promise<T> {
    await this.acquireSlot();
    let context: BrowserContext | null = null;
    try {
      const browser = await this.ensureBrowser();
      context = await browser.newContext({
        deviceScaleFactor: options.deviceScaleFactor ?? 1,
        viewport: options.viewport ?? { width: 1200, height: 900 },
      });
      const page = await context.newPage();
      this.jobsSinceLaunch += 1;
      this.totalJobs += 1;
      return await task(page);
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
      this.releaseSlot();
      await this.maybeRecycleBrowser();
    }
  }

  public async close(): Promise<void> {
    this.closed = true;
    const browser = this.browser;
    this.browser = null;
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export function resolveAssetsPath(...segments: string[]): string {
  return path.resolve(process.cwd(), 'apps', 'export-service', ...segments);
}
