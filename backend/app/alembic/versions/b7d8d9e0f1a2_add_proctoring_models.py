"""Add proctoring models

Revision ID: b7d8d9e0f1a2
Revises: ab3c8f4d2e10
Create Date: 2026-06-23 18:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = "b7d8d9e0f1a2"
down_revision = "ab3c8f4d2e10"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "room",
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column(
            "mediasoup_router_id",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_room_mediasoup_router_id"), "room", ["mediasoup_router_id"], unique=True)

    op.create_table(
        "roomparticipant",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "mediasoup_send_transport_id",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column(
            "webcam_producer_id",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column(
            "audio_producer_id",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column(
            "screen_producer_id",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roomparticipant_room_id"), "roomparticipant", ["room_id"], unique=False)
    op.create_index(op.f("ix_roomparticipant_user_id"), "roomparticipant", ["user_id"], unique=False)

    op.create_table(
        "staffmonitor",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("staff_user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "mediasoup_recv_transport_id",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["room_id"], ["room.id"]),
        sa.ForeignKeyConstraint(["staff_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_staffmonitor_room_id"), "staffmonitor", ["room_id"], unique=False)
    op.create_index(op.f("ix_staffmonitor_staff_user_id"), "staffmonitor", ["staff_user_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_staffmonitor_staff_user_id"), table_name="staffmonitor")
    op.drop_index(op.f("ix_staffmonitor_room_id"), table_name="staffmonitor")
    op.drop_table("staffmonitor")

    op.drop_index(op.f("ix_roomparticipant_user_id"), table_name="roomparticipant")
    op.drop_index(op.f("ix_roomparticipant_room_id"), table_name="roomparticipant")
    op.drop_table("roomparticipant")

    op.drop_index(op.f("ix_room_mediasoup_router_id"), table_name="room")
    op.drop_table("room")
