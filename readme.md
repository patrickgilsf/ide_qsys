# ide_qsys

A comprehensive Node.js library for programmatically interacting with Q-Sys cores. This enhanced version maintains full backward compatibility while adding powerful new functionality for component management, script monitoring, and advanced Q-Sys operations.

## Features

### ✅ Backward Compatibility
- All existing code using `ide_qsys` continues to work without changes
- Legacy constructor patterns and methods preserved
- Seamless upgrade path for existing users

### 🚀 Enhanced Functionality
- **Component Management**: Get and set component controls
- **Script Monitoring**: Monitor script errors and status issues
- **Script Management**: Restart scripts and process issues automatically
- **Core Diagnostics**: Get system health information
- **Advanced Error Handling**: Robust timeouts and connection management
- **Code Export**: Extract all script code from systems

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
  pw: 'password',
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
  pin: 'password',  // Note: 'pin' instead of 'pw'
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
- `pw` or `pin` (string): Password for authentication
- `comp` (string): Default component name
- `options` (object): Additional options
  - `systemName` (string): System name for logging
  - `verbose` (boolean): Enable verbose logging

### Legacy Methods (Backward Compatible)

#### `update(input, options)`
Push code or data to a component.

```javascript
await core.update('script.lua', { type: 'code', id: 1234 });
```

#### `retrieve(options)`
Pull data from a component.

```javascript
const data = await core.retrieve({ 
  verbose: true, 
  type: 'code',
  output: 'output.json' 
});
```

### New Methods

#### Component Management

##### `getComponent(comp, ctl, opt)`
Get a specific control from a component.

```javascript
const result = await core.getComponent('MyComponent', 'MyControl');
```

##### `getComponents(opt)`
Get all components from the core.

```javascript
const components = await core.getComponents();
```

##### `getControls(comp, opt)`
Get all controls for a component.

```javascript
const controls = await core.getControls('MyComponent');
```

#### Control Setting

##### `setControl(comp, ctl, value, options)`
Set a control value.

```javascript
await core.setControl('MyComponent', 'MyControl', 'newValue', {
  ramp: 1000,  // Ramp time in ms
  verbose: true
});
```

##### `setControls(comp, ctls, options)`
Set multiple controls at once.

```javascript
const controls = [
  { Name: 'Control1', Value: 'Value1' },
  { Name: 'Control2', Value: 'Value2' }
];
await core.setControls('MyComponent', controls);
```

#### Script Monitoring

##### `getScriptErrors(opt)`
Get script errors from the core.

```javascript
// Get all errors
const errors = await core.getScriptErrors();

// Get errors for specific script
const error = await core.getScriptErrors({ scriptName: 'MyScript' });
```

##### `getScriptStatuses(opt)`
Get script status issues.

```javascript
const statuses = await core.getScriptStatuses();
```

##### `restartScript(componentName, options)`
Restart a script or plugin.

```javascript
const success = await core.restartScript('MyScript');
```

##### `processScriptIssues(systemName, site, ip)`
Advanced script issue processing with automatic restart and validation.

```javascript
const result = await core.processScriptIssues('SystemName', 'SiteName', '192.168.1.100');

console.log('Script Errors:', result.scriptErrors);
console.log('Script Statuses:', result.scriptStatuses);
console.log('Persistent Errors:', result.persistentErrors);
console.log('Persistent Statuses:', result.persistentStatuses);
console.log('Splunk Events:', result.splunkEvents);
```

#### Core Diagnostics

##### `getCoreDiagnostics(opt)`
Get core system diagnostics.

```javascript
const diagnostics = await core.getCoreDiagnostics();
console.log('Temperature:', diagnostics['system.temperature']);
console.log('Fan Speed:', diagnostics['system.fan.1.speed']);
console.log('Grandmaster:', diagnostics['grandmaster.name']);
```

#### Code Export

##### `exportCode(opt)`
Export all script code from the system.

```javascript
const codeExport = await core.exportCode();
console.log('Scripts:', Object.keys(codeExport));
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
  pw: 'password',
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
  pw: 'password',
  comp: 'MyComponent'
});

// New (optional)
const core = new Core({
  ip: '192.168.1.100',
  username: 'admin',
  pin: 'password',  // Changed from 'pw' to 'pin'
  comp: 'MyComponent',
  options: { systemName: 'MySystem' }
});
```

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
- Maintained full backward compatibility
- Enhanced constructor with options support

### Version 1.5.8
- Basic Q-Sys core interaction
- Code push/pull functionality
- Simple error handling