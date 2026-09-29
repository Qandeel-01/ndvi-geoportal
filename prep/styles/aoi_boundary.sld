<?xml version="1.0" encoding="UTF-8"?>
<!--
  Thin pale outline for the AOI polygon. No fill so raster layers remain visible.
  The web UI also draws the AOI client-side (with a marching-dash animation),
  so this style is mainly there for GeoServer's own preview / GetLegend calls.
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>aoi_boundary</Name>
    <UserStyle>
      <Title>AOI boundary</Title>
      <FeatureTypeStyle>
        <Rule>
          <PolygonSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#a8d4e0</CssParameter>
              <CssParameter name="stroke-width">1.4</CssParameter>
              <CssParameter name="stroke-opacity">0.9</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
