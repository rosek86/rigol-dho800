import assert from 'node:assert';

import { VisaInstrument } from 'ni-visa';

export interface RigolDho800Channel {
  probeRatio: number;
  verticalScale: number;
  offset: number;
  coupling: 'DC' | 'AC';
  display: boolean;
}

export interface RigolDho800TriggerEdge {
  source: 'CHAN1' | 'CHAN2' | 'CHAN3' | 'CHAN4';
  level: number;
  slope: 'POS' | 'NEG' | 'RFAL';
}

export interface RigolDho800WaveformParameters {
  format: number;
  type: number;
  points: number;
  count: number;
  xincrement: number;
  xorigin: number;
  xreference: number;
  yincrement: number;
  yorigin: number;
  yreference: number;
}

export class RigolDho800 {
  private instr: VisaInstrument;

  public constructor(instr: VisaInstrument) {
    this.instr = instr;
  }

  public reset() {
    this.instr.write('*RST');
    this.instr.write('*CLS');
    this.wait();
  }

  public configureTimebase(scale: number = 0.001) {
    this.instr.write(`:TIM:SCAL ${scale}`);
  }

  public configureChannel(ch: number, config: Partial<RigolDho800Channel> = {}) {
    this.instr.write(`:CHAN${ch}:PROB ${config.probeRatio ?? 1}`);
    this.instr.write(`:CHAN${ch}:SCAL ${config.verticalScale ?? 1}`);
    this.instr.write(`:CHAN${ch}:OFFS ${config.offset ?? 0}`);
    this.instr.write(`:CHAN${ch}:COUP ${config.coupling ?? 'DC'}`);
    this.instr.write(`:CHAN${ch}:DISP ${(config.display ?? true) ? 'ON' : 'OFF'}`);
  }

  public configureMemoryDepth(depth: string) {
    this.instr.write(`:ACQ:MDEP ${depth}`);
  }

  public configureEdgeTrigger(config: RigolDho800TriggerEdge) {
    this.instr.write(`:TRIG:MODE EDGE`);
    this.instr.write(`:TRIG:EDGE:SOUR ${config.source}`);
    this.instr.write(`:TRIG:EDGE:LEV ${config.level}`);
    this.instr.write(`:TRIG:EDGE:SLOP ${config.slope}`);
  }

  public singleTrigger() {
    this.instr.write(':SING');
  }

  public stop() {
    this.instr.write(':STOP');
  }

  public run() {
    this.instr.write(':RUN');
  }

  public async waitTigger(timeout = 0) {
    const start = Date.now();
    while (true) {
      const status = this.instr.query(':TRIG:STAT?');
      if (status === 'STOP') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      if (timeout > 0 && Date.now() - start > timeout) {
        return false;
      }
    }
    return true;
  }

  public readWaveform(ch: number) {
    this.instr.write(`:WAV:SOUR CHAN${ch}`);
    this.instr.write(':WAV:MODE RAW');
    this.instr.write(':WAV:FORM WORD');
    this.wait();

    const result = this.instr.queryBinary(':WAV:DATA?', 2 * 1024 * 1024);
    const params = this.queryWaveformParameters();

    assert(result.length > 2, new Error('Invalid waveform data'));

    // The first byte should be '#'
    assert(result.at(0) === '#'.charCodeAt(0), new Error('Invalid waveform data'));

    // The second byte should be the number of digits in the length
    const lengthSize = parseInt(String.fromCharCode(result.at(1) ?? 0), 10);
    assert(lengthSize >= 1 && lengthSize <= 9, new Error('Invalid waveform data'));

    // The next `lengthSize` bytes should be the length of the data in bytes
    const length = parseInt(result.toString('ascii', 2, 2 + lengthSize));
    const data = result.slice(2 + lengthSize, 2 + lengthSize + length);
    assert(data.length === length, new Error('Invalid waveform data'));

    // Parse the data as 16-bit little-endian samples
    const samples: number[] = [];
    for (let i = 0; i < data.length; i += 2) {
      const sample = data.readUInt16LE(i);
      const voltage = (sample - params.yreference) * params.yincrement + params.yorigin;
      samples.push(voltage);
    }

    return { samples, params };
  }

  public queryWaveformParameters(): RigolDho800WaveformParameters {
    // <format>: indicates 0 (BYTE), 1 (WORD), or 2 (ASC).
    // <type>: indicates 0 (NORMal), 1 (MAXimum), or 2 (RAW).
    // <points>: an integer ranging from 1 to 50,000,000.
    // <count>: indicates the number of averages in the average sample mode. The value of <count> parameter is 1 in other modes.
    // <xincrement>: indicates the time difference between two neighboring points in the X direction.
    // <xorigin>: indicates the start time of the waveform data in the X direction.
    // <xreference>: indicates the reference time of the waveform data in the X direction.
    // <yincrement>: indicates the step value of the waveforms in the Y direction.
    // <yorigin>: indicates the vertical offset relative to the "Vertical Reference Position" in the Y direction.
    // <yreference>: indicates the vertical reference position in the Y direction.
    const response = this.instr.query(':WAV:PRE?');
    const params = response.split(',').map((p) => parseFloat(p));

    const [
      format,
      type,
      points,
      count,
      xincrement,
      xorigin,
      xreference,
      yincrement,
      yorigin,
      yreference,
    ] = params;

    assert(format !== undefined, new Error('Invalid waveform parameters'));
    assert(type !== undefined, new Error('Invalid waveform parameters'));
    assert(points !== undefined, new Error('Invalid waveform parameters'));
    assert(count !== undefined, new Error('Invalid waveform parameters'));
    assert(xincrement !== undefined, new Error('Invalid waveform parameters'));
    assert(xorigin !== undefined, new Error('Invalid waveform parameters'));
    assert(xreference !== undefined, new Error('Invalid waveform parameters'));
    assert(yincrement !== undefined, new Error('Invalid waveform parameters'));
    assert(yorigin !== undefined, new Error('Invalid waveform parameters'));
    assert(yreference !== undefined, new Error('Invalid waveform parameters'));

    return {
      format,
      type,
      points,
      count,
      xincrement,
      xorigin,
      xreference,
      yincrement,
      yorigin,
      yreference,
    };
  }

  public createWaveformXLabels(params: RigolDho800WaveformParameters, inMs = false): number[] {
    const multiplier = inMs ? 1e3 : 1;
    return Array.from(
      { length: params.points },
      (_, i) => (params.xorigin + (i - params.xreference) * params.xincrement) * multiplier,
    );
  }

  public wait() {
    this.instr.query('*OPC?');
  }
}
