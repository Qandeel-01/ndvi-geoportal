<?xml version="1.0" encoding="UTF-8"?>
<!--
  True-colour display of the 3-band reflectance raster (values = reflectance x 10000).
  Surface reflectance of land is mostly 0-0.3, so each band is linearly
  stretched from 0-3000 to the full 0-255 display range. Without the stretch
  the image would look almost black.
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>rgb_stretch</Name>
    <UserStyle>
      <Title>Sentinel-2 true colour (0-3000 stretch)</Title>
      <FeatureTypeStyle>
        <Rule>
          <RasterSymbolizer>
            <Opacity>1.0</Opacity>
            <ChannelSelection>
              <RedChannel>
                <SourceChannelName>1</SourceChannelName>
                <ContrastEnhancement>
                  <Normalize>
                    <VendorOption name="algorithm">StretchToMinimumMaximum</VendorOption>
                    <VendorOption name="minValue">0</VendorOption>
                    <VendorOption name="maxValue">3000</VendorOption>
                  </Normalize>
                </ContrastEnhancement>
              </RedChannel>
              <GreenChannel>
                <SourceChannelName>2</SourceChannelName>
                <ContrastEnhancement>
                  <Normalize>
                    <VendorOption name="algorithm">StretchToMinimumMaximum</VendorOption>
                    <VendorOption name="minValue">0</VendorOption>
                    <VendorOption name="maxValue">3000</VendorOption>
                  </Normalize>
                </ContrastEnhancement>
              </GreenChannel>
              <BlueChannel>
                <SourceChannelName>3</SourceChannelName>
                <ContrastEnhancement>
                  <Normalize>
                    <VendorOption name="algorithm">StretchToMinimumMaximum</VendorOption>
                    <VendorOption name="minValue">0</VendorOption>
                    <VendorOption name="maxValue">3000</VendorOption>
                  </Normalize>
                </ContrastEnhancement>
              </BlueChannel>
            </ChannelSelection>
          </RasterSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
