from collections.abc import Sequence
from sqlalchemy import select
from hexcore.infrastructure.repositories.utils import to_entity_from_model_or_document
from hexcore.infrastructure.repositories.implementations import (
    SQLAlchemyCommonImplementationsRepo,
)

from src.shared.infrastructure.database.models import UserFaceModel
from ..domain.entities import FaceBiometric
from ..domain.exceptions import FaceBiometricNotFound
from ..domain.repositories import IUserFaceRepository


class UserFaceRepository(
    SQLAlchemyCommonImplementationsRepo[FaceBiometric, UserFaceModel],
    IUserFaceRepository,
):
    """Repositorio concreto para biometría."""

    @property
    def entity_cls(self):
        return FaceBiometric

    @property
    def model_cls(self):
        return UserFaceModel

    @property
    def not_found_exception(self):
        return FaceBiometricNotFound

    async def get_by_vector(
        self, embedding: Sequence[float], threshold: float = 0.45
    ) -> FaceBiometric:
        """
        Busca la biométrica más cercana a un vector dado usando la distancia de coseno y aplicando el umbral.
        Retorna la entidad mapeada o lanza una excepción si no superan el umbral o no hay registros.
        """
        # Distancia de coseno máxima permitida = 1.0 - similitud_mínima (threshold)
        max_cosine_distance = 1.0 - threshold

        stmt = (
            select(self.model_cls)
            .where(self.model_cls.embedding.cosine_distance(embedding) <= max_cosine_distance)
            .order_by(self.model_cls.embedding.cosine_distance(embedding))
            .limit(1)
        )

        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()

        if instance:
            return await to_entity_from_model_or_document(instance, self.entity_cls)

        raise self.not_found_exception()
