from sqlalchemy import Column, String
from pgvector.sqlalchemy import Vector
from hexcore.infrastructure.repositories.orms.sqlalchemy import BaseModel

class UserFaceModel(BaseModel):
    """Modelo de base de datos para pgvector."""

    __tablename__ = "user_faces"

    user_id: Column[str] = Column(String, nullable=False, index=True)
    embedding: Column[Vector] = Column(Vector(512))
