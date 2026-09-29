<?xml version="1.0" encoding="UTF-8"?>
<!--
  Greyscale hillshade meant to be drawn UNDER the DEM colour ramp with low
  opacity (or with multiply blend on the client). Nodata (0) is transparent.
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>hillshade</Name>
    <UserStyle>
      <Title>Hillshade</Title>
      <FeatureTypeStyle>
        <Rule>
          <RasterSymbolizer>
            <Opacity>0.6</Opacity>
            <ChannelSelection>
              <GrayChannel>
                <SourceChannelName>1</SourceChannelName>
                <ContrastEnhancement>
                  <Normalize>
                    <VendorOption name="algorithm">StretchToMinimumMaximum</VendorOption>
                    <VendorOption name="minValue">0</VendorOption>
                    <VendorOption name="maxValue">254</VendorOption>
                  </Normalize>
                </ContrastEnhancement>
              </GrayChannel>
            </ChannelSelection>
          </RasterSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
