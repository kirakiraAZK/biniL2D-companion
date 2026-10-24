export interface DebugLogItem {
  id: string;
  time: string;
  category: 'AI' | 'WS' | 'TTS' | 'MOOD' | 'INTERACTION' | 'SYSTEM';
  title: string;
  data?: any;
}

class DebugConsoleManager {
  private isEnabled: boolean = false;
  private logs: DebugLogItem[] = [];
  private activeCategory: string = 'ALL';
  private latestRawOutput: string = '';
  private latestPromptPayload: string = '';

  private modal: HTMLElement | null = null;
  private btnToggle: HTMLElement | null = null;
  private rawOutputEl: HTMLElement | null = null;
  private rawProviderEl: HTMLElement | null = null;
  private rawModelEl: HTMLElement | null = null;
  private rawLatencyEl: HTMLElement | null = null;
  private rawLengthEl: HTMLElement | null = null;
  private promptOutputEl: HTMLElement | null = null;
  private logsStreamEl: HTMLElement | null = null;
  private stateOutputEl: HTMLElement | null = null;

  init() {
    this.isEnabled = localStorage.getItem('debug_mode') === 'true';

    this.modal = document.getElementById('debug-modal');
    this.btnToggle = document.getElementById('btn-toggle-debug');
    this.rawOutputEl = document.getElementById('dbg-raw-output');
    this.rawProviderEl = document.getElementById('dbg-raw-provider');
    this.rawModelEl = document.getElementById('dbg-raw-model');
    this.rawLatencyEl = document.getElementById('dbg-raw-latency');
    this.rawLengthEl = document.getElementById('dbg-raw-length');
    this.promptOutputEl = document.getElementById('dbg-prompt-output');
    this.logsStreamEl = document.getElementById('dbg-logs-stream');
    this.stateOutputEl = document.getElementById('dbg-state-output');

    if (this.btnToggle && this.isEnabled) {
      this.btnToggle.classList.add('active');
    }

    // Modal close & open
    this.btnToggle?.addEventListener('click', () => this.toggle());
    document.getElementById('btn-close-debug')?.addEventListener('click', () => this.close());

    // Debug Tabs
    const dbgTabs = document.querySelectorAll<HTMLButtonElement>('[data-dbg-tab]');
    dbgTabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-dbg-tab');
        if (!targetId) return;

        dbgTabs.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.dbg-tab-content').forEach((pane) => {
          pane.classList.remove('active');
        });
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');

        if (targetId === 'dbg-tab-state') {
          void this.refreshEngineState();
        }
      });
    });

    // Copy Raw Button
    document.getElementById('btn-copy-raw')?.addEventListener('click', () => {
      if (this.latestRawOutput) {
        void navigator.clipboard.writeText(this.latestRawOutput);
        this.log('SYSTEM', 'Copied raw model output to clipboard');
      }
    });

    // Copy Prompt Button
    document.getElementById('btn-copy-prompt')?.addEventListener('click', () => {
      if (this.latestPromptPayload) {
        void navigator.clipboard.writeText(this.latestPromptPayload);
        this.log('SYSTEM', 'Copied prompt payload to clipboard');
      }
    });

    // Clear Logs Button
    document.getElementById('btn-clear-dbg-logs')?.addEventListener('click', () => {
      this.logs = [];
      if (this.logsStreamEl) this.logsStreamEl.innerHTML = '';
      void fetch('/api/debug/logs', { method: 'DELETE' });
    });

    // Copy Logs Button
    document.getElementById('btn-copy-dbg-logs')?.addEventListener('click', () => {
      const text = this.logs
        .map((l) => `[${l.time}] [${l.category}] ${l.title} ${l.data ? JSON.stringify(l.data) : ''}`)
        .join('\n');
      void navigator.clipboard.writeText(text);
      this.log('SYSTEM', `Copied ${this.logs.length} debug logs to clipboard`);
    });

    // Refresh State Button
    document.getElementById('btn-refresh-dbg-state')?.addEventListener('click', () => {
      void this.refreshEngineState();
    });

    // Category filter buttons
    const filterBtns = document.querySelectorAll<HTMLButtonElement>('.dbg-filter-btn');
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.getAttribute('data-cat') || 'ALL';
        this.renderLogs();
      });
    });

    // Initial system log
    this.log('SYSTEM', 'Debug Console initialized', { debug_enabled: this.isEnabled });

    // Fetch initial backend logs
    fetch('/api/debug/logs')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.logs)) {
          for (const l of data.logs) {
            this.log(l.category, l.title, l.data, l.timestamp);
          }
        }
      })
      .catch(() => {});
  }

  setDebugMode(enabled: boolean) {
    this.isEnabled = enabled;
    localStorage.setItem('debug_mode', String(enabled));
    if (this.btnToggle) {
      if (enabled) this.btnToggle.classList.add('active');
      else this.btnToggle.classList.remove('active');
    }
    const showChatRaw = localStorage.getItem('show_raw_in_chat') === 'true';
    document.querySelectorAll<HTMLElement>('.msg-debug-details').forEach((el) => {
      el.style.display = enabled || showChatRaw ? 'block' : 'none';
    });
    this.log('SYSTEM', `Developer Debug Mode toggled: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  get isDebugMode(): boolean {
    return this.isEnabled;
  }

  open() {
    this.modal?.classList.add('active');
  }

  close() {
    this.modal?.classList.remove('active');
  }

  toggle() {
    if (this.modal?.classList.contains('active')) {
      this.close();
    } else {
      this.open();
    }
  }

  log(category: DebugLogItem['category'], title: string, data?: any, timestamp?: number) {
    const d = timestamp ? new Date(timestamp) : new Date();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      '.' + String(d.getMilliseconds()).padStart(3, '0');

    const item: DebugLogItem = {
      id: `dbg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      time: timeStr,
      category,
      title,
      data
    };

    this.logs.push(item);
    if (this.logs.length > 300) {
      this.logs.shift();
    }

    if (this.activeCategory === 'ALL' || this.activeCategory === category) {
      this.appendLogToDom(item);
    }
  }

  setLatestRaw(raw: string, meta: { provider?: string; model?: string; latencyMs?: number } = {}) {
    this.latestRawOutput = raw;
    if (this.rawOutputEl) {
      this.rawOutputEl.textContent = raw || '(Empty output received)';
    }
    if (this.rawProviderEl) this.rawProviderEl.textContent = meta.provider || 'openai';
    if (this.rawModelEl) this.rawModelEl.textContent = meta.model || '-';
    if (this.rawLatencyEl) this.rawLatencyEl.textContent = meta.latencyMs !== undefined ? `${meta.latencyMs}ms` : '-';
    if (this.rawLengthEl) this.rawLengthEl.textContent = `${raw.length} chars`;
  }

  setLatestPrompt(promptMessages: any[]) {
    try {
      this.latestPromptPayload = JSON.stringify(promptMessages, null, 2);
      if (this.promptOutputEl) {
        this.promptOutputEl.textContent = this.latestPromptPayload;
      }
    } catch {
      this.latestPromptPayload = String(promptMessages);
      if (this.promptOutputEl) this.promptOutputEl.textContent = this.latestPromptPayload;
    }
  }

  async refreshEngineState() {
    if (!this.stateOutputEl) return;
    this.stateOutputEl.textContent = 'Refreshing runtime state...';
    try {
      const res = await fetch('/api/debug/state');
      if (res.ok) {
        const state = await res.json();
        this.stateOutputEl.textContent = JSON.stringify(state, null, 2);
      } else {
        this.stateOutputEl.textContent = `Error fetching state: HTTP ${res.status}`;
      }
    } catch (e: any) {
      this.stateOutputEl.textContent = `Error: ${e.message}`;
    }
  }

  private renderLogs() {
    if (!this.logsStreamEl) return;
    this.logsStreamEl.innerHTML = '';
    const filtered = this.activeCategory === 'ALL'
      ? this.logs
      : this.logs.filter((l) => l.category === this.activeCategory);

    for (const item of filtered) {
      this.appendLogToDom(item);
    }
  }

  private appendLogToDom(item: DebugLogItem) {
    if (!this.logsStreamEl) return;

    const row = document.createElement('div');
    row.className = 'dbg-log-row';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'dbg-log-time';
    timeSpan.textContent = item.time;

    const catSpan = document.createElement('span');
    catSpan.className = `dbg-log-cat ${item.category}`;
    catSpan.textContent = item.category;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'dbg-log-title';
    titleSpan.textContent = item.title;

    row.appendChild(timeSpan);
    row.appendChild(catSpan);
    row.appendChild(titleSpan);

    if (item.data) {
      row.title = JSON.stringify(item.data, null, 2);
      row.style.cursor = 'pointer';
      row.onclick = () => {
        console.log(`[Debug Log: ${item.category}] ${item.title}:`, item.data);
      };
    }

    this.logsStreamEl.appendChild(row);
    this.logsStreamEl.scrollTop = this.logsStreamEl.scrollHeight;
  }
}

export const debugManager = new DebugConsoleManager();
