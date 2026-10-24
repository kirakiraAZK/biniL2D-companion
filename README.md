# Unified Multi-Character Live2D AI Companion

A modern, localhost-first Full-Stack TypeScript application that evolves Live2D Cubism models into an interactive, multi-provider AI companion. Features real-time split-screen chat, live streaming lip-sync, dynamic emotion & motion orchestration, multi-character/outfit management with independent framing, voice cloning, and external Telegram & Discord bot bridges.

---

## ✨ Key Features

### 1. Reversed Split-Screen Web Dashboard
- **Left Panel (Interactive Chat & Controls ~ 58%)**:
  - Real-time streaming conversation with inline status pills (`THINKING`, `JOY`, `SAD`, `👔 OUTFIT`, etc.).
  - Markdown formatting support: italic (`*emphasis*`), bold (`**strong**`), inline code, blockquotes, lists.
  - Character and outfit switcher with instant live switching.
  - Non-destructive companion display name and outfit renaming (`✏️` buttons) preserving original disk paths.
  - In-chat Raw AI Output inspection: inline `👁️ Raw` button on message bubbles plus header toggle `👁️` with 1-click clipboard copy.
  - Developer Debug Console (`🐞` button in header) with live raw output telemetry, prompt payloads, event ring buffer, and engine state.
  - Persistent chat history backed by local SQLite.
  - Full-featured Tabbed Settings Modal (`🧠 AI Brain`, `🎙️ Voice & TTS`, `🎭 Live2D Stage`, `🤖 Bot Bridges`).
- **Right Panel (WebGL Live2D Stage ~ 42%)**:
  - High-performance Cubism 4 / 5 rendering with procedural breathing, eye blinking, physics, and cursor tracking.
  - Real-time mouse dragging and scroll-wheel zooming with 1:1 pixel precision.
  - Independent position and zoom persistence **per character and per costume/outfit**.
  - On-screen quick docks for expressions, motions, and pan/zoom controls.

### 2. Multi-Character & Outfits Management
- Auto-detects and synchronizes all characters located in `./Characters/` directly into local SQLite persistence without manual registration.
- Supports characters with multiple outfits and costumes (e.g. Tokoyami Towa with 4 costumes, Amane Kanata, etc.).
- Independent active outfit memory per character: switching between characters preserves each companion's previously chosen outfit reliably.
- Switch costumes seamlessly via the top dropdown, on-screen controls, or through AI commands (e.g. `[costume: uniq-0092-00]`).
- Renaming characters and outfits updates SQLite and client UI dynamically without touching disk directory names.

### 3. Developer Debug Mode & In-Chat Raw Inspection
- **In-Chat Raw View**: Inspect the untouched, raw output from the AI model (including hidden reasoning `<think>`, emotions `[JOY]`, and costume tags) directly beneath any assistant message bubble or globally via the `👁️` button in the header.
- **Developer Debug Console (`🐞`)**:
  - **🤖 Raw AI Output**: Full unparsed model stream, provider, model name, response character length, and latency in milliseconds.
  - **📜 Prompt Inspector**: View complete prompt payloads including system instructions, persona, solar clock, mood bracket, and conversation history.
  - **📡 Live Event Log**: Chronological stream of all system telemetry (`AI`, `TTS`, `WS`, `MOOD`, `INTERACTION`, `SYSTEM`) with category filters and copy tools.
  - **⚙️ Engine State**: Real-time snapshot of loaded characters, costumes, SQLite database paths, background services, and client counts.

### 3. Multi-Provider AI Brain
- **OpenAI-Compatible Custom Endpoints**: Connect to local models (LM Studio, Ollama, vLLM, LocalAI) or cloud providers (OpenAI, Groq, OpenRouter, Together AI).
- **Anthropic Claude**: Official Claude 3.5 Sonnet, Haiku, and Opus support.
- **Google Gemini**: Gemini 1.5 Flash and Pro support with streaming.
- **Model Auto-Discovery**: One-click **Fetch Models** button queries the endpoint directly (`GET /models`), eliminating manual model typing.
- **Streaming Emotion & Action Tag Parser**: Intercepts emotion tags (`[HAPPY]`, `[expression: joy-01]`, `[motion: smile-01]`) in the token stream, cleanly stripping them from the chat bubble while triggering the corresponding Live2D facial expressions and motions.

### 4. TTS (Text-to-Speech) & Real-Time Lip-Sync
- **OmniVoice Integration**: Voice cloning support via OmniVoice API server.
- **Custom Voice Sample Upload**: Drag & drop or upload `.wav` / `.mp3` voice samples directly in the UI for instant zero-shot voice cloning.
- **Edge-TTS Fallback**: Automatic failover to Microsoft Edge neural voices when local TTS server is offline.
- **Master TTS Toggle**: Turn speech generation on or off at will with zero prompt delay when disabled.
- **Web Audio Lip-Sync**: Real-time RMS envelope calculation driving `ParamMouthOpenY` and `ParamLipSync` parameters synchronously with audio playback.

### 5. External Bot Bridges (Telegram & Discord)
- **Telegram Bot**: Long-polling bridge allowing you to converse with your companion from mobile or desktop Telegram apps.
- **Discord Bot**: Direct Discord Gateway v10 WebSocket bridge supporting both Direct Messages (DMs) and server channels (with optional channel ID and user ID whitelisting).
- Hot-reloaded instantly when saved from the UI without restarting the server.

### 6. Dual-Mode Desktop Pet (Tauri)
- Run the full Web Dashboard in your browser (`http://localhost:5180`) and simultaneously run the transparent, frameless, always-on-top desktop mascot via `npm run tauri dev`.
- All client instances sync in real time over local WebSocket (`ws://localhost:8800/ws`).

---

## 📁 Project Architecture

```
biniL2D-companion/
├── Characters/                  # Local directory holding your Live2D models & outfits
│   ├── Amane Kanata/
│   │   ├── costumes/
│   │   ├── motions/
│   │   └── voice/
│   └── Tokoyami Towa/
│       ├── costumes/            # Multiple outfits (cmmn-0000, nrml-0022, uniq-0092, etc.)
│       └── motions/
├── server/                      # Fastify + Node 26 native SQLite backend
│   ├── ai/                      # Multi-provider LLM adapters (OpenAI, Claude, Gemini)
│   ├── bridges/                 # Telegram Bot & Discord Bot Gateway bridges
│   ├── db/                      # SQLite client, schema & auto-seeding scanner
│   ├── parser/                  # Streaming tag parser for motions and expressions
│   ├── routes/                  # REST API routes (assets, characters, chat, settings)
│   ├── tts/                     # OmniVoice & Edge-TTS speech generation
│   └── ws/                      # WebSocket hub for multi-client synchronization
├── src/                         # Frontend client application (TypeScript + Vite)
│   ├── audio.ts                 # Web Audio API lip-sync engine
│   ├── idle.ts                  # Procedural idle director
│   ├── main.ts                  # Split-screen UI, drag repositioning, & event bindings
│   ├── model.ts                 # Live2D Cubism WebGL model wrapper & projection matrix
│   ├── pet.ts                   # Tauri desktop pet integration
│   └── registry.ts              # Dynamic character & costume switcher
├── src-tauri/                   # Rust desktop application harness (Tauri v2)
├── index.html                   # Modern split-screen layout & tabbed settings modal
├── package.json                 # Monorepo scripts & dependencies
├── vite.config.ts               # Vite dev server with reverse proxies to Fastify
└── .env.example                 # Configuration template
```

---

## 🚀 Getting Started

### Prerequisites
1. **Node.js**: Node 20+ (Node 22 or 26 recommended for native `node:sqlite`).
2. **Rust & C++ Build Tools** *(Optional)*: Only required if building the desktop pet mode via Tauri (`npm run tauri dev`). Plain Web mode requires Node only.

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/your-username/live2d-companion.git
   cd live2d-companion
   npm install
   ```

2. **Download Live2D Cubism Web Framework:**
   ```bash
   npm run setup
   ```
   *This downloads the official Cubism Core from Live2D's CDN and sets up the framework in `vendor/` and `public/core/`.*

3. **Start the Unified Development Server:**
   ```bash
   npm run dev
   ```
   This single command starts:
   - **Fastify Backend**: Running on `http://localhost:8800`
   - **Vite Web Dashboard**: Running on `http://localhost:5180`

4. Open `http://localhost:5180` in your browser!

---

## 🎭 Adding Characters and Costumes

Characters are placed inside the `./Characters/` folder at the root of the project.

### Recommended Directory Structure:
```
Characters/
└── <Character Name>/
    ├── costumes/
    │   ├── <costume-slug-1>/
    │   │   ├── <model>.model3.json
    │   │   ├── <model>.moc3
    │   │   ├── <model>.physics3.json     (optional)
    │   │   ├── textures/
    │   │   └── expressions/              (optional)
    │   └── <costume-slug-2>/             (optional additional costumes)
    │       └── <model>.model3.json
    ├── motions/                          (optional motions shared across costumes)
    │   ├── idle-01_lv03_lp.motion3.json
    │   ├── joy-01_lv03.motion3.json
    │   └── ...
    └── voice/                            (optional voice samples)
        └── greet.wav
```

The server automatically scans `./Characters/` upon launch, extracts all models and costume configurations, and registers them in SQLite.

---

## ⚙️ Configuration & Settings

Settings can be managed directly in the browser via the **⚙️ Settings** button in the top header:

| Tab | Configurable Settings |
|---|---|
| **🧠 AI Brain** | Provider (`openai`, `claude`, `gemini`), Custom Base URL, API Key, Model selector with **Fetch Models**, Temperature slider. |
| **🎙️ Voice & TTS** | Master TTS Toggle, TTS Engine (`omnivoice`, `edge-tts`), OmniVoice URL, Edge Voice picker, Custom Voice Sample file upload (`.wav`, `.mp3`). |
| **🎭 Live2D Stage** | Zoom scale slider, **Save Position for Outfit**, **Reset to Center**. Left-click dragging directly on the stage canvas also saves automatically. |
| **🤖 Bot Bridges** | Telegram Bot (Enabled, Token, Whitelist ID) and Discord Bot (Enabled, Token, Channel ID, Whitelist ID). |

You can also preload environment variables using `.env` (see [`.env.example`](file:///.env.example)).

---

## 🤖 External Bot Bridges Setup

### Telegram Bot Bridge
1. Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot with `/newbot`.
2. Copy the bot token into **Settings ➔ Bot Bridges ➔ Telegram Bot Token**.
3. Toggle **Enable Telegram Bot** and click **Save All Settings**.

### Discord Bot Bridge
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an Application.
2. Under **Bot**, generate a Bot Token and paste it into **Settings ➔ Bot Bridges ➔ Discord Bot Token**.
3. **Important**: Under the **Bot** page, scroll down to **Privileged Gateway Intents** and enable **MESSAGE CONTENT INTENT**.
4. Generate an OAuth2 Invite URL with `bot` scope and `Send Messages` / `Read Messages/View Channels` permissions, then invite the bot to your server (or chat in DMs).
5. Toggle **Enable Discord Bot** and click **Save All Settings**.

---

## 🐾 Desktop Pet Mode (Tauri)

To launch the character as a transparent, always-on-top desktop companion:
```bash
npm run tauri dev
```
- **Move**: Click and drag the character anywhere on your desktop.
- **Resize**: Scroll with the mouse wheel over the character.
- **Click-Through**: Press `Ctrl + Alt + L` to toggle click-through mode.

---

## 📜 License & Acknowledgements

- **Live2D Cubism Core & Framework**: Copyright (c) Live2D Inc. Subject to [Live2D Open Software License](https://www.live2d.com/en/sdk/license/).
- **Original Foundation**: Forked and extended from `live2d-companion`.
- **Application Code**: MIT License.
