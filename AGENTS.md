# Codex project instructions

## Product

This repository is the long-term commercial project for **向前 · 学习督导台**. It is a Chinese, privacy-first, local-first study supervisor and AI-assisted question whiteboard.

## Hard constraints

- Develop, test, package and run this project only under the D: drive. Do not deploy it to C: or a cloud host unless the user explicitly changes that rule.
- Never commit `.env`, API keys, user study data, imported questions, screenshots, recordings, IndexedDB exports or logs.
- Base study-management functions must work without an API key.
- Kimi keys are server-side environment variables only. Never expose them to browser code, localStorage, logs or screenshots.
- Camera, microphone and screen capture may start only after explicit user action and must stop when the session/page ends. Never claim persistent monitoring.
- Be exact about capability boundaries: browser speech recognition/TTS is not native Kimi realtime audio; webcam signals do not reliably detect phone use; model self-checks are not correctness guarantees.
- AI annotations must use validated structured data. Never execute model-returned JavaScript or blindly alter the canvas.
- Keep personal and commercial distributions separate. A release must be built from a clean tree and contain no private data.

## Required verification

Before a commit or release, run:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run package:local
```

For changes to voice, canvas or PDF flows, also perform a headed Edge/Chromium visual test. Live Kimi tests consume the user's balance; run them only when needed and report that use.

## Current technical boundary

The current voice classroom uses browser SpeechRecognition → finalized text → local Node proxy → Kimi Chat Completions → browser speechSynthesis. Kimi does not receive raw microphone audio from this app. Naturalness is limited by installed browser/Windows voices.

Read `docs/PROJECT_HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` and `docs/RELEASE_CHECKLIST.md` before substantial changes.
