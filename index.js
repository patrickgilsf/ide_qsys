import fs from 'fs';
import net from 'net';

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

  //pull data from core
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
            console.log('server closed connection');
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

          //return
          resolve(rtn)
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
