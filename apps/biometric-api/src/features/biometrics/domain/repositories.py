from collections.abc import Sequence

from hexcore.domain.repositories import IBaseRepository

from ..domain.entities import FaceBiometric


class IUserFaceRepository(IBaseRepository):
    """Repositorio concreto para biometría."""
    async def get_by_vector(
        self, embedding: Sequence[float], threshold: float = 0.45
    ) -> FaceBiometric:
        """Busca biométricas similares a un vector dado."""
        raise NotImplementedError