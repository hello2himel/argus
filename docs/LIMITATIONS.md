# Limitations
- 10m pixels (100m2); single-pixel change unreliable (geolocation ~12m). Practical minimum ~0.5ha contiguous.
- Misses small buildings, narrow strips, selective logging (<40-60% crown loss).
- False positives: monsoon clouds/shadows, paddy phenology/harvest, floods (NDVI drop = water), dry sediment vs built-up.
- Mitigations: SCL masking, dry-season baselines, multi-date medians, SAR cross-check. Never auto-label illegality.
- Demo polygons are NOT Forest Dept / BWDB legal boundaries. River waterline != legal foreshore (Writ 3503/2009; CS/RS maps required).
