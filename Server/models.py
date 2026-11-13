from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(
        String(100),
        nullable=False,
        default="Người dùng",
    )

    username = Column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )

    password = Column(
        String(255),
        nullable=False,
    )

    role = Column(
        String(20),
        nullable=False,
        default="user",
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.now,
    )

    face_profiles = relationship(
        "FaceProfile",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    created_qr_codes = relationship(
        "QRCode",
        back_populates="created_by",
        foreign_keys="QRCode.created_by_user_id",
    )

    access_logs = relationship(
        "AccessLog",
        back_populates="user",
        foreign_keys="AccessLog.user_id",
    )


class FaceProfile(Base):
    __tablename__ = "face_profiles"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    face_image = Column(
        String(500),
        nullable=True,
    )

    face_embedding = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.now,
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.now,
        onupdate=datetime.now,
    )

    user = relationship(
        "User",
        back_populates="face_profiles",
    )


class QRCode(Base):
    __tablename__ = "qr_codes"

    id = Column(Integer, primary_key=True, index=True)

    token = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )

    guest_name = Column(
        String(100),
        nullable=False,
        default="Khách",
    )

    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    used = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    used_at = Column(
        DateTime,
        nullable=True,
    )

    expired_at = Column(
        DateTime,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.now,
    )

    created_by = relationship(
        "User",
        back_populates="created_qr_codes",
        foreign_keys=[created_by_user_id],
    )

    access_logs = relationship(
        "AccessLog",
        back_populates="qr_code",
        foreign_keys="AccessLog.qr_id",
    )


class DoorStatus(Base):
    __tablename__ = "door_status"

    id = Column(Integer, primary_key=True, index=True)

    status = Column(
        String(20),
        nullable=False,
        default="closed",
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.now,
        onupdate=datetime.now,
    )


class AccessLog(Base):
    __tablename__ = "access_logs"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    qr_id = Column(
        Integer,
        ForeignKey("qr_codes.id"),
        nullable=True,
        index=True,
    )

    method = Column(
        String(30),
        nullable=False,
    )

    action = Column(
        String(30),
        nullable=False,
        default="ACCESS",
    )

    result = Column(
        String(20),
        nullable=False,
    )

    message = Column(
        String(500),
        nullable=False,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.now,
        index=True,
    )

    user = relationship(
        "User",
        back_populates="access_logs",
        foreign_keys=[user_id],
    )

    qr_code = relationship(
        "QRCode",
        back_populates="access_logs",
        foreign_keys=[qr_id],
    )


class DoorCommand(Base):
    __tablename__ = "door_commands"

    id = Column(Integer, primary_key=True, index=True)

    command = Column(
        String(30),
        nullable=False,
        default="NONE",
    )

    consumed = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.now,
    )