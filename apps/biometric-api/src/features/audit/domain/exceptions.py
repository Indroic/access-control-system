class AuditLogNotFound(Exception):
    """Excepción para cuando no se encuentra un registro de auditoría."""

    def __init__(self, message="No se encontró el registro de auditoría"):
        self.message = message
        super().__init__(self.message)
