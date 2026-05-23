from sqlalchemy import Column, String, JSON
from hexcore.infrastructure.repositories.orms.sqlalchemy import BaseModel


class BiometricAuditLogModel(BaseModel):
    """Modelo ORM SQLAlchemy para la tabla de auditoría."""

    __tablename__ = "biometric_audit_log"

    user_id = Column(String, nullable=True)
    action = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    details = Column(JSON, nullable=False, default=dict)
