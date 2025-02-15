import { VisaInstrument, VisaResourceManager } from 'ni-visa';

import { RigolDho800 } from '../src/RigolDho800.ts';

const rm = new VisaResourceManager();

try {
  console.log('Listing available VISA resources...');
  const resources = rm.listResources();
  const usbResources = resources.filter((res) => res.startsWith('USB'));
  if (!usbResources.length) {
    throw new Error('No USB resources found');
  }

  const instr = rm.open(usbResources[0]);
  try {
    await onInstrumentOpened(instr);
  } finally {
    instr.close();
  }
} catch (error) {
  console.error(error);
} finally {
  rm.close();
}

async function onInstrumentOpened(instr: VisaInstrument) {
  const scope = new RigolDho800(instr);

  scope.reset();
  scope.configureTimebase(0.001); // 1ms/div
  scope.configureChannel(1, { verticalScale: 1, probeRatio: 10 });
  scope.configureEdgeTrigger({ source: 'CHAN1', level: 1.0, slope: 'POS' });
  scope.configureMemoryDepth('100k');
  scope.wait();

  scope.singleTrigger();
  scope.wait();

  // Wait up to 5 seconds for trigger
  if (!(await scope.waitTigger(5000))) {
    throw new Error('Timeout waiting for trigger');
  }

  const { samples } = scope.readWaveform(1);
  console.log('Waveform data:', samples);
}
