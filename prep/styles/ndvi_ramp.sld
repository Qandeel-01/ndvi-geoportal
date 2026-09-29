<?xml version="1.0" encoding="UTF-8"?>
<!--
  NDVI colour ramp (ColorBrewer RdYlGn-style, diverging around bare soil).
  Water/negative -> blue, bare & built-up -> tan, sparse -> yellow,
  dense vegetation -> dark green. Cloud / no-data pixels (-9999) are declared
  as NoData in the GeoTIFF, so GeoServer renders them transparent.
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>ndvi_ramp</Name>
    <UserStyle>
      <Title>NDVI</Title>
      <FeatureTypeStyle>
        <Rule>
          <RasterSymbolizer>
            <Opacity>1.0</Opacity>
            <ColorMap type="ramp">
              <ColorMapEntry color="#2c7bb6" quantity="-1.0" label="Water (&lt; 0)"/>
              <ColorMapEntry color="#2c7bb6" quantity="-0.2"/>
              <ColorMapEntry color="#abd9e9" quantity="0.0"/>
              <ColorMapEntry color="#d7a86e" quantity="0.1" label="Bare / built-up"/>
              <ColorMapEntry color="#fee08b" quantity="0.25" label="Sparse vegetation"/>
              <ColorMapEntry color="#a6d96a" quantity="0.45" label="Moderate vegetation"/>
              <ColorMapEntry color="#1a9641" quantity="0.65"/>
              <ColorMapEntry color="#00441b" quantity="0.85" label="Dense vegetation"/>
            </ColorMap>
          </RasterSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
