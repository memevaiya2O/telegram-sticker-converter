"""
Telegram Sticker Converter — Render deployment entry point
FastAPI: serves /converter/* API + React static frontend at /
"""

import os
import uuid
import asyncio
import json
import subprocess
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import aiofiles

app = FastAPI(title="Telegram Sticker Converter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("/tmp/sticker_converter/uploads")
OUTPUT_DIR = Path("/tmp/sticker_converter/outputs")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

jobs: dict[str, dict] = {}

ALLOWED_EXTENSIONS = {".gif", ".mp4", ".mov", ".webm", ".avi", ".mkv", ".flv", ".wmv"}
MAX_SIZE_BYTES = 256 * 1024
MAX_DURATION_SEC = 3.0
MAX_FPS = 30
FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"

SCALE_FILTER = (
    "scale=512:512:force_original_aspect_ratio=decrease,"
    "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0"
)


def get_video_duration(input_path: str) -> float:
    result = subprocess.run(
        [FFPROBE, "-v", "quiet", "-print_format", "json",
         "-show_streams", "-select_streams", "v:0", input_path],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        try:
            info = json.loads(result.stdout)
            dur = info.get("streams", [{}])[0].get("duration")
            if dur:
                return float(dur)
        except Exception:
            pass
    result2 = subprocess.run(
        [FFPROBE, "-v", "quiet", "-print_format", "json", "-show_format", input_path],
        capture_output=True, text=True,
    )
    try:
        dur = json.loads(result2.stdout).get("format", {}).get("duration")
        if dur:
            return float(dur)
    except Exception:
        pass
    return MAX_DURATION_SEC


async def run_command(cmd: list[str]) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    return proc.returncode, stderr.decode("utf-8", errors="replace")


async def encode_two_pass(input_path: str, output_path: str, target_kbps: int) -> tuple[bool, str]:
    passlogfile = output_path.replace(".webm", "_pass")
    cmd1 = [
        FFMPEG, "-y", "-i", input_path, "-t", str(MAX_DURATION_SEC),
        "-vf", SCALE_FILTER, "-c:v", "libvpx-vp9",
        "-b:v", f"{target_kbps}k", "-pass", "1",
        "-passlogfile", passlogfile, "-auto-alt-ref", "0",
        "-r", str(MAX_FPS), "-an", "-f", "webm", "/dev/null",
    ]
    rc, err = await run_command(cmd1)
    if rc != 0:
        return False, f"Pass 1 failed: {err[-800:]}"

    cmd2 = [
        FFMPEG, "-y", "-i", input_path, "-t", str(MAX_DURATION_SEC),
        "-vf", SCALE_FILTER, "-c:v", "libvpx-vp9",
        "-b:v", f"{target_kbps}k", "-pass", "2",
        "-passlogfile", passlogfile, "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0", "-r", str(MAX_FPS), "-an", "-loop", "0",
        output_path,
    ]
    rc, err = await run_command(cmd2)
    for f in Path(output_path).parent.glob(Path(passlogfile).name + "*"):
        try:
            f.unlink()
        except Exception:
            pass
    if rc != 0:
        return False, f"Pass 2 failed: {err[-800:]}"
    return True, ""


async def run_conversion(job_id: str, input_path: str, output_path: str):
    try:
        jobs[job_id]["status"] = "processing"
        raw_dur = get_video_duration(input_path)
        duration = min(raw_dur, MAX_DURATION_SEC)
        budget_bits = MAX_SIZE_BYTES * 8 * 0.90
        target_kbps = max(80, min(int(budget_bits / duration / 1000), 800))

        success, err = await encode_two_pass(input_path, output_path, target_kbps)
        if not success:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = err
            return

        out = Path(output_path)
        if not out.exists() or out.stat().st_size == 0:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = "Conversion produced no output"
            return

        actual_size = out.stat().st_size
        for attempt in range(1, 4):
            if actual_size <= MAX_SIZE_BYTES:
                break
            target_kbps = max(50, int(target_kbps * (0.75 ** attempt)))
            success, err = await encode_two_pass(input_path, output_path, target_kbps)
            if not success:
                jobs[job_id]["status"] = "error"
                jobs[job_id]["error"] = f"Retry {attempt} failed: {err}"
                return
            if out.exists():
                actual_size = out.stat().st_size

        if actual_size > MAX_SIZE_BYTES:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = (
                f"Could not compress below 256 KB. Final size: {actual_size // 1024} KB. "
                "Try a shorter or lower-resolution source."
            )
            return

        jobs[job_id]["status"] = "done"
        jobs[job_id]["file_size_kb"] = round(actual_size / 1024, 1)
        jobs[job_id]["output_path"] = output_path

    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)
    finally:
        try:
            os.unlink(input_path)
        except Exception:
            pass


# ── API routes ────────────────────────────────────────────────────────────────

@app.get("/converter/health")
async def health():
    return {"status": "ok"}


@app.post("/converter/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'")
    job_id = str(uuid.uuid4())
    input_path = str(UPLOAD_DIR / f"{job_id}{ext}")
    output_path = str(OUTPUT_DIR / f"{job_id}.webm")
    async with aiofiles.open(input_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            await f.write(chunk)
    jobs[job_id] = {
        "status": "queued",
        "original_filename": file.filename,
        "error": None,
        "file_size_kb": None,
        "output_path": None,
    }
    asyncio.create_task(run_conversion(job_id, input_path, output_path))
    return {"job_id": job_id, "status": "queued"}


@app.get("/converter/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    return {
        "job_id": job_id,
        "status": job["status"],
        "error": job.get("error"),
        "file_size_kb": job.get("file_size_kb"),
        "original_filename": job.get("original_filename"),
    }


@app.get("/converter/download/{job_id}")
async def download_file(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail=f"Not ready: {job['status']}")
    output_path = job.get("output_path")
    if not output_path or not Path(output_path).exists():
        raise HTTPException(status_code=404, detail="Output file not found")
    stem = Path(job.get("original_filename", "sticker")).stem
    return FileResponse(
        path=output_path,
        media_type="video/webm",
        filename=f"{stem}_telegram_sticker.webm",
    )


# ── Serve React frontend (must come AFTER API routes) ────────────────────────

STATIC_DIR = Path(__file__).parent / "frontend" / "dist"

if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index = STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return {"detail": "Frontend not built"}
else:
    @app.get("/")
    async def root():
        return {"message": "API is running. Frontend not built yet."}
