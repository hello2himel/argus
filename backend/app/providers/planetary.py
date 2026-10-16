"""Microsoft Planetary Computer STAC provider (Sentinel-2 L2A primary).

Real implementation using pystac-client + planetary-computer signing.
Works with no API key for metadata search; blob reads need SAS tokens
(obtained automatically via planetary_computer.sign_inplace).
Handles throttling / missing assets explicitly — never fabricates scenes.
"""
from __future__ import annotations

from typing import Any

from .base import ImageryProvider, Observation, SearchResult

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-2-l2a"


class PlanetaryProvider(ImageryProvider):
    name = "planetary-computer"

    def __init__(self, stac_url: str = STAC_URL, collection: str = COLLECTION):
        self.stac_url = stac_url
        self.collection = collection

    def status(self) -> dict[str, Any]:
        try:
            import requests
            r = requests.get(f"{self.stac_url}/collections/{self.collection}", timeout=15)
            if r.status_code == 200:
                j = r.json()
                return {"provider": self.name, "ok": True, "stac": self.stac_url,
                        "collection": self.collection,
                        "title": j.get("title", "")[:120]}
            return {"provider": self.name, "ok": False, "http": r.status_code}
        except Exception as e:  # offline / throttled
            return {"provider": self.name, "ok": False, "error": str(e)[:300]}

    def search(self, bbox, start, end, max_cloud: float = 30.0, limit: int = 50) -> SearchResult:
        try:
            import pystac_client
            try:
                import planetary_computer
                modifier = planetary_computer.sign_inplace
            except Exception:
                modifier = None
            kwargs: dict[str, Any] = {}
            if modifier is not None:
                kwargs["modifier"] = modifier
            catalog = pystac_client.Client.open(self.stac_url, **kwargs)
            search = catalog.search(
                collections=[self.collection],
                bbox=list(bbox),
                datetime=f"{start}/{end}",
                query={"eo:cloud_cover": {"lt": float(max_cloud)}},
                limit=int(limit),
            )
            items = list(search.items())
            obs: list[Observation] = []
            for it in items:
                assets: dict[str, str] = {}
                for k in ("B02", "B03", "B04", "B08", "B11", "B12", "SCL", "visual"):
                    a = it.assets.get(k)
                    if a is not None:
                        assets[k] = a.href
                obs.append(Observation(
                    provider=self.name, collection=self.collection,
                    product_id=it.id, acquired=str(it.datetime) if it.datetime else "",
                    cloud_cover=(it.properties or {}).get("eo:cloud_cover"),
                    assets=assets,
                    bbox=list(it.bbox) if it.bbox else [],
                    extra={"_stac_self": it.self_href} if getattr(it, "self_href", None) else {},
                ))
            return SearchResult(obs, self.name, {"bbox": bbox, "start": start, "end": end})
        except Exception as e:
            # Never fabricate: return empty + error recorded in query
            return SearchResult([], self.name,
                                {"bbox": bbox, "start": start, "end": end,
                                 "error": str(e)[:500]})
