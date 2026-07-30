# Telegram Sticker Converter

Convert any GIF or video into a **Telegram-ready animated sticker** (.webm VP9, 512×512, max 3 s, max 256 KB).

## Stack

- **Backend**: Python 3.11, FastAPI, FFmpeg (VP9 two-pass encoding)
- **Frontend**: React 18, Vite, Tailwind CSS

---

## Deploy to Render

### Option 1 — Blueprint (render.yaml, one click)

1. Fork or push this repo to your GitHub account.
2. Go to [render.com](https://render.com) → **New** → **Blueprint**.
3. Connect your repo. Render auto-reads `render.yaml` and creates the service.
4. Click **Apply** — done.

### Option 2 — Manual web service

1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Connect your repo.
3. Fill in:

| Field | Value |
|---|---|
| **Environment** | Python 3 |
| **Build Command** | `pip install -r requirements.txt && cd frontend && npm install && npm run build` |
| **Start Command** | `uvicorn server:app --host 0.0.0.0 --port $PORT` |
| **Plan** | Free |

4. Add environment variable: `PYTHON_VERSION = 3.11.0`
5. Click **Create Web Service**.

> **Note:** FFmpeg must be available on the runtime. Render's default Python image includes it. If you hit a `ffmpeg: not found` error, add a `Dockerfile` (see below).

---

## Local development

```bash
# Backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` (Vite dev server proxies `/converter/*` to port 8000).

---

## Telegram sticker requirements enforced

| Spec | Value |
|---|---|
| Format | `.webm` |
| Codec | VP9 |
| Dimensions | 512 × 512 px |
| Duration | max 3 seconds |
| Frame rate | max 30 FPS |
| File size | **max 256 KB** (auto-compressed with two-pass encoding) |
