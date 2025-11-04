# ide_qsys

A Node.js library for programmatically managing Q-SYS cores and Lua scripts. Deploy code to multiple systems, monitor script health, sync with files, and automate your Q-SYS infrastructure.

## Installation

```bash
npm install ide_qsys
```

## Quick Start

### Basic Connection

```javascript
import Core from 'ide_qsys';

const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  pin: '1234'
});

await core.connect();
const components = await core.getComponents();
console.log(`Found ${components.length} components`);
await core.disconnect();
```

## Q-SYS Component Configuration

Before you can access script components via QRC, they must be configured for script access in Q-SYS Designer.

### Enabling Script Access

In Q-SYS Designer, for each script component you want to access:

1. Select the script component
2. In the Properties panel, set **"Script Access"** dropdown to anything other than **"None"** (which is the default)
3. The **"Code Name"** field shows the component name you'll use in your code

![Q-SYS Component Configuration](media/Q-Sys_Component_Access.png)

**Important Notes:**
- **Script Access = "None"**: Component cannot be accessed via QRC
- **Script Access = "All"** or other options: Component can be accessed via QRC
- The **"Code Name"** field value is what you use as the `componentName` parameter in your API calls

```javascript
// If your component's "Code Name" is "MainScript"
const components = await core.getComponents();
const code = await core.getCode('MainScript');  // Use the Code Name here
```

## Authentication

### Setting Up Q-SYS Administrator Credentials

The username and PIN are configured in Q-SYS Administrator. You need to create a user with External Control Protocol permissions:

![Q-SYS Administrator Example](media/Q-Sys_Administrator_Example.png)

In Q-SYS Administrator:
1. Go to the user management section
2. Create or edit a user (e.g., "admin")
3. Set a PIN (e.g., "1234")
4. Enable "External Control Protocol" permissions
5. Enable "File Management Protocol" if you need file operations

### Constructor Options

```javascript
const core = new Core({
  ip: '192.168.1.100',           // Required: Q-SYS Core IP address
  username: 'admin',             // Required: Username from Q-SYS Administrator
  pin: 'your_pin',               // Required: PIN (also accepts 'password' or 'pw')
  comp: 'MainScript',            // Optional: Default component name
  verbose: false                 // Optional: Enable debug logging
});
```

### Authentication Error Examples

**Wrong credentials:**
```javascript
// This will throw an error
const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  pin: 'wrong_pin'
});

try {
  await core.connect();
} catch (error) {
  console.error(error.message); // "QRC authentication failed for 192.168.1.100: Logon required"
}
```

**Missing credentials:**
```javascript
// This will throw an error
const core = new Core({
  ip: '192.168.1.100'
  // Missing username and pin
});

try {
  await core.connect();
} catch (error) {
  console.error(error.message); // "QRC authentication failed for 192.168.1.100: Logon required"
}
```

## Connection Management

### Session-Based (Recommended for Multiple Operations)

```javascript
const core = new Core({ ip: '192.168.1.100', username: 'admin', pin: '1234' });

await core.connect();
// Perform multiple operations efficiently
const components = await core.getComponents();
const logs = await core.collectLogs('MainScript');
const code = await core.getCode('MainScript');
await core.disconnect();
```

### Single-Shot Operations (Auto Connect/Disconnect)

```javascript
const core = new Core({ ip: '192.168.1.100', username: 'admin', pin: '1234' });

// These methods handle connection automatically
const components = await core.getComponentsSync();
const errors = await core.getScriptErrorsSync();
```

## API Reference

### Connection Methods

#### `connect()`
Establishes a persistent connection to the Q-SYS core.

```javascript
await core.connect();
```

#### `disconnect()`
Closes the connection to the Q-SYS core.

```javascript
await core.disconnect();
```

### Component Methods

#### `getComponents()` / `getComponentsSync()`
Returns an array of all components in the Q-SYS design.

```javascript
// Session-based
await core.connect();
const components = await core.getComponents();
await core.disconnect();

// Single-shot
const components = await core.getComponentsSync();
```

**Returns:** Array of component objects with `Name` and `Type` properties.

#### `getControls(componentName, callback)` / `getControlsSync(componentName)`
Gets all controls for a specific component.

```javascript
// Session-based with callback
await core.connect();
await core.getControls('MainScript', (error, controls) => {
  if (error) console.error(error);
  else console.log(controls);
});
await core.disconnect();

// Single-shot
const controls = await core.getControlsSync('MainScript');
```

**Parameters:**
- `componentName` (string): Name of the component
- `callback` (function, optional): Callback function for session-based method

**Returns:** Array of control objects.

#### `getComponent(componentName, controlName, callback)` / `getComponentSync(componentName, controlName)`
Gets the value of a specific control.

```javascript
// Session-based
await core.connect();
const value = await core.getComponent('MainScript', 'Status');
await core.disconnect();

// Single-shot
const value = await core.getComponentSync('MainScript', 'Status');
```

**Parameters:**
- `componentName` (string): Name of the component
- `controlName` (string): Name of the control
- `callback` (function, optional): Callback function for session-based method

**Returns:** Control value object.

#### `setComponent(componentName, controlName, value, callback)` / `setComponentSync(componentName, controlName, value)`
Sets the value of a specific control.

```javascript
// Session-based
await core.connect();
await core.setComponent('MainScript', 'reload', 1);
await core.disconnect();

// Single-shot
await core.setComponentSync('MainScript', 'reload', 1);
```

**Parameters:**
- `componentName` (string): Name of the component
- `controlName` (string): Name of the control
- `value` (any): Value to set
- `callback` (function, optional): Callback function for session-based method

### Script Management Methods

#### `getScriptErrors(options, callback)` / `getScriptErrorsSync(options)`
Gets script errors for a component.

```javascript
// Session-based
await core.connect();
const errors = await core.getScriptErrors({ scriptName: 'MainScript' });
await core.disconnect();

// Single-shot
const errors = await core.getScriptErrorsSync({ scriptName: 'MainScript' });
```

**Parameters:**
- `options` (object, optional):
  - `scriptName` (string): Specific script name to check
- `callback` (function, optional): Callback function for session-based method

**Returns:** Object with error count and details.

#### `restartScript(componentName, callback)` / `restartScriptSync(componentName)`
Restarts a script component.

```javascript
// Session-based
await core.connect();
await core.restartScript('MainScript');
await core.disconnect();

// Single-shot
await core.restartScriptSync('MainScript');
```

**Parameters:**
- `componentName` (string): Name of the script component
- `callback` (function, optional): Callback function for session-based method

#### `collectLogs(componentName, callback)` / `collectLogsSync(componentName)`
Collects console logs from a script component.

```javascript
// Session-based
await core.connect();
const logs = await core.collectLogs('MainScript');
await core.disconnect();

// Single-shot
const logs = await core.collectLogsSync('MainScript');
```

**Parameters:**
- `componentName` (string): Name of the script component
- `callback` (function, optional): Callback function for session-based method

**Returns:** Array of log strings with timestamps removed.

### Code Management Methods

#### `getCode(componentName, callback)` / `getCodeSync(componentName)`
Gets the Lua code from a script component.

```javascript
// Session-based
await core.connect();
const code = await core.getCode('MainScript');
await core.disconnect();

// Single-shot
const code = await core.getCodeSync('MainScript');
```

**Parameters:**
- `componentName` (string): Name of the script component
- `callback` (function, optional): Callback function for session-based method

**Returns:** String containing the Lua code.

#### `updateCode(componentName, code, callback)`
Updates the Lua code in a script component and returns deployment information.

```javascript
await core.connect();
const result = await core.updateCode('MainScript', luaCode);
console.log(`Errors: ${result.deployment.errorCount}`);
console.log(`Logs: ${result.deployment.logs.join(', ')}`);
await core.disconnect();
```

**Parameters:**
- `componentName` (string): Name of the script component
- `code` (string): Lua code to deploy
- `callback` (function, optional): Callback function

**Returns:** Object with deployment information including:
- `deployment.componentName` (string): Component name
- `deployment.codeLength` (number): Length of deployed code
- `deployment.errorCount` (number): Number of errors after deployment
- `deployment.errorDetails` (object): Error details if any
- `deployment.logs` (array): Console logs after deployment
- `deployment.timestamp` (string): Deployment timestamp

## Production Methods

### Multi-Core Deployment

#### `Core.deployToMultipleCores(coreConfigs, componentName, code, options)`
Static method to deploy one script to multiple Q-SYS cores.

```javascript
const coreConfigs = [
  { ip: '192.168.1.100', username: 'admin', pin: '1234', systemName: 'Core1' },
  { ip: '192.168.1.101', username: 'admin', pin: '5678', systemName: 'Core2' },
  { ip: '192.168.1.102', username: 'admin', pin: '9012', systemName: 'Core3' }
];

const result = await Core.deployToMultipleCores(
  coreConfigs,
  'MainScript',
  fs.readFileSync('./scripts/main.lua', 'utf8'),
  { validateFirst: true, rollbackOnError: true }
);
```

**Parameters:**
- `coreConfigs` (array): Array of core configuration objects
- `componentName` (string): Name of the script component
- `code` (string): Lua code to deploy
- `options` (object, optional):
  - `validateFirst` (boolean): Validate code before deployment
  - `rollbackOnError` (boolean): Rollback on deployment errors

**Returns:** Object with deployment results for each core.

### File Operations

#### `loadScriptFromFile(filePath, componentName, options)`
Loads Lua code from a file and deploys it to a component.

```javascript
await core.connect();
const result = await core.loadScriptFromFile('./scripts/main.lua', 'MainScript');
console.log(`Deployed: ${result.codeLength} characters, ${result.errorCount} errors`);
await core.disconnect();
```

**Parameters:**
- `filePath` (string): Path to the Lua file
- `componentName` (string): Name of the script component
- `options` (object, optional): Additional options

**Returns:** Object with deployment information.

#### `saveScriptToFile(componentName, filePath, options)`
Saves Lua code from a component to a file.

```javascript
await core.connect();
await core.saveScriptToFile('MainScript', './backup/main.lua', {
  createDir: true,
  backup: true
});
await core.disconnect();
```

**Parameters:**
- `componentName` (string): Name of the script component
- `filePath` (string): Path where to save the file
- `options` (object, optional):
  - `createDir` (boolean): Create directory if it doesn't exist
  - `backup` (boolean): Create backup if file exists

#### `syncScriptWithFile(componentName, filePath, direction, options)`
Synchronizes a script component with a file.

```javascript
await core.connect();
// Auto-detect direction
const result = await core.syncScriptWithFile('MainScript', './scripts/main.lua', 'auto');

// Force direction
await core.syncScriptWithFile('MainScript', './scripts/main.lua', 'push'); // File to Q-SYS
await core.syncScriptWithFile('MainScript', './scripts/main.lua', 'pull'); // Q-SYS to file
await core.disconnect();
```

**Parameters:**
- `componentName` (string): Name of the script component
- `filePath` (string): Path to the file
- `direction` (string): 'auto', 'push', or 'pull'
- `options` (object, optional): Additional options

**Returns:** Object with sync information.

### Health Monitoring

#### `Core.monitorScriptHealth(coreConfigs, scriptNames, options)`
Static method to monitor script health across multiple cores.

```javascript
const healthReport = await Core.monitorScriptHealth(
  coreConfigs,
  ['MainScript', 'Module'],
  {
    includeErrors: true,
    includeStatus: true,
    includeLogs: true,
    logLines: 5
  }
);

console.log(`Overall health: ${healthReport.summary.healthPercentage}%`);
```

**Parameters:**
- `coreConfigs` (array): Array of core configuration objects
- `scriptNames` (array): Array of script names to monitor
- `options` (object, optional):
  - `includeErrors` (boolean): Include error information
  - `includeStatus` (boolean): Include status information
  - `includeLogs` (boolean): Include log information
  - `logLines` (number): Number of log lines to include

**Returns:** Object with health report and summary.

## Best Practices

1. **Always disconnect**: Ensure sessions are properly closed
2. **Use try/finally**: Guarantee cleanup even on errors
3. **Batch operations**: Use sessions for multiple operations
4. **Single-shot for simple tasks**: Use sync methods for one-off operations

```javascript
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

## Requirements

- Node.js 14+ (ES modules support)
- Q-SYS Core with QRC enabled
- Network access to Q-SYS Core on port 1710

## License

ISC

## Contributing

Issues and pull requests welcome at [GitHub repository](https://github.com/patrickgilsf/ide_qsys).