import fs from 'fs';
import net from 'net';

const sleep = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout))
const timeoutPromise = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout))

class Core {
  constructor(options = {}) {
    // Support both old and new constructor patterns
    if (typeof options === 'string' || (options && options.ip && !options.username)) {
      // Old pattern: constructor(ip) or constructor({ip, username, pw, comp})
      this.ip = options.ip || options;
      this.username = options.username || '';
      this.pin = options.pw || options.pin || '';
      this.comp = options.comp || '';
      this.options = { systemName: options.systemName || this.ip };
    } else {
      // New pattern: constructor(ip, options) or constructor({ip, ...})
      this.ip = options.ip || '';
      this.username = options.username || '';
      this.pin = options.pin || '';
      this.comp = options.comp || '';
      this.options = options.options || { systemName: options.systemName || this.ip };
    }
  }

  //null termination
  nt = "\u0000"

  //parses return data into workable JSON
  parseData = (data) => {
    let rtn = [];
    for (let str of data.split(/\u0000/).filter(Boolean)) {
      try {
        str && JSON.parse(str) ? rtn.push(JSON.parse(str)) : null;
      } catch (e) {
        if (String(e).match(/position (\d+)/)) {
          let pos = Number(String(e).match(/position (\d+)/)[1]);
          console.log("Error at position: ", pos);          
        }
      }
    }
    return rtn;
  }

  // Legacy method for backward compatibility
  add = (input, attribute) => {
    this[input] = attribute
  }

  // Enhanced authentication check
  authCheck = async (string, inputClient) => {
    return new Promise((resolve, reject) => {
      let rtn = {}
      inputClient.write(`${JSON.stringify({
        "jsonrpc": "2.0", 
        "method": "StatusGet", 
        "id": 1234,
        "params": 0
      })}${this.nt}`);
      inputClient.on('data', (d) => {
        string += d;
        if (d.search(this.nt) !== -1) {
          for (let r of this.parseData(string)) {
            if (!r.id) continue;
            if (r.error) {
              rtn.authenticated = false;
            };
            if (r.result) {
              rtn.authenticated = true;
            }
            resolve(rtn);
          };
        };
      })
    });
  };

  // Enhanced login method
  login = async (inputClient) => {
    inputClient.write(`${JSON.stringify({
      "jsonrpc":"2.0",
      "method":"Logon",
      "params":{
        "User": this.username,
        "Password": this.pin
      }
    })}${this.nt}`);
  }

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

  // Enhanced data sending method
  sendData = async (data, options = {
    sync: false, 
    send: false, 
    verbose: false
  }) => {
    return new Promise((resolve, reject) => {
      let client = new net.Socket();
      let fullString = "";
      
      // Set connection timeout
      client.setTimeout(10000); // 10 second timeout
      
      // Set up error handlers BEFORE attempting connection
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
        // Connection successful - remove the connection timeout handler
        client.setTimeout(0);
        client.setEncoding('utf8');

        await this.login(client);
        let authorized = await this.authCheck(fullString, client);

        if (!authorized.authenticated) {
          clearTimeout(operationTimeout);
          client.destroy();
          reject(new Error(`QRC authentication failed for ${this.ip}`));
        } else {
          client.on('data', async (d) => {

            if (this.options.verbose) console.log(d); 
            fullString += d;

            if (options.sync == false) {
              if (d.search(this.nt) !== -1) {
                for (let r of this.parseData(fullString)) {
                  if (!r.id) continue;
                  if (r.result) {
                    clearTimeout(operationTimeout);
                    client.destroy();
                    resolve(r.result);
                  }
                  if (r.error) {
                    clearTimeout(operationTimeout);
                    client.destroy();
                    reject(new Error(`QRC error for ${this.ip}: ${JSON.stringify(r.error)}`));
                  }
                }
              }
            } else {
              await sleep(1000);
              client.end();
              clearTimeout(operationTimeout);
              for (let r of this.parseData(fullString)) {
                if (r.result) resolve(r.result);
                if (r.error) reject(new Error(`QRC error for ${this.ip}: ${JSON.stringify(r.error)}`));
              };
            }
          });
        
          // write data to socket
          client.write(`${JSON.stringify(data)}${this.nt}`);
        }
      });
    })
  }

  // Legacy addCode method for backward compatibility
  addCode = (comp, code, id, type) => {
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

  // Enhanced update method with backward compatibility
  update = async (input, options = {}) => {
    // Destructure options
    let { id = 1234, type = "code" } = options;
  
    // Attempt to log in
    let loginSuccessful = this.loginLegacy();
  
    let push = async () => {
      //return body
      return new Promise((resolve, reject) => {
        // Establish connection
        let client = new net.Socket();
      
        client.connect(1710, this.ip, async () => {
          client.setEncoding('utf8');

          if (loginSuccessful) client.write(loginSuccessful + this.nt);
    
          // Read file or update with input based on type
          if (type === "code") {
            fs.readFile(input, 'utf-8', (err, data) => {
              if (err) throw err;
              client.write(this.addCode(this.comp, data, id, type) + this.nt);
            });
          } else {
            client.write(this.addCode(this.comp, input, id, type) + this.nt);
          }

          //set up variables for parsing and returning
          let rtn = [];
          let fullString = "";

          // Event listeners
          client.on('data', (data) => {
            fullString += data;
          });
          client.on('close', () => {
            client.end();
          });
          // Wait for a period before ending the client
          await timeoutPromise(3000);
          client.end();

          for (let str of fullString.split("\x00")) {
            try {
              str ? rtn.push(JSON.parse(str)) : null;
            } catch (e) {
              console.log(`error parsing JSON with ${e}, on this string:\n\n${str}`)
            }
          }
          for (let res of rtn) {
            res.result ? resolve(res) : res.error && res.error.message == "Logon required" ? console.log('Error! Invalid credentials given!') : resolve(res);
          }
        });
      })
    };

    return await push();
  };

  // Legacy pullCode method for backward compatibility
  pullCode = (comp, id, type) => {
    //Get or GetControls based on type field
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

  // Enhanced retrieve method with backward compatibility
  retrieve = async (options) => {
    let getReturnData = async () => {
      return new Promise((resolve, reject) => {

        //handle optional arguments
        if (options) {
          options.id = options.id ? options.id : "1234";
        } else {
          options = {
            id: "1234",
            verbose: false,
          }
        };

        //handle login
        let login = this.loginLegacy();
  
        let client = new net.Socket();
  
        client.connect(1710, this.ip, async () => {
          
          //check for login credentials
          this.loginLegacy() ? client.write(login + this.nt) : null;
          //log based on type input
          if (options.verbose) {
            options.type ? console.log(`Retriving ${this.comp}'s ${options.type}`) : console.log(`Retrieving ALL controls from ${this.comp}`);
          }
          
          //api call based on options
          client.write(this.pullCode(this.comp, options.id, options.type) + this.nt);
          client.setEncoding('utf8');

          //set up variables for parsing and returning
          let rtn = [];
          let fullString = "";

          //concatenate return data
          client.on('data', (d) => {

            //log incoming, if verbose is selected
            options.verbose ? console.log(d) : null;
            //concat data into large string, for future parsing
            fullString += d
          });

          //handle socket errors
          client.on('error', () => reject(err));
          client.setTimeout(5000);
          client.on('timeout', () => {
            console.log('socket timed out');
            client.end();
          });
          //handle if socket gets closed
          client.on('close', () => {
            client.end();
          });      
          //wait, and then close socket
          await timeoutPromise(1500);
          client.end();


          //parse full string into array of JSON data
          //array of full string, split by null terminator
          for (let str of fullString.split("\x00")) {
            //confirm string isn't blank, push JSON to array
            try {
              str ? rtn.push(JSON.parse(str)) : null
            } catch (e) {
              console.log(`error parsing JSON with ${e}, on this string:\n\n${str}`)
            }
          };

          //if set to verbose, return all json, otherwise just the name and controls
          if (options.verbose) {
            resolve(rtn)
          } else {
            for (let res of rtn) {
              res.result ? resolve(res.result) : null;
            }  
          }
        })    
      })
    };
    //initialize function above
    let finalData = await getReturnData();
    
    //stream to file if option is selected
    if (options.output) {
      console.log(`creating file at ${options.output} with return data`)
      let f = fs.createWriteStream(options.output);
      f.write(JSON.stringify(finalData, null, 2));
    };
    return finalData;
  };

  // NEW METHODS FROM QRC.JS

  //get a single component's parameters
  getComponent = async (comp, ctl, opt = {}) => {
    return await this.sendData({
      "jsonrpc": "2.0",
      "id": 1234,
      "method": "Component.Get",
      "params": {
        "Name": comp,
        "Controls": [
          {"Name": ctl}
        ]
      }
    }, {verbose: opt.verbose})
  };

  //syncified
  getComponentSync = async (comp, ctl, opt = {}) => {
    return await this.sendData({
      "jsonrpc": "2.0",
      "id": 1234,
      "method": "Component.Get",
      "params": {
        "Name": comp,
        "Controls": [
          {"Name": ctl}
        ]
      }
    }, {verbose: opt.verbose, sync: true})
  }

  //get all components, close socket
  getComponents = async (opt = {}) => {
    try {
      return await this.sendData({
        "jsonrpc": "2.0",
        "method": "Component.GetComponents", 
        "id": 1234
      }, {verbose: opt.verbose, sync: false})
    } catch (e) {
      console.log(e)
    }
  };

  //syncfied
  getComponentsSync = async () => {
    return await this.sendData({
      "jsonrpc": "2.0",
      "method": "Component.GetComponents", 
      "params": "test",
      "id": 1234
    }, {verbose: this.options.verbose, sync: true})
  };

  //get controls from a given component name
  getControls = async (comp = this.comp, opt = {}) => {
    return await this.sendData({
      "jsonrpc": "2.0",
      "id": 1234,
      "method": "Component.GetControls",
      "params": {
          "Name": comp
      }
    }, {verbose: opt.verbose})
  };

  //syncified
  getControlsSync = async (comp = this.comp, opt = {}) => {
    return await this.sendData({
      "jsonrpc": "2.0",
      "id": 1234,
      "method": "Component.GetControls",
      "params": {
          "Name": comp
      }
    }, {verbose: opt.verbose, sync: true})
  };

  //change a control's value, keep the socket open
  setControl = async (comp, ctl, value, options = {}) => {
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
    options.ramp ? obj.params.Controls[0].Ramp = options.ramp : null;
    return await this.sendData(obj, {verbose: options.verbose});
  };

  //syncified
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
    options.ramp ? obj.params.Controls[0].Ramp = options.ramp : null;
    return await this.sendData(obj, {verbose: options.verbose, sync: true});
  };

  //change multiple controls, socket open
  setControls = async (comp, ctls, options) => {
    let obj = {
      "jsonrpc": "2.0",
      "id": 1234,
      "method": "Component.Set",
      "params": {
        "Name": comp,
        "Controls": ctls
      }
    };
    return await this.sendData(obj);
  }

  //return code, or export to folder
  exportCode = async (opt = {}) => {
    //pull data, write to file or return in body
    const components = await this.getComponents();
    let rtn = {};
    for (let cmp of components) {
      if (cmp.Type == "device_controller_script") {
        let ctrls = await this.getControls(cmp.ID);
        for (let ctrl of ctrls.Controls) {
          if (ctrl.Name == "code") rtn[cmp.Name] = ctrl.String;
        }
      }
    };
    return rtn
  };
  
  //get script errors
  getScriptErrors = async (opt = {}) => {
    let rtn = [];
    for (let cmp of await this.getComponentsSync()) {
      if (cmp.Type.includes('script') || cmp.Type.includes("PLUGIN")) {

        //NEW: option lets you target one specific error
        if (opt.scriptName && cmp.Name != opt.scriptName) continue;

        
        const Controls = await this.getControlsSync(cmp.ID);
        //error object and logs
        let errorObj, errorLogs;
        for (let control of Controls.Controls) {

          //push scripts with errors
          if (control.Name == "script.error.count" && control.Value > 0) {            
            errorObj = {
              Component: cmp.Name,              
              Value: control.Value
            };
          };
          //logs
          if (control.Name == "log.history") {
            errorLogs = control.String.length > 30 ? `${control.String.substring(0, 30)} ...` : control.String;
            // errorLogs = control.String
          }
        };
        if (errorObj) {
          errorObj.Details = errorLogs;
          rtn.push(errorObj);
        };
      }
    };

    if (opt.scriptName) {
      if (rtn.length > 1) throw new Error(`returning multiple components for ${opt.scriptName}!`);
      return rtn[0];
    } else {
      return rtn
    };
  };

  //restart a script or plugin
  restartScript = async (componentName, options = {}) => {
    return await this.setControlSync(componentName, 'reload', 1, options);
  };

  //get certain parts of the core status component
  getCoreDiagnostics = async (opt = {}) => {
    const comps = await this.getComponentsSync()
    for (let cmp of comps) {
      if (cmp.Type == "core_status") {
        const Controls = await this.getControlsSync(cmp.ID)
        .then(res => res.Controls)

        // Filter for the specific diagnostics we want
        const targetControls = [
          'system.temperature',
          'system.fan.1.speed', 
          'grandmaster.name',
          'processor.temperature',
          'lan.a.speed'
        ];

        // Create the filtered result object
        const diagnostics = {};
        
        for (let control of Controls) {
          // console.log(control);
          if (targetControls.includes(control.Name)) {
            // Return string for text types, value for float types
            if (control.Type === 'Text') {
              diagnostics[control.Name] = control.String;
            } else if (control.Type === 'Float') {
              diagnostics[control.Name] = control.Value;
            }
          }
        }
        // console.log(diagnostics);
        return diagnostics;
      }
    };
    console.log(`${this.options.systemName || this.ip} did not find core diagnostics`);
  };

  getScriptStatuses = async (opt = {}) => {
    let rtn = [];
    for (let cmp of await this.getComponentsSync()) {
      if (!cmp.Type.includes('script') && !cmp.Type.includes("PLUGIN")) continue
      //NEW: option lets you target one specific error
      if (opt.scriptName && cmp.Name != opt.scriptName) continue;

      const Controls = await this.getControlsSync(cmp.ID);
      for (const control of Controls.Controls) {

        if (control.Type == "Status" && ![0,3].includes(control.Value)/*OLDcontrol.Value != 0*/) {
          if (control.Name == "StreamStatus" || control.String.includes("Connected to Encoder")) continue; //special case for Visionary Solutions end points
          rtn.push({
            Component: cmp.Name,
            Control: control.Name,
            Value: control.Value,
            String: control.String
          });
        }
      }
    };
    return rtn;
  }

  // Combined script error and status handling with restart logic
  processScriptIssues = async (systemName, site, ip) => {
    const result = {
      scriptErrors: [],
      scriptStatuses: [],
      persistentErrors: [],
      persistentStatuses: [],
      splunkEvents: []
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

      // Record initial detection for Splunk
      if (initialErrors.length > 0) {
        result.splunkEvents.push({
          system: systemName,
          site,
          ip,
          action: "errors_detected",
          errorCount: initialErrors.length,
          errors: initialErrors,
          timestamp: new Date().toISOString()
        });
      }

      if (initialStatuses.length > 0) {
        result.splunkEvents.push({
          system: systemName,
          site,
          ip,
          action: "status_issues_detected",
          issueCount: initialStatuses.length,
          statusIssues: initialStatuses,
          timestamp: new Date().toISOString()
        });
      }

      // Restart each component and re-validate
      for (const componentName of componentsWithIssues) {
        try {
          const restarted = await this.restartScript(componentName);
          
          result.splunkEvents.push({
            system: systemName,
            site,
            ip,
            action: restarted ? "restart_successful" : "restart_failed",
            component: componentName,
            timestamp: new Date().toISOString()
          });

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
  
};  

export default Core;
