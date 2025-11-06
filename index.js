import net from 'net';

/**
 * Core - Enhanced Q-SYS QRC connection manager
 * High-performance session-based architecture with full backwards compatibility
 * 
 * DESIGN PATTERNS:
 * - Methods ending in "Sync": Connect → Auth → Action → Disconnect (single-shot)
 * - Methods without "Sync": Require active session, provide callback for follow-up actions
 * - Session management: Explicit connect/disconnect for persistent connections
 */
class Core {
	constructor(options = {}) {
		this.ip = options.ip || '';
		this.username = options.username || '';
		this.pin = options.pin || options.password || options.pw || '';
		this.comp = options.comp || '';
		this.timeout = options.timeout || 10000; // Default 10 second timeout
		this.options = { systemName: options.systemName || this.ip, verbose: options.verbose || false };
		
		// Session state
		this.client = null;
		this.isConnected = false;
		this.isAuthenticated = false;
		this.operationTimeout = null;
		
		// Protocol
		this.nt = "\u0000";
		this.requestId = 1000;
	}

	// Parse QRC response data
	_parseData(data) {
		let rtn = [];
		const chunks = data.split(/\u0000/).filter(Boolean);
		
		for (let str of chunks) {
			if (!str || str.trim() === '') continue;
			
			try {
				const parsed = JSON.parse(str);
				if (parsed) {
					rtn.push(parsed);
				}
			} catch (e) {
				// Only log parsing errors in debug mode or if they're unexpected
				if (this.options && this.options.debug) {
					console.warn(`QRC JSON parse warning: ${e.message} (chunk: "${str.substring(0, 50)}...")`);
				}
				// Skip malformed chunks silently - this is normal for QRC protocol
				continue;
			}
		}
		return rtn;
	}

	// Enhanced login method
	_login = async (inputClient) => {
		inputClient.write(`${JSON.stringify({
			"jsonrpc": "2.0",
			"method": "Logon",
			"params": {
				"User": this.username,
				"Password": this.pin
			}
		})}${this.nt}`);
	}

	// Enhanced authentication check
	_authCheck = async (string, inputClient) => {
		return new Promise((resolve, reject) => {
			let rtn = {};
			inputClient.write(`${JSON.stringify({
				"jsonrpc": "2.0",
				"method": "StatusGet",
				"id": 1234,
				"params": 0
			})}${this.nt}`);
			
			inputClient.on('data', (d) => {
				string += d;
				if (d.search(this.nt) !== -1) {
					for (let r of this._parseData(string)) {
						if (!r.id) continue;
						if (r.error) {
							rtn = r.error;
							rtn.authenticated = false;
						}
						if (r.result) {
							rtn.authenticated = true;
						}
						resolve(rtn);
					}
				}
			});
		});
	}

	// Enhanced _sendData method for backwards compatibility
	_sendData = async (data, options = {
		sync: false,
		send: false,
		verbose: false,
		timeout: null
	}) => {
		const timeout = options.timeout || this.timeout;
		const operationTimeout = timeout * 3; // Operation timeout is 3x connection timeout
		
		return new Promise((resolve, reject) => {
			let client = new net.Socket();
			let fullString = "";
			
			// Set connection timeout
			client.setTimeout(timeout);
			
			// Set up error handlers
			client.on('error', (err) => {
				client.destroy();
				reject(new Error(`QRC connection error for ${this.ip}: ${err.message}`));
			});
			
			client.on('timeout', () => {
				client.destroy();
				reject(new Error(`QRC connection timeout for ${this.ip} after ${timeout}ms`));
			});
			
			// Add overall operation timeout
			const operationTimeoutHandler = setTimeout(() => {
				client.destroy();
				reject(new Error(`QRC operation timeout for ${this.ip} after ${operationTimeout}ms`));
			}, operationTimeout);
			
			client.connect(1710, this.ip, async () => {
				client.setTimeout(0);
				client.setEncoding('utf8');

				await this._login(client);
				let authorized = await this._authCheck(fullString, client);

				if (!authorized.authenticated) {
					clearTimeout(operationTimeout);
					client.destroy();
					reject(new Error(`QRC authentication failed for ${this.ip}: ${authorized.message || 'Invalid credentials'}`));
				} else {
					client.on('data', async (d) => {
						if (this.options.verbose) console.log(d);
						fullString += d;

						if (options.sync == false) {
							if (d.search(this.nt) !== -1) {
								for (let r of this._parseData(fullString)) {
									if (!r.id) continue;
									if (r.result) {
										clearTimeout(operationTimeoutHandler);
										client.destroy();
										resolve(r.result);
									}
									if (r.error) {
										clearTimeout(operationTimeoutHandler);
										client.destroy();
										reject(new Error(`QRC error for ${this.ip}: ${r.error.message || r.error.code || 'Unknown error'}`));
									}
								}
							}
						} else {
							// Sync mode: wait for complete response or timeout
							if (d.search(this.nt) !== -1) {
								client.end();
								clearTimeout(operationTimeoutHandler);
								for (let r of this._parseData(fullString)) {
									if (r.result) resolve(r.result);
									if (r.error) reject(new Error(`QRC error for ${this.ip}: ${r.error.message || r.error.code || 'Unknown error'}`));
								}
							}
						}
					});
					
					// Write data to socket
					client.write(`${JSON.stringify(data)}${this.nt}`);
				}
			});
		});
	}

	// SESSION MANAGEMENT METHODS

	// Establish persistent connection
	async connect(options = {}) {
		if (this.isConnected && this.isAuthenticated) {
			return true; // Already connected
		}

		const timeout = options.timeout || this.timeout;

		return new Promise((resolve, reject) => {
			this.client = new net.Socket();
			let fullString = "";
			
			this.client.setTimeout(timeout);
			
			this.client.on('error', (err) => {
				this.isConnected = false;
				this.isAuthenticated = false;
				reject(new Error(`QRC connection error for ${this.ip}: ${err.message}`));
			});
			
			this.client.on('timeout', () => {
				this.disconnect();
				reject(new Error(`QRC connection timeout for ${this.ip} after ${timeout}ms`));
			});
			
			this.client.connect(1710, this.ip, async () => {
				this.client.setTimeout(0);
				this.client.setEncoding('utf8');
				this.isConnected = true;

				try {
					await this._login(this.client);
					let authorized = await this._authCheck(fullString, this.client);
					
					if (!authorized.authenticated) {
						this.disconnect();
						reject(new Error(`QRC authentication failed for ${this.ip}: ${authorized.message || 'Invalid credentials'}`));
					} else {
						this.isAuthenticated = true;
						resolve(true);
					}
				} catch (error) {
					this.disconnect();
					reject(error);
				}
			});
		});
	}

	// Send request using persistent session
	async sendRequest(requestData, timeout = null) {
		timeout = timeout || this.timeout;
		if (!this.isConnected || !this.isAuthenticated) {
			throw new Error(`QRC session not established for ${this.ip}`);
		}

		return new Promise((resolve, reject) => {
			let fullString = "";
			let requestComplete = false;
			const requestId = this.requestId++;
			
			const request = { ...requestData, id: requestId };

			// Set up timeout handler
			const timeoutHandler = setTimeout(() => {
				if (!requestComplete) {
					requestComplete = true;
					this.client.removeListener('data', responseHandler);
					reject(new Error(`QRC request timeout for ${this.ip} after ${timeout}ms`));
				}
			}, timeout);

			const responseHandler = (data) => {
				if (requestComplete) return;
				
				fullString += data;
				if (data.search(this.nt) !== -1) {
					for (let r of this._parseData(fullString)) {
						if (r.id === requestId) {
							requestComplete = true;
							clearTimeout(timeoutHandler); // Clear timeout on successful response
							this.client.removeListener('data', responseHandler);
							
							if (r.error) {
								reject(new Error(`QRC error for ${this.ip}: ${r.error.message || r.error.code || 'Unknown error'}`));
							} else if (r.result !== undefined) {
								resolve(r.result);
							}
							return;
						}
					}
				}
			};

			this.client.on('data', responseHandler);
			this.client.write(`${JSON.stringify(request)}${this.nt}`);
		});
	}

	// Disconnect and cleanup
	disconnect() {
		const wasConnected = this.isConnected;
		
		if (this.client) {
			// Clear socket timeout before destroying
			this.client.setTimeout(0);
			this.client.removeAllListeners();
			this.client.destroy();
			this.client = null;
		}
		this.isConnected = false;
		this.isAuthenticated = false;
		
		if (this.operationTimeout) {
			clearTimeout(this.operationTimeout);
			this.operationTimeout = null;
		}
		
		return !this.isConnected; // Returns true if successfully disconnected
	}
	
	// Check current connection status
	get connected() {
		return this.isConnected;
	}

	// BACKWARDS COMPATIBLE SYNC METHODS (Connect → Auth → Action → Disconnect)

	// Get all components (sync version - backwards compatible)
	getComponentsSync = async () => {
		return await this._sendData({
			"jsonrpc": "2.0",
			"method": "Component.GetComponents",
			"params": "test",
			"id": 1234
		}, { verbose: this.options.verbose, sync: true });
	}

	// Get component controls (sync version - backwards compatible)
	getControlsSync = async (comp = this.comp, opt = {}) => {
		return await this._sendData({
			"jsonrpc": "2.0",
			"id": 1234,
			"method": "Component.GetControls",
			"params": {
				"Name": comp
			}
		}, { verbose: opt.verbose, sync: true });
	}

	// Get single component (sync version - backwards compatible)
	getComponentSync = async (comp, ctl, opt = {}) => {
		return await this._sendData({
			"jsonrpc": "2.0",
			"id": 1234,
			"method": "Component.Get",
			"params": {
				"Name": comp,
				"Controls": [
					{ "Name": ctl }
				]
			}
		}, { verbose: opt.verbose, sync: true });
	}

	// Set control (sync version - backwards compatible)
	setControlSync = async (comp, ctl, value, options = {}) => {
		let obj = {
			"jsonrpc": "2.0",
			"id": 1234,
			"method": "Component.Set",
			"params": {
				"Name": comp,
				"Controls": [
					{
						"Name": ctl,
						"Value": value
					}
				]
			}
		};
		if (options.ramp) obj.params.Controls[0].Ramp = options.ramp;
		return await this._sendData(obj, { verbose: options.verbose, sync: true });
	}

	// SESSION-BASED METHODS (Require active session, provide callback capability)

	// Get all components (session version - requires active connection)
	async getComponents(callback = null) {
		const result = await this.sendRequest({
			"jsonrpc": "2.0",
			"method": "Component.GetComponents"
		});
		
		if (callback && typeof callback === 'function') {
			return callback(null, result);
		}
		return result;
	}

	// Get component controls (session version - requires active connection)
	async getControls(componentId, callback = null) {
		const result = await this.sendRequest({
			"jsonrpc": "2.0",
			"method": "Component.GetControls",
			"params": {
				"Name": componentId
			}
		});
		
		if (callback && typeof callback === 'function') {
			return callback(null, result);
		}
		return result;
	}

	// Get single component (session version - requires active connection)
	async getComponent(componentName, controlName, callback = null) {
		const result = await this.sendRequest({
			"jsonrpc": "2.0",
			"method": "Component.Get",
			"params": {
				"Name": componentName,
				"Controls": [
					{ "Name": controlName }
				]
			}
		});
		
		if (callback && typeof callback === 'function') {
			return callback(null, result);
		}
		return result;
	}

	// Set component (session version - requires active connection)
	async setComponent(componentName, controlName, value, callback = null) {
		const result = await this.sendRequest({
			"jsonrpc": "2.0",
			"method": "Component.Set",
			"params": {
				"Name": componentName,
				"Controls": [
					{
						"Name": controlName,
						"Value": value
					}
				]
			}
		});
		
		if (callback && typeof callback === 'function') {
			return callback(null, result);
		}
		return result;
	}

	// BACKWARDS COMPATIBLE LEGACY METHODS

	// Legacy login method for backward compatibility
	loginLegacy = () => {
		return this.username && this.pin
		?
		JSON.stringify({
			"jsonrpc": "2.0",
			"method": "Logon",
			"params": {
				"User": this.username,
				"Password": this.pin
			}
		})
		:
		false;
	};

	// Legacy addCode method for backward compatibility
	_addCode = (comp, code, id, type) => {
		return JSON.stringify({
			"jsonrpc": "2.0",
			"id": id,
			"method": "Component.Set",
			"params": {
				"Name": comp,
				"Controls": [
					{
						"Name": type,
						"Value": code
					}
				]
			}
		})
	};

	// Legacy update method (backwards compatible)
	update = async (input, options = {}) => {
		let { id = 1234, type = "code" } = options;
		
		const data = {
			"jsonrpc": "2.0",
			"id": id,
			"method": "Component.Set",
			"params": {
				"Name": this.comp,
				"Controls": [
					{
						"Name": type,
						"Value": typeof input === 'string' && type === "code" ? 
							require('fs').readFileSync(input, 'utf8') : input
					}
				]
			}
		};

		return await this._sendData(data, { sync: true });
	};

	// Legacy pullCode method for backward compatibility
	_pullCode = (comp, id, type) => {
		if (!type) {
			return JSON.stringify({
				"jsonrpc": "2.0",
				"id": id,
				"method": "Component.GetControls",
				"params": {
					"Name": comp
				}   
			})
		} else {
			return JSON.stringify({
				"jsonrpc": "2.0",
				"id": id,
				"method": "Component.Get",
				"params": {
					"Name": comp,
					"Controls": [
						{
							"Name": type
						}
					]
				}
			})
		}
	}

	// Legacy retrieve method (backwards compatible)
	retrieve = async (options = {}) => {
		options.id = options.id || "1234";
		
		const data = this._pullCode(this.comp, options.id, options.type);
		const result = await this._sendData(JSON.parse(data), { sync: true, verbose: options.verbose });
		
		if (options.output) {
			require('fs').writeFileSync(options.output, JSON.stringify(result, null, 2));
		}
		
		return result;
	};

	// ENHANCED HELPER METHODS

	// Get script errors with enhanced functionality (session-based, optimized)
	async getScriptErrors(opt = {}) {
		// Optimization 1: If scriptName provided, get controls directly without iterating components
		if (opt.scriptName) {
			try {
				const Controls = await this.getControls(opt.scriptName);
				let errorObj = null;
				let errorLogs = null;

				for (let control of Controls.Controls) {
					if (control.Name === "script.error.count" && control.Value > 0) {
						errorObj = {
							Component: opt.scriptName,
							Value: control.Value
						};
					}
					if (control.Name === "log.history") {
						errorLogs = control.String.length > 30 ? 
							`${control.String.substring(0, 30)} ...` : 
							control.String;
					}
				}

				// Component found but no errors
				if (!errorObj) {
					return {
						Component: opt.scriptName,
						Found: true,
						Message: `Component '${opt.scriptName}' found with no errors`,
						Value: 0,
						Details: null
					};
				}

				// Component found with errors
				errorObj.Details = errorLogs;
				return {
					...errorObj,
					Found: true,
					Message: `Component '${opt.scriptName}' found with ${errorObj.Value} error(s)`
				};

			} catch (error) {
				// Component not found or not accessible
				const allComponents = await this.getComponents();
				const totalScriptComponents = allComponents.filter(cmp => 
					cmp.Type.includes('script') || cmp.Type.includes("PLUGIN")
				).length;

				return {
					Component: opt.scriptName,
					Found: false,
					Message: `Component '${opt.scriptName}' not found. Available script components: ${totalScriptComponents}`,
					Value: null,
					Details: null
				};
			}
		}

		// Get all script errors (when no specific scriptName provided)
		let rtn = [];
		let totalScriptComponents = 0;
		
		for (let cmp of await this.getComponents()) {
			if (!cmp.Type.includes('script') && !cmp.Type.includes("PLUGIN")) continue;
			totalScriptComponents++;

			try {
				const Controls = await this.getControls(cmp.Name);
				let errorObj = null;
				let errorLogs = null;

				for (let control of Controls.Controls) {
					if (control.Name === "script.error.count" && control.Value > 0) {
						errorObj = {
							Component: cmp.Name,
							Value: control.Value
						};
					}
					if (control.Name === "log.history") {
						errorLogs = control.String.length > 30 ? 
							`${control.String.substring(0, 30)} ...` : 
							control.String;
					}
				}

				if (errorObj) {
					errorObj.Details = errorLogs;
					rtn.push(errorObj);
				}
			} catch (error) {
				// Skip components that can't be accessed
				continue;
			}
		}

		// Enhanced return for all scripts query
		return {
			errors: rtn,
			summary: {
				totalScriptComponents: totalScriptComponents,
				componentsWithErrors: rtn.length,
				totalErrors: rtn.reduce((sum, err) => sum + err.Value, 0)
			}
		};
	}

	// Collect logs from a component with timestamp filtering (session-based)
	async collectLogs(componentName = this.comp, callback = null) {
		try {
			const result = await this.getComponent(componentName, "log.history");
			
			if (!result || !result.Controls || !result.Controls[0] || !result.Controls[0].Strings) {
				const emptyResult = [];
				if (callback && typeof callback === 'function') {
					return callback(null, emptyResult);
				}
				return emptyResult;
			}

			// Filter out empty lines and remove timestamps
			const cleanLogs = result.Controls[0].Strings
				.map(line => line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+\s*/, ''))
				.filter(line => line !== "");

			if (callback && typeof callback === 'function') {
				return callback(null, cleanLogs);
			}
			return cleanLogs;
		} catch (error) {
			if (callback && typeof callback === 'function') {
				return callback(error, []);
			}
			console.error(`Failed to collect logs from ${componentName}: ${error.message}`);
			return [];
		}
	}

	// Get current code from a component (session-based)
	async getCode(componentName, callback = null) {
		try {
			const result = await this.getComponent(componentName, "code");
			const code = result.Controls[0].String;
			
			if (callback && typeof callback === 'function') {
				return callback(null, code);
			}
			return code;
		} catch (error) {
			if (callback && typeof callback === 'function') {
				return callback(error, null);
			}
			throw error;
		}
	}

	// Update component code (session-based)
	async updateCode(componentName, code, callback = null) {
		try {
			const result = await this.setComponent(componentName, "code", code);
			
			// Wait a moment for the script to process
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			// Get error count and logs after update
			const errors = await this.getScriptErrors({ scriptName: componentName });
			const logs = await this.collectLogs(componentName);
			
			const enhancedResult = {
				...result,
				deployment: {
					componentName,
					codeLength: code.length,
					errorCount: errors ? errors.Value : 0,
					errorDetails: errors ? errors.Details : null,
					logs: logs || [],
					timestamp: new Date().toISOString()
				}
			};
			
			if (callback && typeof callback === 'function') {
				return callback(null, enhancedResult);
			}
			return enhancedResult;
		} catch (error) {
			if (callback && typeof callback === 'function') {
				return callback(error, null);
			}
			throw error;
		}
	}

	// Restart script
	restartScript = async (componentName, options = {}) => {
		return await this.setControlSync(componentName, 'reload', 1, options);
	}

	// Export all script code from the system
	exportCode = async (opt = {}) => {
		const components = await this.getComponentsSync();
		if (!components || !Array.isArray(components)) {
			throw new Error(`No components found for ${this.ip}`);
		}
		
		let rtn = {};
		for (let cmp of components) {
			if (cmp.Type == "device_controller_script") {
				let ctrls = await this.getControlsSync(cmp.ID);
				for (let ctrl of ctrls.Controls) {
					if (ctrl.Name == "code") rtn[cmp.Name] = ctrl.String;
				}
			}
		}
		return rtn;
	}

	// Get script statuses
	getScriptStatuses = async (opt = {}) => {
		let rtn = [];
		for (let cmp of await this.getComponentsSync()) {
			if (!cmp.Type.includes('script') && !cmp.Type.includes("PLUGIN")) continue
			if (opt.scriptName && cmp.Name != opt.scriptName) continue;

			const Controls = await this.getControlsSync(cmp.ID);
			for (const control of Controls.Controls) {
				if (control.Type == "Status" && ![0,3].includes(control.Value)) {
					if (control.Name == "StreamStatus" || control.String.includes("Connected to Encoder")) continue;
					rtn.push({
						Component: cmp.Name,
						Control: control.Name,
						Value: control.Value,
						String: control.String
					});
				}
			}
		}
		return rtn;
	}

	// runs getScriptErrors and getScriptStatuses, then restarts any script that has an error and returns the result
	processScriptIssues = async (systemName, site, ip) => {
		const result = {
			scriptErrors: [],
			scriptStatuses: [],
			persistentErrors: [],
			persistentStatuses: []
		};

		try {
			// Get initial errors and statuses
			const [initialErrors, initialStatuses] = await Promise.all([
				this.getScriptErrors().catch(e => { console.log(`${systemName}: getScriptErrors failed - ${e.message}`); return []; }),
				this.getScriptStatuses().catch(e => { console.log(`${systemName}: getScriptStatuses failed - ${e.message}`); return []; })
			]);

			result.scriptErrors = initialErrors;
			result.scriptStatuses = initialStatuses;

			// Get all unique components that have issues
			const componentsWithIssues = new Set([
				...initialErrors.map(e => e.Component),
				...initialStatuses.map(s => s.Component)
			]);

			if (componentsWithIssues.size === 0) {
				return result;
			}

			console.log(`Restarting ${componentsWithIssues.size} component(s) with issues for ${systemName}`);

			// Restart each component and re-validate
			for (const componentName of componentsWithIssues) {
				try {
					const restarted = await this.restartScript(componentName);

					if (restarted) {
						// Re-check both errors and statuses for this component
						const [remainingErrors, remainingStatuses] = await Promise.all([
							this.getScriptErrors({scriptName: componentName}).catch(() => null),
							this.getScriptStatuses({scriptName: componentName}).catch(() => [])
						]);

						// Handle persistent errors
						if (remainingErrors && remainingErrors.Component === componentName) {
							result.persistentErrors.push(remainingErrors);
							console.log(`Script error persists after restart for ${componentName} on ${systemName}`);
						} else {
							const hadError = initialErrors.some(e => e.Component === componentName);
							if (hadError) {
								console.log(`Script error resolved after restart for ${componentName} on ${systemName}`);
							}
						}

						// Handle persistent status issues
						if (remainingStatuses && remainingStatuses.length > 0) {
							result.persistentStatuses.push(...remainingStatuses);
							console.log(`Script status issue persists after restart for ${componentName} on ${systemName}`);
						} else {
							const hadStatus = initialStatuses.some(s => s.Component === componentName);
							if (hadStatus) {
								console.log(`Script status issue resolved after restart for ${componentName} on ${systemName}`);
							}
						}
					} else {
						// Restart failed, keep original issues
						const originalErrors = initialErrors.filter(e => e.Component === componentName);
						const originalStatuses = initialStatuses.filter(s => s.Component === componentName);
						result.persistentErrors.push(...originalErrors);
						result.persistentStatuses.push(...originalStatuses);
						console.error(`Failed to restart ${componentName} on ${systemName}`);
					}
				} catch (error) {
					// Restart attempt failed, keep original issues
					const originalErrors = initialErrors.filter(e => e.Component === componentName);
					const originalStatuses = initialStatuses.filter(s => s.Component === componentName);
					result.persistentErrors.push(...originalErrors);
					result.persistentStatuses.push(...originalStatuses);
					console.error(`Error restarting ${componentName} on ${systemName}:`, error.message);
				}
			}

			return result;
		} catch (error) {
			console.error(`Failed to process script issues for ${systemName}: ${error.message}`);
			// Return original data if processing fails
			result.persistentErrors = result.scriptErrors;
			result.persistentStatuses = result.scriptStatuses;
			return result;
		}
	}

	// Batch operations with session
	async batch(operations, callback = null) {
		const results = [];
		
		for (const operation of operations) {
			try {
				let result;
				
				switch (operation.type) {
					case 'getComponents':
						result = await this.getComponents();
						break;
					case 'getScriptErrors':
						result = await this.getScriptErrors({ scriptName: operation.componentName });
						break;
					case 'getCode':
						result = await this.getCode(operation.componentName);
						break;
					case 'updateCode':
						result = await this.updateCode(operation.componentName, operation.code);
						break;
					default:
						throw new Error(`Unknown operation type: ${operation.type}`);
				}
				
				results.push({
					operation: operation.type,
					success: true,
					result: result
				});
			} catch (error) {
				results.push({
					operation: operation.type,
					success: false,
					error: error.message
				});
			}
		}
		
		if (callback && typeof callback === 'function') {
			return callback(null, results);
		}
		return results;
	}

	// PRODUCTION USE CASE METHODS

	// Deploy one script to multiple Q-SYS cores
	static async deployToMultipleCores(coreConfigs, componentName, scriptCode, options = {}) {
		const results = [];
		const { 
			validateFirst = true, 
			rollbackOnError = true,
			maxConcurrent = 3,
			delayBetween = 1000 
		} = options;

		// Validate all cores can be reached first (if enabled)
		if (validateFirst) {
			console.log(`Validating connectivity to ${coreConfigs.length} cores...`);
			for (const config of coreConfigs) {
				const core = new Core(config);
				try {
					await core.getComponentsSync();
					console.log(`  ${config.ip || config.systemName}: Connected`);
				} catch (error) {
					throw new Error(`Pre-validation failed for ${config.ip || config.systemName}: ${error.message}`);
				}
			}
		}

		// Deploy to cores (with concurrency control)
		const deployPromises = [];
		for (let i = 0; i < coreConfigs.length; i += maxConcurrent) {
			const batch = coreConfigs.slice(i, i + maxConcurrent);
			
			const batchPromises = batch.map(async (config) => {
				const core = new Core(config);
				const systemName = config.systemName || config.ip;
				
				try {
					// Get original code for backup
					const originalCode = await core.getCode(componentName);
					
					// Deploy new code
					const updateResult = await core.updateCode(componentName, scriptCode);
					
					// Wait for additional processing if specified
					if (delayBetween > 1000) {
						await new Promise(resolve => setTimeout(resolve, delayBetween - 1000));
					}
					
					// Check for errors (already included in updateResult)
					if (updateResult.deployment.errorCount > 0) {
						if (rollbackOnError) {
							console.log(`  ${systemName}: Errors detected, rolling back...`);
							await core.updateCode(componentName, originalCode);
							return {
								system: systemName,
								success: false,
								error: `Script errors detected: ${updateResult.deployment.errorDetails}`,
								errorCount: updateResult.deployment.errorCount,
								logs: updateResult.deployment.logs,
								rolledBack: true
							};
						} else {
							return {
								system: systemName,
								success: false,
								error: `Script errors detected: ${updateResult.deployment.errorDetails}`,
								errorCount: updateResult.deployment.errorCount,
								logs: updateResult.deployment.logs,
								rolledBack: false
							};
						}
					}
					
					console.log(`  ${systemName}: Deployed successfully`);
					return {
						system: systemName,
						success: true,
						originalCodeLength: originalCode.length,
						newCodeLength: scriptCode.length,
						errorCount: updateResult.deployment.errorCount,
						logs: updateResult.deployment.logs,
						timestamp: updateResult.deployment.timestamp
					};
					
				} catch (error) {
					return {
						system: systemName,
						success: false,
						error: error.message,
						rolledBack: false
					};
				}
			});
			
			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);
			
			// Delay between batches
			if (i + maxConcurrent < coreConfigs.length && delayBetween > 0) {
				await new Promise(resolve => setTimeout(resolve, delayBetween));
			}
		}

		// Summary
		const successful = results.filter(r => r.success).length;
		const failed = results.filter(r => !r.success).length;
		const rolledBack = results.filter(r => r.rolledBack).length;
		
		console.log(`\nDeployment Summary:`);
		console.log(`  Successful: ${successful}/${coreConfigs.length}`);
		console.log(`  Failed: ${failed}/${coreConfigs.length}`);
		if (rolledBack > 0) {
			console.log(`  Rolled back: ${rolledBack}/${coreConfigs.length}`);
		}

		return {
			results,
			summary: { successful, failed, rolledBack, total: coreConfigs.length }
		};
	}

	// Load script from file
	async loadScriptFromFile(filePath, componentName, options = {}) {
		const fs = await import('fs');
		const { encoding = 'utf8', validate = true } = options;
		
		try {
			const scriptCode = fs.readFileSync(filePath, encoding);
			
			if (validate) {
				// Basic validation
				if (scriptCode.length === 0) {
					throw new Error('Script file is empty');
				}
				if (scriptCode.length > 1000000) { // 1MB limit
					console.warn('Warning: Script file is very large (>1MB)');
				}
			}
			
			if (componentName) {
				const updateResult = await this.updateCode(componentName, scriptCode);
				return {
					success: true,
					filePath,
					...updateResult.deployment
				};
			}
			
			return scriptCode;
			
		} catch (error) {
			throw new Error(`Failed to load script from ${filePath}: ${error.message}`);
		}
	}

	// Save script to file
	async saveScriptToFile(componentName, filePath, options = {}) {
		const fs = await import('fs');
		const path = await import('path');
		const { encoding = 'utf8', createDir = true, backup = false } = options;
		
		try {
			const scriptCode = await this.getCode(componentName);
			
			if (createDir) {
				const dir = path.dirname(filePath);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}
			}
			
			if (backup && fs.existsSync(filePath)) {
				const backupPath = `${filePath}.backup`;
				fs.copyFileSync(filePath, backupPath);
			}
			
			fs.writeFileSync(filePath, scriptCode, encoding);
			
			return {
				success: true,
				componentName,
				filePath,
				codeLength: scriptCode.length,
				backup: backup && fs.existsSync(`${filePath}.backup`)
			};
			
		} catch (error) {
			throw new Error(`Failed to save script to ${filePath}: ${error.message}`);
		}
	}

	// Helper method for checking sync status
	_checkSyncStatus(componentName, filePath, fileCode, componentCode) {
		const fileExists = fileCode !== '';
		const componentExists = componentCode !== '';
		
		if (!fileExists && !componentExists) {
			return {
				status: 'both-missing',
				message: `Neither file nor component exists`,
				inSync: false
			};
		}
		
		if (!fileExists) {
			return {
				status: 'file-missing',
				message: `File missing, component exists (${componentCode.length} chars)`,
				inSync: false
			};
		}
		
		if (!componentExists) {
			return {
				status: 'component-missing', 
				message: `Component missing, file exists (${fileCode.length} chars)`,
				inSync: false
			};
		}
		
		if (fileCode === componentCode) {
			return {
				status: 'in-sync',
				message: `File and component are identical (${fileCode.length} chars)`,
				inSync: true
			};
		}
		
		return {
			status: 'out-of-sync',
			message: `File (${fileCode.length} chars) and component (${componentCode.length} chars) differ`,
			inSync: false,
			fileSample: fileCode.substring(0, 100) + (fileCode.length > 100 ? '...' : ''),
			componentSample: componentCode.substring(0, 100) + (componentCode.length > 100 ? '...' : '')
		};
	}

	// Backup all scripts from the system to a designated folder
	async backupAllScripts(backupDir = null, options = {}) {
		const fs = await import('fs');
		const path = await import('path');
		const { createDir = true, includeEmpty = false, systemName = null, timestamp = false } = options;
		
		// Set default backup directory if none provided
		if (!backupDir) {
			const defaultSystemName = systemName || this.options.systemName || this.ip.replace(/\./g, '-');
			if (timestamp) {
				const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
				backupDir = `./backup_${defaultSystemName}_${timestampStr}`;
			} else {
				backupDir = `./backup_${defaultSystemName}`;
			}
		}
		
		try {
			// Create backup directory if needed
			if (createDir && !fs.existsSync(backupDir)) {
				fs.mkdirSync(backupDir, { recursive: true });
			}
			
			const components = await this.getComponents();
			const exportedScripts = {};
			let scriptCount = 0;
			
			for (let component of components) {
				if (component.Type === "device_controller_script") {
					try {
						const code = await this.getCode(component.Name);
						
						// Skip empty scripts unless includeEmpty is true
						if (!includeEmpty && (!code || code.trim() === '')) {
							continue;
						}
						
						exportedScripts[component.Name] = code;
						scriptCount++;
						
						// Write script to file
						const scriptPath = path.join(backupDir, `${component.Name}.lua`);
						fs.writeFileSync(scriptPath, code, 'utf8');
						
					} catch (error) {
						console.log(`Warning: Could not backup script ${component.Name}: ${error.message}`);
					}
				}
			}
			
			// Create backup manifest
			const manifest = {
				timestamp: new Date().toISOString(),
				systemName: systemName || this.options.systemName || this.ip,
				systemIP: this.ip,
				totalComponents: components.length,
				scriptComponents: components.filter(c => c.Type === "device_controller_script").length,
				backedUpScripts: scriptCount,
				scripts: Object.keys(exportedScripts).map(name => ({
					name,
					size: exportedScripts[name].length,
					path: `${name}.lua`
				}))
			};
			
			// Write manifest file
			const manifestPath = path.join(backupDir, 'backup_manifest.json');
			fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
			
			return {
				success: true,
				backupDir,
				scriptCount,
				totalComponents: components.length,
				manifest: manifestPath,
				scripts: Object.keys(exportedScripts)
			};
			
		} catch (error) {
			throw new Error(`Backup failed: ${error.message}`);
		}
	}

	// Sync script with file (bidirectional)
	async syncScriptWithFile(componentName, filePath, direction, options = {}) {
		const fs = await import('fs');
		const { createBackup = true } = options;
		
		if (!['push', 'pull', 'check'].includes(direction)) {
			throw new Error(`Invalid direction: ${direction}. Use 'push', 'pull', or 'check'`);
		}
		
		try {
			const fileExists = fs.existsSync(filePath);
			let fileCode = '';
			let componentCode = '';
			
			// Get current states
			if (fileExists) {
				fileCode = fs.readFileSync(filePath, 'utf8');
			}
			
			try {
				componentCode = await this.getCode(componentName);
			} catch (error) {
				// Component doesn't exist
				componentCode = '';
			}
			
			// Handle 'check' direction
			if (direction === 'check') {
				const status = this._checkSyncStatus(componentName, filePath, fileCode, componentCode);
				return {
					success: true,
					action: 'check',
					status: status.status,
					message: status.message,
					inSync: status.inSync,
					...(status.fileSample && { fileSample: status.fileSample }),
					...(status.componentSample && { componentSample: status.componentSample })
				};
			}
			
			// Perform sync
			if (direction === 'push') {
				if (!fileExists) {
					throw new Error(`Cannot push: File ${filePath} does not exist`);
				}
				const updateResult = await this.updateCode(componentName, fileCode);
				return {
					success: true,
					action: 'push',
					direction: 'file-to-component',
					codeLength: fileCode.length,
					...updateResult.deployment
				};
			} else if (direction === 'pull') {
				if (!componentCode) {
					throw new Error(`Cannot pull: Component ${componentName} has no code`);
				}
				
				const path = await import('path');
				
				// Create directory if needed
				const dir = path.dirname(filePath);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}
				
				// Create backup if file exists
				let backupPath = null;
				if (createBackup && fileExists) {
					backupPath = `${filePath}.backup`;
					fs.copyFileSync(filePath, backupPath);
				}
				
				fs.writeFileSync(filePath, componentCode, 'utf8');
				
				return {
					success: true,
					action: 'pull',
					direction: 'component-to-file',
					codeLength: componentCode.length,
					...(backupPath && { backupPath })
				};
			}
			
		} catch (error) {
			throw new Error(`Sync failed: ${error.message}`);
		}
	}

	// Monitor script health across multiple cores
	static async monitorScriptHealth(coreConfigs, componentNames = [], options = {}) {
		const { 
			includeErrors = true, 
			includeStatus = true, 
			includeLogs = false,
			logLines = 5 
		} = options;
		
		const results = [];
		
		for (const config of coreConfigs) {
			const core = new Core(config);
			const systemName = config.systemName || config.ip;
			
			try {
				await core.connect();
				
				const systemResult = {
					system: systemName,
					connected: true,
					components: []
				};
				
				// Get all components if none specified
				let targetComponents = componentNames;
				if (targetComponents.length === 0) {
					const allComponents = await core.getComponents();
					targetComponents = allComponents
						.filter(c => c.Type.includes('script'))
						.map(c => c.Name);
				}
				
				// Check each component
				for (const componentName of targetComponents) {
					const componentResult = {
						name: componentName,
						exists: false
					};
					
					try {
						// Check if component exists
						const components = await core.getComponents();
						const component = components.find(c => c.Name === componentName);
						
						if (component) {
							componentResult.exists = true;
							
							if (includeErrors) {
								const errors = await core.getScriptErrors({ scriptName: componentName });
								componentResult.errors = errors ? errors.Value : 0;
								if (errors && errors.Details) {
									componentResult.errorDetails = errors.Details;
								}
							}
							
							if (includeStatus) {
								const statuses = await core.getScriptStatuses({ scriptName: componentName });
								componentResult.statusIssues = statuses.length;
								if (statuses.length > 0) {
									componentResult.statusDetails = statuses.slice(0, 3);
								}
							}
							
							if (includeLogs) {
								const logs = await core.collectLogs(componentName);
								componentResult.recentLogs = logs.slice(-logLines);
							}
						}
						
					} catch (error) {
						componentResult.error = error.message;
					}
					
					systemResult.components.push(componentResult);
				}
				
				await core.disconnect();
				results.push(systemResult);
				
			} catch (error) {
				results.push({
					system: systemName,
					connected: false,
					error: error.message
				});
			}
		}
		
		// Generate summary
		const connectedSystems = results.filter(r => r.connected).length;
		const totalComponents = results.reduce((sum, r) => 
			sum + (r.components ? r.components.length : 0), 0);
		const healthyComponents = results.reduce((sum, r) => 
			sum + (r.components ? r.components.filter(c => 
				c.exists && (!includeErrors || c.errors === 0) && 
				(!includeStatus || c.statusIssues === 0)
			).length : 0), 0);
		
		return {
			results,
			summary: {
				connectedSystems,
				totalSystems: coreConfigs.length,
				totalComponents,
				healthyComponents,
				healthPercentage: totalComponents > 0 ? 
					Math.round((healthyComponents / totalComponents) * 100) : 0
			}
		};
	}
}

export default Core;