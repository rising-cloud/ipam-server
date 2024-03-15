const Netmask = require('netmask').Netmask;

function allocateIP(currentNetwork, ipRange) {
    const block = new Netmask(currentNetwork.network_id + '/' + currentNetwork.cidr);
    let lowerBound = parseInt(ipRange[0].split('.')[3]); //take the last part of IP and convert to integer
    let upperBound = parseInt(ipRange[1].split('.')[3]); //take the last part of IP and convert to integer
   
    if ((upperBound - lowerBound) > 9) { 
        return null
    }

    var ipsToAllocate = [];
    var invalidRange = false;
    
    for (var i = lowerBound; i < upperBound; i++){
        var checkIP = (ipRange[0].split('.')[0] + '.' + ipRange[0].split('.')[1] + '.' + ipRange[0].split('.')[2] + '.' + i.toString());
        if (block.contains(checkIP)) { 
            currentNetwork.ip_pool.forEach(address => {
                if (address.ipaddress === checkIP) {
                    invalidRange = true;
                }
            });
            if (!invalidRange)
                ipsToAllocate.push(checkIP);
        }
    }
        
    console.log("Valid Range? " + !invalidRange);
    
    if (invalidRange)
        return null;
    else
        return ipsToAllocate

    

}

module.exports = allocateIP;
