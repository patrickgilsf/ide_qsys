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
		for (let str of data.split(/\u0000/).filter(Boolean)) {
			try {
				if (str && JSON.parse(str)) {
					rtn.push(JSON.parse(str));
				}
			} catch (e) {
				if (String(e).match(/position (\d+)/)) {
					let pos = Number(String(e).match(/position (\d+)/)[1]);
					console.log("Error at position: ", pos);
				}
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
		verbose: false
	}) => {
		return new Promise((resolve, reject) => {
			let client = new net.Socket();
			let fullString = "";
			
			// Set connection timeout
			client.setTimeout(10000);
			
			// Set up error handlers
			client.on('error', (err) => {
				client.destroy();
				reject(new Error(`QRC connection error for ${this.ip}: ${err.message}`));
			});
			
			client.on('timeout', () => {
				client.destroy();
				reject(new Error(`QRC connection timeout for ${this.ip} after 10 seconds`));
			});
			
			// Add overall operation timeout
			const operationTimeout = setTimeout(() => {
				client.destroy();
				reject(new Error(`QRC operation timeout for ${this.ip} after 30 seconds`));
			}, 30000);
			
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
										clearTimeout(operationTimeout);
										client.destroy();
										resolve(r.result);
									}
									if (r.error) {
										clearTimeout(operationTimeout);
										client.destroy();
										reject(new Error(`QRC error for ${this.ip}: ${r.error.message || r.error.code || 'Unknown error'}`));
									}
								}
							}
						} else {
							// Sync mode: wait for complete response or timeout
							if (d.search(this.nt) !== -1) {
								client.end();
								clearTimeout(operationTimeout);
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
	async connect() {
		if (this.isConnected && this.isAuthenticated) {
			return true; // Already connected
		}

		return new Promise((resolve, reject) => {
			this.client = new net.Socket();
			let fullString = "";
			
			this.client.setTimeout(10000);
			
			this.client.on('error', (err) => {
				this.isConnected = false;
				this.isAuthenticated = false;
				reject(new Error(`QRC connection error for ${this.ip}: ${err.message}`));
			});
			
			this.client.on('timeout', () => {
				this.disconnect();
				reject(new Error(`QRC connection timeout for ${this.ip} after 10 seconds`));
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
	async sendRequest(requestData, timeout = 10000) {
		if (!this.isConnected || !this.isAuthenticated) {
			throw new Error(`QRC session not established for ${this.ip}`);
		}

		return new Promise((resolve, reject) => {
			let fullString = "";
			let requestComplete = false;
			const requestId = this.requestId++;
			
			const request = { ...requestData, id: requestId };

			const responseHandler = (data) => {
				if (requestComplete) return;
				
				fullString += data;
				if (data.search(this.nt) !== -1) {
					for (let r of this._parseData(fullString)) {
						if (r.id === requestId) {
							requestComplete = true;
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

			setTimeout(() => {
				if (!requestComplete) {
					requestComplete = true;
					this.client.removeListener('data', responseHandler);
					reject(new Error(`QRC request timeout for ${this.ip} after ${timeout}ms`));
				}
			}, timeout);
		});
	}

	// Disconnect and cleanup
	disconnect() {
		if (this.client) {
			this.client.destroy();
			this.client = null;
		}
		this.isConnected = false;
		this.isAuthenticated = false;
		
		if (this.operationTimeout) {
			clearTimeout(this.operationTimeout);
			this.operationTimeout = null;
		}
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

	// Get script errors with enhanced functionality
	async getScriptErrors(opt = {}) {
		let rtn = [];
		for (let cmp of await this.getComponentsSync()) {
			if (!cmp.Type.includes('script') && !cmp.Type.includes("PLUGIN")) continue;
			if (opt.scriptName && cmp.Name != opt.scriptName) continue;

			const Controls = await this.getControlsSync(cmp.ID);
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
		}

		if (opt.scriptName) {
			if (rtn.length > 1) throw new Error(`returning multiple components for ${opt.scriptName}!`);
			return rtn[0];
		} else {
			return rtn;
		}
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
			
			if (callback && typeof callback === 'function') {
				return callback(null, result);
			}
			return result;
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
}

export default Core;