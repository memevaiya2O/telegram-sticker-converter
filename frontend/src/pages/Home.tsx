import { useState, useRef, useEffect } from "react";
import { Upload, FileVideo, CheckCircle2, AlertCircle, Clock, ArrowRight, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "idle" | "uploading" | "processing" | "done" | "error";

interface PollData {
  job_id: string;
  status: "queued" | "processing" | "done" | "error";
  error?: string;
  file_size_kb?: number;
  original_filename?: string;
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollData, setPollData] = useState<PollData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedFormats = ".gif,.mp4,.mov,.webm,.avi,.mkv,.flv,.wmv";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (selectedFile: File) => {
    // Check rough size if we want? Let backend do it.
    setFile(selectedFile);
    setStatus("idle");
    setErrorMessage(null);
    setJobId(null);
    setPollData(null);
    setUploadProgress(0);
  };

  const startConversion = async () => {
    if (!file) return;

    setStatus("uploading");
    setErrorMessage(null);
    setUploadProgress(10); // Fake initial progress

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Simulate slow upload purely for visual feedback since fetch doesn't expose native progress
      const progressInterval = setInterval(() => {
        setUploadProgress(p => Math.min(p + 15, 90));
      }, 200);

      const res = await fetch("/converter/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!res.ok) {
        throw new Error("Upload failed. Please try again.");
      }

      const data = await res.json();
      setJobId(data.job_id);
      setStatus("processing");
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "An unknown error occurred during upload.");
    }
  };

  // Polling effect
  useEffect(() => {
    if (status !== "processing" || !jobId) return;

    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      try {
        const res = await fetch(`/converter/status/${jobId}`);
        if (!res.ok) throw new Error("Failed to check status.");
        
        const data: PollData = await res.json();
        setPollData(data);

        if (data.status === "done") {
          setStatus("done");
        } else if (data.status === "error") {
          setStatus("error");
          setErrorMessage(data.error || "An error occurred during conversion.");
        } else {
          // Still processing/queued
          timeoutId = setTimeout(poll, 1000);
        }
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(err.message || "Failed to communicate with server.");
      }
    };

    poll();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [status, jobId]);

  const handleDownload = () => {
    if (jobId) {
      window.location.href = `/converter/download/${jobId}`;
    }
  };

  const reset = () => {
    setFile(null);
    setJobId(null);
    setPollData(null);
    setErrorMessage(null);
    setStatus("idle");
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background bg-pattern flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-[1000px] grid md:grid-cols-[1fr_320px] gap-6 items-start">
        
        {/* MAIN PANEL */}
        <Card className="border-border/50 shadow-2xl bg-card/95 backdrop-blur-sm overflow-hidden flex flex-col min-h-[520px]">
          <div className="h-16 px-6 border-b border-border/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <FileVideo className="w-4 h-4" />
              </div>
              <h1 className="font-semibold text-lg tracking-tight">Sticker Converter</h1>
            </div>
            {status !== "idle" && (
              <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            )}
          </div>

          <CardContent className="p-0 flex-1 flex flex-col relative">
            {/* IDLE / DROPZONE */}
            {status === "idle" && (
              <div 
                className={cn(
                  "absolute inset-0 p-8 flex flex-col items-center justify-center transition-colors duration-200",
                  isDragging ? "bg-primary/5" : ""
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div 
                  className={cn(
                    "w-full max-w-sm aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all duration-200",
                    isDragging ? "border-primary bg-primary/10 scale-[1.02]" : "border-border/50 bg-background/50 hover:border-primary/50",
                    file ? "border-primary/50 bg-background" : ""
                  )}
                >
                  {!file ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-muted-foreground mb-2">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="font-medium text-sm">Drag and drop a file</p>
                        <p className="text-xs text-muted-foreground font-mono">or click to browse</p>
                      </div>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="mt-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Select File
                      </Button>
                    </>
                  ) : (
                    <div className="w-full p-6 flex flex-col items-center text-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <FileVideo className="w-8 h-8" />
                      </div>
                      <div className="space-y-1 w-full">
                        <p className="font-medium truncate px-4" title={file.name}>{file.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <div className="flex gap-3 mt-2 w-full px-6">
                        <Button variant="outline" className="flex-1" onClick={() => setFile(null)}>Change</Button>
                        <Button className="flex-1" onClick={startConversion}>Convert</Button>
                      </div>
                    </div>
                  )}
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept={acceptedFormats}
                  onChange={handleFileChange}
                />
              </div>
            )}

            {/* UPLOADING & PROCESSING */}
            {(status === "uploading" || status === "processing") && (
              <div className="absolute inset-0 p-8 flex flex-col items-center justify-center animate-in fade-in duration-300">
                <div className="w-full max-w-sm space-y-8">
                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full border-4 border-secondary flex items-center justify-center">
                        {status === "uploading" ? (
                          <Upload className="w-8 h-8 text-primary animate-pulse" />
                        ) : (
                          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                        )}
                      </div>
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="48"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          className="text-primary transition-all duration-300 ease-out"
                          strokeDasharray="301.59"
                          strokeDashoffset={status === "uploading" ? 301.59 - (301.59 * uploadProgress) / 100 : 0}
                        />
                      </svg>
                    </div>
                  </div>

                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-semibold">
                      {status === "uploading" ? "Uploading file..." : "Converting media..."}
                    </h2>
                    <p className="text-sm text-muted-foreground font-mono truncate px-4">
                      {file?.name}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground font-mono">
                      <span>{status === "uploading" ? "Transferring" : "Encoding (VP9)"}</span>
                      <span>{status === "uploading" ? `${Math.round(uploadProgress)}%` : "Processing"}</span>
                    </div>
                    <Progress value={status === "uploading" ? uploadProgress : 100} className={cn("h-1.5", status === "processing" && "animate-pulse")} />
                  </div>
                </div>
              </div>
            )}

            {/* DONE */}
            {status === "done" && (
              <div className="absolute inset-0 p-8 flex flex-col items-center justify-center animate-in zoom-in-95 duration-500">
                <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 mb-6">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                
                <h2 className="text-2xl font-bold mb-2">Conversion Complete</h2>
                <p className="text-muted-foreground text-sm text-center mb-8 max-w-[280px]">
                  Your animated sticker is ready. It meets all Telegram requirements.
                </p>

                <div className="w-full max-w-sm bg-secondary/50 rounded-xl p-4 mb-8 border border-border/50">
                  <div className="flex justify-between items-center text-sm mb-2">
                    <span className="text-muted-foreground">Original</span>
                    <span className="font-mono truncate max-w-[150px]">{pollData?.original_filename || file?.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-medium">
                    <span className="text-foreground">Output Size</span>
                    <span className="font-mono text-green-500">
                      {pollData?.file_size_kb ? `${pollData.file_size_kb.toFixed(1)} KB` : '< 256 KB'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-4 w-full max-w-sm">
                  <Button variant="outline" className="flex-1" onClick={reset}>
                    Convert Another
                  </Button>
                  <Button className="flex-1 gap-2" onClick={handleDownload}>
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>
            )}

            {/* ERROR */}
            {status === "error" && (
              <div className="absolute inset-0 p-8 flex flex-col items-center justify-center animate-in fade-in duration-300">
                <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center text-destructive mb-6">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                
                <h2 className="text-xl font-semibold mb-2">Conversion Failed</h2>
                <div className="w-full max-w-sm bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-8 text-center">
                  <p className="text-sm text-destructive">{errorMessage || "An unexpected error occurred."}</p>
                </div>

                <Button variant="outline" onClick={reset}>
                  Try Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SIDEBAR: TELEGRAM SPECS */}
        <Card className="border-border/50 shadow-lg bg-card/95 backdrop-blur-sm">
          <div className="p-5 border-b border-border/50">
            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Target Specs</h3>
          </div>
          <CardContent className="p-5 space-y-6">
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <FileVideo className="w-4 h-4" /> Format
                </span>
                <Badge variant="secondary" className="font-mono">.WEBM</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" /> Codec
                </span>
                <span className="font-mono font-medium">VP9</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Dimensions
                </span>
                <span className="font-mono font-medium">512×512</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Duration
                </span>
                <span className="font-mono font-medium">Max 3s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Framerate
                </span>
                <span className="font-mono font-medium">30 FPS</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border/50">
                <span className="text-muted-foreground">Max File Size</span>
                <span className="font-mono font-medium text-primary">256 KB</span>
              </div>
            </div>

            <div className="bg-secondary/50 rounded-lg p-4 text-xs text-muted-foreground leading-relaxed">
              Output files are strictly encoded to meet Telegram's animated sticker requirements without alpha-channel clipping.
            </div>
          </CardContent>
        </Card>

      {/* ── Developer & Copyright Footer ─────────────────────────────────── */}
      <div className="mt-6 col-span-full">
        <div className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
          <a
            href="https://t.me/infinity_codex"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 font-medium text-muted-foreground hover:text-primary transition-colors duration-200"
          >
            <span className="text-base">⚡</span>
            <span>
              Developed by{" "}
              <span className="text-primary group-hover:underline underline-offset-4">
                I<span style={{fontVariant: "small-caps"}}>nfinity</span> C<span style={{fontVariant: "small-caps"}}>odex</span> &lt;/&gt;
              </span>
            </span>
          </a>
          <span className="text-muted-foreground/60 text-xs">
            © {new Date().getFullYear()} Iɴꜰɪɴɪᴛʏ Cᴏᴅᴇx. All rights reserved.
          </span>
        </div>
      </div>

      </div>
    </div>
  );
}