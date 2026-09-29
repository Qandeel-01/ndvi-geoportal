<?xml version="1.0" encoding="UTF-8"?>
<!--
  1.9M sample points, coloured continuously by their NDVI value.
  * Fill colour: Interpolate() over NDVI, same palette as the NDVI raster.
  * Size depends on map scale (Categorize on wms_scale_denominator), so points
    stay readable when zoomed in and do not become a solid blob when zoomed out.
  * No stroke: at this volume, skipping the outline noticeably speeds rendering.
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>points_ndvi</Name>
    <UserStyle>
      <Title>Sample points by NDVI</Title>
      <FeatureTypeStyle>
        <Rule>
          <Title>Sample point (colour = NDVI)</Title>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill>
                  <CssParameter name="fill">
                    <ogc:Function name="Interpolate">
                      <ogc:PropertyName>ndvi</ogc:PropertyName>
                      <ogc:Literal>-0.2</ogc:Literal><ogc:Literal>#2c7bb6</ogc:Literal>
                      <ogc:Literal>0.1</ogc:Literal><ogc:Literal>#d7a86e</ogc:Literal>
                      <ogc:Literal>0.25</ogc:Literal><ogc:Literal>#fee08b</ogc:Literal>
                      <ogc:Literal>0.45</ogc:Literal><ogc:Literal>#a6d96a</ogc:Literal>
                      <ogc:Literal>0.65</ogc:Literal><ogc:Literal>#1a9641</ogc:Literal>
                      <ogc:Literal>0.85</ogc:Literal><ogc:Literal>#00441b</ogc:Literal>
                      <ogc:Literal>color</ogc:Literal>
                    </ogc:Function>
                  </CssParameter>
                </Fill>
              </Mark>
              <Size>
                <!-- scale < 25k: 7px, 25k-150k: 4px, > 150k: 2px -->
                <ogc:Function name="Categorize">
                  <ogc:Function name="env">
                    <ogc:Literal>wms_scale_denominator</ogc:Literal>
                  </ogc:Function>
                  <ogc:Literal>7</ogc:Literal>
                  <ogc:Literal>25000</ogc:Literal>
                  <ogc:Literal>4</ogc:Literal>
                  <ogc:Literal>150000</ogc:Literal>
                  <ogc:Literal>2</ogc:Literal>
                </ogc:Function>
              </Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
