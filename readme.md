# ide_qsys

A powerful Node.js library for programmatically managing Q-SYS cores and Lua scripts. Deploy code to multiple systems, monitor script health, sync with files, and automate your Q-SYS infrastructure with ease.

## Key Features

### Instant Deployment Feedback
```javascript
// Get immediate error counts and logs after deployment
const result = await core.updateCode('MainScript', luaCode);
console.log(`Errors: ${result.deployment.errorCount}`);
console.log(`Logs: ${result.deployment.logs.join(', ')}`);
```

### Deploy One Script to Multiple Q-SYS Cores
```javascript
// Deploy your Lua script to multiple cores with validation and rollback
import fs from 'fs';
const result = await Core.deployToMultipleCores(
  [
    { ip: '192.168.1.100', username: 'admin', pin: 'pin1' },
    { ip: '192.168.1.101', username: 'admin', pin: 'pin2' },
    { ip: '192.168.1.102', username: 'admin', pin: 'pin3' }
  ],
  'MainScript',
  fs.readFileSync(`./scripts/main.lua`, 'utf8'),
  { validateFirst: true, rollbackOnError: true }
);
```

### Sync Lua Scripts with Files
```javascript
// Bidirectional sync between Q-SYS and your filesystem
await core.syncScriptWithFile('MainScript', './scripts/main.lua', 'auto');

// Push local file to Q-SYS
await core.loadScriptFromFile('./scripts/updated-main.lua', 'MainScript');

// Pull Q-SYS script to file
await core.saveScriptToFile('MainScript', './backup/main.lua');
```

### Monitor Script Health Across Systems
```javascript
// Get comprehensive health report across multiple cores
const health = await Core.monitorScriptHealth(coreConfigs, ['MainScript'], {
  includeErrors: true,
  includeLogs: true
});
console.log(`System health: ${health.summary.healthPercentage}%`);
```

## Core Features

- **Multi-Core Deployment**: Deploy Lua scripts to multiple Q-SYS cores simultaneously
- **File Operations**: Sync Lua scripts between Q-SYS and your filesystem
- **Health Monitoring**: Monitor script errors and status across your infrastructure
- **Session Management**: High-performance persistent connections
- **Error Detection**: Automatic error counting and log collection after deployments
- **Batch Operations**: Perform multiple operations efficiently
- **Robust Error Handling**: Comprehensive timeouts and connection management

## Installation

```bash
npm install ide_qsys
```

## Quick Start

### Working with Q-SYS Lua Scripts

This library is designed to manage Lua scripts that run on Q-SYS cores. Here's an example of the type of Lua code you'll be deploying:

```lua
-- Example Q-SYS Lua Script (main.lua)
print("Audio System Controller v1.2")

-- System configuration
local roomConfig = {
  name = "Conference Room A",
  micInputs = 4,
  speakerOutputs = 2,
  maxGain = 12.0
}

-- Initialize controls
Controls.RoomName.String = roomConfig.name
Controls.SystemStatus.String = "Starting"

-- Main initialization
function Initialize()
  print("Initializing " .. roomConfig.name)
  Controls.SystemStatus.String = "Ready"
end

-- Event handlers
Controls.MuteAll.EventHandler = function()
  for i = 1, roomConfig.speakerOutputs do
    Controls["Speaker_" .. i .. "_Mute"].Boolean = true
  end
  print("All speakers muted")
end

-- System ready
Controls.SystemStatus.String = "Online"
print("Audio system initialized successfully")
```

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
-- Main Q-SYS Script

-- Initialize controls
Controls.Status.String = "Online"
Controls.ErrorCount.Value = 0

-- Event handlers
Controls.Initialize.EventHandler = function()
    print("Manual initialization triggered")
    Controls.Status.String = "Initialized"
end
`;

const result = await core.updateCode('MainScript', newCode);

// Enhanced result includes deployment information
console.log(`Deployed ${result.deployment.codeLength} characters`);
console.log(`Error count: ${result.deployment.errorCount}`);
console.log(`Timestamp: ${result.deployment.timestamp}`);

if (result.deployment.errorCount > 0) {
  console.log(`Error details: ${result.deployment.errorDetails}`);
}

// Recent logs from the deployed script
result.deployment.logs.forEach(log => {
  console.log(`Log: ${log}`);
});

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

## Production Use Cases

### Multi-Core Deployment

Deploy one script to multiple Q-SYS cores with validation and rollback:

```javascript
import Core from 'ide_qsys';

const coreConfigs = [
  { ip: '192.168.1.100', username: 'admin', pin: 'pin1', systemName: 'Core1' },
  { ip: '192.168.1.101', username: 'admin', pin: 'pin2', systemName: 'Core2' },
  { ip: '192.168.1.102', username: 'admin', pin: 'pin3', systemName: 'Core3' }
];

const scriptCode = `
-- Main Q-SYS Control Script

-- Configuration
local config = {
    systemName = "Conference Room A",
    audioInputs = 8,
    audioOutputs = 4,
    maxVolume = 0.8
}

-- Initialize system controls
Controls.SystemName.String = config.systemName
Controls.Status.String = "Initializing"
Controls.ErrorCount.Value = 0

-- System ready
Controls.Status.String = "Online"
print("System deployment completed successfully")
`;

const result = await Core.deployToMultipleCores(
  coreConfigs, 
  'MainScript', 
  scriptCode,
  {
    validateFirst: true,     // Test connectivity first
    rollbackOnError: true,   // Auto-rollback on script errors
    maxConcurrent: 2,        // Deploy to 2 cores at once
    delayBetween: 1000       // 1 second delay between operations
  }
);

console.log(`Deployed to ${result.summary.successful}/${result.summary.total} cores`);
```

### File Operations

Work with script files on the filesystem:

```javascript
const core = new Core({ ip: '192.168.1.100', username: 'admin', pin: 'pin' });

// Save script from Q-SYS to file
await core.saveScriptToFile('MainScript', './scripts/main.lua', {
  createDir: true,
  backup: true
});

// Load Lua script from file to Q-SYS (with deployment info)
const loadResult = await core.loadScriptFromFile('./scripts/main.lua', 'MainScript');
console.log(`Deployed: ${loadResult.codeLength} characters, ${loadResult.errorCount} errors`);

// Bidirectional sync (auto-detect direction)
const syncResult = await core.syncScriptWithFile('MainScript', './scripts/main.lua', 'auto');
console.log(`Sync action: ${syncResult.action}`);

// Force sync direction (push includes deployment info)
const pushResult = await core.syncScriptWithFile('MainScript', './scripts/main.lua', 'push'); // File to Q-SYS
console.log(`Push result: ${pushResult.errorCount} errors, ${pushResult.logs.length} log entries`);

await core.syncScriptWithFile('MainScript', './scripts/main.lua', 'pull'); // Q-SYS to file
```

### Health Monitoring

Monitor script health across multiple cores:

```javascript
const healthReport = await Core.monitorScriptHealth(
  coreConfigs,
  ['MainScript', 'Module'], // Specific scripts to monitor
  {
    includeErrors: true,
    includeStatus: true,
    includeLogs: true,
    logLines: 5
  }
);

console.log(`Overall health: ${healthReport.summary.healthPercentage}%`);
console.log(`Healthy components: ${healthReport.summary.healthyComponents}/${healthReport.summary.totalComponents}`);

// Check individual systems
healthReport.results.forEach(system => {
  console.log(`${system.system}: ${system.connected ? 'Connected' : 'Failed'}`);
  if (system.components) {
    system.components.forEach(component => {
      console.log(`  ${component.name}: ${component.errors || 0} errors`);
    });
  }
});
```

## Performance Tips

- Use session-based methods for multiple operations
- Single-shot methods are perfect for simple, one-off tasks
- Batch operations when possible to reduce overhead
- Always clean up connections to prevent resource leaks
- Use multi-core deployment for consistent updates across systems
- Monitor script health regularly in production environments

## Requirements

- Node.js 14+ (ES modules support)
- Q-SYS Core with QRC enabled
- Network access to Q-SYS Core on port 1710

## License

ISC

## Contributing

Issues and pull requests welcome at [GitHub repository](https://github.com/patrickgilsf/ide_qsys).