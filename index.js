import exp from 'constants';
import fs from 'fs';
import net from 'net';
import jsonrpc from 'jsonrpc-lite';

const timeoutPromise = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout))


class Core {
  constructor({ip="",username="",pw="", comp=""} = {}) {
    this.ip = ip;
    this.username = username;
    this.pw = pw;
    this.comp = comp;
  }

  nt = "\u0000";

  add = (input, attribute) => {
    this[input] = attribute
  } 

  login = () => {
    return this.username && this.pw
    ?
    JSON.stringify({
      "jsonrpc": "2.0",
      "method": "Logon",
      "params": {
        "User": this.username,
        "Password": this.pw
      }
    })
    :
    false;
  };

  //parse string to push to core
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

  //update data to core
  update = async (input, options) => {
    //handle optional arguments
    let id, type;
    if (options) {
      id = options.id ? options.id : 1234;
      type = options.type ? options.type : "code"
    };
    options.type ? console.log(`type has been modified to: ${options.type}`) : null;
    //handle login
    let login = this.login();
    login ? console.log("trying credentials....") : console.log("no credentials given");

    let client = new net.Socket();

    client.connect(1710, this.ip, async () => {
      
      this.login() ? client.write(login + this.nt) : null;

      if (type == "code") {
        fs.readFile(input, 'utf-8', (err, data) => {
          if (err) {
            throw err
          } else {
            client.write(this.addCode(this.comp, data, id, type) + this.nt);
          }
        });
      } else {
        console.log(`updating ${this.comp}'s ${type} to ${input}`)
        client.write(this.addCode(this.comp, input, id, type) + this.nt);
      }
      client.on('data', (d) => {
        console.log(`received data from QRC API: ${d}`);
      });
      client.on('close', () => {
        console.log('server closed connection');
        client.end();
      });
      await timeoutPromise(3000);
      client.end();
    })
  };

  //parse string to pull from core
  pullCode = (comp, id, type) => {
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


    //getControls is not returning parseable json - chunk is too big, need to concatenate in a future version
    //pull all controls or single control
    // if (!type) {
    //   return JSON.stringify({
    //     "jsonrpc": "2.0",
    //     "id": id,
    //     "method": "Component.GetControls",
    //     "params": {
    //       "Name": comp
    //     }   
    //   })
    // } else {
    //   return JSON.stringify({
    //     "jsonrpc": "2.0",
    //     "id": id,
    //     "method": "Component.Get",
    //     "params": {
    //       "Name": comp,
    //       "Controls": [
    //         {
    //           "Name": type
    //         }
    //       ]
    //     }
    //   })
    // }
  }

  //pull data from core
  retrieve = async (options) => {
    let getReturnData = async () => {
      return new Promise((resolve, reject) => {
        //return obj
        let rtn = [];
        let rtn2 = "";
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
        let login = this.login();
        login ? console.log("trying credentials....") : console.log("no credentials given");
  
        let client = new net.Socket();
  
        client.connect(1710, this.ip, async () => {
          
          //check for login credentials
          this.login() ? client.write(login + this.nt) : null;
          //log based on type input
          options.type ? console.log(`Retriving ${this.comp}'s ${options.type}`) : console.log(`Retrieving ALL controls from ${this.comp}`);
          //api call based on options
          client.write(this.pullCode(this.comp, options.id, options.type) + this.nt);
          client.setEncoding('utf8');
          //poll return data
          client.on('data', (d) => {
            //convert from buffer to string, remove null termination
            let str = Buffer.from(d).toString().replace(/\x00/g, "");
            let json;
            try {
              json = JSON.parse(str);
            } catch (e) {
              console.log(`error parsing return JSON: ${e}..here is the string:\n\n`);
              console.log(str);
            };
            if (json) {
              //use jsonrpc library to parse string and print to console
              for (let [name,value] of Object.entries(json)) {
                options.verbose ? console.log(name, value) : null;
                //incorrect login data
                if (value == { code: 10, message: 'Logon required' }) {
                  console.log('Invalid Authentication!')
                };
                //return control data or error data
                if (value.Name == this.comp) {
                  resolve(value)
                } else {
                  name == "error" ? resolve(value) : null;
                }
              };
            }
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
            console.log('server closed connection');
            client.end();
          });      
          //wait, and then close socket
          await timeoutPromise(1500);
          client.end();
          //return data
          resolve(rtn);  
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
};

export default Core;
