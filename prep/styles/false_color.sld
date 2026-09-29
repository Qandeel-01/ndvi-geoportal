<?xml version="1.0" encoding="UTF-8"?>
<!--
  False-colour composite: NIR -> Red, Red -> Green, Green -> Blue.
  Vegetation shows up bright red, water dark blue, urban grey.
  Same 0-3000 stretch as the true-colour style for visual consistency.
  Band order relies on the 4-band RGB COG produced by process.py:
  (band 1 = red, 2 = green, 3 = blue, 4 = NIR).
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>false_color</Name>
    <UserStyle>
      <Title>Sentinel-2 false colour (NIR-R-G)</Title>
      <FeatureTypeStyle>
        <Rule>
          <RasterSymbolizer>
            <Opacity>1.0</Opacity>
            <ChannelSelection>
              <RedChannel>
                <SourceChannelName>4</SourceChannelName>
                <ContrastEnhancement>
                  <Normalize>
                    <VendorOption name="algorithm">StretchToMinimumMaximum</VendorOption>
                    <VendorOption name="minValue">0</VendorOption>
                    <VendorOption name="maxValue">3000</VendorOption>
                  </Normalize>
                </ContrastEnhancement>
              </RedChannel>
              <GreenChannel>
                <SourceChannelName>1</SourceChannelName>
                <ContrastEnhancement>
                  <Normalize>
                    <VendorOption name="algorithm">StretchToMinimumMaximum</VendorOption>
                    <VendorOption name="minValue">0</VendorOption>
                    <VendorOption name="maxValue">3000</VendorOption>
                  </Normalize>
                </ContrastEnhancement>
              </GreenChannel>
              <BlueChannel>
                <SourceChannelName>2</SourceChannelName>
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
