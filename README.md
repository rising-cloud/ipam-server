# IPAM - IP allocation manager

## Technologies used:
    
- NodeJS
- Express
- Mongoose (for MongoDB)

## Using docker-compose.yml

- Copy `docker-compose.yml` into a separate folder or `../docker-compose.yml`
- Clone the repos `https://github.ibm.com/Orpheus/ipam-server` and `https://github.ibm.com/Orpheus/ipam-ui` in the same folder as `docker-compose.yml`
- Run `docker-compose up -d`

##  Currently functional 
- Allocate IPs from existing networks. User can select desired network from the UI and send a request for IPs.
- User can add his/her own infrastructure and static IPs as new networks. 
- User can delete his IPs whenever required. (As of now, all IPs are deleted).
- User can assign/deassign IPs whenever needed. 
