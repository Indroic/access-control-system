class FaceBiometricNotFound(Exception):
    """Excepción personalizada para cuando no se encuentra un rostro biométrico."""
    def __init__(self, message="No se encontró la firma biométrica"):
        self.message = message
        super().__init__(self.message)