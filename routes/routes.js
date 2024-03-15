const express = require('express');
const util = require('util');
const dns = require('dns');
const router = express.Router();


const users = require('../models/users');
const ipams = require('../models/ipams');
const allocateIP = require('../utils/allocateIP');
const pingStatus = require('../utils/pingStatus');

// GET APIs
router.get('/getUser', (req, res, next) => {
    users.findOne({
        owner: req.query.username
    }).then(user => {
        if (user) res.json({
            status: 200,
            user: user
        })
        else res.json({
            error: 'User not found'
        });
    }).catch(e => {
        res.json(e);
    });

});

router.get('/getNetworks', (req, res, next) => {
    ipams.find({}).then(networks => {
        if (networks) res.json({
            status: 200,
            networks: networks
        });
        else res.json({
            error: 'No networks'
        });
    }).catch(e => {
        res.json(e);
    });
});

router.get('/getNetwork', (req, res, next) => {
    ipams.find({
        network_id: req.query.network_id
    }).then(network => {
        if (network) res.json({
            status: 200,
            network: network
        });
        else res.json({
            error: 'Network unavailable'
        });
    }).catch(e => {
        res.json(e);
    });
});


//POST APIs

//adding new user
router.post('/register', (req, res, next) => {
    let newUser = new users({
        owner: req.body.username,
        admin: true,
        networks: []
    });

    newUser.save().then(result => {
        res.json({
            status: 200,
            user: result
        });
    }).catch(e => {
        res.json(e);
    });
});

//adding new network
router.post('/addNetwork', (req, res, next) => {
    let newNetwork = new ipams({
        network_id: req.body.network_id,
        subnet_mask: req.body.subnet_mask,
        cidr: req.body.cidr,
        dns1: req.body.dns1,
        dns2: req.body.dn2,
        dns_suffix: req.body.dns_suffix,
        domain: req.body.domain,
        ip_pool: []
    });

    newNetwork.save().then(result => {
        res.json({
            status: 200,
            network: result
        });
    }).catch(e => {
        res.json(e);
    });

});

router.post('/setHostname', async (req, res, next) => {
    let errorThrown = false;

    try {
        var currentNetwork, currentOwner;

        //find the owner and network information of the ip to be updated. 
        await ipams.findOne({
            network_id: req.body.network_id
        }).then(result => {
            if (!result) {
                errorThrown = true;
                throw new Error('Network invalid');
            }
            currentNetwork = result;
            currentNetwork.ip_pool.forEach(address => {
                if (address.ipaddress === req.body.ipaddress)
                    currentOwner = address.owner;
            })
        })
        //update hostname in ipams schema directly
        await ipams.updateOne({
            'ip_pool.ipaddress': req.body.ipaddress
        }, {
            $set: {
                'ip_pool.$.hostname': req.body.customHostname
            }
        }).then(result => {
            if (!result) {
                errorThrown = true;
                throw new Error('Error in setting hostname in ipam schema');
            }
            console.log(result);
        })

        //fetch and update users
        var userData;
        await users.findOne({
            owner: currentOwner
        }).then(result => {
            if (!result) {
                errorThrown = true;
                throw new Error('Invalid Owner: Owner doesnt exist for this network');
            }
            userData = result;
            userData.networks.forEach(network => {
                if (network.network_id === currentNetwork.network_id) {
                    network.ip_pool.forEach(address => {
                        if (address.ipaddress === req.body.ipaddress)
                            address.hostname = req.body.customHostname;
                    });
                }
            });
        })
        //pull user data then push new data
        await users.deleteOne({
            owner: currentOwner
        }).then(result => {
            if (!result) {
                errorThrown = true;
                throw new Error('Error in deleting user');
            }
            users.insertMany(userData).then(user => {
                if (!user) {
                    errorThrown = true;
                    throw new Error('Error in inserting user');
                }
                res.json({
                    status: 200,
                    success: {
                        user: user,
                        hostname: req.body.customHostname
                    }
                })
            })
        })
    } catch (e) {
        res.json({
            error: e.message
        })
    }
});

router.post('/allocate', async (req, res, next) => {
    let errorThrown = false;
    var IpsToAllocate = [];
    try {
        var currentUser;

        await users.findOne({
                owner: req.body.username
            })
            .then(async (result) => {
                //if user exists, store his data
                currentUser = result;

                if (!currentUser) {
                    console.log('No user found , creating new user');
                    var pushNetwork = {
                        network_id: req.body.network_id,
                        subnet_mask: req.body.subnet_mask,
                        cidr: req.body.cidr,
                        ip_pool: []
                    }
                    // null check for user, create new user if new user. also add new network
                    // details while you're at it
                    currentUser = new users({
                        owner: req.body.username,
                        admin: true,
                        networks: [pushNetwork]
                    });

                    //TODO put a check if it is IP address or not
                    currentUser
                        .save()
                        .then(saved => {
                            if (!saved) {
                                errorThrown = true;
                                throw new Error('Error in saving new user');
                            }
                            console.log(saved);
                        })
                }

                // if network is not present in users schema, then create new network with empty
                // ip_pool
                var networkExists = false;
                for (network of currentUser.networks) {
                    if (network.network_id == req.body.network_id) {
                        networkExists = true;
                        break;
                    }
                }

                let networkValid = false;

                await ipams.findOne({
                    network_id: req.body.network_id
                }).then(result => {
                    if (result) networkValid = true;
                    else {
                        errorThrown = true;
                        throw new Error('Network entered doesnt exist');
                    }
                })


                //this is for existing user but new network
                if (!networkExists) {
                    var pushNetwork = {
                        network_id: req.body.network_id,
                        subnet_mask: req.body.subnet_mask,
                        ip_pool: []
                    }
                    users.updateOne({
                        owner: currentUser.owner
                    }, {
                        $push: {
                            networks: pushNetwork
                        }
                    }).then(network => {
                        if (!result) {
                            errorThrown = true;
                            throw new Error('Users schema not updated with new network')
                        }
                        console.log('New network created as network not found in users schema');
                    })
                }

                var currentNetwork;

                await ipams.findOne({
                        network_id: req.body.network_id
                    })
                    .then(async (result) => {
                        currentNetwork = result;
                        dns.setServers([currentNetwork.dns1]);
                        IpsToAllocate = allocateIP(currentNetwork, req.body.ipRange);
                        if (IpsToAllocate) {
                            IpsToAllocate.forEach(IpToAllocate => {
                                var dnsHostname = null;

                                dns.reverse(IpToAllocate, async (err, hostname) => {
                                    dnsHostname = hostname;
                                    console.log('hostname->' + hostname);
                                    var ipamIpObj = {
                                        ipaddress: IpToAllocate,
                                        owner: currentUser.owner,
                                        in_use: false,
                                        pingable: false,
                                        hostname: dnsHostname
                                    }

                                    var userIpObj = {
                                        ipaddress: IpToAllocate,
                                        cidr: req.body.cidr,
                                        in_use: false,
                                        hostname: dnsHostname,
                                        pingable: false
                                    }

                                    await ipams.updateOne({
                                        network_id: currentNetwork.network_id
                                    }, {
                                        $push: {
                                            ip_pool: ipamIpObj
                                        }
                                    }).then(result => {
                                        if (!result) {
                                            errorThrown = true;
                                            throw new Error('Error in updating ipams schema');
                                        }
                                        console.log(result);
                                    })

                                    await users.updateOne({
                                        owner: currentUser.owner,
                                        'networks.network_id': currentNetwork.network_id
                                    }, {
                                        $push: {
                                            'networks.$.ip_pool': userIpObj
                                        }
                                    }).then(result => {
                                        if (!result) {
                                            errorThrown = true;
                                            throw new Error('Error in updating users schema')
                                        }
                                        console.log(result);
                                        console.log(IpToAllocate + '=>' + currentUser.owner);
                                    })

                                });
                            });
                        } else {
                            errorThrown = true;
                            throw new Error('No IPs available to allocate');
                        }
                    })
            })
    } catch (e) {
        res.json({
            error: e.message
        });
    } finally {
        if (!errorThrown) {
            res.json({
                status: 200,
                success: IpsToAllocate
            })
        } else return;
    }
});

router.post('/assign', async (req, res, next) => {
    let errorThrown = false;
    var IpsToAssign = [];

    try {
        await users.findOne({
            owner: req.body.username
        }).then(async (result) => {
            if (!result) {
                errorThrown = true;
                throw new Error('User does not exist');
            } else {
                var currentUser = result;
                var validNetwork = false;
                var currentUserNetwork = undefined;
                var assignIps = [];

                //will get the network to be worked on currently
                for (network of currentUser.networks) {
                    if (network.network_id === req.body.network_id) {
                        currentUserNetwork = network;
                        validNetwork = true;
                    }
                }

                if (!validNetwork) {
                    errorThrown = true;
                    throw new Error('Network not used by user');
                }

                var isPingable = pingable = undefined;
                for (address of currentUserNetwork.ip_pool) {
                    isPingable = undefined;
                    console.log(address.ipaddress)
                    try {
                        pinged = await pingStatus(address.ipaddress);
                        console.log(pinged);
                        if (pinged) {
                            isPingable = true;
                        } else {
                            isPingable = false;
                        }
                    } catch (e) {
                        isPingable = false;
                    };
                    if (!address.in_use && !isPingable && IpsToAssign.length < req.body.count)
                        IpsToAssign.push(address);
                }

                if (IpsToAssign.length > 0) {
                    //will populate the assignIps array and edit the Network object of user
                    for (requestedIp of IpsToAssign) {
                        for (pool of currentUserNetwork.ip_pool) {
                            if (requestedIp.ipaddress === pool.ipaddress) {
                                assignIps.push(requestedIp);
                                pool.in_use = true;
                                pool.pingable = true;
                            }
                        }
                    }
                    await ipams.findOne({
                        network_id: req.body.network_id
                    }).then(async (result) => {
                        for (ip of assignIps) {
                            //update the IPAMS collection
                            await ipams.updateOne({
                                'ip_pool.ipaddress': ip.ipaddress
                            }, {
                                $set: {
                                    'ip_pool.$.in_use': true,
                                    'ip_pool.$.pingable': true
                                }
                            }).then(result => {
                                if (!result) {
                                    errorThrown = true;
                                    throw new Error('Nothing was updated in IPAMs schema');
                                } else console.log('ipams collection updated -> ' + result);
                            })
                        };
                    })
                    //pull old network
                    await users.updateOne({
                        owner: currentUser.owner
                    }, {
                        $pull: {
                            networks: {
                                network_id: currentUserNetwork.network_id
                            }
                        }
                    }).then(async (result) => {
                        //push new network
                        await users.updateOne({
                            owner: currentUser.owner
                        }, {
                            $push: {
                                networks: currentUserNetwork
                            }
                        }).then(result => {
                            if (!result) {
                                errorThrown = true;
                                throw new Error('Nothing was updated in users schema');
                            }
                            console.log('users collection updated')
                        })
                    })
                } else {
                    errorThrown = true;
                    throw new Error('No of IPs requested are more than existing free ips in pool')
                }
            }
        })

        //if all goes well, then
        //res.json({
         //   status: 200,
           // success: IpsToAssign
        //})

    } catch (e) {
        //console.log('error caught');
        res.json({
            error: e.message
        });
    }finally {
        if (!errorThrown) {
            res.json({
                status: 200,
                success: IpsToAssign
            })
        } else return;
    }
});

//write the logic of checking whether already ips are deassigned or not.
router.post('/deassign', (req, res, next) => {
    let errorThrown = false;

    try {
        users.findOne({
            owner: req.body.username
        }).then(result => {
            if (!result) {
                errorThrown = true;
                throw new Error('User does not exist');
            }

            var validNetwork = false;
            var currentUser = result;
            var currentNetwork = undefined;
            var deassignIps = [];

            //will get the network to be worked on currently
            for (network of currentUser.networks) {
                if (network.network_id === req.body.network_id) {
                    currentNetwork = network;
                    validNetwork = true;
                }
            }

            if (!validNetwork) {
                errorThrown = true;
                throw new Error(`${req.body.username} does not have IPs in that network`);
            }

            var IpToDeassign = req.body.deassignIp;
            var invalidIP = undefined;
            if (IpToDeassign) {
                if (IpToDeassign.length > 0) {
                    //will populate the deassignIps array and edit the new Network object of User
                    for (requestedIp of IpToDeassign) {
                        for (pool of currentNetwork.ip_pool) {
                            if (requestedIp === pool.ipaddress) {
                                deassignIps.push(requestedIp);
                                pool.in_use = false;
                            }
                        }
                    }

                    if (deassignIps.length > 0 && deassignIps.length === IpToDeassign.length) {
                        invalidIP = false
                    } else {
                        errorThrown = true;
                        throw new Error("IP range provided does not belong to users pool");
                    }
                    if (!invalidIP) {
                        ipams.findOne({
                            network_id: req.body.network_id
                        }).then(result => {
                            deassignIps.forEach(ip => {
                                //update the IPAMS collection
                                ipams.updateOne({
                                    'ip_pool.ipaddress': ip
                                }, {
                                    $set: {
                                        'ip_pool.$.in_use': false
                                    }
                                }).then(result => {
                                    if (!result) {
                                        errorThrown = true;
                                        throw new Error(`${ip} not allocated to ${req.body.username}`)
                                    }
                                    console.log('ipams collection updated -> ' + result);
                                })
                            });
                        })

                        //pull old network
                        users.updateOne({
                            owner: currentUser.owner
                        }, {
                            $pull: {
                                networks: {
                                    network_id: currentNetwork.network_id
                                }
                            }
                        }).then(result => {
                            //push new network
                            users.updateOne({
                                owner: currentUser.owner
                            }, {
                                $push: {
                                    networks: currentNetwork
                                }
                            }).then(result => {
                                if (!result) {
                                    errorThrown = true;
                                    throw new Error('Users schema not updated');
                                }
                                console.log('Users collection updated successfully');
                            })
                        })
                    }
                } else {
                    errorThrown = true;
                    throw new Error('IP range cannot be empty for deassignment');
                }
            } else {
                errorThrown = true;
                throw new Error('Please provide IP range for deassignment')
            }
        })
    } catch (e) {
        res.json({
            error: e
        });
    } finally {
        if (!errorThrown) {
            res.json({
                status: 200,
                success: req.body.deassignIp
            })
        }
    }
});


//TODO handle server crash when user deallocates IPs not in his pool
router.post('/deallocate', (req, res, next) => {
    let errorThrown = false;

    try {
        users.findOne({
            owner: req.body.username
        }).then(async (currentUser) => {
            if (!currentUser) {
                errorThrown = true;
                throw new Error('User not found');
            }
            for (ip of req.body.ipList) {
                await ipams.updateOne({
                    network_id: req.body.network_id
                }, {
                    $pull: {
                        ip_pool: {
                            ipaddress: ip,
                            owner: currentUser.owner
                        }
                    }
                }).then(result => {
                    if (!result) {
                        errorThrown = true;
                        throw new Error('Ipams schema not updated');
                    }
                    console.log('ipams' + result.nModified);

                })

                await users.updateOne({
                    owner: currentUser.owner
                }, {
                    $pull: {
                        'networks.$[].ip_pool': {
                            ipaddress: ip
                        }
                    }
                }).then(result => {
                    if (!result) {
                        errorThrown = true;
                        throw new Error('Users schema not updated');
                    }
                    console.log('users' + result.nModified);
                })
            }
        });
    } catch (e) {
        res.json({
            error: e
        })
    } finally {
        if (!errorThrown) {
            res.json({
                status: 200,
                success: req.body.ipList
            })
        }
    }
});

router.post('/setDNS', (req, res, next) => {
    let errorThrown = false;

    try {
        var currentUserNetwork, currentOwner, allUserNetworks, finalResult, allNetworks, allUsers;
        users.find({
            'networks.network_id': req.body.network_id
        }).then(async (result) => {
            if (!result) {
                errorThrown = true;
                throw new Error('No such user found');
            }

            const reverseAsync = util.promisify(dns.reverse);
            dns.setServers([req.body.dns1]);

            allUsers = result;
            for (user of allUsers) {
                allNetworks = user.networks;
                currentOwner = user.owner;
                //search for user's network whose DNS needs to be changed
                allNetworks.forEach(network => {
                    if (network.network_id === req.body.network_id) {
                        currentUserNetwork = network;
                    }
                });

                //Set DNS and run reverse method to update hostname


                for (ipObject of currentUserNetwork.ip_pool) {
                    try {
                        ipObject.hostname = await reverseAsync(ipObject.ipaddress);
                    } catch (e) {
                        console.log(e);
                    }

                    //pull ipobject 
                    await users.updateOne({
                        owner: currentOwner,
                        'networks.network_id': currentUserNetwork.network_id
                    }, {
                        $pull: {
                            'networks.$.ip_pool': {
                                ipaddress: ipObject.ipaddress
                            }
                        }
                    }).then(result => {
                        if (!result) {
                            errorThrown = true;
                            throw new Error('Users schema not pulled');
                        }
                        //push new ipobject with updated hostname
                        console.log(currentUserNetwork.network_id)
                        users.updateOne({
                            owner: currentOwner,
                            'networks.network_id': currentUserNetwork.network_id
                        }, {
                            $push: {
                                'networks.$.ip_pool': ipObject
                            }
                        }).then(result => {
                            if (!result) {
                                errorThrown = true;
                                throw new Error('Users schema not pushed');
                            }
                            finalResult = result;
                            console.log('users collection updated' + result)
                        })
                    })
                }
                console.log("first user is updated")
            }

            ipams.findOne({
                network_id: req.body.network_id
            }).then(result => {
                if (!result) {
                    errorThrown = true;
                    throw new Error('Network invalid');
                }
                var network = result;
                if (network.dns1 !== req.body.dns1) {
                    ipams.updateOne({
                        network_id: req.body.network_id
                    }, {
                        $set: {
                            dns1: req.body.dns1
                        }
                    }).then(result => {
                        if (!result) {
                            errorThrown = true;
                            throw new Error('DNS not set in ipams schema');
                        }
                        console.log('dns is updated successfully in ipams network')
                    });
                }
                network.ip_pool.forEach((ipObject) => {
                    dns.reverse(ipObject.ipaddress, (err, hostnames) => {
                        let customHostname = undefined;
                        (hostnames ? customHostname = hostnames[0] : customHostname = null);
                        ipams.updateOne({
                            network_id: network.network_id,
                            'ip_pool.ipaddress': ipObject.ipaddress
                        }, {
                            $set: {
                                'ip_pool.$.hostname': customHostname
                            }
                        }).then(result => {
                            if (!result) {
                                errorThrown = true;
                                throw new Error('Ipams schema not updated with new hostname');
                            }
                            console.log('Hostname updated succesfully');
                        });
                    })
                });
            });
        })
    } catch (e) {
        res.json({
            error: e
        });
    } finally {
        if (!errorThrown) {
            res.json({
                status: 200,
                success: `DNS of ${req.body.network_id} set to ${req.body.dns1}`
            })
        }
    }
});

router.post('/ping', (req, res, next) => {
    let errorThrown = false;

    try {
        ipams.findOne({
            network_id: req.body.network_id
        }).then(result => {
            if (!result) {
                errorThrown = true;
                throw new Error('NetworkID invalid');
            }
            var pingable = [];
            var currentNetwork = result.ip_pool;
            currentNetwork.forEach(ipObject => {
                if (ipObject.pingable === true) {
                    pingable.push(ipObject);
                }
            });
            res.json({
                status: 200,
                "pingable IPS   ": pingable
            });
        })
    } catch (e) {
        res.json({
            error: e
        })
    }
});

router.post('/pingByUser', (req, res, next) => {
    let errorThrown = false;

    try {
        users.findOne({
            "networks.network_id": req.body.network_id,
            owner: req.body.username
        }).then(result => {
            if (!result) {
                errorThrown = true;
                throw new Error('User invalid/not found');
            }
            console.log(result);
            var pingable = [];
            var networks = result.networks;
            var currentUserPool = [];
            networks.forEach(network => {
                if (network.network_id === req.body.network_id) {
                    currentUserPool = network.ip_pool;
                }
            });
            currentUserPool.forEach(ipObject => {
                if (ipObject.pingable === true) {
                    pingable.push(ipObject);
                }
            });
            res.json({
                status: 200,
                "pingable IPS of user  ": pingable
            });
        })
    } catch (e) {
        res.json({
            error: e
        })
    }
});

module.exports = router;

//TODO ping
//TODO ns-lookup
//TODO error res.status