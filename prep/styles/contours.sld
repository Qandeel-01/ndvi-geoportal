<?xml version="1.0" encoding="UTF-8"?>
<!--
  Contour lines. Minor contours drawn thin, major contours (every 500 m)
  drawn thicker and labelled with the elevation. Labels follow the line
  (VendorOption followLine) so they look like a real topographic map.
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>contours</Name>
    <UserStyle>
      <Title>Contours</Title>
      <FeatureTypeStyle>
        <Rule>
          <Name>minor</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>major</ogc:PropertyName>
              <ogc:Literal>false</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#c0a37a</CssParameter>
              <CssParameter name="stroke-width">0.4</CssParameter>
              <CssParameter name="stroke-opacity">0.55</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
        <Rule>
          <Name>major</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>major</ogc:PropertyName>
              <ogc:Literal>true</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#8b6a3e</CssParameter>
              <CssParameter name="stroke-width">1.0</CssParameter>
              <CssParameter name="stroke-opacity">0.85</CssParameter>
            </Stroke>
          </LineSymbolizer>
          <TextSymbolizer>
            <Label>
              <ogc:PropertyName>elev</ogc:PropertyName>
            </Label>
            <Font>
              <CssParameter name="font-family">Sans-Serif</CssParameter>
              <CssParameter name="font-size">10</CssParameter>
              <CssParameter name="font-weight">bold</CssParameter>
            </Font>
            <Fill>
              <CssParameter name="fill">#5a4020</CssParameter>
            </Fill>
            <Halo>
              <Radius>1.5</Radius>
              <Fill><CssParameter name="fill">#ffffff</CssParameter></Fill>
            </Halo>
            <LabelPlacement>
              <LinePlacement/>
            </LabelPlacement>
            <VendorOption name="followLine">true</VendorOption>
            <VendorOption name="repeat">200</VendorOption>
            <VendorOption name="maxAngleDelta">30</VendorOption>
            <VendorOption name="autoWrap">80</VendorOption>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
