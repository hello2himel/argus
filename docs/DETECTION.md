# VRX-1 detection (v1.0.0)
Indices: NDVI=(B08-B04)/(B08+B04), NDMI=(B08-B11)/(B08+B11), NDBI=(B11-B08)/(B11+B08), NDWI=(B03-B08)/(B03+B08), MNDWI=(B03-B11)/(B03+B11), BSI=((B11+B04)-(B08+B02))/((B11+B04)+(B08+B02)). DN->reflectance: (DN-1000)/10000 post-2022 baseline, DN=0 nodata.
Masks: SCL strict clear={4,5,6}, relaxed adds {2,7}; dilate cloud/shadow 1px; valid_fraction<0.4 or n_clear<3 => GRAY.
Change: pixel-wise median composites, deltas, binary masks (veg_loss dNDVI<-0.15 & base>0.3; built dNDBI>0.12; bare dBSI>0.1; water dMNDWI>0.2), opening, connected components (skimage, connectivity 2), drop <50px (0.5ha).
Alerts: RED total>=5ha or region>=2ha; AMBER >=0.5ha; GREEN below; GRAY when blind. Thresholds in result JSON, tunable per site.
