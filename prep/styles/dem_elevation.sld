<?xml version="1.0" encoding="UTF-8"?>
<!--
  Hypsometric elevation ramp tuned for the AOI (~400-2,300 m).
  Colours follow standard cartographic conventions: green low, tan/brown mid,
  purple/white high. Nodata (-32767) is declared in the raster and drawn
  transparent by GeoServer.
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>dem_elevation</Name>
    <UserStyle>
      <Title>Elevation (m)</Title>
      <FeatureTypeStyle>
        <Rule>
          <RasterSymbolizer>
            <Opacity>0.85</Opacity>
            <ColorMap type="ramp">
              <ColorMapEntry color="#1a9850" quantity="300"  label="300 m"/>
              <ColorMapEntry color="#66bd63" quantity="500"/>
              <ColorMapEntry color="#a6d96a" quantity="700"/>
              <ColorMapEntry color="#d9ef8b" quantity="900"/>
              <ColorMapEntry color="#fee08b" quantity="1100"/>
              <ColorMapEntry color="#f8b47c" quantity="1300"/>
              <ColorMapEntry color="#e08063" quantity="1500"/>
              <ColorMapEntry color="#c85b4d" quantity="1700"/>
              <ColorMapEntry color="#9e5566" quantity="1900"/>
              <ColorMapEntry color="#7f5487" quantity="2100"/>
              <ColorMapEntry color="#e6e6f2" quantity="2300" label="2300 m"/>
            </ColorMap>
          </RasterSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
