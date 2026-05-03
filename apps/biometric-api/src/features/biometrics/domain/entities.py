from collections.abc import Sequence

from hexcore.domain.base import BaseEntity


class FaceBiometric(BaseEntity):
    """
    Entidad de dominio que representa la firma biométrica de un usuario.
    BaseEntity ya provee: id, created_at, updated_at, is_active.
    """

    user_id: str
    embedding: Sequence[float]  # Vector de 128 dimensiones
