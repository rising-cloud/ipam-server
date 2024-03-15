var exec = require('child_process').exec;
var os = require('os');

function pingStatus(host) {
    return new Promise((resolve, reject) => {
        switch (os.type()) {
            case 'Darwin': //Mac and Linux have the same command
            case 'Linux':
                console.log(os.type())
                exec(`ping -c 1 ${host}`, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    } else {
                        if (stdout.indexOf('icmp_seq') == -1) {
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    }
                });
                break;
            case 'Windows_NT':
                console.log(os.type())
                exec(`ping -n 1 ${host}`, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                    } else {
                        if (stdout.indexOf("TTL") == -1) {
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    }
                });
                break;
        }

    })
}

module.exports = pingStatus;