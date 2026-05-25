import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Users,
  Activity,
  UserPlus,
  Camera,
  Trash2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'
import { Card, Button, TextField, Label, Input, Tabs, Table, Modal, Alert, toast } from '@heroui/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FaceEnrollment } from '#/components/face-enrollment'

export const Route = createFileRoute('/admin')({ component: AdminConsole })

function AdminConsole() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [checkingSession, setCheckingSession] = useState(true)
  const [userToDelete, setUserToDelete] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<'employees' | 'audit'>('employees')

  // Estados de registro de empleado
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regSuccess, setRegSuccess] = useState<string | null>(null)
  const [regError, setRegError] = useState<string | null>(null)

  // Estados de captura de rostro de empleado
  const [selectedUserForFace, setSelectedUserForFace] = useState<any | null>(null)

  // Query: Validar sesión del administrador
  const { data: sessionData, isLoading: sessionLoading, isError: sessionError } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const res = await fetch('/api/auth/get-session')
      if (!res.ok) throw new Error('No session')
      const data = await res.json()
      if (!data || !data.user) throw new Error('No user in session')
      return data
    },
    retry: false,
  })

  // Sincronizar estado de carga de sesión
  useEffect(() => {
    if (!sessionLoading) {
      setCheckingSession(false)
    }
  }, [sessionLoading])

  // Redirigir al inicio si la sesión no es válida
  useEffect(() => {
    if (sessionError) {
      navigate({ to: '/' })
    }
  }, [sessionError, navigate])

  // Query: Obtener lista de empleados
  const { data: employees = [], isLoading: employeesLoading, refetch: refetchEmployees } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const res = await fetch('/api/trpc/users.list')
      if (!res.ok) throw new Error('Failed to fetch employees')
      const data = await res.json()
      return data.result.data || []
    },
    enabled: !!sessionData,
  })

  // Query: Obtener logs de auditoría
  const { data: auditLogs = [], isLoading: auditLoading, refetch: refetchAuditLogs } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: async () => {
      const res = await fetch('/api/trpc/audit.list')
      if (!res.ok) throw new Error('Failed to fetch audit logs')
      const data = await res.json()
      return data.result.data || []
    },
    enabled: !!sessionData,
  })

  // Atajo de estado de carga combinado
  const loading = employeesLoading || auditLoading

  // Suscribirse a SSE para actualizaciones en tiempo real y sincronizar datos
  useEffect(() => {
    if (!sessionData) return

    console.log('Estableciendo conexión SSE para actualizaciones en tiempo real...')
    const eventSource = new EventSource('/api/sse/live-updates')

    eventSource.onmessage = (event) => {
      if (event.data === 'update' || event.data === 'sync') {
        console.log('Evento SSE de cambio de base de datos recibido. Sincronizando...')
        queryClient.invalidateQueries({ queryKey: ['employees'] })
        queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      }
    }

    eventSource.onerror = (err) => {
      console.warn('Conexión SSE interrumpida. Auto-reconexión del navegador en progreso.', err)
    }

    return () => {
      eventSource.close()
      console.log('Conexión SSE cerrada.')
    }
  }, [sessionData, queryClient])

  // Mutación: Crear nuevo empleado
  const createEmployeeMutation = useMutation({
    mutationFn: async (newEmp: any) => {
      const res = await fetch('/api/auth/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmp),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.message || 'Error al registrar al empleado desde la cuenta de administrador.')
      }

      return res.json()
    },
    onSuccess: (data) => {
      const successMsg = `Empleado ${regName} registrado exitosamente. Ahora puedes capturar su rostro.`
      setRegSuccess(successMsg)
      toast.success(successMsg)

      setRegName('')
      setRegEmail('')
      setRegPassword('')

      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setSelectedUserForFace(data.user)
    },
    onError: (err: any) => {
      const errMsg = err.message || 'Fallo técnico al registrar empleado.'
      setRegError(errMsg)
      toast.danger(errMsg)
    }
  })

  async function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault()
    setRegSuccess(null)
    setRegError(null)

    if (!regName || !regEmail || !regPassword) {
      const errMsg = 'Todos los campos son obligatorios.'
      setRegError(errMsg)
      toast.danger(errMsg)
      return
    }

    createEmployeeMutation.mutate({
      name: regName,
      email: regEmail,
      password: regPassword,
      role: 'user',
    })
  }

  // Mutación: Eliminar empleado
  const deleteEmployeeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch('/api/trpc/users.delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Error al eliminar al empleado.')
      }

      return res.json()
    },
    onSuccess: () => {
      toast.success('Empleado eliminado de manera exitosa.')
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
    onError: (err: any) => {
      console.error('Error al eliminar empleado:', err)
      toast.danger(err.message || 'Fallo técnico al eliminar empleado.')
    }
  })

  // Iniciar enrolamiento facial
  function startFaceRegistration(user: any) {
    setSelectedUserForFace(user)
  }

  // Cerrar modal de enrolamiento
  function closeFaceRegistration() {
    setSelectedUserForFace(null)
  }

  // Tras enrolamiento exitoso, refrescar listas
  function handleFaceRegistrationSuccess() {
    refetchEmployees()
    refetchAuditLogs()
    toast.success('Biometría registrada correctamente.')
  }

  // Helper para mostrar badges semánticos en auditoría
  function getActionBadge(action: string) {
    switch (action) {
      case 'biometric_match_success':
        return <span className="rounded-full bg-emerald-950/45 border border-emerald-900/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">Coincidencia Éxito</span>
      case 'biometric_match_failed':
        return <span className="rounded-full bg-red-950/45 border border-red-900/60 px-2.5 py-0.5 text-xs font-semibold text-red-400">Coincidencia Fallida</span>
      case 'biometrics_registered':
        return <span className="rounded-full bg-blue-950/45 border border-blue-900/60 px-2.5 py-0.5 text-xs font-semibold text-blue-400">Biometría Enrolada</span>
      case 'door_opened':
        return <span className="rounded-full bg-teal-950/45 border border-teal-900/60 px-2.5 py-0.5 text-xs font-semibold text-teal-400">Puerta Abierta</span>
      case 'door_open_failed':
        return <span className="rounded-full bg-amber-950/45 border border-amber-900/60 px-2.5 py-0.5 text-xs font-semibold text-amber-400">Apertura Fallida</span>
      default:
        return <span className="rounded-full bg-default border border-default-200 px-2.5 py-0.5 text-xs font-semibold text-foreground">{action}</span>
    }
  }

  if (checkingSession) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-background text-foreground">
        <RefreshCw className="animate-spin text-muted" size={32} />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-8">
      {/* Encabezado del Panel */}
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-default-100 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Panel de Administración
            </h1>
            <p className="text-sm text-muted mt-1">
              Gestión centralizada de personal biométrico y logs de accesos del hardware.
            </p>
          </div>
          <Button
            onPress={() => {
              refetchEmployees()
              refetchAuditLogs()
            }}
            variant="secondary"
            className="flex items-center gap-2 text-sm font-semibold cursor-pointer"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualizar Datos
          </Button>
        </div>

        {/* Selector de pestañas */}
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as 'employees' | 'audit')}
          variant="secondary"
          className="mb-8"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Consolas de gestión" className="border-b border-default-100 *:data-[selected=true]:text-foreground *:text-muted">
              <Tabs.Tab id="employees">
                <span className="flex items-center gap-2 font-bold py-2">
                  <Users size={16} />
                  Empleados
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="audit">
                <span className="flex items-center gap-2 font-bold py-2">
                  <Activity size={16} />
                  Registro de Auditoría
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        {/* Contenido principal */}
        {loading && employees.length === 0 ? (
          <div className="flex justify-center items-center py-20">
            <RefreshCw className="animate-spin text-muted" size={32} />
          </div>
        ) : activeTab === 'employees' ? (
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Formulario de registro de Empleado */}
            <div className="lg:col-span-1">
              <Card className="sticky top-24" variant="default">
                <Card.Header className="pb-4">
                  <Card.Title className="text-lg font-bold text-foreground flex items-center gap-2">
                    <UserPlus size={20} className="text-default-400" />
                    Registrar Nuevo Empleado
                  </Card.Title>
                </Card.Header>
                <Card.Content>
                  <form onSubmit={handleCreateEmployee} className="flex flex-col gap-4">
                    <TextField name="regName" value={regName} onChange={setRegName} isRequired>
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                        Nombre Completo
                      </Label>
                      <Input placeholder="Ej. Juan Pérez" variant="secondary" />
                    </TextField>

                    <TextField name="regEmail" type="email" value={regEmail} onChange={setRegEmail} isRequired>
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                        Correo Electrónico
                      </Label>
                      <Input placeholder="juan.perez@empresa.com" variant="secondary" />
                    </TextField>

                    <TextField name="regPassword" type="password" value={regPassword} onChange={setRegPassword} isRequired>
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted">
                        Contraseña Inicial
                      </Label>
                      <Input placeholder="Mínimo 8 caracteres" variant="secondary" />
                    </TextField>

                    {regSuccess && (
                      <Alert status="success">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>Operación Exitosa</Alert.Title>
                          <Alert.Description>{regSuccess}</Alert.Description>
                        </Alert.Content>
                      </Alert>
                    )}

                    {regError && (
                      <Alert status="danger">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>Error de Registro</Alert.Title>
                          <Alert.Description>{regError}</Alert.Description>
                        </Alert.Content>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      className="w-full font-bold mt-2"
                    >
                      Guardar Empleado
                    </Button>
                  </form>
                </Card.Content>
              </Card>
            </div>

            {/* Tabla / Lista de Empleados */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <Card variant="default">
                <Card.Header className="pb-4">
                  <Card.Title className="text-lg font-bold text-foreground">
                    Lista de Personal Registrado
                  </Card.Title>
                </Card.Header>
                <Card.Content>
                  <Table variant="secondary">
                    <Table.ScrollContainer>
                      <Table.Content aria-label="Lista de Empleados" className="min-w-[600px]">
                        <Table.Header>
                          <Table.Column isRowHeader>Nombre</Table.Column>
                          <Table.Column>Email</Table.Column>
                          <Table.Column className="text-center">Biometría</Table.Column>
                          <Table.Column className="text-right">Acciones</Table.Column>
                        </Table.Header>
                        <Table.Body>
                          {employees.map((emp) => (
                            <Table.Row key={emp.id} id={emp.id}>
                              <Table.Cell className="font-semibold text-foreground py-3">{emp.name}</Table.Cell>
                              <Table.Cell className="text-muted py-3">{emp.email}</Table.Cell>
                              <Table.Cell className="text-center py-3">
                                {emp.faceRegistered ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/45 border border-emerald-900/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                                    <ShieldCheck size={12} />
                                    Registrado
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-default border border-default-200 px-2.5 py-0.5 text-xs font-semibold text-muted">
                                    Incompleto
                                  </span>
                                )}
                              </Table.Cell>
                              <Table.Cell className="text-right py-3">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    onPress={() => startFaceRegistration(emp)}
                                    variant="secondary"
                                    size="sm"
                                    isDisabled={emp.faceRegistered}
                                    title={emp.faceRegistered ? 'Biometría ya registrada' : 'Registrar biometría'}
                                  >
                                    <Camera size={14} />
                                    Registrar Biometría
                                  </Button>
                                  <Button
                                    onPress={() => setUserToDelete(emp)}
                                    variant="danger"
                                    size="sm"
                                    isIconOnly
                                    isDisabled={emp.role === 'admin'}
                                    aria-label={emp.role === 'admin' ? "No se puede eliminar un administrador" : "Eliminar Empleado"}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                </Card.Content>
              </Card>
            </div>
          </div>
        ) : (
          /* Consola de Auditoría */
          <div className="flex flex-col gap-6">
            {/* Métricas de Auditoría */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card variant="secondary">
                <Card.Header className="p-0">
                  <Card.Description className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Total Logs</Card.Description>
                </Card.Header>
                <Card.Content className="p-0">
                  <h3 className="m-0 text-3xl font-extrabold text-foreground">
                    {auditLogs.length}
                  </h3>
                </Card.Content>
              </Card>
              <Card variant="secondary">
                <Card.Header className="p-0">
                  <Card.Description className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Accesos Exitosos</Card.Description>
                </Card.Header>
                <Card.Content className="p-0">
                  <h3 className="m-0 text-3xl font-extrabold text-emerald-400">
                    {auditLogs.filter((l) => l.action === 'biometric_match_success' || l.action === 'door_opened').length}
                  </h3>
                </Card.Content>
              </Card>
              <Card variant="secondary">
                <Card.Header className="p-0">
                  <Card.Description className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Anomalías / Fallos</Card.Description>
                </Card.Header>
                <Card.Content className="p-0">
                  <h3 className="m-0 text-3xl font-extrabold text-red-400">
                    {auditLogs.filter((l) => l.action === 'biometric_match_failed' || l.action === 'door_open_failed').length}
                  </h3>
                </Card.Content>
              </Card>
            </div>

            {/* Tabla de Logs */}
            <Card variant="default">
              <Card.Header className="pb-4">
                <Card.Title className="text-lg font-bold text-foreground">
                  Historial de Auditoría en Tiempo Real
                </Card.Title>
              </Card.Header>
              <Card.Content>
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Historial de Auditoría" className="min-w-[800px]">
                      <Table.Header>
                        <Table.Column isRowHeader>Timestamp</Table.Column>
                        <Table.Column>Acción</Table.Column>
                        <Table.Column>Usuario Relacionado</Table.Column>
                        <Table.Column>IP / Origen</Table.Column>
                        <Table.Column className="text-right">Detalles / Latencia</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {auditLogs.map((log) => (
                          <Table.Row key={log.id} id={log.id}>
                            <Table.Cell className="text-xs text-muted py-3.5">
                              {new Date(log.createdAt).toLocaleString('es-ES')}
                            </Table.Cell>
                            <Table.Cell className="py-3.5">{getActionBadge(log.action)}</Table.Cell>
                            <Table.Cell className="font-semibold text-foreground py-3.5">
                              {log.user ? (
                                <div className="flex flex-col">
                                  <span>{log.user.name}</span>
                                  <span className="text-[10px] text-muted font-normal">{log.user.email}</span>
                                </div>
                              ) : (
                                <span className="text-muted font-normal">Acción del Sistema</span>
                              )}
                            </Table.Cell>
                            <Table.Cell className="font-mono text-xs text-muted py-3.5">
                              {log.ipAddress || '127.0.0.1'}
                            </Table.Cell>
                            <Table.Cell className="text-right text-xs py-3.5">
                              {log.details?.latency_ms ? (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-default-100 bg-default px-2.5 py-0.5 text-muted font-mono">
                                  <Clock size={11} />
                                  {parseFloat(log.details.latency_ms).toFixed(1)} ms
                                </span>
                              ) : log.details?.samples_count ? (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-default-100 bg-default px-2.5 py-0.5 text-muted">
                                  {log.details.samples_count} capturas
                                </span>
                              ) : (
                                <span className="text-default-400">N/A</span>
                              )}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              </Card.Content>
            </Card>
          </div>
        )}
      </div>

      {/* Modal de Enrolamiento Facial con auto-captura por pose */}
      <Modal
        isOpen={selectedUserForFace !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeFaceRegistration()
        }}
      >
        <Modal.Backdrop variant="blur" className="bg-zinc-950/80">
          <Modal.Container size="lg" placement="center" className="text-left">
            <Modal.Dialog className="border border-zinc-800 bg-zinc-900 shadow-2xl rounded-3xl">
              <Modal.CloseTrigger />
              <Modal.Header className="border-b border-zinc-800 pb-3">
                <Modal.Heading className="text-lg font-bold text-zinc-100 m-0">
                  Registrar Biometría - {selectedUserForFace?.name}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="pt-4">
                {selectedUserForFace && (
                  <FaceEnrollment
                    key={selectedUserForFace.id}
                    userId={selectedUserForFace.id}
                    onSuccess={handleFaceRegistrationSuccess}
                    onCancel={closeFaceRegistration}
                  />
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Modal de Confirmación de Eliminación Nativo */}
      <Modal
        isOpen={userToDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setUserToDelete(null)
        }}
      >
        <Modal.Backdrop variant="blur" className="bg-zinc-950/80">
          <Modal.Container size="sm" placement="center" className="text-left">
            <Modal.Dialog className="border border-zinc-800 bg-zinc-900 shadow-2xl rounded-3xl">
              <Modal.CloseTrigger />
              <Modal.Header className="border-b border-zinc-800 pb-3">
                <Modal.Heading className="text-lg font-bold text-zinc-100 flex items-center gap-2 m-0">
                  <AlertTriangle className="text-amber-500" size={20} />
                  Confirmar Eliminación
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="pt-4">
                <p className="text-sm text-zinc-300">
                  ¿Estás completamente seguro de que deseas eliminar permanentemente al empleado{' '}
                  <strong className="text-zinc-100">{userToDelete?.name}</strong>?
                </p>
                <p className="text-xs text-red-500 mt-2">
                  Esta acción no se puede deshacer y revocará todos sus accesos biométricos de inmediato.
                </p>
              </Modal.Body>
              <Modal.Footer className="mt-6 flex justify-end gap-3 border-t border-zinc-800 pt-3">
                <Button
                  onPress={() => setUserToDelete(null)}
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button
                  onPress={() => {
                    if (userToDelete) {
                      deleteEmployeeMutation.mutate(userToDelete.id)
                      setUserToDelete(null)
                    }
                  }}
                  variant="danger"
                  className="font-bold"
                >
                  Eliminar Empleado
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </main>
  )
}
