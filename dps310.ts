/**
 * Custom blocks
 */
//% weight=100 color=#0fbc11 icon="" block="気圧(DPS310)"
namespace IML_DPS310
{
    //% block
    //% block="気圧(Pa)"
    //% weight=100    
    export function GetPressure(): number {
        readData()
        return Math.round(scaledPress * 10) / 10
    }
    //% block
    //% block="温度(°C)"
    //% weight=99
    export function GetTemprature(): number {
        readData()
        return Math.round(scaledTemp * 10) / 10
    }


    let ADDRESS = 0x77;
    let PRESS_CONF = 0x71;
    let TEMP_CONF = 0xF0;
    let INT_AND_FIFO_CONF = 0x00;
    let OP_MODE = 0x07;
    let SCALE_FACTORS = [524288, 1572864, 3670016, 7864320, 253952, 516096, 1040384, 2088960];

    // Calibration coefficients
    let c0=0, c1=0, c00=0, c10=0, c01=0, c11=0, c20=0, c21=0, c30=0;

    // 2's complement conversion for calibration data
    function twosComplement(value:number, bits:number) {
        if (value & (1 << (bits - 1))) {
            value -= (1 << bits);
        }
        return value;
    }

    // Initialize DPS310 sensor
    function initializeDPS310() {
        pins.i2cWriteNumber(ADDRESS, (0x06 << 8) | PRESS_CONF, NumberFormat.UInt16BE);
        pins.i2cWriteNumber(ADDRESS, (0x07 << 8) | TEMP_CONF, NumberFormat.UInt16BE);
        pins.i2cWriteNumber(ADDRESS, (0x09 << 8) | INT_AND_FIFO_CONF, NumberFormat.UInt16BE);
        pins.i2cWriteNumber(ADDRESS, (0x08 << 8) | OP_MODE, NumberFormat.UInt16BE);
    }

    // Read calibration coefficients from DPS310
    function readCalibrationCoefficients() {
        pins.i2cWriteNumber(ADDRESS, 0x10, NumberFormat.UInt8BE);
        let coef = pins.i2cReadBuffer(ADDRESS, 18);

        c0 = twosComplement((coef[0] << 4) | (coef[1] >> 4), 12);
        c1 = twosComplement(((coef[1] & 0x0F) << 8) | coef[2], 12);
        c00 = twosComplement((coef[3] << 12) | (coef[4] << 4) | (coef[5] >> 4), 20);
        c10 = twosComplement(((coef[5] & 0x0F) << 16) | (coef[6] << 8) | coef[7], 20);
        c01 = twosComplement((coef[8] << 8) | coef[9], 16);
        c11 = twosComplement((coef[10] << 8) | coef[11], 16);
        c20 = twosComplement((coef[12] << 8) | coef[13], 16);
        c21 = twosComplement((coef[14] << 8) | coef[15], 16);
        c30 = twosComplement((coef[16] << 8) | coef[17], 16);
    }

    // Read 24-bit raw data from a register
    function read24BitData(register:number) {
        pins.i2cWriteNumber(ADDRESS, register, NumberFormat.UInt8BE);

        let msb = pins.i2cReadNumber(ADDRESS, NumberFormat.UInt8BE);
        let csb = pins.i2cReadNumber(ADDRESS, NumberFormat.UInt8BE);
        let lsb = pins.i2cReadNumber(ADDRESS, NumberFormat.UInt8BE);

        let rawData = (msb << 16) | (csb << 8) | lsb;
        rawData = twosComplement(rawData,24)
        return rawData;
    }

    // Calculate pressure using calibration coefficients
    function calculatePressure(rawP:number, rawT:number) {
        let prs = rawP / SCALE_FACTORS[1]
        let tmp = rawT / SCALE_FACTORS[0]
        prs = c00 + prs * (c10 + prs * (c20 + prs * c30)) +
            tmp * c01 + tmp * prs * (c11 + prs * c21)
        return prs;
    }
    // Calculate temperature using calibration coefficients
    function calculateTemperature(rawT: number) {
        let temp = rawT / SCALE_FACTORS[0]
        temp = c0 * 0.5 + c1 * temp;
        return temp;
    }

    let scaledTemp = 0
    let scaledPress = 0
    function readData() 
    {
        pins.i2cWriteNumber(ADDRESS, (0x08 << 8) | 0x02, NumberFormat.UInt16BE);
        let rawTemperature = read24BitData(0x03); // Replace 0x03 with actual register

        pins.i2cWriteNumber(ADDRESS, (0x08 << 8) | 0x01, NumberFormat.UInt16BE);
        let rawPressure = read24BitData(0x00); // Replace 0x00 with actual register
      
        scaledPress = calculatePressure(rawPressure, rawTemperature);
        scaledTemp = calculateTemperature(rawTemperature);

        basic.pause(10)
    }

    // main
    basic.pause(10)
    initializeDPS310()
    basic.pause(10)
    readCalibrationCoefficients()
    basic.pause(10)


    const PRESS_EVENT_ID1 = 1001;
    const PRESS_EVENT_ID2 = 1002;
    const TEMP_EVENT_ID1 = 1003;
    const TEMP_EVENT_ID2 = 1004;
    let threshold1 = 1020;
    let threshold2 = 990;
    let threshold3 = 35;
    let threshold4 = 5;
    let interval = 100;

    //% block
    //% block="気圧の閾値の上を $value1 下を $value2 に設定する"
    //% weight=90 color=#3fbc41
    export function setSensor1(pin: AnalogPin, value1: number, value2: number) {
        threshold1 = value1;
        threshold2 = value2;
        startListening();
    }
    //% block
    //% block="気圧が閾値以上になったとき"
    //% weight=89 color=#3fbc41
    export function onDetected1(handler: () => void) {
        control.onEvent(PRESS_EVENT_ID1, EventBusValue.MICROBIT_EVT_ANY, handler);
    }
    //% block
    //% block="気圧が閾値以下になったとき"
    //% weight=88 color=#3fbc41
    export function onDetected2(handler: () => void) {
        control.onEvent(PRESS_EVENT_ID2, EventBusValue.MICROBIT_EVT_ANY, handler);
    }
    //% block
    //% block="温度の閾値の上を $value1 下を $value2 に設定する"
    //% weight=80 color=#3fbc41
    export function setSensor2(pin: AnalogPin, value1: number, value2: number) {
        threshold3 = value1;
        threshold4 = value2;
        startListening();
    }
    //% block
    //% block="温度が閾値以上になったとき"
    //% weight=79 color=#3fbc41
    export function onDetected3(handler: () => void) {
        control.onEvent(TEMP_EVENT_ID1, EventBusValue.MICROBIT_EVT_ANY, handler);
    }
    //% block
    //% block="温度が閾値以下になったとき"
    //% weight=78 color=#3fbc41
    export function onDetected4(handler: () => void) {
        control.onEvent(TEMP_EVENT_ID2, EventBusValue.MICROBIT_EVT_ANY, handler);
    }

    // イベントリスナーの開始
    let listening = false
    function startListening() {
        if( listening ) return
        listening = true;
        control.inBackground(() => {
            while (true) {
                readData();
                if (scaledPress >= threshold1) {
                    // イベントを発生させる
                    control.raiseEvent(PRESS_EVENT_ID1, scaledPress);
                }
                if (scaledPress <= threshold2) {
                    // イベントを発生させる
                    control.raiseEvent(PRESS_EVENT_ID2, scaledPress);
                }
                if (scaledTemp >= threshold1) {
                    // イベントを発生させる
                    control.raiseEvent(TEMP_EVENT_ID1, scaledTemp);
                }
                if (scaledTemp <= threshold2) {
                    // イベントを発生させる
                    control.raiseEvent(TEMP_EVENT_ID2, scaledTemp);
                }
                basic.pause(interval);
            }
        });
    }
}
