"""Provider abstraction. All satellite access goes through here."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Observation:
    provider: str
    collection: str
    product_id: str
    acquired: str  # ISO8601
    cloud_cover: float | None = None
    assets: dict = field(default_factory=dict)  # band -> href
    bbox: list[float] = field(default_factory=list)
    extra: dict = field(default_factory=dict)


@dataclass
class SearchResult:
    observations: list[Observation]
    provider: str
    query: dict = field(default_factory=dict)


class ImageryProvider:
    name = "base"

    def search(self, bbox: tuple[float, float, float, float], start: str, end: str,
               max_cloud: float = 30.0, limit: int = 50) -> SearchResult:
        raise NotImplementedError

    def status(self) -> dict[str, Any]:
        return {"provider": self.name, "ok": True}
