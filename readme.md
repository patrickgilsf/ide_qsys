# ide_qsys

A high-performance Node.js library for programmatically interacting with Q-SYS cores. Built with a modern session-based architecture for optimal performance and reliability.

## Features

- **High Performance**: Session-based architecture reduces connection overhead
- **Component Management**: Get and set component controls with ease
- **Script Monitoring**: Monitor script errors and status issues
- **Script Management**: Restart scripts and process issues automatically
- **Code Management**: Export, update, and manage script code
- **Log Collection**: Collect and filter script logs with timestamp removal
- **Batch Operations**: Perform multiple operations efficiently
- **Robust Error Handling**: Comprehensive timeouts and connection management
- **Flexible API**: Both single-shot and session-based methods available

## Installation

```bash
npm install ide_qsys
```

## Quick Start

### Basic Usage

```javascript
import Core from 'ide_qsys';

const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  pin: 'your_pin'  // or password/pw
});

// Single-shot operations (automatic connect/disconnect)
const components = await core.getComponentsSync();
const errors = await core.getScriptErrors();
```

### Session-Based Usage (Recommended for Multiple Operations)

```javascript
import Core from 'ide_qsys';

const core = new Core({
  ip: '192.168.1.100',
  username: 'admin', 
  pin: 'your_pin'
});

// Establish persistent connection
await core.connect();

// Perform multiple operations efficiently
const components = await core.getComponents();
const logs = await core.collectLogs('MainScript');
const code = await core.getCode('MainScript');

// Clean up connection
await core.disconnect();
```

## Authentication

The constructor accepts a single options object with your credentials:

```javascript
// Constructor requires an options object
const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  pin: 'your_pin',        // or 'password' or 'pw'
  comp: 'MainScript',     // optional default component
  verbose: false          // optional debug logging
});

// Using environment variables
const core = new Core({
  ip: '192.168.1.100',
  username: process.env.QSYS_USERNAME,
  pin: process.env.QSYS_PIN
});
```

## Core Methods

### Component Operations

#### Get All Components
```javascript
// Single-shot (auto connect/disconnect)
const components = await core.getComponentsSync();

// Session-based (requires active connection)
await core.connect();
const components = await core.getComponents();
await core.disconnect();
```

#### Get Component Controls
```javascript
// Get all controls for a component
const controls = await core.getControlsSync('MainScript');

// Session-based with callback
await core.connect();
await core.getControls('MainScript', (error, controls) => {
  if (error) console.error(error);
  else console.log(controls);
});
await core.disconnect();
```

#### Get/Set Individual Controls
```javascript
// Get specific control value
const result = await core.getComponentSync('MainScript', 'Status');

// Set control value
await core.setControlSync('MainScript', 'reload', 1);
```

### Script Management

#### Get Script Errors
Monitor and retrieve script errors across all components:

```javascript
// Get all script errors
const errors = await core.getScriptErrors();

// Get errors for specific script
const mainErrors = await core.getScriptErrors({ scriptName: 'MainScript' });

// Example output:
// [
//   {
//     Component: 'MainScript',
//     Value: 2,
//     Details: 'attempt to index nil value...'
//   }
// ]
```

#### Restart Scripts
Restart scripts to resolve issues:

```javascript
// Restart a specific script
const result = await core.restartScript('MainScript');

// Restart with options
await core.restartScript('MainScript', { verbose: true });
```

#### Collect Logs
Retrieve and filter script logs:

```javascript
// Session-based log collection
await core.connect();
const logs = await core.collectLogs('MainScript');
console.log(logs); // Array of clean log entries (timestamps removed)

// With callback
await core.collectLogs('MainScript', (error, logs) => {
  if (error) console.error('Failed to collect logs:', error);
  else logs.forEach(log => console.log(log));
});
await core.disconnect();
```

### Code Management

#### Get Script Code
```javascript
await core.connect();
const code = await core.getCode('MainScript');
console.log(code); // Full script code as string
await core.disconnect();
```

#### Update Script Code
```javascript
await core.connect();
const newCode = `
-- Updated script
print("Hello from updated script!")
`;
await core.updateCode('MainScript', newCode);
await core.disconnect();
```

#### Export All Script Code
```javascript
const allCode = await core.exportCode();
// Returns object: { 'MainScript': 'code...', 'Module': 'code...' }
```

### Advanced Operations

#### Process Script Issues
Automatically restart scripts with issues and report results:

```javascript
const result = await core.processScriptIssues('SystemName', 'SiteCode', '192.168.1.100');

console.log('Initial errors:', result.scriptErrors);
console.log('Persistent errors after restart:', result.persistentErrors);
console.log('Status issues resolved:', result.scriptStatuses.length - result.persistentStatuses.length);
```

#### Batch Operations
Perform multiple operations efficiently:

```javascript
await core.connect();

const operations = [
  { type: 'getComponents' },
  { type: 'getScriptErrors' },
  { type: 'getCode', componentName: 'MainScript' }
];

const results = await core.batch(operations);
results.forEach(result => {
  if (result.success) {
    console.log(`${result.operation} succeeded:`, result.result);
  } else {
    console.error(`${result.operation} failed:`, result.error);
  }
});

await core.disconnect();
```

## Legacy Methods

The library maintains compatibility with existing code patterns:

```javascript
// Legacy file-based code updates
await core.update('script.lua');

// Legacy data retrieval
const data = await core.retrieve({ type: 'code', verbose: true });
```

## Error Handling

All methods include comprehensive error handling with meaningful messages:

```javascript
try {
  await core.connect();
  const result = await core.getComponents();
} catch (error) {
  console.error('Operation failed:', error.message);
  // Errors include context: "QRC connection error for 192.168.1.100: Connection refused"
} finally {
  await core.disconnect();
}
```

## Session Management Best Practices

1. **Always disconnect**: Ensure sessions are properly closed
2. **Use try/finally**: Guarantee cleanup even on errors
3. **Batch operations**: Use sessions for multiple operations
4. **Single-shot for simple tasks**: Use sync methods for one-off operations

```javascript
// Good session management
const core = new Core({ ip: '192.168.1.100', username: 'admin', pin: 'pin' });

try {
  await core.connect();
  
  // Multiple operations
  const components = await core.getComponents();
  const errors = await core.getScriptErrors();
  const logs = await core.collectLogs('MainScript');
  
} catch (error) {
  console.error('Session operations failed:', error);
} finally {
  await core.disconnect(); // Always cleanup
}
```

## Performance Tips

- Use session-based methods for multiple operations
- Single-shot methods are perfect for simple, one-off tasks
- Batch operations when possible to reduce overhead
- Always clean up connections to prevent resource leaks

## Requirements

- Node.js 14+ (ES modules support)
- Q-SYS Core with QRC enabled
- Network access to Q-SYS Core on port 1710

## License

ISC

## Contributing

Issues and pull requests welcome at [GitHub repository](https://github.com/patrickgilsf/ide_qsys).