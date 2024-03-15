const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ipamSchema = new Schema({
    network_id: String,
    subnet_mask: String,
    cidr: String,
    dns1: String,
    dns2: String,
    dns_suffix: String,
    domain: String,
    ip_pool: [{
        ipaddress: String,
        owner: String,
        gateway: String,
        in_use: Boolean,
        pingable: Boolean,
        hostname: String
    }]
});

module.exports = mongoose.model('ipams', ipamSchema);