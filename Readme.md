# rigol-dho800

`rigol-dho800` is a **Node.js** library for interfacing with **Rigol DHO800** oscilloscopes using **NI-VISA**. It provides an easy-to-use API for configuring the oscilloscope, setting acquisition parameters, triggering, and retrieving waveform data.

The library is built on top of [`ni-visa`](https://www.npmjs.com/package/ni-visa) and requires **RsVisa** to be installed. Alternatively, you can provide a custom path to a dynamic library that supports the **NI-VISA** standard.

## Features

- **Timebase and Channel Configuration**: Easily set up acquisition parameters.
- **Trigger Control**: Configure edge triggering.
- **Memory Depth Selection**: Adjust memory depth based on acquisition needs.
- **Waveform Acquisition**: Retrieve waveform data in **WORD** format for high-resolution captures.
- **Automatic Conversion**: Convert raw ADC values into accurate voltage readings.

## Requirements

- **RsVisa** or another NI-VISA compatible library.
- **Node.js 23+** (for TypeScript support and latest JS features).

## Installation

Install the library via npm:

```bash
npm install rigol-dho800
```

## Usage

Below is an example demonstrating how to connect to the oscilloscope, configure it, set up a trigger, wait for an acquisition, and retrieve waveform data:

```javascript
import { VisaInstrument, VisaResourceManager } from 'ni-visa';

import { RigolDho800 } from 'rigol-dho800';

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
```

## API Reference

### `RigolDho800`

#### **General Methods**

- **`new RigolDho800(instr: VisaInstrument)`**: Initializes the oscilloscope instance.
- **`reset(): void`**: Resets and clears the oscilloscope.
- **`wait(): void`**: Blocks execution until the oscilloscope completes an operation.

#### **Configuration Methods**

- **`configureTimebase(scale: number = 0.001): void`**: Sets the timebase scale (default: `1ms/div`).
- **`configureChannel(ch: number, config: Partial<RigolDho800Channel>): void`**: Configures a channel’s probe ratio, scale, offset, coupling, and display.
- **`configureMemoryDepth(depth: string): void`**: Sets the oscilloscope’s memory depth (e.g., `'AUTO'`).
- **`configureEdgeTrigger(config: RigolDho800TriggerEdge): void`**: Configures an edge trigger.

#### **Acquisition & Triggering**

- **`singleTrigger(): void`**: Arms the oscilloscope for a single acquisition.
- **`run(): void`**: Starts continuous acquisition.
- **`stop(): void`**: Stops acquisition.
- **`waitTigger(timeout: number): Promise<boolean>`**: Waits for a trigger event (returns `false` if timeout occurs).

#### **Waveform Acquisition**

- **`readWaveform(ch: number): { samples: number[], params: RigolDho800WaveformParameters }`**
  - Retrieves waveform data from the specified channel and converts it to voltage.
- **`queryWaveformParameters(): RigolDho800WaveformParameters`**
  - Queries the oscilloscope for waveform preamble information.
- **`createWaveformXLabels(params: RigolDho800WaveformParameters, inMs = false): number[]`**
  - Generates time labels for the waveform data.

## Custom Dynamic Library Path

If using a custom VISA library, specify the path when initializing `VisaResourceManager`:

```javascript
const rm = new VisaResourceManager('/path/to/your/library');
```

## Running the Examples

The example above is available in the repository. To run it:

```bash
npm install
node run start
```

## Contributing

Contributions are welcome! If you find any issues or have suggestions, open an issue or submit a pull request.

## License

This project is licensed under the MIT License.

## Support

If you have questions or need assistance, open an issue on the GitHub repository.
