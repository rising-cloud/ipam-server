const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const userSchema = new Schema({
    owner: String,
    admin: Boolean,
    networks: [
        //each object is a network
        {
            network_id: String,
            subnet_mask: String,
            ip_pool: [
                //each object is an IP in the above network
                {
                    ipaddress: String,
                    gateway: String,
                    in_use: Boolean,
                    hostname: String,
                    pingable: Boolean
                }
            ]
        }
    ]
});

module.exports = mongoose.model('users', userSchema);   