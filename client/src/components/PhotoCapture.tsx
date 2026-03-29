import { useState, useRef, useEffect } from "react";
import { Camera, RefreshCw, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PhotoCaptureProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

export function PhotoCapture({ isOpen, onOpenChange, onCapture }: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user", 
          width: { ideal: 1024 }, 
          height: { ideal: 1024 } 
        },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("No se pudo acceder a la cámara. Revisa los permisos de tu navegador.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
    }
    return () => stopCamera();
  }, [isOpen]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (context) {
        // We want a square crop for the circle
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const size = Math.min(videoWidth, videoHeight);
        const startX = (videoWidth - size) / 2;
        const startY = (videoHeight - size) / 2;

        canvas.width = 512;
        canvas.height = 512;

        // Draw the cropped square frame
        context.drawImage(video, startX, startY, size, size, 0, 0, 512, 512);
        
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirmPhoto = () => {
    if (capturedImage) {
      fetch(capturedImage)
        .then((res) => res.blob())
        .then((blob) => {
          const file = new File([blob], `avatar_${Date.now()}.jpg`, { type: "image/jpeg" });
          onCapture(file);
          onOpenChange(false);
          setCapturedImage(null);
        });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-none bg-zinc-950">
        <DialogHeader className="p-4 pb-2 text-center">
          <DialogTitle className="text-white text-lg">Tomar foto carnet</DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            Asegúrate de estar en un lugar iluminado
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full max-w-[400px] mx-auto bg-black flex items-center justify-center overflow-hidden">
          {!capturedImage ? (
            <>
              {error ? (
                <div className="flex flex-col items-center p-8 text-center gap-4 text-zinc-300">
                  <AlertCircle className="h-12 w-12 text-red-500" />
                  <p className="text-sm">{error}</p>
                  <Button variant="outline" className="border-zinc-700" onClick={startCamera}>
                    Reintentar
                  </Button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                  />
                  {/* Circular Overlay logic with double border box-shadow trick */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[85%] h-[85%] rounded-full border-2 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]" />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center w-full h-full p-4">
              <img 
                src={capturedImage} 
                alt="Captura" 
                className="w-[85%] h-[85%] object-cover rounded-full ring-4 ring-mango-orange shadow-2xl" 
              />
            </div>
          )}
          
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="px-4 pt-4 pb-2">
          <Alert className="bg-zinc-900 border-zinc-800 text-zinc-300 py-3">
            <AlertDescription className="text-[11px] text-center uppercase tracking-widest font-semibold leading-relaxed">
               RECOMENDACIÓN: Mantenga una expresión neutral. No sonría ni realice gestos inusuales.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="p-6 pt-2 flex flex-row gap-3 justify-center">
          {!capturedImage ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <Button
                onClick={capturePhoto}
                disabled={!!error || !stream}
                className="w-16 h-16 rounded-full bg-white hover:bg-zinc-200 p-0 flex items-center justify-center border-[6px] border-zinc-800 ring-4 ring-white/10 active:scale-95 transition-all"
              >
                <div className="w-10 h-10 rounded-full border-2 border-zinc-900" />
              </Button>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Capturar</p>
            </div>
          ) : (
            <div className="flex gap-3 w-full animate-in fade-in slide-in-from-bottom-2">
              <Button
                variant="outline"
                onClick={retakePhoto}
                className="flex-1 h-12 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Repetir
              </Button>
              <Button
                onClick={confirmPhoto}
                className="flex-1 h-12 bg-mango-orange hover:bg-mango-orange/90 text-white font-bold"
              >
                <Check className="h-4 w-4 mr-2" />
                Aceptar
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
