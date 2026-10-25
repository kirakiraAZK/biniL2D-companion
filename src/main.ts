/**
 * Unified Live2D AI Companion — Main Application Entry Point
 * Implements Reversed Split-Screen, Model Repositioning, Model Auto-Discovery,
 * Custom Voice Sample Upload, and Multi-Provider Settings.
 */
import { CubismFramework, Option } from '../vendor/CubismWebFramework/src/live2dcubismframework';
import { LogLevel } from '../vendor/CubismWebFramework/src/live2dcubismframework';
import { CompanionModel } from './model';
import { installCoreCompat } from './core-compat';
import { setupPet, enableResize, onCursor, inTauri } from './pet';
import { LipSync } from './audio';
import { IdleDirector } from './idle';
import { loadRegistry, pickCostume, resolveModel, Character, Costume } from './registry';
import { renderMarkdown } from './markdown';
import { debugManager } from './debug';

// DOM Elements
const canvas = document.getElementById('view') as HTMLCanvasElement;
const canvasWrapper = document.getElementById('stage-canvas-wrapper') as HTMLDivElement;
const statusToast = document.getElementById('status-toast') as HTMLDivElement;
const companionNameEl = document.getElementById('companion-name') as HTMLElement;
const companionCostumeEl = document.getElementById('companion-costume-label') as HTMLElement;
const companionInitialEl = document.getElementById('companion-initial') as HTMLElement;
const selectCharacter = document.getElementById('select-character') as HTMLSelectElement;
const selectCostume = document.getElementById('select-costume') as HTMLSelectElement;
const btnRenameCharacter = document.getElementById('btn-rename-character') as HTMLButtonElement;
const btnRenameCostume = document.getElementById('btn-rename-costume') as HTMLButtonElement;
const chatMessagesEl = document.getElementById('chat-messages') as HTMLDivElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const btnClearChat = document.getElementById('btn-clear-chat') as HTMLButtonElement;
const btnOpenSettings = document.getElementById('btn-open-settings') as HTMLButtonElement;
const btnCloseSettings = document.getElementById('btn-close-settings') as HTMLButtonElement;
const btnCancelSettings = document.getElementById('btn-cancel-settings') as HTMLButtonElement;
const btnSaveSettings = document.getElementById('btn-save-settings') as HTMLButtonElement;
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;

// Settings Inputs
const settingProvider = document.getElementById('setting-provider') as HTMLSelectElement;
const settingBaseUrl = document.getElementById('setting-base-url') as HTMLInputElement;
const groupBaseUrl = document.getElementById('group-base-url') as HTMLDivElement;
const settingApiKey = document.getElementById('setting-api-key') as HTMLInputElement;
const settingModel = document.getElementById('setting-model') as HTMLInputElement;
const settingModelSelect = document.getElementById('setting-model-select') as HTMLSelectElement;
const btnFetchModels = document.getElementById('btn-fetch-models') as HTMLButtonElement;
const btnTestAiConnection = document.getElementById('btn-test-ai-connection') as HTMLButtonElement;
const modelFetchStatus = document.getElementById('model-fetch-status') as HTMLDivElement;
const settingTemperature = document.getElementById('setting-temperature') as HTMLInputElement;
const tempDisplay = document.getElementById('temp-display') as HTMLElement;

// Voice & TTS Inputs
const settingTtsMaster = document.getElementById('setting-tts-master') as HTMLInputElement;
const settingTtsEngine = document.getElementById('setting-tts-engine') as HTMLSelectElement;
const settingOmniVoiceUrl = document.getElementById('setting-omnivoice-url') as HTMLInputElement;
const settingTtsFallback = document.getElementById('setting-tts-fallback') as HTMLInputElement;
const settingEdgeVoice = document.getElementById('setting-edge-voice') as HTMLSelectElement;
const voiceUploadZone = document.getElementById('voice-upload-zone') as HTMLDivElement;
const voiceFileInput = document.getElementById('voice-file-input') as HTMLInputElement;
const uploadStatusText = document.getElementById('upload-status-text') as HTMLElement;
const activeVoicePreview = document.getElementById('active-voice-preview') as HTMLDivElement;
const activeVoiceName = document.getElementById('active-voice-name') as HTMLElement;

// Position & Zoom Inputs
const settingZoomSlider = document.getElementById('setting-zoom-slider') as HTMLInputElement;
const btnPanLeft = document.getElementById('btn-pan-left') as HTMLButtonElement;
const btnPanRight = document.getElementById('btn-pan-right') as HTMLButtonElement;
const btnPanUp = document.getElementById('btn-pan-up') as HTMLButtonElement;
const btnPanDown = document.getElementById('btn-pan-down') as HTMLButtonElement;
const btnZoomIn = document.getElementById('btn-zoom-in') as HTMLButtonElement;
const btnZoomOut = document.getElementById('btn-zoom-out') as HTMLButtonElement;
const btnSavePos = document.getElementById('btn-save-pos') as HTMLButtonElement;
const btnResetPos = document.getElementById('btn-reset-pos') as HTMLButtonElement;
const btnModalSavePos = document.getElementById('btn-modal-save-pos') as HTMLButtonElement;
const btnModalResetPos = document.getElementById('btn-modal-reset-pos') as HTMLButtonElement;

// Telegram Inputs
const settingTelegramEnabled = document.getElementById('setting-telegram-enabled') as HTMLInputElement;
const settingTelegramToken = document.getElementById('setting-telegram-token') as HTMLInputElement;
const settingTelegramAllowed = document.getElementById('setting-telegram-allowed') as HTMLInputElement;

// Discord Inputs
const settingDiscordEnabled = document.getElementById('setting-discord-enabled') as HTMLInputElement;
const settingDiscordToken = document.getElementById('setting-discord-token') as HTMLInputElement;
const settingDiscordChannel = document.getElementById('setting-discord-channel') as HTMLInputElement;
const settingDiscordAllowed = document.getElementById('setting-discord-allowed') as HTMLInputElement;

// Profile Inputs (All character.example.json fields)
const settingCharName = document.getElementById('setting-char-name') as HTMLInputElement;
const settingCharNicknames = document.getElementById('setting-char-nicknames') as HTMLInputElement;
const settingCharTags = document.getElementById('setting-char-tags') as HTMLInputElement;
const settingOwnerName = document.getElementById('setting-owner-name') as HTMLInputElement;
const settingOwnerPronoun = document.getElementById('setting-owner-pronoun') as HTMLInputElement;
const settingTimezone = document.getElementById('setting-timezone') as HTMLInputElement;
const settingTzLabel = document.getElementById('setting-tz-label') as HTMLInputElement;
const settingCharLanguage = document.getElementById('setting-char-language') as HTMLInputElement;
const settingCharCountry = document.getElementById('setting-char-country') as HTMLInputElement;
const settingCharDescription = document.getElementById('setting-char-description') as HTMLTextAreaElement;
const settingPersonality = document.getElementById('setting-personality') as HTMLTextAreaElement;
const settingCharScenario = document.getElementById('setting-char-scenario') as HTMLTextAreaElement;
const settingCharFirstMessage = document.getElementById('setting-char-first-message') as HTMLInputElement;
const settingCharExamples = document.getElementById('setting-char-examples') as HTMLTextAreaElement;
const settingCharFeedKeywords = document.getElementById('setting-char-feed-keywords') as HTMLInputElement;
const settingMusicArtist = document.getElementById('setting-music-artist') as HTMLInputElement;
const btnFetchSongs = document.getElementById('btn-fetch-songs') as HTMLButtonElement;
const settingSongCount = document.getElementById('setting-song-count') as HTMLElement;
const settingCharSongs = document.getElementById('setting-char-songs') as HTMLTextAreaElement;
const settingCharSongAliases = document.getElementById('setting-char-song-aliases') as HTMLInputElement;
const settingCharSystemPrompt = document.getElementById('setting-char-system-prompt') as HTMLTextAreaElement;
const settingsActiveCharacterPill = document.getElementById('settings-active-character-pill') as HTMLElement;

// Badges & STT
const companionMoodBadge = document.getElementById('companion-mood-badge') as HTMLElement;
const companionSleepBadge = document.getElementById('companion-sleep-badge') as HTMLElement;
const sttBtn = document.getElementById('stt-btn') as HTMLButtonElement;

// Autonomy, Fallback & Connector Toggles
const settingTimezoneEnabled = document.getElementById('setting-timezone-enabled') as HTMLInputElement;
const settingTouchEnabled = document.getElementById('setting-touch-enabled') as HTMLInputElement;
const settingMoodEnabled = document.getElementById('setting-mood-enabled') as HTMLInputElement;
const settingIdleTalkEnabled = document.getElementById('setting-idle-talk-enabled') as HTMLInputElement;
const settingSleepCycleEnabled = document.getElementById('setting-sleep-cycle-enabled') as HTMLInputElement;
const settingWeatherEnabled = document.getElementById('setting-weather-enabled') as HTMLInputElement;
const settingWeatherCity = document.getElementById('setting-weather-city') as HTMLInputElement;
const btnTestWeather = document.getElementById('btn-test-weather') as HTMLButtonElement;
const weatherTestStatus = document.getElementById('weather-test-status') as HTMLDivElement;
const settingLlmFallback1 = document.getElementById('setting-llm-fallback-1') as HTMLSelectElement;
const settingLlmFallback2 = document.getElementById('setting-llm-fallback-2') as HTMLSelectElement;
const settingSttEnabled = document.getElementById('setting-stt-enabled') as HTMLInputElement;
const settingFreshrssEnabled = document.getElementById('setting-freshrss-enabled') as HTMLInputElement;
const settingFreshrssUrl = document.getElementById('setting-freshrss-url') as HTMLInputElement;
const settingFreshrssUser = document.getElementById('setting-freshrss-user') as HTMLInputElement;
const settingFreshrssPassword = document.getElementById('setting-freshrss-password') as HTMLInputElement;
const settingNotionEnabled = document.getElementById('setting-notion-enabled') as HTMLInputElement;
const settingNotionApiKey = document.getElementById('setting-notion-api-key') as HTMLInputElement;
const settingNotionDatabaseId = document.getElementById('setting-notion-database-id') as HTMLInputElement;
const settingCalendarEnabled = document.getElementById('setting-calendar-enabled') as HTMLInputElement;
const settingCalendarIcsUrl = document.getElementById('setting-calendar-ics-url') as HTMLInputElement;
const settingGoogleEnabled = document.getElementById('setting-google-enabled') as HTMLInputElement;
const settingNextcloudEnabled = document.getElementById('setting-nextcloud-enabled') as HTMLInputElement;
const settingDebugMode = document.getElementById('setting-debug-mode') as HTMLInputElement;
const appNotificationLayer = document.getElementById('app-notification-layer');

function escapeHtml(str: any): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Global Top-Layer System Announcement / Error Banner (Always on Top)
function showTopNotice(
  level: 'error' | 'warn' | 'info' | 'success',
  title: string,
  message: string,
  options: { duration?: number; hint?: string; actionLabel?: string; onAction?: () => void } = {}
) {
  if (!appNotificationLayer) return;
  const item = document.createElement('div');
  item.className = `app-notice-item ${level}`;

  const iconMap: Record<string, string> = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    success: '✅'
  };

  const iconEl = document.createElement('div');
  iconEl.className = 'app-notice-icon';
  iconEl.textContent = iconMap[level] || 'ℹ️';

  const contentEl = document.createElement('div');
  contentEl.className = 'app-notice-content';

  const titleEl = document.createElement('div');
  titleEl.className = 'app-notice-title';
  titleEl.textContent = title;

  const descEl = document.createElement('div');
  descEl.className = 'app-notice-desc';
  descEl.textContent = message + (options.hint ? ` (${options.hint})` : '');

  contentEl.appendChild(titleEl);
  contentEl.appendChild(descEl);

  const dismiss = () => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(-12px)';
    setTimeout(() => item.remove(), 250);
  };

  if (options.actionLabel && options.onAction) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'app-notice-actions';
    const actionBtn = document.createElement('button');
    actionBtn.className = 'app-notice-btn';
    actionBtn.textContent = options.actionLabel;
    actionBtn.onclick = () => {
      options.onAction!();
      dismiss();
    };
    actionsEl.appendChild(actionBtn);
    contentEl.appendChild(actionsEl);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'app-notice-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Dismiss';
  closeBtn.onclick = dismiss;

  item.appendChild(iconEl);
  item.appendChild(contentEl);
  item.appendChild(closeBtn);

  appNotificationLayer.appendChild(item);

  const duration = options.duration !== undefined ? options.duration : level === 'error' ? 14000 : 7000;
  if (duration > 0) {
    setTimeout(() => {
      if (item.isConnected) dismiss();
    }, duration);
  }
}

// In-Chat Error Card Component
function renderChatErrorCard(
  bubble: HTMLElement,
  err: { title?: string; code?: string; message?: string; error?: string; hint?: string; retryable?: boolean; raw_error?: any },
  userText: string,
  onRetry?: () => void
) {
  bubble.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'chat-error-card';

  const header = document.createElement('div');
  header.className = 'chat-error-header';
  header.innerHTML = `<span>⚠️ ${escapeHtml(err.title || 'AI Model Error')}</span>`;
  if (err.code) {
    const codeTag = document.createElement('span');
    codeTag.className = 'chat-error-code';
    codeTag.textContent = err.code;
    header.appendChild(codeTag);
  }
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'chat-error-body';
  body.textContent = err.message || err.error || 'The model provider returned an error.';
  card.appendChild(body);

  if (err.hint) {
    const hint = document.createElement('div');
    hint.className = 'chat-error-hint';
    hint.innerHTML = `💡 <strong>Hint:</strong> ${escapeHtml(err.hint)}`;
    card.appendChild(hint);
  }

  const actions = document.createElement('div');
  actions.className = 'chat-error-actions';

  if (err.retryable !== false && onRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-chat-retry';
    retryBtn.innerHTML = '🔄 Retry';
    retryBtn.onclick = () => onRetry();
    actions.appendChild(retryBtn);
  }

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'btn-chat-settings';
  settingsBtn.innerHTML = '⚙️ AI Brain Settings';
  settingsBtn.onclick = () => {
    document.getElementById('btn-open-settings')?.click();
    document.querySelector<HTMLButtonElement>('[data-tab="tab-ai"]')?.click();
  };
  actions.appendChild(settingsBtn);

  const copyBtn = document.createElement('button');
  copyBtn.innerHTML = '📋 Copy Error';
  copyBtn.onclick = () => {
    const copyText = JSON.stringify(err, null, 2);
    void navigator.clipboard.writeText(copyText);
    copyBtn.textContent = '✓ Copied';
    setTimeout(() => { copyBtn.textContent = '📋 Copy Error'; }, 2000);
  };
  actions.appendChild(copyBtn);

  card.appendChild(actions);
  bubble.appendChild(card);
}

// In-Chat Music Card Component (with 30s Audio Stream & Streaming Platform Links)
function renderMusicCard(container: HTMLElement, track: any) {
  if (!container || !track || (!track.title && !track.name)) return;
  const title = track.title || track.name || 'Unknown Track';
  // Avoid duplicate cards for the exact same track title in this container
  if (container.querySelector(`[data-track-key="${escapeHtml(title)}"]`)) {
    return;
  }

  const artist = track.artist || 'Unknown Artist';
  const album = track.album || '';
  const previewUrl = track.previewUrl || track.preview_url || '';
  const artworkUrl = track.artworkUrl || track.artwork_url || '';
  const spotifyUrl = track.spotifyUrl || track.spotify_url || `https://open.spotify.com/search/${encodeURIComponent(title + ' ' + artist)}`;
  const ytMusicUrl = track.ytMusicUrl || track.yt_music_url || `https://music.youtube.com/search?q=${encodeURIComponent(title + ' ' + artist)}`;
  const appleMusicUrl = track.appleMusicUrl || track.apple_music_url || track.trackViewUrl || `https://music.apple.com/search?term=${encodeURIComponent(title + ' ' + artist)}`;
  const youtubeUrl = track.youtubeUrl || track.youtube_url || `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' ' + artist)}`;

  const card = document.createElement('div');
  card.className = 'chat-music-card';
  card.setAttribute('data-track-key', title);

  const header = document.createElement('div');
  header.className = 'music-card-header';

  let artImg: HTMLImageElement | null = null;
  if (artworkUrl) {
    artImg = document.createElement('img');
    artImg.className = 'music-card-art';
    artImg.src = artworkUrl;
    artImg.alt = title;
    header.appendChild(artImg);
  }

  const fallback = document.createElement('div');
  fallback.className = 'music-card-art-fallback';
  fallback.textContent = '🎵';
  if (artworkUrl) {
    fallback.style.display = 'none';
    if (artImg) {
      artImg.onerror = () => {
        artImg!.style.display = 'none';
        fallback.style.display = 'flex';
      };
    }
  }
  header.appendChild(fallback);

  const info = document.createElement('div');
  info.className = 'music-card-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'music-card-title';
  titleEl.textContent = title;
  info.appendChild(titleEl);

  const artistEl = document.createElement('div');
  artistEl.className = 'music-card-artist';
  artistEl.textContent = artist;
  info.appendChild(artistEl);

  if (album) {
    const albumEl = document.createElement('div');
    albumEl.className = 'music-card-album';
    albumEl.textContent = album;
    info.appendChild(albumEl);
  }
  header.appendChild(info);
  card.appendChild(header);

  // Audio Preview Player (30-second studio sample from iTunes API)
  if (previewUrl) {
    const audio = document.createElement('audio');
    audio.className = 'music-audio-player';
    audio.controls = true;
    audio.src = previewUrl;
    audio.preload = 'none';
    card.appendChild(audio);
  }

  // Streaming platform pills (Spotify, YT Music, Apple Music, YouTube)
  const pills = document.createElement('div');
  pills.className = 'music-streaming-pills';

  const label = document.createElement('span');
  label.className = 'music-pill-label';
  label.textContent = 'Listen on:';
  pills.appendChild(label);

  const platforms = [
    { name: 'Spotify', cls: 'spotify', url: spotifyUrl, icon: '🟢' },
    { name: 'YT Music', cls: 'yt-music', url: ytMusicUrl, icon: '🔴' },
    { name: 'Apple Music', cls: 'apple-music', url: appleMusicUrl, icon: '🍎' },
    { name: 'YouTube', cls: 'youtube', url: youtubeUrl, icon: '▶️' }
  ];

  for (const p of platforms) {
    if (!p.url) continue;
    const a = document.createElement('a');
    a.className = `music-pill ${p.cls}`;
    a.href = p.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = `<span>${p.icon}</span> <span>${p.name}</span>`;
    pills.appendChild(a);
  }

  card.appendChild(pills);
  container.appendChild(card);
}

function getWeatherEmoji(code: number): string {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2 || code === 3) return '⛅';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

function renderWeatherCard(container: HTMLElement, data: any) {
  if (!container || !data) return;
  const weather = data.data || data;
  if (!weather || !weather.current) return;
  if (container.querySelector('.chat-weather-card')) return;

  const card = document.createElement('div');
  card.className = 'chat-rich-card chat-weather-card';

  const current = weather.current;
  const emoji = getWeatherEmoji(current.weather_code ?? 0);

  const mainRow = document.createElement('div');
  mainRow.className = 'weather-main-row';

  const iconBox = document.createElement('div');
  iconBox.className = 'weather-icon-box';
  iconBox.textContent = emoji;
  mainRow.appendChild(iconBox);

  const infoBox = document.createElement('div');
  infoBox.className = 'weather-info-box';

  const tempRow = document.createElement('div');
  tempRow.className = 'weather-temp-row';

  const tempEl = document.createElement('div');
  tempEl.className = 'weather-temp';
  tempEl.textContent = `${Math.round(current.temperature)}°C`;
  tempRow.appendChild(tempEl);

  if (current.feels_like !== undefined) {
    const feelsEl = document.createElement('div');
    feelsEl.className = 'weather-feels';
    feelsEl.textContent = `Feels ${Math.round(current.feels_like)}°C`;
    tempRow.appendChild(feelsEl);
  }
  infoBox.appendChild(tempRow);

  const condEl = document.createElement('div');
  condEl.className = 'weather-condition';
  condEl.textContent = current.description || 'Current Weather';
  infoBox.appendChild(condEl);

  if (weather.location) {
    const locEl = document.createElement('div');
    locEl.className = 'weather-location';
    locEl.innerHTML = `📍 <span>${escapeHtml(weather.location)}</span>`;
    infoBox.appendChild(locEl);
  }

  mainRow.appendChild(infoBox);
  card.appendChild(mainRow);

  // Metrics Strip (Humidity, Wind)
  const metrics = document.createElement('div');
  metrics.className = 'weather-metrics-strip';

  if (current.humidity !== undefined) {
    const hum = document.createElement('div');
    hum.className = 'weather-metric-pill';
    hum.textContent = `💧 ${current.humidity}% Humidity`;
    metrics.appendChild(hum);
  }
  if (current.wind_speed !== undefined) {
    const wind = document.createElement('div');
    wind.className = 'weather-metric-pill';
    wind.textContent = `💨 ${current.wind_speed} km/h Wind`;
    metrics.appendChild(wind);
  }
  card.appendChild(metrics);

  // 3-Day Forecast Grid
  if (Array.isArray(weather.forecast) && weather.forecast.length > 0) {
    const forecastGrid = document.createElement('div');
    forecastGrid.className = 'weather-forecast-grid';

    const days = weather.forecast.slice(0, 3);
    for (const f of days) {
      const dayEl = document.createElement('div');
      dayEl.className = 'weather-forecast-day';

      const dateLabel = document.createElement('div');
      dateLabel.className = 'forecast-date';
      const parsedDate = new Date(f.date + 'T12:00:00Z');
      const isInvalid = Number.isNaN(parsedDate.getTime());
      dateLabel.textContent = isInvalid ? f.date : parsedDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
      dayEl.appendChild(dateLabel);

      const fIcon = document.createElement('div');
      fIcon.className = 'forecast-icon';
      fIcon.textContent = getWeatherEmoji(f.code ?? 0);
      dayEl.appendChild(fIcon);

      const fTemp = document.createElement('div');
      fTemp.className = 'forecast-temp';
      fTemp.textContent = `${Math.round(f.temp_max)}° / ${Math.round(f.temp_min)}°`;
      dayEl.appendChild(fTemp);

      if (f.rain_chance > 0) {
        const fRain = document.createElement('div');
        fRain.className = 'forecast-rain';
        fRain.textContent = `🌧️ ${f.rain_chance}%`;
        dayEl.appendChild(fRain);
      }

      forecastGrid.appendChild(dayEl);
    }
    card.appendChild(forecastGrid);
  }

  container.appendChild(card);
}

function renderCalendarCard(container: HTMLElement, eventsData: any) {
  if (!container || !eventsData) return;
  if (container.querySelector('.chat-calendar-card')) return;

  const events: any[] = Array.isArray(eventsData) ? eventsData : eventsData.events || [];

  const card = document.createElement('div');
  card.className = 'chat-rich-card chat-calendar-card';

  const header = document.createElement('div');
  header.className = 'rich-card-header-row';
  header.innerHTML = `
    <div class="rich-card-title-wrap">
      <span>📅</span> <span>Upcoming Schedule</span>
    </div>
    <div class="rich-card-badge" style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.4);">
      ${events.length} ${events.length === 1 ? 'event' : 'events'}
    </div>
  `;
  card.appendChild(header);

  if (events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'calendar-empty-note';
    empty.textContent = 'No upcoming events scheduled for the next 48 hours.';
    card.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'calendar-events-list';

    for (const ev of events.slice(0, 4)) {
      const item = document.createElement('div');
      item.className = 'calendar-event-item';

      const timeBadge = document.createElement('div');
      timeBadge.className = 'calendar-time-badge';
      timeBadge.innerHTML = `⏰ <span>${escapeHtml(ev.start || 'Soon')}</span>`;
      item.appendChild(timeBadge);

      const titleEl = document.createElement('div');
      titleEl.className = 'calendar-event-title';
      titleEl.textContent = ev.title || 'Untitled Event';
      item.appendChild(titleEl);

      if (ev.location) {
        const locEl = document.createElement('div');
        locEl.className = 'calendar-event-location';
        locEl.innerHTML = `📍 <span>${escapeHtml(ev.location)}</span>`;
        item.appendChild(locEl);
      }

      list.appendChild(item);
    }
    card.appendChild(list);
  }

  container.appendChild(card);
}

function renderTasksCard(container: HTMLElement, tasksData: any) {
  if (!container || !tasksData) return;
  if (container.querySelector('.chat-tasks-card')) return;

  const tasks: any[] = Array.isArray(tasksData) ? tasksData : tasksData.tasks || [];

  const card = document.createElement('div');
  card.className = 'chat-rich-card chat-tasks-card';

  const header = document.createElement('div');
  header.className = 'rich-card-header-row';
  header.innerHTML = `
    <div class="rich-card-title-wrap">
      <span>📝</span> <span>Workspace Tasks</span>
    </div>
    <div class="rich-card-badge" style="background: rgba(52, 211, 153, 0.2); color: #6ee7b7; border: 1px solid rgba(52, 211, 153, 0.4);">
      Notion
    </div>
  `;
  card.appendChild(header);

  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'calendar-empty-note';
    empty.textContent = 'All workspace tasks are up to date!';
    card.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'tasks-list';

    for (const t of tasks.slice(0, 5)) {
      const row = document.createElement('div');
      row.className = 'task-item-row';

      const status = (t.status || 'To Do').toLowerCase();
      let statusClass = 'todo';
      if (status.includes('done') || status.includes('complete')) statusClass = 'done';
      else if (status.includes('progress') || status.includes('doing') || status.includes('active')) statusClass = 'in-progress';

      const pill = document.createElement('span');
      pill.className = `task-status-pill ${statusClass}`;
      pill.textContent = t.status || 'To Do';
      row.appendChild(pill);

      const titleEl = document.createElement('div');
      titleEl.className = 'task-title-text';
      titleEl.textContent = t.title || 'Untitled Task';
      titleEl.title = t.title || '';
      row.appendChild(titleEl);

      list.appendChild(row);
    }
    card.appendChild(list);
  }

  container.appendChild(card);
}

function renderNewsCard(container: HTMLElement, newsData: any) {
  if (!container || !newsData) return;
  if (container.querySelector('.chat-news-card')) return;

  const articles: any[] = Array.isArray(newsData) ? newsData : newsData.articles || [];
  if (articles.length === 0) return;

  const card = document.createElement('div');
  card.className = 'chat-rich-card chat-news-card';

  const header = document.createElement('div');
  header.className = 'rich-card-header-row';
  header.innerHTML = `
    <div class="rich-card-title-wrap">
      <span>📰</span> <span>Recent News</span>
    </div>
    <div class="rich-card-badge" style="background: rgba(251, 113, 133, 0.2); color: #fda4af; border: 1px solid rgba(251, 113, 133, 0.4);">
      FreshRSS
    </div>
  `;
  card.appendChild(header);

  const list = document.createElement('div');
  list.className = 'news-articles-list';

  for (const art of articles.slice(0, 3)) {
    const item = document.createElement(art.url ? 'a' : 'div') as HTMLElement;
    item.className = 'news-article-link';
    if (art.url) {
      (item as HTMLAnchorElement).href = art.url;
      (item as HTMLAnchorElement).target = '_blank';
      (item as HTMLAnchorElement).rel = 'noopener noreferrer';
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'news-article-title';
    titleEl.textContent = art.title || 'Untitled Article';
    item.appendChild(titleEl);

    if (art.source) {
      const srcEl = document.createElement('span');
      srcEl.className = 'news-source-pill';
      srcEl.textContent = art.source;
      item.appendChild(srcEl);
    }

    list.appendChild(item);
  }
  card.appendChild(list);

  container.appendChild(card);
}

function renderCostumeCard(container: HTMLElement, costumeSlugOrName: string, characterName?: string) {
  if (!container || !costumeSlugOrName) return;
  if (container.querySelector('.chat-costume-card')) return;

  const card = document.createElement('div');
  card.className = 'chat-rich-card chat-costume-card';

  const header = document.createElement('div');
  header.className = 'rich-card-header-row';
  header.innerHTML = `
    <div class="rich-card-title-wrap">
      <span>👗</span> <span>Costume Change</span>
    </div>
    <div class="rich-card-badge" style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.45);">
      Active Outfit
    </div>
  `;
  card.appendChild(header);

  // Look up character and costume details
  const curChar = (window as any).__getCurrentChar ? (window as any).__getCurrentChar() : null;
  const target = costumeSlugOrName.toLowerCase().trim();
  const matched = curChar?.costumes?.find((c: any) =>
    c.id.toLowerCase() === target ||
    (c as any).costume_slug?.toLowerCase() === target ||
    c.name.toLowerCase() === target ||
    c.id.toLowerCase().endsWith(`::${target}`) ||
    c.name.toLowerCase().includes(target) ||
    target.includes(c.name.toLowerCase()) ||
    c.id.toLowerCase().includes(target) ||
    (target.includes('summer') && c.name.toLowerCase().includes('summer')) ||
    (target.includes('casual') && c.name.toLowerCase().includes('casual')) ||
    (target.includes('biasa') && (c.name.toLowerCase().includes('biasa') || c.id.includes('nrml') || c.id.includes('cmmn')))
  );

  const displayName = matched ? matched.name : costumeSlugOrName;
  const slug = matched ? matched.id : costumeSlugOrName;
  const charDisplay = characterName || curChar?.displayName || curChar?.name || 'Companion';

  const bodyRow = document.createElement('div');
  bodyRow.className = 'costume-card-body';
  bodyRow.innerHTML = `
    <div class="costume-icon-box">✨👘</div>
    <div class="costume-info-box">
      <div class="costume-name-text">${escapeHtml(displayName)}</div>
      <div class="costume-sub-text">${escapeHtml(charDisplay)} • <code>${escapeHtml(slug)}</code></div>
    </div>
  `;
  card.appendChild(bodyRow);

  const actionRow = document.createElement('div');
  actionRow.className = 'costume-card-action-row';

  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.className = 'costume-switch-btn';
  switchBtn.innerHTML = `<span>👗 Switch Outfit</span>`;
  switchBtn.onclick = () => {
    const fn = (window as any).__switchCostume;
    if (fn) fn(slug).catch(console.error);
  };
  actionRow.appendChild(switchBtn);
  card.appendChild(actionRow);

  container.appendChild(card);
}

function renderRichCard(container: HTMLElement, cardType: string, data: any) {
  if (!container || !data) return;
  if (cardType === 'weather') {
    renderWeatherCard(container, data);
  } else if (cardType === 'calendar') {
    renderCalendarCard(container, data);
  } else if (cardType === 'tasks') {
    renderTasksCard(container, data);
  } else if (cardType === 'news') {
    renderNewsCard(container, data);
  } else if (cardType === 'music') {
    renderMusicCard(container, data);
  } else if (cardType === 'costume') {
    renderCostumeCard(container, data);
  }
}

// Toast Helper
function showToast(msg: string, duration = 2800) {
  if (!statusToast) return;
  statusToast.textContent = msg;
  statusToast.style.opacity = '1';
  setTimeout(() => {
    statusToast.style.opacity = '0.4';
  }, duration);
}

function updateMoodBadge(score: number, bracket?: { emoji?: string; label?: string }) {
  const emoji = bracket?.emoji || (score >= 90 ? '💖' : score >= 70 ? '😊' : score >= 50 ? '😏' : score >= 30 ? '😤' : '🧊');
  const label = bracket?.label || (score >= 90 ? 'Adoring' : score >= 70 ? 'Cheerful' : score >= 50 ? 'Sassy' : score >= 30 ? 'Reluctant' : 'Defiant');

  if (companionMoodBadge) {
    const isEnabled = settingMoodEnabled ? settingMoodEnabled.checked : true;
    if (!isEnabled) {
      companionMoodBadge.style.display = 'none';
    } else {
      companionMoodBadge.innerHTML = `${emoji} ${score} ${label}`;
      companionMoodBadge.style.display = 'inline-flex';
    }
  }

  // Live updates to Profile Settings Mood Card
  const profileMoodEmoji = document.getElementById('profile-mood-emoji');
  const profileMoodNum = document.getElementById('profile-mood-number');
  const profileMoodLabel = document.getElementById('profile-mood-label');
  const profileMoodFill = document.getElementById('profile-mood-fill');
  const profileMoodDesc = document.getElementById('profile-mood-desc');

  if (profileMoodEmoji) profileMoodEmoji.textContent = emoji;
  if (profileMoodNum) profileMoodNum.textContent = String(score);
  if (profileMoodLabel) profileMoodLabel.textContent = label;
  if (profileMoodFill) profileMoodFill.style.width = `${Math.max(0, Math.min(100, score))}%`;
  if (profileMoodDesc) {
    const descriptions: Record<string, string> = {
      Adoring: 'Deeply attached, affectionate, fond of compliments, and cheerful.',
      Cheerful: 'Content, playful, and responsive companion state.',
      Sassy: 'Playfully teasing, witty, and slightly sarcastic.',
      Reluctant: 'Slightly irritated with mild sighs, but still participating.',
      Icy: 'Bare-minimum words; needs warm reassurance or apologies.'
    };
    profileMoodDesc.textContent = descriptions[label] || `${label} companion state.`;
  }
}

// Emotion mapping for Live2D expressions
const EMOTION_MAP: Record<string, { expression: string; motionPrefixes: string[] }> = {
  HAPPY: { expression: 'joy-01', motionPrefixes: ['joy-', 'happy-', 'smile-'] },
  SAD: { expression: 'sad-01', motionPrefixes: ['sad-', 'disappoint-', 'tear-'] },
  SURPRISED: { expression: 'surprise-01', motionPrefixes: ['surprise-', 'notice-'] },
  ANGRY: { expression: 'anger-01', motionPrefixes: ['anger-', 'provoke-'] },
  THINKING: { expression: 'serious-01', motionPrefixes: ['think-', 'question-'] },
  NEUTRAL: { expression: 'idle-01', motionPrefixes: ['default-', 'idle-'] }
};

async function main() {
  await setupPet(canvas);

  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!gl) {
    showToast('WebGL not supported');
    return;
  }

  installCoreCompat(console.log);
  debugManager.init();

  const option = new Option();
  option.logFunction = (m: string) => console.log('[cubism]', m);
  option.loggingLevel = LogLevel.LogLevel_Warning;
  CubismFramework.startUp(option);
  CubismFramework.initialize();

  // Load characters dynamically from backend API
  const characters = await loadRegistry((msg) => {
    console.warn('[registry]', msg);
    showToast(msg);
  });

  if (!characters.length) {
    showToast('No characters found in ./Characters');
    return;
  }

  // Active Character & Costume selection
  const savedCharId = localStorage.getItem('character');
  let currentCharacter = characters.find((c) => c.id === savedCharId) ?? characters[0];

  const savedCostumeId = localStorage.getItem(`costume_${currentCharacter.id}`) || currentCharacter.activeCostumeId;
  let currentCostume = pickCostume(currentCharacter, savedCostumeId);
  currentCharacter.activeCostumeId = currentCostume.id;
  localStorage.setItem(`costume_${currentCharacter.id}`, currentCostume.id);

  updateCompanionHeader(currentCharacter, currentCostume);
  populateCharacterSelector(characters, currentCharacter.id);
  populateCostumeSelector(currentCharacter.costumes, currentCostume.id);

  let { dir, file } = resolveModel(currentCharacter, currentCostume);
  let voiceUrl = `${currentCharacter.dir}/${currentCharacter.voice ?? 'voice'}/greet.wav`;

  let model: CompanionModel;
  try {
    showToast(`Loading ${currentCharacter.name}...`);
    model = await CompanionModel.load(
      gl,
      dir,
      file,
      (msg) => console.log('[load]', msg),
      currentCharacter.motions ? `${currentCharacter.dir}/${currentCharacter.motions}` : undefined
    );
    await model.loadMotions();

    // Restore saved position/zoom for this character and costume
    restoreModelTransform(currentCharacter.id, currentCostume.id, model);
    showToast(`Ready: ${currentCharacter.name}`);
  } catch (err: any) {
    console.error('[load failed]', err);
    showToast(`Load failed: ${err.message}`);
    return;
  }

  const stage = () => model;
  (window as any).__model = stage;
  enableResize(canvas, model.artAspect);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const lipSync = new LipSync();
  (window as any).__lipSync = lipSync;

  const idle = new IdleDirector(stage, {
    onPlay: (name) => console.log('[idle motion]', name)
  });
  (window as any).__idle = idle;

  // Responsive Canvas Sizing
  function resizeCanvas() {
    if (!canvasWrapper) return;
    const rect = canvasWrapper.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Mouse Cursor Tracking (Follow eyes/head)
  if (inTauri()) {
    onCursor((x, y) => model.lookAt(x, y));
  } else {
    window.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      model.lookAt(x, y);
    });
    window.addEventListener('mouseleave', () => model.lookAt(0, 0));
  }

  // --- MODEL REPOSITIONING (Mouse Drag & Scroll Wheel per Character & Costume) ---
  setupModelRepositioning(
    canvasWrapper,
    () => model,
    () => currentCharacter.id,
    () => currentCostume.id
  );

  // Costume Switcher function
  let isSwitchingCostume = false;
  const switchCostume = async (costumeId: string): Promise<void> => {
    const target = (costumeId || '').trim().toLowerCase();
    const next = currentCharacter.costumes.find(
      (c) =>
        c.id.toLowerCase() === target ||
        (c as any).costume_slug?.toLowerCase() === target ||
        c.name.toLowerCase() === target ||
        c.id.toLowerCase().endsWith(`::${target}`) ||
        c.name.toLowerCase().includes(target) ||
        target.includes(c.name.toLowerCase()) ||
        c.id.toLowerCase().includes(target) ||
        (target.includes('summer') && c.name.toLowerCase().includes('summer')) ||
        (target.includes('casual') && c.name.toLowerCase().includes('casual')) ||
        (target.includes('biasa') && (c.name.toLowerCase().includes('biasa') || c.id.includes('nrml') || c.id.includes('cmmn')))
    );
    if (!next || isSwitchingCostume || next.id === currentCostume.id) return;
    isSwitchingCostume = true;
    showToast(`Switching outfit to ${next.name}...`);

    const prev = model;
    try {
      const at = resolveModel(currentCharacter, next);
      const fresh = await CompanionModel.load(
        gl,
        at.dir,
        at.file,
        () => {},
        currentCharacter.motions ? `${currentCharacter.dir}/${currentCharacter.motions}` : undefined
      );
      await fresh.loadMotions();

      // Restore costume-specific position & zoom for this outfit
      currentCostume = next;
      currentCharacter.activeCostumeId = next.id;
      const charInList = characters.find(c => c.id === currentCharacter.id);
      if (charInList) charInList.activeCostumeId = next.id;
      localStorage.setItem(`costume_${currentCharacter.id}`, next.id);
      localStorage.setItem('costume', next.id);
      debugManager.log('INTERACTION', `Costume switched: ${next.name} (${next.id})`);
      restoreModelTransform(currentCharacter.id, currentCostume.id, fresh);
      model = fresh;
      prev.release();
      enableResize(canvas, model.artAspect);
      updateCompanionHeader(currentCharacter, currentCostume);
      populateCostumeSelector(currentCharacter.costumes, currentCostume.id);
      showToast(`Outfit: ${next.name}`);

      void fetch(`/api/characters/${encodeURIComponent(currentCharacter.id)}/costume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costumeId: next.id })
      });
    } catch (e: any) {
      showToast(`Costume switch failed: ${e.message}`);
    } finally {
      isSwitchingCostume = false;
    }
  };
  (window as any).__switchCostume = switchCostume;
  (window as any).__getCurrentChar = () => currentCharacter;

  // Character Switcher function
  const switchCharacter = async (charId: string): Promise<void> => {
    const nextChar = characters.find((c) => c.id === charId);
    if (!nextChar || nextChar.id === currentCharacter.id) return;

    showToast(`Loading companion ${nextChar.name}...`);
    currentCharacter = nextChar;
    const savedCostumeId = localStorage.getItem(`costume_${nextChar.id}`) || nextChar.activeCostumeId;
    currentCostume = pickCostume(currentCharacter, savedCostumeId);
    currentCharacter.activeCostumeId = currentCostume.id;
    nextChar.activeCostumeId = currentCostume.id;
    localStorage.setItem('character', nextChar.id);
    localStorage.setItem(`costume_${nextChar.id}`, currentCostume.id);
    localStorage.setItem('costume', currentCostume.id);
    debugManager.log('INTERACTION', `Switched character: ${nextChar.name}, outfit: ${currentCostume.name} (${currentCostume.id})`);

    const prev = model;
    try {
      const at = resolveModel(currentCharacter, currentCostume);
      const fresh = await CompanionModel.load(
        gl,
        at.dir,
        at.file,
        () => {},
        currentCharacter.motions ? `${currentCharacter.dir}/${currentCharacter.motions}` : undefined
      );
      await fresh.loadMotions();
      restoreModelTransform(currentCharacter.id, currentCostume.id, fresh);
      model = fresh;
      prev.release();
      enableResize(canvas, model.artAspect);
      voiceUrl = `${currentCharacter.dir}/${currentCharacter.voice ?? 'voice'}/greet.wav`;

      updateCompanionHeader(currentCharacter, currentCostume);
      populateCharacterSelector(characters, currentCharacter.id);
      populateCostumeSelector(currentCharacter.costumes, currentCostume.id);
      await loadConversationHistory(currentCharacter.id);
      void fetch(`/api/characters/${encodeURIComponent(currentCharacter.id)}/costume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costumeId: currentCostume.id })
      });
      fetch(`/api/characters/${encodeURIComponent(currentCharacter.id)}/mood`)
        .then(r => r.json())
        .then(data => {
          if (data?.bracket && data?.score !== undefined) {
            updateMoodBadge(data.score, data.bracket);
          }
        }).catch(() => {});
      showToast(`Switched to ${currentCharacter.name}`);
    } catch (e: any) {
      showToast(`Character switch failed: ${e.message}`);
    }
  };

  // Expression trigger function
  const triggerEmotion = (emotion: string) => {
    const mapped = EMOTION_MAP[emotion.toUpperCase()] ?? EMOTION_MAP.NEUTRAL;
    if (model.expressions.has(mapped.expression)) {
      model.setExpression(mapped.expression);
    }
    const candidates = model.motionIndex.filter(
      (m) => !m.loop && mapped.motionPrefixes.some((p) => m.name.startsWith(p))
    );
    if (candidates.length) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      void model.playMotion(pick.name);
    }
  };

  // Render Loop
  let lastTime = performance.now();
  const render = (now: number) => {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);

    model.setMouthOpen(lipSync.update(dt));
    idle.update(dt, lipSync.speaking);
    model.update(dt);
    model.draw(gl, canvas.width, canvas.height);

    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);

  // Setup UI Events & Tabbed Settings
  setupUI(
    characters,
    () => currentCharacter,
    () => currentCostume,
    switchCharacter,
    switchCostume,
    triggerEmotion,
    lipSync,
    () => voiceUrl,
    () => model,
    () => currentCharacter.id
  );

  // Rename Character Button
  btnRenameCharacter?.addEventListener('click', async () => {
    const currentName = currentCharacter.displayName || currentCharacter.name;
    const newName = prompt(`Enter custom display name for ${currentName}:`, currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;
    const trimmed = newName.trim();
    try {
      const res = await fetch(`/api/characters/${currentCharacter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: trimmed })
      });
      if (res.ok) {
        currentCharacter.displayName = trimmed;
        currentCharacter.name = trimmed;
        updateCompanionHeader(currentCharacter, currentCostume);
        populateCharacterSelector(characters, currentCharacter.id);
        showToast(`Renamed companion to: ${trimmed}`);
      }
    } catch (e: any) {
      showToast(`Rename failed: ${e.message}`);
    }
  });

  // Rename Costume Button (without touching disk folders)
  btnRenameCostume?.addEventListener('click', async () => {
    const currentCostumeName = currentCostume.name;
    const newName = prompt(`Enter custom friendly name for outfit "${currentCostumeName}":`, currentCostumeName);
    if (!newName || !newName.trim() || newName.trim() === currentCostumeName) return;
    const trimmed = newName.trim();
    try {
      const res = await fetch(`/api/characters/${currentCharacter.id}/costumes/${currentCostume.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      if (res.ok) {
        currentCostume.name = trimmed;
        updateCompanionHeader(currentCharacter, currentCostume);
        populateCostumeSelector(currentCharacter.costumes, currentCostume.id);
        showToast(`Renamed outfit to: ${trimmed}`);
      }
    } catch (e: any) {
      showToast(`Rename failed: ${e.message}`);
    }
  });

  // Setup WebSocket Link
  setupWebSocket(stage, lipSync, switchCostume, triggerEmotion, () => characters, () => currentCharacter);

  // Load chat history
  await loadConversationHistory(currentCharacter.id);

  // Load initial mood
  fetch(`/api/characters/${encodeURIComponent(currentCharacter.id)}/mood`)
    .then(r => r.json())
    .then(data => {
      if (data?.bracket && data?.score !== undefined) {
        updateMoodBadge(data.score, data.bracket);
      }
    }).catch(() => {});
}

// --- Position & Zoom Helpers (Per Character & Costume) ---
function saveModelTransform(
  charId: string,
  costumeId: string | undefined,
  model: CompanionModel,
  notify = true
) {
  if (!model) return;
  const transform = {
    x: +model.offsetX.toFixed(4),
    y: +model.offsetY.toFixed(4),
    zoom: +model.zoom.toFixed(3)
  };
  if (costumeId) {
    localStorage.setItem(`l2d_transform_${charId}_${costumeId}`, JSON.stringify(transform));
  } else {
    localStorage.setItem(`l2d_transform_${charId}`, JSON.stringify(transform));
  }
  if (notify) {
    showToast('Position saved for this outfit!');
  }
}

function restoreModelTransform(
  charId: string,
  costumeId: string | undefined,
  model: CompanionModel
) {
  if (!model) return;
  let raw: string | null = null;
  if (costumeId) {
    raw = localStorage.getItem(`l2d_transform_${charId}_${costumeId}`);
  }
  if (!raw) {
    raw = localStorage.getItem(`l2d_transform_${charId}`);
  }
  if (raw) {
    try {
      const t = JSON.parse(raw);
      model.setTransform(t.x ?? 0, t.y ?? 0, t.zoom ?? 1.0);
      if (settingZoomSlider) settingZoomSlider.value = String(t.zoom ?? 1.0);
      return;
    } catch {}
  }
  model.setTransform(0, 0, 1.0);
  if (settingZoomSlider) settingZoomSlider.value = '1.0';
}

function resetModelTransform(
  charId: string,
  costumeId: string | undefined,
  model: CompanionModel
) {
  if (!model) return;
  model.setTransform(0, 0, 1.0);
  if (costumeId) {
    localStorage.removeItem(`l2d_transform_${charId}_${costumeId}`);
  }
  localStorage.removeItem(`l2d_transform_${charId}`);
  if (settingZoomSlider) settingZoomSlider.value = '1.0';
  showToast('Position reset to center');
}

function setupModelRepositioning(
  wrapper: HTMLDivElement,
  getModel: () => CompanionModel,
  getCharId: () => string,
  getCostumeId: () => string
) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialOffsetX = 0;
  let initialOffsetY = 0;
  let hasMoved = false;

  // Drag on Left Click (0), Middle Click (1), or Right Click (2)
  const onMouseDown = (e: MouseEvent) => {
    // If clicking on dock buttons, overlay controls, or inputs, do not drag
    if ((e.target as HTMLElement).closest('.stage-dock, button, select, input')) {
      return;
    }
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;

    e.preventDefault();
    isDragging = true;
    hasMoved = false;
    wrapper.classList.add('dragging');
    startX = e.clientX;
    startY = e.clientY;
    const currentModel = getModel();
    initialOffsetX = currentModel.offsetX;
    initialOffsetY = currentModel.offsetY;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) {
      hasMoved = true;
    }
    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Convert pixel delta directly to Normalized Device Coordinates (NDC: -1 to +1)
    const dx = ((e.clientX - startX) / rect.width) * 2;
    const dy = -(((e.clientY - startY) / rect.height) * 2);

    const currentModel = getModel();
    currentModel.offsetX = initialOffsetX + dx;
    currentModel.offsetY = initialOffsetY + dy;
  };

  const onMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      wrapper.classList.remove('dragging');
      if (hasMoved) {
        // Auto-save silently for this character & outfit so dragging is never lost
        saveModelTransform(getCharId(), getCostumeId(), getModel(), false);
      } else {
        // Tap/click detected without dragging
        const touchEnabled = settingTouchEnabled ? settingTouchEnabled.checked : true;
        if (touchEnabled) {
          const rect = wrapper.getBoundingClientRect();
          const area = (startY - rect.top) < (rect.height * 0.45) ? 'head' : 'body';
          void fetch('/api/interactions/touch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId: getCharId(), area })
          }).then(res => res.json()).then(data => {
            if (data?.bracket && data?.score !== undefined) {
              updateMoodBadge(data.score, data.bracket);
            }
          }).catch(() => {});

          const currentModel = getModel();
          const motions = area === 'head'
            ? ['joy-01_lv03', 'smile-01_lv03', 'doya-01_lv03', 'shy-01_lv03']
            : ['anger-01_lv03', 'surprise-01_lv03', 'serious-01_lv03'];
          const pick = motions[Math.floor(Math.random() * motions.length)];
          void currentModel.playMotion(pick);
        }
      }
    }
  };

  wrapper.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onMouseUp);

  wrapper.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Wheel zoom
  wrapper.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05;
      const currentModel = getModel();
      currentModel.zoom = Math.max(0.3, Math.min(3.0, +(currentModel.zoom * factor).toFixed(3)));
      if (settingZoomSlider) settingZoomSlider.value = currentModel.zoom.toFixed(2);
      saveModelTransform(getCharId(), getCostumeId(), currentModel, false);
    },
    { passive: false }
  );

  // Position control buttons
  const step = 0.08;
  btnPanLeft?.addEventListener('click', () => {
    const m = getModel();
    m.offsetX -= step;
    saveModelTransform(getCharId(), getCostumeId(), m, false);
  });
  btnPanRight?.addEventListener('click', () => {
    const m = getModel();
    m.offsetX += step;
    saveModelTransform(getCharId(), getCostumeId(), m, false);
  });
  btnPanUp?.addEventListener('click', () => {
    const m = getModel();
    m.offsetY += step;
    saveModelTransform(getCharId(), getCostumeId(), m, false);
  });
  btnPanDown?.addEventListener('click', () => {
    const m = getModel();
    m.offsetY -= step;
    saveModelTransform(getCharId(), getCostumeId(), m, false);
  });
  btnZoomIn?.addEventListener('click', () => {
    const m = getModel();
    m.zoom = Math.min(3.0, +(m.zoom + 0.1).toFixed(2));
    if (settingZoomSlider) settingZoomSlider.value = String(m.zoom);
    saveModelTransform(getCharId(), getCostumeId(), m, false);
  });
  btnZoomOut?.addEventListener('click', () => {
    const m = getModel();
    m.zoom = Math.max(0.3, +(m.zoom - 0.1).toFixed(2));
    if (settingZoomSlider) settingZoomSlider.value = String(m.zoom);
    saveModelTransform(getCharId(), getCostumeId(), m, false);
  });

  btnSavePos?.addEventListener('click', () =>
    saveModelTransform(getCharId(), getCostumeId(), getModel(), true)
  );
  btnResetPos?.addEventListener('click', () =>
    resetModelTransform(getCharId(), getCostumeId(), getModel())
  );
  btnModalSavePos?.addEventListener('click', () =>
    saveModelTransform(getCharId(), getCostumeId(), getModel(), true)
  );
  btnModalResetPos?.addEventListener('click', () =>
    resetModelTransform(getCharId(), getCostumeId(), getModel())
  );

  settingZoomSlider?.addEventListener('input', () => {
    const m = getModel();
    m.zoom = parseFloat(settingZoomSlider.value);
    saveModelTransform(getCharId(), getCostumeId(), m, false);
  });
}

// UI Header Helpers
function updateCompanionHeader(char: Character, costume: Costume) {
  if (companionNameEl) companionNameEl.textContent = char.displayName || char.name;
  if (companionCostumeEl) companionCostumeEl.textContent = costume.name;
  if (companionInitialEl) companionInitialEl.textContent = (char.name[0] || 'C').toUpperCase();
}

function populateCharacterSelector(characters: Character[], activeId: string) {
  if (!selectCharacter) return;
  selectCharacter.innerHTML = '';
  for (const c of characters) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.displayName || c.name;
    opt.selected = c.id === activeId;
    selectCharacter.appendChild(opt);
  }
}

function populateCostumeSelector(costumes: Costume[], activeId: string) {
  if (!selectCostume) return;
  selectCostume.innerHTML = '';
  for (const c of costumes) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    opt.selected = c.id === activeId;
    selectCostume.appendChild(opt);
  }
}

// Conversation History, Timestamps & Date Separator tracking
let activeConversationId = '';
let lastRenderedChatDateKey: string | null = null;
const renderedMessageIds = new Set<string>();

function resetChatDateTracker() {
  lastRenderedChatDateKey = null;
  renderedMessageIds.clear();
}

function getCalendarDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatBubbleTimestamp(timestamp?: number): { display: string; title: string } {
  const d = timestamp ? new Date(timestamp) : new Date();
  const now = new Date();

  const msgKey = getCalendarDateKey(d);
  const todayKey = getCalendarDateKey(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getCalendarDateKey(yesterday);

  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const fullTitle = d.toLocaleString();

  if (msgKey === todayKey) {
    return { display: `Today, ${timeStr}`, title: fullTitle };
  }
  if (msgKey === yesterdayKey) {
    return { display: `Yesterday, ${timeStr}`, title: fullTitle };
  }

  // Older message
  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  });
  return { display: `${dateStr}, ${timeStr}`, title: fullTitle };
}

function formatDateSeparatorLabel(d: Date): string {
  const now = new Date();
  const msgKey = getCalendarDateKey(d);
  const todayKey = getCalendarDateKey(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getCalendarDateKey(yesterday);

  if (msgKey === todayKey) return 'Today';
  if (msgKey === yesterdayKey) return 'Yesterday';

  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function maybeAppendDateSeparator(container: HTMLElement, timestamp?: number) {
  if (!container) return;
  const d = timestamp ? new Date(timestamp) : new Date();
  const msgKey = getCalendarDateKey(d);

  if (lastRenderedChatDateKey !== msgKey) {
    lastRenderedChatDateKey = msgKey;

    const sep = document.createElement('div');
    sep.className = 'chat-date-separator';

    const lineLeft = document.createElement('div');
    lineLeft.className = 'date-sep-line';

    const pill = document.createElement('div');
    pill.className = 'date-sep-pill';
    pill.textContent = formatDateSeparatorLabel(d);

    const lineRight = document.createElement('div');
    lineRight.className = 'date-sep-line';

    sep.appendChild(lineLeft);
    sep.appendChild(pill);
    sep.appendChild(lineRight);

    container.appendChild(sep);
  }
}

async function loadConversationHistory(characterId: string) {
  if (!chatMessagesEl) return;
  try {
    const convRes = await fetch(`/api/conversations?characterId=${encodeURIComponent(characterId)}`);
    if (!convRes.ok) return;
    const conv = await convRes.json();
    activeConversationId = conv.id;

    const msgsRes = await fetch(`/api/conversations/${conv.id}/messages`);
    if (!msgsRes.ok) return;
    const msgs = await msgsRes.json();

    chatMessagesEl.innerHTML = '';
    resetChatDateTracker();
    for (const m of msgs) {
      if (m.id) {
        renderedMessageIds.add(m.id);
      }
      appendMessageBubble(
        m.role,
        m.content,
        m.emotion,
        m.motion,
        m.audio_url,
        m.thought,
        m.costume,
        m.raw_content,
        m.music_track,
        m.cards,
        m.created_at,
        m.id
      );
    }
  } catch (e) {
    console.warn('[history] Failed to load messages:', e);
  }
}

function createRawDebugElement(rawText: string): { details: HTMLDetailsElement; rawBtn: HTMLButtonElement } {
  const isGlobalRaw = localStorage.getItem('show_raw_in_chat') === 'true';
  const isDbg = debugManager.isDebugMode;

  const rawBtn = document.createElement('button');
  rawBtn.className = 'tag-pill raw-btn';
  rawBtn.title = 'Click to view / hide original unparsed AI output';
  rawBtn.innerHTML = '👁️ Raw';
  if (isGlobalRaw) rawBtn.classList.add('active');

  const details = document.createElement('details');
  details.className = 'msg-debug-details';
  details.style.display = isGlobalRaw || isDbg ? 'block' : 'none';
  if (isGlobalRaw) details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'msg-debug-summary';
  summary.innerHTML = `<span>🔍 Raw AI Output (${rawText.length} chars)</span>`;

  const header = document.createElement('div');
  header.className = 'msg-debug-header';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-copy-raw-inline';
  copyBtn.innerHTML = '📋 Copy';
  copyBtn.onclick = (e) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(rawText);
    copyBtn.innerHTML = '✓ Copied';
    setTimeout(() => {
      copyBtn.innerHTML = '📋 Copy';
    }, 1500);
  };
  header.appendChild(copyBtn);

  const pre = document.createElement('pre');
  pre.className = 'msg-debug-pre';
  pre.textContent = rawText;

  details.appendChild(summary);
  details.appendChild(header);
  details.appendChild(pre);

  rawBtn.onclick = (e) => {
    e.stopPropagation();
    details.style.display = 'block';
    details.open = !details.open;
    if (details.open) {
      rawBtn.classList.add('active');
    } else {
      rawBtn.classList.remove('active');
      if (!debugManager.isDebugMode && localStorage.getItem('show_raw_in_chat') !== 'true') {
        details.style.display = 'none';
      }
    }
  };

  details.addEventListener('toggle', () => {
    if (details.open) rawBtn.classList.add('active');
    else rawBtn.classList.remove('active');
  });

  return { details, rawBtn };
}

function appendMessageBubble(
  role: 'user' | 'assistant',
  content: string,
  emotion?: string,
  motion?: string,
  audioUrl?: string,
  thought?: string,
  costume?: string,
  rawContent?: string,
  musicTrack?: any,
  cards?: Array<{ type: string; data: any }>,
  timestamp?: number,
  messageId?: string
): HTMLDivElement {
  if (messageId) {
    if (renderedMessageIds.has(messageId)) {
      const existing = chatMessagesEl?.querySelector(`[data-message-id="${messageId}"]`) as HTMLDivElement | null;
      if (existing) return existing;
    }
    renderedMessageIds.add(messageId);
  }

  if (chatMessagesEl) {
    maybeAppendDateSeparator(chatMessagesEl, timestamp);
  }

  // Extract and strip any embedded <think>...</think> from content (for historical or raw messages)
  let thoughtText = thought || '';
  const thinkRegex = /<(?:think|thought|reasoning)[^>]*>([\s\S]*?)<\/(?:think|thought|reasoning)>/i;
  const thinkMatch = thinkRegex.exec(content);
  if (thinkMatch) {
    if (!thoughtText) thoughtText = thinkMatch[1].trim();
    content = content.replace(thinkRegex, '').trim();
  }

  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  if (messageId) {
    row.setAttribute('data-message-id', messageId);
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span>${role === 'user' ? 'You' : 'Companion'}</span>`;

  if (emotion && emotion !== 'NEUTRAL') {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = emotion;
    meta.appendChild(pill);
  }

  if (motion) {
    const motionPill = document.createElement('span');
    motionPill.className = 'tag-pill motion';
    motionPill.textContent = motion;
    meta.appendChild(motionPill);
  }

  if (costume) {
    const costumePill = document.createElement('span');
    costumePill.className = 'tag-pill costume';
    costumePill.textContent = `👔 ${costume}`;
    meta.appendChild(costumePill);
  }

  const timeInfo = formatBubbleTimestamp(timestamp);
  const timeSpan = document.createElement('span');
  timeSpan.className = 'msg-time';
  timeSpan.title = timeInfo.title;
  timeSpan.textContent = timeInfo.display;
  meta.appendChild(timeSpan);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  // If thought is present, add a collapsible details box
  if (thoughtText) {
    const details = document.createElement('details');
    details.className = 'thought-accordion';
    const summary = document.createElement('summary');
    summary.className = 'thought-summary';
    summary.textContent = '💭 Thought Process';
    const thoughtBody = document.createElement('div');
    thoughtBody.className = 'thought-body';
    thoughtBody.textContent = thoughtText;
    details.appendChild(summary);
    details.appendChild(thoughtBody);
    bubble.appendChild(details);
  }

  const textSpan = document.createElement('span');
  textSpan.className = 'bubble-text';
  textSpan.innerHTML = renderMarkdown(content.trim());
  bubble.appendChild(textSpan);

  // In Debug / Raw Mode: Show collapsible original raw AI output with inline copy and pill toggle
  if (role === 'assistant' && (rawContent || content)) {
    const rawToDisplay = rawContent || content;
    const { details, rawBtn } = createRawDebugElement(rawToDisplay);
    meta.appendChild(rawBtn);
    bubble.appendChild(details);
  }

  if (musicTrack) {
    renderMusicCard(bubble, musicTrack);
  }

  if (Array.isArray(cards)) {
    for (const c of cards) {
      renderRichCard(bubble, c.type, c.data);
    }
  }

  if (costume) {
    renderCostumeCard(bubble, costume);
  }

  row.appendChild(meta);
  row.appendChild(bubble);

  if (audioUrl) {
    const chip = document.createElement('div');
    chip.className = 'audio-chip';
    chip.innerHTML = '▶ Listen';
    chip.onclick = () => {
      const ls = (window as any).__lipSync as LipSync;
      if (ls) ls.play(audioUrl).catch(console.error);
    };
    bubble.appendChild(document.createElement('br'));
    bubble.appendChild(chip);
  }

  chatMessagesEl.appendChild(row);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return row;
}

// Main UI Event Binder
function setupUI(
  characters: Character[],
  getCurrentChar: () => Character,
  getCurrentCostume: () => Costume,
  onSwitchChar: (id: string) => Promise<void>,
  onSwitchCostume: (id: string) => Promise<void>,
  onEmotion: (e: string) => void,
  lipSync: LipSync,
  getVoiceUrl: () => string,
  getModel: () => CompanionModel,
  _getCharId: () => string
) {
  const getCurChar = () => getCurrentChar();

  // Dropdown changes
  selectCharacter?.addEventListener('change', () => {
    void onSwitchChar(selectCharacter.value);
  });

  selectCostume?.addEventListener('change', () => {
    void onSwitchCostume(selectCostume.value);
  });

  // Sending a chat message
  const sendMessage = async () => {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    adjustChatInputHeight();

    const msgTime = Date.now();
    debugManager.log('AI', `User sent: "${text.slice(0, 60)}"`, { text });
    appendMessageBubble('user', text, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, msgTime);

    // Placeholder assistant bubble with streaming cursor
    if (chatMessagesEl) {
      maybeAppendDateSeparator(chatMessagesEl, msgTime);
    }
    const timeInfo = formatBubbleTimestamp(msgTime);
    const pendingRow = document.createElement('div');
    pendingRow.className = 'msg-row assistant is-pending';
    const pendingMeta = document.createElement('div');
    pendingMeta.className = 'msg-meta';
    pendingMeta.innerHTML = `<span>Companion</span><span class="tag-pill">THINKING</span><span class="msg-time" title="${timeInfo.title}">${timeInfo.display}</span>`;
    const pendingBubble = document.createElement('div');
    pendingBubble.className = 'msg-bubble';
    const cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    pendingBubble.appendChild(cursor);
    pendingRow.appendChild(pendingMeta);
    pendingRow.appendChild(pendingBubble);
    chatMessagesEl.appendChild(pendingRow);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: selectCharacter?.value || getCurChar().id,
          message: text,
          conversationId: activeConversationId
        })
      });

      if (!res.ok) {
        pendingRow.classList.remove('is-pending');
        let errData: any = {};
        try {
          errData = await res.json();
        } catch {
          errData = { error: `Server error: HTTP ${res.status}` };
        }
        cursor.remove();
        const classified = {
          title: errData.title || 'AI Request Failed',
          code: errData.code || `HTTP_${res.status}`,
          message: errData.error || errData.message || `Server returned HTTP ${res.status}`,
          hint: errData.hint || 'Check your AI brain settings and credentials.',
          provider: errData.provider,
          retryable: errData.retryable !== false
        };
        debugManager.log('AI', classified.title, classified, undefined, 'error');
        showTopNotice('error', classified.title, classified.message, {
          hint: classified.hint,
          actionLabel: 'Settings',
          onAction: () => {
            document.getElementById('btn-open-settings')?.click();
            document.querySelector<HTMLButtonElement>('[data-tab="tab-ai"]')?.click();
          }
        });
        renderChatErrorCard(pendingBubble, classified, text, () => {
          chatInput.value = text;
          void sendMessage();
        });
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let streamedText = '';
      let receivedAudioUrl = '';
      let receivedThought = '';
      let receivedMusicTrack: any = null;
      let receivedCostume: string = '';
      let receivedCards: Array<{ type: string; data: any }> = [];
      let doneData: any = null;
      let isError = false;

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const data = JSON.parse(line.slice(5).trim());
              if (data.type === 'token') {
                streamedText += data.token;
                pendingBubble.innerHTML = renderMarkdown(streamedText);
                pendingBubble.appendChild(cursor);
                chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
              } else if (data.type === 'thought') {
                receivedThought += data.thought;
              } else if (data.type === 'audio') {
                receivedAudioUrl = data.audio_url;
              } else if (data.type === 'music') {
                receivedMusicTrack = data.track;
                renderMusicCard(pendingBubble, data.track);
                chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
              } else if (data.type === 'costume') {
                receivedCostume = data.costume;
                void onSwitchCostume(data.costume);
              } else if (data.type === 'card') {
                if (data.cardType && data.data && !receivedCards.some(rc => rc.type === data.cardType)) {
                  receivedCards.push({ type: data.cardType, data: data.data });
                  renderRichCard(pendingBubble, data.cardType, data.data);
                  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
                }
              } else if (data.type === 'error') {
                isError = true;
                pendingRow.classList.remove('is-pending');
                cursor.remove();
                debugManager.log('AI', data.title || 'AI Error', data, undefined, 'error');
                showTopNotice('error', data.title || 'AI Model Error', data.error || data.message || 'Stream error', {
                  hint: data.hint,
                  actionLabel: 'AI Settings',
                  onAction: () => {
                    document.getElementById('btn-open-settings')?.click();
                    document.querySelector<HTMLButtonElement>('[data-tab="tab-ai"]')?.click();
                  }
                });
                renderChatErrorCard(pendingBubble, data, text, () => {
                  chatInput.value = text;
                  void sendMessage();
                });
                break;
              } else if (data.type === 'done') {
                doneData = data;
                cursor.remove();
                if (data.message?.id) {
                  pendingRow.setAttribute('data-message-id', data.message.id);
                  pendingRow.classList.remove('is-pending');
                  renderedMessageIds.add(data.message.id);
                }
                if (data.thought) receivedThought = data.thought;
                if (data.message?.thought) receivedThought = data.message.thought;
                if (data.message?.audio_url) receivedAudioUrl = data.message.audio_url;
                if (data.music_track && !receivedMusicTrack) {
                  receivedMusicTrack = data.music_track;
                }
                if (Array.isArray(data.cards)) {
                  for (const c of data.cards) {
                    if (!receivedCards.some(rc => rc.type === c.type)) {
                      receivedCards.push(c);
                    }
                  }
                }

                if (data.debug) {
                  debugManager.setLatestRaw(data.debug.raw_output || streamedText, {
                    provider: data.debug.provider,
                    model: data.debug.model,
                    latencyMs: data.debug.latency_ms
                  });
                  if (data.debug.prompt_messages) {
                    debugManager.setLatestPrompt(data.debug.prompt_messages);
                  }
                  debugManager.log('AI', `AI Stream Completed (${data.debug.latency_ms}ms)`, data.debug);
                } else if (data.message?.raw_content) {
                  debugManager.setLatestRaw(data.message.raw_content);
                }

                let metaHtml = '<span>Companion</span>';
                if (data.message?.emotion && data.message.emotion !== 'NEUTRAL') {
                  metaHtml += `<span class="tag-pill">${data.message.emotion}</span>`;
                }
                if (data.message?.motion) {
                  metaHtml += `<span class="tag-pill motion">${data.message.motion}</span>`;
                }
                const cos = data.message?.costume || data.costume;
                if (cos) {
                  receivedCostume = cos;
                  metaHtml += `<span class="tag-pill costume">👔 ${cos}</span>`;
                  void onSwitchCostume(cos);
                }
                const replyTime = data.message?.created_at ? formatBubbleTimestamp(data.message.created_at) : timeInfo;
                metaHtml += `<span class="msg-time" title="${replyTime.title}">${replyTime.display}</span>`;
                pendingMeta.innerHTML = metaHtml;
              }
            } catch {}
          }
          if (isError) break;
        }
      }

      pendingRow.classList.remove('is-pending');
      if (doneData?.message?.id) {
        pendingRow.setAttribute('data-message-id', doneData.message.id);
        renderedMessageIds.add(doneData.message.id);
      }

      if (isError) return;

      cursor.remove();
      pendingBubble.innerHTML = '';

      // If thought was captured, render collapsible accordion
      if (receivedThought) {
        const details = document.createElement('details');
        details.className = 'thought-accordion';
        const summary = document.createElement('summary');
        summary.className = 'thought-summary';
        summary.textContent = '💭 Thought Process';
        const thoughtBody = document.createElement('div');
        thoughtBody.className = 'thought-body';
        thoughtBody.textContent = receivedThought;
        details.appendChild(summary);
        details.appendChild(thoughtBody);
        pendingBubble.appendChild(details);
      }

      const textSpan = document.createElement('span');
      textSpan.className = 'bubble-text';
      textSpan.innerHTML = renderMarkdown(streamedText.trim());
      pendingBubble.appendChild(textSpan);

      if (receivedMusicTrack) {
        renderMusicCard(pendingBubble, receivedMusicTrack);
      }
      if (receivedCards.length > 0) {
        for (const c of receivedCards) {
          renderRichCard(pendingBubble, c.type, c.data);
        }
      }

      if (receivedCostume || doneData?.message?.costume || doneData?.costume) {
        const c = receivedCostume || doneData?.message?.costume || doneData?.costume;
        renderCostumeCard(pendingBubble, c);
      }

      // In Debug / Raw Mode: Show collapsible original raw AI output with inline copy and pill toggle
      const rawTextToDisplay = doneData?.debug?.raw_output || doneData?.message?.raw_content || streamedText;
      if (rawTextToDisplay) {
        const { details, rawBtn } = createRawDebugElement(rawTextToDisplay);
        pendingMeta.appendChild(rawBtn);
        pendingBubble.appendChild(details);
      }

      if (receivedAudioUrl) {
        const chip = document.createElement('div');
        chip.className = 'audio-chip';
        chip.innerHTML = '▶ Listen';
        chip.onclick = () => lipSync.play(receivedAudioUrl).catch(console.error);
        pendingBubble.appendChild(document.createElement('br'));
        pendingBubble.appendChild(chip);
      }
    } catch (e: any) {
      cursor.remove();
      pendingRow.classList.remove('is-pending');
      const errObj = {
        title: 'Network / Communication Error',
        code: 'NETWORK_ERROR',
        message: e.message || 'Failed to reach companion server',
        hint: 'Verify the server is running on localhost.',
        retryable: true
      };
      debugManager.log('AI', errObj.title, errObj, undefined, 'error');
      showTopNotice('error', errObj.title, errObj.message, { hint: errObj.hint });
      renderChatErrorCard(pendingBubble, errObj, text, () => {
        chatInput.value = text;
        void sendMessage();
      });
    }
  };

  sendBtn?.addEventListener('click', () => void sendMessage());

  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  });

  const adjustChatInputHeight = () => {
    if (!chatInput) return;
    const wrapper = chatInput.closest('.input-wrapper') as HTMLElement;
    if (!chatInput.value) {
      chatInput.style.height = '24px';
      if (wrapper) wrapper.style.alignItems = 'center';
      return;
    }
    chatInput.style.height = '24px';
    const targetH = Math.max(24, Math.min(chatInput.scrollHeight, 120));
    chatInput.style.height = `${targetH}px`;
    if (wrapper) {
      wrapper.style.alignItems = targetH > 28 ? 'flex-end' : 'center';
    }
  };

  adjustChatInputHeight();

  chatInput?.addEventListener('input', adjustChatInputHeight);

  // Voice Dictation (STT) setup
  if (sttBtn) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      let isRecording = false;

      recognition.onstart = () => {
        isRecording = true;
        sttBtn.classList.add('recording');
        showToast('Listening... Speak now', 2500);
      };
      recognition.onresult = (evt: any) => {
        const transcript = evt.results?.[0]?.[0]?.transcript || '';
        if (transcript && chatInput) {
          chatInput.value = (chatInput.value ? chatInput.value + ' ' : '') + transcript;
          adjustChatInputHeight();
          chatInput.focus();
        }
      };
      recognition.onerror = (e: any) => {
        console.warn('[stt] error:', e);
        sttBtn.classList.remove('recording');
        isRecording = false;
      };
      recognition.onend = () => {
        isRecording = false;
        sttBtn.classList.remove('recording');
      };

      sttBtn.addEventListener('click', () => {
        if (!isRecording) {
          try { recognition.start(); } catch {}
        } else {
          try { recognition.stop(); } catch {}
        }
      });
    } else {
      sttBtn.title = 'SpeechRecognition not supported in this browser';
    }
  }

  // Toggle Raw AI Output across all Chat Bubbles
  const btnToggleRawChat = document.getElementById('btn-toggle-raw-chat');
  let isRawChatVisible = localStorage.getItem('show_raw_in_chat') === 'true';
  if (btnToggleRawChat && isRawChatVisible) {
    btnToggleRawChat.classList.add('active');
  }

  btnToggleRawChat?.addEventListener('click', () => {
    isRawChatVisible = !isRawChatVisible;
    localStorage.setItem('show_raw_in_chat', String(isRawChatVisible));
    if (isRawChatVisible) {
      btnToggleRawChat.classList.add('active');
      showToast('Raw AI Output enabled in chat');
    } else {
      btnToggleRawChat.classList.remove('active');
      showToast('Raw AI Output hidden in chat');
    }

    document.querySelectorAll<HTMLDetailsElement>('.msg-debug-details').forEach((el) => {
      el.style.display = isRawChatVisible || debugManager.isDebugMode ? 'block' : 'none';
      el.open = isRawChatVisible;
    });

    document.querySelectorAll<HTMLButtonElement>('.tag-pill.raw-btn').forEach((btn) => {
      if (isRawChatVisible) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  });

  btnClearChat?.addEventListener('click', async () => {
    if (!activeConversationId) return;
    if (confirm('Clear chat history?')) {
      await fetch(`/api/conversations/${activeConversationId}/messages`, { method: 'DELETE' });
      chatMessagesEl.innerHTML = '';
      resetChatDateTracker();
      showToast('Chat history cleared');
    }
  });

  // Dock Buttons (Joy, Smile, Sad, Anger, Speak)
  const dock = document.getElementById('motion-dock');
  if (dock) {
    dock.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const exp = target.getAttribute('data-expression');
      const action = target.getAttribute('data-action');
      if (exp) {
        onEmotion(exp);
        showToast(`Expression: ${exp}`);
      } else if (action === 'speak-test') {
        const url = getVoiceUrl();
        lipSync.play(url).catch((err) => showToast(`Audio error: ${err.message}`));
      }
    });
  }

  // --- SEPARATE TAB NAVIGATION ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const content = document.getElementById(targetTab || '');
      if (content) content.classList.add('active');
    });
  });

  // Temperature display
  settingTemperature?.addEventListener('input', () => {
    if (tempDisplay) tempDisplay.textContent = settingTemperature.value;
  });

  // Auto-hide Custom Base URL if AI Provider is NOT OpenAI compatible
  const updateBaseUrlVisibility = () => {
    if (groupBaseUrl) {
      const isCustomEndpoint = settingProvider.value === 'openai';
      groupBaseUrl.style.display = isCustomEndpoint ? 'block' : 'none';
    }
  };
  settingProvider?.addEventListener('change', updateBaseUrlVisibility);

  // --- FETCH MODELS FROM API ---
  btnFetchModels?.addEventListener('click', async () => {
    btnFetchModels.disabled = true;
    btnFetchModels.textContent = '⏳ Fetching...';
    if (modelFetchStatus) {
      modelFetchStatus.style.display = 'block';
      modelFetchStatus.style.background = 'rgba(99, 102, 241, 0.15)';
      modelFetchStatus.style.border = '1px solid rgba(99, 102, 241, 0.3)';
      modelFetchStatus.style.color = '#c7d2fe';
      modelFetchStatus.textContent = `Connecting to ${settingProvider.value} to discover available models...`;
    }

    try {
      const res = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settingProvider.value,
          baseUrl: settingBaseUrl.value,
          apiKey: settingApiKey.value
        })
      });

      const data = await res.json();
      if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
        settingModelSelect.innerHTML = '<option value="">-- Choose Fetched Model --</option>';

        const combos: string[] = Array.isArray(data.combos) ? data.combos : [];
        if (combos.length > 0) {
          const comboGroup = document.createElement('optgroup');
          comboGroup.label = '✨ Custom Combos (9Router Fallback Sequences)';
          for (const c of combos) {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = `🌟 ${c} (Combo)`;
            if (settingModel.value === c) opt.selected = true;
            comboGroup.appendChild(opt);
          }
          settingModelSelect.appendChild(comboGroup);
        }

        const modelGroup = document.createElement('optgroup');
        modelGroup.label = combos.length > 0 ? '🌐 Upstream Provider Models' : 'Available Models';
        for (const m of data.models) {
          if (combos.includes(m)) continue;
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          if (settingModel.value === m) opt.selected = true;
          modelGroup.appendChild(opt);
        }
        settingModelSelect.appendChild(modelGroup);
        settingModelSelect.style.display = 'block';

        if (modelFetchStatus) {
          modelFetchStatus.style.background = 'rgba(16, 185, 129, 0.15)';
          modelFetchStatus.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          modelFetchStatus.style.color = '#6ee7b7';
          const comboNotice = combos.length > 0 ? ` (including <strong>${combos.length} combo(s)</strong> pinned at top)` : '';
          modelFetchStatus.innerHTML = `✓ <strong>Discovered ${data.models.length} model(s)</strong>${comboNotice}! Pick one below or type manually.`;
        }
        showToast(`Found ${data.models.length} model(s)${combos.length ? ` (${combos.length} combo)` : ''}!`);
        debugManager.log('AI', `Fetched ${data.models.length} models for ${settingProvider.value}`, { combos, total: data.models.length });
      } else {
        const errMsg = data.error || 'Endpoint returned no models or invalid response format.';
        if (modelFetchStatus) {
          modelFetchStatus.style.background = 'rgba(248, 81, 73, 0.15)';
          modelFetchStatus.style.border = '1px solid rgba(248, 81, 73, 0.45)';
          modelFetchStatus.style.color = '#ffc0b8';
          modelFetchStatus.innerHTML = `⚠️ <strong>Fetch Failed:</strong> ${escapeHtml(errMsg)}<br><span style="font-size:11.5px; color:#d2a8ff;">Check your API key/endpoint, or type the model name manually.</span>`;
        }
        showTopNotice('warn', 'Model Fetch Incomplete', errMsg);
        debugManager.log('AI', 'Model Fetch Failed', data, undefined, 'warn');
      }
    } catch (e: any) {
      if (modelFetchStatus) {
        modelFetchStatus.style.background = 'rgba(248, 81, 73, 0.15)';
        modelFetchStatus.style.border = '1px solid rgba(248, 81, 73, 0.45)';
        modelFetchStatus.style.color = '#ffc0b8';
        modelFetchStatus.textContent = `Network Error: ${e.message}`;
      }
      showTopNotice('error', 'Model Fetch Error', e.message);
    } finally {
      btnFetchModels.disabled = false;
      btnFetchModels.textContent = '🔄 Fetch Models';
    }
  });

  // --- DIRECT AI CONNECTION TEST (PING) ---
  btnTestAiConnection?.addEventListener('click', async () => {
    btnTestAiConnection.disabled = true;
    btnTestAiConnection.textContent = '⚡ Testing...';
    if (modelFetchStatus) {
      modelFetchStatus.style.display = 'block';
      modelFetchStatus.style.background = 'rgba(99, 102, 241, 0.15)';
      modelFetchStatus.style.border = '1px solid rgba(99, 102, 241, 0.3)';
      modelFetchStatus.style.color = '#c7d2fe';
      modelFetchStatus.textContent = `Sending test ping to ${settingProvider.value}...`;
    }

    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settingProvider.value,
          baseUrl: settingBaseUrl.value,
          apiKey: settingApiKey.value,
          model: settingModel.value
        })
      });

      const data = await res.json();
      if (data.ok) {
        if (modelFetchStatus) {
          modelFetchStatus.style.background = 'rgba(16, 185, 129, 0.15)';
          modelFetchStatus.style.border = '1px solid rgba(16, 185, 129, 0.4)';
          modelFetchStatus.style.color = '#6ee7b7';
          modelFetchStatus.innerHTML = `✓ <strong>Connected!</strong> Latency: <strong>${data.latency_ms}ms</strong> | Provider: <code>${data.provider}</code> | Model: <code>${data.model}</code><br><span style="font-size:11.5px; opacity:0.88;">Sample Reply: "${escapeHtml(data.preview)}"</span>`;
        }
        showTopNotice('success', 'AI Ping Succeeded', `Connected to ${data.provider} (${data.latency_ms}ms)`);
        debugManager.log('AI', `AI Ping Success (${data.latency_ms}ms)`, data);
      } else {
        const classified = data.classified || {};
        const title = classified.title || 'AI Connection Failed';
        const msg = classified.message || data.error || 'Connection check failed';
        if (modelFetchStatus) {
          modelFetchStatus.style.background = 'rgba(248, 81, 73, 0.15)';
          modelFetchStatus.style.border = '1px solid rgba(248, 81, 73, 0.45)';
          modelFetchStatus.style.color = '#ffc0b8';
          modelFetchStatus.innerHTML = `⚠️ <strong>${escapeHtml(title)}</strong> [${escapeHtml(classified.code || 'ERR')}]: ${escapeHtml(msg)}<br>${classified.hint ? `<span style="font-size:11.5px; color:#d2a8ff;">💡 Hint: ${escapeHtml(classified.hint)}</span>` : ''}`;
        }
        showTopNotice('error', title, msg, { hint: classified.hint });
        debugManager.log('AI', title, data, undefined, 'error');
      }
    } catch (e: any) {
      if (modelFetchStatus) {
        modelFetchStatus.style.background = 'rgba(248, 81, 73, 0.15)';
        modelFetchStatus.style.border = '1px solid rgba(248, 81, 73, 0.45)';
        modelFetchStatus.style.color = '#ffc0b8';
        modelFetchStatus.textContent = `Network Error: ${e.message}`;
      }
      showTopNotice('error', 'Ping Network Error', e.message);
    } finally {
      btnTestAiConnection.disabled = false;
      btnTestAiConnection.textContent = '⚡ Test Ping';
    }
  });

  settingModelSelect?.addEventListener('change', () => {
    if (settingModelSelect.value) {
      settingModel.value = settingModelSelect.value;
    }
  });

  // --- CUSTOM VOICE SAMPLE UPLOAD ---
  voiceUploadZone?.addEventListener('click', () => voiceFileInput?.click());

  voiceUploadZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    voiceUploadZone.style.borderColor = 'var(--primary)';
  });

  voiceUploadZone?.addEventListener('dragleave', () => {
    voiceUploadZone.style.borderColor = 'var(--border-active)';
  });

  voiceUploadZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    voiceUploadZone.style.borderColor = 'var(--border-active)';
    if (e.dataTransfer?.files.length) {
      handleVoiceUpload(e.dataTransfer.files[0]);
    }
  });

  voiceFileInput?.addEventListener('change', () => {
    if (voiceFileInput.files?.length) {
      handleVoiceUpload(voiceFileInput.files[0]);
    }
  });

  const handleVoiceUpload = (file: File) => {
    if (!file.name.match(/\.(wav|mp3|ogg|flac|m4a)$/i)) {
      showToast('Please upload an audio file (.wav, .mp3, etc.)');
      return;
    }

    if (uploadStatusText) uploadStatusText.textContent = `Uploading ${file.name}...`;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      try {
        const res = await fetch('/api/voice/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId: selectCharacter?.value || getCurChar().id,
            filename: file.name,
            base64Data
          })
        });

        const data = await res.json();
        if (data.ok) {
          if (uploadStatusText) uploadStatusText.textContent = `✓ Uploaded: ${file.name}`;
          if (activeVoicePreview) activeVoicePreview.style.display = 'block';
          if (activeVoiceName) activeVoiceName.textContent = file.name;
          showToast(`Custom voice sample set: ${file.name}`);
        } else {
          if (uploadStatusText) uploadStatusText.textContent = `Upload failed: ${data.error}`;
        }
      } catch (err: any) {
        if (uploadStatusText) uploadStatusText.textContent = `Upload error: ${err.message}`;
      }
    };
    reader.readAsDataURL(file);
  };

  // Settings Modal Handlers
  const updateSongCountBadge = (count: number) => {
    if (settingSongCount) {
      settingSongCount.textContent = `${count} song${count === 1 ? '' : 's'}`;
    }
  };

  settingCharSongs?.addEventListener('input', () => {
    const list = settingCharSongs.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    updateSongCountBadge(list.length);
  });

  const openSettings = async () => {
    const cur = getCurChar();

    if (settingsActiveCharacterPill) {
      settingsActiveCharacterPill.textContent = cur.displayName || cur.name;
    }

    try {
      const res = await fetch('/api/settings');
      const s = res.ok ? await res.json() : {};

      // 1. Fetch character-specific row from /api/characters/:id
      let c: any = null;
      try {
        const charRes = await fetch(`/api/characters/${encodeURIComponent(cur.id)}`);
        if (charRes.ok) c = await charRes.json();
      } catch {}

      // AI Brain tab (per-character preference with global fallback)
      if (settingProvider) settingProvider.value = c?.ai_provider || s.ai_provider || 'openai';
      if (settingBaseUrl) settingBaseUrl.value = c?.custom_base_url || s.openai_base_url || '';
      if (settingApiKey) settingApiKey.value = s[`${(c?.ai_provider || s.ai_provider || 'openai').toLowerCase()}_api_key`] || s.openai_api_key || '';
      if (settingModel) settingModel.value = c?.ai_model || s.openai_model || '';
      if (settingTemperature) {
        const temp = c?.temperature !== undefined ? c.temperature : (s.temperature || 0.75);
        settingTemperature.value = String(temp);
        if (tempDisplay) tempDisplay.textContent = String(temp);
      }
      updateBaseUrlVisibility();
      if (modelFetchStatus) modelFetchStatus.style.display = 'none';

      // Voice & TTS tab (per-character preference with global fallback)
      if (settingTtsMaster) {
        settingTtsMaster.checked = s.tts_master_enabled !== 'false';
      }
      if (settingTtsEngine) settingTtsEngine.value = c?.tts_engine || s.tts_engine || 'omnivoice';
      if (settingOmniVoiceUrl) settingOmniVoiceUrl.value = s.omnivoice_api_url || 'http://localhost:9192';
      if (settingTtsFallback) {
        settingTtsFallback.checked = s.tts_allow_fallback !== 'false';
      }
      if (settingEdgeVoice) settingEdgeVoice.value = c?.tts_voice || s.edge_voice || 'ja-JP-NanamiNeural';

      const customVoiceRef = c?.tts_voice_ref || s.custom_voice_name || '';
      if (activeVoicePreview && activeVoiceName) {
        if (customVoiceRef) {
          activeVoicePreview.style.display = 'block';
          activeVoiceName.textContent = customVoiceRef;
        } else {
          activeVoicePreview.style.display = 'none';
        }
      }

      // Bot Bridges & Features tabs
      if (settingTelegramEnabled) settingTelegramEnabled.checked = s.telegram_bot_enabled === 'true';
      if (settingTelegramToken && s.telegram_bot_token) settingTelegramToken.value = s.telegram_bot_token;
      if (settingTelegramAllowed && s.telegram_allowed_id) settingTelegramAllowed.value = s.telegram_allowed_id;

      if (settingDiscordEnabled) settingDiscordEnabled.checked = s.discord_bot_enabled === 'true';
      if (settingDiscordToken && s.discord_bot_token) settingDiscordToken.value = s.discord_bot_token;
      if (settingDiscordChannel && s.discord_channel_id) settingDiscordChannel.value = s.discord_channel_id;
      if (settingDiscordAllowed && s.discord_allowed_id) settingDiscordAllowed.value = s.discord_allowed_id;

      if (settingTimezoneEnabled) settingTimezoneEnabled.checked = s.timezone_enabled !== 'false';
      if (settingTouchEnabled) settingTouchEnabled.checked = s.touch_enabled !== 'false';
      if (settingMoodEnabled) {
        settingMoodEnabled.checked = s.mood_enabled !== 'false';
      }
      if (settingIdleTalkEnabled) settingIdleTalkEnabled.checked = s.idle_talk_enabled === 'true';
      if (settingSleepCycleEnabled) settingSleepCycleEnabled.checked = s.sleep_cycle_enabled === 'true';
      if (settingWeatherEnabled) settingWeatherEnabled.checked = s.weather_enabled === 'true';
      if (settingWeatherCity && s.weather_city) settingWeatherCity.value = s.weather_city;
      if (weatherTestStatus) weatherTestStatus.style.display = 'none';
      if (settingLlmFallback1 && s.llm_fallback_1) settingLlmFallback1.value = s.llm_fallback_1;
      if (settingLlmFallback2 && s.llm_fallback_2) settingLlmFallback2.value = s.llm_fallback_2;
      if (settingSttEnabled) {
        settingSttEnabled.checked = s.stt_enabled === 'true';
        if (sttBtn) sttBtn.style.display = settingSttEnabled.checked ? 'flex' : 'none';
      }
      if (settingFreshrssEnabled) settingFreshrssEnabled.checked = s.freshrss_enabled === 'true';
      if (settingFreshrssUrl && s.freshrss_url) settingFreshrssUrl.value = s.freshrss_url;
      if (settingFreshrssUser) settingFreshrssUser.value = s.freshrss_user || '';
      if (settingFreshrssPassword) settingFreshrssPassword.value = s.freshrss_password || s.freshrss_api_password || '';
      if (settingNotionEnabled) settingNotionEnabled.checked = s.notion_enabled === 'true';
      if (settingNotionApiKey && s.notion_api_key) settingNotionApiKey.value = s.notion_api_key;
      if (settingNotionDatabaseId) settingNotionDatabaseId.value = s.notion_database_id || '';
      if (settingCalendarEnabled) settingCalendarEnabled.checked = s.calendar_enabled === 'true';
      if (settingCalendarIcsUrl) settingCalendarIcsUrl.value = s.calendar_ics_url || '';
      if (settingGoogleEnabled) settingGoogleEnabled.checked = s.google_enabled === 'true';
      if (settingNextcloudEnabled) settingNextcloudEnabled.checked = s.nextcloud_enabled === 'true';

      if (settingDebugMode) {
        settingDebugMode.checked = debugManager.isDebugMode;
      }

      // Profile Tab fields (loaded from active companion row)
      if (c) {
        if (settingCharName) settingCharName.value = c.display_name || c.name || '';
        if (settingMusicArtist) settingMusicArtist.value = c.display_name || c.name || '';
        if (settingCharNicknames) settingCharNicknames.value = Array.isArray(c.nicknames) ? c.nicknames.join(', ') : '';
        if (settingCharTags) settingCharTags.value = Array.isArray(c.tags) ? c.tags.join(', ') : '';
        if (settingOwnerName) settingOwnerName.value = c.owner?.name || s.owner_name || 'User';
        if (settingOwnerPronoun) settingOwnerPronoun.value = c.owner?.pronoun || s.owner_pronoun || 'they';
        if (settingTimezone) settingTimezone.value = c.timezone || s.timezone || '';
        if (settingTzLabel) settingTzLabel.value = c.tz_label || s.tz_label || '';
        if (settingCharLanguage) settingCharLanguage.value = c.language || 'en';
        if (settingCharCountry) settingCharCountry.value = c.country || '';
        if (settingCharDescription) settingCharDescription.value = c.description || '';
        if (settingPersonality) settingPersonality.value = c.personality || s.personality || '';
        if (settingCharScenario) settingCharScenario.value = c.scenario || '';
        if (settingCharFirstMessage) settingCharFirstMessage.value = c.first_message || '';
        if (settingCharExamples) settingCharExamples.value = Array.isArray(c.example_messages) && c.example_messages.length ? JSON.stringify(c.example_messages, null, 2) : '';
        if (settingCharFeedKeywords) settingCharFeedKeywords.value = Array.isArray(c.feed_keywords) ? c.feed_keywords.join(', ') : '';
        if (settingCharSongs) settingCharSongs.value = Array.isArray(c.songs) ? c.songs.join(', ') : '';
        updateSongCountBadge(Array.isArray(c.songs) ? c.songs.length : 0);
        if (settingCharSongAliases) settingCharSongAliases.value = c.song_aliases && Object.keys(c.song_aliases).length ? JSON.stringify(c.song_aliases) : '';
        if (settingCharSystemPrompt) settingCharSystemPrompt.value = c.system_prompt || '';
      }

      // Fetch live mood score for the active companion
      try {
        const moodRes = await fetch(`/api/characters/${encodeURIComponent(cur.id)}/mood`);
        if (moodRes.ok) {
          const m = await moodRes.json();
          updateMoodBadge(m.score, m.bracket);
        }
      } catch {}
    } catch (err: any) {
      console.warn('[settings] Failed to load settings:', err);
    }

    if (settingZoomSlider && getModel()) {
      settingZoomSlider.value = getModel().zoom.toFixed(2);
    }
    settingsModal.classList.add('active');
  };
  (window as any).__openSettings = openSettings;

  btnOpenSettings?.addEventListener('click', openSettings);
  btnCloseSettings?.addEventListener('click', () => settingsModal.classList.remove('active'));
  btnCancelSettings?.addEventListener('click', () => settingsModal.classList.remove('active'));

  // Wire Mood Card Actions in Settings
  document.getElementById('btn-mood-cheer')?.addEventListener('click', async () => {
    const cur = getCurChar();
    try {
      const res = await fetch('/api/interactions/touch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: cur.id, area: 'head' })
      });
      const data = await res.json();
      if (data?.bracket && data?.score !== undefined) {
        updateMoodBadge(data.score, data.bracket);
        showToast(`Cheered companion! Affection: ${data.score}`);
      }
    } catch {}
  });

  document.getElementById('btn-reset-mood')?.addEventListener('click', async () => {
    const cur = getCurChar();
    try {
      const res = await fetch(`/api/characters/${encodeURIComponent(cur.id)}/mood`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: 70 })
      });
      const data = await res.json();
      if (data?.bracket && data?.score !== undefined) {
        updateMoodBadge(data.score, data.bracket);
        showToast('Mood score reset to Cheerful (70)');
      }
    } catch {}
  });

  // Auto-Fetch Songs from Music Database
  btnFetchSongs?.addEventListener('click', async () => {
    const cur = getCurChar();
    const query = settingMusicArtist?.value.trim() || cur.displayName || cur.name;
    if (!query) {
      showToast('Please enter an artist name to search');
      return;
    }

    btnFetchSongs.disabled = true;
    btnFetchSongs.textContent = '⏳ Fetching...';
    showToast(`Searching music database for "${query}"...`);

    try {
      const res = await fetch(`/api/characters/${encodeURIComponent(cur.id)}/sync-songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistQuery: query, append: true })
      });

      const data = await res.json();
      if (data.ok && Array.isArray(data.songs)) {
        settingCharSongs.value = data.songs.join(', ');
        updateSongCountBadge(data.songs.length);
        showToast(`✓ Synced ${data.totalCount} songs (${data.addedCount} newly added) for ${query}!`, 3500);
      } else {
        showToast(data.error || 'No songs found in music database');
      }
    } catch (e: any) {
      showToast(`Music fetch failed: ${e.message}`);
    } finally {
      btnFetchSongs.disabled = false;
      btnFetchSongs.textContent = '🎵 Auto-Fetch Songs';
    }
  });

  // Weather Connection Test
  btnTestWeather?.addEventListener('click', async () => {
    const city = (settingWeatherCity?.value || '').trim();
    if (!city) {
      if (weatherTestStatus) {
        weatherTestStatus.style.display = 'block';
        weatherTestStatus.style.color = '#ef4444';
        weatherTestStatus.textContent = '⚠️ Please enter a city name first.';
      }
      return;
    }

    btnTestWeather.disabled = true;
    btnTestWeather.textContent = '⏳ Testing...';
    if (weatherTestStatus) {
      weatherTestStatus.style.display = 'block';
      weatherTestStatus.style.color = '#94a3b8';
      weatherTestStatus.textContent = `Resolving coordinates for "${city}"...`;
    }

    try {
      const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
      const json = await res.json();
      const weather = json.data || json;
      if (res.ok && weather && weather.current) {
        weatherTestStatus.style.color = '#10b981';
        weatherTestStatus.innerHTML = `✅ <strong>${escapeHtml(weather.location)}</strong>: ${escapeHtml(weather.current.description)}, ${weather.current.temperature}°C (Feels like ${weather.current.feels_like}°C, Humidity ${weather.current.humidity}%)`;
        showToast(`🌤️ Weather connected for ${weather.location}!`, 3000);
      } else {
        weatherTestStatus.style.color = '#ef4444';
        weatherTestStatus.textContent = `❌ ${json.error || 'Could not find weather data for this location.'}`;
      }
    } catch (e: any) {
      weatherTestStatus.style.color = '#ef4444';
      weatherTestStatus.textContent = `❌ Network error: ${e.message}`;
    } finally {
      btnTestWeather.disabled = false;
      btnTestWeather.textContent = '🌤️ Test';
    }
  });

  btnSaveSettings?.addEventListener('click', async () => {
    const cur = getCurChar();

    if (settingDebugMode) {
      debugManager.setDebugMode(settingDebugMode.checked);
    }

    const payload = {
      ai_provider: settingProvider.value,
      openai_base_url: settingBaseUrl.value,
      openai_api_key: settingApiKey.value,
      openai_model: settingModel.value,
      temperature: settingTemperature.value,

      tts_master_enabled: String(settingTtsMaster.checked),
      tts_engine: settingTtsEngine.value,
      omnivoice_api_url: settingOmniVoiceUrl.value,
      tts_allow_fallback: String(settingTtsFallback.checked),
      edge_voice: settingEdgeVoice.value,

      telegram_bot_enabled: String(settingTelegramEnabled.checked),
      telegram_bot_token: settingTelegramToken.value,
      telegram_allowed_id: settingTelegramAllowed.value,

      discord_bot_enabled: String(settingDiscordEnabled.checked),
      discord_bot_token: settingDiscordToken.value,
      discord_channel_id: settingDiscordChannel.value,
      discord_allowed_id: settingDiscordAllowed.value,

      owner_name: settingOwnerName?.value || 'User',
      owner_pronoun: settingOwnerPronoun?.value || 'they',
      timezone: settingTimezone?.value || '',
      tz_label: settingTzLabel?.value || '',
      personality: settingPersonality?.value || '',
      timezone_enabled: String(settingTimezoneEnabled?.checked ?? true),
      touch_enabled: String(settingTouchEnabled?.checked ?? true),
      mood_enabled: String(settingMoodEnabled?.checked ?? true),
      idle_talk_enabled: String(settingIdleTalkEnabled?.checked ?? false),
      sleep_cycle_enabled: String(settingSleepCycleEnabled?.checked ?? false),
      weather_enabled: String(settingWeatherEnabled?.checked ?? false),
      weather_city: settingWeatherCity?.value || '',
      llm_fallback_1: settingLlmFallback1?.value || '',
      llm_fallback_2: settingLlmFallback2?.value || '',
      stt_enabled: String(settingSttEnabled?.checked ?? false),
      freshrss_enabled: String(settingFreshrssEnabled?.checked ?? false),
      freshrss_url: settingFreshrssUrl?.value || '',
      freshrss_user: settingFreshrssUser?.value || '',
      freshrss_password: settingFreshrssPassword?.value || '',
      freshrss_api_password: settingFreshrssPassword?.value || '',
      notion_enabled: String(settingNotionEnabled?.checked ?? false),
      notion_api_key: settingNotionApiKey?.value || '',
      notion_database_id: settingNotionDatabaseId?.value || '',
      calendar_enabled: String(settingCalendarEnabled?.checked ?? false),
      calendar_ics_url: settingCalendarIcsUrl?.value || '',
      google_enabled: String(settingGoogleEnabled?.checked ?? false),
      nextcloud_enabled: String(settingNextcloudEnabled?.checked ?? false)
    };

    if (sttBtn) {
      sttBtn.style.display = settingSttEnabled?.checked ? 'flex' : 'none';
    }

    // Helper to safely parse JSON or return default fallback string
    const safeJsonString = (val: string | undefined, fallback: string) => {
      if (!val || !val.trim()) return fallback;
      try {
        return JSON.stringify(JSON.parse(val.trim()));
      } catch {
        return fallback;
      }
    };

    // Parse songs list cleanly from comma-separated or newline-separated input
    const parsedSongs = (settingCharSongs?.value || '')
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    // Save Character-specific Profile and AI/TTS preferences
    const charUpdatePayload = {
      display_name: settingCharName?.value.trim() || cur.name,
      nicknames_json: JSON.stringify(
        (settingCharNicknames?.value || '').split(',').map((s) => s.trim()).filter(Boolean)
      ),
      tags_json: JSON.stringify(
        (settingCharTags?.value || '').split(',').map((s) => s.trim()).filter(Boolean)
      ),
      owner_json: JSON.stringify({
        name: settingOwnerName?.value.trim() || 'User',
        pronoun: settingOwnerPronoun?.value.trim() || 'they'
      }),
      timezone: settingTimezone?.value.trim() || '',
      tz_label: settingTzLabel?.value.trim() || '',
      language: settingCharLanguage?.value.trim() || 'en',
      country: settingCharCountry?.value.trim() || '',
      description: settingCharDescription?.value.trim() || '',
      personality: settingPersonality?.value.trim() || '',
      scenario: settingCharScenario?.value.trim() || '',
      first_message: settingCharFirstMessage?.value.trim() || '',
      example_messages_json: safeJsonString(settingCharExamples?.value, '[]'),
      feed_keywords_json: JSON.stringify(
        (settingCharFeedKeywords?.value || '').split(',').map((s) => s.trim()).filter(Boolean)
      ),
      songs_json: JSON.stringify(parsedSongs),
      song_aliases_json: safeJsonString(settingCharSongAliases?.value, '{}'),
      system_prompt: settingCharSystemPrompt?.value.trim() || '',
      // Character-specific AI & Voice preferences
      ai_provider: settingProvider.value,
      ai_model: settingModel.value,
      custom_base_url: settingBaseUrl.value,
      temperature: parseFloat(settingTemperature.value) || 0.75,
      tts_engine: settingTtsEngine.value,
      tts_voice: settingEdgeVoice.value
    };

    try {
      const charRes = await fetch(`/api/characters/${encodeURIComponent(cur.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(charUpdatePayload)
      });
      if (!charRes.ok) {
        const errJson = await charRes.json().catch(() => ({}));
        throw new Error(errJson.error || `Character save failed with HTTP ${charRes.status}`);
      }

      cur.displayName = charUpdatePayload.display_name;
      cur.name = charUpdatePayload.display_name;
      (cur as any).ai_provider = charUpdatePayload.ai_provider;
      (cur as any).ai_model = charUpdatePayload.ai_model;
      (cur as any).custom_base_url = charUpdatePayload.custom_base_url;
      (cur as any).temperature = charUpdatePayload.temperature;
      (cur as any).tts_engine = charUpdatePayload.tts_engine;
      (cur as any).tts_voice = charUpdatePayload.tts_voice;
      updateCompanionHeader(cur, getCurrentCostume());
      populateCharacterSelector(characters, cur.id);

      const settingsRes = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!settingsRes.ok) {
        const errJson = await settingsRes.json().catch(() => ({}));
        throw new Error(errJson.error || `Global settings save failed with HTTP ${settingsRes.status}`);
      }

      settingsModal.classList.remove('active');
      showToast(`Settings saved for ${cur.displayName || cur.name}`);
      showTopNotice('success', 'Settings Saved', `Successfully updated preferences for ${cur.displayName || cur.name}`, { duration: 3500 });
      debugManager.log('SYSTEM', `Settings saved for ${cur.displayName || cur.name}`);
    } catch (e: any) {
      showTopNotice('error', 'Settings Save Failed', e.message);
      debugManager.log('SYSTEM', 'Settings Save Failed', { error: e.message }, undefined, 'error');
    }
  });
}

// WebSocket Event Relay
function setupWebSocket(
  stage: () => CompanionModel,
  lipSync: LipSync,
  switchCostume: (id: string) => Promise<void>,
  triggerEmotion: (emotion: string) => void,
  getCharacters: () => Character[],
  getCurrentCharacter: () => Character
) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  let ws: WebSocket;
  const connect = () => {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[ws] Connected to companion server');
      debugManager.log('WS', 'Connected to companion server');
      showToast('Live link connected', 1500);
    };

    ws.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg.type === 'debug_log' && msg.log) {
        debugManager.log(msg.log.category, msg.log.title, msg.log.data, msg.log.timestamp, msg.log.level);
      } else if (msg.type !== 'stream_token') {
        debugManager.log('WS', `Event: ${msg.type}`, msg);
      }

      switch (msg.type) {
        case 'system_notice':
          if (msg.level === 'error') {
            showTopNotice('error', msg.title || 'System Error', msg.message || 'An error occurred', {
              hint: msg.hint,
              actionLabel: 'View Debug',
              onAction: () => {
                debugManager.open();
                document.querySelector<HTMLButtonElement>('[data-dbg-tab="dbg-tab-logs"]')?.click();
              }
            });
          } else if (msg.level === 'warn') {
            showTopNotice('warn', msg.title || 'System Notice', msg.message || 'Warning notice', {
              hint: msg.hint,
              actionLabel: 'View Debug',
              onAction: () => {
                debugManager.open();
                document.querySelector<HTMLButtonElement>('[data-dbg-tab="dbg-tab-logs"]')?.click();
              }
            });
          } else {
            showTopNotice('info', msg.title || 'System Notice', msg.message || 'Information');
          }
          break;

        case 'chat_audio':
          if (msg.emotion) triggerEmotion(msg.emotion);
          if (msg.audio_url) lipSync.play(msg.audio_url).catch(console.error);
          break;

        case 'chat':
          if (msg.emotion) triggerEmotion(msg.emotion);
          if (msg.motion) void stage().playMotion(msg.motion);
          if (msg.audio_url) lipSync.play(msg.audio_url).catch(console.error);

          if (msg.message_id) {
            // Check if already rendered or if active pending stream belongs to this
            if (renderedMessageIds.has(msg.message_id) || chatMessagesEl?.querySelector(`[data-message-id="${msg.message_id}"]`)) {
              break;
            }
            const pendingEl = chatMessagesEl?.querySelector('.msg-row.assistant.is-pending') as HTMLElement | null;
            if (pendingEl) {
              pendingEl.setAttribute('data-message-id', msg.message_id);
              pendingEl.classList.remove('is-pending');
              renderedMessageIds.add(msg.message_id);
              break;
            }
          }

          if (msg.reply) {
            appendMessageBubble(
              'assistant',
              msg.reply,
              msg.emotion,
              msg.motion,
              msg.audio_url,
              msg.thought,
              msg.costume,
              msg.raw_content,
              msg.music_track,
              msg.cards,
              msg.created_at,
              msg.message_id
            );
          }
          break;

        case 'chat_music':
          // If there is an active pending stream in this tab, skip to avoid race condition with SSE
          if (chatMessagesEl?.querySelector('.msg-row.assistant.is-pending')) {
            break;
          }
          if (msg.track) {
            const bubbles = chatMessagesEl.querySelectorAll('.msg-row.assistant .msg-bubble');
            const latestBubble = bubbles[bubbles.length - 1] as HTMLElement;
            if (latestBubble) {
              renderMusicCard(latestBubble, msg.track);
              chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
            }
          }
          break;

        case 'chat_card':
          // If there is an active pending stream in this tab, skip to avoid race condition with SSE
          if (chatMessagesEl?.querySelector('.msg-row.assistant.is-pending')) {
            break;
          }
          if (msg.cardType && msg.data) {
            const bubbles = chatMessagesEl.querySelectorAll('.msg-row.assistant .msg-bubble');
            const latestBubble = bubbles[bubbles.length - 1] as HTMLElement;
            if (latestBubble) {
              renderRichCard(latestBubble, msg.cardType, msg.data);
              chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
            }
          }
          break;

        case 'mood_update':
          if (msg.score !== undefined) {
            updateMoodBadge(msg.score, { emoji: msg.emoji, label: msg.label });
          }
          break;

        case 'sleep_status':
          if (companionSleepBadge) {
            companionSleepBadge.style.display = (msg.asleep && settingSleepCycleEnabled?.checked) ? 'inline-flex' : 'none';
          }
          break;

        case 'audio_continue':
          if (msg.audio_url) lipSync.enqueue(msg.audio_url);
          break;

        case 'chat_emotion':
          if (msg.emotion) triggerEmotion(msg.emotion);
          break;

        case 'chat_expression':
          if (msg.expression && stage().expressions.has(msg.expression)) {
            stage().setExpression(msg.expression);
          }
          break;

        case 'chat_motion':
          if (msg.motion) void stage().playMotion(msg.motion);
          break;

        case 'change_costume':
          if (msg.costume_id) {
            const curChar = getCurrentCharacter();
            if (msg.character_id && msg.character_id !== curChar.id) {
              const targetChar = getCharacters().find((c) => c.id === msg.character_id);
              if (targetChar) {
                targetChar.activeCostumeId = msg.costume_id;
                localStorage.setItem(`costume_${targetChar.id}`, msg.costume_id);
              }
            } else {
              void switchCostume(msg.costume_id);
            }
          }
          break;

        case 'costume_renamed':
          if (msg.costume_id && msg.name) {
            const cur = getCurrentCharacter();
            const targetChar = getCharacters().find((c) => c.id === msg.character_id) || cur;
            const cs = targetChar.costumes.find(
              (c) => c.id === msg.costume_id || (c as any).costume_slug === msg.costume_id
            );
            if (cs) cs.name = msg.name;
            if (targetChar.id === cur.id) {
              populateCostumeSelector(targetChar.costumes, cs?.id || msg.costume_id);
              if (companionCostumeEl && cs) companionCostumeEl.textContent = cs.name;
            }
            showToast(`Outfit renamed: ${msg.name}`);
          }
          break;

        case 'character_renamed':
          if (msg.display_name) {
            showToast(`Companion renamed: ${msg.display_name}`);
          }
          break;
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected. Retrying in 3s...');
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  };

  connect();
}

main().catch((err) => {
  console.error('[fatal main]', err);
  showToast(String(err));
});
