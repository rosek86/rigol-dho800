import fs from 'node:fs/promises';

import { createCanvas } from 'canvas';
import { Chart } from 'chart.js/auto';
import { VisaInstrument, VisaResourceManager } from 'ni-visa';

import { RigolDho800 } from '../src/RigolDho800.ts';

const rm = new VisaResourceManager();

try {
  console.log('Listing resources');
  const resources = rm.listResources();
  console.log(resources);

  const usbResources = resources.filter((resource) => resource.startsWith('USB'));
  const selectedResource = usbResources[0];
  if (!selectedResource) {
    throw new Error('No USB resources found');
  }

  console.log(`Opening instrument: ${selectedResource}`);
  const instr = rm.open(selectedResource);

  try {
    await onInstrumentOpened(instr);
  } finally {
    console.log('Closing instrument');
    instr.close();
  }
} finally {
  console.log('Closing default resource manager');
  rm.close();
}

async function onInstrumentOpened(instr: VisaInstrument) {
  const response = instr.query('*IDN?');
  console.log(response);

  const rigol = new RigolDho800(instr);

  rigol.reset();

  rigol.configureMemoryDepth('1M');
  rigol.configureTimebase(0.001); // Set timebase scale to 1ms/div
  rigol.configureChannel(4, { probeRatio: 10, verticalScale: 1 });
  rigol.configureChannel(3, { probeRatio: 10, verticalScale: 1 });
  rigol.configureChannel(2, { probeRatio: 10, verticalScale: 1 });
  rigol.configureChannel(1, { probeRatio: 10, verticalScale: 1 });
  rigol.configureEdgeTrigger({ source: 'CHAN1', level: 1.5, slope: 'POS' });
  rigol.wait();

  rigol.singleTrigger();
  rigol.wait();

  console.log('Waiting for trigger...');
  const triggered = await rigol.waitTigger(5000);
  console.log(`Triggered: ${triggered}`);

  rigol.stop();

  const channelsData = [
    rigol.readWaveform(1),
    rigol.readWaveform(2),
    rigol.readWaveform(3),
    rigol.readWaveform(4),
  ];

  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');

  new Chart(ctx as any, {
    type: 'scatter',
    data: {
      labels: rigol.createWaveformXLabels(channelsData[0].params, true),
      datasets: [
        { label: 'Channel 1', data: channelsData[0].samples },
        { label: 'Channel 2', data: channelsData[1].samples },
        { label: 'Channel 3', data: channelsData[2].samples },
        { label: 'Channel 4', data: channelsData[3].samples },
      ],
    },
    plugins: [
      {
        id: 'background-color',
        beforeDraw(chart) {
          const { ctx } = chart;
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        },
      },
    ],
    options: {
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: {
            display: true,
            text: 'Time (ms)',
          },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Voltage (V)',
          },
        },
      },
    },
  });

  ctx.drawImage(canvas, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(`snapshot.png`, buffer);
}
