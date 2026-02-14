from __future__ import annotations

import os
import socket
import platform as py_platform
from datetime import datetime, timezone
from typing import Dict, List

import psutil
from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "visualdisk.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

Base = declarative_base()


class Snapshot(Base):
	__tablename__ = "snapshots"

	id = Column(Integer, primary_key=True)
	created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
	hostname = Column(String, nullable=False)
	platform = Column(String, nullable=False)
	cpu_percent = Column(Float, nullable=False)
	mem_total = Column(Integer, nullable=False)
	mem_used = Column(Integer, nullable=False)
	mem_free = Column(Integer, nullable=False)
	mem_percent = Column(Float, nullable=False)
	swap_total = Column(Integer, nullable=False)
	swap_used = Column(Integer, nullable=False)
	swap_free = Column(Integer, nullable=False)
	swap_percent = Column(Float, nullable=False)
	boot_time = Column(Integer, nullable=False)

	disks = relationship("DiskSnapshot", back_populates="snapshot", cascade="all, delete-orphan")


class DiskSnapshot(Base):
	__tablename__ = "disk_snapshots"

	id = Column(Integer, primary_key=True)
	snapshot_id = Column(Integer, ForeignKey("snapshots.id"), nullable=False)
	device = Column(String, nullable=False)
	mountpoint = Column(String, nullable=False)
	fstype = Column(String, nullable=False)
	total = Column(Integer, nullable=False)
	used = Column(Integer, nullable=False)
	free = Column(Integer, nullable=False)
	percent = Column(Float, nullable=False)
	read_bytes = Column(Integer, nullable=True)
	write_bytes = Column(Integer, nullable=True)

	snapshot = relationship("Snapshot", back_populates="disks")


engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
	Base.metadata.create_all(engine)


def get_disk_io() -> Dict[str, Dict[str, int]]:
	io_counters = psutil.disk_io_counters(perdisk=True) or {}
	io_map: Dict[str, Dict[str, int]] = {}
	for device, counters in io_counters.items():
		io_map[device] = {
			"read_bytes": int(counters.read_bytes),
			"write_bytes": int(counters.write_bytes),
		}
	return io_map


def collect_system_metrics() -> Dict[str, object]:
	hostname = socket.gethostname()
	platform_info = py_platform.platform()
	cpu_percent = psutil.cpu_percent(interval=0.2)
	mem = psutil.virtual_memory()
	swap = psutil.swap_memory()
	boot_time = int(psutil.boot_time())

	io_map = get_disk_io()
	disks: List[Dict[str, object]] = []
	for part in psutil.disk_partitions(all=False):
		try:
			usage = psutil.disk_usage(part.mountpoint)
		except PermissionError:
			continue

		io_stats = io_map.get(part.device, {})
		disks.append(
			{
				"device": part.device,
				"mountpoint": part.mountpoint,
				"fstype": part.fstype,
				"total": int(usage.total),
				"used": int(usage.used),
				"free": int(usage.free),
				"percent": float(usage.percent),
				"read_bytes": int(io_stats.get("read_bytes", 0)),
				"write_bytes": int(io_stats.get("write_bytes", 0)),
			}
		)

	return {
		"timestamp": int(datetime.now(timezone.utc).timestamp()),
		"hostname": hostname,
		"platform": platform_info,
		"cpu_percent": float(cpu_percent),
		"memory": {
			"total": int(mem.total),
			"used": int(mem.used),
			"free": int(mem.available),
			"percent": float(mem.percent),
		},
		"swap": {
			"total": int(swap.total),
			"used": int(swap.used),
			"free": int(swap.free),
			"percent": float(swap.percent),
		},
		"boot_time": boot_time,
		"disks": disks,
	}


def persist_snapshot(metrics: Dict[str, object]) -> int:
	session = SessionLocal()
	try:
		snapshot = Snapshot(
			hostname=str(metrics["hostname"]),
			platform=str(metrics["platform"]),
			cpu_percent=float(metrics["cpu_percent"]),
			mem_total=int(metrics["memory"]["total"]),
			mem_used=int(metrics["memory"]["used"]),
			mem_free=int(metrics["memory"]["free"]),
			mem_percent=float(metrics["memory"]["percent"]),
			swap_total=int(metrics["swap"]["total"]),
			swap_used=int(metrics["swap"]["used"]),
			swap_free=int(metrics["swap"]["free"]),
			swap_percent=float(metrics["swap"]["percent"]),
			boot_time=int(metrics["boot_time"]),
		)
		for disk in metrics["disks"]:
			snapshot.disks.append(
				DiskSnapshot(
					device=str(disk["device"]),
					mountpoint=str(disk["mountpoint"]),
					fstype=str(disk["fstype"]),
					total=int(disk["total"]),
					used=int(disk["used"]),
					free=int(disk["free"]),
					percent=float(disk["percent"]),
					read_bytes=int(disk.get("read_bytes", 0)),
					write_bytes=int(disk.get("write_bytes", 0)),
				)
			)

		session.add(snapshot)
		session.commit()
		return int(snapshot.id)
	finally:
		session.close()


def find_free_port(start_port=5000):
    """Find an available port starting from start_port."""
    port = start_port
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("localhost", port)) != 0:
                return port
            port += 1

def create_app() -> Flask:
	app = Flask(__name__)
	CORS(app, resources={r"/api/*": {"origins": "*"}})

	init_db()

	@app.get("/api/health")
	def health() -> tuple:
		return jsonify({"status": "ok"}), 200

	@app.get("/api/system")
	def system_metrics() -> tuple:
		metrics = collect_system_metrics()
		return jsonify(metrics), 200

	@app.post("/api/snapshots")
	def create_snapshot() -> tuple:
		metrics = collect_system_metrics()
		snapshot_id = persist_snapshot(metrics)
		metrics["snapshot_id"] = snapshot_id
		return jsonify(metrics), 201

	@app.get("/api/snapshots")
	def list_snapshots() -> tuple:
		limit = int(request.args.get("limit", 10))
		session = SessionLocal()
		try:
			query = session.query(Snapshot).order_by(Snapshot.created_at.desc()).limit(limit)
			snapshots = []
			for snapshot in query:
				snapshots.append(
					{
						"id": snapshot.id,
						"created_at": snapshot.created_at.isoformat(),
						"hostname": snapshot.hostname,
						"platform": snapshot.platform,
						"cpu_percent": snapshot.cpu_percent,
						"memory": {
							"total": snapshot.mem_total,
							"used": snapshot.mem_used,
							"free": snapshot.mem_free,
							"percent": snapshot.mem_percent,
						},
						"swap": {
							"total": snapshot.swap_total,
							"used": snapshot.swap_used,
							"free": snapshot.swap_free,
							"percent": snapshot.swap_percent,
						},
						"boot_time": snapshot.boot_time,
						"disks": [
							{
								"device": disk.device,
								"mountpoint": disk.mountpoint,
								"fstype": disk.fstype,
								"total": disk.total,
								"used": disk.used,
								"free": disk.free,
								"percent": disk.percent,
								"read_bytes": disk.read_bytes,
								"write_bytes": disk.write_bytes,
							}
							for disk in snapshot.disks
						],
					}
				)
			return jsonify({"snapshots": snapshots}), 200
		finally:
			session.close()

	@app.route("/api/port")
	def get_port():
		return jsonify({"port": app.config.get("SERVER_PORT", 5000)})

	return app


if __name__ == "__main__":
	port = find_free_port()
	app = create_app()
	app.config["SERVER_PORT"] = port
	app.run(host="0.0.0.0", port=port, debug=True)
