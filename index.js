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
  }

  //pull data from core
  retrieve = async (options) => {
    //return obj
    let rtn;
    //handle optional arguments
    let id, type;
    if (options) {
      id = options.id ? options.id : 1234;
      type = options.type ? options.type : "code"
    } else {
      options = {};
      id = 5678;
      type = "code";
    };
    
    options.type ? console.log(`type has been modified to: ${options.type}`) : null;
    //handle login
    let login = this.login();
    login ? console.log("trying credentials....") : console.log("no credentials given");

    let client = new net.Socket();

    client.connect(1710, this.ip, async () => {
      
      this.login() ? client.write(login + this.nt) : null;

      console.log(`retriving ${this.comp}'s ${type}`)
      client.write(this.pullCode(this.comp, id, type) + this.nt);

      client.on('data', (d) => {
        //convert from buffer to string, remove null termination
        let str = JSON.parse(Buffer.from(d, 'utf-8').toString().replace(/\x00/g, ""));
        //use jsonrpc library to parse string and print to console
        for (let [a,b] of Object.entries(str)) {
          options.verbose ? console.log(b) : null;
          if (b == { code: 10, message: 'Logon required' }) {
            console.log('Invalid Authentication!')
          }
          if (b.Name == this.comp) {
            rtn = b

            console.log(`Here is your requested data:`);
            console.log(rtn)
          
            //stream to file if selected
            if (!options.output) {
              console.log('no output file selected')
            } else {
              console.log(`creating file at ${output} with return data`)
              let f = fs.createWriteStream(options.output);
              f.write(JSON.stringify(rtn, null, 2));
            }          
          }
        };
      });

      client.on('close', () => {
        console.log('server closed connection');
        client.end();
      });

      await timeoutPromise(3000);
      client.end();
    })
  };
};

export default Core;
