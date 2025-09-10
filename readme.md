# ide_qsys

A comprehensive Node.js library for programmatically interacting with Q-Sys cores. This enhanced version maintains full backward compatibility while adding powerful new functionality for component management, script monitoring, and advanced Q-Sys operations.

## Features

### Backward Compatibility
- All existing code using `ide_qsys` continues to work without changes
- Legacy constructor patterns and methods preserved
- Seamless upgrade path for existing users

### Enhanced Functionality
- **Component Management**: Get and set component controls
- **Script Monitoring**: Monitor script errors and status issues
- **Script Management**: Restart scripts and process issues automatically
- **Core Diagnostics**: Get system health information
- **Advanced Error Handling**: Robust timeouts and connection management
- **Code Export**: Extract all script code from systems
- **Dual API Design**: Both async and synchronous-style methods available

## Installation

```bash
npm install ide_qsys
```

## Quick Start

### Basic Usage (Legacy - Still Supported)

```javascript
import Core from 'ide_qsys';

const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  password: 'password',  // or use 'pw' or 'pin'
  comp: 'MyComponent'
});

// Push code to component
await core.update('script.lua');

// Pull data from component
const data = await core.retrieve({ verbose: true });
```

### Enhanced Usage

```javascript
import Core from 'ide_qsys';

const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  password: 'password',  // or use 'pin' or 'pw'
  comp: 'MyComponent',
  options: { 
    systemName: 'MySystem',
    verbose: true 
  }
});

// Get all components
const components = await core.getComponents();

// Monitor script errors
const errors = await core.getScriptErrors();

// Restart problematic scripts
await core.restartScript('MyScript');

// Get core diagnostics
const diagnostics = await core.getCoreDiagnostics();
```

## API Reference

### Constructor

```javascript
new Core(options)
```

**Parameters:**
- `ip` (string): Q-Sys core IP address
- `username` (string): Username for authentication
- `pw`, `pin`, or `password` (string): Password/PIN for authentication
- `comp` (string): Default component name
- `options` (object): Additional options
  - `systemName` (string): System name for logging
  - `verbose` (boolean): Enable verbose logging

### Method Types

The library provides two types of methods for most operations:

- **Async Methods**: Return immediately when the first complete response is received
- **Sync Methods**: Wait for the complete response before returning (more reliable for complex operations)

### Legacy Methods (Backward Compatible)

#### `add(input, attribute)`
Add a property to the Core instance.

```javascript
core.add('newProperty', 'value');
```

#### `update(input, options)`
Push code or data to a component.

```javascript
await core.update('script.lua', { type: 'code', id: 1234 });
```

**Parameters:**
- `input` (string): File path or data to send
- `options` (object): Optional configuration
  - `id` (number): Request ID (default: 1234)
  - `type` (string): Control type (default: 'code')

#### `retrieve(options)`
Pull data from a component.

```javascript
const data = await core.retrieve({ 
  verbose: true, 
  type: 'code',
  output: 'output.json' 
});
```

**Parameters:**
- `options` (object): Optional configuration
  - `verbose` (boolean): Return full response data
  - `type` (string): Specific control to retrieve
  - `output` (string): File path to save data
  - `id` (string): Request ID (default: '1234')

### Component Management

#### `getComponent(comp, ctl, opt)`
Get a specific control from a component (async).

```javascript
const result = await core.getComponent('MyComponent', 'MyControl');
```

**Parameters:**
- `comp` (string): Component name
- `ctl` (string): Control name
- `opt` (object): Optional configuration
  - `verbose` (boolean): Enable verbose logging

#### `getComponentSync(comp, ctl, opt)`
Get a specific control from a component (synchronous-style).

```javascript
const result = await core.getComponentSync('MyComponent', 'MyControl');
```

**Parameters:** Same as `getComponent`

**Difference from async version:** Waits for complete response before returning, more reliable for complex operations.

#### `getComponents(opt)`
Get all components from the core (async).

```javascript
const components = await core.getComponents();
```

**Parameters:**
- `opt` (object): Optional configuration
  - `verbose` (boolean): Enable verbose logging

#### `getComponentsSync()`
Get all components from the core (synchronous-style).

```javascript
const components = await core.getComponentsSync();
```

**Difference from async version:** Waits for complete response before returning.

#### `getControls(comp, opt)`
Get all controls for a component (async).

```javascript
const controls = await core.getControls('MyComponent');
```

**Parameters:**
- `comp` (string): Component name (defaults to `this.comp`)
- `opt` (object): Optional configuration
  - `verbose` (boolean): Enable verbose logging

#### `getControlsSync(comp, opt)`
Get all controls for a component (synchronous-style).

```javascript
const controls = await core.getControlsSync('MyComponent');
```

**Parameters:** Same as `getControls`

**Difference from async version:** Waits for complete response before returning.

### Control Setting

#### `setControl(comp, ctl, value, options)`
Set a control value (async).

```javascript
await core.setControl('MyComponent', 'MyControl', 'newValue');
```

**Parameters:**
- `comp` (string): Component name
- `ctl` (string): Control name
- `value` (any): Value to set
- `options` (object): Optional configuration
  - `ramp` (number): Ramp time in milliseconds
  - `verbose` (boolean): Enable verbose logging

#### `setControlSync(comp, ctl, value, options)`
Set a control value (synchronous-style).

```javascript
await core.setControlSync('MyComponent', 'MyControl', 'newValue');
```

**Parameters:** Same as `setControl`

**Difference from async version:** Waits for complete response before returning.

#### `setControls(comp, ctls, options)`
Set multiple controls at once.

```javascript
const controls = [
  { Name: 'Control1', Value: 'Value1' },
  { Name: 'Control2', Value: 'Value2' }
];
await core.setControls('MyComponent', controls);
```

**Parameters:**
- `comp` (string): Component name
- `ctls` (array): Array of control objects with `Name` and `Value` properties
- `options` (object): Optional configuration

### Script Monitoring

#### `getScriptErrors(opt)`
Get script errors from the core.

```javascript
// Get all errors
const errors = await core.getScriptErrors();

// Get errors for specific script
const error = await core.getScriptErrors({ scriptName: 'MyScript' });
```

**Parameters:**
- `opt` (object): Optional configuration
  - `scriptName` (string): Target specific script

**Returns:** Array of error objects with `Component`, `Value`, and `Details` properties.

#### `getScriptStatuses(opt)`
Get script status issues.

```javascript
const statuses = await core.getScriptStatuses();
```

**Parameters:**
- `opt` (object): Optional configuration
  - `scriptName` (string): Target specific script

**Returns:** Array of status objects with `Component`, `Control`, `Value`, and `String` properties.

#### `restartScript(componentName, options)`
Restart a script or plugin.

```javascript
const success = await core.restartScript('MyScript');
```

**Parameters:**
- `componentName` (string): Name of component to restart
- `options` (object): Optional configuration

**Returns:** Boolean indicating success.

#### `processScriptIssues(systemName, site, ip)`
Advanced script issue processing with automatic restart and validation.

```javascript
const result = await core.processScriptIssues('SystemName', 'SiteName', '192.168.1.100');

console.log('Script Errors:', result.scriptErrors);
console.log('Script Statuses:', result.scriptStatuses);
console.log('Persistent Errors:', result.persistentErrors);
console.log('Persistent Statuses:', result.persistentStatuses);
```

**Parameters:**
- `systemName` (string): Name of the system
- `site` (string): Site identifier
- `ip` (string): IP address of the system

**Returns:** Object with script issues, persistent issues, and processing results.

### Core Diagnostics

#### `getCoreDiagnostics(opt)`
Get core system diagnostics.

```javascript
const diagnostics = await core.getCoreDiagnostics();
console.log('Temperature:', diagnostics['system.temperature']);
console.log('Fan Speed:', diagnostics['system.fan.1.speed']);
console.log('Grandmaster:', diagnostics['grandmaster.name']);
```

**Parameters:**
- `opt` (object): Optional configuration

**Returns:** Object with system diagnostic data including temperature, fan speed, grandmaster info, and network speed.

### Code Export

#### `exportCode(opt)`
Export all script code from the system.

```javascript
const codeExport = await core.exportCode();
console.log('Scripts:', Object.keys(codeExport));
```

**Parameters:**
- `opt` (object): Optional configuration

**Returns:** Object with script names as keys and code as values.

## Async vs Sync Methods

### Async Methods
- **Behavior**: Return immediately when the first complete response is received
- **Use Case**: Fast operations where you want to process data as soon as it's available
- **Example**: `getComponent()`, `getComponents()`, `getControls()`, `setControl()`

### Sync Methods (Synchronous-Style)
- **Behavior**: Wait for the complete response before returning
- **Use Case**: Operations where you need guaranteed complete data
- **Example**: `getComponentSync()`, `getComponentsSync()`, `getControlsSync()`, `setControlSync()`

**Note**: Both method types are actually asynchronous (they return Promises). The "sync" methods are called "synchronous-style" because they wait for complete responses, similar to how `fs.readFileSync()` works compared to `fs.readFile()`.

## Error Handling

The enhanced version includes robust error handling:

- **Connection Timeouts**: 10-second connection timeout
- **Operation Timeouts**: 30-second operation timeout
- **Authentication Validation**: Automatic login verification
- **Detailed Error Messages**: Clear error descriptions
- **Automatic Cleanup**: Proper connection cleanup on errors

## Examples

### Monitor and Fix Script Issues

```javascript
import Core from 'ide_qsys';

const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  pin: 'password',
  options: { systemName: 'ConferenceRoom' }
});

// Check for script issues
const errors = await core.getScriptErrors();
const statuses = await core.getScriptStatuses();

if (errors.length > 0 || statuses.length > 0) {
  console.log('Script issues detected, attempting to restart...');
  
  // Process all issues with automatic restart
  const result = await core.processScriptIssues('ConferenceRoom', 'MainOffice', '192.168.1.100');
  
  if (result.persistentErrors.length > 0) {
    console.log('Persistent errors after restart:', result.persistentErrors);
  }
}
```

### System Health Monitoring

```javascript
// Get core diagnostics
const diagnostics = await core.getCoreDiagnostics();

if (diagnostics['system.temperature'] > 60) {
  console.warn('High temperature detected:', diagnostics['system.temperature']);
}

if (diagnostics['system.fan.1.speed'] < 1000) {
  console.warn('Low fan speed:', diagnostics['system.fan.1.speed']);
}
```

### Component Management

```javascript
// Get all components
const components = await core.getComponents();

// Find script components
const scriptComponents = components.filter(comp => 
  comp.Type.includes('script') || comp.Type.includes('PLUGIN')
);

console.log('Script components found:', scriptComponents.length);

// Get controls for each script
for (const component of scriptComponents) {
  const controls = await core.getControls(component.ID);
  console.log(`${component.Name} has ${controls.Controls.length} controls`);
}
```

### Using Sync Methods for Reliable Operations

```javascript
// Use sync methods when you need guaranteed complete data
const components = await core.getComponentsSync();
const controls = await core.getControlsSync('MyComponent');

// Use async methods for faster operations
const quickData = await core.getComponent('MyComponent', 'MyControl');
```

## Migration Guide

### For Existing Users
No changes required! Your existing code will continue to work exactly as before.

### For New Features
To use the new functionality, simply call the new methods on your existing `Core` instances:

```javascript
// Your existing code
const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  password: 'password',  // or use 'pw' or 'pin'
  comp: 'MyComponent'
});

// Now you can also use new methods
const components = await core.getComponents();
const errors = await core.getScriptErrors();
```

### Constructor Migration (Optional)
If you want to use the enhanced constructor features:

```javascript
// Old
const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  password: 'password',  // or 'pw' or 'pin'
  comp: 'MyComponent'
});

// New (optional)
const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  password: 'password',  // or 'pin' or 'pw'
  comp: 'MyComponent',
  options: { systemName: 'MySystem' }
});
```

## Dependencies

- `net` - Node.js built-in module
- `fs` - Node.js built-in module

## License

ISC

## Changelog

### Version 2.0.0
- Added comprehensive component management
- Added script monitoring and management
- Added core diagnostics
- Added advanced error handling
- Added code export functionality
- Added synchronous-style methods for reliable operations
- Improved sync method implementation for better reliability
- Maintained full backward compatibility
- Enhanced constructor with options support

### Version 1.5.8
- Basic Q-Sys core interaction
- Code push/pull functionality
- Simple error handling