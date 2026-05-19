"use client";

import { useCamera } from "@access-control-system/ui/hooks/use-camera";
import { cn } from "@access-control-system/ui/lib/utils";
import { Spinner } from "@heroui/react";
import { Button } from "@access-control-system/ui/components/button";

export type CameraCaptureProps = {
  onCapture: (payload: { imageBase64: string; mimeType: string }) => void;
  facingMode?: "user" | "environment";
  captureLabel?: string;
  startLabel?: string;
  showDeviceSelector?: boolean;
  className?: string;
};

export function CameraCapture({
  onCapture,
  facingMode = "user",
  captureLabel = "Capturar",
  startLabel = "Iniciar cámara",
  showDeviceSelector = false,
  className,
}: CameraCaptureProps) {
  const { videoRef, state, error, start, capture, devices, currentDeviceId, switchDevice } =
    useCamera({ facingMode });

  const handleCapture = () => {
    const payload = capture();
    if (payload) onCapture(payload);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black/80 ring-1 ring-foreground/10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "h-full w-full object-cover",
            state === "ready" ? "opacity-100" : "opacity-0",
            facingMode === "user" && "scale-x-[-1]",
          )}
        />

        {state !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/90">
            {state === "idle" && (
              <Button onPress={start} variant="primary">
                {startLabel}
              </Button>
            )}
            {state === "requesting" && (
              <>
                <Spinner />
                <span>Solicitando permiso…</span>
              </>
            )}
            {state === "denied" && (
              <>
                <p className="font-medium">Permiso de cámara denegado</p>
                <p className="text-white/70">
                  Activa la cámara para este sitio desde la configuración del navegador y vuelve a
                  intentarlo.
                </p>
                <Button onPress={start} variant="secondary" size="sm">
                  Reintentar
                </Button>
              </>
            )}
            {state === "insecure" && (
              <p className="text-white/70">
                La cámara requiere contexto seguro (HTTPS o localhost).
              </p>
            )}
            {state === "unavailable" && (
              <>
                <p className="font-medium">No se detectó cámara</p>
                <Button onPress={start} variant="secondary" size="sm">
                  Reintentar
                </Button>
              </>
            )}
            {state === "error" && (
              <>
                <p className="font-medium">Error al iniciar la cámara</p>
                {error?.message && <p className="text-white/70">{error.message}</p>}
                <Button onPress={start} variant="secondary" size="sm">
                  Reintentar
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {state === "ready" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onPress={handleCapture} variant="primary">
            {captureLabel}
          </Button>
          {showDeviceSelector && devices.length > 1 && (
            <select
              value={currentDeviceId ?? ""}
              onChange={(e) => {
                void switchDevice(e.target.value);
              }}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Cámara ${i + 1}`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
