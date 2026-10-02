# H36_Combo
H36 Combo V1 is a newly designed 125℃ high temperature tool board Based on STMG0B1T3.

> [!IMPORTANT] 
>- Since there is no 125 degree Celsius USB-HUB chip, the 125 degree Celsius operating environment is limited to CANBUS mode；
>- Klipper currently does not support 125 degree Celsius accelerometers, so the 125 degree Celsius operating environment does not include accelerometers. The default version of H36 is ADXL345, which has a maximum operating temperature of 85 degrees Celsius. The 105 degree Celsius ADXL345-EP version is optional, but it is more expensive.

V1.1

1.add Driver NTC

2.add 3.3V/5v monitor

3.add 24v monitor

\-------------------------------------

V1.2

1.change to XT30

2.add reserve protection

3.fix can/usb indicate

\-------------------------------------

V1.3 (Currently Available)

> [!NOTE]
> V1.3 only makes hardware changes and does not affect any software configuration.

1.Add level_shift to FAN_TACH

2.Fix silk mark

3.Add jumper resistor from USB-C to STM32

4.ADXL345-EP optional

5.Change the LDO chip to TLV75733

6.New mass-produced cables（Mold Forming）

