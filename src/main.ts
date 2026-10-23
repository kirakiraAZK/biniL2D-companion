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

// DOM Elements
const canvas = document.getElementById('view') as HTMLCanvasElement;
const canvasWrapper = document.getElementById('stage-canvas-wrapper') as HTMLDivElement;
const statusToast = document.getElementById('status-toast') as HTMLDivElement;
const companionNameEl = document.getElementById('companion-name') as HTMLElement;
const companionCostumeEl = document.getElementById('companion-costume-label') as HTMLElement;
const companionInitialEl = document.getElementById('companion-initial') as HTMLElement;
const selectCharacter = document.getElementById('select-character') as HTMLSelectElement;
const selectCostume = document.getElementById('select-costume') as HTMLSelectElement;
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
const settingApiKey = document.getElementById('setting-api-key') as HTMLInputElement;
const settingModel = document.getElementById('setting-model') as HTMLInputElement;
const settingModelSelect = document.getElementById('setting-model-select') as HTMLSelectElement;
const btnFetchModels = document.getElementById('btn-fetch-models') as HTMLButtonElement;
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

// Toast Helper
function showToast(msg: string, duration = 2800) {
  if (!statusToast) return;
  statusToast.textContent = msg;
  statusToast.style.opacity = '1';
  setTimeout(() => {
    statusToast.style.opacity = '0.4';
  }, duration);
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

  const savedCostumeId = localStorage.getItem('costume');
  let currentCostume = pickCostume(currentCharacter, savedCostumeId ?? undefined);

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
    const next = currentCharacter.costumes.find((c) => c.id === costumeId);
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
      localStorage.setItem('costume', next.id);
      restoreModelTransform(currentCharacter.id, currentCostume.id, fresh);
      model = fresh;
      prev.release();
      enableResize(canvas, model.artAspect);
      updateCompanionHeader(currentCharacter, currentCostume);
      populateCostumeSelector(currentCharacter.costumes, currentCostume.id);
      showToast(`Outfit: ${next.name}`);

      void fetch(`/api/characters/${currentCharacter.id}/costume`, {
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

  // Character Switcher function
  const switchCharacter = async (charId: string): Promise<void> => {
    const nextChar = characters.find((c) => c.id === charId);
    if (!nextChar || nextChar.id === currentCharacter.id) return;

    showToast(`Loading companion ${nextChar.name}...`);
    currentCharacter = nextChar;
    currentCostume = pickCostume(currentCharacter, currentCharacter.activeCostumeId);
    localStorage.setItem('character', nextChar.id);
    localStorage.setItem('costume', currentCostume.id);

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
    currentCharacter,
    switchCharacter,
    switchCostume,
    triggerEmotion,
    lipSync,
    () => voiceUrl,
    () => model,
    () => currentCharacter.id
  );

  // Setup WebSocket Link
  setupWebSocket(stage, lipSync, switchCostume, triggerEmotion);

  // Load chat history
  await loadConversationHistory(currentCharacter.id);
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

  // Drag on Left Click (0), Middle Click (1), or Right Click (2)
  const onMouseDown = (e: MouseEvent) => {
    // If clicking on dock buttons, overlay controls, or inputs, do not drag
    if ((e.target as HTMLElement).closest('.stage-dock, button, select, input')) {
      return;
    }
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;

    e.preventDefault();
    isDragging = true;
    wrapper.classList.add('dragging');
    startX = e.clientX;
    startY = e.clientY;
    const currentModel = getModel();
    initialOffsetX = currentModel.offsetX;
    initialOffsetY = currentModel.offsetY;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
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
      // Auto-save silently for this character & outfit so dragging is never lost
      saveModelTransform(getCharId(), getCostumeId(), getModel(), false);
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

// Conversation History & Chat rendering
let activeConversationId = '';

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
    for (const m of msgs) {
      appendMessageBubble(m.role, m.content, m.emotion, m.motion, m.audio_url);
    }
  } catch (e) {
    console.warn('[history] Failed to load messages:', e);
  }
}

function appendMessageBubble(
  role: 'user' | 'assistant',
  content: string,
  emotion?: string,
  motion?: string,
  audioUrl?: string
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;

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

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = content;

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
  _characters: Character[],
  getCurrentChar: Character,
  onSwitchChar: (id: string) => Promise<void>,
  onSwitchCostume: (id: string) => Promise<void>,
  onEmotion: (e: string) => void,
  lipSync: LipSync,
  getVoiceUrl: () => string,
  getModel: () => CompanionModel,
  _getCharId: () => string
) {
  let currentChar = getCurrentChar;

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
    chatInput.style.height = 'auto';

    appendMessageBubble('user', text);

    // Placeholder assistant bubble with streaming cursor
    const pendingRow = document.createElement('div');
    pendingRow.className = 'msg-row assistant';
    const pendingMeta = document.createElement('div');
    pendingMeta.className = 'msg-meta';
    pendingMeta.innerHTML = '<span>Companion</span><span class="tag-pill">THINKING</span>';
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
          characterId: selectCharacter?.value || currentChar.id,
          message: text,
          conversationId: activeConversationId
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let streamedText = '';
      let receivedAudioUrl = '';

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
                pendingBubble.textContent = streamedText;
                pendingBubble.appendChild(cursor);
                chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
              } else if (data.type === 'audio') {
                receivedAudioUrl = data.audio_url;
              } else if (data.type === 'done') {
                cursor.remove();
                if (data.message?.audio_url) receivedAudioUrl = data.message.audio_url;
                if (data.message?.emotion) {
                  pendingMeta.innerHTML = `<span>Companion</span><span class="tag-pill">${data.message.emotion}</span>`;
                }
              }
            } catch {}
          }
        }
      }

      cursor.remove();
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
      pendingBubble.textContent = `(Error: ${e.message || 'Could not reach server'})`;
    }
  };

  sendBtn?.addEventListener('click', () => void sendMessage());

  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  });

  chatInput?.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
  });

  btnClearChat?.addEventListener('click', async () => {
    if (!activeConversationId) return;
    if (confirm('Clear chat history?')) {
      await fetch(`/api/conversations/${activeConversationId}/messages`, { method: 'DELETE' });
      chatMessagesEl.innerHTML = '';
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

  // --- FETCH MODELS FROM API ---
  btnFetchModels?.addEventListener('click', async () => {
    btnFetchModels.disabled = true;
    btnFetchModels.textContent = 'Fetching...';
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
        for (const m of data.models) {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          settingModelSelect.appendChild(opt);
        }
        settingModelSelect.style.display = 'block';
        showToast(`Found ${data.models.length} model(s)!`);
      } else {
        showToast(`No models found: ${data.error || 'Check endpoint'}`);
      }
    } catch (e: any) {
      showToast(`Fetch models failed: ${e.message}`);
    } finally {
      btnFetchModels.disabled = false;
      btnFetchModels.textContent = '🔄 Fetch Models';
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
            characterId: selectCharacter?.value || currentChar.id,
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
  const openSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const s = await res.json();
        if (s.ai_provider) settingProvider.value = s.ai_provider;
        if (s.openai_base_url) settingBaseUrl.value = s.openai_base_url;
        if (s.openai_api_key) settingApiKey.value = s.openai_api_key;
        if (s.openai_model) settingModel.value = s.openai_model;
        if (s.temperature) {
          settingTemperature.value = s.temperature;
          if (tempDisplay) tempDisplay.textContent = s.temperature;
        }

        if (s.tts_master_enabled !== undefined) {
          settingTtsMaster.checked = s.tts_master_enabled !== 'false';
        }
        if (s.tts_engine) settingTtsEngine.value = s.tts_engine;
        if (s.omnivoice_api_url) settingOmniVoiceUrl.value = s.omnivoice_api_url;
        if (s.tts_allow_fallback !== undefined) {
          settingTtsFallback.checked = s.tts_allow_fallback !== 'false';
        }
        if (s.edge_voice) settingEdgeVoice.value = s.edge_voice;

        if (s.custom_voice_name && activeVoicePreview && activeVoiceName) {
          activeVoicePreview.style.display = 'block';
          activeVoiceName.textContent = s.custom_voice_name;
        }

        if (s.telegram_bot_enabled !== undefined) {
          settingTelegramEnabled.checked = s.telegram_bot_enabled === 'true';
        }
        if (s.telegram_bot_token) settingTelegramToken.value = s.telegram_bot_token;
        if (s.telegram_allowed_id) settingTelegramAllowed.value = s.telegram_allowed_id;

        if (s.discord_bot_enabled !== undefined) {
          settingDiscordEnabled.checked = s.discord_bot_enabled === 'true';
        }
        if (s.discord_bot_token) settingDiscordToken.value = s.discord_bot_token;
        if (s.discord_channel_id) settingDiscordChannel.value = s.discord_channel_id;
        if (s.discord_allowed_id) settingDiscordAllowed.value = s.discord_allowed_id;
      }
    } catch {}
    if (settingZoomSlider && getModel()) {
      settingZoomSlider.value = getModel().zoom.toFixed(2);
    }
    settingsModal.classList.add('active');
  };

  btnOpenSettings?.addEventListener('click', openSettings);
  btnCloseSettings?.addEventListener('click', () => settingsModal.classList.remove('active'));
  btnCancelSettings?.addEventListener('click', () => settingsModal.classList.remove('active'));

  btnSaveSettings?.addEventListener('click', async () => {
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
      discord_allowed_id: settingDiscordAllowed.value
    };

    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    settingsModal.classList.remove('active');
    showToast('Settings saved successfully');
  });
}

// WebSocket Event Relay
function setupWebSocket(
  stage: () => CompanionModel,
  lipSync: LipSync,
  switchCostume: (id: string) => Promise<void>,
  triggerEmotion: (emotion: string) => void
) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  let ws: WebSocket;
  const connect = () => {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[ws] Connected to companion server');
      showToast('Live link connected', 1500);
    };

    ws.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'chat':
          if (msg.emotion) triggerEmotion(msg.emotion);
          if (msg.audio_url) lipSync.play(msg.audio_url).catch(console.error);
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
          if (msg.costume_id) void switchCostume(msg.costume_id);
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
