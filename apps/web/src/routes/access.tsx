import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Camera, Shield, ShieldCheck, ShieldAlert, ArrowLeft, RefreshCw } from 'lucide-react'
import { Card, Button } from '@heroui/react'

export const Route = createFileRoute('/access')({ component: AccessKiosk })

type KioskStatus =
  | 'loading-camera'
  | 'idle'
  | 'capturing'
  | 'matching'
  | 'opening'
  | 'success'
  | 'failed'

// Etiqueta única por estado: renderizar un solo nodo de texto (en vez de varios
// hermanos condicionales) evita errores de reconciliación de React del tipo
// "insertBefore ... is not a child of this node".
const STATUS_LABELS: Record<KioskStatus, string> = {
  'loading-camera': 'Iniciando Cámara...',
  idle: 'Kiosco Activo y Listo',
  capturing: 'Capturando...',
  matching: 'Emparejando...',
  opening: 'Concediendo acceso...',
  success: 'Puerta Abierta',
  failed: 'Error de Lectura',
}

function AccessKiosk() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  // Estados del Kiosco (ver KioskStatus)
  const [status, setStatus] = useState<KioskStatus>('loading-camera')
  const [errorMsg, setErrorMsg] = useState('')
  const [identifiedUser, setIdentifiedUser] = useState<{ name: string; email: string } | null>(null)
  const [countdown, setCountdown] = useState(5)
  const [hardwarePending, setHardwarePending] = useState(false)

  // Inicializar Cámara Web
  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        })
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
        setStatus('idle')
      } catch (err) {
        console.error('Error al acceder a la cámara:', err)
        setStatus('failed')
        setErrorMsg('No se pudo acceder a la cámara web. Asegúrate de otorgar permisos.')
      }
    }
    startCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  // Cuenta regresiva para volver al estado inactivo tras éxito/fallo
  useEffect(() => {
    let timer: NodeJS.Timeout
    if ((status === 'success' || status === 'failed') && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    } else if (countdown === 0) {
      resetKiosk()
    }
    return () => clearTimeout(timer)
  }, [status, countdown])

  function resetKiosk() {
    setStatus('idle')
    setIdentifiedUser(null)
    setErrorMsg('')
    setCountdown(5)
    setHardwarePending(false)
  }

  // Capturar Foto y Procesar
  async function handleScan() {
    if (status !== 'idle' || !videoRef.current || !canvasRef.current) return

    setStatus('capturing')

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      setStatus('failed')
      setErrorMsg('Error de renderizado de imagen de cámara.')
      return
    }

    // Dibujar el frame actual del video en el lienzo oculto
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convertir a Base64
    const base64Image = canvas.toDataURL('image/jpeg', 0.9)

    setStatus('matching')

    try {
      // 1. Identificar y Autenticar Rostro en Better Auth
      const authRes = await fetch('/api/auth/face-biometrics/authenticate-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Image,
          mimeType: 'image/jpeg',
        }),
      })

      if (!authRes.ok) {
        const errData = await authRes.json().catch(() => ({}))
        throw new Error(errData.message || 'No se reconoció ninguna coincidencia facial.')
      }

      const authData = await authRes.json()
      const user = authData.user

      setIdentifiedUser({
        name: user.name,
        email: user.email,
      })

      setStatus('opening')

      // Simular retraso de validación para dar feedback visual de UX
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Actualmente el relé está sin implementar: mostramos éxito con aviso de hardware pendiente
      setHardwarePending(true)
      setStatus('success')
    } catch (err: any) {
      console.error(err)
      setStatus('failed')
      setErrorMsg(err.message || 'Error técnico durante la verificación facial.')
    }
  }

  return (
    <main translate="no" className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 no-underline hover:text-zinc-200 transition"
          >
            <ArrowLeft size={16} />
            Volver a Inicio
          </Link>
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100 sm:text-4xl">
            Kiosco de Acceso Facial
          </h1>
          <p className="mt-2 mb-8 text-sm text-zinc-400">
            Colócate frente a la cámara y presiona Escanear Rostro para ingresar de forma autónoma.
          </p>
        </div>

        <Card className="mx-auto max-w-xl" variant="default">
          <Card.Content>
            {/* Contenedor de la Cámara Web */}
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  status === 'success' || status === 'failed' ? 'opacity-30' : 'opacity-100'
                }`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Línea de escaneo animada para simulación biométrica */}
              {status === 'idle' && (
                <div className="pointer-events-none absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-zinc-400 to-transparent opacity-65 animate-[bounce_3s_infinite]" />
              )}

              {/* Superposiciones de estado */}
              {status === 'capturing' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 text-white">
                  <Camera className="animate-pulse mb-3" size={48} />
                  <p className="text-sm font-semibold">Capturando Frame...</p>
                </div>
              )}

              {status === 'matching' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 text-white">
                  <RefreshCw className="animate-spin mb-3 text-zinc-400" size={48} />
                  <p className="text-sm font-semibold">Comparando firma biométrica (pgvector)...</p>
                </div>
              )}

              {status === 'opening' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80 text-white">
                  <Shield className="animate-pulse mb-3 text-amber-500" size={48} />
                  <p className="text-sm font-semibold">Validando OTT y accionando relé de puerta...</p>
                </div>
              )}

              {status === 'success' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950 text-emerald-400 p-6 border border-emerald-800">
                  <ShieldCheck className="mb-4 animate-bounce" size={64} />
                  <h2 className="text-2xl font-bold mb-1">
                    {hardwarePending ? 'Identidad Verificada' : '¡Acceso Concedido!'}
                  </h2>
                  <p className="text-sm text-emerald-500 mb-4">Bienvenido(a), {identifiedUser?.name}</p>
                  {hardwarePending && (
                    <div className="max-w-sm rounded-lg border border-amber-700/60 bg-amber-950/60 px-4 py-2 text-xs text-amber-300">
                      <span className="font-bold">Aviso:</span> la apertura de puerta aún no está
                      implementada en la API de hardware. La autenticación facial fue exitosa.
                    </div>
                  )}
                  <p className="mt-6 text-xs text-emerald-500/70">Reinicio en {countdown} segundos...</p>
                </div>
              )}

              {status === 'failed' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950 text-red-400 p-6 border border-red-800">
                  <ShieldAlert className="mb-4 animate-bounce" size={64} />
                  <h2 className="text-2xl font-bold mb-2">Acceso Denegado</h2>
                  <p className="text-sm text-red-500 text-center max-w-sm mb-4">
                    {errorMsg || 'No se encontró un rostro registrado coincidente.'}
                  </p>
                  <Button
                    onPress={resetKiosk}
                    variant="danger"
                    size="sm"
                  >
                    Reintentar
                  </Button>
                  <p className="mt-6 text-xs text-red-500/70">Reinicio en {countdown} segundos...</p>
                </div>
              )}
            </div>

            {/* Panel de Controles del Kiosco */}
            <div className="mt-6 flex flex-col gap-4">
              <div className="flex justify-between items-center bg-zinc-950 rounded-2xl p-4 border border-zinc-800">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-3.5 w-3.5 rounded-full ${
                      status === 'idle' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'
                    }`}
                  />
                  <span className="text-sm font-semibold text-zinc-300">
                    {STATUS_LABELS[status]}
                  </span>
                </div>
                {status === 'idle' && (
                  <Button
                    onPress={handleScan}
                    variant="primary"
                    size="md"
                  >
                    Escanear Rostro
                  </Button>
                )}
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
    </main>
  )
}
